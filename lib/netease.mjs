import { json } from './http.mjs'

/**
 * 网易网页接口代发（B15）
 *
 * 原先 vercel.json 把 /netease-* 直接 rewrite 到 music.163.com：Vercel HK 出口
 * 不带 Referer/UA 的裸请求容易触发网易风控，封面/搜索静默降级。
 * 改为函数内代发并伪装常规浏览器头；路径固定、参数白名单化，不构成通用代理。
 */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const TIMEOUT_MS = Number(process.env.NETEASE_TIMEOUT_MS || 8000)
// 响应体封顶：上游固定是网易官方接口，正常响应很小；异常超大响应不进内存
//（与 lx.request 的 8MB 上限对齐，这里给 4MB 足够）
const MAX_BODY_BYTES = 4 * 1024 * 1024

export async function neteaseFetch(pathname, searchParams, { maxAge = 600, cors = {} } = {}) {
  const target = 'https://music.163.com' + pathname + (searchParams ? '?' + searchParams.toString() : '')
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(target, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Referer: 'https://music.163.com/', Accept: '*/*' },
    })
    if (!r.ok) {
      console.warn('[netease] 上游 HTTP ' + r.status, pathname)
      return json({ code: r.status, msg: '网易接口 HTTP ' + r.status }, { status: 502, extra: cors })
    }
    const declared = Number(r.headers.get('content-length') || 0)
    if (declared > MAX_BODY_BYTES) throw new Error('网易接口响应体过大: ' + declared)
    const body = await r.text()
    if (body.length > MAX_BODY_BYTES) throw new Error('网易接口响应体过大')
    try {
      JSON.parse(body) // 只校验可解析，不吞内容：原样透传给前端
    } catch {
      console.warn('[netease] 非法 JSON 响应', pathname)
      return json({ code: 1, msg: '网易接口返回异常' }, { status: 502, extra: cors })
    }
    // cors 是 Headers 实例，直接 ...spread 会丢（Headers 无可枚举自有属性），要先拷进新 Headers
    const hdrs = new Headers({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, s-maxage=' + maxAge + ', stale-while-revalidate=60',
    })
    if (cors && typeof cors.forEach === 'function') cors.forEach((v, k) => hdrs.set(k, v))
    return new Response(body, { status: 200, headers: hdrs })
  } catch (e) {
    console.warn('[netease] 请求失败:', e && e.message, pathname)
    return json({ code: 1, msg: '网易接口请求失败' }, { status: 502, extra: cors })
  } finally {
    clearTimeout(t)
  }
}
