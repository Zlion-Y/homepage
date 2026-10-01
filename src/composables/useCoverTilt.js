import { ref, computed } from "vue";
import { siteConfig } from "../config.js";
import { tiltTransform } from "../utils/tilt.js";

/**
 * 全屏播放器封面 3D 倾斜 + 光泽 + 投影（自 MusicCard 抽出，数学与卡片 tilt 同源）。
 * coverBoxEl 由 FullPlayer 模板绑定。
 */
export function useCoverTilt() {
  const coverBoxEl = ref(null);
  const hovering = ref(false);
  const tiltRX = ref(0);
  const tiltRY = ref(0);
  const shineX = ref(50);
  const shineY = ref(50);
  const coverTransform = ref("");

  const shadowTransform = computed(() => {
    if (!hovering.value) return "";
    const x = -tiltRY.value * 1.6;
    const y = tiltRX.value * 1.2;
    const sx = 1 - Math.abs(tiltRY.value) * 0.008;
    const sy = 1 - Math.abs(tiltRX.value) * 0.008;
    return `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
  });

  const shineBg = computed(
    () => `radial-gradient(circle at ${shineX.value}% ${shineY.value}%, rgba(255,255,255,0.35) 0%, transparent 50%)`
  );

  function coverMove(e) {
    const box = coverBoxEl.value;
    if (!box || !hovering.value || siteConfig.cardTilt === false) return;
    const r = box.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    shineX.value = (x / r.width) * 100;
    shineY.value = (y / r.height) * 100;
    tiltRY.value = ((x - r.width / 2) / (r.width / 2)) * 12;
    tiltRX.value = -((y - r.height / 2) / (r.height / 2)) * 12;
    coverTransform.value = tiltTransform(tiltRX.value, tiltRY.value);
  }

  function coverEnter() {
    if (siteConfig.cardTilt === false) return;
    if (window.matchMedia("(hover: none), (pointer: coarse)").matches) return;
    hovering.value = true;
    const inner = coverBoxEl.value?.querySelector(".fs-cover-inner");
    if (inner) inner.style.transition = "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)";
  }

  function coverLeave() {
    hovering.value = false;
    tiltRX.value = 0;
    tiltRY.value = 0;
    shineX.value = 50;
    shineY.value = 50;
    const inner = coverBoxEl.value?.querySelector(".fs-cover-inner");
    if (inner) {
      inner.style.transition = "transform 400ms cubic-bezier(0.22, 1, 0.36, 1)";
      coverTransform.value = "";
    }
  }

  return {
    coverBoxEl,
    hovering,
    coverTransform,
    shadowTransform,
    shineBg,
    coverMove,
    coverEnter,
    coverLeave,
  };
}
