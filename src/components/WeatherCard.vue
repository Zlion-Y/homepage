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
        <p class="meta dim">湿度 {{ weather.humidity }}% · 体感 {{ weather.feels }}° · {{ weather.wind }}</p>
      </div>
    </div>
    <div class="chart" v-if="points.length > 1">
      <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none">
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
          <text :x="p.x" :y="H - 3" text-anchor="middle" class="t-day">{{ p.label }}</text>
        </g>
      </svg>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { siteConfig } from "@/config";
import Icon from "@/components/Icon.vue";

const CACHE_KEY = "weather_cache";
const CACHE_MS = 30 * 60 * 1000; // 30 分钟
const W = 300;
const H = 104;

const weather = ref(null);
const forecast = ref([]);

const weatherIcon = computed(() => {
  const code = String(weather.value?.icon || "");
  if (code.startsWith("2")) return "rain";
  if (code.startsWith("3")) return "snow";
  if (code === "100") return "sun";
  return "cloud";
});

const aqiColor = computed(() => {
  const lv = weather.value?.aqiLv || 1;
  return ["#22c55e", "#22c55e", "#eab308", "#f97316", "#ef4444", "#a855f7"][lv] || "#22c55e";
});

// 未来几天高低温曲线的点（x 均匀分布，y 并集范围映射）
const points = computed(() => {
  const days = forecast.value.slice(0, 5);
  if (days.length < 2) return [];
  const his = days.map((d) => d.temp_max);
  const los = days.map((d) => d.temp_min);
  const lo0 = Math.min(...los);
  const hi1 = Math.max(...his);
  const span = hi1 - lo0 || 1;
  return days.map((d, i) => {
    const x = (i / (days.length - 1)) * (W - 40) + 20;
    return {
      x,
      hiY: 24 + (1 - (d.temp_max - lo0) / span) * 34,
      loY: 56 + (1 - (d.temp_min - lo0) / span) * 16,
      hi: d.temp_max,
      lo: d.temp_min,
      label: i === 0 ? "今天" : i === 1 ? "明天" : (d.week || "").replace("星期", "周"),
    };
  });
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

onMounted(async () => {
  // 30 分钟内直接用缓存，避免刷新必发请求
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (cached && Date.now() - cached.ts < CACHE_MS) {
      apply(cached.data);
      return;
    }
  } catch {
    // 缓存解析失败则正常请求
  }
  load() || setTimeout(() => load(), 3000);
});

async function load() {
  if (weather.value) return true;
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 8000);
    const params = new URLSearchParams({ extended: "true", forecast: "true" });
    if (siteConfig.weatherCity) params.set("adcode", siteConfig.weatherCity);
    const data = await fetch(
      `https://uapis.cn/api/v1/misc/weather?${params}`,
      { signal: ctrl.signal }
    ).then((r) => r.json());
    if (typeof data.temperature !== "number") return false;
    apply(data);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
    } catch {
      // 存储失败不影响展示
    }
    return true;
  } catch {
    return false;
  }
}

function apply(d) {
  weather.value = {
    district: [d.district, d.city, d.province].find((v) => v && !Array.isArray(v)) || "",
    cond: d.weather,
    icon: d.weather_icon,
    temp: d.temperature,
    humidity: d.humidity,
    feels: d.feels_like,
    wind: `${d.wind_direction}${d.wind_power}`,
    aqi: d.aqi,
    aqiCat: d.aqi_category,
    aqiLv: d.aqi_level,
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
