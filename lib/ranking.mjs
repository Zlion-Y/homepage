/**
 * 音源优先级：把"实测出来的排序"变成调度器的初始排名（纯内部逻辑，无对外接口）
 *
 * 为什么要有这个东西：多音源对冲是"谁先答谁赢"，冷启动时所有音源分数相同，
 * 排序等于目录读入顺序（任意）——能被服务的那家若排在后面就要多等一整波。
 * 另外"快的那家给的可能是 128k 变体"，光靠速度排序会挑错。
 *
 * 为什么落成文件：Vercel 的每个函数实例都是独立的模块实例，`/api/url` 里累积的
 * 成绩（scheduler 的 stats）**看不到别的实例**，冷启动后一切归零。所以想把
 * "哪家音源快、哪家给 320k"这件事持久下来，只有两条路：
 *   1) `sources/ranking.json` 随代码提交（本项目采用，零额外依赖、下次部署生效）；
 *   2) 外接 KV（要额外配置，与"零配置部署"的目标冲突）。
 *
 * ranking.json 形状（可选文件；不存在/坏掉都当作"没有排序"，功能完全不受影响）：
 * {
 *   "generatedAt": "2026-09-18T00:10:00.000Z",
 *   "source": "wy",
 *   "quality": "320k",
 *   "order": ["墨澜音乐源v2.3.4.js", "回避聚合V0.0.1.js", ...],   // 实测优→劣
 *   "scores": { "墨澜音乐源v2.3.4.js": 0.92, ... },
 *   "samples": { "墨澜音乐源v2.3.4.js": { "ok": 5, "n": 5, "ms": 288, "q": 1 } }
 * }
 * `order`/`scores` 决定谁先进第一波；`samples[].q`（音质比，0~1）启用"质量兜底"：
 * 实测给低码率的那家先答上来也不立刻采用，会多等 QUALITY_GRACE_MS 看高码率的能不能赶上。
 * 这三样都可以手工写/改 —— scores 的口径是：
 *   0.5×成功率 + 0.3×(1 - 平均耗时/3000ms) + 0.2×音质比
 * （音质比 = 该源拿到的直链字节数 ÷ 同一首歌里各源的最大字节数，同曲同长即码率比）。
 */
import { readFileSync } from 'node:fs'

/** 读 sources/ranking.json；不存在/坏掉都当作"没有排序"，绝不因此让解析失败 */
export function readRanking(dir) {
  const empty = { order: [], scores: {}, samples: {}, generatedAt: null, source: null, quality: null, file: null }
  try {
    const path = dir + 'ranking.json'
    const j = JSON.parse(readFileSync(path, 'utf8'))
    const order = Array.isArray(j.order) ? j.order.filter((x) => typeof x === 'string') : []
    const scores = j.scores && typeof j.scores === 'object' ? j.scores : {}
    const samples = j.samples && typeof j.samples === 'object' ? j.samples : {}
    return {
      order,
      scores,
      samples,
      generatedAt: j.generatedAt || null,
      source: j.source || null,
      quality: j.quality || null,
      file: path,
    }
  } catch {
    return empty
  }
}

/** 三项权重：能不能用 > 快不快 > 音质好不好 */
export const BENCH_WEIGHTS = { rate: 0.5, speed: 0.3, quality: 0.2 }
/** 速度分归零的耗时（ms）：3 秒以上记 0 分 */
export const SPEED_BUDGET_MS = 3000

/**
 * 单项得分：0（全失败）~ 1（又快又稳又高音质）
 * @param {object} s { ok, n, ms, q }  q = 音质比（该音源拿到的字节数 / 同曲最优，0~1）
 *
 * 下面三个函数（benchScore / applyQuality / aggregate）是**只在本机用的**重排工具：
 * 仓库不再提供任何测速接口或页面（那是产品外的功能）。要用它们重新生成
 * `sources/ranking.json` 时，本地写一段脚本 import 本文件、把各源逐首实测的结果喂进
 * `aggregate()`，把返回的 order/scores/samples 写进文件即可 —— 这样口径永远是同一处
 * 代码，不会出现"文件里的分数"和"文档里的公式"对不上的情况。
 */
export function benchScore({ ok = 0, n = 1, ms = SPEED_BUDGET_MS, q = 0 } = {}) {
  const rate = n > 0 ? ok / n : 0
  const speed = Math.max(0, Math.min(1, 1 - ms / SPEED_BUDGET_MS))
  const quality = Math.max(0, Math.min(1, q))
  const s = BENCH_WEIGHTS.rate * rate + BENCH_WEIGHTS.speed * speed + BENCH_WEIGHTS.quality * quality
  return Number(s.toFixed(4))
}

/**
 * 一首歌内各源的"音质比"：以该曲各源拿到的**最大字节数**为基准。
 * 同一首歌时长相同，所以字节数之比 ≈ 码率之比 —— 不需要任何时长元信息就能识破
 * "被降级成 128k 变体"的那几家（实测 320k/128k 的比值恰好 2.50）。
 * 就地写回 r.quality，返回同一数组。
 */
export function applyQuality(rows) {
  const maxBytes = Math.max(0, ...rows.map((r) => (r.ok ? Number(r.bytes) || 0 : 0)))
  for (const r of rows) {
    r.quality = r.ok && maxBytes > 0 ? Number(((Number(r.bytes) || 0) / maxBytes).toFixed(3)) : 0
  }
  return rows
}

/**
 * 把"逐首原始结果"汇总成每家一行的表 + 排序 + 分数（本机重排 ranking.json 时用）。
 *
 * @param {Array<{song:{id:string,name:string}, rows:Array}>} perSong
 *        rows 每项：{ file, ok, ms, bytes, urlHost, err }
 * @returns {{table:Array, order:string[], scores:object, samples:object}}
 */
export function aggregate(perSong, { timeoutMs = SPEED_BUDGET_MS } = {}) {
  const agg = new Map()
  for (const s of perSong) {
    for (const r of applyQuality(s.rows || [])) {
      const a =
        agg.get(r.file) ||
        { file: r.file, ok: 0, n: 0, sumMs: 0, minMs: Infinity, q: 0, hosts: new Set(), errs: [] }
      a.n++
      if (r.ok) {
        a.ok++
        a.sumMs += r.ms
        a.minMs = Math.min(a.minMs, r.ms)
        a.q += r.quality
        if (r.urlHost) a.hosts.add(r.urlHost)
      } else if (r.err) {
        a.errs.push(r.err)
      }
      agg.set(r.file, a)
    }
  }
  const table = [...agg.values()].map((a) => {
    const ms = a.ok ? Math.round(a.sumMs / a.ok) : timeoutMs
    const q = a.ok ? a.q / a.ok : 0
    return {
      file: a.file,
      ok: a.ok,
      n: a.n,
      ms,
      // 最快那次也报出来：各家共享上游时会互相挤，平均值会被拉高，
      // 想人工判断"最好能多快"直接看这一列。
      msMin: a.ok ? a.minMs : null,
      qualityRatio: Number(q.toFixed(3)),
      urlHosts: [...a.hosts],
      score: benchScore({ ok: a.ok, n: a.n, ms, q }),
      err: a.errs[0] || null,
    }
  })
  table.sort((a, b) => b.score - a.score || a.ms - b.ms)
  return {
    table,
    order: table.map((t) => t.file),
    scores: Object.fromEntries(table.map((t) => [t.file, t.score])),
    samples: Object.fromEntries(
      table.map((t) => [t.file, { ok: t.ok, n: t.n, ms: t.ms, q: t.qualityRatio }])
    ),
  }
}
