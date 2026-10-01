import { ref, computed } from "vue";

/**
 * 歌单渐进上屏（自 MusicCard 抽出）：
 * 410 行一次性渲染要建约 5300 个节点，是一次约 100ms 的主线程长任务
 * （点开二级面板当场掉帧的真凶）。改成分帧追加——首屏只建 chunk 行，其余在空闲时间
 * 补齐，单帧代价只剩新增的那几行；配合行上的 content-visibility，离屏行不参与布局。
 */
export function useProgressiveList(totalRef, chunk, onDone) {
  const limit = ref(chunk);
  const rows = computed(() => totalRef.value.slice(0, limit.value));
  let handle = 0;
  let idle = false;
  // 补齐完成前不允许“先渲染到某一行”——随机起始曲的序号可能接近 400，
  // 一旦按需插队渲染就退化成一次性上屏（实测仍是约 80ms 长任务）。
  // 补齐完成后再定位（onDone），此时 limit 已到底，插队是空操作。
  let fillDone = false;
  const stop = () => {
    if (!handle) return;
    if (idle && window.cancelIdleCallback) window.cancelIdleCallback(handle);
    else clearTimeout(handle);
    handle = 0;
  };
  const schedule = (fn) => {
    if (window.requestIdleCallback) {
      idle = true;
      // timeout 设为 60ms：只在真空闲时插入，但保证 1s 内补完，用户开始滚动前就已就绪
      return window.requestIdleCallback(fn, { timeout: 60 });
    }
    idle = false;
    return setTimeout(fn, 16);
  };
  const step = () => {
    if (limit.value >= totalRef.value.length) {
      handle = 0;
      fillDone = true;
      if (onDone) onDone();
      return;
    }
    limit.value = Math.min(totalRef.value.length, limit.value + chunk);
    handle = schedule(step);
  };
  return {
    rows,
    // 回到首屏 chunk 再补齐（歌单到位 / 切到队列视图时调用）
    restart() {
      stop();
      fillDone = false;
      limit.value = Math.min(chunk, totalRef.value.length);
      if (limit.value < totalRef.value.length) {
        handle = schedule(step);
      } else {
        handle = 0;
        fillDone = true;
        if (onDone) onDone();
      }
    },
    // 补齐是否已完成（调用方据此决定要不要 restart，见 openFs）
    isDone() {
      return fillDone;
    },
    // 要定位到某一行时先把它渲染出来（否则 children[i] 还不存在）
    ensure(n) {
      if (!fillDone) return;
      if (limit.value < n) limit.value = Math.min(n, totalRef.value.length);
    },
    stop,
  };
}

/** 列表滚动到当前播放行（小卡歌单 / 全屏队列共用） */
export function scrollListToActive(container, activeEl) {
  if (!container || !activeEl) return;
  const center = () => {
    container.scrollTop = activeEl.offsetTop - container.clientHeight / 2 + activeEl.offsetHeight / 2;
  };
  center();
  // 离屏行在 content-visibility 下高度是估算值，大跨度跳转落地后真实布局会让目标
  // 偏移一点；下一帧用渲染后的真实 offsetTop 校正一次
  requestAnimationFrame(center);
}
