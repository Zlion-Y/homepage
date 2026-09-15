<template>
  <div class="more">
    <div class="inner">
      <header class="top">
        <button class="back" @click="$emit('close')">
          <Icon name="arrow-left" :size="15" />
          <span>返回</span>
        </button>
        <h2>探索更多</h2>
      </header>
      <div class="grid" :style="{ '--rows': gridRows, '--n': cards.length }">
        <component
          :is="c.comp"
          v-for="(c, i) in cards"
          :key="c.key"
          class="cell"
          :style="{ '--i': i }"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, nextTick } from "vue";
import { applyTilt } from "@/utils/tilt";
import { siteConfig } from "@/config";
import Icon from "@/components/Icon.vue";
import NewsCard from "@/components/NewsCard.vue";
import HotListCard from "@/components/HotListCard.vue";
import MusicCard from "@/components/MusicCard.vue";
import EpicCard from "@/components/EpicCard.vue";
import HistoryCard from "@/components/HistoryCard.vue";
import GithubCard from "@/components/GithubCard.vue";
import SiteMonitorCard from "@/components/SiteMonitorCard.vue";

// 卡片清单由配置驱动（siteConfig.panelCards：顺序 = 排列，删项 = 隐藏）
const cardMap = {
  news: NewsCard,
  hotlist: HotListCard,
  music: MusicCard,
  epic: EpicCard,
  history: HistoryCard,
  monitor: SiteMonitorCard,
  github: GithubCard,
};
// 依赖配置的卡：对应配置为空时自动隐藏
const needs = {
  github: () => !!siteConfig.githubUser,
  music: () => !!siteConfig.musicPlaylist,
  monitor: () => !!(siteConfig.siteMonitors || []).length,
};
const cards = computed(() =>
  (siteConfig.panelCards || Object.keys(cardMap))
    .map((key) => ({ key, comp: cardMap[key] }))
    .filter((c) => c.comp && (!needs[c.key] || needs[c.key]()))
);
// 行数随卡片数自适应（每行 3 张）
const gridRows = computed(
  () => `repeat(${Math.max(1, Math.ceil(cards.value.length / 3))}, minmax(0, 1fr))`
);

const emit = defineEmits(["close"]);

function onKey(e) {
  if (e.key === "Escape") emit("close");
}

onMounted(() => {
  window.addEventListener("keydown", onKey);
  // 面板卡片动态挂载，立即绑定 hover 倾联动效
  nextTick(() => applyTilt(0));
});
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<style scoped>
/* 一屏 3×2：面板不滚动，两行撑满视口，列表卡内部滚动 */
.more {
  position: fixed;
  inset: 0;
  z-index: 40;
  /* 面板必须不透明：卡片要对背景做 backdrop-filter，面板若半透明，它下面就是主页卡片，
     两级卡片会互相透出；而且过渡动画期间背景一变（主页被隐/现），卡片的模糊就要逐帧重算，
     看起来就是两级模糊交叉抖动。做成不透明的"清晰壁纸"，卡片永远只对自己的这层取景。
     底色先用不透明主题色兜底（壁纸没就绪时也不透光）。 */
  background: var(--bg);
}

/* 面板的清晰壁纸层：复用一级界面那张壁纸（--bg-src 是同一个 URL，命中缓存不重复下载），
   观感与一级背景完全一致——清晰、不模糊。
   亮度对齐壁纸的 filter: brightness(0.8)，这里用 20% 黑罩叠加实现，
   刻意不在父层写 filter：filter 会建立 backdrop root，可能影响卡片的 backdrop-filter 取景。 */
.more::before {
  content: "";
  /* 手机上面板自身可滚（.more { overflow-y: auto }），absolute 会跟着内容一起滚走——
     滚到下半屏就只剩面板底色、壁纸消失。改成 fixed 常驻视口，整屏都有背景。 */
  position: fixed;
  inset: 0;
  z-index: -1;
  background-image: linear-gradient(rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0.2)), var(--bg-src, none);
  background-size: cover, cover;
  background-position: center, center;
  background-repeat: no-repeat, no-repeat;
}

/* 面板卡片是动态挂载的，出现时就已经可见——不预先提升合成层的话，会先画出一层
   半透明白底、下一帧模糊才补上（"白色透底 → 毛玻璃"的闪一下）。
   主页卡片不需要这个提示：它们首绘时被载入层盖着，模糊在揭开前就已就绪。
   只给面板这 6 张卡加，且随面板卸载一起消失，不做常驻开销。 */
