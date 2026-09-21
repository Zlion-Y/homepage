/**
 * 探活分类单测：钉住"什么才算真的死链"。
 *
 * 背景（见 lib/verify.mjs 头部）：探活跑在**机房出口**，链接是给**访客**用的。实测同一条网易
 * 车机链（iot*.music.126.net）机房取用 HTTP 413、国内住宅 IP 取用 200/206。所以只有
 * "文件本身没了"（404/410/451）能作为否决理由，其余 4xx/5xx/超时/HTML 一律不否决。
 *
 * 走 verifyDirectLink 的正式参数 fetchImpl 注入响应，不碰网络（200/206 用例会经
 * guardFinalUrl 做一次 DNS 解析，需要能解析 iot102.music.126.net）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verifyDirectLink } from '../lib/verify.mjs'

const CDN = 'https://iot102.music.126.net/obj/x.mp3'
// verify.mjs 只读 r.status / r.headers.get() / r.url，鸭子类型的响应对象就够
const res = (status, type = 'audio/mpeg') => ({
  status,
  headers: new Headers({ 'content-type': type }),
  url: CDN,
})
const once = (r) => async () => r
const byMethod = (head, get) => async (_url, init) => (init && init.method === 'HEAD' ? head : get)

test('200 / 206 + audio/mpeg 认定为活链', async () => {
  for (const status of [200, 206]) {
    const out = await verifyDirectLink(CDN, { fetchImpl: once(res(status)) })
    assert.equal(out.status, status)
  }
})

test('HEAD 403 + GET 206 → 活链（不支持 HEAD 不能当死链）', async () => {
  const out = await verifyDirectLink(CDN, { fetchImpl: byMethod(res(403), res(206)) })
  assert.equal(out.status, 206)
})

test('404 / 410 / 451 → 硬失败（文件没了，任何出口都是这个结论）', async () => {
  for (const status of [404, 410, 451]) {
    await assert.rejects(
      () => verifyDirectLink(CDN, { fetchImpl: once(res(status)) }),
      (e) => e.hard === true,
      `HTTP ${status} 应判硬失败`
    )
  }
})

test('413 → 不否决：这是"CDN 不接受这个取用方"，不是链接死了', async () => {
  await assert.rejects(
    () => verifyDirectLink(CDN, { fetchImpl: once(res(413, 'text/plain')) }),
    (e) => e.hard === false && /413/.test(e.message)
  )
})

test('401 / 403 → 不否决（反盗链/区域策略可能只针对机房）', async () => {
  for (const status of [401, 403]) {
    await assert.rejects(
      () => verifyDirectLink(CDN, { fetchImpl: once(res(status)) }),
      (e) => e.hard === false,
      `HTTP ${status} 不应否决`
    )
  }
})

test('其余 4xx（如 416/429）→ 不否决', async () => {
  for (const status of [416, 429]) {
    await assert.rejects(
      () => verifyDirectLink(CDN, { fetchImpl: once(res(status)) }),
      (e) => e.hard === false
    )
  }
})

test('5xx / 网络层错误 / 超时 → 不否决', async () => {
  await assert.rejects(
    () => verifyDirectLink(CDN, { fetchImpl: once(res(502)) }),
    (e) => e.hard === false
  )
  await assert.rejects(
    () =>
      verifyDirectLink(CDN, {
        fetchImpl: async () => {
          throw new Error('ECONNRESET')
        },
      }),
    (e) => e.hard === false
  )
})

test('200 + text/html → 不否决（机房拿到的 HTML 可能只是区域拒绝页）', async () => {
  await assert.rejects(
    () => verifyDirectLink(CDN, { fetchImpl: once(res(200, 'text/html; charset=utf-8')) }),
    (e) => e.hard === false
  )
})
