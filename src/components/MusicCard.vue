<template>
  <div class="glass music">
    <!-- Loading Overlay -->
    <div class="loading-overlay" v-show="loading">
      <Icon name="refresh" :size="30" class="spin" />
    </div>

    <!-- Top Row: Cover & Info -->
    <div class="top-row">
      <div class="cover-wrap">
        <div class="cover-circle">
          <Icon name="music" :size="24" class="cover-ph" />
          <img
            ref="coverImg"
            v-show="coverLoaded"
            class="cover-img"
            :class="{ spinning: coverSpinning }"
            :src="cardCoverSrc"
            :style="{ animationPlayState: playing ? 'running' : 'paused' }"
            alt=""
            @load="coverLoaded = true"
            @error="coverLoaded = false"
          />
        </div>
      </div>
        <div class="info">
          <div class="info-l1">
            <h3 class="title" :title="track.name">{{ track.name || "音乐" }}</h3>
            <div class="info-btns">
              <button class="btn-fs" title="全屏播放" @click="openFs">
                <Icon name="maximize" :size="18" />
              </button>
            </div>
          </div>
        <p class="artist" :title="track.artist">{{ track.artist || "未在播放" }}</p>
        <div class="time-vol">
          <span class="time">{{ fmt(currentTime) }} / {{ fmt(duration) }}</span>
          <div class="vol">
            <button class="btn-mute" title="音量" @click="toggleMute">
              <Icon :name="isMuted || volume === 0 ? 'volume-x' : 'volume-2'" :size="16" />
            </button>
            <div class="vol-track" @click="setVol">
              <div class="vol-fill" :style="{ width: (isMuted ? 0 : volume * 100) + '%' }"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Progress -->
    <div class="progress" @click="seek">
      <div class="p-bar" :style="{ width: pct + '%' }"></div>
      <div class="p-thumb" :style="{ left: pct + '%' }"></div>
    </div>

    <p class="play-err" v-show="errTip">{{ errTip }}</p>

    <!-- Controls -->
    <div class="controls">
      <button class="btn-mode" :class="{ on: playMode !== 0 }" title="播放模式" @click="cycleMode">
        <Icon :name="modeIcon" :size="19" />
      </button>
      <button class="btn-skip" title="上一首" @click="prev()">
        <Icon name="skip-back" :size="27" />
      </button>
      <button class="btn-play" :title="playing ? '暂停' : '播放'" @click="togglePlay">
        <Icon :name="playing ? 'pause' : 'play'" :size="27" />
      </button>
      <button class="btn-skip" title="下一首" @click="next()">
        <Icon name="skip-forward" :size="27" />
      </button>
      <button class="btn-drawer" :class="{ on: lrcOpen }" title="歌词" @click="toggleLrc">
        <Icon name="subtitles" :size="19" />
      </button>
    </div>

    <!-- Lyrics Drawer -->
    <div class="drawer lrc-drawer" :class="{ open: lrcOpen }">
      <div class="drawer-clip">
        <div class="lrc-container" ref="lrcEl" @scroll="onUserLrcScroll">
          <div
            v-for="(line, i) in lyrics"
            :key="i"
            class="lrc-line"
            :class="{ active: i === lrcIndex }"
            @click="seekTo(line.time)"
          >
            {{ line.text }}
          </div>
          <div v-if="!lyrics.length" class="lrc-empty">暂无歌词</div>
        </div>
      </div>
    </div>

    <!-- Playlist Drawer -->
    <div class="drawer playlist-drawer" :class="{ open: plOpen }">
      <div class="drawer-clip">
        <div class="playlist-container" ref="plEl">
          <div
            v-for="(t, i) in plRows"
            :key="i"
            class="pl-item"
            :class="{ active: i === index }"
            @click="playIndex(i)"
          >
            <div class="pi-cover">
              <img
                v-if="t.pic && !t.__err"
                :src="t.pic"
                :loading="Math.abs(i - index) < 10 ? 'eager' : 'lazy'"
                decoding="async"
                alt=""
                @error="t.__err = true"
              />
              <Icon v-else name="music" :size="13" class="pi-ph" />
              <div class="pi-overlay" v-show="i === index">
                <div class="eq-bars" v-show="playing">
                  <span></span><span></span><span></span>
                </div>
                <Icon v-show="!playing" name="play" :size="13" />
              </div>
            </div>
            <div class="pi-meta">
              <div class="pi-title">{{ t.name }}</div>
              <div class="pi-artist">{{ t.artist }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <audio
      ref="audioEl"
      preload="none"
      @timeupdate="onTime"
      @loadedmetadata="onTime"
      @ended="onEnded"
      @error="onAudioError"
    ></audio>

    <!-- 全屏播放层（移动端竖排 / 桌面端左封面右歌词队列）：Teleport 到 body，避免卡片 tilt transform 困住 fixed 定位 -->
    <Teleport to="body">
      <Transition name="fs">
        <div v-if="fsOpen" class="fs-player" :class="{ 'fs-desktop': fsDesktop }">
          <div class="fs-color-wash" :style="fsWashStyle"></div>
          <div class="fs-bg-wrap">
            <img
              v-if="fsBgSrc"
              ref="fsBgImg"
              class="fs-bg-img"
              :class="{ show: bgShown }"
              :src="fsBgSrc"
              alt=""
              @load="bgShown = true"
              @error="bgShown = false"
            />
          </div>
          <div class="fs-grad-1" :style="fsGradStyle"></div>
          <div class="fs-grad-2" :style="fsGradStyle2"></div>
          <div class="fs-shade"></div>
<div class="fs-sheet" ref="fsSheet">
              <button class="fs-close" title="退出全屏" @click="closeFs">
                <Icon name="chevron-down" :size="22" />
              </button>
              <div class="fs-handle" @click="closeFs" @touchstart="fsDragStart" @touchmove="fsDragMove" @touchend="fsDragEnd">
                <span></span>
              </div>
              <p class="fs-from">正在播放</p>

              <div class="fs-main">
                <!-- 封面（移动端在上方常驻；桌面端在左侧） -->
                <div class="fs-cover-zone">
                  <div class="fs-cover-box" ref="fsCoverBox" @mousemove="fsCoverMove" @mouseenter="fsCoverEnter" @mouseleave="fsCoverLeave">
                    <div class="fs-cover-inner" :style="{ transform: fsCoverTransform }">
                      <img
                        v-if="fsCoverSrc"
                        class="fs-cover"
                        :src="fsCoverSrc"
                        alt=""
                        draggable="false"
                        @error="onFsCoverError"
                      />
                      <div v-else class="fs-cover fs-cover-ph">
                        <LogoBadge :size="88" />
                      </div>
                      <div class="fs-shine" :style="{ background: fsShineBg, opacity: fsHovering ? 1 : 0 }"></div>
                    </div>
                    <div class="fs-cover-shadow" :style="{ transform: fsShadowTransform }"></div>
                  </div>
                </div>
                <!-- 歌词 / 播放列表（桌面端右侧栏；移动端覆盖封面视图） -->
                <div class="fs-side">
                  <div v-show="fsView === 'lyrics'" class="fs-lrc" ref="fsLrcEl">
                    <div
                      v-for="(line, i) in lyrics"
                      :key="i"
                      class="fs-lrc-line"
                      :class="{ active: i === lrcIndex }"
                      @click="seekTo(line.time)"
                    >
                      {{ line.text }}
                    </div>
                    <div v-if="!lyrics.length" class="lrc-empty">暂无歌词</div>
                  </div>
                  <!-- 随全屏一起建好（空闲渐进补齐），点列表只切显示：避免首次点开时的大重绘白条 -->
                  <div v-show="fsView === 'queue'" class="fs-queue" ref="fsQueueEl">
                    <div
                      v-for="(t, i) in fsQRows"
                      :key="i"
                      class="fs-q-row"
                      :class="{ active: i === index }"
                      @click="fsPickQueue(i)"
                    >
                      <img
                        v-if="t.pic && !t.__err"
                        class="fs-q-cov"
                        :src="hdCover(t.pic)"
                        :loading="Math.abs(i - index) < 10 ? 'eager' : 'lazy'"
                        decoding="async"
                        alt=""
                        @error="t.__err = true"
                      />
                      <div v-else class="fs-q-cov fs-q-ph"><Icon name="music" :size="16" /></div>
                      <div class="fs-q-meta">
                        <div class="fs-q-name">{{ t.name }}</div>
                        <div class="fs-q-artist">{{ t.artist }}</div>
                      </div>
                    </div>
                    <div v-if="!playlist.length" class="lrc-empty">歌单为空</div>
                  </div>
                </div>
              </div>

              <div class="fs-info">
                <div class="fs-titles">
                  <div class="fs-titles-l">
                    <h3 class="fs-title">{{ track.name || "音乐" }}</h3>
                    <p class="fs-artist">{{ track.artist || "未在播放" }}</p>
                  </div>
                </div>
              </div>

              <div class="fs-prow">
                <span class="fs-ptime">{{ fmt(currentTime) }}</span>
                <div class="fs-progress" @click="seek">
                  <div class="p-bar" :style="{ width: pct + '%' }"></div>
                  <div class="p-thumb" :style="{ left: pct + '%' }"></div>
                </div>
                <span class="fs-ptime">{{ fmt(duration) }}</span>
              </div>

              <div class="fs-bottom">
                <div class="fs-trackinfo">
                  <span class="ft-name">{{ track.name || "音乐" }}</span>
                  <span class="ft-artist">{{ track.artist || "未在播放" }}</span>
                </div>
                <div class="fs-controls">
                  <button class="fs-side-btn" :title="fsModeTitle" @click="cycleMode">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path :d="fsModeIcon" /></svg>
                  </button>
                  <button class="fs-control-btn" title="上一首" @click="prev()">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" /></svg>
                  </button>
                  <button class="fs-play-btn" :title="playing ? '暂停' : '播放'" @click="togglePlay">
                    <svg v-if="playing" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                    <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M8.3 5v14l11-7z" /></svg>
                  </button>
                  <button class="fs-control-btn" title="下一首" @click="next()">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
                  </button>
                  <button class="fs-side-btn" title="播放列表" @click="fsToggleView('queue')">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" /></svg>
                  </button>
                </div>
                <div class="fs-time">
                  <span>{{ fmt(currentTime) }} / {{ fmt(duration) }}</span>
                </div>
              </div>
            </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import { siteConfig } from "@/config";
import Icon from "@/components/Icon.vue";
import LogoBadge from "@/components/LogoBadge.vue";

// Meting 数据源：与博客完全一致——i-meto 主源（博客实测手机网络可用）+ 两备源
const APIS = [
  "https://api.i-meto.com/meting/api?server=netease&type=playlist&id=:id&r=:r",
  "https://api.injahow.cn/meting/?server=netease&type=playlist&id=:id",
  "https://api.moeyao.cn/meting/?server=netease&type=playlist&id=:id",
];

// ── State ────────────────────────────────────────────────
const loading = ref(true);
const playlist = ref([]);
const index = ref(0);
const playing = ref(false);
const playMode = ref(2); // 默认随机播放（0 列表循环 1 单曲 2 随机）
const volume = ref(1);
const isMuted = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const lyrics = ref([]);
const lrcIndex = ref(-1);
const coverLoaded = ref(false);
const coverImg = ref(null);

const lrcOpen = ref(false);
const plOpen = ref(true); // 播放列表默认展开（手机端有 230px 封顶内滚，不会撑长卡片）
const errTip = ref(""); // 播放失败提示（整曲所有源失败时短暂显示）

// 全屏播放层
const fsOpen = ref(false);
const fsDesktop = ref(false); // 桌面布局：左封面右歌词队列；移动端：竖排
const fsView = ref("cover"); // 全屏视图：cover（仅移动端）/ lyrics / queue
const fsLrcEl = ref(null);
const fsSheet = ref(null);
const fsCoverBox = ref(null);
const fsBgImg = ref(null);
const fsCoverSrc = ref("");
// 无封面时全屏背景回退到站点壁纸（优先复用当前页面已加载的那张）
const fsWallpaper = ref("");
const bgShown = ref(false); // 背景大图首次加载完成后淡入（此后原地换图不闪）
let fsPrevBodyOverflow = "";
// 官方封面解析缓存（会话内）：歌名 → 官方 picUrl，切回听过的歌不再重复请求
const fsCoverCache = new Map();
// FluentPlayer 同款模式图标（填充路径）：顺序 / 单曲循环 / 随机
const fsModeIcons = {
  0: "M7 7h10v2H9v2.5L5.5 8 9 4.5V7zm10 10H7v-2h8v-2.5l3.5 3.5-3.5 3.5V17z",
  1: "M7 7h10v2H9v2.5L5.5 8 9 4.5V7zm10 10H7v-2h8v-2.5l3.5 3.5-3.5 3.5V17z M12 13c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z",
  2: "M14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z",
};
const fsModeIcon = computed(() => fsModeIcons[playMode.value] || fsModeIcons[0]);
const fsModeTitle = computed(() => ({ 0: "顺序播放", 1: "单曲循环", 2: "随机播放" }[playMode.value] || "播放模式"));

async function resolveFsCover() {
  const t = track.value;
  fsWallpaper.value = currentWallpaper();
  if (!t || !t.pic) {
    // 没有封面：清空封面与主色，背景交给壁纸兜底
    fsCoverSrc.value = "";
    fsDominant.value = null;
    return;
  }
  const base = hdCover(t.pic);
  const cached = fsCoverCache.get(t.name);
  if (cached) {
    fsCoverSrc.value = cached;
    return;
  }

  // 批量详情已解析出官方直链（按歌曲 ID 精确匹配）：直接升到 1024，无需再按名字搜
  if (/music\.126\.net/.test(t.pic)) {
    const hd = neteasePic(t.pic, "1024y1024");
    fsCoverCache.set(t.name, hd);
    fsCoverSrc.value = hd;
    resolveDominantColor(t.name, neteasePic(hd, "64y64")); // 采样专用小图
    syncBgShown();
    return;
  }

  // 官方封面：先按原名搜，搜不到再用去掉括号后缀（Live/伴奏/Cover 等）的名字搜
  let done = false;
  try {
    const cleanName = (t.name || "").replace(/[（(【\[].*?[)）】\]]/g, "").trim();
    const queries = [t.name, cleanName].filter((q, i, a) => q && a.indexOf(q) === i);
    for (const q of queries) {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 8000);
      const search = await fetch(`/netease-search?s=${encodeURIComponent(q)}&type=1&limit=3`, { signal: ctrl.signal }).then((r) => r.json());
      const albumId = search?.result?.songs?.[0]?.album?.id;
      if (!albumId) continue;
      const ctrl2 = new AbortController();
      setTimeout(() => ctrl2.abort(), 8000);
      const detail = await fetch(`/netease-album/${albumId}`, { signal: ctrl2.signal }).then((r) => r.json());
      const pic = detail?.album?.picUrl;
      if (!pic) continue;
      const hd = pic.replace(/^http:\/\//i, "https://") + "?param=1024y1024";
      fsCoverCache.set(t.name, hd);
      if (track.value === t) {
        fsCoverSrc.value = hd;
        resolveDominantColor(t.name, smallCover(hd));
        syncBgShown();
      }
      done = true;
      break;
    }
  } catch {
    // 官方接口异常：走下面的兜底
  }

  // 官方拿不到（搜不到专辑/接口异常）：回落播放列表自带封面，保证全屏有封面与背景
  if (!done && track.value === t) {
    fsCoverSrc.value = base;
    resolveDominantColor(t.name, smallCover(base));
    syncBgShown();
  }
}

// 缓存命中时 img 的 load 事件可能早于监听器挂载，靠 complete 兜底点亮（背景 + 小卡封面同理）
function syncBgShown() {
  nextTick(() => {
    const bg = fsBgImg.value;
    if (bg && bg.complete && bg.naturalWidth > 0) bgShown.value = true;
    const cv = coverImg.value;
    if (cv && cv.complete && cv.naturalWidth > 0) coverLoaded.value = true;
  });
}

function openFs() {
  fsOpen.value = true;
  fsDesktop.value = window.matchMedia("(min-width: 980px)").matches;
  fsView.value = "lyrics"; // 两端都默认歌词视图（移动端歌词常驻封面下方）
  fsPrevBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden"; // 全屏期间锁背景滚动
  resolveFsCover();
  syncBgShown();
  fsQList.restart(); // 打开全屏就开始后台渐进铺队列，点列表时已就绪
  nextTick(() => {
    if (fsView.value === "lyrics") fsLrcFollow(true);
  });
}

function closeFs() {
  fsOpen.value = false;
  document.body.style.overflow = fsPrevBodyOverflow;
}

// 封面主色调提取（canvas，网易 CDN 带 CORS 允许取像素）→ 背景色洗 + 径向渐变
const fsDominant = ref(null); // { h, s, l }
const fsDominantCache = new Map(); // 歌名 → 主色，避免重复提取

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, sat = 0;
  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: h * 360, s: sat, l };
}

