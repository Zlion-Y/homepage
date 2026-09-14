/**
 * 边缘访问控制 + 缓存策略
 *
 * 原项目用 Origin/Referer 白名单 + 免登录接口白名单，这套在这里继续用；
 * 另外加一个真正的鉴权手段（API_TOKEN），因为白名单只是"防蹭用"，伪造 header 即可绕过。
 */

const ALLOW = (process.env.ALLOW_ORIGINS || 'https://www.zlion.top,https://zlion.top')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const ALLOW_NO_ORIGIN = process.env.ALLOW_NO_ORIGIN === '1'
const API_TOKEN = process.env.API_TOKEN || ''

export function corsHeaders(req) {
  const origin = req.headers.get('origin') || ''
  let ok = false
  if (origin) {
    ok = ALLOW.includes(origin)
  } else {
    const ref = req.headers.get('referer') || ''
    try {
      const h = ref ? new URL(ref).origin : ''
      ok = h ? ALLOW.includes(h) : ALLOW_NO_ORIGIN
    } catch {
      ok = ALLOW_NO_ORIGIN
    }
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
