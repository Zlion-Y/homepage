import { ref, computed, nextTick } from "vue";
import { siteConfig } from "../config.js";
import { wallpaperUrl } from "../utils/wallpaperBus.js";
import { songIdOf, neteasePic, hdCover, smallCover, memoSet } from "../utils/netease.js";

/**
 * 封面与主色（自 MusicCard 抽出）：
 * - 官方高清封面解析（批量详情直取 / 按名搜索兜底，会话内 LRU 缓存）
 * - 封面主色提取（canvas 24×24 采样 → HSL）→ 全屏背景色洗 + 控件强调色
 * - 全屏背景源（无封面回退站点壁纸）与小卡封面源
 * coverImgEl / fsBgImgEl 由视图层模板绑定进来（缓存命中时 img 的 load 事件
 * 可能早于监听器挂载，syncBgShown 靠 complete 兜底点亮，两处共用）。
 */
export function createCoverArt({ track }) {
  const fsCoverSrc = ref("");
  // 无封面时全屏背景回退到站点壁纸（优先复用当前页面已加载的那张）
  const fsWallpaper = ref("");
  const bgShown = ref(false); // 背景大图首次加载完成后淡入（此后原地换图不闪）
  // 官方封面解析缓存（会话内）：歌曲 ID → 官方 picUrl，切回听过的歌不再重复请求。
  // 走 memoSet 限长（LRU 语义），长会话听几百首也不会无界增长
  const fsCoverCache = new Map();

  // 官方封面解析的超时定时器：切歌后旧的超时 abort 已无意义，进函数先清掉上一轮的
  let coverTimers = [];

  // 小卡封面 img / 全屏背景 img（视图层模板绑定）
  const coverImgEl = ref(null);
  const fsBgImgEl = ref(null);

  // 缓存命中时 img 的 load 事件可能早于监听器挂载，靠 complete 兜底点亮（背景 + 小卡封面同理）
  function syncBgShown() {
    nextTick(() => {
      const bg = fsBgImgEl.value;
      if (bg && bg.complete && bg.naturalWidth > 0) bgShown.value = true;
      const cv = coverImgEl.value;
      if (cv && cv.complete && cv.naturalWidth > 0) coverImgLoaded();
    });
  }

  // 小卡封面点亮标记：放回视图层会造成循环依赖，这里用 ref 交给 MusicCard 绑定
  const coverLoaded = ref(false);
  function coverImgLoaded() {
    coverLoaded.value = true;
  }

  async function resolveFsCover() {
    coverTimers.forEach(clearTimeout);
    coverTimers = [];
    const t = track.value;
    fsWallpaper.value = currentWallpaper();
    if (!t || !t.pic) {
      // 没有封面：清空封面与主色，背景交给壁纸兜底
      fsCoverSrc.value = "";
      fsDominant.value = null;
      return;
    }
    const base = hdCover(t.pic);
    // 缓存 key 用歌曲 ID（拿不到时回退 url/name），避免同名不同曲（Live/伴奏版）串封面/主色
    const covKey = songIdOf(t) || t.url || t.name;
    const cached = fsCoverCache.get(covKey);
    if (cached) {
      fsCoverSrc.value = cached;
      resolveDominantColor(covKey, smallCover(cached), t); // 命中也需恢复主色
      syncBgShown();
      return;
    }

    // 批量详情已解析出官方直链（按歌曲 ID 精确匹配）：直接升到 1024，无需再按名字搜
    if (/music\.126\.net/.test(t.pic)) {
      const hd = neteasePic(t.pic, "1024y1024");
      memoSet(fsCoverCache, covKey, hd);
      fsCoverSrc.value = hd;
      resolveDominantColor(covKey, neteasePic(hd, "64y64"), t); // 采样专用小图
      syncBgShown();
      return;
    }

    // 官方封面：先按原名搜，搜不到再用去掉括号后缀（Live/伴奏/Cover 等）的名字搜
    let done = false;
    // 整条搜索链的总预算：一轮"搜索+详情"超时就 8s，两组串行最坏 32s，封面不值得等这么久
    const searchDeadline = Date.now() + 12000;
    try {
      const cleanName = (t.name || "").replace(/[（(【\[].*?[)）】\]]/g, "").trim();
      const queries = [t.name, cleanName].filter((q, i, a) => q && a.indexOf(q) === i);
      for (const q of queries) {
        if (Date.now() > searchDeadline) break;
        const ctrl = new AbortController();
        const searchTimer = setTimeout(() => ctrl.abort(), 8000);
        coverTimers.push(searchTimer);
        const search = await fetch(`/netease-search?s=${encodeURIComponent(q)}&type=1&limit=3`, { signal: ctrl.signal }).then((r) => r.json());
        const albumId = search?.result?.songs?.[0]?.album?.id;
        if (!albumId) continue;
        const ctrl2 = new AbortController();
        const detailTimer = setTimeout(() => ctrl2.abort(), 8000);
        coverTimers.push(detailTimer);
        const detail = await fetch(`/netease-album/${albumId}`, { signal: ctrl2.signal }).then((r) => r.json());
        const pic = detail?.album?.picUrl;
        if (!pic) continue;
        const hd = pic.replace(/^http:\/\//i, "https://") + "?param=1024y1024";
        memoSet(fsCoverCache, covKey, hd);
        if (track.value === t) {
          fsCoverSrc.value = hd;
          resolveDominantColor(covKey, smallCover(hd), t);
          syncBgShown();
        }
        done = true;
        break;
      }
    } catch {
      // 官方接口异常：走下面的兜底
    }

    // 官方拿不到（搜不到专辑/接口异常）：回落播放列表自带封面，保证全屏有封面与背景
    if (!done && track.value === t) {
      fsCoverSrc.value = base;
      resolveDominantColor(covKey, smallCover(base), t);
      syncBgShown();
    }
  }

  // 封面加载失败：退回占位（Logo）+ 壁纸兜底背景
  function onFsCoverError() {
    const t = track.value;
    const covKey = songIdOf(t) || (t && t.url) || (t && t.name);
    // 删掉坏缓存，下次不再命中；回落播放列表自带封面（若有）
    if (covKey) fsCoverCache.delete(covKey);
    const base = t && t.pic ? hdCover(t.pic) : "";
    fsCoverSrc.value = base;
    fsDominant.value = null;
  }

  // ── 主色提取（canvas，网易 CDN 带 CORS 允许取像素）→ 背景色洗 + 径向渐变 ──
  const fsDominant = ref(null); // { h, s, l }
  const fsDominantCache = new Map(); // 歌名 → 主色，避免重复提取

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0, sat = 0;
    if (max !== min) {
      const d = max - min;
      sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return { h: h * 360, s: sat, l };
  }

  async function resolveDominantColor(name, pic, t) {
    if (!pic) {
      if (track.value === t) fsDominant.value = null;
      return;
    }
    const cached = fsDominantCache.get(name);
    if (cached) {
      if (track.value === t) fsDominant.value = cached;
      return;
    }
    const color = await new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      // 允许异步解码：否则这张图会在主线程解码，切歌时掉帧
      img.decoding = "async";
      const done = (c) => resolve(c);
      img.onload = () => {
        try {
          const cv = document.createElement("canvas");
          cv.width = 24;
          cv.height = 24;
          const ctx = cv.getContext("2d");
          ctx.drawImage(img, 0, 0, 24, 24);
          const d = ctx.getImageData(0, 0, 24, 24).data;
          let r = 0, g = 0, b = 0, n = 0;
          for (let i = 0; i < d.length; i += 4) {
            // 跳过接近纯白/纯黑的像素，取画面主色更准
            const mx = Math.max(d[i], d[i + 1], d[i + 2]);
            const mn = Math.min(d[i], d[i + 1], d[i + 2]);
            if (mx > 245 || mn < 12) continue;
            r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
          }
          if (!n) return done(null);
          done(rgbToHsl(Math.round(r / n), Math.round(g / n), Math.round(b / n)));
        } catch {
          done(null); // 跨域失败则退回模糊封面
        }
      };
      img.onerror = () => done(null);
      img.src = pic;
    });
    if (color) memoSet(fsDominantCache, name, color);
    if (!t || track.value === t) fsDominant.value = color; // 快速切歌时丢弃过期取色
  }

  // 主色可用化：饱和度提上来、亮度压到中间调，任何封面都成一块有存在感的底色
  const fsWashStyle = computed(() => {
    const c = fsDominant.value;
    // 提取失败（跨域/加载失败）时也给一层中性底色，避免背景只剩深底显空。
    // 这一层原来是整屏 filter: saturate(1.1)（等于多一张全屏栅格 + 一个常驻合成层），
    // 现在把 ×1.1 直接烘焙进色值：26% → 29%、饱和度上限 0.62 → 0.68，视觉一致但不占滤镜。
    if (!c) return { background: "hsl(228 29% 19%)" };
    const sat = Math.min(0.68, Math.max(0.31, c.s * 1.5 * 1.1));
    const lum = Math.min(0.42, Math.max(0.16, c.l));
    return { background: `hsl(${c.h.toFixed(0)} ${(sat * 100).toFixed(0)}% ${(lum * 100).toFixed(0)}%)` };
  });

  // 控件动态取色：从封面色提取强调色，绑到 --music-accent（小卡与全屏共用）。
  // 无封面/提取失败时返回空串 → 模板里不设变量，CSS 回退 var(--music-accent, var(--accent1))。
  const musicAccent = computed(() => {
    const c = fsDominant.value;
    if (!c) return "";
    const sat = Math.min(0.78, Math.max(0.35, c.s * 1.8));
    const lum = Math.min(0.66, Math.max(0.5, c.l));
    return `hsl(${c.h.toFixed(0)} ${(sat * 100).toFixed(0)}% ${(lum * 100).toFixed(0)}%)`;
  });

  // 当前站点壁纸：优先复用页面已加载的图（wallpaperBus 注入），其次配置的随机壁纸接口，最后本地图
  function currentWallpaper() {
    return (
      wallpaperUrl.value || siteConfig.bgApi || `${import.meta.env.BASE_URL}images/background.jpg`
    );
  }

  // 全屏背景源：封面取 300，再由 .fs-bg-img 的 blur(44px) 糊开成氛围底色。
  // ⚠️ 曾经为了省渲染把这里降到 32 并去掉那层模糊（「双线性放大本身就是模糊」）——已回退，别再这么做：
  // 实测（node CDP 探针 + 逐进程 CPU 采样，开/关全屏各 12 个相位交替）证明带 44px 模糊与完全不模糊
  // 的代价差在噪声内（1073 vs 1076 ms/s，轮间离散 ±40%）：这一层是**静态**层，只被光栅化一次就缓存成
  // 纹理，每帧不做卷积。所以「降源图分辨率换性能」是纯粹的画质损失——1440 宽下 32px 源每个像素铺 45px，
  // 网易那张家 32px 缩略图的压缩块会被一起放大成明显的方块。
  const fsBgSrc = computed(() => {
    const src = fsCoverSrc.value;
    if (!src) return fsWallpaper.value;
    return neteasePic(src, "300y300");
  });

  // 小卡封面（56px 圆形）：300 足够，避免为小图解码 1024 大图
  const cardCoverSrc = computed(() => neteasePic(track.value.pic || fsCoverSrc.value, "300y300"));

  function dispose() {
    coverTimers.forEach(clearTimeout);
    coverTimers = [];
  }

  const art = {
    fsCoverSrc,
    fsWallpaper,
    bgShown,
    coverLoaded,
    coverImgEl,
    fsBgImgEl,
    fsDominant,
    fsWashStyle,
    musicAccent,
    fsBgSrc,
    cardCoverSrc,
    resolveFsCover,
    onFsCoverError,
    syncBgShown,
    dispose,
  };
  return art;
}
