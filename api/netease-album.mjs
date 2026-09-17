/**
 * GET /netease-album/:id → 专辑详情（B15，经函数代发防风控）
 * 路径参数由 vercel.json rewrite 转成 ?id=
 */
import { corsHeaders, json } from '../lib/http.mjs'
import { neteaseFetch } from '../lib/netease.mjs'

export async function GET(request) {
  const cors = corsHeaders(request)
  if (!cors) return json({ code: 403, msg: '来源不在白名单' }, { status: 403 })
  const id = (new URL(request.url).searchParams.get('id') || '').trim()
  if (!/^\d{1,19}$/.test(id)) {
    return json({ code: 1, msg: '缺少或非法 id' }, { status: 400, extra: cors })
  }
  return neteaseFetch('/api/v1/album/' + id, null, { maxAge: 3600, cors })
}

export async function OPTIONS(request) {
  const cors = corsHeaders(request)
  if (!cors) return new Response(null, { status: 403 })
  return new Response(null, { status: 204, headers: cors })
}
