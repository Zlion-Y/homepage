// 点击进入二级面板时的「烟花绽开 + 小 Tips」。
// 用一个复用的全屏 canvas 画粒子，放完就拆掉，不留常驻开销；
// prefers-reduced-motion 下整套禁用。

const REDUCED =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const COLORS = ["#ffd76e", "#ff9ec4", "#8fd3ff", "#a6ffcb", "#fff4c2"];

let canvas = null;
let ctx = null;
let dpr = 1;
let running = false;
let particles = [];

function resize() {
  if (!canvas) return;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
}

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement("canvas");
  canvas.className = "fx-canvas";
  document.body.appendChild(canvas);
  ctx = canvas.getContext("2d");
  resize();
  window.addEventListener("resize", resize);
}

function teardown() {
  if (!canvas) return;
  window.removeEventListener("resize", resize);
  canvas.remove();
  canvas = null;
  ctx = null;
  particles = [];
}

function loop() {
  if (!ctx) {
    running = false;
    return;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  ctx.globalCompositeOperation = "lighter";

  for (const p of particles) {
    if (p.life <= 0) continue;
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.974;
    p.vy = p.vy * 0.974 + 0.062; // 阻尼 + 重力（都调小，粒子飘得久一点）
    p.life -= p.decay;
    if (p.life <= 0) continue;
    ctx.globalAlpha = Math.min(1, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.4, p.size * (p.flash ? 1 - p.life + 0.5 : p.life)), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  particles = particles.filter((p) => p.life > 0);
  if (particles.length) {
    requestAnimationFrame(loop);
  } else {
    running = false;
    teardown();
  }
}

/** 在屏幕坐标 (x, y) 绽开一朵小烟花 */
export function firework(x, y, opts = {}) {
  if (REDUCED || typeof x !== "number" || typeof y !== "number") return;
  ensureCanvas();
  const count = opts.count ?? 34;
  const spread = opts.spread ?? 1;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const speed = (1.7 + Math.random() * 4.4) * spread;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.1,
      size: 1.6 + Math.random() * 2.1,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      life: 1,
      // 衰减慢一些：粒子能飘 1.5~3 秒，看得清
      decay: 0.0055 + Math.random() * 0.0075,
    });
  }
  // 起爆的一下白闪
  particles.push({ x, y, vx: 0, vy: 0, size: 9, color: "#ffffff", life: 1, decay: 0.055, flash: true });

  if (!running) {
    running = true;
    requestAnimationFrame(loop);
  }
}

/** 在点击位置冒一句小提示，飘一下就没 */
export function tip(x, y, text) {
  if (REDUCED || !text || typeof x !== "number") return;
  const el = document.createElement("div");
  el.className = "fx-tip";
  el.textContent = text;
  el.style.left = x + "px";
  el.style.top = y + "px";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}
