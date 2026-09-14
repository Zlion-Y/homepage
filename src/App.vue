<template>
  <Transition name="fade">
    <Loading v-if="loading" />
  </Transition>
  <Background />
  <div class="page" :class="{ ready: !loading, 'panel-return': returning }">
    <main class="container">
      <section class="col">
        <div
          class="logo-row rise"
          style="--d: 0.05s"
          role="button"
          tabindex="0"
          @click="enterPanel($event)"
          @keydown.enter="enterPanel($event)"
        >
          <LogoBadge :size="58" />
          <h1 class="site-name">{{ siteConfig.siteName }}</h1>
        </div>
        <GreetCard v-if="homeCards.greet" class="rise" style="--d: 0.18s" />
        <BlogCard v-if="homeCards.blog" class="rise" style="--d: 0.3s" />
      </section>
      <section class="right-col rise" style="--d: 0.12s">
        <div class="bento">
          <Hitokoto v-if="homeCards.hitokoto" />
          <ClockCard v-if="homeCards.clock" />
          <WeatherCard v-if="homeCards.weather" />
        </div>
        <SiteLinks v-if="homeCards.siteLinks" />
      </section>
    </main>
    <Footer class="rise" style="--d: 0.55s" />
  </div>
  <!-- 时长显式给：面板本体不做过渡（一动背景就跟着动），
       动画全在面板内部（卡片错峰浮起/沉下），靠 class 钩子触发，所以要让 Vue
       把 enter/leave-active 保留足够久 -->
  <!-- 首次打开才挂载，之后只切显示：面板一卸载，里面的音乐卡就跟着销毁、<audio> 停播，
       所以改成「挂载一次后常驻」。display:none 期间浏览器不渲染，没有额外绘制开销。
       进/离场动画用自定义的 anim-in / anim-out 类驱动，不走 Vue 的 <Transition>——
       v-if + v-show + Transition 三者叠加时离场会偶发卡住，面板点返回关不掉。 -->
  <MorePanel
    v-if="panelBuilt"
    :class="panelAnim ? 'anim-' + panelAnim : ''"
    :style="{ display: showMore ? '' : 'none' }"
    @close="closePanel"
  />
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from "vue";
import { siteConfig } from "@/config";
import { applyTilt } from "@/utils/tilt";
import { firework, tip } from "@/utils/fx";
import { initCursor } from "@/utils/cursor";
import Loading from "@/components/Loading.vue";
import Background from "@/components/Background.vue";
import LogoBadge from "@/components/LogoBadge.vue";
import GreetCard from "@/components/GreetCard.vue";
import BlogCard from "@/components/BlogCard.vue";
import MorePanel from "@/components/MorePanel.vue";
import Hitokoto from "@/components/Hitokoto.vue";
import ClockCard from "@/components/ClockCard.vue";
import WeatherCard from "@/components/WeatherCard.vue";
import SiteLinks from "@/components/SiteLinks.vue";
import Footer from "@/components/Footer.vue";

const loading = ref(true);
// 二级「探索更多」面板开关
const showMore = ref(false);
// 面板是否已经挂载过：第一次打开才建 DOM，之后常驻（切显示），保证里面的音乐卡不被销毁
const panelBuilt = ref(false);
// 视图与滚动位置记到本地，刷新后回到刷新前的界面
const VIEW_KEY = "zlion_view";
const SCROLL_KEY = "zlion_scroll";
// 返回一级时给主页内容补一次浮起动画（见样式里的 .panel-return）
const returning = ref(false);
let returnTimer = null;
// 主页卡片开关（siteConfig.homeCards，缺省视为开启）
const homeCards = {
  greet: siteConfig.homeCards?.greet !== false,
  blog: siteConfig.homeCards?.blog !== false,
  hitokoto: siteConfig.homeCards?.hitokoto !== false,
  clock: siteConfig.homeCards?.clock !== false,
  weather: siteConfig.homeCards?.weather !== false,
  siteLinks: siteConfig.homeCards?.siteLinks !== false,
};

