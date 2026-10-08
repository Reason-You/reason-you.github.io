import { LIGHT_POLLUTION_META } from "./light-pollution-meta";

export type LightPollutionSource = "viirs" | "fallback" | "override";

export interface LightPollution {
  /** Continuous value the renderer actually uses to filter stars. */
  limitingMagnitude: number;
  /** Approximate Bortle class, for display/debug only. */
  bortleApprox: number;
  /** Raw neighbourhood light proxy (VIIRS radiance units), for debug. */
  lightProxy: number;
  source: LightPollutionSource;
  datasetYear?: number;
  tile?: string;
}

/**
 * Used when the static VIIRS tiles cannot be loaded at all (e.g. the data
 * folder is missing): keeps the sky system working with a Shanghai-city value.
 */
export const FUDAN_FALLBACK: LightPollution = {
  limitingMagnitude: 4.0,
  bortleApprox: 8,
  lightProxy: Number.NaN,
  source: "fallback",
};

const TILES_BASE = "/light-pollution/tiles";
const DATA_VERSION = encodeURIComponent(
  `${LIGHT_POLLUTION_META.sourceRecord}-${LIGHT_POLLUTION_META.datasetYear}-p${LIGHT_POLLUTION_META.processingVersion}-${LIGHT_POLLUTION_META.generatedAt}`
);
const MANIFEST_URL = `/light-pollution/manifest.json?data=${DATA_VERSION}`;

const BORTLE_TABLE: Array<[number, number]> = [
  [3.5, 9],
  [4.0, 8],
  [4.4, 7],
  [4.8, 6],
  [5.3, 5],
  [5.8, 4],
  [6.3, 3],
  [6.8, 2],
  [7.6, 1],
];

export function magToBortle(mag: number): number {
  const pts = BORTLE_TABLE;
  if (!Number.isFinite(mag)) return 9;
  if (mag <= pts[0][0]) return pts[0][1];
  if (mag >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [mLo, bLo] = pts[i];
    const [mHi, bHi] = pts[i + 1];
    if (mag >= mLo && mag <= mHi) {
      const t = (mag - mLo) / (mHi - mLo);
      return Math.round((bLo + (bHi - bLo) * t) * 10) / 10;
    }
  }
  return 9;
}

export function qToMagnitude(q: number): number {
  const byte = Number.isFinite(q) ? Math.min(255, Math.max(0, q)) : 0;
  return (
    LIGHT_POLLUTION_META.magAtQ0 -
    (LIGHT_POLLUTION_META.magAtQ0 - LIGHT_POLLUTION_META.magAtQ255) * (byte / 255)
  );
}

export function qToProxy(q: number): number {
  const byte = Number.isFinite(q) ? Math.min(255, Math.max(0, q)) : 0;
  return Math.expm1((byte / 255) * Math.log1p(LIGHT_POLLUTION_META.pMax));
}

export function limitingMagnitudeForBortle(bortle: number): number {
  const pts = BORTLE_TABLE;
  const b = Number.isFinite(bortle) ? Math.min(9, Math.max(1, bortle)) : 9;
  for (let i = 0; i < pts.length - 1; i += 1) {
    // Table is magnitude-ascending, Bortle-descending: segment i is brighter/higher.
    const [mLo, bLo] = pts[i];
    const [mHi, bHi] = pts[i + 1];
    if (b <= bLo && b >= bHi) {
      const t = (bLo - b) / (bLo - bHi);
      return Math.round((mLo + (mHi - mLo) * t) * 100) / 100;
    }
  }
  return 3.5;
}

// --------------------------------------------------------------------------
// Static tile loading (browser only)
// --------------------------------------------------------------------------

interface TileData {
  width: number;
  height: number;
  /** Red channel of the grayscale PNG, one byte per cell. */
  data: Uint8ClampedArray;
}

const tileCache = new Map<string, TileData | null>();
const pendingTiles = new Map<string, Promise<TileData | null>>();

let manifestPromise: Promise<boolean> | null = null;

// Bound each static request, including its body: at most two sequential requests
// (manifest and tile) are needed by a cold lookup.
async function fetchStaticBlob(url: string): Promise<Blob | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, { cache: "force-cache", signal: controller.signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("data-fetch-failed");
    return await res.blob();
  } finally {
    clearTimeout(timer);
  }
}

async function tilesAvailable(): Promise<boolean> {
  if (!manifestPromise) {
    manifestPromise = fetchStaticBlob(MANIFEST_URL)
      .then((blob) => blob !== null)
      .catch(() => false);
  }
  const available = await manifestPromise;
  if (!available) manifestPromise = null;
  return available;
}