async function resolveDominantColor(name, pic) {
  if (!pic) {
    fsDominant.value = null;
    return;
  }
  const cached = fsDominantCache.get(name);
  if (cached) {
    fsDominant.value = cached;
    return;
  }
  const color = await new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    // 允许异步解码：否则这张图会在主线程解码，切歌时掉帧
    img.decoding = "async";
    const done = (c) => resolve(c);
    img.onload = () => {
      try {
        const cv = document.createElement("canvas");
        cv.width = 24;
        cv.height = 24;
        const ctx = cv.getContext("2d");
        ctx.drawImage(img, 0, 0, 24, 24);
        const d = ctx.getImageData(0, 0, 24, 24).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
          // 跳过接近纯白/纯黑的像素，取画面主色更准
          const mx = Math.max(d[i], d[i + 1], d[i + 2]);
          const mn = Math.min(d[i], d[i + 1], d[i + 2]);
          if (mx > 245 || mn < 12) continue;
          r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
        }
        if (!n) return done(null);
        done(rgbToHsl(Math.round(r / n), Math.round(g / n), Math.round(b / n)));
      } catch {
        done(null); // 跨域失败则退回模糊封面
      }
    };
    img.onerror = () => done(null);
    img.src = pic;
  });
  if (color) fsDominantCache.set(name, color);
  fsDominant.value = color;
}

