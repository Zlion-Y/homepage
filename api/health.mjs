/**
 * GET /api/health —— 自检：哪些音源装上了、各自的成绩与熔断状态
 * 等价于原项目首页的"自检"信息，方便在没有控制台的情况下排查。
 *
 * GET /api/health?refresh=1 —— 先强制重装全部音源（dispose 后重新 load），
 * 用于「不重新部署也能换音源」：改了远端 SOURCE_URLS 指向的脚本后，
 * 带上该参数即可让 warm 实例立刻重新拉取，无需等冷启动。
 */
import { status, refresh } from '../lib/registry.mjs'
import { corsHeaders, json, tokenOK } from '../lib/http.mjs'

export async function GET(request) {
  const cors = corsHeaders(request)
  if (!cors) return json({ code: 403, msg: '来源不在白名单' }, { status: 403 })
  if (!tokenOK(request, new URL(request.url))) {
    return json({ code: 401, msg: '需要 token' }, { status: 401, extra: cors })
  }
  const wantRefresh = new URL(request.url).searchParams.get('refresh') === '1'
  const s = wantRefresh ? await refresh() : await status()
  if (wantRefresh) {
    console.log(
      `♻️  音源已强制重装: hosts=${s.hosts.length}, ready=${s.hosts.filter((h) => h.ready).length}`
    )
  }
  const body = {
    ok: s.hosts.some((h) => h.ready),
    host: 'zlion-music-vercel',
    build: process.env.VERCEL_GIT_COMMIT_SHA || 'dev',
    region: process.env.VERCEL_REGION || 'local',
    refreshed: wantRefresh,
    ...s,
  }
  // cors 是 Headers 实例，不能 ...spread 进对象字面量（Headers 无可枚举自有属性，
  // 展开结果为空、CORS 头全丢——lib/netease.mjs 顶部注释记过同一个坑），先拷进新 Headers
  const hdrs = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  cors.forEach((v, k) => hdrs.set(k, v))
  return new Response(JSON.stringify({ ...body }, null, 2), { headers: hdrs })
}

export async function OPTIONS(request) {
  const cors = corsHeaders(request)
  if (!cors) return new Response(null, { status: 403 })
  return new Response(null, { status: 204, headers: cors })
}
