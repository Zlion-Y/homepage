/**
 * 洛雪(LX Music) 自定义音源脚本宿主 —— Node 版
 *
 * 契约与洛雪客户端保持一致：
 *   const { EVENT_NAMES, request, on, send, utils } = globalThis.lx
 *   send(EVENT_NAMES.inited, { status, openDevTools, sources: { wy: { name, type } } })
 *   on(EVENT_NAMES.request, ({ source, action, info }) => Promise<result>)
 *   request(url, options, (err, resp, body) => {})   // resp.statusCode / resp.headers
 *   utils.buffer.from / bufToString
 *   utils.crypto.md5 / randomBytes / aesEncrypt / aesDecrypt / rsaEncrypt
 *   utils.zlib.inflate / deflate（返回 Promise）
 *
 * 与 Go 版的差别（这是"能不能上 Vercel"的关键）：
 *   - 不需要 goja：音源脚本本来就是 JS，Node 原生跑，省掉一整套引擎适配与 JS 垫片；
 *   - Buffer / TextEncoder / crypto / zlib 直接用 Node 标准库，不用在 JS 里手搓；
 *   - 用 node:vm 做隔离 + setTimeout 兜底防死循环；
 *   - 定时器在每次调用后统一回收，避免函数实例被脚本的 setInterval 拖住。
 *
 * ⚠️ 安全边界声明（务必与下面的实现一起读）：
 *   - node:vm **不是安全边界**。createContext 只提供独立的全局对象，挡不住恶意脚本
 *     经 `this.constructor.constructor('return process')()` 逃逸到宿主 realm 拿到
 *     process/require。"不注入 fetch/require/process"只是提高门槛的纵深防御，
 *     前提是脚本半可信（随仓库提交、或 SOURCE_URLS 指向你自己的托管地址）。
 *     要跑完全不可信的第三方脚本，请上 isolate-vm / 独立进程沙箱。
 *   - lx.request 的 SSRF 校验（assertPublicHttpUrl）同样只能挡"直接写内网地址"：
 *     fetch 的 redirect:'follow' 会自动跟 30x，中间跳转绕过首跳校验（实现里在拿到
 *     响应后对最终 URL 做了复核兜底），DNS Rebinding 理论上也能绕。
 */
import vm from 'node:vm'
import zlib from 'node:zlib'
import { Buffer } from 'node:buffer'
import {
  createHash,
  createCipheriv,
  createDecipheriv,
  publicEncrypt,
  randomBytes as nodeRandomBytes,
  constants as cryptoConst,
} from 'node:crypto'
import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { AsyncLocalStorage } from 'node:async_hooks'

// 按 invocation 绑定取消信号（见 invoke 的说明）：脚本在 vm 同步段 / microtask /
// timer 里发起的 lx.request 都能读到"本次调用"的信号，跨请求并发互不串扰
const invocationStore = new AsyncLocalStorage()

