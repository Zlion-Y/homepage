<template>
  <div class="glass monitor">
    <div class="head">
      <span class="head-left">
        <Icon name="wifi" :size="15" />
        <span>站点监控</span>
      </span>
      <span class="tip">每分钟自动检测</span>
    </div>

    <div v-if="sites.length" class="list">
      <a
        v-for="s in sites"
        :key="s.url"
        class="row"
        :href="s.url"
        target="_blank"
        rel="noopener"
      >
        <span class="dot" :class="s.state"></span>
        <span class="meta">
          <span class="name">{{ s.name }}</span>
          <span class="host">{{ hostOf(s.url) }}</span>
        </span>
        <span class="stat" :class="s.state">
          <template v-if="s.state === 'checking'">检测中</template>
          <template v-else-if="s.state === 'up'">{{ s.ms }}ms</template>
          <template v-else>离线</template>
        </span>
      </a>
    </div>
    <p v-else class="tip-text">请在配置中添加 siteMonitors 站点</p>

    <p class="foot" v-if="sites.length && lastRun">
      {{ upCount }}/{{ sites.length }} 在线 · 检测于 {{ lastRun }}
    </p>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { siteConfig } from "@/config";
import Icon from "@/components/Icon.vue";

// 站点监控：浏览器 no-cors 直连探测（请求真实发往站点，连通即返回不透明响应，
// DNS/断网/超时则失败）——与访客视角的「能否打开」一致，无需任何监控服务
const targets = siteConfig.siteMonitors || [];
const sites = ref(
  targets.map((t) => ({ ...t, state: "checking", ms: 0 }))
);
const lastRun = ref("");

let timer = null;

const upCount = computed(() => sites.value.filter((s) => s.state === "up").length);

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

async function probe(s) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  const start = performance.now();
  try {
    await fetch(s.url, { mode: "no-cors", signal: ctrl.signal, cache: "no-store" });
    s.state = "up";
    s.ms = Math.max(1, Math.round(performance.now() - start));
  } catch {
    s.state = "down";
  } finally {
    clearTimeout(t);
  }
}

async function runAll() {
  sites.value.forEach((s) => (s.state = "checking"));
  await Promise.all(sites.value.map((s) => probe(s)));
  lastRun.value = new Date().toTimeString().slice(0, 5);
  // 写缓存：重开面板 60 秒内可即时上屏
  try {
    localStorage.setItem(
      "site_monitor",
      JSON.stringify({
        ts: Date.now(),
        lastRun: lastRun.value,
        results: sites.value.map((s) => ({ url: s.url, state: s.state, ms: s.ms })),
      })
    );
  } catch {
    // 存储失败不影响展示
  }
}

onMounted(async () => {
  if (!targets.length) return;
  // 先用上次检测结果即时上屏（60 秒内有效），再后台刷新
  try {
    const cached = JSON.parse(localStorage.getItem("site_monitor") || "null");
    if (cached && Date.now() - cached.ts < 60 * 1000) {
      cached.results.forEach((r, i) => {
        if (sites.value[i] && sites.value[i].url === r.url) {
          sites.value[i].state = r.state;
          sites.value[i].ms = r.ms;
        }
      });
      lastRun.value = cached.lastRun;
    }
  } catch {
    // 缓存解析失败则直接探测
  }
  runAll();
  timer = setInterval(runAll, 60 * 1000);
});

onUnmounted(() => clearInterval(timer));
</script>

<style scoped>
.monitor {
  padding: 20px 22px;
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

.tip {
  font-size: 0.7rem;
  color: var(--text-dim);
  opacity: 0;
  transition: opacity 0.25s ease;
}

.monitor:hover .tip {
  opacity: 1;
}

.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 12px;
  background: var(--glass);
  transition: background 0.25s ease;
}

.row:hover {
  background: var(--glass-strong);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: #64748b;
}

.dot.up {
  background: #4ade80;
  box-shadow: 0 0 6px rgba(74, 222, 128, 0.7);
}

.dot.down {
  background: #f87171;
  box-shadow: 0 0 6px rgba(248, 113, 113, 0.7);
}

.dot.checking {
  background: #facc15;
  animation: blink 1s ease-in-out infinite;
}

@keyframes blink {
  50% {
    opacity: 0.35;
  }
}

.meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.name {
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.host {
  font-size: 0.68rem;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat {
  font-size: 0.74rem;
  font-variant-numeric: tabular-nums;
  color: var(--text-dim);
  flex-shrink: 0;
}

.stat.up {
  color: #4ade80;
}

.stat.down {
  color: #f87171;
}

.foot {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 0.7rem;
  color: var(--text-dim);
}

.tip-text {
  color: var(--text-dim);
  font-size: 0.84rem;
}
.list::-webkit-scrollbar {
  width: 4px;
}

.list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 99px;
}
</style>
