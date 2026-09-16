/**
 * GET /api/health —— 自检：哪些音源装上了、各自的成绩与熔断状态
 * 等价于原项目首页的"自检"信息，方便在没有控制台的情况下排查。
 *
 * GET /api/health?refresh=1 —— 先强制重装全部音源（dispose 后重新 load），
 * 用于「不重新部署也能换音源」：改了远端 SOURCE_URLS 指向的脚本后，
 * 带上该参数即可让 warm 实例立刻重新拉取，无需等冷启动。
 */
import { status, refresh } from '../lib/registry.mjs'

export async function GET(request) {
  const wantRefresh = new URL(request.url).searchParams.get('refresh') === '1'
  const s = wantRefresh ? await refresh() : await status()
  if (wantRefresh) {
    console.log(
      `♻️  音源已强制重装: hosts=${s.hosts.length}, ready=${s.hosts.filter((h) => h.ready).length}`
    )
  }
  return new Response(
    JSON.stringify(
      {
        ok: s.hosts.some((h) => h.ready),
        host: 'zlion-music-vercel',
        build: process.env.VERCEL_GIT_COMMIT_SHA || 'dev',
        region: process.env.VERCEL_REGION || 'local',
        refreshed: wantRefresh,
        ...s,
      },
      null,
      2
    ),
    { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }
  )
}
