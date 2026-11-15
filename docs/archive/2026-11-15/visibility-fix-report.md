> 历史记录。现行星轨说明见[时间旅行](../../star-trails.md)，最终验证见[2026年11月15日记录](../../verification/2026-11-15/README.md)。

> 状态：历史方案。现行版本采用原有昼夜衰减规则与局部亮度渐变。

# 星轨昼夜保留验证

复旦观测地，连续从2026年11月15日19:57快进到次日10:49。桌面与手机视口均保留14小时52分钟的历史长弧。所有曝光区间统一使用当前天色亮度，白天描边透明度0.30、深夜0.75，比例40%。

- 桌面可见轨迹7013段，手机4258段，当前片和历史片的亮度完全一致。
- 740个快进绘制帧覆盖夜晚、日出和白天，每帧仅有一种轨迹透明度，范围0.30至0.75；相邻帧最大变化0.037，无历史分段亮度台阶。
- 15小时窗口最老片的起点随截止时间连续前进，未改变的历史路径继续复用。
- HYG42015地平线交点误差小于0.000001px，真实曲线细采样仍符合0.18px目标。
- 132项单元测试、ESLint、TypeScript及生产构建通过。
- 桌面、触控、减少动态效果均通过全天球转向、轨迹端点对齐、窗口与主题切换、20秒完整保留和4秒淡出验证。
- 本机Apple M4、Chrome157、1280×900、DPR2，原生RAF测试：超过15小时持续快进100fps，最密集极夜留影拖动58.8fps（Grid开启）及62.7fps（Grid关闭）。

原始记录：visibility-desktop.json、visibility-mobile.json、visibility-twilight.json、visibility-lifecycle.json、visibility-performance.json。

截图：day-full-trails-fixed.png、day-full-trails-mobile.png。
