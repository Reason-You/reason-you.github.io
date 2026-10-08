# Look Up star names

## Catalog and coverage

The HYG v4.1 naked-eye subset contains 8,920 entries. Of these, **179 have visual
magnitude ≤ 3.0**, **145 have an English proper name**, and **all 145 have a verified
Chinese equivalent**. The remaining 34 entries render as ordinary stars. Counts
refer to catalog entries, including separately catalogued binary components.

The complete mapping, with HYG, HIP, HD, Bayer identity, Chinese/English names,
source URL and evidence, is in `src/lib/sky/star-names-data.json`. Runtime lookup
uses the **HYG row identifier**, not coordinates or an English-name match.

Sources:

- [HYG v4.1](https://github.com/astronexus/HYG-Database/blob/main/hyg/CURRENT/hygdata_v41.csv)
  — coordinates, magnitudes, names and catalog identifiers.
- [Hong Kong Space Museum: 亮星中英对照表](https://hk.space.museum/sc/web/spm/resources/teachers-corner/constellations-and-myths/glossary-of-bright-stars.html)
  — institutional reference for traditional names and Bayer designations;
  references *The Cambridge Guide to the Constellations*, 科学出版社恒星图表 and
  *Sky Catalogue 2000.0*.
- [恒星亮度列表](https://zh.wikipedia.org/zh-hans/恆星亮度列表)
  — magnitude/Bayer/Chinese name table. The mapping retains each row's citation;
  dedicated articles identify multiple-star components.

## Identity distinctions

| English name | Chinese display | HYG | Identity |
|---|---|---:|---|
| Rigil Kentaurus | 南门二A | 71456 | HIP 71683, HD 128620, α¹ Cen |
| Toliman | 南门二B | 71453 | HIP 71681, HD 128621, α² Cen |
| Castor | 北河二A | 36744 | HIP 36850, HD 60179, Castor A subsystem |
| Castor B | 北河二B | 118485 | No HIP, HD 60178, Castor B subsystem |
| Acrux | 十字架二 | 60530 | HIP 60718, HD 108248, α¹ Cru |
| Cor Caroli | 常陈一 | 62925 | HIP 63125, HD 112413, α² CVn |
| Tureis | 弧矢增三十二 | 39644 | HIP 39757, HD 67523, ρ Pup |
| Aspidiske | 海石二 | 45425 | HIP 45556, HD 80404, ι Car |
| Aldhanab | 败臼一 | 107742 | HIP 108085, HD 207971, γ Gru |
| Tiaki | 鹤二 | 111768 | HIP 112122, HD 214952, β Gru |
| Gienah | 轸宿一 | 59621 | HIP 59803, HD 106625, γ Crv |
| Aljanah | 天津九 | 102157 | HIP 102488, HD 197989, ε Cyg |
| Xamidimura | 尾宿一 | 82263 | HIP 82514, HD 151890, μ¹ Sco |

A/B suffixes qualify components of the traditional Chinese system name. HYG
photometry is retained, including the combined-like magnitudes of Castor and
Acrux. Centres that are indistinguishable within one screen pixel prefer the
brighter entry for pointer selection; keyboard focus reaches each entry.

Component references:
[南门二](https://zh.wikipedia.org/zh-hans/南門二),
[北河二](https://zh.wikipedia.org/zh-hans/北河二),
[十字架二](https://zh.wikipedia.org/zh-hans/十字架二),
[常陈一](https://zh.wikipedia.org/zh-hans/常陳一),
[轩辕十二](https://zh.wikipedia.org/zh-hans/軒轅十二),
[天大将军一](https://zh.wikipedia.org/zh-hans/天大將軍一),
[帝座](https://zh.wikipedia.org/zh-hans/帝座),
[氐宿一](https://zh.wikipedia.org/zh-hans/氐宿一),
[箕宿一](https://zh.wikipedia.org/zh-hans/箕宿一),
[房宿一](https://zh.wikipedia.org/zh-hans/房宿一),
[尾宿一](https://zh.wikipedia.org/zh-hans/尾宿一).

## Rendering and interaction

A named entry becomes interactive only when mag ≤ 3.0, passes the observer's
VIIRS magnitude limit and the shared renderer's visibility test, and lies inside
the camera frame. All other visible entries continue to render normally.
Desktop and mobile use the same magnitude limit. Labels use DOM text in the
website's auxiliary color, with only Chinese and English names.

The camera faces azimuth 180°, centred at altitude 47.5°. Desktop horizontal FOV
is 100°; below 640 CSS px the vertical FOV is 75°, with horizontal FOV derived
from the container's aspect ratio. Both axes share one perspective scale.

## Data attribution

HYG-derived data and the Wikipedia-derived bilingual mapping use **CC BY-SA
4.0**. Attribution is to David Nash / Astronexus and the contributors of the
linked Wikipedia articles. See `src/lib/sky/DATA_LICENSE.md`.
