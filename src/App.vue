<template>
  <Transition name="fade">
    <Loading v-if="loading" />
  </Transition>
  <Background />
  <div class="page" :class="{ ready: !loading, 'panel-return': returning, 'panel-open': showMore }">
    <main class="container">
      <section class="col">
        <div
          class="logo-row rise"
          style="--d: 0.05s"
          role="button"
          tabindex="0"
          @click="enterPanel($event)"
          @keydown.enter="enterPanel($event)"
          @keydown.space.prevent="enterPanel($event)"
        >
          <LogoBadge :size="58" />
          <h1 class="site-name" :style="{ fontFamily: siteFont.css }"
            ><span class="sn-main">{{ siteNameParts[0] }}</span
            ><span v-if="siteNameParts[1]" class="sn-suffix">{{ siteNameParts[1] }}</span></h1
          >
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
       v-if + v-show + Transition 三者叠加时离场会偶发卡住，面板点返回关不掉。
       异步组件（defineAsyncComponent）只是把分包时机交给构建器，挂载后行为与同步版一致；
       main.js 会在空闲时预取这个 chunk，正常点击时早已就绪。 -->
  <MorePanel
    :class="panelAnim ? 'anim-' + panelAnim : ''"
    :style="{ display: showMore ? '' : 'none' }"
    @close="closePanel"
  />

</template>

<script setup>
import { ref, computed, defineAsyncComponent, watch, nextTick, onMounted, onUnmounted } from "vue";
import { siteConfig } from "@/config";
import { applyTilt } from "@/utils/tilt";
import { initCursor } from "@/utils/cursor";
import { usePanel } from "@/composables/usePanel";
import Loading from "@/components/Loading.vue";
import Background from "@/components/Background.vue";
import LogoBadge from "@/components/LogoBadge.vue";
import GreetCard from "@/components/GreetCard.vue";
import BlogCard from "@/components/BlogCard.vue";
import Hitokoto from "@/components/Hitokoto.vue";
import ClockCard from "@/components/ClockCard.vue";
import WeatherCard from "@/components/WeatherCard.vue";
import SiteLinks from "@/components/SiteLinks.vue";
import Footer from "@/components/Footer.vue";
import { currentSiteFont } from "@/fonts";
import { musicBus } from "@/utils/musicBus";
import { whenFrostSettled } from "@/utils/frost";
import { inject } from "@vercel/analytics";

// 二级面板（含音乐播放器等全部面板卡片）独立分包：主页首屏不再为「多数访客不会
// 打开的面板」付出 JS 解析/执行成本。空空闲即预取（见 main.js），点击时基本已就绪。
const MorePanel = defineAsyncComponent(() => import("@/components/MorePanel.vue"));

// 站名拆成「主名 + 后缀」两段渲染：主名大字、后缀小一号（`.top` 这种 TLD），
// 配上手写体就是导航站常见的那种艺术字观感（与 homepage 仓库同一套处理）
const siteNameParts = computed(() => {
  const n = String(siteConfig.siteName || "").trim();
  const i = n.indexOf(".");
  return i > 0 ? [n.slice(0, i), n.slice(i)] : [n, ""];
});
// 站名手写体：config.siteFont 一行切换（可选值见 src/fonts.js）
const siteFont = computed(() => currentSiteFont());

const loading = ref(true);
// 二级面板状态机（开关/进离场动画类/Esc/烟花提示）
const { showMore, returning, panelAnim, enterPanel, openPanel, closePanel } = usePanel();
// 主页卡片开关（siteConfig.homeCards，缺省视为开启）
const homeCards = {
  greet: siteConfig.homeCards?.greet !== false,
  blog: siteConfig.homeCards?.blog !== false,
  hitokoto: siteConfig.homeCards?.hitokoto !== false,
  clock: siteConfig.homeCards?.clock !== false,
  weather: siteConfig.homeCards?.weather !== false,
  siteLinks: siteConfig.homeCards?.siteLinks !== false,
};