// 主色可用化：饱和度提上来、亮度压到中间调，任何封面都成一块有存在感的底色
const fsWashStyle = computed(() => {
  const c = fsDominant.value;
  // 提取失败（跨域/加载失败）时也给一层中性底色，避免背景只剩深底显空
  if (!c) return { background: "hsl(228 26% 19%)" };
  const sat = Math.min(0.62, Math.max(0.28, c.s * 1.5));
  const lum = Math.min(0.42, Math.max(0.16, c.l));
  return { background: `hsl(${c.h.toFixed(0)} ${(sat * 100).toFixed(0)}% ${(lum * 100).toFixed(0)}%)` };
});
const fsGradStyle = computed(() => {
  const c = fsDominant.value;
  if (!c) return {};
  const sat = Math.min(0.7, Math.max(0.3, c.s * 1.7));
  const lum = Math.min(0.62, Math.max(0.34, c.l + 0.18));
  return {
    background: `radial-gradient(circle at 24% 16%, hsl(${c.h.toFixed(0)} ${(sat * 100).toFixed(0)}% ${(lum * 100).toFixed(0)}% / 0.28) 0%, transparent 52%)`,
  };
});
const fsGradStyle2 = computed(() => {
  const c = fsDominant.value;
  if (!c) return {};
  const sat = Math.min(0.7, Math.max(0.3, c.s * 1.6));
  const lum = Math.min(0.5, Math.max(0.24, c.l + 0.08));
  const h2 = (c.h + 40) % 360;
  return {
    background: `radial-gradient(circle at 78% 84%, hsl(${h2.toFixed(0)} ${(sat * 100).toFixed(0)}% ${(lum * 100).toFixed(0)}% / 0.22) 0%, transparent 62%)`,
  };
});

// 当前站点壁纸：优先复用页面已加载的图，其次配置的随机壁纸接口，最后本地图
function currentWallpaper() {
  const el = document.querySelector("img.custom");
  if (el && el.naturalWidth > 0) return el.src;
  return siteConfig.bgApi || `${import.meta.env.BASE_URL}images/background.jpg`;
}
// 全屏背景源：封面降规格到 300（背景本身就模糊 44px，1024 纯浪费内存）；无封面用壁纸兜底
const fsBgSrc = computed(() => {
  const src = fsCoverSrc.value;
  if (!src) return fsWallpaper.value;
  return neteasePic(src, "300y300");
});

// 小卡封面（56px 圆形）：300 足够，避免为小图解码 1024 大图
const cardCoverSrc = computed(() => neteasePic(track.value.pic || fsCoverSrc.value, "300y300"));

// 封面加载失败：退回占位（Logo）+ 壁纸兜底背景
function onFsCoverError() {
  fsCoverSrc.value = "";
  fsDominant.value = null;
}

