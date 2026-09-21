/**
 * GET /api/url —— 取直链（等价于原项目 /api/url）
 *
 * 原理不变：服务端只解析出直链，音频字节由客户端直接从平台 CDN 拉。
 * Vercel 化的两处关键设计：
 *   1) 响应带 s-maxage=900 —— 把原项目 15 分钟的"进程内内存缓存"搬到 Vercel CDN 边缘，
 *      命中缓存时根本不进函数（不消耗 Function Invocations / Active CPU）；
 *   2) 多音源对冲全部发生在**单次函数调用内**，不依赖任何跨请求状态。
 *
 * 入参：?source=wy&quality=320k&id=xxx（也接受 songmid / hash / rid；可一起传）
 */
import { hostsFor, scheduler } from '../lib/registry.mjs'
import { verifyDirectLink } from '../lib/verify.mjs'
import { assertPublicHttpUrl } from '../lib/lx-host.mjs'
import { corsHeaders, json, tokenOK } from '../lib/http.mjs'

// 注意：非 Next.js 项目里没有 `export const config = {...}` 这种写法，
// 函数配置一律写在 vercel.json 的 functions 段里（已配 maxDuration / includeFiles）。

const QUALITY = ['128k', '320k', 'flac', 'flac24bit']
// source 白名单：防止任意字符串传到 hostsFor 造成资源探测/异常。
// 取值必须是洛雪的平台代号：wy 网易云 / kg 酷狗 / tx QQ音乐 / kw 酷我 / mg 咪咕。
// 2026-09-18 修正：原来写的是 ['wy','kw','kg','qq','xm','mg'] —— `tx`（QQ音乐）漏了、
// `qq`/`xm` 反倒在里面。后果是**请求 tx 直接 400**（明明 8 家音源都声明支持 tx），
// 而请求 qq/xm 会穿过白名单再撞 503「没有可用音源实现」。白名单务必与音源实际声明的平台一致
// （以 /api/health 的 hosts[].sources 为准）。
const SOURCES = ['wy', 'kg', 'tx', 'kw', 'mg']
// 单参数最大长度：id/hash 等通常很短，限 256 防超长注入
const MAX_PARAM = 256

// 探活预算与"不回包主机"备忘（实例内）。
// 实测（hkg1）某些 CDN 主机在机房出口上**压根不回包**，探活每次都白等满整个预算；
// 而"不回包"本来就被归类成软失败（放行）。所以：用满预算的主机记下来，5 分钟内不再为它探活
// ——跳过不可能丢信息（本来就判不出死链），纯粹省等待。每首歌省 ~0.9s。
const VERIFY_TIMEOUT_MS = Number(process.env.VERIFY_TIMEOUT_MS || 900)
const PROBE_SKIP_MS = 5 * 60 * 1000
const probeSkip = new Map() // 直链主机 -> 跳过探活的截止时间

