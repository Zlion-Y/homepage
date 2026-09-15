<template>
  <footer class="footer">
    <p>
      Copyright © {{ new Date().getFullYear() }}
      <a v-if="siteConfig.repo" :href="siteConfig.repo" target="_blank" rel="noopener" class="author">
        {{ siteConfig.author }}
      </a>
      <span v-else>{{ siteConfig.author }}</span>
      <span class="dot">·</span>
      <span>本站已运行 {{ days }} 天</span>
    </p>
  </footer>
</template>

<script setup>
import { computed } from "vue";
import { siteConfig } from "@/config";

const days = computed(() => {
  const [y, m, d] = String(siteConfig.siteStart || "").split("-").map(Number);
  if (!y || !m || !d) return 0;
  const start = new Date(y, m - 1, d).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(1, Math.floor((Date.now() - start) / 86400000) + 1);
});
</script>

<style scoped>
.footer {
  position: relative;
  z-index: 1;
  padding: 20px;
  text-align: center;
  font-size: 0.8rem;
  color: var(--text-dim);
}

.dot {
  margin: 0 8px;
}

.author {
  color: var(--text-dim);
  transition: color 0.3s ease;
}

.author:hover {
  color: var(--text);
}
</style>
