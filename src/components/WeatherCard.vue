<template>
  <div class="glass weather" v-if="weather">
    <div class="now">
      <Icon :name="weatherIcon" :size="44" class="wicon" />
      <div class="now-info">
        <p class="temp">{{ weather.temp }}°C</p>
        <p class="meta">
          {{ weather.district }} · {{ weather.cond }}
          <span class="aqi" v-if="weather.aqi" :title="`空气质量${weather.aqiCat}`">
            <i :style="{ background: aqiColor }"></i>AQI {{ weather.aqi }} {{ weather.aqiCat }}
          </span>
        </p>
        <p class="meta dim">湿度 {{ weather.humidity }}{{ typeof weather.humidity === 'number' ? '%' : '' }} · 体感 {{ weather.feels }}{{ typeof weather.feels === 'number' ? '°' : '' }} · {{ weather.wind }}</p>
      </div>
    </div>
    <div class="chart" ref="chartEl" v-if="hasForecast">
      <!-- viewBox 与盒子取 1:1（用户单位 = CSS px），此时缩放恒为 1：
           <text> 的 11px 就是真的 11px，<circle r="2.6"> 也真的是正圆。
           ⚠️ 不要写 preserveAspectRatio="none"：一旦 viewBox 与实际盒子比例不符，
           它会【非等比】铺满，SVG 里的文字会跟着横向拉变形（实测单列布局下 2.29 倍）。
           这里的默认值 xMidYMid meet 最多等比缩放，是防"字被拉歪"的安全网。 -->
      <svg v-if="boxW > 0" :viewBox="`0 0 ${boxW} ${boxH}`">
        <defs>
          <linearGradient id="temp-grad-hi" x1="0" y1="0" x2="1" y2="0">
            <stop stop-color="#fca5a5" />
            <stop offset="1" stop-color="#f87171" />
          </linearGradient>
          <linearGradient id="temp-grad-lo" x1="0" y1="0" x2="1" y2="0">
            <stop stop-color="#818cf8" />
            <stop offset="1" stop-color="#22d3ee" />
          </linearGradient>
        </defs>
        <path :d="smoothPath(hiPts)" fill="none" stroke="url(#temp-grad-hi)" stroke-width="2" stroke-linecap="round" />
        <path :d="smoothPath(loPts)" fill="none" stroke="url(#temp-grad-lo)" stroke-width="2" stroke-linecap="round" />
        <g v-for="(p, i) in points" :key="i">
          <circle :cx="p.x" :cy="p.hiY" r="2.6" fill="#f87171" />
          <circle :cx="p.x" :cy="p.loY" r="2.6" fill="#22d3ee" />
          <text :x="p.x" :y="p.hiY - 8" text-anchor="middle" class="t-hi">{{ p.hi }}°</text>
          <text :x="p.x" :y="p.loY + 14" text-anchor="middle" class="t-lo">{{ p.lo }}°</text>
          <text :x="p.x" :y="dayLabelY" text-anchor="middle" class="t-day">{{ p.label }}</text>
        </g>
      </svg>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import { cachedFetch } from "@/utils/cachedFetch";
import { siteConfig } from "@/config";
import Icon from "@/components/Icon.vue";

const CACHE_KEY = "weather_cache";
const CACHE_MS = 30 * 60 * 1000; // 30 分钟
/* 原设计的基准高度：所有纵向坐标都是按 104 高画的，这里保留为比例基准，
   实测高度变了就等比映射，曲线的相对位置不变（bh=104 时逐像素等同原渲染）。 */
const DESIGN_H = 104;

const weather = ref(null);
const forecast = ref([]);

/* ── 尺寸测量 ──
   原来写死 viewBox="0 0 300 104" + preserveAspectRatio="none"，等于让 300×104 的
   坐标系被非等比地铺满实际盒子。实测 ≤980px 单列布局下盒子是 686×104：
   scaleX 2.287 / scaleY 1 —— 曲线被横向拉长，<circle r=2.6> 变成 11.89×5.2 的椭圆，
   而 <text> 也活在这套坐标系里，11px 的字被渲染成 41.4px 宽。
   桌面端盒子是 305×108（畸变仅 0.98×）所以一直没被发现。
   现在改为实测盒子尺寸、viewBox 与之 1:1，几何全按真实像素算。 */
const chartEl = ref(null);
const boxW = ref(0);
const boxH = ref(0);
let ro = null;

watch(chartEl, (el) => {
  if (ro) {
    ro.disconnect();
    ro = null;
  }
  if (!el) return;
  if (typeof ResizeObserver === "function") {
    ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      // 取整后再比对：亚像素抖动不该反复触发几何重算
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      if (w > 0 && w !== boxW.value) boxW.value = w;
      if (h > 0 && h !== boxH.value) boxH.value = h;
    });
    ro.observe(el);
  } else {
    const b = el.getBoundingClientRect(); // 老浏览器兜底
    boxW.value = Math.round(b.width);
    boxH.value = Math.round(b.height);
  }
});

onBeforeUnmount(() => {
  if (ro) ro.disconnect();
});

// 有数据就渲染曲线容器（与尺寸是否量到无关，否则 ref 拿不到 → 永远量不到）
const hasForecast = computed(() => (forecast.value || []).length > 1);

// 纵向：把原设计里的 104 高坐标等比映射到实测高度
function yAt(designY, bh) {
  return +((designY / DESIGN_H) * bh).toFixed(2);
}

const dayLabelY = computed(() => yAt(101, boxH.value));

const weatherIcon = computed(() => {
  // weather_icon 是和风（QWeather）码表：3xx=雨、4xx=雪、2xx=风、1xx/15x=晴多云。
  // 旧映射把 2xx 当雨、3xx 当雪，结果下雨天显示雪花图标
  const code = String(weather.value?.icon || "");
  if (code.startsWith("3")) return "rain";
  if (code.startsWith("4")) return "snow";
  if (code === "100" || code === "150") return "sun";
  return "cloud";
});

