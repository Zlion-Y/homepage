# zlion-home

**🔗 在线访问：[www.zlion.top](https://www.zlion.top)**

参考 [imsyy/home](https://github.com/imsyy/home) 风格编写的个人主页，使用 **Vue 3 + Vite** 构建，开箱即用，零配置部署到 Vercel。

![zlion-home 主页效果：壁纸背景 + 毛玻璃卡片](./docs/preview.webp)

已收录的站点：

- 博客：[blog.zlion.top](https://blog.zlion.top/)
- 资源站：[alist.zlion.top](https://alist.zlion.top/)

## 功能

- 载入动画、极光渐变背景（随昼夜时段自动变色，支持自定义背景图）
- 按时段问候语、打字机轮换标语（超长自动滚动、光标跟随闪烁）
- 一言（Hitokoto API，失败自动兜底本地语句，点击卡片即可换一句）
- 实时时钟与日期（农历 + 节日倒数）
- 实时天气长卡（uapis 聚合接口：免 Key、自动定位到县级、湿度/体感/AQI、未来几天高低温双曲线，可固定城市）
- 网站列表（一行 3 个紧凑卡片，在 config.js 里加站点自动扩展）
- 博客更新卡（自动拉取博客 RSS 展示最新 3 篇文章，卡头含 GitHub / 邮箱等社交图标）
- 二级「探索更多」面板（点击左上角 Logo 进入）：
  - 每日新闻（60s API，自动更新）
  - 多平台热榜（微博/B站/V2EX/IT之家/知乎/掘金等，平台与顺序可配置）
  - 音乐播放器（网易云歌单，多源自动切换 + 断链自愈 + 歌词同步，填歌单 ID 启用）
  - Epic 限免（两款游戏完整展示）
  - 程序员历史上的今天
  - 站点监控（实时探测自己各站点的连通状态与响应耗时，访客视角）
  - GitHub 数据卡（可选）
- 页脚建站运行天数
- 自定义圆点光标 + 移动/点击涟漪、卡片悬停 3D 倾斜 + 光泽动效（手感对齐 FluentPlayer 封面）
- 移动端自适应、暗色玻璃拟态风格；所有卡片均可在 config.js 中开关与排序

## 部署

### 平台托管部署（推荐）

参考 [Vercel 官方指南](https://vercel.com/docs/frameworks/frontend/vite) 将本项目部署至 Vercel、Netlify、Cloudflare Pages 等平台。主流平台自动部署，会根据环境自动选择适配器。

框架预设：`Vite`

根目录：`./`

输出目录：`dist`

构建命令：`npm run build`

安装命令：`npm install`

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Zlion-Y/zlion-home&project-name=zlion-home&repository-name=zlion-home)

> 想绑定自己的域名（如 `home.zlion.top`）：在 Vercel 项目设置 → **Domains** 中添加，按提示到域名 DNS 处加一条 CNAME 记录指向 `cname.vercel-dns.com` 即可。

### 本地开发部署

1. **克隆仓库：**

   **先 [Fork](https://github.com/Zlion-Y/zlion-home/fork) 到自己仓库再克隆（推荐），记得先点 Star 再 Fork 哦！**

   ```bash
   git clone https://github.com/you-github-name/zlion-home.git
   cd zlion-home
   ```

2. **安装依赖：**

   ```bash
   npm install
   ```

3. **自定义配置：**

   - 编辑 `src/config.js` 自定义站点设置（站点信息、卡片开关、面板排列、监控站点等）

4. **启动开发服务器：**

   ```bash
   npm run dev
   ```

   页面将在 `http://localhost:5173` 可用，修改配置实时热更新。

## 自定义

### 基本信息（最重要）

所有个性化内容集中在 **`src/config.js`**，修改后提交推送即可自动重新部署：

| 配置项 | 说明 |
| --- | --- |
| `siteConfig.siteName` | 左上角站点名称 |
| `siteConfig.logo` | Logo 图标：留空用内置「Z」徽章；填图片路径/URL 替换（载入页、左上角、favicon 同步生效） |
| `siteConfig.greet` | 问候语大标题 |
| `siteConfig.desc` | 一句话介绍（打字机轮换的第一句） |
| `siteConfig.motto` | 打字机轮换标语数组，只留一项则固定显示 |
| `siteConfig.siteStart` | 建站日期，页脚据此显示「已运行 N 天」 |
| `siteConfig.author` | 页脚版权署名 |
| `siteConfig.clickEffect` | 自定义光标 + 涟漪特效开关 |
| `siteConfig.weatherCity` | 天气城市 adcode，留空 = 自动定位 |
| `siteConfig.homeCards` | 主页各卡片开关（greet / blog / hitokoto / clock / weather / siteLinks），`false` 隐藏 |
| `siteConfig.panelCards` | 二级面板卡片排列：数组顺序 = 排列顺序，删掉某项 = 隐藏该卡 |
| `siteConfig.githubUser` | GitHub 卡的用户名（需把 `github` 加入 `panelCards` 才显示） |
| `siteConfig.musicPlaylist` | 音乐卡网易云歌单 ID（需把 `music` 加入 `panelCards` 才显示） |
| `siteConfig.hotPlatforms` | 热榜平台与顺序（weibo / bilibili / v2ex / ithome / hellogithub / zhihu / juejin / sspai 等） |
| `siteConfig.siteMonitors` | 站点监控卡的目标站点列表（`{ name, url }`，需把 `monitor` 加入 `panelCards`） |
| `socialLinks` | 「博客更新」卡里的社交图标（GitHub / 邮箱等，**记得改成自己的**） |
| `siteLinks` | 网站列表卡片 |

社交图标 `icon` 可选：`github` / `mail` / `bilibili` / `telegram` / `qq` / `rss`
网站图标 `icon` 可选：`blog` / `cloud` / `music` / `video` / `code` / `star`

### 音乐播放器

填入网易云歌单 ID（歌单页地址栏 `playlist?id=xxx`）即可启用。播放器特性：

- 多 Meting 源并发竞速拉取歌单，单源故障无感
- 每首歌自动在多个源之间探测可用播放链接，断链/过期自愈
- 全部源失败自动跳下一首，红字提示不打哑巴尬
- 歌单本地缓存 6 小时，进面板秒开；预载但不自动出声，点击播放才响
- 歌词同步滚动居中，点歌词行跳转进度
- 可选用**自建音源代理**解析播放直链（见下）

#### 可选：自建音源代理

公共 Meting 接口对 VIP / 版权受限曲目拿不到可播放直链。若你有自己的服务器，可以跑一个
[zlion-music-api](https://github.com/Zlion-Y/zlion-music-api)——单二进制 Go 程序，只做搜索与取流、
**不中转音频流**（返回各平台 CDN 直链，浏览器直接拉），并能在服务端运行洛雪自定义音源脚本。

代理是独立开源的单二进制程序（[Zlion-Y/zlion-music-api](https://github.com/Zlion-Y/zlion-music-api)），
自带管理页（`/admin`）：可以一次上传**多个**洛雪音源脚本、给每个填远程地址自动更新、一键**并行体检**看谁还能用；
取流时按成绩排序分波下发、赢家一出立刻掐断其余、连续失败自动熔断，所以音源多也不会拖慢或打爆上游。
部署好后在 `config.js` 里改两行即可切换：

```js
musicSource: "proxy",                       // 默认 "meting"
musicProxy: "https://music-api.zlion.top",  // 代理地址，必须 https、不留结尾斜杠，这里只做展示，请替换为自己的代理地址
musicQuality: "320k",                       // 128k / 320k / flac / flac24bit
```

> ⚠️ 地址必须是 **https**：本站是 HTTPS 页面，浏览器会拦掉它去请求 `http://` 资源（Mixed Content），
> 直接填 `http://IP:端口` 调不通，要在外面套一层 TLS（反向代理 + 证书）。

切换后 Meting 候选链**依然并行保留**：代理解析出的直链参与可用性竞速，排在候选链第二位，
当前源一挂立刻换过去；代理没部署或挂掉时，前端会静默退回 Meting，行为与原来完全一致。

### 站点监控卡

`siteMonitors` 里列出你的站点，卡片会用访客浏览器直连探测（与访客能否打开一致），显示绿/红状态与响应耗时，每 60 秒自动刷新。无需任何第三方监控服务。

### 自定义背景

三种方式（`src/config.js` 的 `bgApi`）：

1. **默认**：留空使用动态极光渐变背景
2. **静态图**：把图片命名为 `background.jpg` 放到 `public/images/` 即自动生效（无需改配置，会自动压暗保证文字可读）
3. **随机壁纸 API**：`bgApi` 填接口地址，每次打开页面随机换一张，加载完成后淡入、失败自动回退极光渐变。已实测可用的接口：
   - `https://bing.liushen.fun/api/random?redirect=true`（必应每日壁纸，当前启用）
   - `https://www.dmoe.cc/random.php`、`https://t.alcy.cc/ycy`、`https://api.paugram.com/wall/`（二次元随机）

### 实时天气（可选）

默认使用 [uapis.cn](https://uapis.cn) 聚合天气接口，**无需申请任何 Key**：按访客 IP 自动定位（可精确到县级），显示实况温度、湿度、体感、风向风力、AQI 和未来几天高低温曲线，数据本地缓存 30 分钟。

想固定显示某个城市（不随访客位置变化）：在 `src/config.js` 里把 `weatherCity` 填为该城市的 adcode（[行政区划代码表](https://lbs.amap.com/api/webservice/download)），如 `"410100"` 郑州。

接口不可用时天气卡自动隐藏，其余功能不受影响。

### 浏览器图标

替换 `public/favicon.svg`（Z 字母徽章，可改成任何 SVG）。

## 性能

一个页面里同时有十几张毛玻璃卡片、一张全屏壁纸和一个 410 行的歌单，**GPU 是这个项目最需要盯的资源**。下面是实测确认过的结论（GTX 1650 / 1920×1080，同机空白页底噪约 38%），改动前请先看一眼，避免把已经踩平的坑再踩回去：

- **整屏 `mix-blend-mode` 极贵**。背景那层 5% 的颗粒纹理用了 `overlay` 混合，独占约 8 个 GPU 点——整屏混合层会被逐帧重算，哪怕下面什么都没变。改成普通低透明度叠加后，一级界面 GPU 从 49% 降到 41%。
- **模糊本身不贵，"模糊的背景会变"才贵**。静态壁纸上的 `backdrop-filter`、乃至全屏 44px 模糊叠呼吸动画都几乎不花 GPU（一次栅格化后只剩缩放纹理）；但如果面板背景压在**还在更新**的主页上（时钟每秒、打字机每 35–90ms 改字），整屏模糊就会逐帧重算——二级面板打开时 GPU 从 49% 飙到 73%，根因就在这里。
- **不要在带毛玻璃的容器上做 `opacity` 动画**。Chromium 在透明度动画期间会暂停 `backdrop-filter` 渲染，卡片会"先透底、模糊后到"；进场/退场只能用 `transform`。
- **面板本体不要做位移动画**。面板自带壁纸层，本体一动背景就整块跟着平移。现在是面板静止、背景不透明（复用同一张壁纸 `--bg-src`），只有卡片错峰浮起。
- **长列表要渐进上屏**。410 行歌单一次性渲染 ≈ 5300 个节点、约 100ms 主线程长任务；改成首屏 24 行 + 空闲时间补齐，配合行上 `content-visibility: auto`。注意 `contain-intrinsic-size` 量的是**内容盒**（不含 padding），填成行高会让 `offsetTop` 累积漂移、自动定位偏出上百像素。
- **长文本必须给 `min-width: 0`**。只写 `text-overflow: ellipsis` 不够，外层 flex/grid 链路上任何一环不能收缩，省略号就不生效（典型：`justify-self: start` 让宽度走 fit-content，而下限仍是 nowrap 文本的 min-content）。

## 目录结构

```
zlion-home/
├── docs/
│   └── preview.webp         # README 用的效果图（不进构建产物）
├── public/
│   ├── favicon.svg          # 网站图标
│   └── images/              # 放 background.jpg 可自定义背景
├── src/
│   ├── config.js            # ★ 所有个性化配置（卡片开关/排序也在这里）
│   ├── App.vue              # 页面布局
│   ├── style.css            # 全局样式（颜色变量等）
│   └── components/          # 各功能组件
└── vite.config.js
```

## 致谢

- 布局与功能灵感来自 [imsyy/home](https://github.com/imsyy/home)（MIT License）
- **音乐播放器实现参考 [CuteLeaf/Firefly](https://github.com/CuteLeaf/Firefly) 项目的 MusicManager**（多源降级、链接自愈等核心逻辑照搬自该项目的优秀设计，特此致谢）
- 图标基于 [Lucide](https://lucide.dev/)（ISC License）
- 一言 API：[hitokoto.cn](https://hitokoto.cn/)；今日诗词：[jinrishici.com](https://www.jinrishici.com/)
- 天气 / 热榜 / 新闻等数据接口：[uapis.cn](https://uapis.cn/)、[60s API](https://github.com/vikiboss/60s)
- 若AI参考了您的代码，在此一并致谢。

## 说明
- 整体项目均为vibe coding实现，若侵犯了您的权益请联系我删除。
