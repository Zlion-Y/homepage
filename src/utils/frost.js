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
 * ⚠️时机（这条是整个文件最要紧的约束）：快照必须在**载入遮罩还不透明**时就挂好，
 * 且必须挂在**布局落定之后**。两个条件的交集就是「揭幕前最后一刻」：
 *   揭幕时机到 → 等字体 → 等布局落定 → 量几何 → 烘焙 → 才真的揭幕
 * （App.vue 用 whenFrostSettled() 做有界门闩）。未揭幕时 .page 还没有 .ready、
 * rise 动画根本没挂上，卡片静止在最终位置，可以直接量——这是能提前烘焙的前提。
 *
 * 为什么是"最后一刻"而不是"壁纸一就绪就烘"：挂载瞬间卡片边缘会换一条渲染路径
 * （实时 backdrop-filter 在边框盒处截断取样，烘焙层有 60px 真实出血，紧贴边框的
 * 1~6px 亮度变化，实测最多 +18/255），所以切换只能藏在遮罩后面；而天气卡/RSS 列表
 * 都是接口到位才插入的（v-if），一进来右列就推移 182px——烘早了，监护就得在揭幕后
 * 重烘一次，那又是一次可见变化（用户实测反馈：「卡片还没到位就快照了模糊，到位后
 * 又重新模糊快照了一次」）。挂在门闩上，此前所有布局变动都已经吃进几何里。
 * 极端情况（接口比整个载入还慢）仍会晚到重烘，见 scan 里的布局监护。
 *
 * 同理壁纸本身也要在揭幕前就铺满（见 Background.vue 的 .snap）：否则卡片已按最终
 * 壁纸烘焙、背景还在从近黑淡入，两者基准不一致。
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
 * - 布局监护：快照是按挂载那一刻的几何烘焙的，之后任何布局位移（天气卡要等接口
 *   到位才插入、RSS 列表从"正在获取…"变三条、字体回流）都会让整页推移，快照与
 *   壁纸就整体错位。scan 每秒比对一次几何指纹，变了就重烘焙。指纹必须是"视口里的
 *   绝对布局位置"：用 getBoundingClientRect 会被 tilt 变换污染（鼠标划过就变），
 *   只用 offset* 又会被 offsetParent 换锚点污染（实测发生过）——见 geomKey。
 */
import { watch } from "vue";
import { wallpaperUrl, wallpaperSize } from "./wallpaperBus";

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
let prepping = false; // 一轮「揭幕前准备」正在进行
let prepSettled = null; // 本轮准备的完成信号（App.vue 揭幕前有界 await）
let resolvePrep = null;
let gateCalled = false; // 揭幕门闩是否已经来过（决定壁纸晚到后要不要就地补烘）
// 卡片 → 烘焙时的布局几何指纹。布局一变就重烘焙（见 scan 里的监护）
const geom = new WeakMap();

const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);

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

/** 量卡片矩形：先把 tilt 写的内联 transform 摘掉再量。tilt.js 把 3D 倾斜写在
    元素内联样式上，鼠标停在哪张卡上哪张就被变换过，直接量会把倾斜投影当成
    布局位置，烘焙出的壁纸偏移就固定错了 */
function measureRect(card) {
  const t = card.style.transform;
  if (!t) return card.getBoundingClientRect();
  card.style.transform = "";
  const rect = card.getBoundingClientRect();
  card.style.transform = t;
  return rect;
}

/** 布局几何指纹：沿 offsetParent 链累加 offsetLeft/offsetTop——纯布局量，
    不含任何 transform、也不依赖某一个锚点。这里踩过两个坑，两样都不能用：
    ⚠️1. 不能用 getBoundingClientRect（含祖先的 transform）。`.rise` 入场动画一跑，
       被它变换的祖先会**变成新的 offsetParent**，它的 rect 带着动画位移、每帧都在
       变，于是监护在「卡片正在到位」的整段动画里反复判定"布局变了"，摘掉重烘焙
       ——而这段动画恰好整段落在揭幕之后，肉眼看到的就是「快照又变了一次」。
       线上实测：clock 静止 y=32，判错时算出 49；weather 静止 214，判错时 231。
    ⚠️2. 也不能只用 card.offsetLeft/offsetTop：它们相对 offsetParent，而 offsetParent
       会换锚点（同上），位置一动没动、坐标系却整体平移了。
    链式累加对两者都免疫。末了取整：亚像素抖动不该触发重烘焙。 */
