# 音源脚本放这里

这个目录里的 `.js` 是**洛雪（LX Music）自定义音源脚本**，服务端会在 `/api/url` 被调用时把它们跑起来拿播放直链。
现在只有 `source.example.js` 一个样板（走网易官方接口，只能出免费曲）——**换成你自己的音源才有意义**。

加音源有两条路，任选。

## 方式一：放进本目录（跟着仓库一起部署）

把脚本文件拷进来，提交推送即可 —— Vercel 会重新部署，`vercel.json` 里的 `includeFiles: sources/**`
保证它们被打进函数。

> ⚠️ **公开仓库要注意**：音源脚本是第三方作品，放进公开仓库可能招来作者或平台的投诉，
> 也可能把别人接口里的密钥一起公开。要么接受这个风险，要么用下面的方式二。

## 方式二：在线 URL（不重新部署也能换源）

在 Vercel 项目设置里加一个环境变量：

```
SOURCE_URLS = https://gist.githubusercontent.com/xxx/raw/a.js,https://你的服务器/b.js
```

多个地址用逗号分隔。函数冷启动时会去拉取并执行，**改脚本不用重新部署**，
想立刻生效就在 `/api/health?refresh=1` 触发一次重新装载。

同名的文件以**远端为准**（远端当作"更新过的版本"）。拉取超时默认 8 秒，可用 `SOURCE_URL_TIMEOUT_MS` 调。

## 支持的脚本 API

宿主实现的是洛雪自定义源的那套契约，脚本可以直接用：

- `lx.on(EVENT_NAMES.request, ({source, action, info}) => Promise)`，`action` 只有 `musicUrl` / `lyric` / `pic`
- `lx.send(EVENT_NAMES.inited, {status, sources})` 声明自己支持哪些平台（`wy`/`kg`/`tx`/`kw`/`mg`）
- `lx.request(url, {method, headers, body, form, timeout}, cb)`，回调 `(err, resp, body)`
  - `resp.body` 是**已解析对象**，第三个参数是**原始文本**（两种写法都通吃）
- `lx.utils`：`buffer` / `crypto`（md5、aes、rsa）/ `zlib` —— Node 原生实现，不需要垫片
- 运行时全局：`console`、`setTimeout`、`fetch`、`Buffer`、`node:crypto` 等都有

**加密音源**（整文件密文、靠洛雪客户端解密的那种）跑不了，必须是明文 JS。

## 相关环境变量（Vercel 项目设置里配）

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `SOURCE_URLS` | 空 | 远端音源地址，逗号分隔 |
| `ALLOW_ORIGINS` | 空（只放行同源） | 允许跨站调用的来源，逗号分隔 |
| `API_TOKEN` | 空 | 设了就要求 `?token=` 或 `Authorization: Bearer`（白名单挡不住伪造 header，这个才挡得住） |
| `QUALITY` | `320k` | 默认音质 `128k`/`320k`/`flac`/`flac24bit` |
| `VERIFY` | 开 | `off` 跳过直链探活（快，但可能发到死链） |
| `URL_CACHE_SECONDS` | `900` | 直链缓存（放在 CDN 边缘，命中的请求根本不进函数） |
| `RESOLVE_CONCURRENCY` / `RESOLVE_HEDGE_MS` / `INVOKE_TIMEOUT_MS` | `3` / `300` / `20000` | 多音源对冲参数 |
| `SETTLE_MS` | `1500` | 冷启动等异步音源自举的上限 |
| `ALLOW_NO_ORIGIN` | 关 | `1` = 也允许不带 Origin/Referer 的请求 |

部署完打开 `https://你的域名/api/health` 就能看到装上了哪些音源、各自的声明平台和已记录的失败原因。
