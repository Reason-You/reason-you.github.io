> 历史记录。现行星轨说明见[时间旅行](../../star-trails.md)，最终验证见[2026年11月15日记录](../../verification/2026-11-15/README.md)。

交互与流畅度检查，2026-11-15。项目源码保持原样，测试脚本和记录位于.cache/star-trails-qa/。

当前存在明确掉帧，最高优先级是留影拖动时的历史路径重建。

测试环境为Apple M4、Chrome157，原生requestAnimationFrame基线约100fps。桌面1280×900、DPR2；触摸模拟390×844、DPR3。Grid和篝火开启。性能测试使用真实时钟；skyUtc仅固定天文时刻。密集拖动压力测试逐帧分发PointerEvent，实际鼠标和完整CDP触摸另做确认。

| 场景 | 留影拖动帧率 | 95分位帧间隔 |
|---|---:|---:|
| 复旦整夜留影，实际鼠标确认 | 100fps | 11.4ms |
| NamibRand密集星空，约9小时曝光 | 47fps | 30.1ms |
| 8920星、15小时极夜历史上限 | 30fps | 40.6ms |
| 手机尺寸密集星空，触摸模拟 | 63fps | 21.5ms |

1. P1，留影拖动有持续掉帧。[star-trails.ts](/Users/cosmicskewer/Documents/reason-you.github.io/src/lib/sky/star-trails.ts:280)在相机变化时清空路径缓存，重新遍历全部星表和历史切片。上限为8920星×90片，每个新视角生成约23万段可见轨迹。密集留影转向耗时约24–28ms；15小时上限转向约37–47ms，resize出现约50ms帧。优先减少换视角时的全量几何重建。

2. P2，减弱动态模式入口存在51–64ms长任务。[LookUpSky.tsx](/Users/cosmicskewer/Documents/reason-you.github.io/src/components/sky/LookUpSky.tsx:379)在同一JS任务里画20次完整星空，浏览器呈现最后一帧。天色历史仍需逐步记录，星空绘制可收至最终帧。

3. P2，部分新升起的星与星座连线错位。复旦起点2026-01-15T13:00Z，前进2小时后看East，Denebola留影星头在589.368,496.223，实际Leo线端点在589.685,501.768，缺口5.554px。初始大气折射随小圆旋转，fresh星座顶点采用当前折射，造成两个位置来源不同。[ConstellationPreview.tsx](/Users/cosmicskewer/Documents/reason-you.github.io/src/components/sky/ConstellationPreview.tsx:42)使用fresh顶点，[LookUpSky.tsx](/Users/cosmicskewer/Documents/reason-you.github.io/src/components/sky/LookUpSky.tsx:490)使用留影锚点。[截图](/Users/cosmicskewer/Documents/reason-you.github.io/.cache/star-trails-qa/audit-constellation-gap.png)。

4. P2，白天尾部有空间亮度分档。复旦2026-01-15T04:00Z曝光19分钟，实际Canvas stroke alpha分为0.30与0.75两档，约2.5倍明暗差。[star-trails.ts](/Users/cosmicskewer/Documents/reason-you.github.io/src/lib/sky/star-trails.ts:240)的current固定满亮，已闭片按年龄衰减。弧线交界几何连续，亮度呈分段变化。

5. P2，右键按播放也启动快进，已实际复现。[TrailControls.tsx](/Users/cosmicskewer/Documents/reason-you.github.io/src/components/sky/TrailControls.tsx:52)未筛主指针与左键。

6. P2，方向按钮下一跳与当前显示方向不协调。从North拖到约266°，按钮显示Facing West，再点方向跳到East。[SkyDirection.tsx](/Users/cosmicskewer/Documents/reason-you.github.io/src/components/sky/SkyDirection.tsx:58)按上次preset推进，按钮文字按实际视角计算。

7. P3，隐藏流星仍绘制。[MeteorBackground.tsx](/Users/cosmicskewer/Documents/reason-you.github.io/src/components/ui/MeteorBackground.tsx:87)的RAF在快进时持续清画布和绘图，CSS仅隐藏该层。9秒快进记录901次隐藏层重画。

8. P3，静止淡出仍重复投影整球星头和绘制Grid。[LookUpSky.tsx](/Users/cosmicskewer/Documents/reason-you.github.io/src/components/sky/LookUpSky.tsx:172)每次构建同样的端点Map；Grid在1.9秒静止淡出中重画191次。这组开销低于留影路径重建，可按未变化的相机及方向数据复用。

通过的检查：120项单元测试、lint、全方向同期星轨覆盖、星头与自身轨迹对齐、原松手起点20秒保留加4秒淡出、淡出中拖动/切方向/复位/resize/主题变化、键盘启动与键盘焦点移出停止、CDP触摸取消、天顶拖动与有限坐标、蓝色焦点框消除。页面未记录JS异常。

在合成压力路径中各记录一次110ms和180ms孤立帧间隔，均未对应JS长任务；实际鼠标确认最高12ms，完整CDP触摸确认最高12.1ms。这两次孤立间隔未归为稳定产品缺陷。真实窗口失焦未被自动化触发，未覆盖实体手机与Safari。

完整数据：[smoothness-audit-results.json](/Users/cosmicskewer/Documents/reason-you.github.io/.cache/star-trails-qa/smoothness-audit-results.json)。
