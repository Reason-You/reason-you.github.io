# 星空版本验证

本次版本保留现有轨迹长度、累积方式、昼夜衰减和朝向预设循环。相邻轨迹段在交界处共用亮度，段内保留头亮尾淡的层次。流星随物理相机投影，从长按开始至星轨完整淡出期间隐藏并暂停绘制。

## 验证结果

- 132项星空单元测试、ESLint、TypeScript和生产构建通过。
- 桌面、触控与减少动态效果模式下，全天球转向、星头对齐、窗口与主题切换、20秒保留和4秒淡出通过。
- 星轨亮度接缝、短提示、流星随视角移动及退场后恢复已做浏览器验证。
- 本机Apple M4、Chrome157、1280×900、DPR2，密集白天星轨拖动约86至96fps，快进约99fps。原生RAF记录见[performance.json](performance.json)，退场记录见[lifecycle.json](lifecycle.json)。

验收截图：[桌面](desktop.png)、[手机视口](mobile.png)。手机截图与触控测试由桌面浏览器模拟。

## 浏览器复测

在项目根目录启动本地预览，并创建输出目录：

```sh
python3 -m http.server 3000 --bind 127.0.0.1 --directory out
```

在另一终端使用Playwright CLI：

```sh
mkdir -p .cache/sky-verification
playwright-cli -s=sky open http://localhost:3000/stars-above/
playwright-cli -s=sky --raw run-code --filename=scripts/test_trail_lifecycle_browser.cjs
```

可复用脚本：

| 文件 | 用途 |
|---|---|
| `scripts/test_trail_lifecycle_browser.cjs` | 全天球转向、星头对齐和20秒加4秒退场 |
| `scripts/test_trail_seams_desktop.cjs` | 桌面亮度接缝、原有亮度层次与短尾 |
| `scripts/test_trail_seams_mobile.cjs` | 手机视口的亮度接缝 |
| `scripts/test_sky_hints_browser.cjs` | 短提示、关闭、会话与学习记录 |
| `scripts/test_meteor_camera_browser.cjs` | 流星投影、星轨期间暂停及恢复 |
| `scripts/benchmark_trails_day.cjs` | 密集白天星轨的原生RAF性能 |
| `scripts/benchmark_trails_night.cjs` | 15小时密集极夜星轨的原生RAF性能 |

脚本使用浏览器已打开页面的站点地址，空白页回落到本地3000端口。复测线上版本时先打开线上站点。截图输出到可清理的`.cache/sky-verification/`。光污染、HYG与Stellarium原始资料继续保留在各自的数据缓存目录。