.more :deep(.glass) {
  will-change: backdrop-filter;
}

/* 进/离场不再走 Vue 的 <Transition>：v-if + v-show + Transition 叠在一起时，
   离场会偶发卡在 leave-from/leave-active（表现就是"点了返回面板关不掉"）。
   现在由 App.vue 自己加 .anim-in / .anim-out 并控时序，这里只负责动画本身。 */
.more.anim-in {
  opacity: 1;
}

.more.anim-out {
  opacity: 0;
  transition: opacity 0.34s linear;
}

/* ── 进场：面板本体不动，只让卡片依次浮起 ──
   面板自带一张壁纸层，面板只要一动，背景就跟着整块平移（非常假，这就是上一版
   整屏滑动难看的原因）。而面板背景与一级是同一张壁纸，所以"瞬间出现"在视觉上
   本来就是无缝的——真正需要"加载感"的是卡片内容，用逐张错峰浮起表现。
   只做 transform，不碰 opacity：opacity 动画会让 backdrop-filter 停摆，
   卡片会先透底、模糊后到（就是之前的"毛玻璃慢半拍"）。--i 由模板按顺序注入。 */
.more.anim-in :deep(.grid > .cell) {
  animation: cell-in 0.85s cubic-bezier(0.22, 1, 0.36, 1) backwards;
  animation-delay: calc(var(--i, 0) * 100ms);
}

/* 返回键与标题：同样只做位移（返回键本身也有 backdrop-filter，不能淡入） */
.more.anim-in .top {
  animation: top-in 0.7s cubic-bezier(0.22, 1, 0.36, 1) backwards;
}

@keyframes cell-in {
  from {
    transform: translateY(16px) scale(0.97);
  }
  to {
    transform: none;
  }
}

@keyframes top-in {
  from {
    transform: translateY(-8px);
  }
  to {
    transform: none;
  }
}

/* 退场：反向依次沉下去（--n 是卡片总数，由模板注入）。
   both 填充：延迟期间保持原位不跳，动画结束停在位移态（紧接着就卸载了）。 */
.more.anim-out :deep(.grid > .cell) {
  animation: cell-out 0.26s cubic-bezier(0.4, 0, 1, 1) both;
  animation-delay: calc((var(--n, 6) - 1 - var(--i, 0)) * 26ms);
}

@keyframes cell-out {
  from {
    transform: none;
  }
  to {
    transform: translateY(12px) scale(0.97);
  }
}

.inner {
  height: 100%;
  max-width: 1212px;
  margin: 0 auto;
  padding: 14px 20px 18px;
  display: flex;
  flex-direction: column;
}

.top {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.back {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--glass);
  /* 与面板卡片同一套毛玻璃参数：原来这个按钮只有半透明底色、没有模糊，
     夹在一堆磨砂卡片里显得不是一套。will-change 同卡片——它是随面板动态挂载的，
     不预提升会先画半透明底、下一帧模糊才到 */
  backdrop-filter: blur(14px) saturate(1.4);
  -webkit-backdrop-filter: blur(14px) saturate(1.4);
  will-change: backdrop-filter;
  color: var(--text-dim);
  font-size: 0.84rem;
  cursor: pointer;
  transition: color 0.25s ease, background 0.25s ease, border-color 0.25s ease;
}

.back:hover {
  color: var(--text);
  background: var(--glass-strong);
}

.top h2 {
  font-size: 1.15rem;
  font-weight: 700;
}

.grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  /* 行数随配置的卡片数自适应（--rows 由 script 写入；手机端会被媒体查询覆盖为 none） */
  grid-template-rows: var(--rows, minmax(0, 1fr) minmax(0, 1fr));
  gap: 20px;
}

.grid > .cell {
  min-height: 0;
  height: 100%;
}

@media (max-width: 980px) {
  /* 手机放不下 6 卡，恢复纵向滚动流式布局 */
  .more {
    overflow-y: auto;
  }

  .inner {
    height: auto;
    min-height: 100%;
    padding: 20px 16px 40px;
  }

  .grid {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: none;
    gap: 16px;
  }

  .grid > .cell {
    height: auto;
    min-height: 320px;
  }

  /* 音乐卡高度写死与基准卡一致：列表/歌词切换不跳动，列表内部滚动 */
  .grid > .cell.music {
    height: 320px;
  }
}
</style>
