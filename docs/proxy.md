# 洛雪音源解析（`musicSource: "proxy"`）参考

[`README`](../README.md) 里「音乐播放器」一节的详细补充。仅在你要启用自带解析时才有用。

> **⚠️ 只适配 Vercel。** 这套解析跑在 Node 运行时上（`node:vm` 执行音源脚本、请求期可用 `new Function`、
> 直读 `sources/` 目录），换成 Cloudflare Pages / EdgeOne 的边缘函数会失效 —— 实测原因见文末
> 「为什么边缘平台跑不了」。用 EdgeOne **Cloud Functions**（Node.js 20 区域函数，非边缘节点）这类
> 也能跑，但本仓库只对 Vercel 做过验证。

---

## 它解决什么

公共 Meting 接口对 VIP / 版权受限曲目拿不到可播放直链。这份解析（`api/` + `lib/`）把洛雪（LX Music）
自定义音源脚本跑在 serverless 函数里，服务端只负责解析出直链，**音频字节仍由浏览器直连平台 CDN**。

- 前端调**同源**的 `/api/url`：不需要额外域名、证书、CORS 配置，也不用维护一台服务器；
- 服务端用 Node 原生 `vm` 跑脚本，多音源按成绩分波对冲、赢家一出即掐断其余、直链探活、连续失败熔断；
- 直链缓存在 CDN 边缘（`s-maxage=900`），**命中缓存的请求根本不进函数**，不消耗调用次数；
- 解析不到时自动降级回 Meting，所以**开着也不影响原来能用的情况**。

