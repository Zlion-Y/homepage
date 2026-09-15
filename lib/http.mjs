/**
 * 边缘访问控制 + 缓存策略
 *
 * 原项目用 Origin/Referer 白名单 + 免登录接口白名单，这套在这里继续用；
 * 另外加一个真正的鉴权手段（API_TOKEN），因为白名单只是"防蹭用"，伪造 header 即可绕过。
 */

// 默认**零配置**：只放行"同源"调用——请求里带的 Origin/Referer 主机与请求本身的主机一致才通过。
// 这样部署到你自己的域名后不用改任何东西；要允许**跨站**调用（比如前端和函数不同域），
// 再配 ALLOW_ORIGINS（逗号分隔的完整 Origin，如 https://www.example.com）。
const ALLOW = (process.env.ALLOW_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const ALLOW_NO_ORIGIN = process.env.ALLOW_NO_ORIGIN === '1'
const API_TOKEN = process.env.API_TOKEN || ''

/** 同源判定：请求头里的 host 与 URL 的 host 相同 */
function sameOrigin(value, reqUrl) {
  if (!value) return false
  try {
    return new URL(value).host === new URL(reqUrl).host
  } catch {
    return false
  }
}

export function corsHeaders(req) {
  const origin = req.headers.get('origin') || ''
  const ref = req.headers.get('referer') || ''
  let ok
  if (ALLOW.length) {
    // 配了白名单就按白名单；同源的请求也一并放行
    ok = origin
      ? ALLOW.includes(origin) || sameOrigin(origin, req.url)
      : ref
        ? ALLOW.includes(new URL(ref).origin) || sameOrigin(ref, req.url)
        : ALLOW_NO_ORIGIN
  } else if (origin) {
    ok = sameOrigin(origin, req.url)
  } else if (ref) {
    ok = sameOrigin(ref, req.url)
  } else {
    ok = ALLOW_NO_ORIGIN
  }
  if (!ok) return null
  const h = new Headers({
    // 必须 Vary: Origin —— 否则 Vercel CDN 会把 A 站点的 CORS 响应复用给 B 站点
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
  })
  if (origin) h.set('Access-Control-Allow-Origin', origin)
  return h
}

export function tokenOK(req, url) {
  if (!API_TOKEN) return true
  if (url.searchParams.get('token') === API_TOKEN) return true
  const auth = req.headers.get('authorization') || ''
  return auth === `Bearer ${API_TOKEN}`
}

export function json(data, { status = 200, maxAge = 0, extra = {} } = {}) {
  const headers = new Headers(extra)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  headers.set(
    'Cache-Control',
    maxAge > 0
      ? `public, s-maxage=${maxAge}, stale-while-revalidate=60`
      : 'no-store'
  )
  return new Response(JSON.stringify(data), { status, headers })
}

export const allowList = ALLOW
