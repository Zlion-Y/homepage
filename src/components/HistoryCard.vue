<template>
  <div class="glass history">
    <div class="head">
      <span class="head-left">
        <Icon name="clock" :size="15" />
        <span>程序员历史上的今天</span>
      </span>
      <span class="date">{{ date }}</span>
    </div>
    <ol v-if="events.length" class="list">
      <li v-for="(e, i) in events" :key="i">
        <span class="year">{{ e.year }}</span>
        <span class="title">{{ e.title }}</span>
        <span class="cat" v-if="e.category">{{ e.category }}</span>
      </li>
    </ol>
    <p v-else-if="failed" class="tip-text">加载失败，稍后再试</p>
    <p v-else class="tip-text">正在获取历史事件…</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { cachedFetch } from "@/utils/cachedFetch";
import Icon from "@/components/Icon.vue";

const events = ref([]);
const date = ref("");
const failed = ref(false);

onMounted(async () => {
  // 历史上的今天按日变化：TTL 1 小时兜底（跨天最多陈旧 1h）
  try {
    const data = await cachedFetch({
      key: "history_today",
      ttl: 60 * 60 * 1000,
      loader: async (signal) => {
        const res = await fetch("https://uapis.cn/api/v1/history/programmer/today", { signal }).then((r) => r.json());
        if (!Array.isArray(res.events) || !res.events.length) return null;
        return {
          date: res.date || "",
          // 重要度排序，取前 12 条
          events: [...res.events].sort((a, b) => (b.importance || 0) - (a.importance || 0)).slice(0, 12),
        };
      },
    });
    if (data) {
      date.value = data.date;
      events.value = data.events;
    } else {
      failed.value = true;
    }
  } catch {
    failed.value = true;
  }
});
</script>

<style scoped>
.history {
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.head-left {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-dim);
}

.date {
  font-size: 0.74rem;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}

.list {
  list-style: none;
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 420px;
}

.list li {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 9px;
  transition: background 0.25s ease;
}

.list li:hover,
.list li:focus-visible {
  background: var(--glass-strong);
}

.year {
  font-size: 0.76rem;
  color: var(--accent2);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  min-width: 38px;
}

.title {
  flex: 1;
  font-size: 0.84rem;
  line-height: 1.6;
  color: var(--text-dim);
}

.cat {
  flex-shrink: 0;
  font-size: 0.66rem;
  padding: 2px 8px;
  border-radius: 99px;
  border: 1px solid var(--border);
  color: var(--text-dim);
}

.list::-webkit-scrollbar {
  width: 4px;
}

.list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 99px;
}

.tip-text {
  color: var(--text-dim);
  font-size: 0.84rem;
}
</style>
