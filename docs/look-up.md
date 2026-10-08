# Look Up

独立路由 `/look-up/`。导航顺序为 Home · Research · CV · Look Up。
本地原型保留现有 Navigation、Footer、主题和主页星空/流星行为。

篝火、观测时间与入场过渡见 [look-up-campfire.md](look-up-campfire.md)。

## 页面与相机

- Look Up 在固定导航下方与 Footer 上方使用全部剩余空间；仅此路由采用
  `100dvh` flex 布局，其他页面保留原有 `main` 高度。
- 方位角 180°，中心高度角 47.5°。桌面水平视场 100°；宽度小于 640 CSS px
  时垂直视场 75°，水平视场根据容器宽高比计算。
- 共用 Astronomy Engine、HYG v4.1、VIIRS、Sky Store 和 URL 时间/位置覆盖。
  Look Up 绘制一张完整 Canvas（流星层位于其后），主页保留淡星空与流星
  两层 Canvas。Look Up 的流星回收线放宽到约 90% 视口高，覆盖整扇天空。
- 星点大小、B−V 配色和白天可见性沿用现有映射；Look Up 去除主页的垂直渐隐，
  透明度提高 15%，最大 0.96。地点的极限星等在桌面与手机上相同。

## 名称与交互

| 统计对象 | 数量 |
|---|---:|
| HYG 中 mag ≤ 3.0 的条目 | 179 |
| 其中有英文专名的条目 | 145 |
| 核实中文对应关系的条目 | 145 |

条目以 HYG ID 关联，不使用坐标近邻或英文名称猜测。HIP、HD、拜耳标识、
出处和证据保存在 `src/lib/sky/star-names-data.json`；来源说明见
[sky-star-names.md](sky-star-names.md)。Castor 与南门二的 A/B 分量分别保留。

只有通过当前星等过滤并位于可见视场的已核实名星参与交互。鼠标命中半径
16 CSS px，触控/笔输入 28 CSS px；选择最近星点，几乎重合的分量优先亮星。
默认无标签；hover 临时预览，click/tap 固定。名字**累积显示**：连续点击
多颗星会同时保留多个名字，再点已有名字的星单独移除它；页脚在 Look Up
提供 Clear star names 一键清空（有名字时出现），Escape 在焦点位于星空
内时等效。空白处点击不清除。手机与电脑一致。换地点/时间导致某星离开
视场时，仅收走该星的标签；标签状态在离开并返回 Look Up 后保留。
DOM 标签显示中文与英文两行，180 ms 淡入淡出，限制在天空内。
Tab、Enter/Space 与 Escape 提供键盘探索与关闭功能。

## 场景验证

截图原尺寸为桌面 1280 × 720、手机 390 × 844。每个场景包含未选择与已选择两张，
共 12 张。截图目录：`.cache/look-up-preview/`。

| 场景 | UTC | 位置 | 已选择恒星 |
|---|---|---|---|
| A 复旦冬夜 | 2026-01-15 13:00 | 31.2989° N, 121.5035° E | 参宿四 / Betelgeuse |
| B 复旦夏夜 | 2026-07-15 13:00 | 31.2989° N, 121.5035° E | 心宿二 / Antares |
| C NamibRand | 2026-05-15 20:00 | 24.77° S, 15.96° E | 十字架二 / Acrux |

| 场景 | VIIRS 极限星等 | 桌面绘制 / 可交互 | 手机绘制 / 可交互 |
|---|---:|---:|---:|
| A | 4.1463 | 87 / 23 | 69 / 18 |
| B | 4.1463 | 80 / 28 | 67 / 22 |
| C | 7.7000 | 1,630 / 20 | 971 / 11 |

桌面天空尺寸为 1280 × 575，手机为 390 × 667。手机水平视场为 48.33°；
视场差异决定星点数量差异。

| 已选择恒星 | 高度角 | 方位角 |
|---|---:|---:|
| Betelgeuse | 60.9914° | 141.7009° |
| Antares | 32.2010° | 182.2624° |
| Acrux | 51.5018° | 181.8080° |

验证使用本机 Chromium，手机场景开启移动视口、触控与 2× DPR，截图按 CSS
像素保存。验证覆盖 hover、固定、切换、同星关闭、空白关闭、Nav/Footer 隔离、
边缘标签、键盘、时间变化后的自动关闭、Use my sky/复旦切换、主题切换与路由往返。
浏览器记录为零页面异常；60 个空闲显示帧中为零天空重绘。

本机六个场景中，天文计算约 0.5–5.5 ms，单次绘制约 0.2–1.9 ms。
第一阶段构建报告 `/look-up` 路由自身为 10.9 kB，First Load JS 为 338 kB。
完整数值记录：`.cache/look-up-preview/browser-report.json`。

构建、Lint、TypeScript 和 10 项单元测试通过。单元测试包含独立恒星时/地平坐标
近似方程核对、相机正交基与透视尺度、名称身份、光污染过滤、首页渐隐保留、
白天设定、命中与标签状态机、四边定位。

## 本地预览与复现

```sh
npm run build
npm run lint
npx tsc --noEmit
npm run test:sky

# 在一个终端运行静态预览
python3 -m http.server 3001 --bind 127.0.0.1 --directory out

# 在另一个终端运行浏览器验证与截图
mkdir -p .cache/look-up-preview
playwright-cli -s=look-up open http://127.0.0.1:3001/look-up/
playwright-cli -s=look-up --raw run-code --filename=scripts/capture_look_up.cjs
```

场景 URL：

- [A](http://127.0.0.1:3001/look-up/?lat=31.2989&lon=121.5035&skyUtc=2026-01-15T13:00:00Z)
- [B](http://127.0.0.1:3001/look-up/?lat=31.2989&lon=121.5035&skyUtc=2026-07-15T13:00:00Z)
- [C](http://127.0.0.1:3001/look-up/?lat=-24.77&lon=15.96&skyUtc=2026-05-15T20:00:00Z)

截图文件名为 `{A-winter|B-summer|C-namibrand}-{desktop|mobile}-{blank|selected}.png`。
`?skydebug=1` 提供复用的 `window.__sky` 检查接口。

## 视场与数据范围

手机纵向窗口优先展示猎户座；完整冬季大三角位于桌面宽视场中。
现有 HYG 子集保留至 6.5 等，因此 NamibRand 的 7.7 等 VIIRS 极限仍以现有
星表范围绘制。A/B 中文后缀表示系统分量，传统中文名称本身属于星系统。

当前交付为本地原型；部署等待确认。
