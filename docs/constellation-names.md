# 星座名称

`src/lib/sky/constellation-names.ts` 使用 IAU 三字母 ID，覆盖全部 88 个现代星座。英文逐项对应当前 Stellarium Modern 的拉丁名称，包括 Boötes；现有连线、星表和成员关系数据保持不变。

## 中文来源

- 中国天文学会天文学名词审定委员会，国家天文科学数据中心托管的[「分类浏览：星座」](https://nadc.china-vo.org/astrodict/dictbrowseresult?tag=%E6%98%9F%E5%BA%A7)。现代 88 项名称与[香港太空馆「西方星座中英对照表」](https://hk.space.museum/tc/web/spm/resources/teachers-corner/constellations-and-myths/glossary-of-western-constellations.html)一致。
- [IAU The Constellations](https://www.iau.org/IAU/IAU/Astronomy-FAQs/Constellations.aspx?hkey=bb9dc841-0618-41b5-ac70-149741062141)提供现代 88 项正式拉丁名称和缩写。
- 「英汉天文学名词数据库」由中国天文学会天文学名词审定委员会提供；[开放使用约定](https://nadc.china-vo.org/astrodict/article/download)与 Stellarium 连线数据的 CC BY-SA 4.0 许可分别适用。

采用大陆天文学通行简体名称：宝瓶座、人马座、室女座、罗盘座、蝘蜓座、剑鱼座、玉夫座、天秤座。天蝎座对应繁体天蠍座；巨蛇座是 Serpens，区别于蛇夫座、长蛇座和水蛇座；船尾座、船底座、船帆座分别对应 Puppis、Carina、Vela；南三角座对应 TrA，三角座对应 Tri。

## 显示与避让

默认连线透明度为桌面 0.12、手机 0.20。持续 hover 200ms 后，星座名称与轮廓出现。名称最多一个，优先对应当前 hover；无 hover 时，对应最近点击固定且仍有可见轮廓的星名所属星座。取消该星名或轮廓被裁剪后，回退到剩余可见固定星座。

名称使用两行 12px 中文、10px 英文，不带背景、边框、引导线或光晕。深浅色分别采用克制的灰蓝色。

定位以正在探索的真实可见成员星为锚，结合邻近线段、端点与轮廓中心生成候选位置。成员星位于连接轮廓之外时，名称靠近该真实成员星。按实际 DOM 测量尺寸避让全部恒星标签、控件、提示、篝火、展开的 Campfire Log，以及主要亮星。安全间隔为 10 CSS px，视口内边距为 12px；名称矩形距成员星或轮廓不超过 40px，中心距探索锚不超过 120px。合格候选在距离和穿线数量间选择，仍安全且足够近的旧位置保持不变。没有合适位置时隐藏名称，保留恒星标签和连线。

恒星标签在最终布局完成后发送局部通知；名称组件监听相关 DOM 变动和尺寸变化。布局变动先隐藏名称，再在绘制前检查位置。透明度动画不触发重复测量，不使用持续测量循环，不重算天文快照或重绘恒星 Canvas。
