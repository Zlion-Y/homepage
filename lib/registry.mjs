/**
 * 音源注册表：模块级单例，warm 实例内复用（冷启动只装一次）
 *
 * 与 Go 版的差别：
 *   - 原版从 `sources/` 目录热加载 + 管理页上传 + 6h 远程拉取；
 *   - Vercel 文件系统只读、实例随时销毁，所以音源脚本**当代码提交进仓库**，
 *     改脚本 = 重新部署。要"不重新部署也能更新音源"，就把脚本放远端，
 *     由 vercel.json 的 crons 定时触发 refresh()。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createHost } from './lx-host.mjs'
import { createScheduler } from './scheduler.mjs'
import { readRanking } from './ranking.mjs'

const SOURCES_DIR = process.env.SOURCES_DIR
  ? process.env.SOURCES_DIR
  : fileURLToPath(new URL('../sources/', import.meta.url))

// 远端音源：SOURCE_URLS="https://a/x.js,https://b/y.js"（逗号分隔）
// 用途是"不重新部署也能换音源"——脚本托管在 Gist / 你自己的服务器上，改完等实例冷启动即可；
// 函数实例常驻期间不会重复拉取，想强制刷新给 /api/health 带 ?refresh=1。
// 与目录里的同名文件并存时，以远端为准（远端是"更新过的版本"）。
const SOURCE_URLS = (process.env.SOURCE_URLS || '')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean)
const SOURCE_URL_TIMEOUT_MS = Number(process.env.SOURCE_URL_TIMEOUT_MS || 8000)

function nameFromUrl(u) {
  try {
    const base = new URL(u).pathname.split('/').filter(Boolean).pop() || 'remote.js'
    return base.toLowerCase().endsWith('.js') ? base : base + '.js'
  } catch {
    return 'remote.js'
  }
}

async function fetchSourceText(u) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), SOURCE_URL_TIMEOUT_MS)
  try {
    const r = await fetch(u, { signal: ac.signal, headers: { 'user-agent': 'zlion-homepage' } })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const text = await r.text()
    if (!text.trim()) throw new Error('内容为空')
    return text
  } finally {
    clearTimeout(t)
  }
}

// 音源脚本里常见 `.catch(e => { throw e })` 这种自爆式写法，
// 结果就是一次 unhandledRejection。在 serverless 里它只会静默消失，
// 所以统一收口打一条日志（会出现在 Vercel 的 Runtime Logs 里）。
process.on('unhandledRejection', (e) => {
  console.log('⚠️  音源脚本异步未捕获异常:', (e && e.message) || String(e))
})

export const scheduler = createScheduler({
  concurrency: Number(process.env.RESOLVE_CONCURRENCY || 2),
  // 第一波放宽到 4：能被服务的那批音源未必排在最前（排名只按历史成绩，冷启动时全是中性分，
  // 顺序等于音源目录的读入顺序）。"谁先答谁赢"的机制下，把它们同时放出去比每次只放 2 个
  // 快一整波——实测慢路径（只有后面那家聚合源能出直链时）能省 300~600ms。
  firstWave: Number(process.env.RESOLVE_FIRST_WAVE || 4),
  hedgeDelay: Number(process.env.RESOLVE_HEDGE_MS || 300),
  // 单音源调用超时必须装进"前端等得起的预算"里：前端 /api/url 超时 12s，
  // 这里给 9s 留出装载（约 1s）与探活的余量。原来 20s 的后果是——音源挂住时
  // 函数还在等，前端早就放弃并退回 Meting（VIP 曲在 Meting 上是 404，等于没声）。
  invokeTimeout: Number(process.env.INVOKE_TIMEOUT_MS || 9000),
  quarantineAfter: Number(process.env.QUARANTINE_AFTER || 3),
  quarantineMs: Number(process.env.QUARANTINE_MS || 10 * 60 * 1000),
  // 质量兜底（数据来自 ranking.json 的 samples[].q，即"谁给低码率"的先验）：
  // 低码率的那家先答上来也不会立刻用，多等 QUALITY_GRACE_MS 看高码率的能不能赶上；
  // 设为 0 关掉这个行为，退回"谁先答用谁"。
  qualityFloor: Number(process.env.QUALITY_FLOOR ?? 0.7),
  qualityGraceMs: Number(process.env.QUALITY_GRACE_MS ?? 400),
})

let loaded = null // { at, hosts, errors, waitedMs }
let loading = null // 并发请求共享同一次装载
let lastTouch = Date.now() // 最近一次有请求用到音源的时刻
let rankingInfo = { order: [], scores: {}, samples: {}, generatedAt: null, source: null, quality: null, file: null }

// 音源脚本跑在 node:vm 里，vm 的 timeout 只保护同步段；脚本里遗留的
// setInterval 会常驻 warm 实例空转（只有 dispose() 会清掉）。
// 这里用「惰性回收」处理：不挂常驻定时器（那会阻止 serverless 实例冻结），
// 而是每个请求摸一下 lastTouch，一旦发现空闲超过 HOST_IDLE_DISPOSE_MS（默认 30 分钟），
// 就把旧实例整个 dispose 再重装——脚本定时器随之回收，成本只是该请求多付一次冷启动。
// 设为 0 可关闭此行为。
const HOST_IDLE_DISPOSE_MS = Number(process.env.HOST_IDLE_DISPOSE_MS ?? 30 * 60 * 1000)

async function load() {
  const hosts = []
  const errors = []
  let waitedMs = 0
  // 实测排序（sources/ranking.json，可选）：每次装载都重读一次，所以改了它 + ?refresh=1 即可生效。
  // 文件不存在就当作"没有排序"，绝不让解析失败。
  rankingInfo = readRanking(SOURCES_DIR)
  scheduler.setSeed({
    order: rankingInfo.order,
    scores: rankingInfo.scores,
    // 质量兜底要用"谁给低码率"的先验：从 ranking.json 的 samples[file].q 取
    quality: Object.fromEntries(
      Object.entries(rankingInfo.samples || {})
        .filter(([, v]) => v && typeof v.q === 'number')
        .map(([f, v]) => [f, v.q])
    ),
  })
  // 文件名 -> 取脚本正文的方式（目录里的读文件，远端 URL 的拉网络）
  const specs = new Map()
  try {
    for (const f of readdirSync(SOURCES_DIR).filter((f) => f.toLowerCase().endsWith('.js'))) {
      specs.set(f, async () => readFileSync(SOURCES_DIR + f, 'utf8'))
    }
  } catch (e) {
    errors.push({ file: SOURCES_DIR, err: `音源目录读取失败: ${e.message}` })
  }
  for (const u of SOURCE_URLS) {
    specs.set(nameFromUrl(u), () => fetchSourceText(u)) // 同名时远端覆盖本地
  }
  await Promise.all(
    [...specs.entries()].map(async ([f, read]) => {
      try {
        const code = await read()
        const host = createHost({ code, file: f })
        // 一批真实音源是**异步**声明音源/注册请求的（有的还要先请求自己的配置接口）。
        // settle 满足条件就立刻返回，所以对同步脚本是零开销；只有异步脚本才吃这个窗口。
        // 实测 21 个真实音源脚本：settle=600ms → 20/21 冷启动 863ms；1500ms → 21/21 冷启动 952ms。
        // 差 350ms 换一个音源，值。可随时用 SETTLE_MS 调。
        const s = await host.settle(Number(process.env.SETTLE_MS || 1500))
        waitedMs = Math.max(waitedMs, s.waited)
        if (host.initError) errors.push({ file: f, err: host.initError.message })
        else if (host.sources.size === 0) errors.push({ file: f, err: '脚本没有用 send(inited) 声明音源' })
        else if (!host.ready) errors.push({ file: f, err: '脚本没有注册 request 处理器' })
        hosts.push(host)
      } catch (e) {
        errors.push({ file: f, err: e.message })
      }
    })
  )
  loaded = { at: Date.now(), hosts, errors, waitedMs }
  return loaded
}

async function ensure() {
  if (
    loaded &&
    HOST_IDLE_DISPOSE_MS > 0 &&
    Date.now() - lastTouch > HOST_IDLE_DISPOSE_MS
  ) {
    // 空闲超时：旧实例可能挂着音源脚本遗留的 setInterval，整批 dispose 换新
    console.log('♻️  音源实例空闲超时，自动重装')
    loaded.hosts.forEach((h) => h.dispose())
    loaded = null
  }
  lastTouch = Date.now()
  if (loaded) return loaded
  if (!loading) {
    loading = load().finally(() => {
      loading = null
    })
  }
  return loading
}

/** 重新装载全部音源（cron / 手动触发用） */
export async function refresh() {
  if (loaded) loaded.hosts.forEach((h) => h.dispose())
  loaded = null
  return await ensure()
}

/** 取实现了某个 source（wy/kg/tx/kw/mg）的宿主 */
export async function hostsFor(source) {
  const l = await ensure()
  return l.hosts.filter((h) => h.ready && h.sources.has(source))
}

export async function status() {
  const l = await ensure()
  return {
    dir: SOURCES_DIR,
    remoteUrls: SOURCE_URLS.length,
    loadedAt: new Date(l.at).toISOString(),
    asyncSettleMs: l.waitedMs,
    errors: l.errors,
    // 音源优先级：来自 sources/ranking.json（随代码提交），装载时读入并写进调度器
    ranking: {
      fromFile: rankingInfo.file,
      generatedAt: rankingInfo.generatedAt,
      order: rankingInfo.order,
      scores: rankingInfo.scores,
      samples: rankingInfo.samples,
      effective: scheduler.seedSnapshot(),
    },
    hosts: l.hosts.map((h) => ({
      file: h.file,
      ready: h.ready,
      sources: Object.fromEntries(h.sources),
      initError: h.initError ? h.initError.message : null,
    })),
    stats: scheduler.snapshot(),
  }
}
