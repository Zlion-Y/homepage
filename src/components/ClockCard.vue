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
import { festivalParts, holidayPeriods } from "@/utils/festival";

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

// 旧版缓存里存的是拼好的文本（用的日粒度 nearby，会把假期里的每一天都当成"距该节日 1 天"），
// 形状与口径都变了，换 key 时顺手清掉，免得访客当天还读着旧结果
try {
  localStorage.removeItem("lunar_today");
} catch {
  // 忽略
}

// 假期区间：按年拉一次逐日数据，压成几段区间再落盘（原数据 128KB，压缩后只有几百字节）。
// 12 月要连下一年一起看——否则 12/31 那天看不到第二天就是元旦。
async function loadHolidayPeriods(now) {
  const y = now.getFullYear();
  const years = now.getMonth() === 11 ? [y, y + 1] : [y];
  const loaded = await Promise.all(
    years.map((yy) =>
      cachedFetch({
        key: `holiday_periods_${yy}`,
        // key 带年份，同一年内一直复用；空结果不落缓存（下次再试）
        isFresh: (c) => Array.isArray(c.data?.periods) && c.data.periods.length > 0,
        loader: async (signal) => {
          const j = await fetch(
            `https://uapis.cn/api/v1/misc/holiday-calendar?year=${yy}`,
            { signal }
          ).then((r) => r.json());
          const periods = holidayPeriods(j.days);
          if (!periods.length) throw new Error("假期数据为空");
          return { periods };
        },
      })
    )
  );
  return loaded.flatMap((x) => (x && x.periods) || []);
}

// 农历 + 节日倒数（uapis，农历按天缓存）
onMounted(async () => {
  timer = setInterval(() => (now.value = new Date()), 1000);

  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const today = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  try {
    const [lunar, periods] = await Promise.all([
      cachedFetch({
        key: "lunar_today_v2",
        isFresh: (c) => c.data.date === today && !!c.data.lunar,
        loader: async (signal) => ({
          date: today,
          lunar: await fetch("https://uapis.cn/api/v1/misc/lunartime", { signal }).then((r) =>
            r.json()
          ),
        }),
      }),
      loadHolidayPeriods(d),
    ]);
    // 接口可能返回 200 但字段缺失：缺字段不拼"undefined"，返回 null 走静默隐藏
    const parts = festivalParts({ lunar: lunar && lunar.lunar, periods, now: new Date() });
    if (parts) lunarText.value = parts.join(" · ");
  } catch {
    // 农历/假期获取失败静默隐藏
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
  /* 原来带 colon-breathe 呼吸动画（ease-in-out 连续插值），已按用户要求移除：
     常驻无限动画让合成器每 vsync 出帧，配合全页 13 张 backdrop-filter 毛玻璃卡
     每帧全屏重合成，是 2.5K@120Hz 下空闲 GPU 47% 的主源。冒号静止常亮。 */
}

.colon i {
  width: 0.11em;
  height: 0.11em;
  border-radius: 50%;
  background: currentColor;
}
</style>
