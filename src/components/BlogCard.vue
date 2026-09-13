<template>
  <div class="glass blog">
    <div class="head">
      <span class="head-left">
        <Icon name="rss" :size="15" />
        <span>博客更新</span>
      </span>
      <span class="social">
        <a
          v-for="s in socialLinks"
          :key="s.name"
          :href="s.url"
          target="_blank"
          rel="noopener"
          :data-tip="s.tip"
          :aria-label="s.name"
        >
          <Icon :name="s.icon" :size="16" />
        </a>
      </span>
    </div>
    <ul class="posts">
      <li v-for="p in posts" :key="p.link">
        <a :href="p.link" target="_blank" rel="noopener" :title="p.title">
          {{ p.title }}
        </a>
      </li>
      <li v-if="!posts.length && failed">
        <a href="https://blog.zlion.top/" target="_blank" rel="noopener" class="fallback">
          去博客看看 →
        </a>
      </li>
      <li v-if="!posts.length && !failed" class="loading-text">正在获取最新文章…</li>
    </ul>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { socialLinks } from "@/config";
import Icon from "@/components/Icon.vue";

const CACHE_KEY = "blog_posts_cache";
const CACHE_MS = 30 * 60 * 1000; // 30 分钟

const posts = ref([]);
const failed = ref(false);

function parseXml(xml) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  return [...doc.querySelectorAll("item")]
    .slice(0, 3)
    .map((item) => ({
      title: item.querySelector("title")?.textContent?.trim() || "",
      link: item.querySelector("link")?.textContent?.trim() || "",
    }))
    .filter((p) => p.title && p.link);
}

onMounted(async () => {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (cached && Date.now() - cached.ts < CACHE_MS && cached.posts.length) {
      posts.value = cached.posts;
      return;
    }
  } catch {
    // 缓存解析失败则正常请求
  }

  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 8000);
    const xml = await fetch("/blog-rss", { signal: ctrl.signal }).then((r) => r.text());
    const list = parseXml(xml);
    if (!list.length) throw new Error("empty");
    posts.value = list;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), posts: list }));
    } catch {
      // 存储失败不影响展示
    }
  } catch {
    failed.value = true;
  }
});
</script>

<style scoped>
.blog {
  padding: 16px 22px;
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

.social {
  display: flex;
  gap: 6px;
}

.social a {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  color: var(--text-dim);
  transition: all 0.3s ease;
}

.social a:hover {
  color: var(--text);
  background: var(--glass-strong);
  transform: translateY(-2px);
}

.posts {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.posts a {
  display: block;
  padding: 6px 10px;
  border-radius: 9px;
  font-size: 0.86rem;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: all 0.25s ease;
}

.posts a:hover {
  color: var(--text);
  background: var(--glass-strong);
}

.posts a.fallback,
.loading-text {
  color: var(--text-dim);
  font-size: 0.84rem;
}
</style>
