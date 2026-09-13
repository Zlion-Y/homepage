<template>
  <Transition name="fade">
    <Loading v-if="loading" />
  </Transition>
  <Background />
  <div class="page" :class="{ ready: !loading }">
    <main class="container">
      <section class="col">
        <div
          class="logo-row rise"
          style="--d: 0.05s"
          role="button"
          tabindex="0"
          @click="showMore = true"
          @keydown.enter="showMore = true"
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
  <Transition name="more">
    <MorePanel v-if="showMore" @close="showMore = false" />
  </Transition>
</template>

<script setup>
import { ref, watch, nextTick, onMounted } from "vue";
import { siteConfig } from "@/config";
import { applyTilt } from "@/utils/tilt";
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
// 主页卡片开关（siteConfig.homeCards，缺省视为开启）
const homeCards = {
  greet: siteConfig.homeCards?.greet !== false,
  blog: siteConfig.homeCards?.blog !== false,
  hitokoto: siteConfig.homeCards?.hitokoto !== false,
  clock: siteConfig.homeCards?.clock !== false,
  weather: siteConfig.homeCards?.weather !== false,
  siteLinks: siteConfig.homeCards?.siteLinks !== false,
};

// 面板打开时锁定背景滚动
watch(showMore, (v) => {
  document.body.style.overflow = v ? "hidden" : "";
});

onMounted(() => {
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

/* 二级面板过渡 */
.more-enter-active,
.more-leave-active {
  transition: opacity 0.35s ease, transform 0.35s ease;
}

.more-enter-from,
.more-leave-to {
  opacity: 0;
  transform: translateY(24px);
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
