import { ref } from "vue";
import { memoSet, songIdOf } from "../utils/netease.js";

/** LRC 文本 → [{ time, text }] 升序（纯函数，便于单测） */
export function parseLRC(lrc) {
  if (!lrc) return [];
  const result = [];
  // 小数位可选：部分歌词源给的是 [01:30] 这种无小数格式，写死必选会整行丢
  const timeReg = /\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
  lrc.split("\n").forEach((line) => {
    const matches = Array.from(line.matchAll(timeReg));
    if (matches.length > 0) {
      const text = line.replace(timeReg, "").trim();
      if (text) {
        matches.forEach((match) => {
          const m = parseInt(match[1]);
          const s = parseInt(match[2]);
          const frac = match[3] || "";
          const ms = frac ? parseInt(frac) : 0;
          // 2 位 = 百分秒(/100)、3 位 = 毫秒(/1000)、1 位 = 十分秒(/10)
          const time = m * 60 + s + ms / 10 ** frac.length;
          result.push({ time, text });
        });
      }
    }
  });
  return result.sort((a, b) => a.time - b.time);
}

/** 文本解析不出任何行 = 脏数据（接口限流时返回 JSON 错误页等），当 null 处理 */
function parseLrcOrEmpty(text) {
  if (!text) return null;
  const lines = parseLRC(text);
  return lines.length ? lines : null;
}

/**
 * 歌词状态与加载（自 MusicCard 抽出）：
 * 内存 + localStorage 双层缓存（按歌词地址），二次播放/切回秒出。
 * 可靠性（「有时候加载不出来」的三个根因都在这修）：
 *  - 旧版把任何非空响应直接写进缓存——接口限流返回的 JSON 错误页也被永久缓存，
 *    之后这首歌永远是「暂无歌词」。现在先解析后缓存（≥1 行才写），且读取时自愈
 *    （缓存内容解析不出行就删掉重新拉）；
 *  - 网络抖动一次失败就放弃：现在同曲重试一次（2.5s 后，仍是当前曲才续）；
 *  - 部分 Meting 源的 lrc 字段为空：按歌曲 ID 拼 Meting 备用地址兜底。
 * 只负责「哪句高亮」（lrcIndex），滚动跟随归各视图（小卡抽屉 / 全屏）自己管。
 */