async function decodeImage(blob: Blob): Promise<TileData> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    const width = bitmap.width;
    const height = bitmap.height;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no-2d-context");
    ctx.drawImage(bitmap, 0, 0);
    const image = ctx.getImageData(0, 0, width, height);
    if (typeof bitmap.close === "function") bitmap.close();
    return { width, height, data: image.data };
  }

  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image-decode-failed"));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no-2d-context");
    ctx.drawImage(img, 0, 0);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { width: canvas.width, height: canvas.height, data: image.data };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadTile(name: string): Promise<TileData | null> {
  const cached = tileCache.get(name);
  if (cached !== undefined) return Promise.resolve(cached);
  const pending = pendingTiles.get(name);
  if (pending) return pending;

  const promise = fetchStaticBlob(`${TILES_BASE}/${name}.png?data=${DATA_VERSION}`)
    .then((blob) => blob === null ? null : decodeImage(blob)) // all-zero tiles are omitted
    .catch(() => {
      tileCache.delete(name);
      throw new Error("tile-fetch-failed");
    })
    .then((data) => {
      tileCache.set(name, data);
      if (tileCache.size > 48) {
        const oldest = tileCache.keys().next().value;
        if (oldest !== undefined) tileCache.delete(oldest);
      }
      return data;
    })
    .finally(() => pendingTiles.delete(name));

  pendingTiles.set(name, promise);
  return promise;
}

function tileName(row: number, col: number): string {
  return `${row}_${col}`;
}

async function sampleCell(row: number, col: number): Promise<number> {
  const meta = LIGHT_POLLUTION_META;
  if (row < 0 || row >= meta.gridHeight || col < 0 || col >= meta.gridWidth) return 0;

  const tileRow = Math.floor(row / meta.tilePixels);
  const tileCol = Math.floor(col / meta.tilePixels);
  const tile = await loadTile(tileName(tileRow, tileCol));
  if (tile === null) return 0;

  const y = row % meta.tilePixels;
  const x = col % meta.tilePixels;
  if (x >= tile.width || y >= tile.height) return 0;
  return tile.data[(y * tile.width + x) * 4];
}

async function sampleBilinear(gridRow: number, gridCol: number): Promise<number> {
  const meta = LIGHT_POLLUTION_META;
  const row = Math.min(Math.max(gridRow, 0), meta.gridHeight - 1);
  const col = Math.min(Math.max(gridCol, 0), meta.gridWidth - 1);
  const row0 = Math.floor(row);
  const col0 = Math.floor(col);
  const row1 = Math.min(row0 + 1, meta.gridHeight - 1);
  const col1 = Math.min(col0 + 1, meta.gridWidth - 1);
  const ty = row - row0;
  const tx = col - col0;
  const [topLeft, topRight, bottomLeft, bottomRight] = await Promise.all([
    sampleCell(row0, col0),
    sampleCell(row0, col1),
    sampleCell(row1, col0),
    sampleCell(row1, col1),
  ]);
  const top = topLeft * (1 - tx) + topRight * tx;
  const bottom = bottomLeft * (1 - tx) + bottomRight * tx;
  return top * (1 - ty) + bottom * ty;
}

function darkSky(tile?: string): LightPollution {
  const mag = qToMagnitude(0);
  return {
    limitingMagnitude: mag,
    bortleApprox: magToBortle(mag),
    lightProxy: 0,
    source: "viirs",
    datasetYear: LIGHT_POLLUTION_META.datasetYear,
    tile,
  };
}

/**
 * Unified light-pollution lookup for every location: default Fudan, geolocation
 * and URL coordinates all pass through here. No third-party API, no API key,
 * no server: one small static tile per location, plus adjacent cells at tile edges.
 */
export async function getLightPollution(
  latitude: number,
  longitude: number
): Promise<LightPollution> {
  const meta = LIGHT_POLLUTION_META;

  const available = await tilesAvailable();
  if (!available) return { ...FUDAN_FALLBACK };

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return { ...FUDAN_FALLBACK };

  // The VIIRS raster spans the antimeridian as [-180, 180), so both spellings
  // of that meridian sample the same cells.
  const normalizedLongitude = ((longitude + 180) % 360 + 360) % 360 - 180;
  const gridRow = (meta.topLat - latitude) / meta.stepDeg;
  const gridCol = (normalizedLongitude - meta.leftLon) / meta.stepDeg;
  if (
    gridRow < 0 ||
    gridRow > meta.gridHeight - 1 ||
    gridCol < 0 ||
    gridCol > meta.gridWidth - 1
  ) {
    return darkSky();
  }

  const row = Math.floor(gridRow / meta.tilePixels);
  const col = Math.floor(gridCol / meta.tilePixels);
  const name = tileName(row, col);

  let q: number;
  try {
    q = await sampleBilinear(gridRow, gridCol);
  } catch {
    return { ...FUDAN_FALLBACK };
  }

  const mag = qToMagnitude(q);

  return {
    limitingMagnitude: mag,
    bortleApprox: magToBortle(mag),
    lightProxy: qToProxy(q),
    source: "viirs",
    datasetYear: meta.datasetYear,
    tile: name,
  };
}