// ── SSRF 防护（C3）：音源脚本的 lx.request 只允许出网到公网 http(s) ──
// 脚本是第三方代码，跑在函数内网里；放行内网/元数据地址等于给任意脚本一张
// "探测 Vercel 内网与元数据服务"的通行证。域名会做一次 DNS 解析再判内网。
function ipIsPrivate(ip) {
  if (ip.includes(':')) {
    const v6 = ip.toLowerCase()
    // IPv4-mapped IPv6（::ffff:a.b.c.d 或 ::ffff:a9fe:a9fe）必须剥掉前缀按 IPv4
    // 再判一遍，否则 http://[::ffff:169.254.169.254]/ 这类写法直接绕过下面全部 IPv4 规则
    const mappedDec = v6.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)
    if (mappedDec) return ipIsPrivate(mappedDec[1])
    const mappedHex = v6.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
    if (mappedHex) {
      const hi = parseInt(mappedHex[1], 16)
      const lo = parseInt(mappedHex[2], 16)
      return ipIsPrivate(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`)
    }
    return v6 === '::1' || v6 === '::' || /^f[cd][0-9a-f:]*$/.test(v6) || /^fe80/.test(v6)
  }
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some((x) => Number.isNaN(x))) return true
  const [a, b] = p
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) || // 链路本地（含云元数据 169.254.169.254）
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

const dnsMemo = new Map() // 域名 → { ip, at }，5 分钟内不重复解析
// 供 /api/url 复用：音源吐回来的"直链"同样要过内网/元数据地址校验
export async function assertPublicHttpUrl(rawUrl) {
  let u
  try {
    u = new URL(String(rawUrl))
  } catch {
    throw new Error('lx.request: 非法 URL')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`lx.request: 仅允许 http(s)，收到 ${u.protocol}`)
  }
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (!host) throw new Error('lx.request: 缺少主机名')
  if (isIP(host)) {
    if (ipIsPrivate(host)) throw new Error(`lx.request: 拒绝内网地址 ${host}`)
    return
  }
  const now = Date.now()
  let hit = dnsMemo.get(host)
  if (!hit || now - hit.at > 5 * 60 * 1000) {
    const res = await dnsLookup(host).catch(() => null)
    hit = { ip: res && res.address ? res.address : '', at: now }
    dnsMemo.set(host, hit)
  }
  if (!hit.ip) throw new Error(`lx.request: 域名解析失败 ${host}`)
  if (ipIsPrivate(hit.ip)) throw new Error(`lx.request: 拒绝解析到内网的域名 ${host}`)
}

const toBuf = (v) => {
  if (Buffer.isBuffer(v)) return v
  if (v instanceof Uint8Array) return Buffer.from(v)
  return Buffer.from(String(v))
}

// lx.request 响应体封顶：脚本要的是 JSON/JS/歌词这类小文本，超过这个量的
// 响应要么是上游有问题、要么是恶意脚本故意指大文件把实例内存吃爆
const MAX_BODY_BYTES = 8 * 1024 * 1024

/** 头字段大小写不敏感地判存在（脚本可能写 content-type 也可能写 Content-Type） */
function hasHeader(headers, name) {
  const n = name.toLowerCase()
  return Object.keys(headers).some((k) => k.toLowerCase() === n)
}

function buildUtils() {
  const buffer = {
    from(v, enc) {
      if (Buffer.isBuffer(v)) return v
      if (v instanceof Uint8Array) return Buffer.from(v)
      return enc ? Buffer.from(String(v), enc) : Buffer.from(String(v))
    },
    bufToString(v, enc) {
      const b = toBuf(v)
      return enc ? b.toString(enc) : b.toString('utf8')
    },
  }

  const crypto = {
    md5: (s) => createHash('md5').update(toBuf(s)).digest('hex'),
    sha1: (s) => createHash('sha1').update(toBuf(s)).digest('hex'),
    randomBytes: (n) => {
    // 封顶 1MB：恶意脚本 randomBytes(1e9) 能直接把实例内存打爆
    const bytes = Math.min(Math.max(0, Number(n) || 16), 1 << 20)
    return Buffer.from(nodeRandomBytes(bytes))
  },
    aesEncrypt(data, mode, key, iv) {
      const c = createCipheriv(String(mode), toBuf(key), iv == null ? null : toBuf(iv))
      return Buffer.concat([c.update(toBuf(data)), c.final()])
    },
    aesDecrypt(data, mode, key, iv) {
      const d = createDecipheriv(String(mode), toBuf(key), iv == null ? null : toBuf(iv))
      return Buffer.concat([d.update(toBuf(data)), d.final()])
    },
    rsaEncrypt(data, key) {
      // 洛雪里 key 是 PEM 文本（公钥）；这里用 Node 原生实现
      return publicEncrypt(
        { key: String(key), padding: cryptoConst.RSA_PKCS1_PADDING },
        toBuf(data)
      )
    },
  }

  const zl = {
    inflate: (b) => new Promise((res, rej) => zlib.inflate(toBuf(b), (e, r) => (e ? rej(e) : res(r)))),
    deflate: (b) => new Promise((res, rej) => zlib.deflate(toBuf(b), (e, r) => (e ? rej(e) : res(r)))),
  }

  return { buffer, crypto, zlib: zl }
}

/**
 * 把一份洛雪音源脚本源码装进宿主
 * @param {object} o
 * @param {string} o.code       脚本源码
 * @param {string} o.file       文件名（用于日志/统计）
 * @param {number} [o.initTimeout] 加载超时（防脚本里有死循环）
 * @param {function} [o.fetchImpl] 注入 fetch（测试可替身）
 */
export function createHost({ code, file, initTimeout = 5000, fetchImpl = globalThis.fetch }) {
  const handlers = new Map()
  const declaredSources = new Map()
  const timers = new Map()
  const logs = []
  let timerSeq = 0
  let initError = null
  let disposed = false

  const pushLog = (level, args) => {
    const line = args.map((a) => (typeof a === 'string' ? a : safeJson(a))).join(' ')
    logs.push({ level, line })
    if (logs.length > 200) logs.shift()
    if (level === 'error' || level === 'warn') console.log(`[音源 ${file}] ${level}: ${line}`)
  }

  const track = (h) => {
    h.unref?.()
    const id = ++timerSeq
    timers.set(id, h)
    return id
  }
  const schedule = (fn, ms, repeat) => {
    if (typeof fn !== 'function') return 0
    const delay = Math.max(0, Number(ms) || 0)
    // 包一层 try/catch：脚本定时器回调里的同步抛错若漏出去会成为
    // uncaughtException，直接崩掉整个函数实例、殃及所有在飞请求
    const wrapped = () => {
      try {
        fn()
      } catch (e) {
        pushLog('error', ['定时器回调抛错: ' + (e && e.message)])
      }
    }
    return track(repeat ? setInterval(wrapped, delay || 1) : setTimeout(wrapped, delay))
  }
  const clear = (id) => {
    const h = timers.get(Number(id))
    if (h) {
      clearTimeout(h)
      clearInterval(h)
      timers.delete(Number(id))
    }
  }

  // ── lx.request：绕开浏览器 CORS，由服务端代发（与原项目同职责） ──
  function lxRequest(url, options, cb) {
    if (typeof options === 'function') {
      cb = options
      options = {}
    }
    if (typeof cb !== 'function') throw new TypeError('lx.request 需要回调函数')
    const opt = options || {}
    const ctrl = new AbortController()
    // 回调只允许触发一次：成功路径里脚本回调自己抛错时，错误会沿同一条 promise
    // 链落进 .catch——不设防的话同一个请求会被以"成功 + 失败"各回调一次，
    // 脚本状态机直接错乱
    let cbCalled = false
    const onceCb = (err, resp, body) => {
      if (cbCalled) return
      cbCalled = true
      cb(err, resp, body)
    }
    // 归属当前 invocation（invoke 用 AsyncLocalStorage 绑定）：所属调用一取消/超时，
    // 在飞的请求跟着掐
    const invSignal = invocationStore.getStore()?.signal || null
    const onInvAbort = invSignal ? () => ctrl.abort() : null
    if (invSignal) {
      if (invSignal.aborted) {
        setTimeout(() => onceCb(new Error('lx.request: 本次调用已取消')), 0)
        return
      }
      invSignal.addEventListener('abort', onInvAbort, { once: true })
    }
    let timedOut = false
    const t = setTimeout(() => {
      timedOut = true
      ctrl.abort()
    }, Math.max(1000, Number(opt.timeout) || 15000))

    const headers = { ...(opt.headers || {}) }
    let body
    if (opt.body != null) {
      const b = opt.body
      if (typeof b === 'string' || Buffer.isBuffer(b) || b instanceof Uint8Array || b instanceof ArrayBuffer) {
        body = b
      } else {
        // ★ 对象 body 必须由宿主序列化。洛雪客户端就是这么做的，脚本作者默认这一点为真，
        // 于是大量脚本直接 `body: { source, musicId, quality }`。宿主若不序列化，
        // fetch 会把它变成字符串 "[object Object]" 发出去，上游一律 400/参数错误 ——
        // 实测（2026-09-17）：墨澜音乐源的 wy 后端 https://c.wwwweb.top/music/url
        // 就是被这一条废掉的（JSON 化后同一请求 161ms 返回真直链）。当时误判成"音源坏了"。
        body = JSON.stringify(b)
        if (!hasHeader(headers, 'content-type')) headers['Content-Type'] = 'application/json'
      }
    } else if (opt.form) {
      body = new URLSearchParams(opt.form).toString()
      if (!hasHeader(headers, 'content-type')) headers['Content-Type'] = 'application/x-www-form-urlencoded'
    }

    assertPublicHttpUrl(String(url))
      .then(() =>
        runAbortable(() =>
          fetchImpl(String(url), {
            method: String(opt.method || 'GET').toUpperCase(),
            headers,
            body,
            signal: ctrl.signal,
            redirect: 'follow',
          })
        )
      )
      .then(async (r) => {
        // redirect:'follow' 自动跟随的中间跳转不经过 assertPublicHttpUrl —— 在落地后
        // 对最终 URL 补一次复核：解析到内网/元数据地址就丢弃响应（不让脚本拿到
        // 内网数据）。首跳校验在下面 fetch 之前已经做过，这里是重定向的兜底。
        if (r.url && r.url !== String(url)) await assertPublicHttpUrl(r.url)
        const declared = Number(r.headers.get('content-length') || 0)
        if (declared > MAX_BODY_BYTES) throw new Error(`lx.request: 响应体过大（${declared} bytes）`)
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length > MAX_BODY_BYTES) throw new Error(`lx.request: 响应体过大（${buf.length} bytes）`)
        const respHeaders = {}
        r.headers.forEach((v, k) => (respHeaders[k] = v))
        const text = buf.toString('utf8')
        const isJson = /json/i.test(respHeaders['content-type'] || '')
        // 真实脚本对 body 的期待**分成两派**，实测语料里两种写法都有：
        //   A) resp.body.code / resp.body.data    → 要求 resp.body 是**已解析**对象
        //   B) JSON.parse(body)                   → 要求回调第三个参数是**原始字符串**
        // 所以两个都给：resp.body 给解析结果，第三个参数给原始文本；raw 保留字节。
        let parsed = text
        if (isJson) {
          try {
            parsed = JSON.parse(text)
          } catch {
            parsed = text
          }
        }
        onceCb(
          null,
          {
            statusCode: r.status,
            statusMessage: r.statusText,
            headers: respHeaders,
            url: r.url,
            body: opt.binary ? buf : parsed,
            raw: buf,
          },
          opt.binary ? buf : text
        )
      })
      .catch((e) => {
        if (timedOut) return onceCb(new Error('请求超时: ' + url))
        onceCb(e)
      })
      .finally(() => {
        clearTimeout(t)
        if (onInvAbort) invSignal.removeEventListener('abort', onInvAbort)
      })
  }

  const lx = {
    version: '2.6.0',
    env: 'desktop',
    EVENT_NAMES: { request: 'request', inited: 'inited', updateAlert: 'updateAlert' },
    currentScriptInfo: {
      name: 'zlion-music-vercel',
      description: 'Vercel 宿主：把洛雪自定义音源跑在边缘函数里',
      version: '1.0.0',
      author: 'zlion',
      homepage: '',
      rawScript: code,
    },
    on(event, handler) {
      handlers.set(String(event), handler)
    },
    send(event, data) {
      if (String(event) !== 'inited') return
      const sources = data && data.sources
      if (sources && typeof sources === 'object') {
        for (const [key, v] of Object.entries(sources)) {
          declaredSources.set(key, {
            name: (v && v.name) || key,
            type: (v && v.type) || 'music',
          })
        }
      }
      // 注意别用 this：脚本是把 lx 上的方法解构出来调用的（const { send } = globalThis.lx），this 会丢
      if (data && data.version) lx.currentScriptInfo.version = String(data.version)
    },
    request: lxRequest,
    utils: buildUtils(),
  }

  // console 要补全：实测有脚本直接用 console.group/table/time，
  // 少一个就是一个 ReferenceError / TypeError，整个音源直接废掉。
  const noop = (...a) => pushLog('debug', a)
  const consoleShim = {
    log: (...a) => pushLog('log', a),
    info: (...a) => pushLog('info', a),
    warn: (...a) => pushLog('warn', a),
    error: (...a) => pushLog('error', a),
    debug: (...a) => pushLog('debug', a),
    trace: noop,
    dir: noop,
    table: noop,
    group: noop,
    groupEnd: noop,
    groupCollapsed: noop,
    count: noop,
    countReset: noop,
    assert: (cond, ...a) => {
      if (!cond) pushLog('error', ['Assertion failed', ...a])
    },
    time: noop,
    timeEnd: noop,
    timeLog: noop,
  }

  const sandbox = {
    lx,
    console: consoleShim,
    Buffer,
    setTimeout: (fn, ms) => schedule(fn, ms, false),
    setInterval: (fn, ms) => schedule(fn, ms, true),
    clearTimeout: clear,
    clearInterval: clear,
    TextEncoder,
    TextDecoder,
    atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
    btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'),
    URL,
    URLSearchParams,
  }
  // 注意：不注入 fetch / require / process —— 音源脚本必须走 lx.request，
  // 否则等于把宿主的内网/文件系统暴露给第三方脚本。
  sandbox.globalThis = sandbox

  const context = vm.createContext(sandbox)
  try {
    vm.runInContext(code, context, { filename: file, timeout: initTimeout })
  } catch (e) {
    initError = e
    pushLog('error', ['脚本加载失败: ' + (e && e.message)])
  }

  return {
    file,
    get sources() {
      return declaredSources
    },
    get ready() {
      return !initError && handlers.has('request')
    },
    get initError() {
      return initError
    },
    get logs() {
      return logs
    },
    /**
     * 等脚本完成"异步初始化"。
     *
     * 实测真实音源里有相当一部分不是同步 send(inited) / on(request)：
     * 它们在 await 完自己的配置请求、或在 setTimeout 里才注册。
     * 原项目是常驻进程，晚到无所谓；serverless 每次冷启动都要等一次，
     * 所以这里给一个**上限很短**的等待窗口，满足条件立刻返回（同步脚本零额外开销）。
     *
     * maxMs 必传（不设默认值）：实际窗口由调用方 registry.mjs 用 SETTLE_MS 环境变量
     * 决定（默认 1500ms），历史版本这里写过误导性的 = 200 默认，已移除。
     */
    async settle(maxMs) {
      const done = () => declaredSources.size > 0 && handlers.has('request')
      if (done() || initError) return { waited: 0, complete: done() }
      const t0 = Date.now()
      while (Date.now() - t0 < maxMs) {
        await new Promise((r) => setTimeout(r, 10))
        if (done()) break
      }
      return { waited: Date.now() - t0, complete: done() }
    },
    /**
     * 调一次音源：action = musicUrl / lyric / pic。
     *
     * 取消语义分两层：raceAbort 只负责"不再等结果"，脚本内部还挂在 lx.request
     * 上的网络请求由本次调用的 invocation 信号统一掐断——否则赢家一出、输家
     * 脚本的请求仍在飞（各挂 15s 才超时），Active CPU 与出口流量被系统性放大。
     * 实现方式：invoke 用 AsyncLocalStorage 为本次调用绑定取消信号，lx.request
     * 发请求时从 store 读取并把自己的 AbortController 挂到该信号下。
     */
    async invoke(action, info, { signal, timeout = 20000 } = {}) {
      if (initError) throw new Error(`脚本未就绪: ${initError.message}`)
      const handler = handlers.get('request')
      if (!handler) throw new Error('脚本没有注册 request 处理器')
      const invocation = new AbortController()
      const onOuterAbort = () => invocation.abort()
      if (signal) {
        if (signal.aborted) invocation.abort()
        else signal.addEventListener('abort', onOuterAbort, { once: true })
      }
      const killTimer =
        Number(timeout) > 0 ? setTimeout(() => invocation.abort(), Number(timeout)) : null
      try {
        // ALS 上下文可传播进 vm 上下文与 vm realm 的异步续体（同步/microtask/timer
        // 均已实测命中），同一 host 被并发 invoke 时各调用互不串扰
        const p = Promise.resolve().then(() =>
          invocationStore.run({ signal: invocation.signal }, () =>
            handler({ source: info.source, action, info })
          )
        )
        return await raceAbort(p, signal, timeout)
      } finally {
        if (killTimer) clearTimeout(killTimer)
        if (signal) signal.removeEventListener('abort', onOuterAbort)
        invocation.abort() // 无论成败，收掉本次调用还挂在网络上的请求
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const h of timers.values()) {
        clearTimeout(h)
        clearInterval(h)
      }
      timers.clear()
      handlers.clear()
    },
  }
}

// ── 小工具 ──
function safeJson(v) {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

/** 立即把同步抛错变成 rejection，避免 vm 内的异常冒到事件循环 */
function runAbortable(fn) {
  try {
    return Promise.resolve(fn())
  } catch (e) {
    return Promise.reject(e)
  }
}

/** 超时 + 外部取消（abort 的语义：赢家一出就掐断其余音源） */
export function raceAbort(p, signal, timeout) {
  if (signal?.aborted) return Promise.reject(abortErr())
  const ms = Number(timeout) > 0 ? Number(timeout) : 0
  return new Promise((resolve, reject) => {
    let done = false
    const finish = (fn, arg) => {
      if (done) return
      done = true
      if (t) clearTimeout(t)
      signal?.removeEventListener('abort', onAbort)
      fn(arg)
    }
    const onAbort = () => finish(reject, abortErr())
    const t = ms > 0 ? setTimeout(() => finish(reject, new Error('音源调用超时')), ms) : null
    signal?.addEventListener('abort', onAbort, { once: true })
    Promise.resolve(p).then(
      (v) => finish(resolve, v),
      (e) => finish(reject, e)
    )
  })
}

export function abortErr() {
  const e = new Error('已取消')
  e.name = 'AbortError'
  return e
}
