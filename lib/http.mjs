/**
 * 边缘访问控制 + 缓存策略
 *
 * 原项目用 Origin/Referer 白名单 + 免登录接口白名单，这套在这里继续用；
 * 另外加一个真正的鉴权手段（API_TOKEN），因为白名单只是"防蹭用"，伪造 header 即可绕过。
 */
import { createHash, timingSafeEqual } from 'node:crypto'

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

/** 安全取 origin：畸形 Referer 不能让 new URL 抛错把整个函数打成 500 */
function safeOrigin(value) {
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

/** 常数时间比较：先统一哈希抹平长度差，再比摘要（避免长度泄露 + 时序侧信道） */
function tokenEquals(candidate) {
  const a = createHash('sha256').update(String(candidate)).digest()
  const b = createHash('sha256').update(API_TOKEN).digest()
  return timingSafeEqual(a, b)
}

export function corsHeaders(req) {
  const origin = req.headers.get('origin') || ''
  const ref = req.headers.get('referer') || ''
  const refOrigin = safeOrigin(ref)
  let ok
  if (ALLOW.length) {
    // 配了白名单就按白名单；同源的请求也一并放行。
    // 畸形 Referer 视同没有 Referer（走 ALLOW_NO_ORIGIN），不能让它抛错打成 500
    ok = origin
      ? ALLOW.includes(origin) || sameOrigin(origin, req.url)
      : ref
        ? refOrigin != null && (ALLOW.includes(refOrigin) || sameOrigin(ref, req.url))
        : ALLOW_NO_ORIGIN
  } else if (origin) {
    ok = sameOrigin(origin, req.url)
  } else if (ref) {
    ok = sameOrigin(ref, req.url)
  } else {
    ok = ALLOW_NO_ORIGIN
  }
  if (!ok) {
    // 拒绝原因落到 Runtime Logs，排查"为什么我的 curl / 跨域调用被 403"不用再盲猜
    console.warn(
      `[cors] 拒绝 ${req.method} ${new URL(req.url).pathname} host=${req.headers.get('host')} ` +
        `origin=${origin || '(无)'} referer=${ref || '(无)'} ` +
        `白名单=${ALLOW.length ? ALLOW.join(',') : '(未配置,仅同源)'} allowNoOrigin=${ALLOW_NO_ORIGIN}`
    )
    return null
  }
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
  // 同源请求豁免：能不能信任"来自本站"已由 corsHeaders 的 origin/referer 校验把关，
  // 自家前端（MusicCard 调 /api/url）从不带 token——没有这条豁免，一设 API_TOKEN
  // 自己站上的音乐就全部 401 降级回 Meting。token 只用于管跨站/无 Origin 的调用方
  const origin = req.headers.get('origin') || ''
  const ref = req.headers.get('referer') || ''
  if ((origin && sameOrigin(origin, req.url)) || (ref && sameOrigin(ref, req.url))) {
    return true
  }
  if (url.searchParams.has('token') && tokenEquals(url.searchParams.get('token'))) return true
  const auth = req.headers.get('authorization') || ''
  return auth.startsWith('Bearer ') && tokenEquals(auth.slice(7))
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