// 面板进/离场的动画类：进场 620ms 让卡片错峰浮起，离场 380ms 淡出 + 卡片沉下
const panelAnim = ref("");
let panelAnimTimer = null;

function setPanelAnim(name, ms) {
  clearTimeout(panelAnimTimer);
  panelAnim.value = name;
  panelAnimTimer = setTimeout(() => (panelAnim.value = ""), ms);
}

function closePanel() {
  setPanelAnim("out", 380);
  showMore.value = false;
}

// 点击进入面板：在鼠标位置放一朵小烟花 + 冒一句提示（文案见 config.panelTips）
const panelTips = Array.isArray(siteConfig.panelTips) ? siteConfig.panelTips.filter(Boolean) : [];
let panelTipIdx = 0;

function enterPanel(ev) {
  // 键盘触发时没有坐标，就用入口元素中心
  let x = ev && typeof ev.clientX === "number" ? ev.clientX : null;
  let y = ev && typeof ev.clientY === "number" ? ev.clientY : null;
  if (x === null) {
    const el = ev && ev.currentTarget;
    const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    if (r) {
      x = r.left + r.width / 2;
      y = r.top + r.height / 2;
    }
  }
  firework(x, y);
  if (panelTips.length) {
    tip(x, y, panelTips[panelTipIdx++ % panelTips.length]);
  }
  setPanelAnim("in", 620);
  showMore.value = true;
}

// 面板打开时锁定背景滚动；关闭时给主页补一次"浮起"接住二级卡片的依次沉下
watch(showMore, (v) => {
  document.body.style.overflow = v ? "hidden" : "";
  if (v) panelBuilt.value = true;
  try {
    localStorage.setItem(VIEW_KEY, v ? "panel" : "home");
  } catch {
    // 隐私模式下写入失败，不影响功能
  }
  if (!v) {
    returning.value = true;
    clearTimeout(returnTimer);
    returnTimer = setTimeout(() => (returning.value = false), 520);
  }
});

onMounted(() => {
  // 刷新后回到刷新前的界面（一级 / 二级）
  try {
    if (localStorage.getItem(VIEW_KEY) === "panel") {
      panelBuilt.value = true;
      showMore.value = true;
    }
  } catch {
    // 忽略
  }
  // 记住离开时的滚动位置，刷新后还原（面板在手机上自身可滚，顺手一起存）
  const panelEl = document.querySelector(".more");
  const saveScroll = () => {
    try {
      sessionStorage.setItem(
        SCROLL_KEY,
        JSON.stringify({
          win: window.scrollY || 0,
          panel: panelEl ? panelEl.scrollTop : 0,
        })
      );
    } catch {
      // 忽略
    }
  };
  window.addEventListener("pagehide", saveScroll);
  window.addEventListener("beforeunload", saveScroll);
  try {
    const saved = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || "null");
    if (saved) {
      nextTick(() => {
        window.scrollTo(0, saved.win || 0);
        const el = document.querySelector(".more");
        if (el && saved.panel) el.scrollTop = saved.panel;
      });
    }
  } catch {
    // 忽略
  }

  document.title = siteConfig.pageTitle;
  // 配置了自定义 logo 时，favicon 同步替换
  if (siteConfig.logo) {
    const fav = document.querySelector("link[rel='icon']");
    if (fav) fav.href = siteConfig.logo;
  }

  // 载入动画与壁纸加载联动：壁纸就绪（且至少展示 0.8s）才进场，
  // 壁纸过慢时 2.8s 兜底直接进场，避免卡片在极光上进场后壁纸再突兀换底
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    loading.value = false;
    nextTick(() => applyTilt());
  };
  const bgReady = new Promise((res) =>
    window.addEventListener("bg-ready", res, { once: true })
  );
  const minWait = new Promise((res) => setTimeout(res, 800));
  const timeout = new Promise((res) => setTimeout(res, 2800));
  Promise.race([Promise.all([bgReady, minWait]), timeout]).then(start);

  // 自定义光标 + 鼠标涟漪
  if (siteConfig.clickEffect) {
    initCursor();
  }
});

