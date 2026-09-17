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
// source 白名单：防止任意字符串传到 hostsFor 造成资源探测/异常
const SOURCES = ['wy', 'kw', 'kg', 'qq', 'xm', 'mg']
// 单参数最大长度：id/hash 等通常很短，限 256 防超长注入
const MAX_PARAM = 256

export async function GET(request) {
  const cors = corsHeaders(request)
  if (!cors) return json({ code: 403, msg: '来源不在白名单' }, { status: 403 })

  const url = new URL(request.url)
  if (!tokenOK(request, url)) {
    return json({ code: 401, msg: '需要 token' }, { status: 401, extra: cors })
  }

  const source = (url.searchParams.get('source') || 'wy').trim()
  if (!SOURCES.includes(source)) {
    return json({ code: 1, msg: `不支持的 source: ${source}` }, { status: 400, extra: cors })
  }
  let quality = (url.searchParams.get('quality') || process.env.QUALITY || '320k').trim()
  if (!QUALITY.includes(quality)) quality = '320k'

  // 各平台 id 字段不同，宿主把能给的都给上，脚本自己挑（与 Go 版一致）
  const musicInfo = {}
  for (const k of ['id', 'songmid', 'hash', 'rid', 'name', 'singer', 'albumId', 'albumName', 'duration', 'interval']) {
    let v = url.searchParams.get(k)
    if (v == null || v === '') continue
    if (v.length > MAX_PARAM) {
      return json({ code: 1, msg: `参数 ${k} 过长` }, { status: 400, extra: cors })
    }
    // C2：数值参数做格式校验（id 纯数字），防异常值穿透进音源脚本
    if (k === 'id' && !/^\d{1,19}$/.test(v)) {
      return json({ code: 1, msg: '参数 id 必须是数字' }, { status: 400, extra: cors })
    }
    musicInfo[k] = v
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
    const rawLink = link
    const wasHttp = /^http:\/\//i.test(link)
    link = wasHttp ? 'https://' + link.slice(7) : link

    if (process.env.VERIFY !== 'off') {
      // 探活三态：ok=可用 / soft=5xx 或超时（上游抖动，直链仍可信，放行）/ fail=硬失败
      const probe = async (u) => {
        try {
          await verifyDirectLink(u)
          return 'ok'
        } catch (e) {
          return e.hard === false ? 'soft' : 'fail'
        }
      }
      let st = await probe(link)
      // B16：https 探活硬失败时回退探测原始 http 直链（部分平台 CDN 只有 http 可达）
      if (st === 'fail' && wasHttp) {
        const st2 = await probe(rawLink)
        if (st2 !== 'fail') {
          st = st2
          link = rawLink
        }
      }
      if (st === 'fail') {
        // 细节只进 Runtime Logs，不对外暴露 via/tries（C4）
        console.warn(
          `[verify] 直链校验未通过 source=${source} via=${r.via} tries=${(r.tries || []).length} url=${link}`
        )
        return json({ code: 1, msg: '直链校验未通过', source }, { status: 502, extra: cors })
      }
    }

    return json(
      // C4：对外只保留泛化字段，via/tries/ms 等实现细节不再下发
      { code: 0, source, quality, url: link },
      { maxAge: Number(process.env.URL_CACHE_SECONDS || 900), extra: cors }
    )
  } catch (e) {
    console.error('[url] 解析失败:', e && e.message) // 细节进日志（C4）
    return json({ code: 1, msg: '解析失败' }, { status: 502, extra: cors })
  }
}

export async function OPTIONS(request) {
  const cors = corsHeaders(request)
  if (!cors) return new Response(null, { status: 403 })
  return new Response(null, { status: 204, headers: cors })
}
