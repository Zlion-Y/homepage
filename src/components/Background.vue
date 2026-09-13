<template>
  <div class="bg" :style="paletteStyle" aria-hidden="true">
    <div class="aurora">
      <span class="blob b1"></span>
      <span class="blob b2"></span>
      <span class="blob b3"></span>
      <span class="blob b4"></span>
    </div>
    <img v-if="custom" :src="bgSrc" class="custom" alt="" />
    <div class="grain"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { siteConfig } from "@/config";

// 背景源：配置的随机壁纸 API 优先，否则探测本地 public/images/background.jpg；
// 都没有/加载失败则保持极光渐变
const bgSrc = siteConfig.bgApi || `${import.meta.env.BASE_URL}images/background.jpg`;
const custom = ref(false);

// 极光背景随昼夜时段变色（黎明 / 白天 / 黄昏 / 夜晚）
const palettes = {
  dawn: ["#6366f1", "#ec4899", "#8b5cf6", "#fb923c"],
  day: ["#3b82f6", "#06b6d4", "#6366f1", "#a855f7"],
  dusk: ["#f59e0b", "#d946ef", "#6366f1", "#ef4444"],
  night: ["#4f46e5", "#0891b2", "#7c3aed", "#be185d"],
};

function paletteOf(h) {
  if (h >= 5 && h < 8) return "dawn";
  if (h >= 8 && h < 16) return "day";
  if (h >= 16 && h < 19) return "dusk";
  return "night";
}

const paletteStyle = ref({});
let paletteTimer = null;

function applyPalette() {
  const p = palettes[paletteOf(new Date().getHours())];
  paletteStyle.value = { "--a1": p[0], "--a2": p[1], "--a3": p[2], "--a4": p[3] };
}

onMounted(() => {
  // 提前与壁纸 API 域名建连，省去 DNS/TLS 时间
  try {
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = new URL(bgSrc, location.href).origin;
    document.head.appendChild(link);
  } catch {
    // URL 解析失败不影响正常加载
  }

  const img = new Image();
  img.onload = () => {
    custom.value = true;
    window.dispatchEvent(new Event("bg-ready"));
  };
  // 加载失败也通知：页面照常进场，使用极光渐变
  img.onerror = () => window.dispatchEvent(new Event("bg-ready"));
  img.src = bgSrc;
  applyPalette();
  paletteTimer = setInterval(applyPalette, 60000);
});

onUnmounted(() => clearInterval(paletteTimer));
</script>

<style scoped>
.bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  background: var(--bg);
}

.aurora {
  position: absolute;
  inset: 0;
}

.blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(110px);
  opacity: 0.45;
  will-change: transform;
  transition: background-color 5s ease;
}

.b1 {
  width: 55vw;
  height: 55vw;
  left: -12vw;
  top: -18vh;
  background: var(--a1, #4f46e5);
  animation: drift1 46s ease-in-out infinite alternate;
}

.b2 {
  width: 42vw;
  height: 42vw;
  right: -10vw;
  top: -6vh;
  background: var(--a2, #0891b2);
  opacity: 0.38;
  animation: drift2 52s ease-in-out infinite alternate;
}

.b3 {
  width: 50vw;
  height: 50vw;
  left: 18vw;
  bottom: -28vh;
  background: var(--a3, #7c3aed);
  opacity: 0.4;
  animation: drift3 58s ease-in-out infinite alternate;
}

.b4 {
  width: 30vw;
  height: 30vw;
  right: 6vw;
  bottom: -8vh;
  background: var(--a4, #be185d);
  opacity: 0.3;
  animation: drift4 40s ease-in-out infinite alternate;
}

@keyframes drift1 {
  to {
    transform: translate(9vw, 7vh) scale(1.15);
  }
}

@keyframes drift2 {
  to {
    transform: translate(-7vw, 10vh) scale(0.9);
  }
}

@keyframes drift3 {
  to {
    transform: translate(6vw, -9vh) scale(1.1);
  }
}

@keyframes drift4 {
  to {
    transform: translate(-9vw, -6vh) scale(1.2);
  }
}

.custom {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: brightness(0.8) saturate(1.1);
  /* 壁纸加载完成后淡入，与卡片进场同步 */
  animation: bg-fade 0.7s ease both;
}

@keyframes bg-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.grain {
  position: absolute;
  inset: 0;
  opacity: 0.05;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.35'/%3E%3C/svg%3E");
  background-size: 180px;
}

@media (prefers-reduced-motion: reduce) {
  .blob {
    animation: none;
  }
}
</style>
