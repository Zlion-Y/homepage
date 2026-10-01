/**
 * 平滑滚动 + 卡死回退（自 MusicCard 抽出，歌词抽屉与全屏歌词共用）：
 * 被遮挡窗口/后台标签里 Chromium 会冻结平滑动画，调用方需自行处理超时兜底。
 * token 递增：新的滚动会取代进行中的旧滚动，避免动画叠加抖动。
 */
let smoothToken = 0;

export function bumpSmoothScroll() {
  smoothToken++;
}

export function smoothScrollTo(el, target, onDone) {
  const token = ++smoothToken;
  const from = el.scrollTop;
  const dur = 900;
  const t0 = performance.now();
  // 平滑减速缓动（无过冲回弹：只朝当前歌词方向平滑滚动到位）
  const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
  const step = (now) => {
    if (token !== smoothToken) return; // 被新滚动取代，避免动画叠加抖动
    const p = Math.min(1, (now - t0) / dur);
    el.scrollTop = from + (target - from) * easeOutCubic(p);
    if (p < 1) requestAnimationFrame(step);
    else if (onDone) onDone();
  };
  requestAnimationFrame(step);
}
