/**
 * GET /netease-search → 网易网页搜索（B15，经函数代发防风控）
 * 参数白名单：s / type / limit / offset
 */
import { corsHeaders, json } from '../lib/http.mjs'
import { neteaseFetch } from '../lib/netease.mjs'

export async function GET(request) {
  const cors = corsHeaders(request)
  if (!cors) return json({ code: 403, msg: '来源不在白名单' }, { status: 403 })
  const url = new URL(request.url)
  const q = new URLSearchParams()
  for (const k of ['s', 'type', 'limit', 'offset']) {
    const v = url.searchParams.get(k)
    if (v != null && v !== '') q.set(k, v.slice(0, 256))
  }
  if (!q.get('s')) return json({ code: 1, msg: '缺少 s 参数' }, { status: 400, extra: cors })
  return neteaseFetch('/api/search/get/web', q, { maxAge: 300, cors })
}

export async function OPTIONS(request) {
  const cors = corsHeaders(request)
  if (!cors) return new Response(null, { status: 403 })
  return new Response(null, { status: 204, headers: cors })
}
