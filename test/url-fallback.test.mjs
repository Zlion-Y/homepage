/**
 * /api/url 端到端测试：机房判死 ≠ 访客判死。
 *
 * 做法是把 **CDN 主机**（`*.music.126.net`）的探活响应按模式伪造，再真的调一次 GET——
 * 音源脚本请求的是各家后端接口（*.163.com 等），不受这个伪造影响，所以"解析"是真跑的，
 * 只有"探活看到的响应"是假的：
 *   ok   —— 不伪造（真网络）：干净链，应 code 0 + verified true
 *   soft —— 一律 413（机房侧实测就是这个：Maximum message size exceeded）：
 *           应 code 0 + verified false + 仍然带 url（下发，交给访客侧浏览器判定）
 *   dead —— 一律 404（文件没了）：应 502，不允许下发
 *
 * 需要外网（音源后端 + 解析），跑法见 package.json 的 test:e2e。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

let mode = 'ok'
const realFetch = globalThis.fetch
globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input && input.url ? input.url : String(input)
  const isCdn = /^https?:\/\/[^/]*\.music\.126\.net\//.test(url)
  if (isCdn && mode === 'soft') {
    return Promise.resolve(new Response('Maximum message size exceeded', { status: 413 }))
  }
  if (isCdn && mode === 'dead') {
    return Promise.resolve(new Response('gone', { status: 404 }))
  }
  return realFetch(input, init)
}

const { GET } = await import('../api/url.mjs')

async function callApi(id = '316157') {
  const request = new Request(
    `https://www.zlion.top/api/url?source=wy&quality=320k&id=${id}&debug=1`,
    { headers: { referer: 'https://www.zlion.top' } }
  )
  const res = await GET(request)
  return { status: res.status, body: await res.json() }
}

test('CDN 正常 → 干净链（verified true）', async () => {
  mode = 'ok'
  const { status, body } = await callApi()
  assert.equal(status, 200)
  assert.equal(body.code, 0)
  assert.equal(body.verified, true)
  assert.match(String(body.url), /^https?:\/\/[^/]*\.music\.126\.net\//)
})

test('CDN 一律 413（模拟机房）→ 仍然下发，verified false', async () => {
  mode = 'soft'
  const { status, body } = await callApi()
  assert.equal(status, 200, '不应再回 502：链接对访客是可用的')
  assert.equal(body.code, 0)
  assert.equal(body.verified, false)
  assert.match(String(body.url), /^https?:\/\/[^/]*\.music\.126\.net\//)
  assert.equal(body.trace && body.trace.verify, 'soft')
})

test('CDN 一律 404（文件没了）→ 502，不下发', async () => {
  mode = 'dead'
  const { status, body } = await callApi()
  assert.equal(status, 502)
  assert.equal(body.code, 1)
  assert.equal(body.url, undefined)
  assert.ok(body.trace, 'debug=1 应带回逐音源溯源')
  assert.equal(body.trace.verify, 'fail')
})
