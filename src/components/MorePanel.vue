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
      <div class="grid" :style="{ '--rows': gridRows }">
        <component :is="c.comp" v-for="c in cards" :key="c.key" class="cell" />
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
  /* 背景不模糊，与一级界面一致：只模糊卡片、背景保持清晰。
     这里原本有一层覆盖整屏的 backdrop-filter: blur(20px) saturate(1.3)，
     它要对整屏背景逐帧重采样，正是打开面板后 GPU 从约 49% 涨到约 73% 的主因；
     卡片的毛玻璃由各卡自己的 .glass 提供，观感与一级界面统一。
     只留一层极浅底色，压一下底下主页的亮度。 */
  background: rgba(7, 11, 22, 0.08);
}

/* 面板卡片是动态挂载的，出现时就已经可见——不预先提升合成层的话，会先画出一层
   半透明白底、下一帧模糊才补上（"白色透底 → 毛玻璃"的闪一下）。
   主页卡片不需要这个提示：它们首绘时被载入层盖着，模糊在揭开前就已就绪。
   只给面板这 6 张卡加，且随面板卸载一起消失，不做常驻开销。 */
.more :deep(.glass) {
  will-change: backdrop-filter;
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