function geomKey(card) {
  let x = 0;
  let y = 0;
  for (let n = card; n; n = n.offsetParent) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return `${Math.round(x)},${Math.round(y)},${card.offsetWidth},${card.offsetHeight}`;
}

/** 给单张卡写入快照背景；返回是否成功（卡片可见且有尺寸才写） */
function frostCard(card) {
  const rect = measureRect(card);
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

/** 扫一遍所有卡：没烘焙的烘焙、几何变了的重烘焙。
    单卡成本是一次 offset 读加几条样式写入，量小，可以整秒跑一次 */
function scan() {
  if (document.hidden || !ready) return;
  // 入场/揭幕动画未播完：量 rect 带着位移，快照会错位且事后不自愈
  if (entranceRunning()) return;
  // 面板正在做错峰入场动画：同上，等下一轮
  if (document.querySelector(".more.anim-in")) return;
  document.querySelectorAll(".glass").forEach((card) => {
    // 当前不可见的卡（二级面板收起时 display:none）：留着旧快照不动。
    // 拆掉等于"每次打开面板都重走一次渲染路径切换"，反而把它暴露到明面上
    if (card.offsetWidth < 4 || card.offsetHeight < 4) return;
    const key = geomKey(card);
    const baked = card.classList.contains("frost-ready");
    if (baked && geom.get(card) === key) return;
    // 几何变过：快照还铺在旧位置上，与壁纸整体错位 → 拆掉按新位置重烘焙
    if (baked) unfrostCard(card);
    if (frostCard(card)) geom.set(card, key);
  });
}

/** 载入链路的关键帧动画（首页 rise / 面板 cell-in·top-in / 揭幕 bg-fade）是否仍在跑 */
const ENTRANCE_ANIMS = /^(rise|cell-in|top-in|bg-fade)$/;
function entranceRunning() {
  return document.getAnimations().some(
    (a) => a.playState === "running" && a.animationName && ENTRANCE_ANIMS.test(a.animationName)
  );
}

/** 等入场动画真正播完再量取卡片几何——动画中量 rect 会把 transform 位移一起
    算进去，快照对齐就错了。
    只有"壁纸晚于揭幕才到"（极光兜底之后）这条路径才会真的等；正常路径下
    beginPrep 早在揭幕前就量完了，那时没有动画、卡片静止在最终位置 */
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

/** 量几何的时机：已揭幕 → 等入场动画收尾；未揭幕 → 立即，此时 .page 没有
    .ready、rise 动画根本没挂上，卡片就在最终位置，可以直接量 */
function finalLayout() {
  if (!document.querySelector(".page.ready")) return Promise.resolve();
  return waitEntranceSettled();
}

/** 壁纸原始尺寸决定 cover 参数。优先读 wallpaperBus：Background 的探针加载时
    就已经知道 naturalWidth/Height，零成本；读不到才自己再加载一次（只取尺寸
    不读像素，跨域壁纸也无 CORS 要求）——这一步在揭幕门闩的关键路径上，
    能省掉一次图片加载（缓存 miss 时就是又一次网络往返）就省掉 */
function resolveSize() {
  const s = wallpaperSize.value;
  if (s && s.w > 0 && s.h > 0) {
    imgW = s.w;
    imgH = s.h;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      imgW = img.naturalWidth;
      imgH = img.naturalHeight;
      resolve();
    };
    img.onerror = resolve;
    img.src = wallpaperUrl.value;
  });
}

