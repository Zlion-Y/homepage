<template>
  <div class="social">
    <a
      v-for="s in socialLinks"
      :key="s.name"
      :href="s.url"
      target="_blank"
      rel="noopener"
      :data-tip="s.tip"
      :aria-label="s.name"
    >
      <Icon :name="s.icon" :size="21" />
    </a>
  </div>
</template>

<script setup>
import { socialLinks } from "@/config";
import Icon from "@/components/Icon.vue";
</script>

<style scoped>
.social {
  display: flex;
  gap: 8px;
}

.social a {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  color: var(--text-dim);
  border: 1px solid transparent;
  transition: all 0.3s ease;
}

.social a:hover {
  color: var(--text);
  background: var(--glass);
  border-color: var(--border);
  transform: translateY(-3px);
}
</style>
