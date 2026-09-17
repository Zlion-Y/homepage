# homepage

参考 [imsyy/home](https://github.com/imsyy/home) 风格编写的个人主页，使用 **Vue 3 + Vite** 构建，开箱即用，零配置部署到 Vercel。

![主页效果：壁纸背景 + 毛玻璃卡片](./docs/preview.jpg)

「网站列表」「站点监控」等卡片里的站点默认为示例（`example.com`），在 `src/config.js` 里的 `siteLinks` / `siteMonitors` 改成你自己的即可。

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
- 无障碍：全屏播放器支持 `Esc` 关闭，全局键盘焦点环，图标按钮均带 `aria-label`
- 移动端自适应、暗色玻璃拟态风格；所有卡片均可在 config.js 中开关与排序

**TODO（计划中）**：

- [ ] 更多卡片支持（欢迎 PR / 提 Issue 讨论想看到的卡片）
- [ ] 卡片位置自定义（拖拽排序 / 布局记忆）
- [ ] 音乐卡 AMLL 效果（[Apple Music-like Lyrics](https://github.com/amll-dev/applemusic-like-lyrics) 歌词动效：逐字点亮、弹性动画、灵感专辑封面背景）

## 部署

### 平台托管部署（推荐）

参考 [Vercel 官方指南](https://vercel.com/docs/frameworks/frontend/vite) 将本项目部署至 Vercel、Netlify、Cloudflare Pages 等平台。主流平台自动部署，会根据环境自动选择适配器。

框架预设：`Vite`

根目录：`./`

输出目录：`dist`

构建命令：`npm run build`

安装命令：`npm install`

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Zlion-Y/homepage&project-name=homepage&repository-name=homepage)

> 想绑定自己的域名（如 `home.example.com`）：在 Vercel 项目设置 → **Domains** 中添加，按提示到域名 DNS 处加一条 CNAME 记录指向 `cname.vercel-dns.com` 即可。

### 环境变量（全部可选，零配置即可跑）

函数默认只允许同源调用，不配任何东西也能正常工作。需要进阶行为时，在 Vercel 项目设置 → **Environment Variables** 里配置：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `API_TOKEN` | 未设置 | 设置后 `/api/health`、`/api/url` 需带 `?token=xxx` 或 `Authorization: Bearer xxx` 访问 |
| `ALLOW_ORIGINS` | 仅同源 | 允许跨站调用（逗号分隔的完整 Origin，如 `https://a.com,https://b.com`） |
| `ALLOW_NO_ORIGIN` | `0` | 设为 `1` 时放行无 Origin/Referer 的请求（curl 自检等场景） |
| `QUALITY` | `320k` | 音质档位（128k / 320k / flac / flac24bit） |
| `URL_CACHE_SECONDS` | `900` | 直链解析结果的 CDN 边缘缓存秒数，命中缓存不进函数 |
| `VERIFY` | 开启 | 设为 `off` 跳过直链探活（更快但可能返回死链） |
| `RESOLVE_CONCURRENCY` | `2` | 分波下发时每波并发几个音源（第一波见下一行） |
| `RESOLVE_FIRST_WAVE` | `4` | 第一波并发数：能被服务的音源未必排在最前，放宽第一波比每次只放 2 个快一整波 |
| `QUALITY_FLOOR` | `0.7` | `ranking.json` 里音质比低于此值的音源，先答上来也不立刻采用（见「音源优先级」） |
| `QUALITY_GRACE_MS` | `400` | 等更高码率候选的宽限；`0` = 关闭，退回"谁先答谁赢" |
| `INVOKE_TIMEOUT_MS` | `9000` | 单个音源调用的超时，必须装进前端等得起的预算（前端 12s） |
| `SOURCE_URLS` | 未设置 | 远端音源脚本地址（逗号分隔），改脚本不用重新部署 |
| `DEBUG_HEADERS` | `0` | 设为 `1` 时成功响应带回 `x-music-via` / `x-music-ms`（哪家音源、耗时多少），排查用 |

### 部署到纯静态平台（Cloudflare Pages / EdgeOne Makers 等）

页面本身是纯静态产物，**不含 API 的那部分**可以部署到任何静态托管平台：

- 构建命令：`npm run build`
- 输出目录：`dist`

> Cloudflare Pages：创建项目时框架选 `Vite`（或手填上面两项）即可。EdgeOne Makers：把这两项写进
> `edgeone.json` 的 `buildCommand` / `outputDirectory`，注意它的函数目录约定是
> `edge-functions/` 与 `cloud-functions/`（不是 `functions/`）。
> 两家都可以用自定义域名 + 免费证书；选中国大陆加速区域时域名需要先备案。

各功能在纯静态平台上的表现：

| 功能 | 表现 |
| --- | --- |
| 页面、问候语、时钟、天气、热榜、一言、新闻、限免、历史上的今天、站点监控、GitHub 卡 | ✅ 正常——都是访客浏览器直连第三方接口，不经过本站函数 |
| 音乐播放器（歌单 / 歌词 / 播放） | ✅ 正常，走公共 Meting 接口。建议把 `src/config.js` 的 `musicSource` 改成 `"meting"`：不然每首歌还会先白问一次 `/api/url`，控制台留一条降级提示 |
| 洛雪音源解析（`/api/url`、`/api/health`） | ❌ 没有这两个接口，自动降级回 Meting，播放不受影响 |
| 网易官方高清封面（`/netease-search`、`/netease-album/:id`、`/netease-songs`） | ❌ 接口 404，封面回落成歌单自带的小图，其余功能不受影响 |
| 博客更新卡（`/blog-rss`） | ❌ 拿不到 RSS（这个路径在 Vercel 上是 rewrite 代理），卡片显示加载失败 |

> 想保留 API 又想让页面跑在别处也可以，但前端调用写死的是同源 `/api/url`，得改成绝对地址并给函数配
> `ALLOW_ORIGINS`，还要自己维护两处部署——不如整站留在 Vercel 省事。

#### 为什么 API 不建议放到边缘平台

洛雪音源解析要在函数里**跑第三方音源脚本**（`sources/*.js`），这件事和"边缘函数"的沙箱模型天生冲突，实测结论：

- **Cloudflare**：免费版每次调用只有 **10ms CPU**（网络等待不计）；运行时**禁止代码生成**——不只是请求期，
  实测连模块启动期的 `new Function` 都会抛 `Code generation from strings disallowed for this context`；
  模块全局作用域还禁止 I/O、定时器与随机数（会直接打挂那些在顶层就发请求的音源脚本）。
- **EdgeOne**：边缘函数没有任何 `node:*` 模块（`Buffer`、`crypto` 的 md5/AES/RSA、`zlib` 都得自己塞纯 JS 垫片），
  单次 CPU 上限 200ms，且 `console` 只允许调 20 次、循环限 10 万次迭代。它真正能跑这份 Node 代码的是
  Cloud Functions（Node.js 20，区域函数而非边缘节点）。

把音源脚本改写成"构建期预编译成普通函数 + 请求期执行 + 按平台只激活相关脚本"确实能在边缘跑通（本地已验证），
但代价是**每次改音源都要重新构建**、边缘上**无法再用 `SOURCE_URLS` 远端音源**，免费版的 CPU 余量也始终紧张，
所以本仓库默认只支持 Vercel 这种 Node 运行时。真要在别处跑，用 EdgeOne Cloud Functions 这类 Node 区域函数最省事。

### 本地开发部署

1. **克隆仓库：**

   **先 [Fork](https://github.com/Zlion-Y/homepage/fork) 到自己仓库再克隆（推荐），记得先点 Star 再 Fork 哦！**

   ```bash
   git clone https://github.com/you-github-name/homepage.git
   cd homepage
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

填入网易云歌单 ID（歌单页地址栏 `playlist?id=xxx`）即可启用。播放器特性：

- 多 Meting 源并发竞速拉取歌单，单源故障无感
- 每首歌自动在多个源之间探测可用播放链接，断链/过期自愈
- 全部源失败自动跳下一首，红字提示不打哑巴尬
- 歌单本地缓存 6 小时，进面板秒开；预载但不自动出声，点击播放才响
- 歌词同步滚动居中，点歌词行跳转进度
- **洛雪音源解析**（serverless 函数，内置可选，随本仓库部署在 Vercel，见下）

<details>
<summary><b>洛雪音源解析（serverless，内置可选）</b> —— 默认走公共 Meting；启用自带解析、接口速查与音源优先级说明都在这里</summary>

公共 Meting 接口对 VIP / 版权受限曲目拿不到可播放直链。本仓库自带一份 **serverless 版的洛雪音源解析**
（`api/` + `lib/`，跟主页一起部署在 Vercel），把洛雪（LX Music）自定义音源脚本跑在函数里。
**仓库默认 `"meting"` 开箱即用**；想解锁 VIP 曲完整直链，按下文把 `musicSource` 改成 `"proxy"` 即启用：

- 前端调**同源**的 `/api/url`：不需要额外域名、证书、CORS 配置，也不用再维护一台服务器；
- 服务端用 Node 原生 `vm` 跑脚本（脚本本来就是 JS，连垫片都不用），
  多音源按成绩分波对冲、赢家一出即掐断其余、直链探活、连续失败熔断；
- 直链缓存放在 CDN 边缘（`s-maxage=900`），**命中缓存的请求根本不进函数**，不消耗调用次数；
- 解析不到时自动降级回 Meting，所以**开着也不影响原来能用的情况**。

> **解析是要等一会儿的，别把超时设紧。** 实测（hkg1，8 个音源 × 20 首热歌，逐曲新鲜解析）：
> 中位 0.7s、p90 1.3s，但**聚合类音源自身会抖动到 5~6 秒**（同一首曲子同一家源，1.4s ⇄ 5.8s）。
> 而 VIP 曲往往只有这类聚合源能出直链——其余音源在机房 IP 上直接失败。所以前端的解析超时
> 必须装得下这个尾巴：早期写死 5 秒，超时后静默退回 Meting，而 Meting 对 VIP 曲返回 404，
> 表现出来就是"VIP 歌全都听不了（非 VIP 照常）"。现在前端等 12 秒，服务端单源超时压到 9 秒，
> 两边对齐。切歌瞬间还会**立即掐掉上一首**（否则解析那几秒里封面歌词都换了、耳朵里还在放旧歌），
> 期间卡片显示"正在解析音源直链…"。

`config.js` 里对应的开关：

```js
musicSource: "meting",   // 默认只走公共 Meting 接口；"proxy" = 走自带的 serverless 解析
musicQuality: "320k",    // 128k / 320k / flac / flac24bit
```

启用 `"proxy"` 需要自备音源脚本：放 [`sources/`](sources/README.md)（仓库只带示例脚本，**真实音源请自行准备**，
参考 [lxmusic-](https://github.com/guoyue2010/lxmusic-)），或配 `SOURCE_URLS` 环境变量指向在线脚本——
改了远端脚本后不用重新部署，调一次 `/api/health?refresh=1` 就能让函数立刻重装全部音源
（怎么调见下方「接口速查」）。

#### 接口速查（`/api/health`、`/api/url`）

两个接口都是 **GET、同源调用**。前端就是这么用的（音乐卡直接 `fetch('/api/url?id=…&source=wy&quality=320k')`），
想在浏览器里手动看一眼，**打开本站任意页面 → F12 控制台**里执行最省事：

```js
await (await fetch('/api/health')).json()                       // 装了哪些音源、排序、失败原因
await (await fetch('/api/health?refresh=1')).json()             // 强制重装音源（约 1 秒冷启动开销）
await (await fetch('/api/url?id=287398&source=wy&quality=320k')).json()
```

命令行则必须**自己带上本站的 Referer/Origin**（见下面第 2 条）：

```bash
curl -s -H "Referer: https://你的域名" "https://你的域名/api/health" | head -c 800
curl -s -H "Referer: https://你的域名" "https://你的域名/api/url?id=287398&source=wy&quality=320k"
```

**1) `/api/url` 入参**

| 参数 | 取值 | 说明 |
| --- | --- | --- |
| `source` | `wy` 网易云 / `kg` 酷狗 / `tx` QQ音乐 / `kw` 酷我 / `mg` 咪咕 | 其它值一律 400。**只允许这 5 个**（洛雪的平台代号；`qq`/`xm` 不是平台的代号） |
| `quality` | `128k` / `320k`（默认）/ `flac` / `flac24bit` | 不认识的档次回落 320k |
| `id` | 纯数字，≤19 位 | 也接受 `songmid` / `hash` / `rid`，另有 `name` `singer` `albumId` `albumName` `duration` `interval` 可选传给音源脚本 |
| `debug` | `1` | 回吐逐音源溯源（`trace.via` 谁答的、`ms` 音源耗时、`verifyMs` 探活耗时、每家各花多久/错在哪），且**不缓存** |

返回：成功 `{code:0, source, quality, url}`；失败 `{code:1, msg}`，状态码 400（参数）/ 502（解析或探活失败）/ 503（没有音源实现该平台）。

> **`quality` 是请求、不是保证**：最终给到什么取决于哪家音源先答。实测同一首 320k 请求，
> 有的源给 12.23MB、有的只给 4.89MB（128k 变体）。`sources/ranking.json` 里的 `samples[].q`
> 就是为这个准备的（让低码率的源先答也不立刻采用）。

**2) 访问控制：先同源、后 token（两道关，token 不能代替同源）**

| 请求 | 结果 |
| --- | --- |
| 页面内 `fetch('/api/health')`（浏览器自动带 Referer） | **200** |
| 从站内点链接 / `location.href` 跳过去 | **200** |
| 浏览器地址栏直接输入 `/api/health`（不发 Referer） | **403** `来源不在白名单` |
| `curl` 裸调（无 Origin/Referer） | **403** |
| `curl -H "Referer: https://你的域名" …` 或带本站 Origin | **200** |
| 带其它站点的 Origin/Referer | **403** |
| 别的网站里 `fetch` 本站接口 | 被 CORS 挡掉（`Access-Control-Allow-Origin` 只回本站） |

配了 `API_TOKEN` 之后还要再过一道：**`?token=` 但没带 Referer 仍然是 403**，
必须「同源头 + token」两个都满足 —— `curl -H "Referer: https://你的域名" -H "Authorization: Bearer $TOKEN" …`
（或 `?token=$TOKEN`）。想放行无 Origin/Referer 的请求（比如纯 curl 自检）才需要 `ALLOW_NO_ORIGIN=1`，
但那就等于对外公开了，谨慎。`?refresh=1` 有约 1 秒冷启动开销，别公开调用。

**3) 缓存**：`/api/url` 的成功结果放 CDN 边缘 `s-maxage=900`（`URL_CACHE_SECONDS` 可调），
**命中缓存根本不进函数**。客户端发 `cache-control: no-cache` 也照样 HIT（边缘以 s-maxage 为准）；
想拿"新鲜解析"（比如测耗时）就加一个随机参数：`&_=123456`，会看到 `x-vercel-cache: MISS`。
`debug=1` 的响应是 `no-store`，永远不缓存。

部署后按上面的方式调 `/api/health` 能看到装上了哪些音源、各自的平台与失败原因。
音源：[https://github.com/guoyue2010/lxmusic-](https://github.com/guoyue2010/lxmusic-)

#### 音源优先级：`sources/ranking.json`（可选，纯内部逻辑）

多音源对冲是"谁先答谁赢"，冷启动时所有音源分数相同，排序就等于目录读入顺序（任意）——
能被服务的那家若排在后面就要白等一整波。所以这里支持一个**可选的** `sources/ranking.json`：
随代码提交，函数每次装载时读它，决定"谁先进第一波"，并用它启用**质量兜底**
（已知会给 128k 变体的那几家先答上来也不立刻采用，多等 `QUALITY_GRACE_MS`（默认 400ms）
看高码率的能不能赶上）。

```json
{
  "order":   ["墨澜音乐源v2.3.4.js", "回避聚合V0.0.1.js", "…"],   // 优 → 劣
  "scores":  { "墨澜音乐源v2.3.4.js": 0.92, "…": 0.85 },
  "samples": { "墨澜音乐源v2.3.4.js": { "ok": 5, "n": 5, "ms": 288, "q": 1 } }
}
```

- 本仓库的 `.gitignore` 排除 `sources/*`（不放第三方音源脚本），已为你留了 `!sources/ranking.json` 例外；
- **没有这个文件 / 文件坏了，功能完全不受影响**（退回目录顺序、不做质量兜底）；
- `q` 是音质比（0~1）：该源拿到的直链字节数 ÷ 同一首歌里各源的最大字节数 —— 同一首歌时长相同，
  所以字节数之比 ≈ 码率之比，**不需要任何时长元信息**就能看出谁被降级成 128k（实测 2.50× = 320k/128k）；
- `scores` 只是初始分：实例内一旦攒够运行成绩（`stats`）就会覆盖它，所以排错了能自我纠正；
- `order`/`scores`/`samples` 都可以手工写。评分口径（`lib/ranking.mjs`）：
  `0.5×成功率 + 0.3×(1 - 平均耗时/3000ms) + 0.2×音质比`。

> 这一版**没有**做测速接口或管理页面（属于主页以外的功能，已移除）。
> 需要重排时，本地跑一段脚本调用 `lib/ranking.mjs` 的 `aggregate()` 生成文件即可，
> 口径与运行时读的是同一处代码。

> 说明：函数默认跑在香港（`hkg1`，离国内接口最近）。实测同一批音源与曲目，机房节点与国内出口的
> 成功率基本一致；但这类"直链代理"本身在灰区，建议只自用、别公开分发。

> 这套解析依赖 Node 运行时（用 `node:vm` 跑音源脚本、直读 `sources/` 目录、请求期可用 `new Function`），
> **换成 Cloudflare / EdgeOne 的边缘函数会失效**——原因与实测结论见[「部署到纯静态平台」](#部署到纯静态平台cloudflare-pages--edgeone-makers-等)一节。

</details>

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
│   └── fonts/
│       └── preview.png      # 站名字体效果预览图
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
- **音乐播放器实现参考 [CuteLeaf/Firefly](https://github.com/CuteLeaf/Firefly) 项目的 MusicManager**（多源降级、链接自愈等核心逻辑照搬自该项目的优秀设计，特此致谢）
- 图标基于 [Lucide](https://lucide.dev/)（ISC License）
- 一言 API：[hitokoto.cn](https://hitokoto.cn/)；今日诗词：[jinrishici.com](https://www.jinrishici.com/)
- 天气 / 热榜 / 新闻等数据接口：[uapis.cn](https://uapis.cn/)、[60s API](https://github.com/vikiboss/60s)
- 若AI参考了您的代码，在此一并致谢。

## 说明
- 整体项目均为vibe coding实现，若侵犯了您的权益请联系我删除。
