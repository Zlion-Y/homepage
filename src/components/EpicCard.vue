<template>
  <div class="glass epic">
    <div class="head">
      <span class="head-left">
        <Icon name="gamepad" :size="15" />
        <span>Epic 限免</span>
      </span>
      <span class="tip">点击领取</span>
    </div>
    <div v-if="games.length" class="games">
      <a
        v-for="g in games"
        :key="g.id"
        :href="g.link || 'https://store.epicgames.com/'"
        target="_blank"
        rel="noopener"
        class="game"
      >
        <img :src="g.cover" :alt="g.title" loading="lazy" />
        <div class="info">
          <p class="title">{{ g.title }}</p>
          <p class="price">
            <s v-if="g.price">{{ g.price }}</s>
            <span class="free">现免费</span>
          </p>
        </div>
      </a>
    </div>
    <p v-else-if="noFree" class="tip-text">本周暂无免费游戏</p>
    <p v-else-if="failed" class="tip-text">加载失败，稍后再试</p>
    <p v-else class="tip-text">正在获取限免游戏…</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { cachedFetch } from "@/utils/cachedFetch";
import Icon from "@/components/Icon.vue";

const games = ref([]);
const failed = ref(false);
const noFree = ref(false);

onMounted(async () => {
  try {
    const data = await cachedFetch({
      key: "epic_free",
      ttl: 60 * 60 * 1000,
      loader: async (signal) => {
        const res = await fetch("https://uapis.cn/api/v1/game/epic-free", { signal }).then((r) => r.json());
        // 字段校验：title/cover 缺失的条目过滤掉，避免裂图/空标题
        const free = (res.data || []).filter((g) => g.is_free_now && g.title && g.cover).slice(0, 2);
        // 区分「无免费游戏」（null，不缓存）与「请求失败」（throw）
        return free.length
          ? free.map((g) => ({ id: g.id, title: g.title, cover: g.cover, price: g.original_price_desc, link: g.link || "" }))
          : null;
      },
    });
    if (data) games.value = data;
    else noFree.value = true;
  } catch {
    failed.value = true;
  }
});
</script>

<style scoped>
.epic {
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

.epic:hover .tip {
  opacity: 1;
}

.games {
  display: flex;
  flex-direction: column;
  gap: 10px;
  /* 填满卡片剩余高度，两款游戏均分，不做内部滚动 */
  flex: 1;
  min-height: 0;
}

.game {
  position: relative;
  flex: 1;
  min-height: 88px;
  border-radius: 12px;
  overflow: hidden;
  transition: filter 0.25s ease;
}

.game:hover {
  filter: brightness(1.12);
}

.game img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.info {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 20px 12px 8px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.6));
  min-width: 0;
}

.title {
  font-size: 0.88rem;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.price {
  margin-top: 2px;
  font-size: 0.76rem;
  color: rgba(255, 255, 255, 0.8);
}

.price s {
  margin-right: 8px;
}

.price .free {
  color: #4ade80;
  font-weight: 600;
}

.tip-text {
  color: var(--text-dim);
  font-size: 0.84rem;
}
</style>
