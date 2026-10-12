# Campfire Log

Stars Above 的隐藏发现记录。入口 `Achievements` 始终位于导航下方、天空右上角；浮窗为非模态单列列表。

## 成就配置

配置：`src/lib/achievements/definitions.ts`。

| 条件 | 名称 | 小图标 |
|---|---|---|
| 10 颗 | Cosmic Roaster | 火焰 |
| 20 颗 | Still Hungry? | 餐具 |
| 30 颗 | Ph.D. in Marshmallows | 学位帽 |
| 42 颗 | The Answer Was Marshmallows | 轨道 |
| 64 颗 | 64-bit Sugar Rush | 二进制 |
| 75 颗 | Three Quarters. Still Here? | 扇形 |
| 88 颗 | 88 Constellations, One Campfire | 连结星点 |
| 99 颗 | Just One More. | 加号 |
| 100 颗 | At the End of the Universe | 无限 |
| 一次点火中四个方向各成功吃一颗 | Four Skies, One Campfire | 罗盘 |
| 首次成功吃掉任意星光棉花糖 | A Taste of the Stars | 星光 |
| 首次吃掉稀有亮星光棉花糖并释放火流星 | Make a Wish at the Marshmallowids | 火流星 |

数量在一次 Stars Above 页面访问中累计；熄火、再次点火保留，刷新或离开页面重置。100 颗后继续计数。永久记录与当前访问的数量独立。

## 状态与确认

`src/lib/achievements/session.ts` 的纯 reducer 是数量的唯一权威来源。方向集合在熄火时清空；烤制时长使用当前累计数量的平滑指数曲线，从 2400ms 趋近 800ms，等待、进入和变色同步缩短。吃掉的确认保持 260ms。

原有阶段继续为 `idle → entering → roasting → ready → eating → entering`。只有 eating 的 260ms 确认事件增加数量，确认完成后评估成就。重复点击和重复确认被阶段状态拒绝；熄火取消尚未确认的食用和定时器。方向在点击吃掉时保存，转向发生在动画中途也不改变该次归属。

进入 roasting 时只抽样一次，互斥结果为普通 82%、微弱星光 12%、稀有亮星光 3%、烤焦 3%。累计数量 10、20、30、40、42、64、75、88、99、100 固定为普通；50 可触发特殊结果。烤焦保持局部深棕色与淡烟，不占成就位。

## 通知

首次解锁停留 2.5 秒，之后淡出；采用串行队列。相同确认事件按数量、稀有火流星、四方向、普通星光的顺序排队。首次稀有星光同时解锁两个新成就时，selected discovery 默认选中 Make a Wish at the Marshmallowids。烤焦 ready 提示共用此队列，不授予成就。

星光在确认吃掉后从表面光点的实际屏幕投影位置释放。独立 SVG 图层与背景流星共享亮度基准，不改动天文 Canvas。微弱星光流星为 1.5–2.8 倍、800–1150ms；稀有火流星为 3–10 倍、1200–2000ms，具有更宽的白金色拖尾与柔和余辉。亮度按核心、尾焰及光晕的总发光笔画能量分配，避免高亮端被 alpha 截断。背景流星继续使用原有慢速循环。reduced motion 改为原位短尾星光与淡出。

累计计数 40 时通知静默。此时完成的四方向成就立即记入永久记录，首次通知在第 41 次成功食用后恢复。熄火保留已确认的发现通知，移除当前烤焦提示。已解锁成就不会重复发放。

## 持久化

localStorage 键：`stars-above-achievements-v1`。

```json
{
  "version": 1,
  "unlocked": { "cosmic-roaster": "2026-01-15T13:00:00.000Z" },
  "recentId": "cosmic-roaster"
}
```

只读取已知 ID 和有效首次时间；异常 JSON、未知版本或无效内容恢复为空记录。存储不可用时，当前页面内存记录仍正常工作；永久保存需要浏览器允许 localStorage。

## 浮窗与交互

- 主站界面字体 Inter；标题通过字号、字重区分。
- 桌面宽 370px、最高 440px；手机宽度不超过 viewport − 32px，高度上限为当前天空的 65%。
- 标题与选中发现位于列表上方，长名称自然换行。内容多时列表内部滚动；低高度视口允许整个浮窗内部滚动。
- 每项已解锁发现使用 14px、低对比度 Lucide 线描图标；选中区域使用 18px 图标。未解锁槽位只显示 `???`。
- 关闭按钮、入口再次点击、窗口外 pointerdown 和 Escape 均关闭，并将焦点返回入口。Tab 不被锁在窗口内。
- 窗口内指针事件与滚动不传播至星空命中检测；打开、选择、通知、滚动和解锁均不触发星图重算或改变 Canvas 尺寸。
- 浮窗进出 180ms、位移 3px；reduced motion 下静态切换。

## 验证

```bash
npm run test:sky
npx tsc --noEmit
npm run lint
npm run build
playwright-cli -s=log open 'http://127.0.0.1:3001/stars-above/?screenshots=1'
playwright-cli -s=log --raw run-code --filename=scripts/capture_campfire_log.cjs
```

浏览器脚本使用隔离上下文、受控随机数与浏览器时钟完成真实阶段和计数；截图用隔离的永久记录准备三项及多项解锁状态。截图保存到 `.cache/campfire-log/`。