export async function GET(request) {
  const cors = corsHeaders(request)
  if (!cors) return json({ code: 403, msg: '来源不在白名单' }, { status: 403 })

  const url = new URL(request.url)
  if (!tokenOK(request, url)) {
    return json({ code: 401, msg: '需要 token' }, { status: 401, extra: cors })
  }

  // ?debug=1 —— 线上逐音源溯源。同源门槛（+ 可选 API_TOKEN）上面已经把关，这里把
  // 「这次是谁答的 / 每家各花了多久 / 每家失败原因」一并回吐。**必须要有这个**：
  // /api/health 里的 stats 是另一个函数、另一个模块实例，看不到 /api/url 的成绩，
  // 没有它就只能靠"直链指纹"猜是哪家音源在服务。debug 请求一律不缓存（走 CDN 也 MISS）。
  const wantDebug = url.searchParams.get('debug') === '1'
  const trace = (r) => ({
    via: r.via,
    ms: r.ms,
    cancelled: r.cancelled,
    // true = 这次用的是"实测低码率"的兜底结果（等过高码率候选但没等到）
    qualityFallback: !!r.qualityFallback,
    tries: (r.tries || []).map((t) => ({
      file: t.file,
      ok: t.ok,
      ms: t.ms,
      aborted: !!t.aborted,
      err: t.err ? String(t.err).split('\n')[0].slice(0, 120) : undefined,
    })),
  })

  const source = (url.searchParams.get('source') || 'wy').trim()
  if (!SOURCES.includes(source)) {
    return json({ code: 1, msg: `不支持的 source: ${source}` }, { status: 400, extra: cors })
  }
  let quality = (url.searchParams.get('quality') || process.env.QUALITY || '320k').trim()
  if (!QUALITY.includes(quality)) quality = '320k'

  // 各平台 id 字段不同，宿主把能给的都给上，脚本自己挑（与 Go 版一致）
  const musicInfo = {}
  for (const k of ['id', 'songmid', 'hash', 'rid', 'name', 'singer', 'albumId', 'albumName', 'duration', 'interval']) {
    let v = url.searchParams.get(k)
    if (v == null || v === '') continue
    if (v.length > MAX_PARAM) {
      return json({ code: 1, msg: `参数 ${k} 过长` }, { status: 400, extra: cors })
    }
    // C2：数值参数做格式校验（id 纯数字），防异常值穿透进音源脚本
    if (k === 'id' && !/^\d{1,19}$/.test(v)) {
      return json({ code: 1, msg: '参数 id 必须是数字' }, { status: 400, extra: cors })
    }
    musicInfo[k] = v
  }
  if (Object.keys(musicInfo).length === 0) {
    return json({ code: 1, msg: '缺少 id / songmid / hash / rid' }, { status: 400, extra: cors })
  }

  const hosts = await hostsFor(source)
  if (hosts.length === 0) {
    return json({ code: 1, msg: `没有可用音源实现 ${source}` }, { status: 503, extra: cors })
  }

  /**
   * 校验一个赢家：直链 SSRF 白名单 + 探活（含 B16 http 兜底）。
   * 返回 { ok: true, r, link, verifyMs, verifySkipped } 或
   * { ok: false, r, via, reason, url, st, hard } —— 后者由调用方排除该源换下一家；
   * hard=true 才是"这条链对谁都不通"（404/410/451、指向内网），hard=false 只是"机房探活没过"。
   */
  async function validateWinner(r, raw) {
    const wasHttp = /^http:\/\//i.test(raw)
    let link = wasHttp ? 'https://' + raw.slice(7) : raw
    // 直链本身也要过内网/元数据地址校验：脚本可能返回 http://169.254.169.254/... 这类
    // "直链"——服务器拿它探活等于代为探测内网，下发给用户浏览器则变成对用户内网的请求
    try {
      await assertPublicHttpUrl(link)
    } catch (e) {
      console.warn(
        `[verify] 直链指向内网/非法地址 source=${source} via=${r.via} url=${link} err=${e && e.message}`
      )
      return { ok: false, r, via: r.via, reason: '直链指向内网/非法地址', url: link, link, st: 'blocked', hard: true }
    }
    let verifyMs = 0
    let verifySkipped = false
    if (process.env.VERIFY !== 'off') {
      // 探活三态：ok=可用 / soft=5xx 或超时（上游抖动，直链仍可信，放行）/ fail=硬失败
      const hostOf = (u) => {
        try {
          return new URL(u).host
        } catch {
          return ''
        }
      }
      const probe = async (u) => {
        const host = hostOf(u)
        if (host && (probeSkip.get(host) || 0) > Date.now()) {
          return { st: 'soft', ms: 0, skipped: true } // 已知不回包：省掉这次白等
        }
        const t0 = Date.now()
        let out
        try {
          await verifyDirectLink(u, { timeout: VERIFY_TIMEOUT_MS })
          out = { st: 'ok' }
        } catch (e) {
          // 只有明确的硬证据（hardErr：404/410/451、直链指向内网）才判死；其余一切——网络错误、
          // 超时，乃至探活实现里的意外异常——都不构成"链接已死"的证据，一律按可疑处理（照发）。
          // 这条 fail-safe 是 2026-09-21 那个 `classify(second.v)` 的 TypeError 教出来的：
          // 一个取值笔误就能把机房侧所有候选判死，而日志里只留一句"探活失败"、看不出原因。
          if (e.hard !== true && e.hard !== false) {
            console.warn(`[verify] 探活异常（按可疑处理）: ${(e && e.message) || e}`)
          }
          out = { st: e.hard === true ? 'fail' : 'soft' }
        }
        out.ms = Date.now() - t0
        // 把预算用满了 = 这台主机不回包 → 记下来，短时间内别再为它白等
        if (host && out.ms >= VERIFY_TIMEOUT_MS - 100 && out.st !== 'fail') {
          probeSkip.set(host, Date.now() + PROBE_SKIP_MS)
        }
        return out
      }
      let probeMs = 0
      let p = await probe(link)
      probeMs += p.ms
      verifySkipped = !!p.skipped
      let st = p.st
      // B16：https 侧没探通过时回退探测原始 http 直链（部分平台 CDN 只有 http 可达）。
      // 不只"硬失败"——403/413 这类可疑判定也可能只是 https 侧的策略，http 能过就用 http；
      // 两条都不通过时保留 https 形式（前端会把 http 直链升成 https，发 http 没有意义）
      if (st !== 'ok' && wasHttp) {
        const p2 = await probe(raw)
        probeMs += p2.ms
        if (p2.st === 'ok') {
          st = 'ok'
          link = raw
        }
      }
      verifyMs = probeMs
      if (st === 'fail') {
        // 细节只进 Runtime Logs，不对外暴露 via/tries（C4）——除非显式 ?debug=1
        console.warn(
          `[verify] 直链校验未通过 source=${source} via=${r.via.file} tries=${(r.tries || []).length} url=${link}`
        )
        return { ok: false, r, via: r.via, reason: '直链校验未通过', url: link, link, st, hard: true }
      }
      if (st !== 'ok') {
        // 机房探活没过（403/413/超时/HTML…）：不当死链证据，交给调用方决定（无干净候选时照发）
        console.warn(`[verify] 直链机房探活未通过 source=${source} via=${r.via.file} st=${st} url=${link}`)
        return { ok: false, r, via: r.via, reason: '直链机房探活未通过', url: link, link, st, hard: false }
      }
    }
    return { ok: true, r, link, verifyMs, verifySkipped }
  }

  try {
    // 换源降级：赢家直链指向内网、返回空链或探活判死时，排除该音源再对冲一轮，最多两轮。
    // 失败分两类（见 validateWinner 的 hard）：
    //   hard —— 这条链对谁都不通（404/410/451、指向内网）：不能下发，继续换源，都没有就 502；
    //   soft —— 只是**机房**探活没过（403/413/超时/HTML…）：机房判死 ≠ 访客判死，
    //           留着当兜底，换源是想"顺手找条更干净的"，找不到就把它照发（verified:false）。
    const excluded = new Set()
    let winner = null
    let hardFail = null
    let suspect = null
    for (let attempt = 0; attempt < 2 && !winner; attempt++) {
      const pool = hosts.filter((h) => !excluded.has(h.file))
      if (!pool.length) break
      const r = await scheduler.resolveWithHedge({
        source,
        action: 'musicUrl',
        info: { musicInfo, type: quality, quality },
        hosts: pool,
        // 客户端断了就没必要继续问音源了：把 Vercel 的 AbortSignal 直接透传下去，
        // 一次断连能立刻掐掉所有在飞的上游请求（省 Active CPU）。需要 vercel.json 开 supportsCancellation。
        signal: request.signal,
      })

      const raw = String(r.value || '').trim()
      if (!raw) {
        hardFail = { r, via: r.via, reason: '音源返回空直链', st: 'empty', hard: true }
        excluded.add(r.via.file)
        continue
      }
      const v = await validateWinner(r, raw)
      if (!v.ok) {
        if (v.hard) hardFail = v
        else if (!suspect) suspect = v // 保留第一家（排名最高的那次对冲的赢家）
        excluded.add(v.via.file) // ⚠️按 file 字符串排除——加 host 对象的话过滤永远查不到
        continue
      }
      winner = v
    }

    // 没有干净候选但有"机房判死"的：照发。访客在国内，链接对他是可用的（实测同一条链
    // 机房 413 / 国内 200），而浏览器那边本来就会自己再探一次（playWithProbe 并发探活 +
    // 逐候选降级 + 看门狗），真不通它会切到下一个候选。下发永远比 502 有用。
    if (!winner && suspect) {
      console.warn(`[url] 无干净候选，下发机房探活未通过的直链: via=${suspect.via.file} st=${suspect.st}`)
      winner = { ...suspect, verified: false }
    }

    if (!winner) {
      console.warn(
        hardFail
          ? `[url] 换源重试后仍失败: via=${hardFail.via.file} ${hardFail.reason}`
          : '[url] 没有可用音源'
      )
      const body = { code: 1, msg: '音源未能给出可用直链', source }
      if (wantDebug && hardFail) {
        body.trace = { ...trace(hardFail.r), verify: hardFail.st ?? 'empty', url: hardFail.url }
      }
      return json(body, { status: 502, extra: cors })
    }
    const { r, link, verifyMs, verifySkipped, verified } = winner
    const payload = { code: 0, source, quality, url: link, verified: verified !== false }
    // trace.verifyMs 单独列出来：探活曾经吃掉 4 秒/曲（见 lib/verify.mjs 的说明），
    // 只看总耗时会把"赢家 1 秒返回、探活白等 4 秒"误判成"音源慢"
    if (wantDebug) {
      payload.trace = { ...trace(r), verifyMs, verifySkipped }
      // verified:false 时补上机房侧的判定结果（soft=可疑/超时，blocked=被 SSRF 拦下…）
      if (verified === false) payload.trace.verify = winner.st
    }
    const res = json(
      payload,
      // C4：对外只保留泛化字段（trace 只在 ?debug=1 下出现，且不缓存）
      { maxAge: wantDebug ? 0 : Number(process.env.URL_CACHE_SECONDS || 900), extra: cors }
    )
    if (process.env.DEBUG_HEADERS === '1') {
      // 线上排查用（默认关）。注意 /api/health 里的 stats 永远是空的——它是**另一个函数、
      // 另一个模块实例**，/api/url 累积的成绩它看不见；想知道"这次是哪家音源、花了多久"
      // 只能从这里读：curl -i "<站>/api/url?id=xxx&source=wy" 看 x-music-via / x-music-ms。
      res.headers.set('x-music-via', encodeURIComponent(r.via))
      res.headers.set('x-music-ms', String(r.ms))
      res.headers.set('server-timing', `music;dur=${r.ms};desc="${encodeURIComponent(r.via)}"`)
    }
    return res
  } catch (e) {
    console.error('[url] 解析失败:', e && e.message) // 细节进日志（C4）
    const body = { code: 1, msg: '解析失败' }
    if (wantDebug) {
      // 全失败时最有用的就是"每家各错在哪"
      body.trace = {
        err: String((e && e.message) || e),
        tries: ((e && e.tries) || []).map((t) => ({
          file: t.file,
          ok: t.ok,
          ms: t.ms,
          aborted: !!t.aborted,
          err: t.err ? String(t.err).split('\n')[0].slice(0, 120) : undefined,
        })),
      }
    }
    return json(body, { status: 502, extra: cors })
  }
}

export async function OPTIONS(request) {
  const cors = corsHeaders(request)
  if (!cors) return new Response(null, { status: 403 })
  return new Response(null, { status: 204, headers: cors })
}
