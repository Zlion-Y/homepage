<template>
  <div class="head" :style="mb ? { marginBottom: mb } : undefined">
    <component
      :is="href ? 'a' : 'span'"
      class="head-left"
      :href="href || undefined"
      :target="href ? '_blank' : undefined"
      :rel="href ? 'noopener' : undefined"
    >
      <Icon :name="icon" :size="15" />
      <span>{{ title }}</span>
    </component>
    <slot />
  </div>
</template>

<script setup>
import Icon from "@/components/Icon.vue";

// 数据卡共享卡头（原 BlogCard/NewsCard/HotListCard/EpicCard/HistoryCard/SiteMonitorCard
// 各自复制的那套 .head/.head-left 标记与样式）。右侧内容用默认插槽，
// 各卡特有样式（日期 / 更新时间 / hover 提示 / 社交图标）留在各自组件里；
// margin-bottom 各卡不同，经 mb 注入，其余视觉与拆分前逐像素一致。
defineProps({
  icon: { type: String, required: true },
  title: { type: String, required: true },
  // 传入时左侧渲染为链接（原 GithubCard 的用法；该卡未接入此组件，预留通用性）
  href: { type: String, default: "" },
  mb: { type: String, default: "" },
});
</script>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.head-left {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-dim);
}

a.head-left {
  transition: color 0.25s ease;
}

a.head-left:hover {
  color: var(--text);
}
</style>
