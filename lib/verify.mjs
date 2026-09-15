/**
 * 直链探活：过滤死链（原项目 verify.go 的等价物）
 *
 * 关键改动（为了省 Vercel 的 Active CPU 与出口流量）：
 *   - 只发 HEAD；上游不支持 HEAD 时退化成 `Range: bytes=0-1` 的 GET，绝不整首下载；
 *   - 默认超时 4s，比 Go 版的 5s 更紧；
 *   - 403/404/410 视为硬失败（换音源），5xx/超时视为软失败（可以直接信）。
 */

const HARD = new Set([401, 403, 404, 410, 451])

export async function verifyDirectLink(url, { timeout = 4000, fetchImpl = globalThis.fetch } = {}) {
  if (!/^https?:\/\//i.test(url)) throw hardErr('不是合法直链')
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeout)
  try {
    let r = await fetchImpl(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { Range: 'bytes=0-1' },
    })
    // 有些 CDN 对 HEAD 返回 405/501，换成 Range GET 再来一次
    if (r.status === 405 || r.status === 501 || r.status === 403) {
      r = await fetchImpl(url, {
        method: 'GET',
        redirect: 'follow',
        signal: ctrl.signal,
        headers: { Range: 'bytes=0-1' },
      })
    }
    if (HARD.has(r.status) || r.status >= 400) {
      throw hardErr(`直链不可用: HTTP ${r.status}`)
    }
    const type = r.headers.get('content-type') || ''
    if (/^text\/html/i.test(type) && r.status === 200) {
      // 常见死链形态：CDN 用 200 + HTML 错误页回应
      throw hardErr('直链返回的是 HTML 页面，判为死链')
    }
    return { status: r.status, contentType: type }
  } catch (e) {
    if (e && e.name === 'AbortError') throw softErr('探活超时')
    throw e
  } finally {
    clearTimeout(t)
  }
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
