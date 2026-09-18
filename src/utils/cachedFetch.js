/**
 * 数据卡片统一的「localStorage 缓存 → 带超时拉取 → 回写」模板（E2 抽取）
 *
 * 约定：
 *  - 缓存统一存 { ts, data }；
 *  - isFresh(cached) 自定义新鲜度（按天缓存等场景）。⚠️一旦提供 isFresh，
 *    ttl 就**完全不再参与**判定（二者是替换关系不是叠加关系）——需要
 *    "既要数据有效又限时长"时，请在 isFresh 里自己把 ts 判断写上；
 *  - loader(signal) 返回 data：非 null 则回写缓存并返回；返回 null 表示
 *    「数据无效但不报错」（如暂无免费游戏），不缓存；抛错（网络/解析失败）
 *    原样上抛，由调用方决定失败态；
 *  - 超时默认 8s，经 AbortController 中止。
 */
export async function cachedFetch({ key, ttl = 0, isFresh = null, timeout = 8000, loader }) {
  try {
    const cached = JSON.parse(localStorage.getItem(key) || "null");
    if (cached && cached.data != null) {
      const fresh = isFresh ? isFresh(cached) : ttl > 0 && Date.now() - cached.ts < ttl;
      if (fresh) return cached.data;
    }
  } catch {
    // 缓存解析失败则正常请求
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const data = await loader(ctrl.signal);
    if (data != null) {
      try {
        localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
      } catch {
        // 存储失败不影响展示
      }
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}