onUnmounted(() => clearTimeout(returnTimer));
</script>

<style scoped>
.page {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 1;
  /* 进场动画的 26px 下移位移会把页脚推出视口、闪出一条滚动条（动画结束消失引起页面右移）；
     clip 就地裁掉这点溢出，滚动条不再出现 */
  overflow: clip;
}

.container {
  flex: 1;
  width: 100%;
  max-width: 1212px;
  margin: 0 auto;
  padding: 32px 28px 24px;
  display: grid;
  /* minmax(0,…) 防止左列长标题（nowrap）的 min-content 撑宽轨道、挤压右列 */
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: 48px;
  /* 视口富余时整体垂直居中，内容超高时自动退化为顶对齐（避免裁顶） */
  align-content: center;
  align-content: safe center;
}

.col {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

/* 左列卡片统一高度 */
.col > .glass {
  min-height: 170px;
}

.logo-row {
  display: flex;
  align-items: center;
  gap: 16px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

/* 二级面板过渡：面板本体不做任何动画。
   它自带一张壁纸层，面板一动背景就整块跟着平移，非常假（上一版整屏滑动就是这么丑的）；
   而面板背景与一级是同一张壁纸，所以"瞬间出现/消失"在视觉上本来就是无缝的。
   真正的动效交给面板内部的卡片（依次浮起 / 反向沉下，见 MorePanel），
   以及下面的"返回一级时主页内容轻轻浮起"。 */

/* 从二级返回一级：二级卡片是依次沉下去的，主页若直接硬切出现会很生硬，
   让主页内容轻轻浮起一次接住。对 .container 整体做位移——只改 transform，
   不会像 opacity 那样压住卡片的 backdrop-filter（这是本项目反复踩过的坑）。 */
.page.panel-return .container {
  animation: page-return 0.42s cubic-bezier(0.22, 1, 0.36, 1) backwards;
}

@keyframes page-return {
  from {
    transform: translateY(14px);
  }
  to {
    transform: none;
  }
}

.site-name {
  font-size: clamp(1.8rem, 3vw, 2.6rem);
  font-weight: 800;
  letter-spacing: 1px;
  background: linear-gradient(120deg, #fff 30%, #a5b4fc 70%, #67e8f9);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

/* 右列：一言/时间 等宽，天气长卡横跨整行，下面是网站列表 */
.right-col {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.bento {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
  grid-auto-rows: 150px;
}

.bento > .glass {
  height: 100%;
}

.bento .weather {
  grid-column: span 2;
}

/* 载入页揭开后触发上滑进场；只做位移不做透明度：
   透明度动画会让 Chromium 暂停 backdrop-filter 渲染，造成卡片"先透底后模糊"的割裂 */
.page.ready .rise {
  animation: rise 0.8s cubic-bezier(0.22, 1, 0.36, 1) var(--d, 0s) backwards;
}

@keyframes rise {
  from {
    transform: translateY(26px);
  }
  to {
    transform: none;
  }
}

@media (max-width: 980px) {
  .container {
    /* minmax(0,…) 同桌面：防 nowrap 长句的 min-content 撑爆轨道致横向溢出 */
    grid-template-columns: minmax(0, 1fr);
    gap: 28px;
    padding: 32px 20px 8px;
    align-content: start;
  }

  .col,
  .right-col {
    min-width: 0;
  }

  .col > .glass {
    min-height: 0;
  }

  .bento {
    grid-template-columns: minmax(0, 1fr);
    grid-auto-rows: minmax(128px, auto);
  }

  /* 天气卡移动端改为内容自适应高度，容纳纵向堆叠的曲线 */
  .bento .weather {
    grid-column: auto;
    height: auto;
    min-height: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .page.ready .rise {
    animation: none;
  }
}</style>
