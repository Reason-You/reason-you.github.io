> 历史记录。现行星轨说明见[时间旅行](../../star-trails.md)，最终验证见[2026年11月15日记录](../../verification/2026-11-15/README.md)。

# Research: Chinese names for all 88 IAU constellations

## Summary
All 88 `id`/`name` pairs in `/Users/cosmicskewer/Documents/reason-you.github.io/public/data/constellation-lines.json` match the IAU official Latin constellation names and case-sensitive three-letter abbreviations. Use the simplified-Chinese names below from the Chinese Astronomical Society terminology database hosted by the National Astronomical Data Center (NADC); Hong Kong Space Museum independently corroborates every name in its complete bilingual table. Preserve every existing Stellarium ID and English name, including `Boo` → `Boötes`.

## Findings
1. **Complete authoritative coverage** — The NADC “分类浏览：星座” table supplies all 88 modern Chinese names, foreign names, abbreviations and individual term links. Its 96 records include eight historical constellations after the modern 88; those eight are excluded. `Ara` has a blank abbreviation in NADC, so its ID comes from the IAU. NADC writes `Bootes`; IAU and the project write `Boötes`. [NADC constellation category](https://nadc.china-vo.org/astrodict/dictbrowseresult?tag=%E6%98%9F%E5%BA%A7)
2. **IAU cross-match: 88/88** — Read the entire local JSON (lines 1–3412) and the complete IAU Charts table, matching the JSON `name` to IAU **Name** (Latin nominative) and `id` to **Abbreviation**. No missing, extra, duplicate or mismatched pairs were found. The IAU table’s separate **English Name** column contains popular meanings such as “The Ship’s Stern”; these are not replacements for the project’s Stellarium names. [IAU, The Constellations](https://www.iau.org/IAU/IAU/Astronomy-FAQs/Constellations.aspx?hkey=bb9dc841-0618-41b5-ac70-149741062141)
3. **Museum corroboration: 88/88** — Hong Kong Space Museum’s “西方星座中英對照表”, rows 1–88, independently supplies the same Chinese naming choices in traditional script, with corresponding Latin names. [Hong Kong Space Museum](https://hk.space.museum/tc/web/spm/resources/teachers-corner/constellations-and-myths/glossary-of-western-constellations.html)
4. **Current file coverage** — The local JSON already supplies Chinese names for `Ori`, `Sco`, `Cyg`, `Cas`, `UMa`; all five match this mapping. The remaining 83 entries have no `chinese` field. Severity: informational; no ID/name correction is needed.

## Full mapping and per-record provenance
Every row below is an IAU-cross-matched project ID/name pair. Chinese strings are transcribed directly from NADC's category table, not machine translations. `termId` identifies the exact source record at `https://nadc.china-vo.org/astrodict/termdetails?id=<termId>`; the category source above displays every linked record and its Chinese string. The table is sorted by IAU Latin name; it does not prescribe changing the project's entry order.

| ID | Existing English name | Simplified Chinese | NADC termId |
|---|---|---|---:|
| And | Andromeda | 仙女座 | 232 |
| Ant | Antlia | 唧筒座 | 254 |
| Aps | Apus | 天燕座 | 277 |
| Aqr | Aquarius | 宝瓶座 | 279 |
| Aql | Aquila | 天鹰座 | 280 |
| Ara | Ara | 天坛座 | 281 |
| Ari | Aries | 白羊座 | 303 |
| Aur | Auriga | 御夫座 | 374 |
| Boo | Boötes | 牧夫座 | 555 |
| Cae | Caelum | 雕具座 | 644 |
| Cam | Camelopardalis | 鹿豹座 | 662 |
| Cnc | Cancer | 巨蟹座 | 666 |
| CVn | Canes Venatici | 猎犬座 | 667 |
| CMa | Canis Major | 大犬座 | 668 |
| CMi | Canis Minor | 小犬座 | 670 |
| Cap | Capricornus | 摩羯座 | 685 |
| Car | Carina | 船底座 | 689 |
| Cas | Cassiopeia | 仙后座 | 721 |
| Cen | Centaurus | 半人马座 | 755 |
| Cep | Cepheus | 仙王座 | 765 |
| Cet | Cetus | 鲸鱼座 | 773 |
| Cha | Chamaeleon | 蝘蜓座 | 778 |
| Cir | Circinus | 圆规座 | 854 |
| Col | Columba | 天鸽座 | 870 |
| Com | Coma Berenices | 后发座 | 871 |
| CrA | Corona Australis | 南冕座 | 916 |
| CrB | Corona Borealis | 北冕座 | 917 |
| Crv | Corvus | 乌鸦座 | 919 |
| Crt | Crater | 巨爵座 | 946 |
| Cru | Crux | 南十字座 | 951 |
| Cyg | Cygnus | 天鹅座 | 960 |
| Del | Delphinus | 海豚座 | 1037 |
| Dor | Dorado | 剑鱼座 | 1105 |
| Dra | Draco | 天龙座 | 1108 |
| Equ | Equuleus | 小马座 | 1207 |
| Eri | Eridanus | 波江座 | 1215 |
| For | Fornax | 天炉座 | 1371 |
| Gem | Gemini | 双子座 | 1559 |
| Gru | Grus | 天鹤座 | 1682 |
| Her | Hercules | 武仙座 | 1829 |
| Hor | Horologium | 时钟座 | 1911 |
| Hya | Hydra | 长蛇座 | 1976 |
| Hyi | Hydrus | 水蛇座 | 1979 |
| Ind | Indus | 印第安座 | 2044 |
| Lac | Lacerta | 蝎虎座 | 2413 |
| Leo | Leo | 狮子座 | 2513 |
| LMi | Leo Minor | 小狮座 | 2514 |
| Lep | Lepus | 天兔座 | 2519 |
| Lib | Libra | 天秤座 | 2538 |
| Lup | Lupus | 豺狼座 | 2644 |
| Lyn | Lynx | 天猫座 | 2665 |
| Lyr | Lyra | 天琴座 | 2671 |
| Men | Mensa | 山案座 | 2836 |
| Mic | Microscopium | 显微镜座 | 2867 |
| Mon | Monoceros | 麒麟座 | 2929 |
| Mus | Musca | 苍蝇座 | 2986 |
| Nor | Norma | 矩尺座 | 3089 |
| Oct | Octans | 南极座 | 3146 |
| Oph | Ophiuchus | 蛇夫座 | 3182 |
| Ori | Orion | 猎户座 | 3200 |
| Pav | Pavo | 孔雀座 | 3281 |
| Peg | Pegasus | 飞马座 | 3282 |
| Per | Perseus | 英仙座 | 3296 |
| Phe | Phoenix | 凤凰座 | 3322 |
| Pic | Pictor | 绘架座 | 3328 |
| Psc | Pisces | 双鱼座 | 3333 |
| PsA | Piscis Austrinus | 南鱼座 | 3336 |
| Pup | Puppis | 船尾座 | 3441 |
| Pyx | Pyxis | 罗盘座 | 3448 |
| Ret | Reticulum | 网罟座 | 3544 |
| Sge | Sagitta | 天箭座 | 3667 |
| Sgr | Sagittarius | 人马座 | 3668 |
| Sco | Scorpius | 天蝎座 | 3745 |
| Scl | Sculptor | 玉夫座 | 3749 |
| Sct | Scutum | 盾牌座 | 3756 |
| Ser | Serpens | 巨蛇座 | 3777 |
| Sex | Sextans | 六分仪座 | 3787 |
| Tau | Taurus | 金牛座 | 4012 |
| Tel | Telescopium | 望远镜座 | 4023 |
| Tri | Triangulum | 三角座 | 4091 |
| TrA | Triangulum Australe | 南三角座 | 4092 |
| Tuc | Tucana | 杜鹃座 | 4113 |
| UMa | Ursa Major | 大熊座 | 4176 |
| UMi | Ursa Minor | 小熊座 | 4180 |
| Vel | Vela | 船帆座 | 4208 |
| Vir | Virgo | 室女座 | 4232 |
| Vol | Volans | 飞鱼座 | 4246 |
| Vul | Vulpecula | 狐狸座 | 4255 |

## Variant choices
- `Sco`: **天蝎座**, simplified-script choice; **天蠍座** is a traditional variant. HK Space Museum itself writes 天蝎座.
- `Pyx`: **罗盘座**, traditional 羅盤座; retain the conventional astronomy name rather than 指南针座. `Cir` is **圆规座**, a different constellation.
- `Pup`: **船尾座**, distinct from `Car` 船底座 and `Vel` 船帆座.
- `Ser`: **巨蛇座**, distinct from `Oph` 蛇夫座, `Hya` 长蛇座 and `Hyi` 水蛇座. The IAU treats Serpens Caput/Cauda as two regions of one constellation with one ID `Ser`.
- `TrA`: **南三角座**; `Tri` remains 三角座. Preserve mixed-case `TrA` and the nominative `Triangulum Australe`.
- Other conventional astronomy choices: **宝瓶座** (Aqr), **人马座** (Sgr), **室女座** (Vir), **剑鱼座** (Dor), **玉夫座** (Scl), **蝘蜓座** (Cha), **印第安座** (Ind), **天秤座** (Lib), **后发座** (Com). These match both astronomy sources rather than horoscope labels or literal retranslations.

## Sources and code-data notice provenance
### Kept
- **Chinese Astronomical Society, 天文学名词 / Glossary of Astronomical Terms, “分类浏览：星座”**. Hosted by 国家天文科学数据中心 (NADC), 中国科学院国家天文台. URL: https://nadc.china-vo.org/astrodict/dictbrowseresult?tag=%E6%98%9F%E5%BA%A7 . Primary source of every simplified-Chinese string; exact linked records identified above.
- **中国天文学会天文学名词审定委员会, “名词委简介”**. URL: https://nadc.china-vo.org/astrodict/article/introduction . Establishes the committee/database provenance.
- **中国天文学会天文学名词审定委员会, “‘英汉天文学名词数据库’开放使用约定”**. URL: https://nadc.china-vo.org/astrodict/article/download . Article dated 2021-01-15, agreement signed 2008-08-25, download page identifies current version `r241020`. Database ownership belongs to 中国天文学会; the committee compiles and maintains it. Clauses permit free downloading, integration, secondary development and format conversion; prohibit unauthorized for-profit commercial use, modification of database contents, and republication after integration with other dictionary products. Suggested credit: **“‘英汉天文学名词数据库’由中国天文学会天文学名词审定委员会提供。”**
- **罗盘座 (Pyxis), term 3448**. URL: https://nadc.china-vo.org/astrodict/termdetails?id=3448 . The individual record explicitly shows `Pyx`, 罗盘座, Taiwan name 羅盤座, status **已出版**, last revision **2010-04-15**, and bases: (1) 《英汉天文学名词》李竞、许邦信主编，上海科技教育出版社，2000; (2) 《天文学名词（定义版）》科学出版社，2001; (3) 《英汉天文学名词》，中国科学技术出版社，2015. This is an exact inspected example of publication provenance; the category table supports all 88 strings.
- **Hong Kong Space Museum / 香港太空館, Leisure and Cultural Services Department / 康樂及文化事務署, “西方星座中英對照表”, “星座與神話” teacher resources**. URL: https://hk.space.museum/tc/web/spm/resources/teachers-corner/constellations-and-myths/glossary-of-western-constellations.html . Full independent 88-row institution-published Chinese/Latin table. No publication/update date appeared in fetched article content.
- **International Astronomical Union, “The Constellations”, sections “The 88 IAU Constellations”, “Constellation Names”, “Charts”**. URL: https://www.iau.org/IAU/IAU/Astronomy-FAQs/Constellations.aspx?hkey=bb9dc841-0618-41b5-ac70-149741062141 . Official authority for all 88 names and abbreviations. Its CC-BY-4.0 statement refers to chart images, not a license grant for NADC data.
- **Stellarium team, Modern skyculture**, existing local provenance: https://github.com/Stellarium/stellarium/blob/d4a1322b6a81bf15dc4ef65c267b2fc846c5f3ca/skycultures/modern/index.json ; license declaration https://github.com/Stellarium/stellarium/blob/d4a1322b6a81bf15dc4ef65c267b2fc846c5f3ca/skycultures/modern/description.md#license . Preserve the JSON's existing `author`, `source`, `license`, `licenseUrl`, `licenseDeclaration`, geometry and English names. Chinese-name attribution is separate from its CC-BY-SA-4.0 geometry provenance.

### Dropped
- Beijing Planetarium general exhibit pages — institutional but did not provide a complete bilingual name list.
- Personal list on sunguoyou.lamost.org — complete but stronger institutional sources cover the task.
- Wikipedia, Baidu Baike, document aggregators and astrology/English-reading sites — redundant secondary sources.

## Gaps / residual risks
Individual publication/status fields were inspected for Pyxis, not separately for all 88 records; the mapping is supported by the complete NADC category and museum tables, and should be described as established astronomy names rather than blanket “2024 newly approved terms”. NADC's database usage agreement is separate from Stellarium's license; cite it separately rather than assigning the added dictionary-derived data the geometry's license. Manual source/file cross-match is complete; no executable tests, git operations or project edits were performed.