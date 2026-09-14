<template>
  <!-- 配置了 siteConfig.logo 时显示自定义图片，否则使用内置徽章 -->
  <img
    v-if="logo"
    :src="logo"
    :width="size"
    :height="size"
    class="logo-img"
    alt="logo"
  />
  <svg
    v-else
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    viewBox="0 0 64 64"
    fill="none"
    aria-hidden="true"
  >
    <defs>
      <linearGradient :id="gid" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
        <stop stop-color="#818cf8" />
        <stop offset="1" stop-color="#22d3ee" />
      </linearGradient>
    </defs>
    <rect x="3" y="3" width="58" height="58" rx="16" fill="rgba(255,255,255,0.04)" :stroke="`url(#${gid})`" stroke-width="2.5" />
    <path
      d="M21 21h22L21 43h22"
      fill="none"
      :stroke="`url(#${gid})`"
      stroke-width="5.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>

<script setup>
import { useId } from "vue";
import { siteConfig } from "@/config";

defineProps({
  size: { type: [Number, String], default: 48 },
});

// 每个实例生成独立渐变 id，避免同页多实例冲突
const gid = `lg-${useId()}`;
const logo = siteConfig.logo;
</script>

<style scoped>
.logo-img {
  border-radius: 22%;
  object-fit: cover;
}
</style>
