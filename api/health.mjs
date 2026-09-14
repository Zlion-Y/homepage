/**
 * GET /api/health —— 自检：哪些音源装上了、各自的成绩与熔断状态
 * 等价于原项目首页的"自检"信息，方便在没有控制台的情况下排查。
 */
import { status } from '../lib/registry.mjs'

export async function GET() {
  const s = await status()
  return new Response(
    JSON.stringify(
      {
        ok: s.hosts.some((h) => h.ready),
        host: 'zlion-music-vercel',
        build: process.env.VERCEL_GIT_COMMIT_SHA || 'dev',
        region: process.env.VERCEL_REGION || 'local',
        ...s,
      },
      null,
      2
    ),
    { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }
  )
}
