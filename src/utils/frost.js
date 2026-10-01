/**
 * 毛玻璃快照（桌面端交互 GPU 优化）——CSS 版
 *
 * 背景：13 张 .glass 用实时 backdrop-filter: blur(14px) saturate(1.4)。桌面端页面
 * 不滚动，卡片背后的壁纸是静态的——滤镜输出永远不变，但任何脏区（光标/涟漪/倾斜）
 * 碰到卡片都会让 Chromium 逐帧重跑这份模糊。实测（有头 Chrome + Windows GPU Engine
 * 计数器，2560×1392@120Hz）：光标在卡片上移动 GPU 50~78%，纯空白区只有 ~15%，
 * 关掉 backdrop-filter 即回落到 ~14%（V5 实验）——烧的就是这份「永远不变的模糊」。
 *
 * 方案：壁纸就绪后给每张卡加 .frost-ready：
 *   - ::after 伪元素铺「壁纸 cover + 36% 压暗 + 颗粒」（背景按视口对齐：JS 一次性
 *     算好 background-position/size，不用 background-attachment:fixed——后者在
 *     transform 祖先下会被 Chromium 退化成 scroll，悬停倾斜时会跳变）；
 *   - ::after 自身挂 filter: blur(14px) saturate(1.4)。静态元素的一次性滤镜光栅化
 *     一次后缓存成纹理（与全屏背景层移除 will-change 后的实测行为一致），交互脏区
 *     不再触发任何重取样；
 *   - 卡片撤掉实时 backdrop-filter。3D 倾斜照常——整卡变换一张静态纹理几乎免费。
 *
 * 边界：
 * - 仅桌面精确指针启用（hover:hover + pointer:fine）。移动端页面会滚动、卡背后的
 *   区域随之变化，维持实时 backdrop-filter。
 * - 极光模式（壁纸加载失败）不启用：背后的光斑还在缓慢漂移，实时取样才正确；
 *   wallpaperBus 清空时自动拆除快照、还原实时滤镜。
 * - ::after 用 z-index:-1 沉到卡片内容之下、玻璃底色之上，因此 .glass 需要
 *   isolation:isolate 收住层叠（快照层不透明、铺满卡片，光泽层的混合基底与
 *   实时取样版完全一致，观感不变）。
 * - 窗口尺寸变化后重算各卡的偏移（防抖）；面板入场动画期间位置未定，跳过等下轮。
 */
import { watch } from "vue";
import { wallpaperUrl } from "./wallpaperBus";

// ⚠️与 Background.vue 里 .grain 的 SVG 同源（噪点纹理 160×160）。页面那层是
// 元素 opacity 0.04 × SVG 内部 0.35——快照层没有元素级透明度可挂，直接把
// 0.35×0.04≈0.014 烘进贴图，保证与实时取样同亮度。
const GRAIN_SRC =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.014'/%3E%3C/svg%3E";
const GRAIN_SIZE = 180; // .grain 的 background-size
const BLEED = 60; // ::after 超出卡片的余量，给模糊供边缘采样（3σ ≈ 21px，60 足够）

let ready = false; // 壁纸尺寸已知（cover 参数可算）
let imgW = 0;
let imgH = 0;
let scanTimer = null;
let resizeTimer = null;

