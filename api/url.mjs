/**
 * GET /api/url —— 取直链（等价于原项目 /api/url）
 *
 * 原理不变：服务端只解析出直链，音频字节由客户端直接从平台 CDN 拉。
 * Vercel 化的两处关键设计：
 *   1) 响应带 s-maxage=900 —— 把原项目 15 分钟的"进程内内存缓存"搬到 Vercel CDN 边缘，
 *      命中缓存时根本不进函数（不消耗 Function Invocations / Active CPU）；
 *   2) 多音源对冲全部发生在**单次函数调用内**，不依赖任何跨请求状态。
 *
 * 入参：?source=wy&quality=320k&id=xxx（也接受 songmid / hash / rid；可一起传）
 */
import { hostsFor, scheduler } from '../lib/registry.mjs'
import { verifyDirectLink } from '../lib/verify.mjs'
import { corsHeaders, json, tokenOK } from '../lib/http.mjs'

// 注意：非 Next.js 项目里没有 `export const config = {...}` 这种写法，
// 函数配置一律写在 vercel.json 的 functions 段里（已配 maxDuration / includeFiles）。

const QUALITY = ['128k', '320k', 'flac', 'flac24bit']

export async function GET(request) {
  const cors = corsHeaders(request)
  if (!cors) return json({ code: 403, msg: '来源不在白名单' }, { status: 403 })

  const url = new URL(request.url)
  if (!tokenOK(request, url)) {
    return json({ code: 401, msg: '需要 token' }, { status: 401, extra: cors })
  }

  const source = (url.searchParams.get('source') || 'wy').trim()
  let quality = (url.searchParams.get('quality') || process.env.QUALITY || '320k').trim()
  if (!QUALITY.includes(quality)) quality = '320k'

  // 各平台 id 字段不同，宿主把能给的都给上，脚本自己挑（与 Go 版一致）
  const musicInfo = {}
  for (const k of ['id', 'songmid', 'hash', 'rid', 'name', 'singer', 'albumId', 'albumName', 'duration', 'interval']) {
    const v = url.searchParams.get(k)
    if (v != null && v !== '') musicInfo[k] = v
  }
  if (Object.keys(musicInfo).length === 0) {
    return json({ code: 1, msg: '缺少 id / songmid / hash / rid' }, { status: 400, extra: cors })
  }

  const hosts = await hostsFor(source)
  if (hosts.length === 0) {
    return json({ code: 1, msg: `没有可用音源实现 ${source}` }, { status: 503, extra: cors })
  }

  try {
    const r = await scheduler.resolveWithHedge({
      source,
      action: 'musicUrl',
      info: { musicInfo, type: quality, quality },
      hosts,
      // 客户端断了就没必要继续问音源了：把 Vercel 的 AbortSignal 直接透传下去，
      // 一次断连能立刻掐掉所有在飞的上游请求（省 Active CPU）。需要 vercel.json 开 supportsCancellation。
      signal: request.signal,
    })

    let link = String(r.value || '').trim()
    if (!link) throw new Error('音源返回空直链')
    link = link.replace(/^http:\/\//i, 'https://')

    if (process.env.VERIFY !== 'off') {
      try {
        await verifyDirectLink(link)
      } catch (e) {
        return json(
          { code: 1, msg: '直链校验未通过：' + e.message, source, via: r.via, tries: r.tries },
          { status: 502, extra: cors }
        )
      }
    }

    return json(
      { code: 0, source, quality, url: link, via: r.via, ms: r.ms, tries: r.tries },
      { maxAge: Number(process.env.URL_CACHE_SECONDS || 900), extra: cors }
    )
  } catch (e) {
    return json({ code: 1, msg: String(e.message || e), tries: e.tries || [] }, { status: 502, extra: cors })
  }
}

export async function OPTIONS(request) {
  const cors = corsHeaders(request)
  if (!cors) return new Response(null, { status: 403 })
  return new Response(null, { status: 204, headers: cors })
}