const aqiColor = computed(() => {
  const lv = weather.value?.aqiLv || 1;
  return ["#22c55e", "#22c55e", "#eab308", "#f97316", "#ef4444", "#a855f7"][lv] || "#22c55e";
});

/* 未来几天高低温曲线的点（x 均匀分布，y 并集范围映射）。
   注意 x / y 用的都是实测像素尺寸 —— 用户坐标即 CSS px，
   所以标签字号和圆点半径就是它们在样式里写的值，不会被二次缩放。 */
const points = computed(() => {
  // 过滤掉缺温度的天，避免 Math.min/max 出 NaN 导致曲线消失
  const days = forecast.value.slice(0, 5).filter((d) => Number.isFinite(d.temp_max) && Number.isFinite(d.temp_min));
  const bw = boxW.value;
  const bh = boxH.value;
  if (days.length < 2 || bw < 2 || bh < 2) return []; // 尺寸还没量到，先不画
  const his = days.map((d) => d.temp_max);
  const los = days.map((d) => d.temp_min);
  const lo0 = Math.min(...los);
  const hi1 = Math.max(...his);
  const span = hi1 - lo0 || 1;
  // 左右留白给首尾标签 = clamp(盒宽 7%, 8px, 20px)。
  // ⚠️ 上限先命中：盒宽 ≥286px 时 7% 已 ≥20，所以那一档恒为 20px ——
  // 实测三视口的盒子（292 / 618 / 308）算出来全是 20，只有更窄的盒子才开始收缩，
  // 到盒宽 ~114px 以下触底 8px。
  const padX = Math.min(20, Math.max(8, bw * 0.07));
  const stepX = (bw - padX * 2) / (days.length - 1);
  return days.map((d, i) => ({
    x: +(padX + i * stepX).toFixed(2),
    hiY: yAt(24 + (1 - (d.temp_max - lo0) / span) * 34, bh),
    loY: yAt(56 + (1 - (d.temp_min - lo0) / span) * 16, bh),
    hi: d.temp_max,
    lo: d.temp_min,
    label: i === 0 ? "今天" : i === 1 ? "明天" : (d.week || "").replace("星期", "周"),
  }));
});

const hiPts = computed(() => points.value.map((p) => ({ x: p.x, y: p.hiY })));
const loPts = computed(() => points.value.map((p) => ({ x: p.x, y: p.loY })));

// Catmull-Rom 转三次贝塞尔：折线变平滑曲线
function smoothPath(pts) {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x} ${p2.y}`;
  }
  return d;
}

onMounted(() => {
  // 30 分钟内直接用缓存，避免刷新必发请求；失败 3s 后重试一次
  load().then((ok) => {
    if (!ok) setTimeout(() => load(), 3000);
  });
});

async function load() {
  if (weather.value) return true;
  try {
    const data = await cachedFetch({
      key: CACHE_KEY,
      ttl: CACHE_MS,
      loader: async (signal) => {
        const params = new URLSearchParams({ extended: "true", forecast: "true" });
        if (siteConfig.weatherCity) params.set("adcode", siteConfig.weatherCity);
        const d = await fetch(
          `https://uapis.cn/api/v1/misc/weather?${params}`,
          { signal }
        ).then((r) => r.json());
        // 字段校验：无效数据不进缓存
        return typeof d.temperature === "number" ? d : null;
      },
    });
    if (!data) return false;
    apply(data);
    return true;
  } catch {
    return false;
  }
}

function apply(d) {
  // 字段缺失兜底，避免渲染出 undefined
  const windDir = d.wind_direction || "";
  const windPow = d.wind_power || "";
  weather.value = {
    district: [d.district, d.city, d.province].find((v) => v && !Array.isArray(v)) || "未知",
    cond: d.weather || "未知",
    icon: d.weather_icon || "",
    temp: d.temperature,
    humidity: d.humidity ?? "—",
    feels: d.feels_like ?? "—",
    wind: windDir || windPow ? `${windDir}${windPow}` : "未知",
    aqi: d.aqi ?? null,
    aqiCat: d.aqi_category || "",
    aqiLv: d.aqi_level ?? 1,
  };
  forecast.value = d.forecast || [];
}
</script>

<style scoped>
.weather {
  grid-column: span 2;
  padding: 20px 26px;
  display: flex;
  align-items: center;
  gap: 30px;
}

.now {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
  position: relative;
}

.wicon {
  color: var(--accent2);
  filter: drop-shadow(0 0 12px rgba(34, 211, 238, 0.35));
}

.now-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.temp {
  font-size: 1.8rem;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.meta {
  font-size: 0.82rem;
}

.meta.dim {
  font-size: 0.74rem;
  color: var(--text-dim);
}

.aqi {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: 8px;
  font-size: 0.74rem;
  color: var(--text-dim);
  vertical-align: 1px;
}

.aqi i {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.chart {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: center;
}

.chart svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.t-hi {
  fill: #fca5a5;
  font-size: 11px;
  font-weight: 600;
}

.t-lo {
  fill: #67e8f9;
  font-size: 11px;
}

.t-day {
  fill: var(--text-dim);
  font-size: 10px;
}

/* 移动端：实况与曲线上下堆叠，避免曲线被挤压变形 */
@media (max-width: 980px) {
  .weather {
    flex-direction: column;
    align-items: stretch;
    gap: 14px;
    padding: 18px 20px;
  }

  .now {
    justify-content: flex-start;
  }

  .chart {
    width: 100%;
    flex: none;
    height: 104px;
  }
}
</style>
