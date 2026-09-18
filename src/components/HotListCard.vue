<template>
  <div class="glass hot">
    <div class="head">
      <span class="head-left">
        <Icon name="flame" :size="15" />
        <span>热榜</span>
      </span>
      <span class="update" v-if="updateTime">{{ updateTime }}</span>
    </div>
    <!-- 平台切换 -->
    <div class="tabs">
      <button
        v-for="p in platforms"
        :key="p.key"
        :class="{ active: active === p.key }"
        @click="switchTo(p.key)"
      >
        {{ p.label }}
      </button>
    </div>
    <ol v-if="list.length" class="list">
      <li v-for="item in list" :key="item.index">
        <a :href="item.url" target="_blank" rel="noopener">
          <span class="rank" :class="{ top: item.index <= 3 }">{{ item.index }}</span>
          <span class="title">{{ item.title }}</span>
          <span class="value" v-if="item.hot_value">{{ formatHot(item.hot_value) }}</span>
        </a>
      </li>
    </ol>
    <p v-else-if="failed" class="tip-text">加载失败，稍后再试</p>
    <p v-else class="tip-text">正在获取{{ activeLabel }}热榜…</p>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { cachedFetch } from "@/utils/cachedFetch";
import { siteConfig } from "@/config";
import Icon from "@/components/Icon.vue";

// 平台 key → 显示名（uapis hotboard 共支持 48 个，可按需增删）
const LABELS = {
  weibo: "微博",
  bilibili: "B站",
  v2ex: "V2EX",
  ithome: "IT之家",
  hellogithub: "HelloGitHub",
  zhihu: "知乎",
  juejin: "掘金",
  sspai: "少数派",
  qq: "腾讯新闻",
  baidu: "百度热点",
};
// 平台与顺序由配置驱动（siteConfig.hotPlatforms）
const platforms = (siteConfig.hotPlatforms?.length ? siteConfig.hotPlatforms : ["weibo"]).map(
  (k) => ({ key: k, label: LABELS[k] || k })
);

const CACHE_MS = 30 * 60 * 1000;
const active = ref(platforms[0]?.key || "weibo");
const list = ref([]);
const failed = ref(false);
const updateTime = ref("");
const loading = ref(false);

const activeLabel = computed(() => platforms.find((p) => p.key === active.value)?.label || "");

function formatHot(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  return n >= 10000 ? (n / 10000).toFixed(1) + "w" : n;
}

async function fetchBoard(key) {
  // 30 分钟缓存：切平台/刷新不重复打接口
  const data = await cachedFetch({
    key: `hotboard_${key}`,
    ttl: CACHE_MS,
    loader: async (signal) => {
      const res = await fetch(`https://uapis.cn/api/v1/misc/hotboard?type=${key}`, { signal }).then((r) => r.json());
      if (!res.list?.length) return null;
      return { list: res.list.slice(0, 12), updateTime: formatTime(res.update_time || "") };
    },
  });
  if (!data) throw new Error("empty");
  return data;
}

// ISO 时间转 HH:mm
function formatTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} 更新`;
}

async function switchTo(key) {
  if (loading.value && active.value === key) return;
  active.value = key;
  list.value = [];
  failed.value = false;
  loading.value = true;
  try {
    const data = await fetchBoard(key);
    if (active.value !== key) return; // 用户已切走
    list.value = data.list;
    updateTime.value = data.updateTime;
  } catch {
    if (active.value === key) failed.value = true;
  } finally {
    // 只有"仍是当前平台"才收 loading：否则快速切台时，旧请求的 finally 会把
    // 新请求的加载态提前掐掉
    if (active.value === key) loading.value = false;
  }
}

onMounted(() => switchTo(active.value));
</script>

<style scoped>
.hot {
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
}

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

.update {
  font-size: 0.68rem;
  color: var(--text-dim);
}

.tabs {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  gap: 5px;
  padding: 10px 0 8px;
  scrollbar-width: none;
}

.tabs::-webkit-scrollbar {
  display: none;
}

.tabs button {
  flex-shrink: 0;
  padding: 3px 10px;
  border-radius: 99px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-dim);
  font-size: 0.72rem;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.25s ease;
}

.tabs button:hover {
  color: var(--text);
}

.tabs button.active {
  color: #0b1020;
  background: linear-gradient(90deg, var(--accent1), var(--accent2));
  border-color: transparent;
  font-weight: 600;
}

.list {
  list-style: none;
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
  max-height: 420px;
}

.list a {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 9px;
  transition: background 0.25s ease;
}

.list a:hover {
  background: var(--glass-strong);
}

.rank {
  width: 20px;
  text-align: center;
  font-size: 0.72rem;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.rank.top {
  color: #fb7185;
  font-weight: 700;
}

.title {
  flex: 1;
  min-width: 0;
  font-size: 0.85rem;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.25s ease;
}

.list a:hover .title {
  color: var(--text);
}

.value {
  font-size: 0.7rem;
  color: var(--text-dim);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
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
