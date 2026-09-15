<template>
  <div class="glass clock">
    <p class="date">{{ dateStr }}</p>
    <p class="time">
      <span>{{ timeParts[0] }}</span><span class="colon"><i></i><i></i></span><span>{{ timeParts[1] }}</span><span class="colon"><i></i><i></i></span><span>{{ timeParts[2] }}</span>
    </p>
    <p class="lunar" v-if="lunarText">{{ lunarText }}</p>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";

const now = ref(new Date());
const lunarText = ref("");
let timer = null;

const weekMap = ["日", "一", "二", "三", "四", "五", "六"];

const dateStr = computed(() => {
  const d = now.value;
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 星期${weekMap[d.getDay()]}`;
});

const timeStr = computed(() => {
  const d = now.value;
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
});

const timeParts = computed(() => timeStr.value.split(":"));

// 农历 + 下一个节日倒数（uapis，当天缓存）
onMounted(async () => {
  timer = setInterval(() => (now.value = new Date()), 1000);

  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  try {
    const cached = JSON.parse(localStorage.getItem("lunar_today") || "null");
    if (cached && cached.date === today && cached.text) {
      lunarText.value = cached.text;
      return;
    }
  } catch {
    // 缓存解析失败则正常请求
  }

  try {
    const [lunar, holiday] = await Promise.all([
      fetch("https://uapis.cn/api/v1/misc/lunartime").then((r) => r.json()),
      fetch(
        `https://uapis.cn/api/v1/misc/holiday-calendar?date=${today}&include_nearby=true&exclude_past=true&nearby_limit=3`
      ).then((r) => r.json()),
    ]);

    const parts = [`农历${lunar.lunar_month_cn}${lunar.lunar_day_cn}`, `${lunar.ganzhi_year}${lunar.zodiac}年`];
    const next = (holiday.nearby?.next || []).find((n) => n.events?.length);
    if (next) {
      const target = new Date(next.date + "T00:00:00");
      const days = Math.round((target - new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())) / 86400000);
      if (days > 0) parts.push(`距${next.events[0].name} ${days} 天`);
    }
    lunarText.value = parts.join(" · ");
    try {
      localStorage.setItem("lunar_today", JSON.stringify({ date: today, text: lunarText.value }));
    } catch {
      // 存储失败不影响展示
    }
  } catch {
    // 农历获取失败静默隐藏
  }
});

onUnmounted(() => clearInterval(timer));
</script>

<style scoped>
.clock {
  padding: 24px 26px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
}

.date {
  font-size: 0.84rem;
  color: var(--text-dim);
}

.time {
  font-size: clamp(2rem, 3vw, 2.6rem);
  font-weight: 700;
  letter-spacing: 2px;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.lunar {
  font-size: 0.72rem;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 数码管风格圆点冒号：vertical-align: middle 使圆点组中线对齐数字字形中心，
   不受行盒/字体 metrics 影响，两端字号下均稳定居中 */
.colon {
  display: inline-flex;
  flex-direction: column;
  justify-content: center;
  vertical-align: middle;
  height: 1em;
  gap: 0.26em;
  margin: 0 0.1em;
  /* middle 锚点是 x-height 中线，数字字形中心略高，补偿 (cap-x)/2 ≈ 0.09em */
  transform: translateY(-0.09em);
  animation: colon-breathe 2s ease-in-out infinite;
}

.colon i {
  width: 0.11em;
  height: 0.11em;
  border-radius: 50%;
  background: currentColor;
}

@keyframes colon-breathe {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.25;
  }
}
</style>
