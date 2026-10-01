/**
 * 网易云 CDN 封面/歌曲 ID 工具（自 MusicCard 抽出的纯函数，便于单测与复用）
 */

/** 有上限的缓存写入（LRU 语义）：超过 max 删最旧一条，长会话也不会无界增长 */
export function memoSet(map, key, val, max = 200) {
  if (map.has(key)) map.delete(key);
  map.set(key, val);
  if (map.size > max) map.delete(map.keys().next().value);
}

/**
 * 歌曲 ID → proxy 解析直链 / 官方歌曲详情批量换高清封面。
 * 优先级：音源返回的 id 字段 > URL ?id= 参数 > 网易 CDN 直链路径中的文件名（即歌曲 ID）
 */
export function songIdOf(t) {
  if (!t) return "";
  if (t.id) return String(t.id);
  const u = t.url || "";
  let m = u.match(/[?&]id=(\d+)/);
  if (m) return m[1];
  // 网易 CDN 直链：…/YYYYMMDDHHMMSS/md5/SONGID.mp3（文件名即歌曲 ID）
  m = u.match(/\/(\d+)\.(mp3|m4a|flac|aac|wav|ogg)(\?|#|$)/i);
  return m ? m[1] : "";
}

/** 网易云 CDN 加尺寸参数取指定尺寸封面，其他图源原样返回 */
export function neteasePic(picUrl, size) {
  const u = (picUrl || "").replace(/^http:\/\//i, "https://");
  return /music\.126\.net/.test(u) ? u.replace(/[?&]param=[^&]*/, "") + "?param=" + size : u;
}

/** 高清封面（1024²）：网易 CDN 加尺寸参数，其他图源仅升级 https */
export function hdCover(u) {
  if (!u) return u;
  const s = u.replace(/^http:\/\//i, "https://");
  return /music\.126\.net/.test(s) && !s.includes("param=") ? s + "?param=1024y1024" : s;
}

/**
 * 主色提取只需要一张很小的图：拿 1024 封面去 drawImage 会强制解码整张大图
 * （主线程几十毫秒，切歌/开面板时掉帧）。换 64×64 变体后解码几乎无成本，
 * 而取色本来就降采样到 24×24 求均值，结果一致。
 */
export function smallCover(u) {
  if (!u) return u;
  const s = u.replace(/^http:\/\//i, "https://").replace(/\?param=[^&]*/i, "");
  return /music\.126\.net/.test(s) ? s + "?param=64y64" : s;
}
