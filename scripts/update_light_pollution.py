#!/usr/bin/env python3
"""
Build-time light-pollution data generator.

Pipeline
--------
Zenodo metadata  ->  latest real VIIRS year
                 ->  download annual 500 m nighttime-lights GeoTIFF (cached)
                 ->  downsample to 1 arc-minute (~1.85 km) grid
                 ->  neighbourhood light fusion (multi-scale Gaussian)
                 ->  log transform  ->  continuous "light proxy"
                 ->  quantise to 8-bit grayscale tiles (2 deg x 2 deg PNG)
                 ->  write public/light-pollution/manifest.json + runtime meta

The script is idempotent: if the manifest already matches the current source
record / version / year / file hash / processing version, it skips everything.

Requires: rasterio, numpy, scipy, Pillow. No runtime API, no API key.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

# --------------------------------------------------------------------------
# Configuration (transparent and centralised)
# --------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
PUBLIC_DIR = REPO_ROOT / "public" / "light-pollution"
TILES_DIR = PUBLIC_DIR / "tiles"
MANIFEST_PATH = PUBLIC_DIR / "manifest.json"
META_TS_PATH = REPO_ROOT / "src" / "lib" / "sky" / "light-pollution-meta.ts"
CACHE_DIR = REPO_ROOT / ".cache" / "light-pollution"

CONCEPT_DOI = "10.5281/zenodo.7750174"
DATASET_NAME = "OpenGeoHub / Zenodo global VIIRS nighttime lights"

# Bump when the processing math changes so the manifest is regenerated.
PROCESSING_VERSION = "2"

# Source is 1/240 deg (~500 m); we take every 4th -> 1/60 deg (1 arc-minute).
SOURCE_DECIMATION = 4
STEP_DEG = (1.0 / 240.0) * SOURCE_DECIMATION  # 0.0166667 deg ~ 1.85 km

# Tile coverage (only file extent; internal sampling stays ~1.85 km).
TILE_DEG = 2.0
TILE_PIXELS = int(round(TILE_DEG / STEP_DEG))  # 120
TILE_COVERAGE_VERSION = "1"

# Neighbourhood fusion: (sigma_cells, weight). Skyglow spreads tens of km.
BLUR_SCALES = [(3.0, 0.45), (12.0, 0.35), (40.0, 0.20)]

# proxy -> 8-bit mapping. q = 255 * ln(1+P) / ln(1+PMAX)
PROXY_PMAX = 60.0
# limiting magnitude linearly interpolated in q:
MAG_AT_Q0 = 7.7    # pristine sky (proxy 0)
MAG_AT_Q255 = 3.4  # inner-city core (proxy >= PMAX)

# Approximate Bortle lookup used only for display/debug.
BORTLE_TABLE = [(7.6, 1), (6.8, 2), (6.3, 3), (5.8, 4), (5.3, 5),
                (4.8, 6), (4.4, 7), (4.0, 8), (3.5, 9)]

TEST_LOCATIONS = {
    "Fudan": (31.2989, 121.5035),
    "Tengger Desert": (38.7000, 104.7000),
    "NamibRand": (-24.7700, 15.9600),
}

ZENODO_API = "https://zenodo.org/api/records"

# --------------------------------------------------------------------------


def log(msg: str) -> None:
    print(f"[light-pollution] {msg}", flush=True)


def http_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "prism-light-pollution/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def find_latest_record() -> dict:
    """Resolve the concept DOI to its newest published record."""
    query = f'conceptdoi:"{CONCEPT_DOI}"'
    url = f"{ZENODO_API}?q={urllib.parse.quote(query)}&sort=mostrecent&size=25"
    data = http_json(url)
    hits = data.get("hits", {}).get("hits", [])
    if not hits:
        raise RuntimeError(f"No Zenodo records found for concept DOI {CONCEPT_DOI}")
    # newest first
    hits.sort(key=lambda h: h.get("metadata", {}).get("publication_date", ""), reverse=True)
    return hits[0]


def parse_years(record: dict) -> dict:
    """Pick the latest annual 'average' VIIRS file (real year, not assumed)."""
    candidates = []
    for f in record.get("files", []):
        key = f.get("key", "")
        if "average_viirs" not in key or not key.endswith(".tif"):
            continue
        # ..._s_20240101_20241231_...
        parts = key.split("_s_", 1)
        if len(parts) != 2:
            continue
        dates = parts[1].split("_", 2)
        if len(dates) < 2 or len(dates[0]) != 8 or len(dates[1]) != 8:
            continue
        try:
            start = datetime.strptime(dates[0], "%Y%m%d").date()
            end = datetime.strptime(dates[1], "%Y%m%d").date()
        except ValueError:
            continue
        if start.month != 1 or start.day != 1 or end.month != 12 or end.day != 31:
            continue
        if start.year != end.year:
            continue
        year = start.year
        candidates.append((year, f))
    if not candidates:
        raise RuntimeError("No annual average VIIRS GeoTIFF found in record")
    candidates.sort(key=lambda t: t[0])
    year, newest = candidates[-1]
    return {"year": year, "file": newest, "availableYears": [c[0] for c in candidates]}


def file_checksum(file_entry: dict) -> str:
    checksum = file_entry.get("checksum")
    if checksum:
        return checksum  # e.g. "md5:abc..."
    size = file_entry.get("size", 0)
    return f"size:{size}"


def download(url: str, dest: Path) -> None:
    if dest.exists() and dest.stat().st_size > 0:
        log(f"using cached source: {dest.name}")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    log(f"downloading {os.path.basename(url)} ...")
    req = urllib.request.Request(url, headers={"User-Agent": "prism-light-pollution/1.0"})
    with urllib.request.urlopen(req, timeout=600) as resp, open(tmp, "wb") as out:
        total = int(resp.headers.get("Content-Length", 0))
        done = 0
        while True:
            chunk = resp.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
            done += len(chunk)
            if total:
                pct = done * 100 // total
                print(f"\r  {pct:3d}%  {done/1e6:6.1f}/{total/1e6:.1f} MB", end="", flush=True)
    print()
    tmp.replace(dest)


def load_grid(src_path: Path) -> np.ndarray:
    """Downsample the source raster to a 1-arcminute float32 grid (top->bottom)."""
    import rasterio
    from rasterio.windows import Window

    with rasterio.open(src_path) as ds:
        height, width = ds.height, ds.width
        nodata = ds.nodata
        h2 = height // SOURCE_DECIMATION
        w2 = width // SOURCE_DECIMATION
        grid = np.zeros((h2, w2), dtype=np.float32)

        chunk = 480  # source rows per read (multiple of decimation)
        rows_done = 0
        for r0 in range(0, h2 * SOURCE_DECIMATION, chunk):
            r1 = min(r0 + chunk, h2 * SOURCE_DECIMATION)
            block = ds.read(1, window=Window(0, r0, width, r1 - r0)).astype(np.float32)
            if nodata is not None:
                block[block == nodata] = 0.0
            block[block < 0] = 0.0
            # pad to a multiple of decimation so the reshape is valid
            pad = (-block.shape[0]) % SOURCE_DECIMATION
            if pad:
                block = np.vstack([block, np.zeros((pad, width), dtype=np.float32)])
            reduced = block.reshape(block.shape[0] // SOURCE_DECIMATION, SOURCE_DECIMATION,
                                    w2, SOURCE_DECIMATION).mean(axis=(1, 3))
            nrows = reduced.shape[0]
            grid[rows_done:rows_done + nrows] = reduced
            rows_done += nrows
            if r0 % (chunk * 20) == 0:
                log(f"  reading source rows {r1}/{h2 * SOURCE_DECIMATION}")
        return grid, {"topLat": float(ds.bounds.top), "leftLon": float(ds.bounds.left)}


def neighbourhood_proxy(grid: np.ndarray) -> np.ndarray:
    from scipy.ndimage import gaussian_filter

    proxy = np.zeros_like(grid, dtype=np.float32)
    for sigma, weight in BLUR_SCALES:
        log(f"  gaussian blur sigma={sigma} cells weight={weight}")
        proxy += weight * gaussian_filter(grid, sigma=sigma, mode="constant")
    return proxy


def proxy_to_byte(proxy: np.ndarray) -> np.ndarray:
    norm = np.log1p(proxy) / math.log1p(PROXY_PMAX)
    np.clip(norm, 0.0, 1.0, out=norm)
    return np.round(norm * 255.0).astype(np.uint8)


def byte_to_mag(q: float) -> float:
    return MAG_AT_Q0 - (MAG_AT_Q0 - MAG_AT_Q255) * (q / 255.0)


def mag_to_bortle(mag: float) -> float:
    # points sorted by magnitude ascending, Bortle descending
    pts = sorted(BORTLE_TABLE, key=lambda p: p[0])
    if mag <= pts[0][0]:
        return float(pts[0][1])
    if mag >= pts[-1][0]:
        return float(pts[-1][1])
    for (m_lo, b_lo), (m_hi, b_hi) in zip(pts, pts[1:]):
        if m_lo <= mag <= m_hi:
            t = (mag - m_lo) / (m_hi - m_lo)
            return round(b_lo + (b_hi - b_lo) * t, 1)
    return 9.0


def write_tiles(q: np.ndarray) -> int:
    from PIL import Image

    TILES_DIR.mkdir(parents=True, exist_ok=True)
    # clean old tiles
    for old in TILES_DIR.glob("*.png"):
        old.unlink()

    height, width = q.shape
    count = 0
    for row in range(0, height, TILE_PIXELS):
        for col in range(0, width, TILE_PIXELS):
            tile = q[row:row + TILE_PIXELS, col:col + TILE_PIXELS]
            if tile.size == 0 or not tile.any():
                continue
            if tile.shape != (TILE_PIXELS, TILE_PIXELS):
                padded = np.zeros((TILE_PIXELS, TILE_PIXELS), dtype=np.uint8)
                padded[:tile.shape[0], :tile.shape[1]] = tile
                tile = padded
            Image.fromarray(tile).save(TILES_DIR / f"{row // TILE_PIXELS}_{col // TILE_PIXELS}.png",
                                         optimize=True)
            count += 1
    return count


def sample(q: np.ndarray, grid_meta: dict, lat: float, lon: float) -> float:
    """Nearest-cell sample of the byte grid for reporting."""
    top = grid_meta["topLat"]
    left = grid_meta["leftLon"]
    r = int(round((top - lat) / STEP_DEG))
    c = int(round((lon - left) / STEP_DEG))
    r = min(max(r, 0), q.shape[0] - 1)
    c = min(max(c, 0), q.shape[1] - 1)
    return float(q[r, c])


def write_meta_ts(manifest: dict) -> None:
    body = (
        "// AUTO-GENERATED by scripts/update_light_pollution.py. Do not edit.\n"
        "// Light-pollution dataset metadata for the runtime tile loader.\n"
        "export interface LightPollutionMeta {\n"
        "  datasetName: string;\n"
        "  conceptDoi: string;\n"
        "  datasetYear: number;\n"
        "  sourceVersion: string;\n"
        "  sourceRecord: number;\n"
        "  generatedAt: string;\n"
        "  license: string;\n"
        "  processingVersion: string;\n"
        "  topLat: number;\n"
        "  leftLon: number;\n"
        "  stepDeg: number;\n"
        "  gridWidth: number;\n"
        "  gridHeight: number;\n"
        "  tileDeg: number;\n"
        "  tilePixels: number;\n"
        "  pMax: number;\n"
        "  magAtQ0: number;\n"
        "  magAtQ255: number;\n"
        "}\n\n"
        "export const LIGHT_POLLUTION_META: LightPollutionMeta = "
        + json.dumps({
            "datasetName": manifest["datasetName"],
            "conceptDoi": manifest["conceptDoi"],
            "datasetYear": manifest["sourceYear"],
            "sourceVersion": manifest["sourceVersion"],
            "sourceRecord": manifest["sourceRecord"],
            "generatedAt": manifest["generatedAt"],
            "license": manifest["license"],
            "processingVersion": manifest["processingVersion"],
            "topLat": manifest["grid"]["topLat"],
            "leftLon": manifest["grid"]["leftLon"],
            "stepDeg": manifest["grid"]["stepDeg"],
            "gridWidth": manifest["grid"]["width"],
            "gridHeight": manifest["grid"]["height"],
            "tileDeg": manifest["tile"]["deg"],
            "tilePixels": manifest["tile"]["pixels"],
            "pMax": manifest["mapping"]["pMax"],
            "magAtQ0": manifest["mapping"]["magAtQ0"],
            "magAtQ255": manifest["mapping"]["magAtQ255"],
        }, indent=2)
        + " as const;\n"
    )
    META_TS_PATH.write_text(body)


def existing_manifest() -> dict | None:
    if MANIFEST_PATH.exists():
        try:
            return json.loads(MANIFEST_PATH.read_text())
        except Exception:
            return None
    return None


def generated_tiles_complete(manifest: dict | None) -> bool:
    if not manifest:
        return False
    expected = manifest.get("tile", {}).get("count")
    if not isinstance(expected, int) or expected <= 0 or not TILES_DIR.exists():
        return False
    return sum(1 for _ in TILES_DIR.glob("*.png")) == expected


def source_details(record: dict) -> tuple[dict, dict]:
    years = parse_years(record)
    meta = record.get("metadata", {})
    desired = {
        "sourceRecord": record["id"],
        "sourceVersion": str(meta.get("version") or f"record-{record['id']}"),
        "sourceYear": years["year"],
        "sourceFile": years["file"]["key"],
        "sourceHash": file_checksum(years["file"]),
        "processingVersion": PROCESSING_VERSION,
        "tileCoverageVersion": TILE_COVERAGE_VERSION,
    }
    return years, desired


def source_cache_id(source: dict) -> str:
    # Source identity uses the checksum published by Zenodo.
    checksum = source["sourceHash"].replace(":", "-")
    return f"{source['sourceRecord']}-{source['sourceYear']}-{checksum}"


def cache_key(source: dict | None) -> str:
    if source is None:
        return "light-pollution-data-unavailable"
    return (f"light-pollution-data-{source_cache_id(source)}"
            f"-p{source['processingVersion']}-t{source['tileCoverageVersion']}")


def emit_cache_key(source: dict | None, name: str = "cache-key") -> None:
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a") as out:
            out.write(f"{name}={cache_key(source)}\n")


def resolve_source(path: Path) -> int:
    """Query once before CI cache restoration; retain the result for processing."""
    current = existing_manifest()
    if generated_tiles_complete(current):
        emit_cache_key(current, "checkout-cache-key")
    log(f"resolving latest record for concept DOI {CONCEPT_DOI}")
    try:
        record = find_latest_record()
        _, desired = source_details(record)
        snapshot = {"record": record}
        emit_cache_key(desired)
        log(f"latest record: {record.get('doi')} version={desired['sourceVersion']} "
            f"year={desired['sourceYear']}")
    except Exception as exc:
        snapshot = {"error": str(exc)}
        emit_cache_key(None)
        log(f"WARNING: data source unavailable ({exc}); restoring previous generated data")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(snapshot))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="ignore manifest and regenerate")
    source_args = parser.add_mutually_exclusive_group()
    source_args.add_argument("--resolve-source", type=Path,
                             help="save current Zenodo metadata and emit the CI cache key")
    source_args.add_argument("--source", type=Path,
                             help="use metadata saved by --resolve-source")
    args = parser.parse_args()
    if args.resolve_source:
        return resolve_source(args.resolve_source)

    current = existing_manifest()
    tiles_complete = generated_tiles_complete(current)
    log(f"resolving latest record for concept DOI {CONCEPT_DOI}")
    try:
        if args.source:
            snapshot = json.loads(args.source.read_text())
            if "error" in snapshot:
                raise RuntimeError(snapshot["error"])
            record = snapshot["record"]
        else:
            record = find_latest_record()
        years, desired = source_details(record)
    except Exception as exc:  # network / source temporarily unavailable
        if tiles_complete and not args.force:
            log(f"WARNING: data source unavailable ({exc}); using existing generated tiles")
            write_meta_ts(current)
            emit_cache_key(current)
            return 0
        log(f"ERROR: data source unavailable and no generated tiles present ({exc})")
        return 1
    version = desired["sourceVersion"]
    license_info = record.get("metadata", {}).get("license", {})
    license_id = license_info.get("id", "unknown") if isinstance(license_info, dict) else str(license_info)
    log(f"latest record: {record.get('doi')} version={version} year={years['year']}")

    if current and tiles_complete and not args.force:
        same = all(current.get(k) == v for k, v in desired.items())
        if same:
            log("source unchanged and manifest matches -> skipping processing")
            write_meta_ts(current)
            emit_cache_key(current)
            return 0
        log("source or processing changed -> regenerating")

    file_entry = years["file"]
    filename = file_entry["key"]
    url = file_entry.get("links", {}).get("self") or file_entry.get("download")
    if not url:
        url = f"https://zenodo.org/records/{record.get('id')}/files/{filename}?download=1"
    src_path = CACHE_DIR / source_cache_id(desired) / filename
    try:
        download(url, src_path)
    except Exception as exc:
        if tiles_complete and not args.force:
            log(f"WARNING: download failed ({exc}); using existing generated tiles")
            write_meta_ts(current)
            emit_cache_key(current)
            return 0
        raise

    log("downsampling to 1 arc-minute grid")
    grid, grid_meta = load_grid(src_path)
    log(f"  grid shape {grid.shape}")

    log("neighbourhood light fusion")
    proxy = neighbourhood_proxy(grid)
    q = proxy_to_byte(proxy)

    log("writing tiles")
    tile_count = write_tiles(q)
    log(f"  wrote {tile_count} tiles")

    manifest = {
        **desired,
        "datasetName": DATASET_NAME,
        "conceptDoi": CONCEPT_DOI,
        "doi": record.get("doi"),
        "license": license_id,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "grid": {
            "topLat": round(grid_meta["topLat"], 6),
            "leftLon": round(grid_meta["leftLon"], 6),
            "stepDeg": round(STEP_DEG, 8),
            "width": int(q.shape[1]),
            "height": int(q.shape[0]),
        },
        "tile": {
            "deg": TILE_DEG,
            "pixels": TILE_PIXELS,
            "count": tile_count,
        },
        "mapping": {
            "pMax": PROXY_PMAX,
            "magAtQ0": MAG_AT_Q0,
            "magAtQ255": MAG_AT_Q255,
            "blurScales": [list(s) for s in BLUR_SCALES],
            "bortleTable": BORTLE_TABLE,
        },
    }
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2))
    write_meta_ts(manifest)
    emit_cache_key(manifest)
    log(f"wrote {MANIFEST_PATH.relative_to(REPO_ROOT)} and {META_TS_PATH.relative_to(REPO_ROOT)}")

    log("test locations:")
    for name, (lat, lon) in TEST_LOCATIONS.items():
        qv = sample(q, grid_meta, lat, lon)
        mag = byte_to_mag(qv)
        bortle = mag_to_bortle(mag)
        log(f"  {name:16s} q={qv:5.1f}  mag={mag:.2f}  bortle~{bortle}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
