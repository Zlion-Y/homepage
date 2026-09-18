# homepage

参考 [imsyy/home](https://github.com/imsyy/home) 风格编写的个人主页，使用 **Vue 3 + Vite** 构建，开箱即用，零配置部署到 Vercel。

![主页效果：壁纸背景 + 毛玻璃卡片](./docs/preview.jpg)

「网站列表」「站点监控」等卡片里的站点默认为示例（`example.com`），在 `src/config.js` 里的 `siteLinks` / `siteMonitors` 改成你自己的即可。

## 功能

- 载入动画、极光渐变背景（随昼夜时段自动变色，支持自定义背景图）
- 按时段问候语、打字机轮换标语（超长自动滚动、光标跟随闪烁）
- 一言（Hitokoto API，失败兜底本地语句，点击卡片换一句）
- 实时时钟与日期（农历 + 节日倒数）
- 实时天气长卡（免 Key、按访客 IP 自动定位到县级、湿度/体感/AQI、未来几天高低温双曲线）
- 网站列表（一行 3 个紧凑卡片，加站点自动扩展）
- 博客更新卡（拉取博客 RSS 展示最新 3 篇，卡头含 GitHub / 邮箱等社交图标）
- 二级「探索更多」面板（点击左上角 Logo 进入）：每日新闻、多平台热榜、音乐播放器、Epic 限免、程序员历史上的今天、站点监控、GitHub 数据卡
- 页脚建站运行天数
- 自定义圆点光标 + 移动/点击涟漪、卡片悬停 3D 倾斜 + 光泽动效
- 移动端自适应、暗色玻璃拟态风格；所有卡片均可在 `config.js` 中开关与排序
- 无障碍：全屏播放器支持 `Esc` 关闭，全局键盘焦点环，图标按钮均带 `aria-label`

**TODO（计划中）**：更多卡片支持（欢迎 PR / Issue）· 卡片位置自定义（拖拽排序 / 布局记忆）· 音乐卡 AMLL 歌词动效

## 部署

### Vercel（推荐，也是唯一完全支持的平台）

> ⚠️ **音乐卡的「洛雪音源解析」模式（`musicSource: "proxy"`）只适配 Vercel。**
> 它运行在 Node 运行时上（`node:vm` 执行音源脚本、请求期可用 `new Function`、直读 `sources/` 目录），
> 换到 Cloudflare Pages / EdgeOne 这类边缘函数会失效，实测原因见 [`docs/proxy.md`](docs/proxy.md)。
> 不启用该模式的话，页面是纯静态产物，部署到任何静态平台都能正常跑 —— 见下「纯静态平台」。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Zlion-Y/homepage&project-name=homepage&repository-name=homepage)

