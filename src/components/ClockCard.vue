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
import { cachedFetch } from "@/utils/cachedFetch";

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
    const data = await cachedFetch({
      key: "lunar_today",
      isFresh: (c) => c.data.date === today && !!c.data.text,
      loader: async (signal) => {
        const [lunar, holiday] = await Promise.all([
          fetch("https://uapis.cn/api/v1/misc/lunartime", { signal }).then((r) => r.json()),
          fetch(
            `https://uapis.cn/api/v1/misc/holiday-calendar?date=${today}&include_nearby=true&exclude_past=true&nearby_limit=3`,
            { signal }
          ).then((r) => r.json()),
        ]);

        // 接口可能返回 200 但字段缺失：缺字段不拼“undefined”，判为失败走静默隐藏
        const monthDay = `${lunar.lunar_month_cn || ""}${lunar.lunar_day_cn || ""}`.trim();
        const ganzhi = `${lunar.ganzhi_year || ""}${lunar.zodiac || ""}`;
        const parts = [];
        if (monthDay) parts.push(`农历${monthDay}`);
        if (ganzhi) parts.push(`${ganzhi}年`);
        if (!parts.length) return null;
        // 过滤掉“补班上班日”和“节气”，只对真正的节日/假期倒数
        const isReal = (e) => e.type !== "legal_workday_adjust" && e.type !== "solar_term";
        const next = (holiday.nearby?.next || []).find((n) => n.events?.some(isReal));
        if (next) {
          const ev = next.events.find(isReal);
          // 用 UTC 计算天差：接口日期是 UTC+8 语义，避免访客本地时区导致差 1 天
          const [y, m, dd] = next.date.split("-").map(Number);
          const target = Date.UTC(y, m - 1, dd);
          const nd = new Date();
          const todayUtc = Date.UTC(nd.getFullYear(), nd.getMonth(), nd.getDate());
          const days = Math.round((target - todayUtc) / 86400000);
          if (days > 0) parts.push(`距${ev.name} ${days} 天`);
        }
        return { date: today, text: parts.join(" · ") };
      },
    });
    if (data) lunarText.value = data.text;
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
