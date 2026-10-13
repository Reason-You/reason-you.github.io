#!/usr/bin/env python3
"""Extract Stellarium Modern figures and HYG v4.1 constellation membership."""
import argparse
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = 'https://github.com/Stellarium/stellarium/blob/d4a1322b6a81bf15dc4ef65c267b2fc846c5f3ca/skycultures/modern/'
PRIORITY = ['Ori', 'Sco', 'Cyg', 'Cas', 'UMa']
CHINESE = dict(zip(PRIORITY, ['猎户座', '天蝎座', '天鹅座', '仙后座', '大熊座']))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('stellarium', type=Path)
    parser.add_argument('hyg', type=Path)
    args = parser.parse_args()
    source = json.loads(args.stellarium.read_text())
    constellations = []
    for item in source['constellations']:
        abbreviation = item['id'].split()[-1]
        pairs = {tuple(sorted((a, b))) for polyline in item['lines']
                 for a, b in zip(polyline, polyline[1:]) if a != b}
        figure = {'id': abbreviation, 'name': item['common_name']['native'],
                  'sourceId': item['id'], 'lines': [{'fromHip': a, 'toHip': b} for a, b in sorted(pairs)]}
        if abbreviation in CHINESE:
            figure['chinese'] = CHINESE[abbreviation]
        constellations.append(figure)
    constellations.sort(key=lambda c: (PRIORITY.index(c['id']) if c['id'] in PRIORITY else 5, c['id']))
    data = {'author': "Stellarium's team", 'source': SOURCE + 'index.json',
            'license': 'CC-BY-SA-4.0', 'licenseUrl': 'https://creativecommons.org/licenses/by-sa/4.0/',
            'licenseDeclaration': SOURCE + 'description.md#license',
            'modifications': 'Expanded adjacent HIP vertices for all 88 Modern constellations; normalized and deduplicated undirected pairs.',
            'constellations': constellations}
    (ROOT / 'public/data/constellation-lines.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    with args.hyg.open(newline='', encoding='utf-8') as file:
        catalog = [row for row in csv.DictReader(file) if row['id'] != '0' and row['mag']]
    rows = [row for row in catalog if float(row['mag']) <= 6.5]
    groups = {c['id']: [] for c in sorted(constellations, key=lambda c: c['id'])}
    for row in rows:
        groups[row['con']].append(int(row['id']))
    membership = {'source': 'https://github.com/astronexus/HYG-Database/blob/main/hyg/CURRENT/hygdata_v41.csv',
                  'version': '4.1', 'license': data['license'], 'licenseUrl': data['licenseUrl'],
                  'modifications': 'Grouped HYG ids with magnitude <= 6.5, excluding the Sun, by their catalogued constellation abbreviation.',
                  'constellations': groups}
    (ROOT / 'public/data/constellation-membership.json').write_text(json.dumps(membership, ensure_ascii=False, separators=(',', ':')) + '\n')
    write_vertices(constellations, catalog)
    print(f'{len(constellations)} constellation figures; {len(rows)} HYG members')


def write_vertices(constellations, catalog):
    hips = {line[key] for figure in constellations for line in figure['lines'] for key in ('fromHip', 'toHip')}
    by_hip = {}
    for row in catalog:
        if not row['hip'] or int(row['hip']) not in hips:
            continue
        hip = int(row['hip'])
        if hip not in by_hip or float(row['mag']) < float(by_hip[hip]['mag']):
            by_hip[hip] = row
    missing = hips - by_hip.keys()
    if missing:
        raise ValueError(f'HYG coordinates missing for HIP vertices: {sorted(missing)}')
    data = {
        'source': 'https://github.com/astronexus/HYG-Database/blob/main/hyg/CURRENT/hygdata_v41.csv',
        'version': '4.1', 'author': 'David Nash / Astronexus',
        'license': 'CC-BY-SA-4.0', 'licenseUrl': 'https://creativecommons.org/licenses/by-sa/4.0/',
        'modifications': 'Selected all Stellarium Modern HIP vertices, retaining the brightest HYG entry per HIP; rounded J2000 coordinates to the bright-star catalog precision.',
        'vertices': [{'id': int(row['id']), 'hip': hip, 'ra': round(float(row['ra']), 5),
                      'dec': round(float(row['dec']), 4), 'mag': float(row['mag'])}
                     for hip, row in sorted(by_hip.items())],
    }
    (ROOT / 'public/data/constellation-vertices.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    main()
