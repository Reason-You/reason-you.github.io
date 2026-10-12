# Stellarium Modern constellation line data

Author: Stellarium's team.

Source: https://github.com/Stellarium/stellarium/blob/d4a1322b6a81bf15dc4ef65c267b2fc846c5f3ca/skycultures/modern/index.json

The source's data license declaration is in https://github.com/Stellarium/stellarium/blob/d4a1322b6a81bf15dc4ef65c267b2fc846c5f3ca/skycultures/modern/description.md#license : “Text and data: CC BY-SA 4.0”.

The adapted dataset `constellation-lines.json` is licensed under Creative Commons Attribution-ShareAlike 4.0 International: https://creativecommons.org/licenses/by-sa/4.0/ . Legal code: https://creativecommons.org/licenses/by-sa/4.0/legalcode.en .

Modifications: extracted all 88 constellation figures; expanded consecutive HIP vertices in each source polyline into normalized undirected segment pairs. Separate polylines remain separate. No artwork or constellation boundaries are included.

The companion `constellation-membership.json` groups the existing 8,920 HYG v4.1 stars by the catalog's `con` field. Source: https://github.com/astronexus/HYG-Database/blob/main/hyg/CURRENT/hygdata_v41.csv . Membership data is adapted under CC BY-SA 4.0, separately from the website's code license, and does not change the star catalog or its rendering. See `DATA_LICENSE.md` for HYG attribution.

These are Stellarium Modern stick figures. The IAU standardizes constellation areas and names, not a unique connecting-line figure. This dataset's license is distinct from the website's code license and the HYG star catalog's license.