onMounted(() => {
  // Initialize Vercel Web Analytics
  inject();

  // 供欢迎卡「首页直接播放/全屏」：面板尚未构建时由它打开。
  // showMore 的 watcher（usePanel 内）会顺带锁背景滚动、注册 Esc。
  musicBus.setOpenPanel(() => {
    openPanel();
  });
  // 历史遗留：早期版本把视图/全屏状态存在本地（刷新后停留原界面），现已去掉，顺手清掉这些键
  try {
    ["zlion_view", "zlion_scroll", "zlion_fs", "zlion_fs_view"].forEach((k) => localStorage.removeItem(k));
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
  // 壁纸过慢时 2.8s 兜底直接进场，避免卡片在极光上进场后壁纸再突兀换底。
  // 进场前还要等毛玻璃快照挂好（见下面 whenFrostSettled 的说明）。
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
  // 揭幕门闩：快照必须在遮罩还完全不透明时就挂好。挂载瞬间卡片边缘会换一条
  // 渲染路径（实时 backdrop-filter 取样 → 60px 出血的烘焙纹理），紧贴边框的
  // 1~6px 亮度会变——揭幕后才挂，就是肉眼可见的「卡片边缘内侧变了一次」。
  // 这一次 await 同时**触发**烘焙（whenFrostSettled 里跑的链是
  // 等字体 → 等布局落定 → 量几何 → 烘焙）：所以不是"提前烘好在这儿零等待"，
  // 而是"在这儿才烘"。快照必须量在布局落定之后——天气卡、RSS 列表是接口到位才
  // 插入的，烘早了它们一进来就得重烘一次，那又是一次可见变化。
  // 只兜 500ms 上限，超时照常揭幕，绝不让观感为它让路。
  // ⚠️超时预算必须从 reveal 时刻起算：如果在外面就先建好这个 500ms 的 Promise，
  // 壁纸慢于 800ms 时它早就烧完了，等于没兜底。
  Promise.race([Promise.all([bgReady, minWait]), timeout])
    .then(() => Promise.race([whenFrostSettled(), new Promise((res) => setTimeout(res, 500))]))
    .then(start);

  // 自定义光标 + 鼠标涟漪
  if (siteConfig.clickEffect) {
    initCursor();
  }
});

onUnmounted(() => {
  // 面板状态机的定时器/Esc 清理在 usePanel 内部完成
});
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
   它自带一张壁纸层，面板只要一动，背景就跟着整块平移（非常假，这就是上一版
   整屏滑动难看的原因）；而面板背景与一级是同一张壁纸，所以"瞬间出现/消失"在视觉上
   本来就是无缝的。真正的动效交给面板内部的卡片（依次浮起 / 反向沉下，见 MorePanel），
   以及下面的"返回一级时主页内容轻轻浮起"。 */

/* 从二级返回一级：二级卡片是依次沉下去的，主页若直接硬切出现会很生硬，
   让主页内容轻轻浮起一次接住。对 .container 整体做位移——只改 transform，
   不会像 opacity 那样压住卡片的 backdrop-filter（这是本项目反复踩过的坑）。 */
.page.panel-return .container {
  animation: page-return 0.42s cubic-bezier(0.22, 1, 0.36, 1) backwards;
}

/* 二级面板是不透明的（.more 自带整屏壁纸 + 不透明底色），主页被完全盖住，
   继续绘制纯属白跑——7 张卡片的 backdrop-filter 也在里面。
   用 visibility 而不是 display:none：布局与 .panel-return 的位移动画都不受影响，
   面板离场（.anim-out 淡出 0.34s）时主页照旧即时可见，观感与从前一致。 */
.page.panel-open {
  visibility: hidden;
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
  /* 手写体没有粗体字重，font-weight 交给浏览器合成会糊，这里用 normal */
  font-weight: 400;
  font-family: "Pacifico", system-ui, sans-serif;
  letter-spacing: 0.5px;
  background: linear-gradient(120deg, #fff 30%, #a5b4fc 70%, #67e8f9);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  /* hover 动效：轻浮起 + 手写体字形同形状的柔光，只动 transform/filter，
     渐变本身不动（仅 transition/transform，不会压住卡片的 backdrop-filter） */
  transition:
    transform 0.4s cubic-bezier(0.22, 1, 0.36, 1),
    filter 0.4s ease;
}

/* 悬停（整个 logo 行都是点击区，徽章上悬停也点亮文字）：轻轻上浮 + 双层柔光 */
.logo-row:hover .site-name,
.logo-row:focus-visible .site-name {
  transform: translateY(-3px);
  filter:
    drop-shadow(0 10px 22px rgba(129, 140, 248, 0.4))
    drop-shadow(0 2px 6px rgba(103, 232, 249, 0.28));
}

/* 按下：贴回去一点，带一点按压手感 */
.logo-row:active .site-name {
  transform: translateY(-1px) scale(0.985);
  transition-duration: 0.15s;
}

/* 后缀与主名同大小：仅靠手写体的连笔区分段落，不做字号分级 */

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

  .site-name {
    transition: none;
  }

  .logo-row:hover .site-name,
  .logo-row:focus-visible .site-name,
  .logo-row:active .site-name {
    transform: none;
    filter: none;
  }
}</style>
