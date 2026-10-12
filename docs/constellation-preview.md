# 星座连线

Stars Above 默认启用 0.12 透明度的星座交互。独立 SVG 辅助层在 hover 或点击固定时显示连线，未交互时保持纯星空。`constellationPreview=0.08`、`constellationPreview=0.12` 可用于两档对照，`constellationPreview=0` 用于关闭辅助层的基准测试。

## 数据

来源为 Stellarium Modern skyculture，固定版本：

`https://github.com/Stellarium/stellarium/blob/d4a1322b6a81bf15dc4ef65c267b2fc846c5f3ca/skycultures/modern/index.json`

| 星座 | 连线 | 不重复 HIP 端点 |
|---|---:|---:|
| Orion / 猎户座 | 24 | 21 |
| Scorpius / 天蝎座 | 12 | 13 |
| Cygnus / 天鹅座 | 9 | 10 |
| Cassiopeia / 仙后座 | 4 | 5 |
| Ursa Major / 大熊座 | 19 | 18 |

全部 88 个星座共 695 条线、710 个不重复 HIP 端点；表中列出五个常用对照场景。HIP 30665、33165 不在当前星表的 6.5 星等范围内，不补点或补线。各源 polyline 仅展开相邻顶点，不在不同 polyline 之间添加线段。

`public/data/constellation-membership.json` 按 HYG v4.1 的 `con` 字段归属现有全部 8,920 颗恒星。可见成员星均可触发对应星座，包括没有中英文名字、不在连接图顶点中的星星；只有当前存在可见线段的星座参与命中测试。

作者为 Stellarium's team。该源的 `description.md` 明确声明 “Text and data: CC BY-SA 4.0”。分发的数据、来源、许可链接及修改说明位于 `public/data/constellation-lines.json` 与 `public/data/constellation-lines.NOTICE.md`；适配数据按 CC BY-SA 4.0 发布。连接图形是 Stellarium Modern 的星座示意，IAU 标准定义星座区域而不是唯一连线图形。

Stellarium 与 KStars 将星座连线、名称、边界和图像分为辅助图层。本实现保持相同的独立图层原则，恒星与原有中英文名字是主视觉。

## 绘制与触发

- 冷灰蓝 `#94a3b8`，线宽 0.6 CSS px，透明度 0.08 或 0.12。
- 端点直接复用当前 `drawSky` 返回的真实投影；只有实际绘出的恒星参与查找。
- 端点在地平线下、被星等限制移除、视场外或投影无效时，该段不绘制。
- 桌面持续 hover 可见成员星 200ms 后浮现对应星座；离开后淡出。命名亮星保持原有星名交互。
- 点击仅对星等 ≤ 3 且有已核实中英文专名的可见亮星生效。手机和键盘沿用同一门槛；较暗或无专名的成员星仅支持桌面 hover，不增加 HIP/HYG 标签或点击入口。
- 点击亮星固定星名和所属星座连线；不同星座逐个累积，同一星座不重复叠加。
- 再次点击只移除该星名。只要仍有任何固定星名，已累积的星座连线继续保留；最后一个固定星名取消时全部清除，驻留指针不会立即恢复刚清掉的预览。
- 点击空白保留选择；Clear names、页脚清空及 Escape 同时清除星名和固定连线。
- 固定星座可以多个，临时 hover 星座最多一个，均使用同一透明度。
- 淡入淡出 220ms，reduced motion 下直接切换。图层 `pointer-events: none`。
- 方向切换清空选择；时间、地点、光污染及视口变化清除临时 hover，固定连线依据当前可见星点重新投影。可见固定星名全部消失时，固定连线随之清除。
- 连线交互不调用 Astronomy Engine，不改变恒星数量、星等 alpha、B−V 颜色和亮星光晕。

## 本地场景

所有场景使用复旦默认坐标。成对截图的主题、UTC、方向、光污染、viewport 与 DPR 完全一致；使用 reduced motion 排除流星干扰。

| 星座 | UTC | 方向 | 建议交互恒星 |
|---|---|---|---|
| Orion | 2026-01-15T14:00:00Z | south | Rigel，参宿七 |
| Scorpius | 2026-06-15T16:00:00Z | south | Antares，心宿二 |
| Cygnus | 2026-07-15T14:00:00Z | east | Deneb，天津四 |
| Cassiopeia | 2026-09-15T15:00:00Z | north | Cih |
| Ursa Major | 2026-04-15T13:00:00Z | north | Alioth |

猎户座预览：

- `http://127.0.0.1:3001/stars-above/?skyUtc=2026-01-15T14:00:00Z&facing=south&constellationPreview=0.08`
- `http://127.0.0.1:3001/stars-above/?skyUtc=2026-01-15T14:00:00Z&facing=south&constellationPreview=0.12`

预览链接使用观测地点的真实 VIIRS 光污染数据，不覆盖 Bortle 或极限星等。自然可见的线段取决于位置、时刻、光污染和视场，部分图形会缺段。

数据可用 `python3 scripts/update_constellation_data.py path/to/stellarium-modern-index.json path/to/hygdata_v41.csv` 更新；星表及天文计算不变。

## 浏览器验证

```bash
playwright-cli -s=constellations open 'http://127.0.0.1:3001/stars-above/?screenshots=1'
playwright-cli -s=constellations --raw run-code --filename=scripts/capture_constellation_preview.cjs
```

脚本涵盖五个星座在 1440×900 与 390×844 下的纯星空、0.08、0.12，共 30 组严格同条件对照，以及正常动效下的 hover 意图延迟、快速切换、视口变化和星等裁剪。截图保存到 `.cache/campfire-log/`。

`scripts/test_constellation_hover.cjs` 使用真实 VIIRS 数据验证桌面和手机、常规与 reduced motion：全部可见成员星 hover、点击门槛、多个固定星座、同星座去重、逐个取消星名、最后一个星名清空、驻留指针、点击空白、清空按钮、Escape、键盘、视口调整及篝火交互。
