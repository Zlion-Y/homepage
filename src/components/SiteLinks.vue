<template>
  <div class="sites">
    <div class="head">
      <Icon name="link" :size="15" />
      <span>网站列表</span>
    </div>
    <div class="grid" :style="{ gridTemplateColumns: `repeat(${cols}, 1fr)` }">
      <a
        v-for="s in siteLinks"
        :key="s.url"
        :href="s.url"
        target="_blank"
        rel="noopener"
        class="glass site-card"
      >
        <span class="icon"><Icon :name="s.icon" :size="22" /></span>
        <span class="meta">
          <span class="name">{{ s.name }}</span>
          <span class="desc">{{ s.desc }}</span>
        </span>
      </a>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { siteLinks } from "@/config";
import Icon from "@/components/Icon.vue";

// 列数按站点数自适应，保证一行铺满与上方天气卡齐宽不留空格：
// 1→1 列 2→2 列 3→3 列 4→2×2 5 个以上→3 列换行
const cols = computed(() => {
  const n = siteLinks.length;
  if (n <= 3) return n || 1;
  if (n === 4) return 2;
  return 3;
});
</script>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-dim);
  margin-bottom: 14px;
}

.grid {
  display: grid;
  gap: 16px;
}

@media (max-width: 980px) {
  .grid {
    grid-template-columns: repeat(2, 1fr) !important;
  }
}

/* 紧凑站点卡：方便后续添加更多网站 */
.site-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  min-height: 72px;
}

.site-card:hover {
  background: var(--glass-strong);
  border-color: var(--border-bright);
}

.icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  color: #c7d2fe;
  flex-shrink: 0;
  transition: all 0.3s ease;
}

.site-card:hover .icon {
  color: var(--accent2);
}

.meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.name {
  font-size: 0.9rem;
  font-weight: 600;
}

.desc {
  font-size: 0.72rem;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
