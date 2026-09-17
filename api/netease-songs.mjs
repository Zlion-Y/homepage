/**
 * GET /netease-songs?ids=[id,id,...] → 歌曲详情批量（B15，经函数代发防风控）
 */
import { corsHeaders, json } from '../lib/http.mjs'
import { neteaseFetch } from '../lib/netease.mjs'

export async function GET(request) {
  const cors = corsHeaders(request)
  if (!cors) return json({ code: 403, msg: '来源不在白名单' }, { status: 403 })
  const ids = (new URL(request.url).searchParams.get('ids') || '').trim()
  if (!/^\[\d{1,19}(,\d{1,19}){0,999}\]$/.test(ids)) {
    return json({ code: 1, msg: '缺少或非法 ids' }, { status: 400, extra: cors })
  }
  return neteaseFetch('/api/song/detail/', new URLSearchParams({ ids }), { maxAge: 3600, cors })
}

export async function OPTIONS(request) {
  const cors = corsHeaders(request)
  if (!cors) return new Response(null, { status: 403 })
  return new Response(null, { status: 204, headers: cors })
}
