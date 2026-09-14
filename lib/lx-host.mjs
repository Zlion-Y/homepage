/**
 * 洛雪(LX Music) 自定义音源脚本宿主 —— Node 版
 *
 * 契约与 zlion-music-api 的 goja 宿主保持一致：
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

const toBuf = (v) => {
  if (Buffer.isBuffer(v)) return v
  if (v instanceof Uint8Array) return Buffer.from(v)
  return Buffer.from(String(v))
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
    randomBytes: (n) => Buffer.from(nodeRandomBytes(Number(n) || 16)),
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
    return track(repeat ? setInterval(fn, delay || 1) : setTimeout(fn, delay))
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
    let timedOut = false
    const t = setTimeout(() => {
      timedOut = true
      ctrl.abort()
    }, Math.max(1000, Number(opt.timeout) || 15000))

    const headers = { ...(opt.headers || {}) }
    let body
    if (opt.body != null) body = opt.body
    else if (opt.form) {
      body = new URLSearchParams(opt.form).toString()
      headers['Content-Type'] = headers['Content-Type'] || 'application/x-www-form-urlencoded'
    }

    runAbortable(() =>
      fetchImpl(String(url), {
        method: String(opt.method || 'GET').toUpperCase(),
        headers,
        body,
        signal: ctrl.signal,
        redirect: 'follow',
      })
    )
      .then(async (r) => {
        const buf = Buffer.from(await r.arrayBuffer())
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
        cb(
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
        if (timedOut) return cb(new Error('请求超时: ' + url))
        cb(e)
      })
      .finally(() => clearTimeout(t))
  }

  const lx = {
    version: '2.6.0',
    env: 'desktop',
    EVENT_NAMES: { request: 'request', inited: 'inited', updateAlert: 'updateAlert' },
    currentScriptInfo: {
      name: 'zlion-homepage',
      description: 'Vercel 宿主：把洛雪自定义音源跑在边缘函数里',
      version: '1.0.0',
      author: '',
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
     */
    async settle(maxMs = 200) {
      const done = () => declaredSources.size > 0 && handlers.has('request')
      if (done() || initError) return { waited: 0, complete: done() }
      const t0 = Date.now()
      while (Date.now() - t0 < maxMs) {
        await new Promise((r) => setTimeout(r, 10))
        if (done()) break
      }
      return { waited: Date.now() - t0, complete: done() }
    },
    /** 调一次音源：action = musicUrl / lyric / pic */
    async invoke(action, info, { signal, timeout = 20000 } = {}) {
      if (initError) throw new Error(`脚本未就绪: ${initError.message}`)
      const handler = handlers.get('request')
      if (!handler) throw new Error('脚本没有注册 request 处理器')
      const p = Promise.resolve().then(() => handler({ source: info.source, action, info }))
      return await raceAbort(p, signal, timeout)
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
