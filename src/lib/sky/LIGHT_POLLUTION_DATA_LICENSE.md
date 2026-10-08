# Light-pollution dataset license

This file records the provenance and license of the VIIRS nighttime-lights data
used to compute the sky background's limiting magnitude. It is **separate** from
the project source code license (MIT, see repository root `LICENSE`) and from the
star catalog data license (`DATA_LICENSE.md`).

## Dataset

- **Name:** Annual time series of global VIIRS nighttime lights, 500 m spatial
  resolution (latest published version at time of writing: v0.4).
- **Author:** Hengl, T. (as credited by Zenodo).
- **Maintainer:** OpenGeoHub (harmonized / extrapolated VIIRS nighttime lights).
- **Concept DOI:** 10.5281/zenodo.7750174
- **Record used:** the newest published record resolved from the concept DOI at
  generation time (record id, version, year and file checksum are recorded in
  `public/light-pollution/manifest.json`).
- **Original upstream data:** NOAA/Colorado School of Mines VIIRS Nighttime
  Lights (VNL) annual composites (Earth Observation Group). The OpenGeoHub
  product is an annual harmonized/extrapolated derivative.
- **License:** **Creative Commons Attribution 4.0 International (CC BY 4.0)** —
  https://creativecommons.org/licenses/by/4.0/
  (Verified from the Zenodo record metadata; not assumed.)

## Generation

- **Script:** `scripts/update_light_pollution.py`
- **When:** at deploy/build time (and on demand). If the manifest already matches
  the source record/version/year/checksum and processing version, processing is
  skipped. The raw GeoTIFF is cached under `.cache/light-pollution/`, grouped by
  the source record, year and Zenodo-provided checksum, and is NOT committed to Git.
- **Deployment cache:** GitHub Actions resolves the latest source before restoring
  the cache. The source, PNG tiles, manifest and runtime metadata are saved together.
  A source outage preserves the previous generated dataset and its own cache key.
- **Browser cache:** static resource URLs include the source record, year,
  processing version and generation timestamp to distinguish dataset revisions.
- **Spatial resampling:** the 500 m (~1/240°) source is downsampled by 4 to a
  1 arc-minute (~1.85 km) grid.
- **Neighbourhood fusion:** a multi-scale Gaussian blur of radiance
  (σ = 3, 12, 40 cells; weights 0.45 / 0.35 / 0.20) approximates how nearby
  cities contribute to skyglow.
- **Conversion:** `proxy -> ln(1 + proxy) -> 8-bit quantised byte`. At runtime the
  byte maps monotonically to a continuous `limitingMagnitude`
  (`magAtQ0 .. magAtQ255`). Bortle classes are only an approximate debug value.
- **Tiles:** 2° × 2° coverage, 120 × 120 cells, 8-bit grayscale PNG, written to
  `public/light-pollution/tiles/`. Only tiles containing non-zero light are
  emitted; a 404 is interpreted as a dark (unlit) tile. Other loading failures use
  the Fudan fallback.

## Attribution

When reusing this data, credit: "Nighttime lights data by Hengl, T. / OpenGeoHub /
VIIRS (CC BY 4.0)", and include the concept DOI above.
