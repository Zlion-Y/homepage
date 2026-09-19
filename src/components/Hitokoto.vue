<template>
    <div
      class="glass hito"
      :class="{ busy: loading }"
      role="button"
      tabindex="0"
      aria-label="点击换一句"
      @click="load"
      @keydown.enter.prevent="load"
      @keydown.space.prevent="load"
    >
    <p class="text">{{ sentence.text }}</p>
    <p class="from" v-if="sentence.from">—— 「{{ sentence.from }}」</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";

const fallbacks = [
  { text: "既然选择了远方，便只顾风雨兼程。", from: "汪国真" },
  { text: "种一棵树最好的时间是十年前，其次是现在。", from: "" },
  { text: "生活原本沉闷，但跑起来就有风。", from: "" },
  { text: "保持热爱，奔赴山海。", from: "" },
];

const sentence = ref({ text: "正在获取一言…", from: "" });
const loading = ref(false);

async function load() {
  if (loading.value) return;
  loading.value = true;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(
      "https://v1.hitokoto.cn/?c=a&c=b&c=d&c=i&c=k&max_length=40",
      { signal: ctrl.signal }
    );
    const data = await res.json();
    if (data && data.hitokoto) {
      sentence.value = { text: data.hitokoto, from: data.from || "" };
    }
  } catch {
    const pick = fallbacks[Math.floor(Math.random() * fallbacks.length)];
    sentence.value = pick;
  } finally {
    clearTimeout(timer);
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.hito {
  padding: 24px 26px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 12px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.hito.busy .text,
.hito.busy .from {
  opacity: 0.35;
}

.text {
  font-size: 1.02rem;
  line-height: 1.75;
  transition: opacity 0.3s ease;
  user-select: none;
}

.from {
  align-self: flex-end;
  font-size: 0.82rem;
  color: var(--text-dim);
  transition: opacity 0.3s ease;
  user-select: none;
}
</style>