export function createLyrics({ playlist, index }) {
  const lyrics = ref([]);
  const lrcIndex = ref(-1);
  const lrcMem = new Map();
  let lrcAbort = null; // 当前歌词加载会话的 AbortController，切歌时中止旧会话

  function lrcCacheKey(url) {
    return "lrc_" + url.slice(-64);
  }

  function applyLrcLines(t, lines) {
    if (playlist.value[index.value] !== t) return; // 已切歌，丢弃过期歌词
    lyrics.value = lines;
  }

  /** 读缓存（内存 → localStorage），带自愈：解析不出行的脏数据直接删掉当未命中 */
  function readLrcCache(key) {
    const mem = lrcMem.get(key);
    if (mem != null) {
      const lines = parseLrcOrEmpty(mem);
      if (lines) return lines;
      lrcMem.delete(key);
    }
    try {
      const stored = localStorage.getItem(key);
      if (stored != null) {
        const lines = parseLrcOrEmpty(stored);
        if (lines) {
          memoSet(lrcMem, key, stored);
          return lines;
        }
        localStorage.removeItem(key); // 清掉历史脏缓存
      }
    } catch {
      // 读取失败则走网络
    }
    return null;
  }

  /** 只有解析得出 ≥1 行才写缓存（防错误页/限流 JSON 被永久缓存） */
  function writeLrcCache(key, text, lines) {
    if (!lines) return;
    memoSet(lrcMem, key, text);
    try {
      localStorage.setItem(key, text);
    } catch {
      // 存储失败不影响展示
    }
  }

  /** 带超时（10s）的单次拉取；切歌/新会话启动时经 parentSignal 连带中止 */
  function fetchLrcText(url, parentSignal) {
    return new Promise((resolve) => {
      const ctrl = new AbortController();
      const onParentAbort = () => ctrl.abort();
      if (parentSignal) {
        if (parentSignal.aborted) return resolve("");
        parentSignal.addEventListener("abort", onParentAbort, { once: true });
      }
      const timer = setTimeout(() => ctrl.abort(), 10000);
      fetch(url, { signal: ctrl.signal })
        .then((r) => r.text())
        .then((text) => resolve(text || ""))
        .catch(() => resolve(""))
        .finally(() => {
          clearTimeout(timer);
          if (parentSignal) parentSignal.removeEventListener("abort", onParentAbort);
        });
    });
  }

  function loadLyrics(t) {
    lyrics.value = [];
    lrcIndex.value = -1;
    if (lrcAbort) lrcAbort.abort();

    // 候选地址：音源自带的 lrc 字段在前，按歌曲 ID 拼的 Meting 备用地址兜底
    const urls = [];
    if (t.lrc) {
      const isLrcUrl = /^(https?:)?\/\//.test(t.lrc) || t.lrc.startsWith("/") || /\.(lrc|txt)(\?|#|$)/i.test(t.lrc);
      if (!isLrcUrl) {
        // 内嵌 LRC 文本：解析得出就直接用；解析不出（空串/纯标签）也试着走网络兜底
        const lines = parseLrcOrEmpty(t.lrc);
        if (lines) {
          lyrics.value = lines;
          return;
        }
      } else {
        urls.push(t.lrc);
      }
    }
    const id = songIdOf(t);
    const fallback = id ? `https://api.injahow.cn/meting/?server=netease&type=lrc&id=${id}` : "";
    if (fallback && !urls.includes(fallback)) urls.push(fallback);
    if (!urls.length) return;

    lrcAbort = new AbortController();
    const myCtrl = lrcAbort;
    // 会话有效性：这首歌仍是当前曲，且没有更新的加载会话接管
    const isCurrent = () => playlist.value[index.value] === t && myCtrl === lrcAbort;

    async function tryUrl(url, allowRetry) {
      const key = lrcCacheKey(url);
      const hit = readLrcCache(key);
      if (hit) {
        applyLrcLines(t, hit);
        return true;
      }
      // 网络失败/脏数据重试一次： transient 抖动不再直接变成「暂无歌词」
      for (let attempt = 0; attempt <= (allowRetry ? 1 : 0); attempt++) {
        if (attempt) {
          await new Promise((r) => setTimeout(r, 2500));
          if (!isCurrent()) return false;
        }
        const text = await fetchLrcText(url, myCtrl.signal);
        if (!isCurrent()) return false;
        const lines = parseLrcOrEmpty(text);
        if (lines) {
          writeLrcCache(key, text, lines);
          applyLrcLines(t, lines);
          return true;
        }
      }
      return false;
    }

    (async () => {
      for (let i = 0; i < urls.length; i++) {
        if (await tryUrl(urls[i], i === 0)) return;
        if (!isCurrent()) return;
      }
      // 全部失败：保持空歌词（视图显示「暂无歌词」），下次切回这首歌会再试
    })();
  }

  // 后台预取下一首歌词，切歌时即刻可用（同样先解析后缓存）
  let prefetching = false;
  function prefetchNextLyrics() {
    if (prefetching || playlist.value.length < 2) return;
    const next = playlist.value[(index.value + 1) % playlist.value.length];
    if (!next) return;
    const urls = [];
    if (next.lrc && /^(https?:)?\/\//.test(next.lrc)) urls.push(next.lrc);
    const id = songIdOf(next);
    const fallback = id ? `https://api.injahow.cn/meting/?server=netease&type=lrc&id=${id}` : "";
    if (fallback && !urls.includes(fallback)) urls.push(fallback);
    if (!urls.length) return;
    prefetching = true;
    (async () => {
      try {
        for (const url of urls) {
          const key = lrcCacheKey(url);
          if (readLrcCache(key)) return; // 已有可用缓存
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 10000); // 挂死的预取不能永久堵住后续预取
          const text = await fetch(url, { signal: ctrl.signal })
            .then((r) => r.text())
            .catch(() => "");
          clearTimeout(timer);
          const lines = parseLrcOrEmpty(text);
          if (lines) {
            writeLrcCache(key, text, lines);
            return;
          }
        }
      } finally {
        prefetching = false;
      }
    })();
  }

  /** 按播放时间推进高亮行；返回是否换行（滚动跟随由视图层 watch lrcIndex 做） */
  function updateLrcHighlight(time) {
    if (!lyrics.value.length) return false;
    let idx = -1;
    for (let i = 0; i < lyrics.value.length; i++) {
      if (lyrics.value[i].time <= time) idx = i;
      else break;
    }
    if (idx === lrcIndex.value) return false;
    lrcIndex.value = idx;
    return true;
  }

  function dispose() {
    if (lrcAbort) lrcAbort.abort();
  }

  return { lyrics, lrcIndex, loadLyrics, prefetchNextLyrics, updateLrcHighlight, dispose };
}
