# Star catalog data license

The compact bright-star catalog in `catalog-data.ts` is **derived data**, licensed
separately from the PRISM source code (which is MIT — see the repository root
`LICENSE`).

## Source

- **Data source:** Astronexus HYG Database
- **Version used:** HYG v4.1 (2024), file `hygdata_v41.csv`
- **Original project:** https://codeberg.org/astronexus/hyg
  (mirror: https://github.com/astronexus/HYG-Database, path `hyg/CURRENT/hygdata_v41.csv`)
- **Upstream license:** CC BY-SA 4.0 —
  https://creativecommons.org/licenses/by-sa/4.0/

## What was changed

The upstream CSV (~120,000 rows) was reduced to the brightest stars with
visual magnitude ≤ 6.5 (8,920 rows), rounded, and reshaped into the compact
tuple array in `catalog-data.ts`. The retained columns are HYG row identifier,
Hipparcos identifier, right ascension (hours, J2000), declination (degrees, J2000),
visual magnitude, B-V colour index, and proper name.

Regenerate with `python3 scripts/update_star_catalog.py path/to/hygdata_v41.csv`.

Because the data is CC BY-SA 4.0, this derived catalog remains under
**CC BY-SA 4.0**. Attribution: "Star data from the HYG Database by David Nash /
Astronexus (CC BY-SA 4.0), reduced to magnitude ≤ 6.5."

## Bilingual names

`star-names-data.json` is a sourced name/identity mapping for HYG entries with
visual magnitude ≤ 3.0. Chinese names were converted to simplified Chinese;
explicit A/B suffixes distinguish the Castor and Alpha Centauri components.
Sources and identification notes are in `docs/sky-star-names.md`.

Wikipedia-derived mapping data is attributed to the contributors of the cited
articles and distributed under **CC BY-SA 4.0**. The Hong Kong Space Museum's
*Glossary of Bright Stars* supplies an additional institutional reference for
traditional Chinese names and Bayer designations.