⚠️ 启用前需要**自备音源脚本**：放 [`sources/`](../sources/README.md)（仓库只带示例脚本，真实音源请自行准备，
参考 [lxmusic-](https://github.com/guoyue2010/lxmusic-)），或配 `SOURCE_URLS` 环境变量指向在线脚本 ——
改了远端脚本不用重新部署，调一次 `/api/health?refresh=1` 即可让函数重装全部音源。

> 这类"直链代理"本身在灰区，建议只自用、别公开分发。函数默认跑在香港（`hkg1`，离国内接口最近）。

---

## 时间预算：别把超时设紧

**解析是要等一会儿的。** 实测（hkg1，8 个音源 × 20 首热歌，逐曲新鲜解析）：中位 0.7s、p90 1.3s，
但**聚合类音源自身会抖动到 5~6 秒**（同一首曲子同一家源，1.4s ⇄ 5.8s）。而 VIP 曲往往只有这类聚合源
能出直链 —— 其余音源在机房 IP 上直接失败。

所以前端的解析超时必须装得下这个尾巴：早期写死 5 秒，超时后静默退回 Meting，而 Meting 对 VIP 曲返回 404，
表现出来就是「VIP 歌全都听不了（非 VIP 照常）」。现在前端等 12 秒、服务端单源超时压到 9 秒，两边对齐。
切歌瞬间还会**立即掐掉上一首**（否则解析那几秒里封面歌词都换了、耳朵里还在放旧歌），期间卡片显示
「正在解析音源直链…」。

---

## 接口速查（`/api/health`、`/api/url`）

两个接口都是 **GET、同源调用**。前端就是这么用的
（音乐卡直接 `fetch('/api/url?id=…&source=wy&quality=320k')`）。
想在浏览器里手动看一眼，**打开本站任意页面 → F12 控制台**里执行最省事：

```js
await (await fetch('/api/health')).json()                       // 装了哪些音源、排序、失败原因
await (await fetch('/api/health?refresh=1')).json()             // 强制重装音源（约 1 秒冷启动开销）
await (await fetch('/api/url?id=287398&source=wy&quality=320k')).json()
```

命令行则必须**自己带上本站的 Referer/Origin**（见「访问控制」）：

```bash
curl -s -H "Referer: https://你的域名" "https://你的域名/api/health" | head -c 800
curl -s -H "Referer: https://你的域名" "https://你的域名/api/url?id=287398&source=wy&quality=320k"
```

### `/api/url` 入参

| 参数 | 取值 | 说明 |
| --- | --- | --- |
| `source` | `wy` 网易云 / `kg` 酷狗 / `tx` QQ音乐 / `kw` 酷我 / `mg` 咪咕 | 其它值一律 400。**只允许这 5 个**（洛雪的平台代号；`qq`/`xm` 不是平台的代号） |
| `quality` | `128k` / `320k`（默认）/ `flac` / `flac24bit` | 不认识的档次回落 320k |
| `id` | 纯数字，≤19 位 | 也接受 `songmid` / `hash` / `rid`，另有 `name` `singer` `albumId` `albumName` `duration` `interval` 可选传给音源脚本 |
| `debug` | `1` | 回吐逐音源溯源（`trace.via` 谁答的、`ms` 音源耗时、`verifyMs` 探活耗时、每家各花多久/错在哪），且**不缓存** |

返回：成功 `{code:0, source, quality, url}`；失败 `{code:1, msg}`，
状态码 400（参数）/ 502（解析或探活失败）/ 503（没有音源实现该平台）。

> **`quality` 是请求、不是保证**：最终给到什么取决于哪家音源先答。实测同一首 320k 请求，
> 有的源给 12.23MB、有的只给 4.89MB（128k 变体）。`sources/ranking.json` 里的 `samples[].q`
> 就是为这个准备的（让低码率的源先答也不立刻采用）。

### 访问控制：先同源、后 token（两道关，token 不能代替同源）

| 请求 | 结果 |
| --- | --- |
| 页面内 `fetch('/api/health')`（浏览器自动带 Referer） | **200** |
| 从站内点链接 / `location.href` 跳过去 | **200** |
| 浏览器地址栏直接输入 `/api/health`（不发 Referer） | **403** `来源不在白名单` |
| `curl` 裸调（无 Origin/Referer） | **403** |
| `curl -H "Referer: https://你的域名" …` 或带本站 Origin | **200** |
| 带其它站点的 Origin/Referer | **403** |
| 别的网站里 `fetch` 本站接口 | 被 CORS 挡掉（`Access-Control-Allow-Origin` 只回本站） |

配了 `API_TOKEN` 之后还要再过一道：**`?token=` 但没带 Referer 仍然是 403**，必须「同源头 + token」
两个都满足：

```bash
curl -H "Referer: https://你的域名" -H "Authorization: Bearer $TOKEN" …
# 或 ?token=$TOKEN
```

想放行无 Origin/Referer 的请求（比如纯 curl 自检）才需要 `ALLOW_NO_ORIGIN=1`，但那就等于对外公开了，谨慎。
`?refresh=1` 有约 1 秒冷启动开销，别公开调用。

### 缓存

`/api/url` 的成功结果放 CDN 边缘 `s-maxage=900`（`URL_CACHE_SECONDS` 可调），**命中缓存根本不进函数**。
客户端发 `cache-control: no-cache` 也照样 HIT（边缘以 s-maxage 为准）；想拿"新鲜解析"（比如测耗时）
就加一个随机参数：`&_=123456`，会看到 `x-vercel-cache: MISS`。`debug=1` 的响应是 `no-store`，永远不缓存。

---

## 环境变量

函数默认只允许同源调用，不配任何东西也能正常工作。需要进阶行为时，在 Vercel 项目设置 →
**Environment Variables** 里配置：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `API_TOKEN` | 未设置 | 设置后 `/api/health`、`/api/url` 需带 `?token=xxx` 或 `Authorization: Bearer xxx` 访问 |
| `ALLOW_ORIGINS` | 仅同源 | 允许跨站调用（逗号分隔的完整 Origin，如 `https://a.com,https://b.com`） |
| `ALLOW_NO_ORIGIN` | `0` | 设为 `1` 时放行无 Origin/Referer 的请求（curl 自检等场景） |
| `QUALITY` | `320k` | 音质档位（128k / 320k / flac / flac24bit） |
| `URL_CACHE_SECONDS` | `900` | 直链解析结果的 CDN 边缘缓存秒数，命中缓存不进函数 |
| `SOURCE_URLS` | 未设置 | 远端音源脚本地址（逗号分隔），改脚本不用重新部署 |
| `DEBUG_HEADERS` | `0` | 设为 `1` 时成功响应带回 `x-music-via` / `x-music-ms`（哪家音源、耗时多少），排查用 |
| `VERIFY` | 开启 | 设为 `off` 跳过直链探活（更快但可能返回死链） |
| `INVOKE_TIMEOUT_MS` | `9000` | 单个音源调用的超时，必须装进前端等得起的预算（前端 12s） |
| `RESOLVE_FIRST_WAVE` | `4` | 第一波并发数：能被服务的音源未必排在最前，放宽第一波比每次只放 2 个快一整波 |
| `RESOLVE_CONCURRENCY` | `2` | 分波下发时每波并发几个音源（第一波见上一行） |
| `QUALITY_FLOOR` | `0.7` | `ranking.json` 里音质比低于此值的音源，先答上来也不立刻采用 |
| `QUALITY_GRACE_MS` | `400` | 等更高码率候选的宽限；`0` = 关闭，退回"谁先答谁赢" |

---

## 音源优先级：`sources/ranking.json`（可选，纯内部逻辑）

多音源对冲是"谁先答谁赢"，冷启动时所有音源分数相同，排序就等于目录读入顺序（任意）——
能被服务的那家若排在后面就要白等一整波。所以这里支持一个**可选的** `sources/ranking.json`：
随代码提交，函数每次装载时读它，决定"谁先进第一波"，并用它启用**质量兜底**
（已知会给 128k 变体的那几家先答上来也不立刻采用，多等 `QUALITY_GRACE_MS`（默认 400ms）看高码率的能不能赶上）。

```json
{
  "order":   ["墨澜音乐源v2.3.4.js", "回避聚合V0.0.1.js", "…"],   // 优 → 劣
  "scores":  { "墨澜音乐源v2.3.4.js": 0.92, "…": 0.85 },
  "samples": { "墨澜音乐源v2.3.4.js": { "ok": 5, "n": 5, "ms": 288, "q": 1 } }
}
```

- 音源脚本与 `ranking.json` 都要**提交进仓库**才会被函数加载（`vercel.json` 的 `includeFiles: "sources/**"`
  只打包仓库里已有的文件）；不想把脚本放进仓库，就用 `SOURCE_URLS` 指向在线脚本；
- **没有这个文件 / 文件坏了，功能完全不受影响**（退回目录顺序、不做质量兜底）；
- `q` 是音质比（0~1）：该源拿到的直链字节数 ÷ 同一首歌里各源的最大字节数 —— 同一首歌时长相同，
  所以字节数之比 ≈ 码率之比，**不需要任何时长元信息**就能看出谁被降级成 128k（实测 2.50× = 320k/128k）；
- `scores` 只是初始分：实例内一旦攒够运行成绩（`stats`）就会覆盖它，所以排错了能自我纠正；
- `order`/`scores`/`samples` 都可以手工写。评分口径（`lib/ranking.mjs`）：
  `0.5×成功率 + 0.3×(1 - 平均耗时/3000ms) + 0.2×音质比`。

> 这一版**没有**做测速接口或管理页面（属于主页以外的功能，已移除）。需要重排时，本地跑一段脚本调用
> `lib/ranking.mjs` 的 `aggregate()` 生成文件即可，口径与运行时读的是同一处代码。

---

## 为什么边缘平台跑不了

洛雪音源解析要在函数里**跑第三方音源脚本**（`sources/*.js`），这件事和"边缘函数"的沙箱模型天生冲突。实测结论：

- **Cloudflare**：免费版每次调用只有 **10ms CPU**（网络等待不计）；运行时**禁止代码生成** —— 不只是请求期，
  实测连模块启动期的 `new Function` 都会抛 `Code generation from strings disallowed for this context`；
  模块全局作用域还禁止 I/O、定时器与随机数（会直接打挂那些在顶层就发请求的音源脚本）。
- **EdgeOne**：边缘函数没有任何 `node:*` 模块（`Buffer`、`crypto` 的 md5/AES/RSA、`zlib` 都得自己塞纯 JS 垫片），
  单次 CPU 上限 200ms，且 `console` 只允许调 20 次、循环限 10 万次迭代。它真正能跑这份 Node 代码的是
  Cloud Functions（Node.js 20，区域函数而非边缘节点）。

把音源脚本改写成"构建期预编译成普通函数 + 请求期执行 + 按平台只激活相关脚本"确实能在边缘跑通（本地已验证），
但代价是**每次改音源都要重新构建**、边缘上**无法再用 `SOURCE_URLS` 远端音源**，免费版的 CPU 余量也始终紧张。
所以本仓库默认只支持 Vercel 这种 Node 运行时；真要在别处跑，用 EdgeOne Cloud Functions 这类 Node 区域函数最省事。

部署后按上面的方式调 `/api/health` 能看到装上了哪些音源、各自的平台与失败原因。
音源：[https://github.com/guoyue2010/lxmusic-](https://github.com/guoyue2010/lxmusic-)