/** 等布局落定：连续两次采样指纹一致就算稳。
    天气卡、RSS 列表是接口到位才插入的（v-if），它们进来会让右列推移一整行
    （实测 182px）——快照必须在那之后量，否则挂上就是错的，而修正它必然落在
    揭幕之后（=可见的变化）。最多等 LAYOUT_SETTLE_MS：宁可接受一次晚到的重烘焙，
    也不能把揭幕无限拖住。 */
const LAYOUT_SETTLE_MS = 200;
function layoutStable() {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let prev = null;
    const tick = () => {
      const sig = [...document.querySelectorAll(".glass")]
        .filter((c) => c.offsetWidth >= 4)
        .map(geomKey)
        .join("|");
      if (sig === prev || Date.now() - t0 >= LAYOUT_SETTLE_MS) return resolve();
      prev = sig;
      setTimeout(tick, 60);
    };
    tick();
  });
}

/** 揭幕前准备：等字体 → 等布局落定 → 拿尺寸 → 烘焙 → 等这一帧真的画出来。
    整条链都跑在载入遮罩还盖着的时候，挂载瞬间的渲染路径切换就没人看得见。
    每一步都有上限，绝不把揭幕拖住（App.vue 那边还有 500ms 门闩兜底，本链最坏
    150 + 200 + 2 帧 ≈ 380ms）。返回本轮落定的 Promise，供门闩 await */
function beginPrep() {
  if (prepping) return prepSettled || Promise.resolve();
  prepping = true;
  prepSettled = new Promise((r) => (resolvePrep = r));
  const fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  withTimeout(fonts, 150)
    .then(finalLayout)
    .then(layoutStable)
    .then(resolveSize)
    .then(() => {
      if (!eligible()) {
        unfrostAll();
        return undefined;
      }
      ready = true;
      scan();
      // 烘焙这一帧必须真的画出去再放行揭幕（此刻遮罩 opacity 仍是 1）。少这一等，
      // 揭幕那一帧可能先画、快照下一帧才上，等于没藏住。
      return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    })
    .catch(() => {
      // 任何一步出岔子都不该拖住揭幕，门闩那边还有上限兜底
    })
    .then(() => {
      prepping = false;
      if (resolvePrep) {
        resolvePrep();
        resolvePrep = null;
      }
    });
  return prepSettled;
}

/** 揭幕门闩：App.vue 在揭幕前有界 await 它，并借此**触发**烘焙。
    烘焙不放"壁纸一就绪"那一刻，是因为快照必须在布局落定后才量（见文件头时机）。
    无壁纸（极光兜底）时无事可等，直接放行 */
export function whenFrostSettled() {
  gateCalled = true;
  if (!eligible()) return Promise.resolve();
  return beginPrep();
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
    beginPrep();
  }, 300);
}

export function initFrost() {
  if (typeof window === "undefined") return;
  // 壁纸就绪（bg-ready 前 wallpaperBus 已写入）→ 只做图层提升，烘焙交给揭幕门闩；
  // 清空（回退极光）→ 拆除快照
  watch(
    wallpaperUrl,
    (v) => {
      const on = !!v && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
      // 桌面端从首帧起保持卡片图层提升：文字反走样在整个载入+快照挂载过程
      // 保持一致，frost 挂载瞬间不再有提升/降级带来的渲染切换
      document.body.classList.toggle("frost-desktop", on);
      if (!on) {
        unfrostAll();
      } else if (gateCalled) {
        // 壁纸晚于揭幕才到（2.8s 极光兜底之后）：没有遮罩可藏了，就地补烘一次
        beginPrep();
      }
      // 门闩还没来 → 先不动，等 whenFrostSettled 在揭幕前那一刻触发
    },
    { immediate: true }
  );
  window.addEventListener("resize", onResize);
  // 兼作布局监护：没烘焙的补烘、几何变了的重烘（见 scan）
  setInterval(scan, 1000);
}
