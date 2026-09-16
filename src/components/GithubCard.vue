<template>
  <div class="glass github">
    <div class="head">
      <a class="head-left" :href="`https://github.com/${user}`" target="_blank" rel="noopener">
        <Icon name="github" :size="15" />
        <span>GitHub</span>
      </a>
    </div>

    <template v-if="profile">
      <a class="me" :href="`https://github.com/${user}`" target="_blank" rel="noopener">
        <img class="ava" :src="profile.avatarUrl" :alt="profile.login" />
        <div class="who">
          <p class="name">{{ profile.name || profile.login }}</p>
          <p class="login">@{{ profile.login }}</p>
        </div>
      </a>
      <p v-if="profile.bio" class="bio">{{ profile.bio }}</p>

      <div class="stats">
        <a
          class="stat"
          :href="`https://github.com/${user}?tab=repositories`"
          target="_blank"
          rel="noopener"
        >
          <b>{{ fmtNum(profile.repos) }}</b>
          <span>仓库</span>
        </a>
        <a
          class="stat"
          :href="`https://github.com/${user}?tab=followers`"
          target="_blank"
          rel="noopener"
        >
          <b>{{ fmtNum(profile.followers) }}</b>
          <span>关注者</span>
        </a>
        <span class="stat">
          <b>{{ fmtNum(profile.stars) }}</b>
          <span>获星</span>
        </span>
      </div>
    </template>
    <p v-else-if="failed" class="tip-text">GitHub 数据加载失败，稍后再试</p>
    <p v-else class="tip-text">正在获取 GitHub 数据…</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { siteConfig } from "@/config";
import Icon from "@/components/Icon.vue";

const user = siteConfig.githubUser;
const profile = ref(null);
const failed = ref(false);

function fmtNum(n) {
  if (!n) return "0";
  return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n);
}

onMounted(async () => {
  // 缓存 1h（GitHub 官方 API 匿名限额 60 次/时/IP，缓存避免触顶）
  try {
    const cached = JSON.parse(localStorage.getItem("github_profile_v1") || "null");
    if (cached && cached.login && Date.now() - cached.ts < 60 * 60 * 1000) {
      profile.value = cached;
      return;
    }
  } catch {
    // 缓存解析失败则正常请求
  }

  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 10000);
    const u = await fetch(`https://api.github.com/users/${user}`, { signal: ctrl.signal }).then(
      (r) => {
        if (!r.ok) throw new Error("user " + r.status);
        return r.json();
      }
    );

    // 获星总数：分页搜索本人全部公开仓库求和（失败不影响其余数据）。
    // 匿名 search API 单页最多 100 条，仓库 >100 时逐页取，最多 5 页兜底。
    let stars = 0;
    try {
      for (let page = 1; page <= 5; page++) {
        const s = await fetch(
          `https://api.github.com/search/repositories?q=user:${user}+fork:true&per_page=100&page=${page}`,
          { signal: ctrl.signal }
        ).then((r) => (r.ok ? r.json() : null));
        if (!s || !Array.isArray(s.items) || !s.items.length) break;
        stars += s.items.reduce((n, r) => n + r.stargazers_count, 0);
        if (s.items.length < 100) break; // 不足一页说明翻完了
      }
    } catch {
      // 获星数获取失败置 0
    }

    profile.value = {
      login: u.login,
      name: u.name,
      bio: u.bio || "",
      avatarUrl: u.avatar_url,
      followers: u.followers,
      repos: u.public_repos,
      stars,
    };
    try {
      localStorage.setItem("github_profile_v1", JSON.stringify({ ts: Date.now(), ...profile.value }));
    } catch {
      // 存储失败不影响展示
    }
  } catch {
    failed.value = true;
  }
});
</script>

<style scoped>
.github {
  width: 100%;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  justify-content: center;
}

.head-left {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.88rem;
  color: var(--text-dim);
  transition: color 0.25s ease;
}

.head-left:hover {
  color: var(--text);
}

.me {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.ava {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  flex-shrink: 0;
  object-fit: cover;
}

.who {
  min-width: 0;
}

.name {
  font-size: 1.02rem;
  font-weight: 700;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.login {
  font-size: 0.78rem;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bio {
  font-size: 0.8rem;
  color: var(--text-dim);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.stats {
  display: flex;
  align-items: stretch;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 12px;
}

.stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  text-decoration: none;
}

.stat + .stat {
  border-left: 1px solid rgba(255, 255, 255, 0.08);
}

.stat b {
  font-size: 1.08rem;
  font-weight: 700;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.stat span {
  font-size: 0.72rem;
  color: var(--text-dim);
}

.tip-text {
  color: var(--text-dim);
  font-size: 0.84rem;
}
</style>
