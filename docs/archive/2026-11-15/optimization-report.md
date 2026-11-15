> 历史记录。现行星轨说明见[时间旅行](../../star-trails.md)，最终验证见[2026年11月15日记录](../../verification/2026-11-15/README.md)。

# 星空性能与提示验证

本机Apple M4、Chrome157，桌面1280×900、DPR2。帧率采用原生RAF与performance.now；Grid和篝火开启。

| 留影拖动场景 | 优化前 | 当前 | 当前95%绘制耗时 |
|---|---:|---:|---:|
| NamibRand约9小时密集星轨 | 47.1fps | 89.3fps | 10.9ms |
| 极夜15小时密集星轨 | 30.1fps | 约60fps（两轮58.5–61.8） | 16.8–17.3ms |
| NamibRand手机视口390×844、DPR3 | 63.3fps | 100.0fps | 8.4ms |

手机视口在本机浏览器模拟。三组拖动均无超过50ms的帧间隔或long task。长按快进约100fps。

减少动态效果的静态曝光，主星空绘制从20余次减少为最终1次，本轮无long task。

验证：
- 129项sky单元测试通过；最终缓存结构改动后43项几何与TrailBuffer测试通过。
- ESLint、TypeScript和最终生产构建通过。
- 8组提示浏览器用例通过：文字关闭、自动退场、快速连点、学习记录、会话重入、前后台、触控与减少动态效果。
- 桌面、触控与减少动态效果下，全天球历史、四向转动、星头对齐、窗口尺寸和主题切换、原始20秒保留与4秒淡出全部通过。
- 桌面播放、篝火、棉花糖提示与手机提示已目视检查。

原始数据：performance-delivery-max.json、performance-delivery-dense.json、performance-delivery-mobile.json、performance-reduced.json、full-sky-optimized-report.json。提示截图为hint-*.png。

流星交互：普通观星按流星诞生相机保存方向，使用当前物理相机重投影；拖动、反向拖动、转回北方与resize的独立坐标验证通过。长按、松手留影、拖动和淡出阶段流星持续隐藏，18秒与22秒时绘制次数均保持355次；完整退场后恢复。now、减少动态效果和首页动画均通过。原始记录：meteor-camera-report.json、performance-meteor-final.json。

本地静态预览：http://localhost:3000/stars-above/
