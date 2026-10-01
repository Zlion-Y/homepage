<template>
  <div class="bg" ref="rootEl" :style="paletteStyle" aria-hidden="true">
    <div class="aurora" :class="{ idle: custom }">
      <span class="blob b1"></span>
      <span class="blob b2"></span>
      <span class="blob b3"></span>
      <span class="blob b4"></span>
    </div>
    <img v-if="custom" :src="bgSrcRef" class="custom" alt="" @error="onBgError" />
    <div v-if="custom" class="dim"></div>
    <div class="grain"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { siteConfig } from "@/config";
import { wallpaperUrl } from "@/utils/wallpaperBus";

// 背景源：配置的随机壁纸 API 优先，否则探测本地 public/images/background.jpg；
// 都没有/加载失败则保持极光渐变
const bgSrc = siteConfig.bgApi || `${import.meta.env.BASE_URL}images/background.jpg`;
const bgSrcRef = ref(bgSrc);
const custom = ref(false);
// 展示层加载失败（探针成功但展示请求挂了）时回退极光，别留一块深色底。
// 同时清掉已写入的面板壁纸层与全屏兜底引用——否则那两处还指着加载失败的
// 坏 URL，与首页"已回退极光"的状态不一致
const onBgError = () => {
  custom.value = false;
  bgSrcRef.value = "";
  wallpaperUrl.value = "";
  document.documentElement.style.removeProperty("--bg-src");
};

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

// ── 极光漂移：JS 定步进驱动（替代原 CSS 无限动画）────────────────────
// ⚠️这是全站 GPU 占用的最大单项（实测 2560×1392@120Hz 有头 Chrome：极光模式下
// 4 条 CSS 无限漂移动画让合成器每 vsync 出帧，移动的光斑又使 13 张毛玻璃卡的
// backdrop-filter 逐帧重取景，整页 3D 引擎烧到 ~80%）。改法：每 250ms 直接写一次
// transform——46s 周期的缓速漂移每个步进只挪 ~0.5% 路程，肉眼不可辨，但两次写入
// 之间合成器完全静默，帧率从 120/s 降到 4/s。
const rootEl = ref(null);
const DRIFTS = [
  { tx: 9, ty: 7, s: 1.15, dur: 46000 },
  { tx: -7, ty: 10, s: 0.9, dur: 52000 },
  { tx: 6, ty: -9, s: 1.1, dur: 58000 },
  { tx: -9, ty: -6, s: 1.2, dur: 40000 },
];
const DRIFT_STEP_MS = 250;
let driftTimer = null;
let blobEls = [];

// CSS ease-in-out = cubic-bezier(0.42, 0, 0.58, 1)：与原动画的缓动逐点一致
function makeCubicBezier(p1x, p1y, p2x, p2y) {
  const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
  const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
  const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t) => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const xx = sampleX(t) - x;
      if (Math.abs(xx) < 1e-6) break;
      const d = sampleDX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= xx / d;
    }
    return sampleY(Math.min(1, Math.max(0, t)));
  };
}
const easeInOut = makeCubicBezier(0.42, 0, 0.58, 1);

function applyDrift(now = performance.now()) {
  // 壁纸模式下极光 display:none（.aurora.idle），不写样式——display:none 子树的
  // 样式写入不产生任何帧；页面隐藏时浏览器也不渲染，跳过纯属省心
  if (custom.value || document.hidden) return;
  for (let i = 0; i < blobEls.length; i++) {
    const d = DRIFTS[i];
    if (!d) break;
    // infinite alternate：相位 0→2 往返，缓动每个方向各自施加（与 CSS 语义一致）
    const phase = (now % (2 * d.dur)) / d.dur;
    const p = easeInOut(phase < 1 ? phase : 2 - phase);
    blobEls[i].style.transform =
      `translate(${(d.tx * p).toFixed(3)}vw, ${(d.ty * p).toFixed(3)}vh) scale(${(1 + (d.s - 1) * p).toFixed(4)})`;
  }
}

