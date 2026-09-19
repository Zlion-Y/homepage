/**
 * 直链探活：过滤死链（原项目 verify.go 的等价物）
 *
 * 关键改动（为了省 Vercel 的 Active CPU 与出口流量）：
 *   - 只发 HEAD 与 `Range: bytes=0-1` 的 GET，绝不整首下载；
 *   - **HEAD 与 GET 同时发，谁先判"活链"用谁**（见下方 2026-09 的实测说明）；
 *   - 默认超时 1.5s（原先 4s，线上实测白等一整个 timeout 是"解析慢 4 秒"的主因）；
 *   - 401/403/404/410/451 与 200+HTML 视为硬失败（换音源），5xx/超时视为软失败（直接信）。
 *
 * 为什么要把 HEAD 和 GET 一起发（2026-09-17 实测）：
 *   线上 /api/url 的逐音源溯源显示，某类直链（网易车机场景链 iot*.music.126.net，
 *   VIP 曲往往只有它出得来）在 Vercel hkg1 的机房出口上**根本不应答 HEAD**：
 *   原来"先 HEAD，超时了才退化成 GET"的写法会让每次这类解析白等一个完整 timeout，
 *   实测 +4.1~4.6 秒/曲（赢家其实 1.0 秒就返回了），是"VIP 加载慢得要死"的主因；
 *   而这条链用 GET 是通的 —— 探活真正要回答的问题就是"链路活不活"。
 *   并发发出后：活链立刻返回（不浪费一个 timeout），先出现硬失败时再等另一条确认，
 *   避免把"不支持 HEAD"误判成死链。
 *
 * 默认超时为什么是 0.9s（而不是 4s）：实测这类 CDN 的响应是**双峰**的 ——
 * 要么几百毫秒内就有结论，要么压根不回（此时并发两条一起等满也没用）。而"超时"本来就
 * 归类成软失败（放行），等更久换不来任何信息，只换来用户多等。0.9s 足够接住正常的
 * 403/404/HTML 判定，又不会为一次不回包的探活白搭一秒以上。
 */

import { assertPublicHttpUrl } from './lx-host.mjs'

const HARD = new Set([401, 403, 404, 410, 451])

// 落地 URL 复核：探活跟随 30x 后的最终地址也要过内网/元数据校验 —— 与
// lx-host.mjs 里 lx.request 的落地复核保持一致（首跳公网、302 跳内网的绕过路径）
async function guardFinalUrl(r) {
  try {
    await assertPublicHttpUrl(r.url)
  } catch (e) {
    throw hardErr('直链重定向到内网/非法地址: ' + (e && e.message))
  }
}

export async function verifyDirectLink(url, { timeout = 900, fetchImpl = globalThis.fetch } = {}) {
  if (!/^https?:\/\//i.test(url)) throw hardErr('不是合法直链')
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeout)

  const attempt = (method) =>
    fetchImpl(url, {
      method,
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { Range: 'bytes=0-1' },
    }).then(
      (r) => ({ r }),
      (e) => ({ e })
    )

  try {
    const head = attempt('HEAD')
    const get = attempt('GET')

    // 第一条落定的结果：是活链就立刻收工（不必等另一个）
    const first = await Promise.race([
      head.then((v) => ({ tag: 'head', v })),
      get.then((v) => ({ tag: 'get', v })),
    ])
    const c1 = classify(first.v)
    if (c1.ok) {
      await guardFinalUrl(first.v.r)
      return { status: c1.status, contentType: c1.type }
    }

    // 第一条不是活链 → 等另一条确认（HEAD 403 / 不被支持 都可能被 GET 翻案）
    const second = await (first.tag === 'head' ? get : head)
    const c2 = classify(second.v)
    if (c2.ok) {
      await guardFinalUrl(second.v.r)
      return { status: c2.status, contentType: c2.type }
    }

    // 两条都不是活链：只要有硬失败就报硬失败（换源）；都是软失败则报软失败（调用方放行）
    if (c1.hard) throw c1.error
    if (c2.hard) throw c2.error
    throw c1.error
  } finally {
    clearTimeout(t)
    ctrl.abort() // 收掉落败的那条在飞请求
  }
}

/** 把一次 attempt 的落定结果归类成 活链 / 硬失败 / 软失败 */
function classify(res) {
  if (res.e) {
    if (res.e.name === 'AbortError') return { ok: false, hard: false, error: softErr('探活超时') }
    return { ok: false, hard: true, error: res.e }
  }
  const { r } = res
  const type = r.headers.get('content-type') || ''
  if (HARD.has(r.status)) return { ok: false, hard: true, error: hardErr(`直链不可用: HTTP ${r.status}`) }
  if (r.status >= 500) return { ok: false, hard: false, error: softErr(`上游 HTTP ${r.status}`) }
  if (r.status >= 400) return { ok: false, hard: true, error: hardErr(`直链不可用: HTTP ${r.status}`) }
  if (/^text\/html/i.test(type) && r.status === 200) {
    // 常见死链形态：CDN 用 200 + HTML 错误页回应
    return { ok: false, hard: true, error: hardErr('直链返回的是 HTML 页面，判为死链') }
  }
  return { ok: true, status: r.status, type }
}

function hardErr(msg) {
  const e = new Error(msg)
  e.hard = true
  return e
}
function softErr(msg) {
  const e = new Error(msg)
  e.hard = false
  return e
}
