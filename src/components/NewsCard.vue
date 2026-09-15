<template>
  <div class="glass news">
    <div class="head">
      <span class="head-left">
        <Icon name="sun" :size="15" />
        <span>每日新闻</span>
      </span>
      <span class="date">{{ date }}</span>
    </div>
    <ol v-if="news.length" class="list">
      <li v-for="(n, i) in news" :key="i">{{ n }}</li>
    </ol>
    <p v-else-if="failed" class="tip">新闻加载失败，稍后再试</p>
    <p v-else class="tip">正在获取今日新闻…</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import Icon from "@/components/Icon.vue";

const news = ref([]);
const date = ref("");
const failed = ref(false);

onMounted(async () => {
  // 按天缓存：当天内刷新不重复请求
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  try {
    const cached = JSON.parse(localStorage.getItem("news_60s") || "null");
    if (cached && cached.date === today && cached.news.length) {
      news.value = cached.news;
      date.value = cached.date;
      return;
    }
  } catch {
    // 缓存解析失败则正常请求
  }

  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch("https://60s.viki.moe/v2/60s", { signal: ctrl.signal }).then((r) => r.json());
    if (res.code !== 200 || !res.data?.news?.length) throw new Error("empty");
    news.value = res.data.news;
    date.value = res.data.date || today;
    try {
      localStorage.setItem("news_60s", JSON.stringify({ date: date.value, news: news.value }));
    } catch {
      // 存储失败不影响展示
    }
  } catch {
    failed.value = true;
  }
});
</script>

<style scoped>
.news {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
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
  counter-reset: news;
  max-height: 420px;
  overflow-y: auto;
  padding-right: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.list li {
  counter-increment: news;
  padding: 7px 10px;
  border-radius: 9px;
  font-size: 0.88rem;
  line-height: 1.6;
  color: var(--text-dim);
  transition: all 0.25s ease;
}

.list li::before {
  content: counter(news, decimal-leading-zero);
  margin-right: 10px;
  font-size: 0.74rem;
  color: var(--accent2);
  font-variant-numeric: tabular-nums;
}

.list li:hover {
  color: var(--text);
  background: var(--glass-strong);
}

.list::-webkit-scrollbar {
  width: 4px;
}

.list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 99px;
}

.tip {
  color: var(--text-dim);
  font-size: 0.84rem;
}
</style>
