/**
 * 多音源调度：成绩排序 / 分波下发 / 赢家一出即掐断 / 自动熔断
 *
 * 这是原项目 resolve.go 的核心原理，逐条平移过来。区别在于：
 * 原版是常驻进程，成绩与熔断状态可以跨请求长期累积；
 * Vercel 是"实例随时可能被销毁"，所以成绩只能做到**实例内**最佳努力（warm instance 内有效）。
 * 真需要跨实例共享，就把 stats 换成 Upstash Redis / Vercel KV —— 接口不变。
 */

const DEFAULTS = {
  concurrency: 3, // 一波同时问几个音源
  hedgeDelay: 300, // 一波没结果，隔多久放下一波
  invokeTimeout: 20000, // 单个音源调用超时
  quarantineAfter: 3, // 连续失败几次熔断
  quarantineMs: 10 * 60 * 1000, // 熔断时长
  pollMs: 250, // 等待"全部落定"时的兜底轮询间隔
}

/**
 * 门铃：wait(ms) 等一次通知或超时；fire() 唤醒所有等待者。
 * 每次 wait 都必定挂在真实定时器上，不会造成微任务空转。
 */
function makeBell() {
  let waiters = []
  return {
    wait(ms) {
      return new Promise((resolve) => {
        let done = false
        const entry = () => {
          if (done) return
          done = true
          clearTimeout(t)
          resolve('fired')
        }
        const t = setTimeout(() => {
          if (done) return
          done = true
          waiters = waiters.filter((f) => f !== entry)
          resolve('timeout')
        }, Math.max(1, Number(ms) || 1))
        waiters.push(entry)
      })
    },
    fire() {
      const ws = waiters
      waiters = []
      ws.forEach((f) => f())
    },
  }
}

export function createScheduler(opts = {}) {
  const cfg = { ...DEFAULTS, ...opts }
  const stats = new Map() // file -> {ok, fail, consecFail, totalMs, until, lastErr}

  const st = (file) => {
    let s = stats.get(file)
    if (!s) {
      s = { ok: 0, fail: 0, consecFail: 0, totalMs: 0, until: 0, lastErr: '' }
      stats.set(file, s)
    }
    return s
  }

  const quarantined = (file) => {
    const s = stats.get(file)
    return !!s && s.until > Date.now()
  }

  /** 成绩：成功率为主、平均耗时为辅；未知音源给中性分（让它有机会被试探） */
  const scoreOf = (file) => {
    const s = stats.get(file)
    if (!s) return 0.5
    const n = s.ok + s.fail
    if (n === 0) return 0.5
    const rate = s.ok / n
    const avg = s.ok ? s.totalMs / s.ok : 5000
    const speed = Math.max(0, 1 - avg / 5000) // 5s 以上记 0 分
    return rate * 0.8 + speed * 0.2
  }

  function rank(hosts) {
    const alive = hosts.filter((h) => !quarantined(h.file))
    const dead = hosts.filter((h) => quarantined(h.file))
    alive.sort((a, b) => scoreOf(b.file) - scoreOf(a.file))
    return [...alive, ...dead]
  }

  function record(file, ok, ms, err) {
    const s = st(file)
    if (ok) {
      s.ok++
      s.consecFail = 0
      s.totalMs += ms
    } else {
      s.fail++
      s.consecFail++
      s.lastErr = err ? String(err.message || err) : ''
      if (cfg.quarantineMs > 0 && s.consecFail >= cfg.quarantineAfter) {
        s.until = Date.now() + cfg.quarantineMs
      }
    }
  }

  /**
   * @param {object} p
   * @param {string} p.source  wy / kg / tx / kw / mg
   * @param {string} p.action  musicUrl / lyric / pic
   * @param {object} p.info    { musicInfo, type, quality }
   * @param {Array}  p.hosts   候选宿主（已按 source 过滤）
   * @returns {Promise<{value:any, via:object, tries:Array, cancelled:number, ms:number}>}
   */
  async function resolveWithHedge({ source, action, info, hosts, signal }) {
    const started = Date.now()
    const ranked = rank(hosts)
    if (ranked.length === 0) throw new Error(`没有可用音源实现 ${source}`)

    const ac = new AbortController()
    if (signal) {
      if (signal.aborted) throw abortErr()
      signal.addEventListener('abort', () => ac.abort(), { once: true })
    }

    const tries = []
    let result = null
    let lastErr = null
    let pending = 0

    // 两个"门铃"：赢家出现 / 全部落定。
    // 注意别用 Promise.race([已 resolve 的 promise, sleep]) —— 那会在 pending 未归零时
    // 以微任务速度空转，直接吃满堆内存。这里每次等待都必定挂在一个真实定时器或回调上。
    const winBell = makeBell()
    const idleBell = makeBell()
    const settle = () => {
      pending--
      if (pending <= 0) idleBell.fire()
    }

    const fire = (h) => {
      pending++
      const t0 = Date.now()
      Promise.resolve()
        .then(() => h.invoke(action, { ...info, source }, { signal: ac.signal, timeout: cfg.invokeTimeout }))
        .then((value) => {
          record(h.file, true, Date.now() - t0)
          tries.push({ file: h.file, ok: true, ms: Date.now() - t0 })
          if (!result) {
            result = { value, via: h }
            ac.abort() // 赢家一出，立刻掐断其余在飞的音源
            winBell.fire()
          }
        })
        .catch((e) => {
          const aborted = e && (e.name === 'AbortError' || /取消/.test(String(e.message)))
          if (!aborted) {
            record(h.file, false, Date.now() - t0, e)
            if (!lastErr) lastErr = e
          }
          tries.push({ file: h.file, ok: false, ms: Date.now() - t0, aborted, err: String(e && e.message) })
        })
        .finally(settle)
    }

    for (let i = 0; i < ranked.length; i += cfg.concurrency) {
      if (result) break
      ranked.slice(i, i + cfg.concurrency).forEach(fire)
      // 赢家出现就立刻进下一波，否则等够 hedgeDelay；一波全失败也能提前收工
      await Promise.race([winBell.wait(cfg.hedgeDelay), idleBell.wait(cfg.hedgeDelay)])
    }

    // 还有在飞的：等它们全部落定
    while (!result && pending > 0) {
      await Promise.race([winBell.wait(cfg.pollMs), idleBell.wait(cfg.pollMs)])
    }

    if (!result) {
      const e = lastErr || new Error('所有音源都没能取到结果')
      e.tries = tries
      throw e
    }

    return {
      value: result.value,
      via: result.via.file,
      tries,
      cancelled: tries.filter((t) => t.aborted).length,
      ms: Date.now() - started,
    }
  }

  return {
    resolveWithHedge,
    rank,
    quarantined,
    stats,
    snapshot() {
      const out = {}
      for (const [file, s] of stats) {
        out[file] = { ...s, score: Number(scoreOf(file).toFixed(3)), quarantined: s.until > Date.now() }
      }
      return out
    },
    reset() {
      stats.clear()
    },
  }
}

function abortErr() {
  const e = new Error('已取消')
  e.name = 'AbortError'
  return e
}
