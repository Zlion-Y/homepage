/**
 * 多音源调度：成绩排序 / 分波下发 / 赢家一出即掐断 / 自动熔断
 *
 * 这是原项目 resolve.go 的核心原理，逐条平移过来。区别在于：
 * 原版是常驻进程，成绩与熔断状态可以跨请求长期累积；
 * Vercel 是"实例随时可能被销毁"，所以成绩只能做到**实例内**最佳努力（warm instance 内有效）。
 * 真需要跨实例共享，就把 stats 换成 Upstash Redis / Vercel KV —— 接口不变。
 */

const DEFAULTS = {
  concurrency: 2, // 一波同时问几个音源
  firstWave: 4, // 第一波放宽到这个数（见 registry.mjs 里的说明）
  hedgeDelay: 300, // 一波没结果，隔多久放下一波
  invokeTimeout: 20000, // 单个音源调用超时
  quarantineAfter: 3, // 连续失败几次熔断
  quarantineMs: 10 * 60 * 1000, // 熔断时长
  pollMs: 250, // 等待"全部落定"时的兜底轮询间隔
  // 质量兜底：已知某家给的是低码率变体时（quality < qualityFloor，数据来自 ranking.json 的
  // samples[].q），它先答上来也不立刻用，再等 qualityGraceMs 看有没有"给高码率的那家"能答上来；
  // 等不到就用它的结果，绝不卡死。没有实测数据（不知道谁高谁低）时完全不启用。
  qualityFloor: 0.7,
  qualityGraceMs: 400,
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

  // 音源优先级（来自 sources/ranking.json 的 order/scores，装载时写入）。
  // 它在"实例内还没有成绩"时决定谁先进第一波——冷启动时这一步很关键：
  // 所有音源的 stats 都是空的，默认顺序等于音源目录的读入顺序（任意），
  // 于是"能服务的那家"可能被排到第二、第三波，白等几百毫秒。
  let seedScores = new Map(Object.entries((opts.seed && opts.seed.scores) || {}))
  let seedOrder = new Map((((opts.seed && opts.seed.order) || []).map((f, i) => [f, i])))
  // 实测音质比（0~1）：只在"知道谁会给低码率"时启用质量兜底，没数据就是普通对冲
  let seedQuality = new Map(Object.entries((opts.seed && opts.seed.quality) || {}))

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

  /** 成绩：成功率为主、平均耗时为辅；实例内没有样本时用实测排序的分数，再没有才中性 */
  const scoreOf = (file) => {
    const s = stats.get(file)
    if (s) {
      const n = s.ok + s.fail
      if (n > 0) {
        const rate = s.ok / n
        const avg = s.ok ? s.totalMs / s.ok : 5000
        const speed = Math.max(0, 1 - avg / 5000) // 5s 以上记 0 分
        return rate * 0.8 + speed * 0.2
      }
    }
    return seedScores.has(file) ? seedScores.get(file) : 0.5
  }

  /** 排序兜底：分数相同时按实测顺序（ranking.json 里的位次） */
  const ordOf = (file) => (seedOrder.has(file) ? seedOrder.get(file) : 999)

  function rank(hosts) {
    const alive = hosts.filter((h) => !quarantined(h.file))
    const dead = hosts.filter((h) => quarantined(h.file))
    alive.sort((a, b) => scoreOf(b.file) - scoreOf(a.file) || ordOf(a.file) - ordOf(b.file))
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
    const inflight = new Set() // 还在飞的文件名，用于判断"有没有更好的候选在路上"
    let fallback = null // 已知低码率的结果：先攥着，等 grace 期看有没有更好的
    let fallbackQ = 0
    let graceTimer = null
    let qualityFallback = false
    let i = 0 // 分波游标（上面的 .finally 要读它判断"更好的候选还会不会被派出去"）

    // 两个"门铃"：赢家出现 / 全部落定。
    // 注意别用 Promise.race([已 resolve 的 promise, sleep]) —— 那会在 pending 未归零时
    // 以微任务速度空转，直接吃满堆内存。这里每次等待都必定挂在一个真实定时器或回调上。
    const winBell = makeBell()
    const idleBell = makeBell()
    const settle = () => {
      pending--
      if (pending <= 0) idleBell.fire()
    }

    /** 实测音质比；不知道就给 null（不参与质量兜底） */
    const qualityOf = (file) => (seedQuality.has(file) ? seedQuality.get(file) : null)

    const accept = (value, h, fallbackUsed) => {
      if (result) return
      result = { value, via: h }
      qualityFallback = !!fallbackUsed
      if (graceTimer) clearTimeout(graceTimer)
      ac.abort() // 赢家一出，立刻掐断其余在飞的音源
      winBell.fire()
    }

    const fire = (h) => {
      pending++
      inflight.add(h.file)
      const t0 = Date.now()
      Promise.resolve()
        .then(() => h.invoke(action, { ...info, source }, { signal: ac.signal, timeout: cfg.invokeTimeout }))
        .then((value) => {
          const took = Date.now() - t0
          record(h.file, true, took)
          tries.push({ file: h.file, ok: true, ms: took })
          if (result) return
          const q = qualityOf(h.file)
          if (fallback) {
            // 手里已经攥着一个"实测低码率"的结果：
            // 来了个更好的就用新的；不比手里的好就继续等（grace 到期会用兜底那个）
            if ((q ?? 1) > fallbackQ + 0.05) return accept(value, h, false)
            return
          }
          // 没有兜底在手里：这家是"实测低码率"且还有更好的候选在路上 → 先攥着等一小会儿
          const betterPending = [...inflight].some((f) => f !== h.file && (qualityOf(f) ?? 1) > (q ?? 1) + 0.05)
          if (q != null && q < cfg.qualityFloor && betterPending && cfg.qualityGraceMs > 0) {
            fallback = { value, via: h }
            fallbackQ = q
            graceTimer = setTimeout(() => {
              if (!result && fallback) accept(fallback.value, fallback.via, true)
            }, cfg.qualityGraceMs)
            return
          }
          accept(value, h, false)
        })
        .catch((e) => {
          const aborted = e && (e.name === 'AbortError' || /取消/.test(String(e.message)))
          if (!aborted) {
            record(h.file, false, Date.now() - t0, e)
            if (!lastErr) lastErr = e
          }
          tries.push({ file: h.file, ok: false, ms: Date.now() - t0, aborted, err: String(e && e.message) })
        })
        .finally(() => {
          inflight.delete(h.file)
          // 攥着低码率结果时：只要"更好的候选"既没有在飞的、也不会再被派出去，就别耗到 grace 到期
          if (!result && fallback) {
            const betterLeft =
              [...inflight].some((f) => (qualityOf(f) ?? 1) > fallbackQ + 0.05) ||
              ranked.slice(i).some((hh) => (qualityOf(hh.file) ?? 1) > fallbackQ + 0.05)
            if (!betterLeft) accept(fallback.value, fallback.via, true)
          }
          settle()
        })
    }

    // 分波下发：第一波放宽到 firstWave，之后每波 concurrency 个。
    // 赢家出现就立刻进下一波，否则等够 hedgeDelay；一波全失败也能提前收工。
    while (i < ranked.length) {
      if (result) break
      const width = i === 0 ? Math.max(cfg.concurrency, cfg.firstWave) : cfg.concurrency
      ranked.slice(i, i + width).forEach(fire)
      i += width
      await Promise.race([winBell.wait(cfg.hedgeDelay), idleBell.wait(cfg.hedgeDelay)])
    }

    // 还有在飞的：等它们全部落定
    while (!result && pending > 0) {
      await Promise.race([winBell.wait(cfg.pollMs), idleBell.wait(cfg.pollMs)])
    }

    // grace 期到了都没有更好的 → 用攥着的那个（低码率总比没有强）
    if (!result && fallback) accept(fallback.value, fallback.via, true)
    if (graceTimer) clearTimeout(graceTimer)

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
      // true = 这次是"低码率兜底"（等过高码率候选但没等到），排查音质问题时看这个
      qualityFallback,
      ms: Date.now() - started,
    }
  }

  return {
    resolveWithHedge,
    /**
     * 写入音源优先级：registry 每次装载时按 sources/ranking.json 调用 → 本实例之后的
     * 解析按这个顺序分波。不落盘（跨实例靠那个文件随代码部署）。
     */
    setSeed({ order = [], scores = {}, quality = {} } = {}) {
      seedScores = new Map(Object.entries(scores || {}))
      seedOrder = new Map(order.map((f, i) => [f, i]))
      seedQuality = new Map(Object.entries(quality || {}))
      return { order: order.length, scores: seedScores.size, quality: seedQuality.size }
    },
    /** 当前生效的实测排序（供 /api/health 展示） */
    seedSnapshot() {
      return {
        order: [...seedOrder.entries()].sort((a, b) => a[1] - b[1]).map(([f]) => f),
        scores: Object.fromEntries(seedScores),
        quality: Object.fromEntries(seedQuality),
      }
    },
    // snapshot 供 /api/health 展示各音源成绩与熔断状态（registry.status 消费）。
    // rank/quarantined/stats/reset 曾作为预留 API 暴露但无任何调用方，已收敛为模块内部函数；
    // 未来要做管理页再按需恢复（接口思路见文件头注释）。
    snapshot() {
      const out = {}
      for (const [file, s] of stats) {
        out[file] = { ...s, score: Number(scoreOf(file).toFixed(3)), quarantined: s.until > Date.now() }
      }
      return out
    },
  }
}

function abortErr() {
  const e = new Error('已取消')
  e.name = 'AbortError'
  return e
}
