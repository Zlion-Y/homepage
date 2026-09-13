<template>
  <div class="loading">
    <div class="inner">
      <LogoBadge :size="72" class="badge" />
      <div class="bar"><span></span></div>
    </div>
  </div>
</template>

<script setup>
import LogoBadge from "@/components/LogoBadge.vue";
</script>

<style scoped>
.loading {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: var(--bg);
  display: grid;
  place-items: center;
}

.inner {
  text-align: center;
}

.badge {
  animation: pulse 1.2s ease-in-out infinite alternate;
}

.bar {
  width: 150px;
  height: 3px;
  margin: 26px auto 0;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.bar span {
  display: block;
  height: 100%;
  width: 30%;
  border-radius: 99px;
  background: linear-gradient(90deg, var(--accent1), var(--accent2));
  /* 壁纸加载时长不定，进度条改为往复扫动 */
  animation: load-sweep 1.2s ease-in-out infinite;
}

@keyframes pulse {
  from {
    transform: scale(1);
    opacity: 0.75;
  }
  to {
    transform: scale(1.06);
    opacity: 1;
  }
}

@keyframes load-sweep {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(430%);
  }
}
</style>