// 封面 3D 倾斜 + 光泽 + 投影（useCoverTilt 同款数学）
const fsHovering = ref(false);
const fsTiltRX = ref(0);
const fsTiltRY = ref(0);
const fsShineX = ref(50);
const fsShineY = ref(50);
const fsCoverTransform = ref("");
const fsShadowTransform = computed(() => {
  if (!fsHovering.value) return "";
  const x = -fsTiltRY.value * 1.6;
  const y = fsTiltRX.value * 1.2;
  const sx = 1 - Math.abs(fsTiltRY.value) * 0.008;
  const sy = 1 - Math.abs(fsTiltRX.value) * 0.008;
  return `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
});
const fsShineBg = computed(
  () => `radial-gradient(circle at ${fsShineX.value}% ${fsShineY.value}%, rgba(255,255,255,0.35) 0%, transparent 50%)`
);
function fsCoverMove(e) {
  const box = fsCoverBox.value;
  if (!box || !fsHovering.value) return;
  const r = box.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  fsShineX.value = (x / r.width) * 100;
  fsShineY.value = (y / r.height) * 100;
  fsTiltRY.value = ((x - r.width / 2) / (r.width / 2)) * 12;
  fsTiltRX.value = -((y - r.height / 2) / (r.height / 2)) * 12;
  fsCoverTransform.value = `perspective(1000px) rotateX(${fsTiltRX.value.toFixed(2)}deg) rotateY(${fsTiltRY.value.toFixed(2)}deg) scale3d(1.02, 1.02, 1.02)`;
}
function fsCoverEnter() {
  fsHovering.value = true;
  const inner = fsCoverBox.value?.querySelector(".fs-cover-inner");
  if (inner) inner.style.transition = "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)";
}
function fsCoverLeave() {
  fsHovering.value = false;
  fsTiltRX.value = 0;
  fsTiltRY.value = 0;
  fsShineX.value = 50;
  fsShineY.value = 50;
  const inner = fsCoverBox.value?.querySelector(".fs-cover-inner");
  if (inner) {
    inner.style.transition = "transform 400ms cubic-bezier(0.22, 1, 0.36, 1)";
    fsCoverTransform.value = "";
  }
}

// 全屏视图切换：歌词 ⇄ 播放列表（两端一致）
function fsToggleView(v) {
  fsView.value = fsView.value === v ? "lyrics" : v;
}

// 全屏播放列表选歌后自动收回列表（回到歌词）
function fsPickQueue(i) {
  playIndex(i);
  fsView.value = "lyrics";
}

// 列表滚动到当前播放行（小卡歌单 / 全屏队列）
const fsQueueEl = ref(null);
function scrollListToActive(container, activeEl) {
  if (!container || !activeEl) return;
  container.scrollTop = activeEl.offsetTop - container.clientHeight / 2 + activeEl.offsetHeight / 2;
}
function scrollPlaylistToActive() {
  // 当前行可能还没被渐进渲染出来，先补到它，再等 DOM 落地后定位
  plList.ensure(index.value + 1);
  nextTick(() => {
    const row = plEl.value?.children?.[index.value];
    scrollListToActive(plEl.value, row);
  });
}
function scrollQueueToActive() {
  fsQList.ensure(index.value + 1);
  nextTick(() => {
    const row = fsQueueEl.value?.children?.[index.value];
    scrollListToActive(fsQueueEl.value, row);
  });
}
watch(index, () => {
  nextTick(() => {
    scrollPlaylistToActive();
    if (fsOpen.value && fsView.value === "queue") scrollQueueToActive();
  });
});

// 歌单到位后开始渐进上屏（空歌单时 limit 归零，拿到数据再从头补）
watch(
  () => playlist.value.length,
  () => {
    plList.restart();
    if (fsOpen.value && fsView.value === "queue") fsQList.restart();
  },
  { immediate: true }
);

// 平滑滚动 + 卡死回退：被遮挡窗口/后台标签里 Chromium 会冻结平滑动画，
// 500ms 后仍在原地就立即跳到目标位（真机亮屏时平滑正常生效）
function smoothScrollTo(el, target) {
  const before = el.scrollTop;
  el.scrollTo({ top: target, behavior: "smooth" });
  setTimeout(() => {
    if (Math.abs(el.scrollTop - target) > 40 && Math.abs(el.scrollTop - before) < 10) {
      el.scrollTo({ top: target, behavior: "auto" });
    }
  }, 500);
}

// 全屏歌词跟随当前句（居中）
function fsLrcFollow(instant) {
  const el = fsLrcEl.value;
  if (!el || lrcIndex.value === -1) return;
  const line = el.children[lrcIndex.value];
  if (!line) return;
  const target = line.offsetTop - el.clientHeight / 2 + line.offsetHeight / 2;
  if (instant) {
    el.scrollTo({ top: target, behavior: "auto" });
  } else {
    smoothScrollTo(el, target);
  }
}

watch(lrcIndex, () => {
  if (fsOpen.value && fsView.value === "lyrics") fsLrcFollow(false);
});
watch(fsView, (v) => {
  if (v === "lyrics") nextTick(() => fsLrcFollow(true));
  else if (v === "queue") {
    nextTick(() => scrollQueueToActive());
  }
});



// 顶部横杠下拉关闭（跟手拖拽，超过 90px 松手即关）
let fsDragY0 = 0;
let fsDragging = false;
function fsDragStart(e) {
  fsDragY0 = e.touches[0].clientY;
  fsDragging = true;
  fsSheet.value.style.transition = "none";
}
function fsDragMove(e) {
  if (!fsDragging || !fsSheet.value) return;
  const dy = Math.max(0, e.touches[0].clientY - fsDragY0);
  fsSheet.value.style.transform = `translateY(${dy}px)`;
}
function fsDragEnd(e) {
  if (!fsDragging || !fsSheet.value) return;
  fsDragging = false;
  const dy = Math.max(0, e.changedTouches[0].clientY - fsDragY0);
  fsSheet.value.style.transition = "";
  fsSheet.value.style.transform = "";
  if (dy > 90) closeFs();
}

const audioEl = ref(null);
const lrcEl = ref(null);
const plEl = ref(null);

// 歌单渐进上屏：410 行一次性渲染要建约 5300 个节点，是一次约 100ms 的主线程长任务
// （点开二级面板当场掉帧的真凶）。改成分帧追加——首屏只建 chunk 行，其余在空闲时间
// 补齐，单帧代价只剩新增的那几行；配合行上的 content-visibility，离屏行不参与布局。
function makeProgressor(totalRef, chunk, onDone) {
  const limit = ref(chunk);
  const rows = computed(() => totalRef.value.slice(0, limit.value));
  let handle = 0;
  let idle = false;
  // 补齐完成前不允许“先渲染到某一行”——随机起始曲的序号可能接近 400，
  // 一旦按需插队渲染就退化成一次性上屏（实测仍是约 80ms 长任务）。
  // 补齐完成后再定位（onDone），此时 limit 已到底，插队是空操作。
  let fillDone = false;
  const stop = () => {
    if (!handle) return;
    if (idle && window.cancelIdleCallback) window.cancelIdleCallback(handle);
    else clearTimeout(handle);
    handle = 0;
  };
  const schedule = (fn) => {
    if (window.requestIdleCallback) {
      idle = true;
      // timeout 设为 60ms：只在真空闲时插入，但保证 1s 内补完，用户开始滚动前就已就绪
      return window.requestIdleCallback(fn, { timeout: 60 });
    }
    idle = false;
    return setTimeout(fn, 16);
  };
  const step = () => {
    if (limit.value >= totalRef.value.length) {
      handle = 0;
      fillDone = true;
      if (onDone) onDone();
      return;
    }
    limit.value = Math.min(totalRef.value.length, limit.value + chunk);
    handle = schedule(step);
  };
  return {
    rows,
    // 回到首屏 chunk 再补齐（歌单到位 / 切到队列视图时调用）
    restart() {
      stop();
      fillDone = false;
      limit.value = Math.min(chunk, totalRef.value.length);
      if (limit.value < totalRef.value.length) {
        handle = schedule(step);
      } else {
        handle = 0;
        fillDone = true;
        if (onDone) onDone();
      }
    },
    // 要定位到某一行时先把它渲染出来（否则 children[i] 还不存在）
    ensure(n) {
      if (!fillDone) return;
      if (limit.value < n) limit.value = Math.min(n, totalRef.value.length);
    },
    stop,
  };
}
// 补完最后一行后再定位一次当前播放行：行是渐进追加的，早先那次定位时
// 后面的行还没进 DOM，容器高度/偏移与最终不一致
const plList = makeProgressor(playlist, 24, () => scrollPlaylistToActive());
const plRows = plList.rows;
const fsQList = makeProgressor(playlist, 32, () => scrollQueueToActive());
const fsQRows = fsQList.rows;

let isUserScrolling = false;
let scrollTimeout = null;

const track = computed(() => playlist.value[index.value] || { name: "音乐", artist: "未在播放" });
const pct = computed(() => (duration.value ? (currentTime.value / duration.value) * 100 : 0));
const coverSpinning = computed(() => playing.value);

// 切歌时始终解析官方高清封面（主卡小封面与全屏共用，面板关闭也在后台预取）
watch(track, () => {
  resolveFsCover();
});

// 网易云 CDN 加尺寸参数取高清封面（1024²），其他图源原样返回
function hdCover(u) {
  if (!u) return u;
  const s = u.replace(/^http:\/\//i, "https://");
  return /music\.126\.net/.test(s) && !s.includes("param=") ? s + "?param=1024y1024" : s;
}

// 主色提取只需要一张很小的图：拿 1024 封面去 drawImage 会强制解码整张大图
// （主线程几十毫秒，切歌/开面板时掉帧）。换 64×64 变体后解码几乎无成本，
// 而取色本来就降采样到 24×24 求均值，结果一致。
function smallCover(u) {
  if (!u) return u;
  const s = u.replace(/^http:\/\//i, "https://").replace(/\?param=[^&]*/i, "");
  return /music\.126\.net/.test(s) ? s + "?param=64y64" : s;
}
const modeIcon = computed(() =>
  playMode.value === 2 ? "shuffle" : playMode.value === 1 ? "repeat-one" : "repeat"
);

// ── Helpers（对齐博客 MusicManager）──────────────────────
function fmt(seconds) {
  if (!seconds || Number.isNaN(seconds)) return "0:00";
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return min + ":" + (sec < 10 ? "0" : "") + sec;
}

function parseLRC(lrc) {
  if (!lrc) return [];
  const result = [];
  const timeReg = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;
  lrc.split("\n").forEach((line) => {
    const matches = Array.from(line.matchAll(timeReg));
    if (matches.length > 0) {
      const text = line.replace(timeReg, "").trim();
      if (text) {
        matches.forEach((match) => {
          const m = parseInt(match[1]);
          const s = parseInt(match[2]);
          const ms = parseInt(match[3]);
          const time = m * 60 + s + ms / (match[3].length === 3 ? 1000 : 100);
          result.push({ time, text });
        });
      }
    }
  });
  return result.sort((a, b) => a.time - b.time);
}

let winnerApi = 0; // 本轮竞速胜出的源；单曲降级链优先复用它

// 三源并发竞速：谁先返回有效歌单用谁（串行最坏要等 3×超时，并发只需最快那家）
async function fetchPlaylistAll() {
  const id = siteConfig.musicPlaylist;
  const tryOne = async (api, i) => {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 4000);
    const url = api.replace(":id", id).replace(":r", String(Math.random()));
    const data = await fetch(url, { signal: ctrl.signal }).then((r) => r.json());
    if (!Array.isArray(data) || !data.length) throw new Error("empty");
    const tracks = data
      .map((item) => ({
        name: item.title || item.name || "Unknown",
        artist: item.author || item.artist || "Unknown",
        // 网易 CDN 部分直链是 http，https 页面下会被浏览器拦截，统一转 https
        url: (item.url || "").replace(/^http:\/\//i, "https://"),
        pic: (item.pic || item.cover || "").replace(/^http:\/\//i, "https://"),
        lrc: item.lrc || "",
      }))
      .filter((t) => t.url);
    if (!tracks.length) throw new Error("no urls");
    winnerApi = i;
    return tracks;
  };
  return Promise.any(APIS.map((api, i) => tryOne(api, i)));
}

// 歌曲 ID（从音源链接提取）→ 官方歌曲详情批量换高清封面
function songIdOf(t) {
  const m = (t.url || "").match(/[?&]id=(\d+)/);
  return m ? m[1] : "";
}
function neteasePic(picUrl, size) {
  const u = (picUrl || "").replace(/^http:\/\//i, "https://");
  return /music\.126\.net/.test(u) ? u.replace(/[?&]param=[^&]*/, "") + "?param=" + size : u;
}
async function upgradeCovers(tracks) {
  const items = tracks.map((t) => ({ t, id: songIdOf(t) })).filter((x) => x.id);
  const CHUNK = 100;
  for (let i = 0; i < items.length; i += CHUNK) {
    const part = items.slice(i, i + CHUNK);
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 10000);
      const ids = encodeURIComponent("[" + part.map((x) => x.id).join(",") + "]");
      const res = await fetch(`/netease-songs?ids=${ids}`, { signal: ctrl.signal }).then((r) => r.json());
      const map = new Map((res.songs || []).map((x) => [String(x.id), (x.album && x.album.picUrl) || ""]));
      part.forEach(({ t, id }) => {
        const pic = map.get(String(id));
        if (pic) t.pic = neteasePic(pic, "120y120");
      });
    } catch {
      // 该批失败：保持原封面
    }
  }
}

// 歌单就绪后异步把整份歌单封面换成官方高清（后台进行，不阻塞展示）
function scheduleCoverUpgrade() {
  const tracks = playlist.value;
  if (!tracks.length) return;
  upgradeCovers(tracks).then(() => {
    try {
      localStorage.setItem(playlistCacheKey, JSON.stringify({ ts: Date.now(), playlist: tracks }));
    } catch {
      // 存储失败忽略
    }
  });
}

// ── 歌单预载：页面一打开就开始拉，进二级面板时多半已就绪 ──
// 缓存 key 绑定歌单 ID：配置改了歌单立即失效，不用清缓存/无痕
const playlistCacheKey = `music_playlist_v2_${siteConfig.musicPlaylist || "default"}`;
// 清理旧版无 ID 的遗留缓存（已不再读取，白占空间）
try {
  localStorage.removeItem("music_playlist_v2");
} catch {
  // 忽略
}
const playlistReady = (async () => {
  try {
    const cached = JSON.parse(localStorage.getItem(playlistCacheKey) || "null");
    if (cached && Date.now() - cached.ts < 6 * 60 * 60 * 1000 && cached.playlist.length) {
      return cached.playlist;
    }
  } catch {
    // 缓存解析失败则正常请求
  }
  try {
    const tracks = await fetchPlaylistAll();
    try {
      localStorage.setItem(playlistCacheKey, JSON.stringify({ ts: Date.now(), playlist: tracks }));
    } catch {
      // 存储失败不影响展示
    }
    return tracks;
  } catch {
    return []; // 页面刚打开时源全挂不算最终失败，开面板时还会重试
  }
})();

// ── Lyrics ───────────────────────────────────────────────
// 歌词缓存：内存 + localStorage（按歌词地址），二次播放/切回秒出
const lrcMem = new Map();
function lrcCacheKey(url) {
  return "lrc_" + url.slice(-64);
}
function applyLrcText(t, text) {
  if (playlist.value[index.value] !== t) return; // 已切歌，丢弃过期歌词
  lyrics.value = parseLRC(text);
}
function loadLyrics(t) {
  lyrics.value = [];
  lrcIndex.value = -1;

  if (!t.lrc) return;

  const isLrcUrl = /^(https?:)?\/\//.test(t.lrc) || t.lrc.startsWith("/") || /\.(lrc|txt)(\?|#|$)/i.test(t.lrc);

  if (!isLrcUrl) {
    lyrics.value = parseLRC(t.lrc);
    return;
  }

  // 内存缓存命中：同步显示
  const key = lrcCacheKey(t.lrc);
  if (lrcMem.has(key)) {
    applyLrcText(t, lrcMem.get(key));
    return;
  }
  // localStorage 命中：同步显示并回填内存
  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      lrcMem.set(key, cached);
      applyLrcText(t, cached);
      return;
    }
  } catch {
    // 读取失败则走网络
  }

  fetch(t.lrc)
    .then((r) => r.text())
    .then((text) => {
      if (text) {
        lrcMem.set(key, text);
        try {
          localStorage.setItem(key, text);
        } catch {
          // 存储失败不影响展示
        }
      }
      applyLrcText(t, text);
    })
    .catch(() => (lyrics.value = []));
}

// 后台预取下一首歌词，切歌时即刻可用
let prefetching = false;
function prefetchNextLyrics() {
  if (prefetching || playlist.value.length < 2) return;
  const next = playlist.value[(index.value + 1) % playlist.value.length];
  if (!next || !next.lrc || !/^(https?:)?\/\//.test(next.lrc)) return;
  const key = lrcCacheKey(next.lrc);
  if (lrcMem.has(key) || localStorage.getItem(key)) return;
  prefetching = true;
  fetch(next.lrc)
    .then((r) => r.text())
    .then((text) => {
      if (text) {
        lrcMem.set(key, text);
        try {
          localStorage.setItem(key, text);
        } catch {
          // 忽略
        }
      }
    })
    .catch(() => {})
    .finally(() => (prefetching = false));
}

function updateLrcHighlight(time) {
  if (!lyrics.value.length) return;
  let idx = -1;
  for (let i = 0; i < lyrics.value.length; i++) {
    if (lyrics.value[i].time <= time) idx = i;
    else break;
  }
  if (idx === lrcIndex.value) return;
  lrcIndex.value = idx;

  // 抽屉收起时不滚动（隐藏容器滚动无效），打开时由 toggleLrc 主动定位
  if (idx !== -1 && lrcOpen.value && !isUserScrolling && lrcEl.value) {
    scrollLrcTo(idx, "smooth");
  }
}

let progScrollUntil = 0; // 程序滚动期间触发的事件不算用户滚动

function scrollLrcTo(idx, behavior) {
  const line = lrcEl.value?.children[idx];
  if (!line || !lrcEl.value) return;
  const target = line.offsetTop - lrcEl.value.clientHeight / 2 + line.offsetHeight / 2;
  // 平滑滚动的事件可持续数百 ms，窗口要盖过它，否则自己的滚动会被当成用户滚动
  progScrollUntil = performance.now() + (behavior === "smooth" ? 900 : 300);
  if (behavior === "smooth") {
    smoothScrollTo(lrcEl.value, target);
  } else {
    lrcEl.value.scrollTo({ top: target, behavior: "auto" });
  }
}

function resetScrollTimeout() {
  clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    isUserScrolling = false;
    if (lrcIndex.value !== -1 && lrcEl.value) {
      const line = lrcEl.value.children[lrcIndex.value];
      if (line) {
        const target = line.offsetTop - lrcEl.value.clientHeight / 2 + line.offsetHeight / 2;
        progScrollUntil = performance.now() + 300; // 回正也是程序滚动
        lrcEl.value.scrollTo({ top: target, behavior: "auto" });
      }
    }
  }, 3000);
}

// ── 自建音源代理（config.musicSource = "proxy"）─────────────
// 只接管「解析播放直链」这一步：Metting 的候选链原样并行，代理解析出的直链
// 参与探活竞速，晚到就留在候选链里当兜底。代理不中转音频流，最终仍是浏览器直连 CDN。
let proxyWarned = false; // 代理失败只提示一次，避免每首歌都刷控制台
function proxyEnabled() {
  return siteConfig.musicSource === "proxy" && !!siteConfig.musicProxy;
}

async function resolveProxyUrl(t, ms = 3500) {
  if (!proxyEnabled()) return "";
  const id = songIdOf(t);
  if (!id) return "";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const base = String(siteConfig.musicProxy).replace(/\/+$/, "");
    const q = encodeURIComponent(siteConfig.musicQuality || "320k");
    const res = await fetch(`${base}/api/url?id=${encodeURIComponent(id)}&source=wy&quality=${q}`, {
      signal: ctrl.signal,
    }).then((r) => r.json());
    // 部分音源返回 http 直链，https 页面下会被浏览器拦掉，统一升到 https
    return String((res && res.url) || "").replace(/^http:\/\//i, "https://");
  } catch (e) {
    // 静默退回 Meting 候选链，但给一次控制台提示——最常见的失败原因是
    // musicProxy 填了 http:// 地址，被浏览器当作 Mixed Content 拦掉
    if (!proxyWarned) {
      proxyWarned = true;
      console.warn("[music] 自建音源代理请求失败，已退回 Meting：", e && e.message, "
检查 musicProxy 是否为 https 地址（HTTPS 页面不能请求 http 资源）");
    }
    return "";
  } finally {
    clearTimeout(timer);
  }
}

// ── Playback ─────────────────────────────────────────────
// 实现方式照搬博客音乐播放器（github.com/CuteLeaf/Firefly 的 MusicManager）并适配 Vue：
// loadVersion 丢弃过期 play 回调 + AbortError 静默 + 同曲多源降级 + 全败 2s 延迟跳曲
let loadVersion = 0; // 每次 loadAndPlay 自增；旧曲的 play 回调/降级链全部作废
let wantPlay = false; // 用户是否要求出声：预载阶段任何失败都保持静默
let trackUrls = []; // 当前曲候选源（Meting 主链 + 各备源的单曲解析）
let trackUrlIdx = 0;
let errorSkipTimer = null;
let loadTimer = null; // 看门狗：源挂起（不报错也不出声）时强制走降级链

function clearLoadTimer() {
  if (loadTimer) {
    clearTimeout(loadTimer);
    loadTimer = null;
  }
}

function armLoadTimer(ver) {
  clearLoadTimer();
  loadTimer = setTimeout(() => {
    if (ver === loadVersion) onAudioError();
  }, 4500);
}

function playCurrentUrl(autoPlay, ver) {
  if (ver !== loadVersion) return; // 已切歌，过期调用直接丢弃
  const audio = audioEl.value;
  if (!audio) return;
  audio.src = trackUrls[trackUrlIdx];
  armLoadTimer(ver);
  if (!autoPlay) {
    playing.value = false;
    return;
  }
  audio.play().then(() => {
    if (ver !== loadVersion) return;
    playing.value = true;
    errTip.value = "";
  }).catch((e) => {
    // 过期或被新加载打断（AbortError）一律静默，交给 error 事件走降级链
    if (ver !== loadVersion || e.name === "AbortError") return;
    playing.value = false;
  });
}

// 并发探活：用隐藏 Audio 探针（preload=metadata 只拉头部、媒体加载不受 CORS 限制）
// 同时试全部候选源，谁先给出元数据播谁——挂起源无需逐个等看门狗；
// 探活只排序不淘汰，全部失败仍走原降级链 + 看门狗兜底
function probeAudio(url, ms) {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = "metadata";
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      a.removeAttribute("src");
      a.load();
      resolve(ok);
    };
    const t = setTimeout(() => done(false), ms);
    a.addEventListener("loadedmetadata", () => done(true));
    a.addEventListener("error", () => done(false));
    a.src = url;
  });
}

// 代理直链插到候选链第 2 位：第一顺位仍是在播/预载的源，它一挂立刻换代理直链，
// 而不是先挨个试完 Meting 的备源（每个都要等看门狗超时）
function insertProxyUrl(u, ver) {
  if (!u || ver !== loadVersion || trackUrls.includes(u)) return;
  if (trackUrls.length > 1) trackUrls.splice(1, 0, u);
  else trackUrls.push(u);
}

async function playWithProbe(cands, ver, latePromise) {
  let lateUrl = "";
  const winner = await new Promise((resolve) => {
    let done = false;
    const finish = (u) => {
      if (!done) {
        done = true;
        resolve(u);
      }
    };
    cands.forEach((u) => probeAudio(u, 4000).then((ok) => ok && finish(u)));
    // 代理直链是异步解析的：到得早就一起竞速，到得晚就当兜底
    if (latePromise) {
      latePromise.then((u) => {
        if (!u) return;
        lateUrl = u;
        probeAudio(u, 4000).then((ok) => ok && finish(u));
      });
    }
    setTimeout(() => finish(null), 4100);
  });
  if (ver !== loadVersion || !wantPlay) return; // 已切歌或用户已暂停（探活期间点暂停）
  if (winner) {
    trackUrls = [winner, ...cands.filter((u) => u !== winner)];
    trackUrlIdx = 0;
  }
  // 迟到的代理直链也要进候选链（竞速时它可能还没解析完）
  if (lateUrl) insertProxyUrl(lateUrl, ver);
  if (latePromise) latePromise.then((u) => insertProxyUrl(u, ver));
  playCurrentUrl(true, ver);
}

function loadAndPlay(i, autoPlay = true) {
  if (i < 0 || i >= playlist.value.length) return;
  index.value = i;
  const t = playlist.value[i];
  const audio = audioEl.value;
  if (!audio) return;
  const ver = ++loadVersion;
  wantPlay = autoPlay;
  if (errorSkipTimer) {
    clearTimeout(errorSkipTimer);
    errorSkipTimer = null;
  }

  // 候选源：歌单竞速的胜出源优先（当前网络下它最可达），其余源殿后
  trackUrls = [t.url];
  trackUrlIdx = 0;
  const mid = t.url.match(/[?&]id=([^&]+)/);
  const mserver = t.url.match(/[?&]server=([^&]+)/);
  if (mid && mserver) {
    const ordered = [APIS[winnerApi], ...APIS.filter((_, i) => i !== winnerApi)];
    ordered.forEach((api) => {
      const fu = api
        .replace(/server=[^&]+/, "server=" + mserver[1])
        .replace(/type=[^&]+/, "type=url")
        .replace(/id=[^&]+/, "id=" + mid[1])
        .replace(/:r/, String(Math.random()));
      if (!trackUrls.includes(fu)) trackUrls.push(fu);
    });
  }

  // 自建代理：与 Meting 探活并行解析直链（id 取自音源链接里的网易歌曲 id）
  const latePromise = proxyEnabled() ? resolveProxyUrl(t) : null;

  loadLyrics(t);
  prefetchNextLyrics();
  coverLoaded.value = false;
  syncBgShown();
  currentTime.value = 0;
  duration.value = 0;
  if (autoPlay) {
    playWithProbe(trackUrls.slice(), ver, latePromise);
  } else {
    playCurrentUrl(false, ver);
    // 预载不发声：代理直链排进候选链，预载源一挂就能顶上
    if (latePromise) latePromise.then((u) => insertProxyUrl(u, ver));
  }
}

let lastErrAt = 0; // 同一个错误的 error 事件与 play() reject 可能双触发，300ms 内去重
// 当前源失效（过期/版权/断链/挂起）：先换下一个候选源，全部失败 2 秒后跳下一首
// 预载阶段（用户还没点播放）静默失败即可，绝不自动出声
function onAudioError() {
  if (!playlist.value.length || !wantPlay) return;
  if (performance.now() - lastErrAt < 300) return;
  lastErrAt = performance.now();
  clearLoadTimer();
  const ver = loadVersion;
  if (trackUrlIdx < trackUrls.length - 1) {
    trackUrlIdx++;
    playCurrentUrl(true, ver);
  } else {
    playing.value = false;
    showErrTip("播放失败，已自动切换下一首");
    if (errorSkipTimer) clearTimeout(errorSkipTimer);
    errorSkipTimer = setTimeout(() => {
      if (ver === loadVersion) {
        loadAndPlay((index.value + 1) % playlist.value.length, true);
      }
    }, 2000);
  }
}

let errTipTimer = null;
function showErrTip(msg) {
  errTip.value = msg;
  if (errTipTimer) clearTimeout(errTipTimer);
  errTipTimer = setTimeout(() => (errTip.value = ""), 2600);
}

// 歌单点击选歌：点正在播的当前曲 = 暂停，其余 = 切歌播放（与博客一致）
function playIndex(i) {
  if (!playlist.value.length) return;
  if (i === index.value && !audioEl.value?.paused) {
    togglePlay();
  } else {
    loadAndPlay(i, true);
  }
}

function togglePlay() {
  const audio = audioEl.value;
  if (!audio || !playlist.value.length) return;
  if (audio.paused) {
    wantPlay = true;
    if (!audio.src) {
      loadAndPlay(index.value);
      return;
    }
    armLoadTimer(loadVersion); // 用户点了播放：挂起源同样要走看门狗
    audio.play().then(() => (playing.value = true)).catch((e) => {
      if (e.name === "AbortError") return;
      // 预载的源已提前死亡（error 事件在预载期已消费）：走降级链换源播放
      playing.value = false;
      onAudioError();
    });
  } else {
    wantPlay = false;
    audio.pause();
    playing.value = false;
  }
}

function next(auto = false) {
  const n = playlist.value.length;
  if (!n) return;
  if (playMode.value === 1 && auto) {
    // 单曲循环：自然播完原地重播
    const audio = audioEl.value;
    if (audio) {
      audio.currentTime = 0;
      audio.play();
    }
    return;
  }
  const i = playMode.value === 2 ? Math.floor(Math.random() * n) : (index.value + 1) % n;
  loadAndPlay(i, true);
}

function prev() {
  const n = playlist.value.length;
  if (!n) return;
  const i = playMode.value === 2 ? Math.floor(Math.random() * n) : (index.value - 1 + n) % n;
  loadAndPlay(i, true);
}

function cycleMode() {
  playMode.value = (playMode.value + 1) % 3;
}

function onEnded() {
  next(true);
}

function onTime() {
  const audio = audioEl.value;
  if (!audio) return;
  // 元数据/进度到达 = 当前源活着，撤掉挂起看门狗
  if (audio.duration) clearLoadTimer();
  currentTime.value = audio.currentTime || 0;
  duration.value = audio.duration || 0;
  updateLrcHighlight(audio.currentTime || 0);
}

function seek(e) {
  const audio = audioEl.value;
  if (!audio || !duration.value) return;
  const rect = e.currentTarget.getBoundingClientRect();
  audio.currentTime = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1) * duration.value;
}

function seekTo(time) {
  const audio = audioEl.value;
  if (audio) audio.currentTime = time;
}

function toggleMute() {
  const audio = audioEl.value;
  if (!audio) return;
  isMuted.value = !isMuted.value;
  audio.muted = isMuted.value;
}

function setVol(e) {
  const audio = audioEl.value;
  if (!audio) return;
  const rect = e.currentTarget.getBoundingClientRect();
  volume.value = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
  audio.volume = volume.value;
  if (volume.value > 0) isMuted.value = false;
  audio.muted = isMuted.value;
}

function toggleLrc() {
  lrcOpen.value = !lrcOpen.value;
  if (lrcOpen.value) {
    plOpen.value = false;
    // 展开后定位当前行：先立即定位，待 0.3s 展开动画结束再校正一次
    // （动画期间容器高度在变，一次定位会偏）
    nextTick(() => {
      isUserScrolling = false;
      if (lrcIndex.value !== -1) scrollLrcTo(lrcIndex.value, "auto");
      else if (lrcEl.value) lrcEl.value.scrollTop = 0;
    });
    setTimeout(() => {
      if (lrcOpen.value && lrcIndex.value !== -1) {
        isUserScrolling = false;
        scrollLrcTo(lrcIndex.value, "auto");
      }
    }, 360);
  } else {
    plOpen.value = true; // 歌词收起恢复常驻播放列表，小卡永不为空
  }
}

function onUserLrcScroll() {
  // 程序化的居中滚动自身会触发 scroll 事件，不计为用户滚动
  if (performance.now() < progScrollUntil) return;
  isUserScrolling = true;
  resetScrollTimeout();
}

onMounted(async () => {
  loading.value = true;
  try {
    playlist.value = await playlistReady;
    // 页面刚打开时源全挂的情况：开面板时再试一次（网络可能已恢复）
    if (!playlist.value.length) {
      playlist.value = await fetchPlaylistAll();
      try {
        localStorage.setItem(
          playlistCacheKey,
          JSON.stringify({ ts: Date.now(), playlist: playlist.value })
        );
      } catch {
        // 存储失败不影响展示
      }
    }
    if (playlist.value.length) {
      scheduleCoverUpgrade();
      // 随机预载一首（不自动播），避免每次打开都是同一首
      loadAndPlay(Math.floor(Math.random() * playlist.value.length), false);
    } else {
      failedLoad();
    }
  } catch {
    failedLoad();
  }
  loading.value = false;
  // 定位不在这一步做：此时行还没补齐，偏移不准，交给补齐完成后的 onDone
});

function failedLoad() {
  playlist.value = [];
}

onUnmounted(() => {
  audioEl.value?.pause();
  plList.stop();
  fsQList.stop();
  clearTimeout(scrollTimeout);
  if (errTipTimer) clearTimeout(errTipTimer);
  if (fsOpen.value) document.body.style.overflow = fsPrevBodyOverflow;
});
</script>

<style scoped>
.music {
  position: relative;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  /* 跟随网格同行等高，歌单填满剩余空间（底部截断与热榜/新闻一致） */
  height: 100%;
}

/* Loading overlay */
.loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: grid;
  place-items: center;
  background: rgba(20, 25, 40, 0.6);
  backdrop-filter: blur(2px);
  border-radius: var(--radius);
  color: var(--accent1);
}

.spin {
  animation: spin 1s linear infinite;
}

.play-err {
  margin-top: 6px;
  font-size: 0.72rem;
  color: #f87171;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Top row */
.top-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  padding: 0 4px;
}

.cover-wrap {
  flex-shrink: 0;
}

.cover-circle {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  overflow: hidden;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
  border: 2px solid rgba(255, 255, 255, 0.85);
  background: rgba(129, 140, 248, 0.12);
  display: grid;
  place-items: center;
  position: relative;
}

.cover-ph {
  position: absolute;
  color: var(--accent1);
  opacity: 0.4;
}

.cover-img {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 1;
  transition: opacity 0.3s ease;
}

.cover-img.spinning {
  animation: spin-slow 10s linear infinite;
}

@keyframes spin-slow {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.info-l1 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  overflow: hidden;
}

.title {
  flex: 1;
  min-width: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text);
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn-lrc {
  flex-shrink: 0;
  border: none;
  background: transparent;
  padding: 2px 6px;
  color: var(--text-dim);
  cursor: pointer;
  transition: color 0.25s ease;
}

.info-btns {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.btn-fs {
  flex-shrink: 0;
  border: none;
  background: transparent;
  padding: 2px 6px;
  color: var(--text-dim);
  cursor: pointer;
  transition: color 0.25s ease;
}

.btn-fs:hover,
.btn-lrc:hover {
  color: var(--text);
}

.btn-lrc:hover,
.btn-lrc.on {
  color: var(--accent1);
}

.artist {
  font-size: 0.74rem;
  color: var(--text-dim);
  margin: 2px 0 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.time-vol {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 20px;
}

.time {
  font-size: 0.66rem;
  font-family: ui-monospace, monospace;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.vol {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.btn-mute {
  border: none;
  background: transparent;
  padding: 2px;
  color: var(--text-dim);
  cursor: pointer;
  display: flex;
  transition: color 0.25s ease;
}

.btn-mute:hover {
  color: var(--accent1);
}

.vol-track {
  width: 64px;
  height: 4px;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.14);
  cursor: pointer;
  position: relative;
}

.vol-fill {
  height: 100%;
  border-radius: 99px;
  background: var(--accent1);
}

/* Progress */
.progress {
  position: relative;
  height: 4px;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.14);
  cursor: pointer;
  margin: 2px 4px 12px;
  touch-action: none;
}

.p-bar {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  border-radius: 99px;
  background: var(--accent1);
  transition: width 0.1s linear;
}

.p-thumb {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  margin: -6px 0 0 -6px;
  border-radius: 50%;
  background: var(--accent1);
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.9);
  transform: scale(0);
  transition: transform 0.2s ease, left 0.1s linear;
}

.progress:hover .p-thumb {
  transform: scale(1);
}

/* Controls */
.controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
  user-select: none;
}

.btn-mode,
.btn-skip,
.btn-drawer {
  border: none;
  background: transparent;
  padding: 8px;
  color: var(--text-dim);
  cursor: pointer;
  display: flex;
  transition: color 0.25s ease, transform 0.1s ease;
}

.btn-skip:hover,
.btn-mode:hover,
.btn-drawer:hover {
  color: var(--accent1);
}

.btn-mode.on,
.btn-drawer.on {
  color: var(--accent1);
}

.btn-skip:active,
.btn-mode:active,
.btn-drawer:active {
  transform: scale(0.92);
}

.btn-play {
  width: 48px;
  height: 48px;
  border: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--glass-strong);
  color: var(--accent1);
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-play:hover {
  filter: brightness(1.15);
}

.btn-play.playing {
  background: var(--accent1);
  color: #fff;
}

.btn-play .icon-play {
  margin-left: 3px;
}

/* Drawers（grid-rows 过渡，对齐博客） */
.drawer {
  display: grid;
  grid-template-rows: 0fr;
  min-height: 0; /* 卡片定高时允许 flex 压缩抽屉，列表/歌词才能约束在可视槽内 */
  opacity: 0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.drawer.open {
  grid-template-rows: 1fr;
  opacity: 1;
}

.drawer-clip {
  overflow: hidden;
  min-height: 0;
}

/* Lyrics */
.lrc-container {
  position: relative; /* 让 .lrc-line 的 offsetTop 以容器为基准，居中定位才准确 */
  height: calc(100% - 8px); /* 填满抽屉槽位：可视窗口即居中窗口 */
  overflow-y: auto;
  overflow-anchor: none; /* 行高亮改变行高，关掉锚定补偿防止跟丢 */
  margin-top: 8px;
  padding: 60px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  scroll-behavior: smooth;
}

.lrc-line {
  font-size: 0.84rem;
  color: var(--text-dim);
  padding: 4px 0;
  cursor: pointer;
  transition: all 0.3s ease;
}

.lrc-line:hover {
  color: var(--accent1);
}

.lrc-line.active {
  color: var(--accent1);
  font-weight: 700;
  font-size: 0.95rem;
}

.lrc-empty {
  color: var(--text-dim);
  font-size: 0.84rem;
  padding: 40px 0;
}

/* Playlist */
.playlist-container {
  position: relative; /* offsetTop 以容器为基准，定位当前行才准 */
  height: calc(100% - 8px); /* 填满抽屉槽位并在其内滚动 */
  overflow-y: auto;
  margin-top: 8px;
  padding: 8px 4px 8px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.pl-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.25s ease;
  /* 离屏行跳过布局/绘制：410 行歌单滚动时不再逐行参与布局。
     注意 contain-intrinsic-size 量的是内容盒（不含 padding），所以填封面高度 32px
     而不是行高 48px——多算 16px 会让每行占位偏大、offsetTop 累积漂移 */
  content-visibility: auto;
  contain-intrinsic-size: auto 32px;
}

.pl-item:hover {
  background: var(--glass-strong);
}

.pl-item.active {
  background: var(--glass-strong);
}

.pi-cover {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.08);
}

.pi-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pi-ph {
  position: absolute;
  color: var(--text-dim);
  opacity: 0.6;
}

.pi-overlay {
  position: absolute;
  inset: 0;
  background: rgba(129, 140, 248, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent1);
}

.pi-meta {
  min-width: 0;
}

.pi-title {
  font-size: 0.76rem;
  font-weight: 700;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pl-item.active .pi-title {
  color: var(--accent1);
}

.pi-artist {
  font-size: 0.68rem;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Equalizer bars（对齐博客）*/
.eq-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 14px;
}

.eq-bars span {
  width: 3px;
  border-radius: 2px;
  background: var(--accent1);
  animation: eq-bounce 1.2s ease-in-out infinite;
}

.eq-bars span:nth-child(1) {
  animation-duration: 0.8s;
}

.eq-bars span:nth-child(2) {
  animation-duration: 0.6s;
  animation-delay: 0.15s;
}

.eq-bars span:nth-child(3) {
  animation-duration: 1s;
  animation-delay: 0.3s;
}

@keyframes eq-bounce {
  0%,
  100% {
    height: 4px;
  }
  50% {
    height: 14px;
  }
}

.playlist-container::-webkit-scrollbar,
.lrc-container::-webkit-scrollbar {
  width: 4px;
}

.playlist-container::-webkit-scrollbar-thumb,
.lrc-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 99px;
}

.tip-text {
  color: var(--text-dim);
  font-size: 0.84rem;
}

/* ── 全屏播放层（Apple Music 风格） ── */
.fs-player {
  position: fixed;
  inset: 0;
  z-index: 60;
  overflow: hidden;
  background: #0a0a0a;
}

/* 背景：封面大图模糊铺满，加载完成后淡入（切歌时交叉呼吸感） */
/* 主色调层（FluentPlayer 同款四层背景：底色 → 色洗/模糊封面 → 径向渐变 → 渐晕） */
.fs-color-wash {
  position: absolute;
  inset: 0;
  filter: saturate(1.1);
}

.fs-bg-wrap {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

/* 动态背景：主色光斑缓慢漂移 + 模糊封面呼吸（FluentPlayer 动态背景的轻量实现） */
.fs-grad-1,
.fs-grad-2 {
  position: absolute;
  inset: -12%;
  will-change: transform;
  backface-visibility: hidden;
}

.fs-grad-1 {
  animation: fsFlow1 46s ease-in-out infinite alternate;
}

.fs-grad-2 {
  animation: fsFlow2 62s ease-in-out infinite alternate;
}

@keyframes fsFlow1 {
  from {
    transform: translate3d(-4%, -3%, 0) scale(1);
  }
  to {
    transform: translate3d(6%, 5%, 0) scale(1.28);
  }
}

@keyframes fsFlow2 {
  from {
    transform: translate3d(4%, 6%, 0) scale(1.2);
  }
  to {
    transform: translate3d(-6%, -5%, 0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .fs-grad-1,
  .fs-grad-2 {
    animation: none;
  }
}

.fs-bg-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* FluentPlayer 同款背景参数 */
  transform: scale(1.05);
  /* 不叠 mix-blend-mode：全屏动画层上的混合模式会强制逐帧重算，是这里最大的 GPU 开销 */
  filter: blur(44px) brightness(0.66) saturate(1.5);
  will-change: transform; /* 模糊层一次栅格化后只做变换合成，避免逐帧重算模糊 */
  opacity: 0;
  transition: opacity 0.8s ease;
}

.fs-bg-img.show {
  opacity: 1;
}


.fs-shade {
  position: absolute;
  inset: 0;
  /* FluentPlayer 同款：0.35 暗化 + 四周渐晕 */
  background:
    linear-gradient(to bottom, rgba(0, 0, 0, 0.1), transparent 35%, rgba(0, 0, 0, 0.4)),
    linear-gradient(to right, rgba(0, 0, 0, 0.15), transparent 22%, transparent 78%, rgba(0, 0, 0, 0.15));
}

.fs-sheet {
  position: relative;
  height: 100%;
  max-width: 460px;
  margin: 0 auto;
  padding: 10px 26px calc(48px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
}

.fs-handle {
  height: 30px;
  display: grid;
  place-items: center;
  cursor: pointer;
  touch-action: none;
  flex-shrink: 0;
}

.fs-handle span {
  width: 44px;
  height: 5px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.35);
}

.fs-from {
  text-align: center;
  font-size: 0.66rem;
  letter-spacing: 2.5px;
  color: rgba(255, 255, 255, 0.55);
  margin-bottom: 8px;
  flex-shrink: 0;
}

/* 封面/歌词区：占据全部剩余空间并居中，消除底部空洞 */
.fs-cover-zone {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

/* 封面：显式尺寸恒定盒子——小图源/高清源都不跳变，原地换图无闪烁 */
/* 封面盒子：尺寸在盒子（居中），img 填满；投影在下方随倾斜位移 */
.fs-cover-box {
  position: relative;
  width: min(62%, 250px);
  aspect-ratio: 1 / 1;
  margin: 0 auto;
  transition: width 300ms ease;
}

.fs-cover-inner {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 16px;
  overflow: hidden;
  isolation: isolate;
  transform-style: preserve-3d;
}

.fs-cover {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 16px;
  box-shadow: 0 26px 60px rgba(0, 0, 0, 0.55);
}

.fs-shine {
  position: absolute;
  inset: 0;
  z-index: 30;
  pointer-events: none;
  mix-blend-mode: overlay;
  border-radius: inherit;
  transition: opacity 240ms ease-out;
}

.fs-cover-shadow {
  position: absolute;
  top: calc(100% + 8px);
  left: 10%;
  width: 80%;
  height: 14%;
  border-radius: 50%;
  background: radial-gradient(
    ellipse at center,
    rgba(0, 0, 0, 0.5) 0%,
    rgba(0, 0, 0, 0.2) 45%,
    transparent 80%
  );
  filter: blur(12px);
  pointer-events: none;
  z-index: 5;
  transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}

.fs-cover-ph {
  display: grid;
  place-items: center;
  background:
    radial-gradient(120% 100% at 50% 0%, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 60%),
    rgba(10, 12, 20, 0.55);
}

.fs-cover-ph :deep(svg),
.fs-cover-ph :deep(img) {
  opacity: 0.9;
  filter: drop-shadow(0 8px 24px rgba(0, 0, 0, 0.45));
}

.fs-lrc {
  position: relative; /* offsetTop 以本容器为基准，当前句居中定位才准 */
  align-self: stretch;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  /* 关闭滚动锚定：行高亮切换会改变行高，锚定补偿会把跟随位置越拖越远 */
  overflow-anchor: none;
  padding: 30px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;
  /* 上下淡出，Apple 歌词质感 */
  -webkit-mask-image: linear-gradient(transparent, #000 14%, #000 86%, transparent);
  mask-image: linear-gradient(transparent, #000 14%, #000 86%, transparent);
}

/* 上下弹性占位：任何一句（含首尾句）都能滚动到窗口正中 */
.fs-lrc::before,
.fs-lrc::after {
  content: "";
  flex: 0 0 auto;
  height: 45%;
}

.fs-lrc-line {
  font-size: 1.05rem;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.42);
  cursor: pointer;
  transition: color 0.25s ease, font-size 0.25s ease;
}

.fs-lrc-line.active {
  color: #fff;
  font-weight: 700;
  font-size: 1.22rem;
}

/* 手机端竖排：封面在歌词尚未滚动时四周太空。实测 390×844：封面只有 210px 宽
   （屏幕的 54%），且封面底到第一句歌词之间空了 186px——那是歌词区 45% 的居中
   占位叠上 30px 上内距。两头一起收：封面放大填满宽度，歌词区首句往上提，
   中间空当从 186px 压到 90px 左右。
   封面同时用 vh 兜底，矮屏手机不至于把歌词区挤到只剩两行。
   居中占位留 24%：后续句子仍能滚到正中，只有开头一两句会被顶到上限（属正常）。 */
@media (max-width: 979px) {
  .fs-cover-box {
    width: min(76%, 300px, 33vh);
  }

  .fs-lrc {
    padding: 16px 8px 20px;
  }

  .fs-lrc::before,
  .fs-lrc::after {
    height: 24%;
  }
}

.fs-info {
  flex-shrink: 0;
  margin-top: 16px;
}

.fs-titles {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

/* 歌名/歌手过长时的关键一环：.fs-title/.fs-artist 自己写了 nowrap+ellipsis，
   但外层这个 flex 子项没写 min-width:0 时，它的最小尺寸等于 nowrap 文本的整个宽度
   （实测超长歌名会撑到 1469px、冲出容器 1131px，省略号根本不生效、直接糊出屏幕）。
   给 flex:1 + min-width:0 让它可以被压缩，省略号才会出现。
   桌面端容器更宽，同一个规则自然就"放宽"了。 */
.fs-titles-l {
  flex: 1;
  min-width: 0;
}

.fs-title {
  font-size: 1.32rem;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fs-artist {
  font-size: 0.98rem;
  color: rgba(255, 255, 255, 0.62);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fs-lrc-btn {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.75);
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: background 0.25s ease;
}

.fs-lrc-btn.on {
  background: rgba(255, 255, 255, 0.3);
  color: #fff;
}

.fs-progress {
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.22);
  cursor: pointer;
  position: relative;
  flex: 1;
  min-width: 0;
}

.fs-progress .p-bar {
  height: 100%;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.85);
}

.fs-progress .p-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  position: absolute;
  top: 50%;
  /* 覆盖主卡 .p-thumb 的 margin 负值居中：这里用 translate 居中，叠加会上浮 */
  margin: 0;
  /* 默认藏起来（主卡的 scale(0) 会被上面的 translate 覆盖，所以要显式再乘一次），
     鼠标移到进度条上、准备拖拽时才浮现 */
  transform: translate(-50%, -50%) scale(0);
  transition: transform 0.18s ease, left 0.1s linear;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}

.fs-progress:hover .p-thumb {
  transform: translate(-50%, -50%) scale(1);
}

/* 移动端：当前时长 / 进度条 / 总时长，三者一行居中 */
.fs-prow {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.fs-ptime {
  flex: 0 0 auto;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.55);
  font-variant-numeric: tabular-nums;
}

/* 控制按钮（FluentPlayer 规格：填充图标 + 圆盘播放键） */
.fs-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 14px;
  flex-shrink: 0;
}

.fs-control-btn,
.fs-side-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: rgba(255, 255, 255, 0.72);
  cursor: pointer;
  transition: background 0.18s ease, transform 0.1s ease, color 0.18s ease;
}

.fs-control-btn:hover,
.fs-side-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.fs-control-btn:active,
.fs-side-btn:active {
  transform: scale(0.95);
}

.fs-control-btn svg,
.fs-side-btn svg {
  width: 22px;
  height: 22px;
}

.fs-play-btn {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  cursor: pointer;
  transition: background 0.18s ease, transform 0.1s ease;
}

.fs-play-btn:hover {
  background: var(--accent1);
  color: #fff;
}

.fs-play-btn:active {
  transform: scale(0.95);
}

.fs-play-btn svg {
  width: 24px;
  height: 24px;
}


.fs-vol-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}

/* ── 桌面端全屏布局：左封面 右歌词/队列 ── */
.fs-close {
  display: none;
}

.fs-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.fs-cover-zone {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 0 10px;
}

.fs-side {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.fs-desktop .fs-handle,
.fs-desktop .fs-from,
.fs-desktop .fs-info,
.fs-desktop .fs-ptime {
  display: none;
}

.fs-close {
  display: none;
}

.fs-desktop .fs-close {
  display: block;
  position: absolute;
  top: 18px;
  left: 24px;
  width: auto;
  height: auto;
  padding: 6px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.38);
  cursor: pointer;
  transition: color 0.2s ease;
}

.fs-desktop .fs-close:hover {
  color: rgba(255, 255, 255, 0.85);
}

.fs-desktop .fs-sheet {
  max-width: none;
  padding: 24px 48px calc(40px + env(safe-area-inset-bottom));
}

.fs-desktop .fs-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.08fr);
  gap: 56px;
  align-items: stretch; /* 右栏高度约束在主区内，歌词不外溢压到进度条 */
}

.fs-desktop .fs-cover-zone {
  display: flex;
  align-items: center;
  justify-content: center;
}

.fs-desktop .fs-cover-box {
  /* FluentPlayer 同款封面尺寸公式 */
  --cover-size: min(clamp(180px, 38vw, 520px), clamp(220px, 45vh, 580px));
  width: var(--cover-size);
  aspect-ratio: 1 / 1;
}

.fs-desktop .fs-side {
  display: flex;
}

/* 桌面歌词：左对齐、当前句大字号（Apple 歌词版式） */
.fs-desktop .fs-lrc {
  align-items: flex-start;
  text-align: left;
  padding: 40px 12px 48px;
  margin-bottom: 18px;
}

.fs-desktop .fs-lrc-line {
  font-size: clamp(18px, 2.2vw, 34px);
  line-height: 1.6;
  font-weight: 600;
}

.fs-desktop .fs-lrc-line.active {
  color: #fff;
}

/* 桌面底部条：进度条在上，信息/控制/时间在下 */
.fs-desktop .fs-prow {
  margin-top: 0;
}

.fs-desktop .fs-progress .p-bar {
  background: var(--accent1);
}

.fs-desktop .fs-bottom {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  margin-top: 10px;
}

.fs-trackinfo {
  display: none;
}

.fs-desktop .fs-trackinfo {
  display: flex;
  flex-direction: column;
  gap: 2px;
  justify-self: start;
  min-width: 0;
  /* justify-self: start 让宽度走 fit-content，而 fit-content 的下限仍是 nowrap 文本的
     min-content 宽度——超长歌名会算出 1057px、溢出它 451px 的网格列并压到播放键上。
     max-width 兜住，省略号才顶得住。 */
  max-width: 100%;
}

.ft-name {
  color: #fff;
  font-weight: 600;
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ft-artist {
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.8rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fs-time {
  display: none;
}

.fs-desktop .fs-time {
  display: flex;
  gap: 12px;
  justify-self: end;
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
}

.fs-desktop .fs-controls {
  justify-self: center;
  align-self: center;
  gap: 26px;
  margin-top: 0; /* 移动端的 14px 边距会把控制栏压低造成与两侧信息不对齐 */
}

.fs-btn.on,
.fs-side-btn.on,
.fs-queuebtn.on {
  color: var(--accent1);
}

.fs-btn.on {
  color: var(--accent1);
}

/* 队列列表（桌面右侧 / 移动端封面视图） */
.fs-queue {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 8px;
}

.fs-q-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.2s ease;
  /* 同 .pl-item：全屏队列也是 410 行，离屏行不进布局；42px 是封面内容盒高度 */
  content-visibility: auto;
  contain-intrinsic-size: auto 42px;
}

.fs-q-row:hover {
  background: rgba(255, 255, 255, 0.08);
}

.fs-q-row.active {
  background: rgba(255, 255, 255, 0.14);
}

.fs-q-cov {
  width: 42px;
  height: 42px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}

.fs-q-ph {
  display: grid;
  place-items: center;
  color: rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.08);
}

.fs-q-meta {
  min-width: 0;
}

.fs-q-name {
  color: #fff;
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fs-q-row.active .fs-q-name {
  color: var(--accent1);
}

.fs-q-artist {
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.76rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 移动端全屏视图切换按钮 */
.fs-view-btns {
  display: flex;
  gap: 10px;
}

.fs-view-btn {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.75);
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: background 0.25s ease;
}

.fs-view-btn.on {
  background: rgba(255, 255, 255, 0.3);
  color: #fff;
}

/* 进出场：上滑淡入 */
.fs-enter-active,
.fs-leave-active {
  transition: opacity 0.35s ease, transform 0.35s ease;
}

.fs-enter-from,
.fs-leave-to {
  opacity: 0;
  transform: translateY(42px);
}
</style>
