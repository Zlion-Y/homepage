# 字体

站名手写体，全部来自 [Google Fonts](https://fonts.google.com/)，采用
[SIL Open Font License 1.1](https://openfontlicense.org/)，可自由使用、修改与随项目分发。

均已按 ASCII + Latin-1 扩展 + 常用标点子集化（保留全部连笔 OpenType 特性），
配合 `src/config.js` 的 `siteFont` 配置项一键切换（可选项见 `src/fonts.js`）：

| 文件 | 字体 | 大小 | 风格 |
|---|---|---|---|
| `Pacifico-Regular.ttf` | Pacifico（默认） | 84KB | 圆润复古手写 |
| `DancingScript.ttf` | Dancing Script | 84KB | 优雅拉丁书法（可变字重） |
| `GreatVibes.ttf` | Great Vibes | 108KB | 铜版体、花饰最多 |
| `Lobster.ttf` | Lobster | 101KB | 复古粗体连字 |
| `KaushanScript.ttf` | Kaushan Script | 99KB | 笔刷手写、有动感 |
| `Sacramento.ttf` | Sacramento | 43KB | 细单线连笔、最轻盈 |
| `Caveat.ttf` | Caveat | 164KB | 随性铅笔手写（可变字重） |

注：`index.html` 不再静态预加载字体，`src/main.js` 会按当前配置动态注入 preload。

2026-09 修复记录：最初的 `Pacifico-Regular.ttf` 只裁了 30 个字符，缺大写 M 等字母，
导致站名首字母回退成无衬线体，后用完整版重新子集化。