也可以参考 [Vercel 官方指南](https://vercel.com/docs/frameworks/frontend/vite) 手动导入，构建配置：

```
框架预设：Vite        根目录：./         构建命令：npm run build
输出目录：dist        安装命令：npm install
```

> 绑定自己的域名（如 `home.example.com`）：Vercel 项目设置 → **Domains** 添加，按提示到域名 DNS
> 加一条 CNAME 记录指向 `cname.vercel-dns.com` 即可。

### 纯静态平台（Cloudflare Pages / EdgeOne Makers 等）

构建命令 `npm run build`，输出目录 `dist`。

> Cloudflare Pages：创建项目时框架选 `Vite`（或手填上面两项）即可。EdgeOne Makers：把这两项写进
> `edgeone.json` 的 `buildCommand` / `outputDirectory`，注意它的函数目录约定是
> `edge-functions/` 与 `cloud-functions/`（不是 `functions/`）。
> 两家都可用自定义域名 + 免费证书；选中国大陆加速区域时域名需要先备案。

各功能在纯静态平台上的表现：

| 功能 | 表现 |
| --- | --- |
| 页面、问候语、时钟、天气、热榜、一言、新闻、限免、历史上的今天、站点监控、GitHub 卡 | ✅ 正常 —— 都是访客浏览器直连第三方接口，不经过本站函数 |
| 音乐播放器（歌单 / 歌词 / 播放） | ✅ 正常，走公共 Meting 接口。保持 `musicSource: "meting"` 即可 |
| 洛雪音源解析（`/api/url`、`/api/health`） | ❌ 没有这两个接口，自动降级回 Meting，播放不受影响 |
| 网易官方高清封面（`/netease-search`、`/netease-album/:id`、`/netease-songs`） | ❌ 接口 404，封面回落成歌单自带的小图，其余功能不受影响 |
| 博客更新卡（`/blog-rss`） | ❌ 拿不到 RSS（这个路径在 Vercel 上是 rewrite 代理），卡片显示加载失败 |

> 想保留 API 又让页面跑在别处也可以，但前端调用写死的是同源 `/api/url`，得改成绝对地址并给函数配
> `ALLOW_ORIGINS`，还要自己维护两处部署 —— 不如整站留在 Vercel 省事。

### 本地开发

```bash
git clone https://github.com/Zlion-Y/homepage.git   # 建议先 Fork 再克隆，顺手点个 Star
cd homepage
npm install
npm run dev
```

页面在 `http://localhost:5173`，改 `src/config.js` 实时热更新。

> **本地跑不了 `/api/url`。** Vite 不执行 `api/*.mjs`（它是 Vercel 的 serverless 函数），该路径也没配
> 代理，请求会静默降级到 Meting，控制台留一条提示。想在本地调试真正的解析函数，用 `npx vercel dev`。

### 环境变量

全部可选，零配置即可跑。函数默认只允许同源调用。常用的几个：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `API_TOKEN` | 未设置 | 设置后接口需带 `?token=xxx` 或 `Authorization: Bearer xxx` 访问 |
| `ALLOW_ORIGINS` | 仅同源 | 允许跨站调用（逗号分隔的完整 Origin，如 `https://a.com,https://b.com`） |
| `ALLOW_NO_ORIGIN` | `0` | 设为 `1` 放行无 Origin/Referer 的请求（curl 自检等场景） |
| `QUALITY` | `320k` | 音质档位（128k / 320k / flac / flac24bit） |
| `URL_CACHE_SECONDS` | `900` | 直链解析结果的 CDN 边缘缓存秒数，命中缓存不进函数 |
| `SOURCE_URLS` | 未设置 | 远端音源脚本地址（逗号分隔），改脚本不用重新部署 |

音源调度、质量兜底等其余调参项（`VERIFY`、`RESOLVE_*`、`QUALITY_*`、`INVOKE_TIMEOUT_MS` 等）
见 [`docs/proxy.md`](docs/proxy.md#环境变量)。

## 自定义

### 基本信息（最重要）

所有个性化内容集中在 **`src/config.js`**，修改后提交推送即可自动重新部署：

| 配置项 | 说明 |
| --- | --- |
| `siteConfig.siteName` | 左上角站点名称 |
| `siteConfig.pageTitle` | 浏览器标签页标题 |
| `siteConfig.siteFont` | 站名手写体，可选 key 见[「站名字体」](#站名字体)一节 |
| `siteConfig.logo` | Logo 图标：留空用内置「Z」徽章；填图片路径/URL 替换（载入页、左上角、favicon 同步生效） |
| `siteConfig.greet` | 问候语大标题 |
| `siteConfig.desc` | 一句话介绍（打字机轮换的第一句） |
| `siteConfig.motto` | 打字机轮换标语数组，只留一项则固定显示 |
| `siteConfig.siteStart` | 建站日期，页脚据此显示「已运行 N 天」 |
| `siteConfig.author` | 页脚版权署名 |
| `siteConfig.repo` | 页脚署名的超链接（主页仓库地址），留空显示纯文字 |
| `siteConfig.clickEffect` | 自定义光标 + 涟漪特效开关 |
| `siteConfig.cardTilt` | 卡片 3D 倾联动效开关（含音乐全屏播放器封面），`false` 关闭 |
| `siteConfig.weatherCity` | 天气城市 adcode，留空 = 自动定位 |
| `siteConfig.bgApi` | 随机壁纸 API，见[「自定义背景」](#自定义背景)一节 |
| `siteConfig.homeCards` | 主页各卡片开关（greet / blog / hitokoto / clock / weather / siteLinks），`false` 隐藏 |
| `siteConfig.panelCards` | 二级面板卡片排列：数组顺序 = 排列顺序，删掉某项 = 隐藏该卡 |
| `siteConfig.panelTips` | 进入二级面板时的烟花提示文案池，留空数组只放烟花不显示提示 |
| `siteConfig.githubUser` | GitHub 卡的用户名（需把 `github` 加入 `panelCards` 才显示） |
| `siteConfig.musicPlaylist` | 音乐卡网易云歌单 ID（需把 `music` 加入 `panelCards` 才显示） |
| `siteConfig.musicSource` | 播放直链来源：`meting` / `proxy`，见[「音乐播放器」](#音乐播放器)一节 |
| `siteConfig.musicQuality` | 音质：128k / 320k / flac / flac24bit |
| `siteConfig.hotPlatforms` | 热榜平台与顺序（weibo / bilibili / v2ex / ithome / hellogithub / zhihu / juejin / sspai 等） |
| `siteConfig.siteMonitors` | 站点监控卡的目标站点列表（`{ name, url }`，需把 `monitor` 加入 `panelCards`） |
| `socialLinks` | 「博客更新」卡里的社交图标（GitHub / 邮箱等，**记得改成自己的**） |
| `siteLinks` | 网站列表卡片 |

社交图标 `icon` 可选：`github` / `mail` / `bilibili` / `telegram` / `qq` / `rss`
网站图标 `icon` 可选：`blog` / `cloud` / `music` / `video` / `code` / `star`

### 音乐播放器

填入网易云歌单 ID（歌单页地址栏 `playlist?id=xxx`）即可启用：

- 多 Meting 源并发竞速拉取歌单，单源故障无感
- 每首歌自动在多个源之间探测可用播放链接，断链/过期自愈
- 全部源失败自动跳下一首；歌单本地缓存 6 小时，进面板秒开
- 预载下一首但不自动出声，点击播放才响；歌词同步滚动居中，点歌词行跳转进度
- 默认 `musicSource: "meting"`，走公共 Meting 接口，**开箱即用**

#### 可选：启用自带音源解析（`musicSource: "proxy"`）

公共 Meting 接口对 VIP / 版权受限曲目拿不到可播放直链。本仓库自带一份 serverless 版的洛雪音源解析
（`api/` + `lib/`），改成 `"proxy"` 即可解锁这类曲目的完整直链：

- ⚠️ **只适配 Vercel** —— 它跑在 Node 运行时上，边缘函数会失效
- ⚠️ **需要自备音源脚本**放进 [`sources/`](sources/README.md)（仓库只带示例脚本，
  参考 [lxmusic-](https://github.com/guoyue2010/lxmusic-)），或用 `SOURCE_URLS` 指向在线脚本
- 解析不到时**自动降级回 Meting**，所以开着也不影响原来能用的情况
- 解析要等一会儿：中位 0.7s、p90 1.3s，但聚合类音源偶尔抖动到 5~6 秒，前端超时因此设了 12 秒
- 直链缓存在 CDN 边缘（`s-maxage=900`），命中缓存的请求根本不进函数

接口用法（`/api/url` 入参、返回码）、访问控制、缓存行为、音源优先级
（`sources/ranking.json`）与「为什么边缘平台跑不了」的实测结论，都在
[**`docs/proxy.md`**](docs/proxy.md)。

### 站点监控卡

`siteMonitors` 里列出你的站点，卡片会用访客浏览器直连探测（与访客能否打开一致），显示绿/红状态与响应耗时，每 60 秒自动刷新。无需任何第三方监控服务。

### 自定义背景

三种方式（`src/config.js` 的 `bgApi`）：

1. **默认**：留空使用动态极光渐变背景
2. **静态图**：把图片命名为 `background.jpg` 放到 `public/images/` 即自动生效（无需改配置，会自动压暗保证文字可读）
3. **随机壁纸 API**：`bgApi` 填接口地址，每次打开页面随机换一张，加载完成后淡入、失败自动回退极光渐变。已实测可用的接口：
   - `https://bing.liushen.fun/api/random?redirect=true`（必应每日壁纸）
   - `https://www.dmoe.cc/random.php`、`https://t.alcy.cc/ycy`、`https://api.paugram.com/wall/`（二次元随机）

### 实时天气（可选）

默认使用 [uapis.cn](https://uapis.cn) 聚合天气接口，**无需申请任何 Key**：按访客 IP 自动定位（可精确到县级），显示实况温度、湿度、体感、风向风力、AQI 和未来几天高低温曲线，数据本地缓存 30 分钟。

想固定显示某个城市（不随访客位置变化）：在 `src/config.js` 里把 `weatherCity` 填为该城市的 adcode（[行政区划代码表](https://lbs.amap.com/api/webservice/download)），如 `"410100"` 郑州。

接口不可用时天气卡自动隐藏，其余功能不受影响。

### 浏览器图标

替换 `public/favicon.svg`（Z 字母徽章，可改成任何 SVG）。

### 站名字体

左上角站名使用手写艺术字渲染，内置 7 款开源字体（Google Fonts，SIL OFL 许可），
在 `src/config.js` 的 `siteFont` 里填 key 即可一键切换（写错自动回退 `pacifico`）：

![站名字体效果预览](./docs/fonts/preview.png)

| `siteFont` 取值 | 字体 | 风格 |
|---|---|---|
| `pacifico`（默认） | Pacifico | 圆润复古手写 |
| `dancing` | Dancing Script | 优雅拉丁书法 |
| `greatvibes` | Great Vibes | 铜版体、花饰最多 |
| `lobster` | Lobster | 复古粗体连字 |
| `kaushan` | Kaushan Script | 笔刷手写、有动感 |
| `sacramento` | Sacramento | 细单线连笔、最轻盈 |
| `caveat` | Caveat | 随性铅笔手写 |

字体文件与详细说明见 [`public/font/README.md`](public/font/README.md)。

## 目录结构

```
homepage/
├── docs/
│   ├── preview.jpg          # README 用的主页效果图（不进构建产物）
│   ├── proxy.md             # 洛雪音源解析详解（接口 / 访问控制 / 音源优先级）
│   └── fonts/preview.png    # 站名字体效果预览图
├── public/
│   ├── favicon.svg          # 网站图标
│   └── images/              # 放 background.jpg 可自定义背景
├── src/
│   ├── config.js            # ★ 所有个性化配置（卡片开关/排序也在这里）
│   ├── App.vue              # 页面布局
│   ├── style.css            # 全局样式（颜色变量等）
│   └── components/          # 各功能组件
├── api/                     # Vercel serverless 函数（音乐解析 / 健康自检）
├── lib/                     # 解析核心：音源宿主 / 调度器 / 访问控制 / 音源优先级
├── sources/                 # 洛雪音源脚本（随函数一起部署，可换成自己的）+ ranking.json
└── vite.config.js
```

## 致谢

- 布局与功能灵感来自 [imsyy/home](https://github.com/imsyy/home)（MIT License）
- 音乐播放器实现参考 [CuteLeaf/Firefly](https://github.com/CuteLeaf/Firefly) 项目的 MusicManager
- 图标基于 [Lucide](https://lucide.dev/)（ISC License）
- 一言 API：[hitokoto.cn](https://hitokoto.cn/)；今日诗词：[jinrishici.com](https://www.jinrishici.com/)
- 天气 / 热榜 / 新闻等数据接口：[uapis.cn](https://uapis.cn/)、[60s API](https://github.com/vikiboss/60s)
- 若 AI 参考了您的代码，在此一并致谢。

## 说明

- 整体项目均为 vibe coding 实现，若侵犯了您的权益请联系我删除。