function startDrift() {
  // 与原 @media (prefers-reduced-motion) 下 .blob 静止的行为一致
  if (driftTimer || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  blobEls = rootEl.value ? [...rootEl.value.querySelectorAll(".blob")] : [];
  applyDrift();
  driftTimer = setInterval(applyDrift, DRIFT_STEP_MS);
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

  // 壁纸源降级链：主源失败后依次重试 config.bgFallbacks 里的备用源，全部失败才
  // 回退极光渐变。链表在 config.js 维护；只放行 http(s)，防止误配本地路径混进远程链
  const fallbacks = Array.isArray(siteConfig.bgFallbacks)
    ? siteConfig.bgFallbacks.filter((u) => typeof u === "string" && /^https?:\/\//.test(u))
    : [];
  const isRemote = /^https?:\/\//.test(bgSrc);
  const candidates = isRemote
    ? [bgSrc, ...fallbacks.filter((u) => u !== bgSrc)]
    : [bgSrc];
  let tried = 0;
  const loadBg = () => {
    if (tried >= candidates.length) {
      window.dispatchEvent(new Event("bg-ready")); // 全部失败：照常进场用极光
      return;
    }
    const url = candidates[tried++];
    const img = new Image();
    // 探针 URL 只生成一次：探测（img.src）与展示（bgSrcRef / wallpaperUrl / --bg-src）
    // 用同一个 URL，展示 <img> 直接命中探针请求的浏览器缓存，壁纸整个会话只下载一次。
    const probeUrl = url + (url.includes("?") ? "&" : "?") + "r=" + Math.random().toString(36).slice(2, 6);
    // 挂起兜底：源既不响应也不报错时 8s 判失败换下一个源（否则背景永远停在极光）
    let settled = false;
    const advance = () => {
      if (settled) return;
      settled = true;
      clearTimeout(hangTimer);
      loadBg();
    };
    const hangTimer = setTimeout(advance, 8000);
    img.onload = () => {
      if (settled) return;
      settled = true;
      clearTimeout(hangTimer);
      custom.value = true;
      // 旧实现刻意让展示用"干净 URL"，结果探针那张图下载完即弃、展示图再下一张，
      // 每次打开页面壁纸都要下载两遍（随机 API 每次还可能给不同的图）。
      // 现在探针图即展示图：省一次下载，主页/面板/全屏三处仍是同一张图。
      // （随机性不受影响：每次访问的 r= 参数不同，依旧每次换一张。）
      bgSrcRef.value = probeUrl;
      // 全屏播放器无封面时的背景兜底读这里（E5 解耦），替代 MusicCard 里的 DOM querySelector
      wallpaperUrl.value = new URL(probeUrl, location.href).href;
      // 把"实际展示的那张图"的地址挂到根变量，供二级面板复用。
      // 二级面板必须是不透明的：面板卡片要对背景做 backdrop-filter，若面板半透明，
      // 它下面就是主页卡片，两级卡片会在过渡期间互相透出并逐帧重算模糊（"交叉抖动"）。
      document.documentElement.style.setProperty(
        "--bg-src",
        `url("${new URL(probeUrl, location.href).href}")`
      );
      window.dispatchEvent(new Event("bg-ready"));
    };
    img.onerror = advance;
    img.src = probeUrl;
  };
  loadBg();
  applyPalette();
  paletteTimer = setInterval(applyPalette, 60000);
  startDrift();
});

onUnmounted(() => {
  clearInterval(paletteTimer);
  clearInterval(driftTimer);
});
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

/* 壁纸就绪后极光层完全隐藏：110px 模糊 + 漂移动画在图片背后空转纯浪费 GPU */
.aurora.idle {
  display: none;
}

/* 光斑原来用 filter: blur(110px)——4 个 50vw 上下的圆，合计约 1.7M 像素的整屏高斯，
   而且四个还在 40~58s 无限漂移（模糊半径这么大的层每帧都要重算），是极光路径最贵的一笔。
   实测（同会话交替测 3 轮）：改成渐变后 632 vs 1070 ms CPU/秒，降 41%，配对全部同向。
   写法上试过 7 种候选对着原版算像素差，最后用「5 段 alpha 近似高斯 + 光斑放大 1.3 倍」：
   0% 实色 → 28% 78% → 55% 45% → 78% 18% → 100% 透明，并把直径放大 1.3 倍，
   让颜色的铺开范围接近原版（高斯会把颜色扩散到圆外约 3σ）。
   ⚠️ 只写「实色 → 透明」两段会在实色边界留下肉眼可见的一圈"盘边"（渐变斜率突变），
   像素差看着只差 0.1，但一眼就能看出来——所以必须多段过渡。
   color-mix 需要 Chrome 111+ / Safari 16.2+，故保留上面一行纯色渐变作兜底。
   另外：颜色写进渐变后无法再被 transition 过渡，昼夜调色板切换由 5s 淡变改为瞬时生效。 */
.blob {
  position: absolute;
  opacity: 0.45;
  will-change: transform;
  /* 漂移不再用 CSS 无限动画（合成器每 vsync 出帧 + backdrop-filter 逐帧重取景，
     极光模式实测 80% GPU），由 script 的 startDrift 以 250ms 步进写 transform，
     位移轨迹与缓动曲线逐点对齐原 keyframes（见 DRIFTS/easeInOut）。 */
}

.b1 {
  width: 71.5vw;
  height: 71.5vw;
  left: -12vw;
  top: -18vh;
  background: radial-gradient(circle closest-side, var(--a1, #4f46e5) 0%, transparent 100%);
  background: radial-gradient(
    circle closest-side,
    var(--a1, #4f46e5) 0%,
    color-mix(in srgb, var(--a1, #4f46e5) 78%, transparent) 28%,
    color-mix(in srgb, var(--a1, #4f46e5) 45%, transparent) 55%,
    color-mix(in srgb, var(--a1, #4f46e5) 18%, transparent) 78%,
    transparent 100%
  );
}

.b2 {
  width: 54.6vw;
  height: 54.6vw;
  right: -10vw;
  top: -6vh;
  background: radial-gradient(circle closest-side, var(--a2, #0891b2) 0%, transparent 100%);
  background: radial-gradient(
    circle closest-side,
    var(--a2, #0891b2) 0%,
    color-mix(in srgb, var(--a2, #0891b2) 78%, transparent) 28%,
    color-mix(in srgb, var(--a2, #0891b2) 45%, transparent) 55%,
    color-mix(in srgb, var(--a2, #0891b2) 18%, transparent) 78%,
    transparent 100%
  );
  opacity: 0.38;
}

.b3 {
  width: 65vw;
  height: 65vw;
  left: 18vw;
  bottom: -28vh;
  background: radial-gradient(circle closest-side, var(--a3, #7c3aed) 0%, transparent 100%);
  background: radial-gradient(
    circle closest-side,
    var(--a3, #7c3aed) 0%,
    color-mix(in srgb, var(--a3, #7c3aed) 78%, transparent) 28%,
    color-mix(in srgb, var(--a3, #7c3aed) 45%, transparent) 55%,
    color-mix(in srgb, var(--a3, #7c3aed) 18%, transparent) 78%,
    transparent 100%
  );
  opacity: 0.4;
}

.b4 {
  width: 39vw;
  height: 39vw;
  right: 6vw;
  bottom: -8vh;
  background: radial-gradient(circle closest-side, var(--a4, #be185d) 0%, transparent 100%);
  background: radial-gradient(
    circle closest-side,
    var(--a4, #be185d) 0%,
    color-mix(in srgb, var(--a4, #be185d) 78%, transparent) 28%,
    color-mix(in srgb, var(--a4, #be185d) 45%, transparent) 55%,
    color-mix(in srgb, var(--a4, #be185d) 18%, transparent) 78%,
    transparent 100%
  );
  opacity: 0.3;
}

.custom {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* 这里原来是 filter: brightness(0.8) saturate(1.1)——整屏滤镜，一层全屏栅格。
     brightness(0.8) 与 20% 黑罩是同一个结果（sRGB 下 0.8c ≡ c*(1-0.2)），
     而且二级面板的 --bg-src 一直就是这么罩的，两边基准从此一致。
     少掉的 saturate(1.1) 是 10% 的饱和度差，肉眼几乎分辨不出，换来整层滤镜的消失。 */
  animation: bg-fade 0.7s ease both;
}

/* 壁纸压暗层：与 .custom 同步淡入，避免壁纸还在淡入时黑色罩子已经到位 */
.dim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.36);
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

/* 颗粒层：原来带 mix-blend-mode: overlay。整屏混合模式是常驻开销——Chromium 要为它
   保住一张全屏混合层并逐帧重算，实测独占约 8 个 GPU 点（一级 49% → 41%，几乎等于
   把整个背景层都关掉；壁纸本身和它的 filter 都是静态的一次性成本，不花钱）。
   改成普通低透明度叠加：在 4% 这个量级肉眼几乎分辨不出，但没有混合模式就没有那笔开销。 */
.grain {
  position: absolute;
  inset: 0;
  opacity: 0.04;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.35'/%3E%3C/svg%3E");
  background-size: 180px;
}
</style>