function eligible() {
  return (
    !!wallpaperUrl.value &&
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
}

function coverSize(vw, vh) {
  const ir = imgW / imgH;
  const vr = vw / vh;
  if (ir > vr) return { dw: vh * ir, dh: vh };
  return { dw: vw, dh: vw / ir };
}

/** 给单张卡写入快照背景；返回是否成功（卡片可见且有尺寸才写） */
function frostCard(card) {
  const rect = card.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return false;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const { dw, dh } = coverSize(vw, vh);
  // 只有壁纸层需要视口对齐：::after 盒原点在卡片左上角外 BLEED 处，
  // 壁纸层要反向平移 (vw-dh)/2-rect.left+BLEED，让卡内看到的壁纸与页面背景逐像素对齐。
  // ⚠️均匀色层（tint/压暗）和颗粒必须用 0 0 定位——它们的尺寸是 auto（=盒子大小），
  // 若也写成视口对齐偏移会把整层平移出盒子（实测卡内只剩未压暗的壁纸，parity 崩掉）。
  // 颗粒是噪点，相位与页面 .grain 差 60px 不可辨。
  // 层序（上→下）：tint → 颗粒 → 压暗 → 壁纸。
  // 快照必须完整复刻 backdrop 的取样内容：首页背后是 .bg（.grain 在上、.dim 次之、
  // 壁纸最底），面板背后是 .more::before（36% 压暗 + 壁纸，无颗粒）——两个场景的
  // backdrop 都含 36% 压暗（漏掉就是面板卡整体亮一档，实测 +33/通道），只有颗粒是首页独有。
  // ⚠️6% 玻璃底色必须进快照层：::after 是 z-index:-1 的子级，按 CSS 绘制顺序恰好
  // 盖住卡片自身的 background（元素背景先画、负 z 子级后画）——底色只留在元素上
  // 会被快照盖掉（实测卡内少 6% 白）。放进滤镜栈数学等价：saturate 是线性算子
  // 且白色饱和中性，saturate(tint(x)) ≡ tint(saturate(x))。
  // 背景层经 CSS 变量喂给 ::after（伪元素无法直接写内联样式）。
  const inPanel = !!card.closest(".more");
  const tint = "linear-gradient(var(--frost-tint, rgba(255, 255, 255, 0.06)), var(--frost-tint, rgba(255, 255, 255, 0.06)))";
  const layers = [tint];
  const sizes = ["auto"];
  const positions = ["0 0"];
  const repeats = ["no-repeat"];
  if (!inPanel) {
    layers.push(`url("${GRAIN_SRC}")`);
    sizes.push(`${GRAIN_SIZE}px ${GRAIN_SIZE}px`);
    positions.push("0 0");
    repeats.push("repeat");
  }
  layers.push("linear-gradient(rgba(0, 0, 0, 0.36), rgba(0, 0, 0, 0.36))");
  sizes.push("auto");
  positions.push("0 0");
  repeats.push("no-repeat");
  layers.push(`url("${wallpaperUrl.value}")`);
  sizes.push(`${dw.toFixed(1)}px ${dh.toFixed(1)}px`);
  positions.push(`${((vw - dw) / 2 - rect.left + BLEED).toFixed(1)}px ${((vh - dh) / 2 - rect.top + BLEED).toFixed(1)}px`);
  repeats.push("no-repeat");
  card.style.setProperty("--frost-image", layers.join(", "));
  card.style.setProperty("--frost-size", sizes.join(", "));
  card.style.setProperty("--frost-position", positions.join(", "));
  card.style.setProperty("--frost-repeat", repeats.join(", "));
  card.classList.add("frost-ready");
  return true;
}

function unfrostCard(card) {
  card.classList.remove("frost-ready");
  card.style.removeProperty("--frost-image");
  card.style.removeProperty("--frost-size");
  card.style.removeProperty("--frost-position");
  card.style.removeProperty("--frost-repeat");
}

function unfrostAll() {
  ready = false;
  document.querySelectorAll(".glass.frost-ready").forEach(unfrostCard);
}

/** 扫一遍未烘焙的卡，全部处理（单卡成本是一次 rect 读加几条样式写入，量小） */
function scan() {
  if (document.hidden || !ready) return;
  // 入场/揭幕动画未播完：getBoundingClientRect 带着位移，快照会错位且事后不自愈
  if (entranceRunning()) return;
  // 面板正在做错峰入场动画：同上，等下一轮
  if (document.querySelector(".more.anim-in")) return;
  document.querySelectorAll(".glass:not(.frost-ready)").forEach(frostCard);
}

/** 载入链路的关键帧动画（首页 rise / 面板 cell-in·top-in / 揭幕 bg-fade）是否仍在跑 */
const ENTRANCE_ANIMS = /^(rise|cell-in|top-in|bg-fade)$/;
function entranceRunning() {
  return document.getAnimations().some(
    (a) => a.playState === "running" && a.animationName && ENTRANCE_ANIMS.test(a.animationName)
  );
}

/** 等入场动画真正播完再量取卡片几何——动画中量 rect 会把 transform 位移
    一起算进去，快照对齐就错了，而且挂载瞬间的渲染路径切换会被肉眼看到
    （这就是「加载动画结束后还能看到变化过程」的来源） */
function waitEntranceSettled() {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      if (!entranceRunning() || Date.now() - t0 > 4000) return resolve();
      setTimeout(tick, 150);
    };
    tick();
  });
}

function engage() {
  // 等载入揭幕：.page.ready 之前卡片还没进场
  if (!document.querySelector(".page.ready")) {
    setTimeout(engage, 300);
    return;
  }
  // 字体就绪前文本回流会改变卡片尺寸；入场动画播完前 rect 带位移——都等
  const fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  fonts.then(waitEntranceSettled).then(() => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      imgW = img.naturalWidth;
      imgH = img.naturalHeight;
      ready = true;
      scan();
    };
    // 只取 naturalWidth/Height 做 cover 计算，不读像素——跨域壁纸也无 CORS 要求
    img.src = wallpaperUrl.value;
  });
}

function scheduleEngage() {
  if (!eligible()) {
    unfrostAll();
    return;
  }
  // 等载入揭幕的 rise 动画收尾（与 tilt.js 的 1500ms 同节奏）再挂快照
  setTimeout(engage, 1500);
}

function onResize() {
  if (!ready) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!eligible()) {
      unfrostAll();
      return;
    }
    // 视口变了：cover 参数与偏移全部重算（快照层是纯 CSS 背景，重算即生效）
    document.querySelectorAll(".glass.frost-ready").forEach(unfrostCard);
    engage();
  }, 300);
}

export function initFrost() {
  if (typeof window === "undefined") return;
  // 壁纸就绪（bg-ready 前 wallpaperBus 已写入）→ 挂快照；清空（回退极光）→ 拆除
  watch(
    wallpaperUrl,
    (v) => {
      const on = !!v && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
      // 桌面端从首帧起保持卡片图层提升：文字反走样在整个载入+快照挂载过程
      // 保持一致，frost 挂载瞬间不再有提升/降级带来的渲染切换
      document.body.classList.toggle("frost-desktop", on);
      if (on) {
        scheduleEngage();
      } else {
        unfrostAll();
      }
    },
    { immediate: true }
  );
  window.addEventListener("resize", onResize);
  setInterval(scan, 2000);
}
