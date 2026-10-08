#!/usr/bin/env python3
"""Reduce HYG v4.1 to the website's naked-eye catalog, retaining star identity."""

import argparse
import csv
import json
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HEADER = '''// AUTO-GENERATED bright-star catalog. Do not edit by hand.
//
// Source: Astronexus HYG stellar database, version 4.1 (2024).
//   Project: https://codeberg.org/astronexus/hyg
//   Mirror:  https://github.com/astronexus/HYG-Database (hyg/CURRENT/hygdata_v41.csv)
//   License: CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/)
// This data file is licensed separately from the project source code. See DATA_LICENSE.md.
//
// Stars with visual magnitude <= 6.5; HYG row 0 (the Sun) is excluded.
// Regenerate: python3 scripts/update_star_catalog.py path/to/hygdata_v41.csv
//
// [HYG id, HIP id | null, RA hours (J2000), Dec degrees (J2000), mag, B-V | null, proper name?]
export type StarTuple = readonly [
  hygId: number,
  hipId: number | null,
  raHours: number,
  decDegrees: number,
  magnitude: number,
  colorIndex: number | null,
  properName?: string
];

export const STAR_DATA: ReadonlyArray<StarTuple> = [
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('csv', type=Path)
    args = parser.parse_args()
    with args.csv.open(newline='', encoding='utf-8') as source:
        rows = [row for row in csv.DictReader(source)
                if row['id'] != '0' and row['mag'] and float(row['mag']) <= 6.5]
    rows.sort(key=lambda row: float(row['mag']))
    tuples = []
    for row in rows:
        color = (float(Decimal(float(row['ci'])).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))
                 if row['ci'] else None)
        star = [int(row['id']), int(row['hip']) if row['hip'] else None,
                round(float(row['ra']), 5), round(float(row['dec']), 4),
                float(row['mag']), color]
        if row['proper']:
            star.append(row['proper'])
        tuples.append(json.dumps(star, ensure_ascii=False, separators=(',', ':')) + ',')
    output = ROOT / 'src/lib/sky/catalog-data.ts'
    output.write_text(HEADER + '\n'.join(tuples) + '\n];\n', encoding='utf-8')
    print(f'{len(rows)} stars → {output.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
