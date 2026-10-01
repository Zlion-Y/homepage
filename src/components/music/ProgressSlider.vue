<template>
  <!-- 小卡进度条（variant=card）与全屏进度条（variant=fs）共用同一条拖拽逻辑：
       pointer 捕获 + 拖动只更新预览、松手才真正 seek（见引擎 progressDown/scrubUp）。
       类名与拆分前完全一致，两侧样式也原样搬入，保证视觉零变化。 -->
  <div :class="fs ? 'fs-progress' : 'progress'" @pointerdown="p.progressDown">
    <div class="p-bar" :style="{ width: p.displayPct.value + '%' }"></div>
    <div class="p-thumb" :style="{ left: p.displayPct.value + '%' }"></div>
  </div>
</template>

<script setup>
import { useMusicPlayer } from "@/composables/useMusicPlayer";

defineProps({
  fs: { type: Boolean, default: false },
});

const p = useMusicPlayer();
</script>

<style scoped>
/* ── 小卡进度条 ── */
.progress {
  position: relative;
  height: 4px;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.14);
  cursor: pointer;
  margin: 2px 4px 12px;
  touch-action: none;
}

.p-bar {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  border-radius: 99px;
  background: var(--music-accent, var(--accent1));
  transition: width 0.1s linear;
}

.p-thumb {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  margin: -6px 0 0 -6px;
  border-radius: 50%;
  background: var(--music-accent, var(--accent1));
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.9);
  transform: scale(0);
  transition: transform 0.2s ease, left 0.1s linear;
}

.progress:hover .p-thumb {
  transform: scale(1);
}

/* ── 全屏进度条（覆盖上面的小卡基准样式，与拆分前的级联顺序一致）── */
.fs-progress {
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.22);
  cursor: pointer;
  position: relative;
  flex: 1;
  min-width: 0;
  /* 按住拖动进度：触屏上别让 pointermove 触发页面滚动 */
  touch-action: none;
}

.fs-progress .p-bar {
  height: 100%;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.85);
}

.fs-progress .p-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  position: absolute;
  top: 50%;
  /* 覆盖小卡 .p-thumb 的 margin 负值居中：这里用 translate 居中，叠加会上浮 */
  margin: 0;
  /* 默认藏起来（小卡的 scale(0) 会被上面的 translate 覆盖，所以要显式再乘一次），
     鼠标移到进度条上、准备拖拽时才浮现 */
  transform: translate(-50%, -50%) scale(0);
  transition: transform 0.18s ease, left 0.1s linear;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}

.fs-progress:hover .p-thumb {
  transform: translate(-50%, -50%) scale(1);
}
</style>
