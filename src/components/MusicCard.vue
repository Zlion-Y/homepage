<template>
  <div class="glass music" :style="{ &quot;--music-accent&quot;: musicAccent == null || musicAccent === &quot;&quot; ? undefined : (musicAccent) }">
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
              <button class="btn-fs" title="全屏播放" aria-label="全屏播放" @click="openFs">
                <Icon name="maximize" :size="16" />
              </button>
            </div>
          </div>
        <p class="artist" :title="track.artist">{{ track.artist || "未在播放" }}</p>
        <div class="time-vol">
          <span class="time">{{ fmt(currentTime) }} / {{ fmt(duration) }}</span>
          <div class="vol">
            <button class="btn-mute" title="音量" aria-label="音量" @click="toggleMute">
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
      <button class="btn-mode" :class="{ on: playMode !== 0 }" title="播放模式" aria-label="播放模式" @click="cycleMode">
        <Icon :name="modeIcon" :size="19" />
      </button>
      <button class="btn-skip" title="上一首" aria-label="上一首" @click="prev()">
        <Icon name="skip-back" :size="27" />
      </button>
      <button class="btn-play" :title="playing ? '暂停' : '播放'" :aria-label="playing ? '暂停' : '播放'" @click="togglePlay">
        <Icon :name="playing ? 'pause' : 'play'" :size="27" />
      </button>
      <button class="btn-skip" title="下一首" aria-label="下一首" @click="next()">
        <Icon name="skip-forward" :size="27" />
      </button>
      <button class="btn-drawer" :class="{ on: lrcOpen }" title="歌词" aria-label="歌词" @click="toggleLrc">
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
            :class="[
                { active: i === lrcIndex },
                { b1: Math.abs(i - lrcIndex) === 1 },
                { b2: Math.abs(i - lrcIndex) === 2 }
              ]"
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
      <!-- 被盖住的两层（主页 / 二级面板）的隐藏时机挂在 after-enter / before-leave 上：
           进场时播放层还是半透明带位移的，那一瞬间就把下层藏掉会看到"面板提前消失" -->
      <Transition name="fs" @after-enter="syncCovered" @before-leave="syncCovered">
        <div v-if="fsOpen" class="fs-player" :class="{ 'fs-desktop': fsDesktop, 'fs-immersive': fsImmersive }" @touchstart="fsSwipeStart" @touchmove="fsSwipeMove" @touchend="fsSwipeEnd" :style="{ &quot;--music-accent&quot;: musicAccent == null || musicAccent === &quot;&quot; ? undefined : (musicAccent) }">
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
              <button class="fs-close" data-tip="⤵ 退出全屏" aria-label="退出全屏" @click="closeFs">
                <Icon name="chevron-down" :size="22" />
              </button>
              <button class="fs-fullscreen" data-tip="⛶ 全屏" aria-label="全屏" @click="toggleFullscreen">
                <Icon name="maximize" :size="16" />
              </button>
              <div class="fs-handle" @click="closeFs" @touchstart="fsDragStart" @touchmove="fsDragMove" @touchend="fsDragEnd">
                <span></span>
              </div>
              <p class="fs-from">正在播放</p>

              <div class="fs-main">
                <!-- 封面（移动端在上方常驻；桌面端在左侧） -->
                <div class="fs-cover-zone" v-show="!(fsView === 'queue' && !fsDesktop)">
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
                  <div v-show="fsView === 'lyrics'" class="fs-lrc" :class="{ 'fs-lrc-scan': fsScan }" ref="fsLrcEl" @scroll="onFsLrcScroll">
                    <div
                      v-for="(line, i) in lyrics"
                      :key="i"
                      class="fs-lrc-line"
                      :class="[
                { active: i === lrcIndex },
                { b1: Math.abs(i - lrcIndex) === 1 },
                { b2: Math.abs(i - lrcIndex) === 2 }
              ]"
                      @click="seekTo(line.time)"
                    >
                      {{ line.text }}
                    </div>
                    <div v-if="!lyrics.length" class="lrc-empty">暂无歌词</div>
                  </div>
                  <!-- 随全屏一起建好（空闲渐进补齐），点列表只切显示：避免首次点开时的大重绘白条 -->
                  <div v-show="fsView === 'queue'" class="fs-queue" ref="fsQueueEl">
                  <div class="fs-q-head"><span class="fs-q-title">播放列表</span><span class="fs-q-count">{{ playlist.length }} 首</span></div>
                    <div
                      v-for="(t, i) in fsQRows"
                      :key="i"
                      class="fs-q-row"
                      :class="{ active: i === index }"
                      @click="fsPickQueue(i)"
                    >
                      <span class="fs-q-idx" :class="{ on: i === index }">
                        <svg v-if="i === index" viewBox="0 0 24 24" fill="currentColor"><path d="M8.3 5v14l11-7z"/></svg>
                        <template v-else>{{ i + 1 }}</template>
                      </span>
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
                  <button class="fs-side-btn" :title="fsModeTitle" :aria-label="fsModeTitle" @click="cycleMode">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path :d="fsModeIcon" /></svg>
                  </button>
                  <button class="fs-control-btn" title="上一首" aria-label="上一首" @click="prev()">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" /></svg>
                  </button>
                  <button class="fs-play-btn" :title="playing ? '暂停' : '播放'" :aria-label="playing ? '暂停' : '播放'" @click="togglePlay">
                    <svg v-if="playing" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                    <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M8.3 5v14l11-7z" /></svg>
                  </button>
                  <button class="fs-control-btn" title="下一首" aria-label="下一首" @click="next()">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
                  </button>
                  <button class="fs-side-btn" title="播放列表" aria-label="播放列表" @click="fsToggleView('queue')">
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
import { wallpaperUrl } from "@/utils/wallpaperBus";
import Icon from "@/components/Icon.vue";
import LogoBadge from "@/components/LogoBadge.vue";
import { musicBus } from "@/utils/musicBus";

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
const fsImmersive = ref(false); // 沉浸式歌词：隐藏封面/进度/底部控件，歌词整屏居中
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
  // 缓存 key 用歌曲 ID（拿不到时回退 url/name），避免同名不同曲（Live/伴奏版）串封面/主色
  const covKey = songIdOf(t) || t.url || t.name;
  const cached = fsCoverCache.get(covKey);
  if (cached) {
    fsCoverSrc.value = cached;
    resolveDominantColor(covKey, smallCover(cached), t); // 命中也需恢复主色
    syncBgShown();
    return;
  }

  // 批量详情已解析出官方直链（按歌曲 ID 精确匹配）：直接升到 1024，无需再按名字搜
  if (/music\.126\.net/.test(t.pic)) {
    const hd = neteasePic(t.pic, "1024y1024");
    fsCoverCache.set(covKey, hd);
    fsCoverSrc.value = hd;
    resolveDominantColor(covKey, neteasePic(hd, "64y64"), t); // 采样专用小图
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
      fsCoverCache.set(covKey, hd);
      if (track.value === t) {
        fsCoverSrc.value = hd;
        resolveDominantColor(covKey, smallCover(hd), t);
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
    resolveDominantColor(covKey, smallCover(base), t);
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
  fsImmersive.value = false; // 每次打开默认歌词视图
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

// E6 可访问性：Esc 关闭全屏（键盘退出，不依赖鼠标）
function onFsEsc(e) {
  if (e.key === "Escape" && fsOpen.value) closeFs();
}

// 全屏播放层整屏不透明（#0a0a0a + 整屏色洗），所以它盖住的主页与二级面板没必要继续合成。
// 播放层是 Teleport 到 body 的，因此隐藏那两层不会连带把播放层自己藏掉（规则见文件末尾的全局样式块）。
function syncCovered() {
  document.body.classList.toggle("fs-open", fsOpen.value);
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

async function resolveDominantColor(name, pic, t) {
  if (!pic) {
    if (track.value === t) fsDominant.value = null;
    return;
  }
  const cached = fsDominantCache.get(name);
  if (cached) {
    if (track.value === t) fsDominant.value = cached;
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
  if (!t || track.value === t) fsDominant.value = color; // 快速切歌时丢弃过期取色
}

// 主色可用化：饱和度提上来、亮度压到中间调，任何封面都成一块有存在感的底色
const fsWashStyle = computed(() => {
  const c = fsDominant.value;
  // 提取失败（跨域/加载失败）时也给一层中性底色，避免背景只剩深底显空。
  // 这一层原来是整屏 filter: saturate(1.1)（等于多一张全屏栅格 + 一个常驻合成层），
  // 现在把 ×1.1 直接烘焙进色值：26% → 29%、饱和度上限 0.62 → 0.68，视觉一致但不占滤镜。
  if (!c) return { background: "hsl(228 29% 19%)" };
  const sat = Math.min(0.68, Math.max(0.31, c.s * 1.5 * 1.1));
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

// 控件动态取色：从封面色提取强调色，绑到 --music-accent（小卡与全屏共用）。
// 无封面/提取失败时返回空串 → 模板里不设变量，CSS 回退 var(--music-accent, var(--accent1))。
const musicAccent = computed(() => {
  const c = fsDominant.value;
  if (!c) return "";
  const sat = Math.min(0.78, Math.max(0.35, c.s * 1.8));
  const lum = Math.min(0.66, Math.max(0.5, c.l));
  return `hsl(${c.h.toFixed(0)} ${(sat * 100).toFixed(0)}% ${(lum * 100).toFixed(0)}%)`;
});

// 当前站点壁纸：优先复用页面已加载的图（wallpaperBus 注入），其次配置的随机壁纸接口，最后本地图
function currentWallpaper() {
  return (
    wallpaperUrl.value || siteConfig.bgApi || `${import.meta.env.BASE_URL}images/background.jpg`
  );
}
// 全屏背景源：封面取 300，再由 .fs-bg-img 的 blur(44px) 糊开成氛围底色。
// ⚠️ 曾经为了省渲染把这里降到 32 并去掉那层模糊（「双线性放大本身就是模糊」）——已回退，别再这么做：
// 实测（node CDP 探针 + 逐进程 CPU 采样，开/关全屏各 12 个相位交替）证明带 44px 模糊与完全不模糊
// 的代价差在噪声内（1073 vs 1076 ms/s，轮间离散 ±40%）：这一层是**静态**层，只被光栅化一次就缓存成
// 纹理，每帧不做卷积。所以「降源图分辨率换性能」是纯粹的画质损失——1440 宽下 32px 源每个像素铺 45px，
// 网易那张家 32px 缩略图的压缩块会被一起放大成明显的方块。
const fsBgSrc = computed(() => {
  const src = fsCoverSrc.value;
  if (!src) return fsWallpaper.value;
  return neteasePic(src, "300y300");
});

// 小卡封面（56px 圆形）：300 足够，避免为小图解码 1024 大图
const cardCoverSrc = computed(() => neteasePic(track.value.pic || fsCoverSrc.value, "300y300"));

// 封面加载失败：退回占位（Logo）+ 壁纸兜底背景
function onFsCoverError() {
  const t = track.value;
  const covKey = songIdOf(t) || (t && t.url) || (t && t.name);
  // 删掉坏缓存，下次不再命中；回落播放列表自带封面（若有）
  if (covKey) fsCoverCache.delete(covKey);
  const base = t && t.pic ? hdCover(t.pic) : "";
  fsCoverSrc.value = base;
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
  if (!box || !fsHovering.value || siteConfig.cardTilt === false) return;
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
  if (siteConfig.cardTilt === false) return;
  if (window.matchMedia("(hover: none), (pointer: coarse)").matches) return;
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


// 平滑滚动 + 卡死回退：被遮挡窗口/后台标签里 Chromium 会冻结平滑动画，
// 500ms 后仍在原地就立即跳到目标位（真机亮屏时平滑正常生效）
let smoothToken = 0;
function smoothScrollTo(el, target, onDone) {
  const token = ++smoothToken;
  const from = el.scrollTop;
  const dur = 900;
  const t0 = performance.now();
  // 平滑减速缓动（无过冲回弹：只朝当前歌词方向平滑滚动到位）
  const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
  const step = (now) => {
    if (token !== smoothToken) return; // 被新滚动取代，避免动画叠加抖动
    const p = Math.min(1, (now - t0) / dur);
    el.scrollTop = from + (target - from) * easeOutCubic(p);
    if (p < 1) requestAnimationFrame(step);
    else if (onDone) onDone();
  };
  requestAnimationFrame(step);
}

// 全屏歌词跟随当前句（居中）
function fsLrcFollow(instant) {
  const el = fsLrcEl.value;
  if (!el || lrcIndex.value === -1) return;
  const line = el.children[lrcIndex.value];
  if (!line) return;
  // 沉浸模式高亮向上提一行：居中位置上移一行间距，当前句偏上，下方露出更多待唱句
  const rowSpan = line.offsetHeight + 16; // 行高 + gap(16px) = 一行间距
  const target = line.offsetTop - el.clientHeight / 2 + line.offsetHeight / 2 + (fsImmersive.value ? rowSpan : 0);
  // 一次跨越超过半屏（切歌 / 点击进度条跳段）直接到位：
  // 若仍走 900ms 平滑，会从旧位置追击新目标，造成"跳一下再滚回"的抖跳
  const far = Math.abs(target - el.scrollTop) > el.clientHeight * 0.5;
  if (instant || far) {
    fsProgramScrolling = true;
    el.scrollTo({ top: target, behavior: "auto" });
    scheduleFsProgramEnd();
  } else {
    fsProgramScrolling = true;
    smoothScrollTo(el, target, scheduleFsProgramEnd);
  }
}

watch(lrcIndex, () => {
  if (fsOpen.value && fsView.value === "lyrics" && !fsIsUserScrolling) fsLrcFollow(false);
});
watch(fsView, (v) => {
  if (v === "lyrics") nextTick(() => fsLrcFollow(true));
  else if (v === "queue") {
    nextTick(() => scrollQueueToActive());
  }
});
// 进入沉浸模式字号放大（1.05→1.5rem），所有行 offsetTop 变化，active 行会错位到"下面"；
// 立即重新定位，避免"跳到下面再滚回居中"。等一帧让字号变化完成布局（reflow）后再取 offsetTop。
watch(fsImmersive, (v) => {
  if (v && fsOpen.value && fsView.value === "lyrics") {
    requestAnimationFrame(() => fsLrcFollow(true));
  }
});



// ── 移动端横向滑动导航：左滑进沉浸式歌词，右滑返回 ──
let swX = null, swY = null, swDx = 0, swLock = false;
function fsSwipeStart(e) {
  if (fsDesktop.value) return;
  const t = e.touches[0];
  swX = t.clientX; swY = t.clientY; swDx = 0; swLock = false;
}
function fsSwipeMove(e) {
  if (fsDesktop.value || swX == null) return;
  const t = e.touches[0];
  const dx = t.clientX - swX;
  const dy = t.clientY - swY;
  if (!swLock) {
    // 横向主导锁为横滑；纵向主导（歌词滚动）重置原点，避免脏累加误判
    if (Math.abs(dx) > Math.abs(dy) + 12 && Math.abs(dx) > 8) swLock = true;
    else if (Math.abs(dy) > Math.abs(dx) + 12) { swX = t.clientX; swY = t.clientY; return; }
  }
  if (swLock) { e.preventDefault(); swDx = dx; }
}
function fsSwipeEnd(e) {
  if (fsDesktop.value || swX == null) return;
  const dx = swLock ? swDx : (e.changedTouches[0].clientX - swX);
  swX = swY = null; swLock = false;
  if (Math.abs(dx) < 55) return;
  if (dx < 0) fsImmersive.value = !fsImmersive.value; // 左滑切换沉浸
  else if (fsImmersive.value) fsImmersive.value = false; // 沉浸中右滑回歌词
  else closeFs(); // 普通视图右滑关闭全屏
}

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

// 播放列表容器进入视口（首次打开面板）时定位当前行：
// 二级面板默认 display:none，补齐完成的 onDone 定位时 offsetTop 读不到（=0），
// 列表停在顶部；等容器真正可见再补一次定位。
let plSeenObserver = null;
watch(plEl, (el) => {
  if (plSeenObserver || !el || !("IntersectionObserver" in window)) return;
  plSeenObserver = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      plSeenObserver.disconnect();
      plSeenObserver = null;
      nextTick(() => scrollPlaylistToActive());
    }
  }, { threshold: 0.01 });
  plSeenObserver.observe(el);
});

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

// 歌单到位后开始渐进上屏（空歌单时 limit 归零，拿到数据再从头补）
// 必须写在 plList / fsQList 声明之后：immediate 会在 setup 阶段同步调用 restart()，
// 写在声明前会撞上暂时性死区（dev 下整个渲染中断，面板直接打不开）
watch(
  () => playlist.value.length,
  () => {
    plList.restart();
    if (fsOpen.value && fsView.value === "queue") fsQList.restart();
  },
  { immediate: true }
);

let isUserScrolling = false;
let scrollTimeout = null;
// 全屏歌词用户滚动抑制（仿小卡方案）：用户上翻后暂停自动跟随，3s 后回正
let fsIsUserScrolling = false;
let fsScrollTimeout = null;
let fsProgramScrolling = false; // 程序滚动进行中：期间 scroll 事件不算用户滚动
let fsProgramEndTimer = 0;
function scheduleFsProgramEnd() {
  clearTimeout(fsProgramEndTimer);
  // scroll 事件在 scrollTop 变化后异步派发，延迟解除标志避免误判为用户滚动（取消模糊）
  fsProgramEndTimer = setTimeout(() => {
    fsProgramScrolling = false;
  }, 80);
}
const fsScan = ref(false); // 手动滚动期间取消歌词模糊，便于点行调整进度
// 移动端 timeupdate 稀疏（约 1Hz）导致高亮滞后/跳行，改用 rAF 高频驱动
let lrcRaf = 0;
function startLrcTicker() {
  if (lrcRaf) return;
  const tick = () => {
    const a = audioEl.value;
    if (a && !a.paused) updateLrcHighlight(a.currentTime || 0);
    lrcRaf = requestAnimationFrame(tick);
  };
  lrcRaf = requestAnimationFrame(tick);
}
function stopLrcTicker() {
  if (lrcRaf) {
    cancelAnimationFrame(lrcRaf);
    lrcRaf = 0;
  }
}

const track = computed(() => playlist.value[index.value] || { name: "音乐", artist: "未在播放" });
const pct = computed(() => (duration.value ? (currentTime.value / duration.value) * 100 : 0));
const coverSpinning = computed(() => playing.value);

// 切歌时始终解析官方高清封面（主卡小封面与全屏共用，面板关闭也在后台预取）
watch(track, () => {
  // resolveFsCover 切歌时后台解析（不打开全屏也会跑）：先立即按当前可用封面设一次，
  // 官方高清封面（非网易图走异步检索）解析到位后，MediaSession 再同步一次，与全屏用同一张
  syncMediaSession();
  resolveFsCover().then(() => syncMediaSession());
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
  const ctrls = [];
  const tryOne = async (api, i) => {
    const ctrl = new AbortController();
    ctrls.push(ctrl);
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
        id: item.id || "",
      }))
      .filter((t) => t.url);
    if (!tracks.length) throw new Error("no urls");
    return { tracks, i };
  };
  try {
    const { tracks, i } = await Promise.any(APIS.map((api, i) => tryOne(api, i)));
    winnerApi = i; // 只由真正胜出的源写入，避免慢源覆盖快源
    return tracks;
  } finally {
    ctrls.forEach((c) => c.abort()); // 胜出后取消其余源，不浪费带宽
  }
}

// 歌曲 ID → proxy 解析直链 / 官方歌曲详情批量换高清封面
// 优先级：音源返回的 id 字段 > URL ?id= 参数 > 网易 CDN 直链路径中的文件名（即歌曲 ID）
function songIdOf(t) {
  if (!t) return "";
  if (t.id) return String(t.id);
  const u = t.url || "";
  let m = u.match(/[?&]id=(\d+)/);
  if (m) return m[1];
  // 网易 CDN 直链：…/YYYYMMDDHHMMSS/md5/SONGID.mp3（文件名即歌曲 ID）
  m = u.match(/\/(\d+)\.(mp3|m4a|flac|aac|wav|ogg)(\?|#|$)/i);
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
let lrcAbort = null; // 当前歌词请求的 AbortController，切歌时中止旧请求
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

  // 切歌时中止上一首还在飞的歌词请求，避免晚到的响应覆盖当前歌词
  if (lrcAbort) lrcAbort.abort();
  lrcAbort = new AbortController();
  const lrcTimer = setTimeout(() => lrcAbort && lrcAbort.abort(), 8000);
  fetch(t.lrc, { signal: lrcAbort.signal })
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
    .catch(() => { /* 被中止或失败：保持空歌词，不覆盖 */ })
    .finally(() => clearTimeout(lrcTimer));
}

// 后台预取下一首歌词，切歌时即刻可用
let prefetching = false;
function prefetchNextLyrics() {
  if (prefetching || playlist.value.length < 2) return;
  const next = playlist.value[(index.value + 1) % playlist.value.length];
  if (!next || !next.lrc || !/^(https?:)?\/\//.test(next.lrc)) return;
  const key = lrcCacheKey(next.lrc);
  if (lrcMem.has(key)) return;
  try {
    if (localStorage.getItem(key)) return;
  } catch {}
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

// ── 播放直链来源（config.musicSource）────────────────────────
//   meting（默认）：只走公共 Meting 接口，开箱即用。
//   proxy ：走本仓库自带的 serverless 解析（同源 /api/url，跟主页一起部署在 Vercel，
//           服务端跑洛雪音源脚本并校验直链真能播）——解析出的直链当第一顺位，
//           Meting 整条链排在后面；解析不到或直链播放失败就顺着降级链落到 Meting。
// 解析只返回直链，音频始终是浏览器直连 CDN。
let proxyWarned = false; // 解析失败只提示一次，避免每首歌都刷控制台
function proxyEnabled() {
  return siteConfig.musicSource === "proxy";
}

// 同一首歌的解析结果记一小会儿：换歌来回切时不用反复问（服务端本来也有 15 分钟 CDN 缓存）
const proxyMemo = new Map();
const PROXY_MEMO_MS = 10 * 60 * 1000;
const PROXY_FAIL_MS = 30 * 1000; // 负缓存：解析失败后短时间内不再重试

// 超时给 5 秒：函数冷启动时要装载全部音源脚本（实测约 1 秒）再解析，
// 3 秒会在冷启动那次超时、白白退回 Meting。解析发生在预载阶段，用户点播放前通常已就绪。
async function resolveProxyUrl(t, ms = 5000) {
  if (!proxyEnabled()) return "";
  const id = songIdOf(t);
  if (!id) return "";
  const hit = proxyMemo.get(id);
  if (hit) {
    const ttl = hit.fail ? PROXY_FAIL_MS : PROXY_MEMO_MS;
    if (Date.now() - hit.at < ttl) return hit.url; // 正缓存返直链，负缓存返空串
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const q = encodeURIComponent(siteConfig.musicQuality || "320k");
    const res = await fetch(`/api/url?id=${encodeURIComponent(id)}&source=wy&quality=${q}`, {
      signal: ctrl.signal,
    }).then((r) => r.json());
    // 部分音源返回 http 直链，https 页面下会被浏览器拦掉，统一升到 https
    const url = String((res && res.url) || "").replace(/^http:\/\//i, "https://");
    if (!url) throw new Error((res && (res.msg || res.error)) || "没有直链");
    proxyMemo.set(id, { url, at: Date.now() });
    return url;
  } catch (e) {
    // 静默退回 Meting 候选链，提示只打一次：多半是 /api/url 没部署成功或音源全失效
    if (!proxyWarned) {
      proxyWarned = true;
      console.warn("[music] 音源解析失败，已退回 Meting：", e && e.message, "（打开 /api/health 看音源装载情况）");
    }
    proxyMemo.set(id, { url: "", at: Date.now(), fail: true });
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
// 预载的下一首「已知可用」源：切歌命中时直接复用，跳过竞速探活（减少静音空档）
let prefetchMemo = null; // { index, url, at }
let prefetchOn = false;
let trackUrlIdx = 0;
let errorSkipTimer = null;
let loadTimer = null; // 看门狗：源挂起（不报错也不出声）时强制走降级链

// 连续整曲「全部源都失败」的计数：超过阈值就不再自动无限跳歌，
// 明确提示并暂停等用户手动重试（整份歌单都是死链时避免无限循环）
const MAX_CONSECUTIVE_SKIPS = 3;
let consecutiveSkips = 0;

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
    consecutiveSkips = 0;
    prefetchNextTrack();
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

async function playWithProbe(cands, ver) {
  const winner = await new Promise((resolve) => {
    let done = false;
    let bail = null;
    const finish = (u) => {
      if (done) return;
      done = true;
      clearTimeout(bail);
      resolve(u);
    };
    cands.forEach((u) => probeAudio(u, 4000).then((ok) => ok && finish(u)));
    bail = setTimeout(() => finish(null), 4100);
  });
  if (ver !== loadVersion || !wantPlay) return; // 已切歌或用户已暂停（探活期间点暂停）
  if (winner) {
    trackUrls = [winner, ...cands.filter((u) => u !== winner)];
    trackUrlIdx = 0;
  }
  playCurrentUrl(true, ver);
}

function prefetchWinnerFor(i) {
  if (prefetchMemo && prefetchMemo.index === i && Date.now() - prefetchMemo.at < 5 * 60 * 1000) {
    return prefetchMemo.url;
  }
  return "";
}
// 后台探活下一首（顺序模式的下一曲）候选源：切歌时命中 direct 复用，减少静音空档
function prefetchNextTrack() {
  const n = playlist.value.length;
  // 随机模式下下一首不可预知，预取命中率≈1/n 纯耗流量，跳过
  if (prefetchOn || n < 2 || playMode.value === 2) return;
  const idx = (index.value + 1) % n;
  if (prefetchMemo && prefetchMemo.index === idx && Date.now() - prefetchMemo.at < 5 * 60 * 1000) return;
  const nt = playlist.value[idx];
  const cands = nt ? metingCandidates(nt).slice(0, 3) : [];
  if (!cands.length) return;
  prefetchOn = true;
  Promise.any(cands.map((u) => probeAudio(u, 4000).then((ok) => (ok ? u : Promise.reject()))))
    .then((url) => { prefetchMemo = { index: idx, url, at: Date.now() }; })
    .catch(() => {}) // 下一首全部失败：保持原降级链即可
    .finally(() => (prefetchOn = false));
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

  // Meting 候选链：歌单竞速的胜出源优先（当前网络下它最可达），其余源殿后。
  // 代理模式下它同时扮演两个角色——代理没结果时的兜底，以及代理直链失效后的降级链。
  const meting = metingCandidates(t);

  loadLyrics(t);
  prefetchNextLyrics();
  // 顺手把下一首的直链也解析掉（延迟一点发起，别和当前这首抢）：切歌时不必再等冷启动
  if (proxyEnabled()) {
    const nx = playlist.value[(i + 1) % playlist.value.length];
    if (nx && nx !== t) {
      setTimeout(() => {
        if (proxyEnabled()) resolveProxyUrl(nx, 6000);
      }, 1500);
    }
  }
  coverLoaded.value = false;
  syncBgShown();
  currentTime.value = 0;
  duration.value = 0;

  // race=true：多个候选用探针竞速挑最快的（Meting 那条链内部这么用）；
  // race=false：直接播第一顺位（代理直链已经服务端校验过，不需要也不应该再和 Meting 抢）
  const begin = (list, race = true) => {
    if (ver !== loadVersion) return; // 解析期间已切歌
    trackUrls = list;
    trackUrlIdx = 0;
    if (!autoPlay) playCurrentUrl(false, ver);
    else if (race) playWithProbe(list.slice(), ver);
    else playCurrentUrl(true, ver);
  };

  if (!proxyEnabled()) {
    // 只走 Meting：完全不碰代理，候选链内部竞速
    const pw = prefetchWinnerFor(i);
    begin(pw ? [pw, ...meting.filter((u) => u !== pw)] : meting, !pw);
    return;
  }
  // 代理优先：等代理解析出直链，**拿到就直接播**，不把 Meting 拉进来一起竞速——
  // Meting 对 VIP 曲返回的"能播的 30 秒试听片段"会抢下竞速、让完整直链永远用不上。
  // Meting 整条链只作为降级：代理直链播放失败（error/看门狗）时，降级链才轮到它，
  // 也就是说「解析出的直链全部失效」之后才会切回 Meting。
  resolveProxyUrl(t).then((u) => {
    if (!u) {
      begin(meting); // 压根没解析到（超时/音源全失败）→ 直接走 Meting
      return;
    }
    begin([u, ...meting.filter((x) => x !== u)], false);
  });
}

// 按 Meting 接口拼候选链（主源 + 各备源的单曲解析）
function metingCandidates(t) {
  const out = [t.url];
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
      if (!out.includes(fu)) out.push(fu);
    });
  }
  return out.filter(Boolean);
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
    lastErrAt = 0; // 换新源，去重计时清零，避免新源快速报错被吞
    playCurrentUrl(true, ver);
  } else {
    playing.value = false;
    consecutiveSkips++;
    if (consecutiveSkips >= MAX_CONSECUTIVE_SKIPS) {
      showErrTip("连续多首无法播放，已暂停自动切歌（可能网络异常或歌单失效），请点下一首重试", 0);
      return;
    }
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
function showErrTip(msg, ms = 2600) {
  errTip.value = msg;
  if (errTipTimer) clearTimeout(errTipTimer);
  if (errorSkipTimer) clearTimeout(errorSkipTimer);
  clearLoadTimer();
  if (!ms) return; // ms=0：常驻提示，不自动清除
  errTipTimer = setTimeout(() => (errTip.value = ""), ms);
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
      audio.play().catch(() => {
        // 重播失败（源已失效）：走降级链换下一首
        onAudioError();
      });
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
  if (audio.duration) {
    clearLoadTimer();
    consecutiveSkips = 0; // 源活着 = 播放健康，连续失败清零
  }
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

// 全屏歌词：用户手动滚动后暂停自动跟随 3 秒，再回正到当前句
function onFsLrcScroll() {
  if (fsProgramScrolling) return; // 程序滚动（切词跟随/回正）期间的 scroll 不算用户滚动
  fsIsUserScrolling = true;
  fsScan.value = true; // 取消歌词模糊，能看清其他行再点击调整进度
  clearTimeout(fsScrollTimeout);
  fsScrollTimeout = setTimeout(() => {
    fsIsUserScrolling = false;
    fsScan.value = false;
    if (fsOpen.value && fsView.value === "lyrics" && lrcIndex.value !== -1) fsLrcFollow(false);
  }, 3000);
}

onMounted(async () => {
  musicBus.register({ togglePlay, openFs });
  window.addEventListener("keydown", onFsEsc);
  bindMediaSession();
  watch(playing, (v) => {
    musicBus.syncPlaying(v);
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = v ? "playing" : "paused";
    // rAF 高频驱动歌词高亮：timeupdate 在手机上稀疏（约 1Hz），会滞后/跳行
    if (v) startLrcTicker();
    else stopLrcTicker();
  }, { immediate: true });
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

// ── MediaSession 系统媒体控制（锁屏/通知栏）：封面、歌名、上一首/下一首/进度┅┅
function bindMediaSession() {
  if (!("mediaSession" in navigator)) return;
  try {
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => togglePlay());
    ms.setActionHandler("pause", () => togglePlay());
    ms.setActionHandler("previoustrack", () => prev());
    ms.setActionHandler("nexttrack", () => next(false));
    ms.setActionHandler("seekto", (d) => {
      const a = audioEl.value;
      if (a && d && d.seekTime != null) a.currentTime = d.seekTime;
    });
  } catch {
    // 不支持的动作或被禁用时静默跳过
  }
}

function syncMediaSession() {
  if (!("mediaSession" in navigator)) return;
  const t = track.value;
  const cover = t && t.pic ? (fsCoverSrc.value || hdCover(t.pic)) : "";
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: (t && t.name) || "音乐",
      artist: (t && t.artist) || "",
      album: "",
      artwork: cover ? [{ src: cover, sizes: "512x512", type: "image/jpeg" }] : [],
    });
  } catch {
    // 某些环境不支持 MediaMetadata / artwork，忽略
  }
}
// 电脑全屏：进入/退出浏览器的原生全屏（夹头式）。带 webkit 前缀兼容 Safari
function toggleFullscreen() {
  const docEl = document.documentElement;
  if (!document.fullscreenElement) {
    const req = (docEl.requestFullscreen && docEl.requestFullscreen.bind(docEl)) || (docEl.webkitRequestFullscreen && docEl.webkitRequestFullscreen.bind(docEl));
    req && req();
  } else {
    const exit = (document.exitFullscreen && document.exitFullscreen.bind(document)) || (document.webkitExitFullscreen && document.webkitExitFullscreen.bind(document));
    exit && exit();
  }
}

function failedLoad() {
  playlist.value = [];
}

onUnmounted(() => {
  stopLrcTicker();
  musicBus.unregister();
  window.removeEventListener("keydown", onFsEsc);
  audioEl.value?.pause();
  plList.stop();
  fsQList.stop();
  if (plSeenObserver) {
    plSeenObserver.disconnect();
    plSeenObserver = null;
  }
  if (lrcAbort) lrcAbort.abort();
  clearLoadTimer();
  if (errorSkipTimer) clearTimeout(errorSkipTimer);
  clearTimeout(scrollTimeout);
  if (fsScrollTimeout) clearTimeout(fsScrollTimeout);
  if (errTipTimer) clearTimeout(errTipTimer);
  if (fsOpen.value) document.body.style.overflow = fsPrevBodyOverflow;
  document.body.classList.remove("fs-open");
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
  color: var(--music-accent, var(--accent1));
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
  color: var(--music-accent, var(--accent1));
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
  color: var(--music-accent, var(--accent1));
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
  color: var(--music-accent, var(--accent1));
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
  background: var(--music-accent, var(--accent1));
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
  background: var(--music-accent, var(--accent1));
  transition: width 0.1s linear;
}

.p-thumb {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  margin: -6px 0 0 -6px;
  border-radius: 50%;
  background: var(--music-accent, var(--accent1));
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
  /* 进度条左右各留 4px（见 .progress 的 margin），而按钮自带 8px padding ——
     容器反向缩 4px，最左/最右按钮的图标边缘就正好落在进度条两端。 */
  margin: 0 -4px;
  padding: 0;
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
  color: var(--music-accent, var(--accent1));
}

.btn-mode.on,
.btn-drawer.on {
  color: var(--music-accent, var(--accent1));
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
  color: var(--music-accent, var(--accent1));
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-play:hover {
  filter: brightness(1.15);
}

.btn-play.playing {
  background: var(--music-accent, var(--accent1));
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
  opacity: 0.55;
  transition: opacity 0.9s ease, color 0.3s ease, font-size 0.3s ease;
}

.lrc-line.b1 {
  opacity: 0.75;
}

.lrc-line.b2 {
  opacity: 0.62;
}

.lrc-line:hover {
  color: var(--music-accent, var(--accent1));
}

.lrc-line.active {
  color: rgba(255, 255, 255, 0.74);
  font-weight: 700;
  font-size: 0.95rem;
  opacity: 1;
}

/* 鼠标移入歌词区：取消其他行的模糊，方便预览/点歌。仅限支持 hover 的设备，避免触屏粘滞 */
@media (hover: hover) {
  .lrc-container:hover .lrc-line {
    opacity: 1;
  }
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
  color: var(--music-accent, var(--accent1));
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
  color: var(--music-accent, var(--accent1));
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
  background: var(--music-accent, var(--accent1));
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
  /* 这里原来还有 filter: saturate(1.1)——整屏滤镜，等价一张全屏栅格 + 常驻合成层。
     饱和度已经烘焙进 fsWashStyle 的色值里（见脚本注释），视觉一致，但省掉这层滤镜。 */
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
  /* 关键：这一层是静态的，will-change 让它被提升为独立层、只栅格化一次后缓存成纹理，
     之后每帧只做变换/合成，不做卷积。实测「带这层 44px 模糊」与「完全不模糊」的渲染进程
     CPU 时间差在噪声内，所以这里的模糊不要为了性能去动它（动了就是白丢画质）。 */
  will-change: transform;
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

.fs-lrc::-webkit-scrollbar {
  display: none;
}
.fs-lrc { scrollbar-width: none; }

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
  opacity: 0.5;
  transition: opacity 0.9s ease, color 0.25s ease, font-size 0.25s ease;
}

.fs-lrc-line.b1 {
  opacity: 0.72;
}

.fs-lrc-line.b2 {
  opacity: 0.55;
}

.fs-lrc-line.active {
  color: rgba(255, 255, 255, 0.9);
  font-weight: 700;
  /* 不再放大字号：字号突变改变行高造成 layout shift，滚动时"跳一下再滚回"；
     与桌面端一致，用提亮 + 加粗区分，行高稳定 */
  opacity: 1;
}

/* 手动滚动（触屏）期间：提亮所有歌词，便于看清并点击调整进度；3s 回正后移除 */
.fs-lrc-scan .fs-lrc-line {
  opacity: 1;
}

/* 沉浸式歌词（移动端左滑进入）：
   - 隐藏整屏大封面、进度条、底部控件
   - 顶部歌曲信息保留，歌词区纵向拉满整屏居中
   - 歌曲信息上移到顶部（flex order 调整），歌词使用最大字号 */
.fs-player.fs-immersive .fs-cover-zone,
.fs-player.fs-immersive .fs-prow,
.fs-player.fs-immersive .fs-bottom,
.fs-player.fs-immersive .fs-close,
.fs-player.fs-immersive .fs-fullscreen {
  display: none;
}
.fs-player.fs-immersive .fs-main {
  order: 2;
}
.fs-player.fs-immersive .fs-side {
  order: 1;
  flex: 1;
}
.fs-player.fs-immersive .fs-lrc-line {
  font-size: 1.5rem;
}
.fs-player.fs-immersive .fs-lrc-line.active {
  color: rgba(255, 255, 255, 0.95);
}

/* 鼠标移入全屏歌词区的 hover 覆盖规则移到文件后段（.fs-desktop 歌词规则之后）——
   两者特异度相同(0,3,0)、靠源码顺序决胜，放这里会被相邻句的模糊盖掉。见下方同名规则注释。 */

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
  /* 固定宽度：移动端操作控件靠这个常量与进度条精确对齐（时间宽度会随 0:37 / 10:37 抖动） */
  min-width: 40px;
  text-align: center;
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
  background: var(--music-accent, var(--accent1));
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
.fs-fullscreen {
  display: none;
}

.fs-desktop .fs-fullscreen {
  display: grid;
  place-items: center;
  position: absolute;
  top: 18px;
  right: 24px;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: rgba(255, 255, 255, 0.38);
  cursor: pointer;
  transition: color 0.2s ease, background 0.2s ease;
}

.fs-desktop .fs-fullscreen:hover {
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
  /* 桌面端保留模糊层次（移动端已去模糊，这里单独补回） */
  filter: blur(4px);
  opacity: 0.5;
}

.fs-desktop .fs-lrc-line.b1 {
  filter: blur(1.5px);
  opacity: 0.72;
}

.fs-desktop .fs-lrc-line.b2 {
  filter: blur(2.8px);
  opacity: 0.55;
}

.fs-desktop .fs-lrc-line.active {
  color: #fff;
  filter: none;
  opacity: 1;
}

/* 鼠标移入全屏歌词区：取消其他行的模糊，方便预览/点歌。
   仅限真正支持 hover 的设备：触屏上点击会让 :hover 粘住不掉，
   若不加限定会把这些行的模糊/强调态全取消，移动端“模糊丢失”。
   ⚠️ 只能放在上面 .fs-desktop .fs-lrc-line.b1/.b2 之后：
   原来写在沉浸式那段（文件前部）时，两个选择器特异度都是 (0,3,0)，
   后者靠源码顺序胜出 → hover 后当前句的 ±1/±2 相邻句仍保留
   blur(1.5px)/blur(2.8px)，看起来"有几行没掉模糊"。
   这里同时保留无前缀版本（覆写靠顺序）和 .fs-desktop 前缀版本（特异度更高，双保险）。 */
@media (hover: hover) {
  .fs-lrc:hover .fs-lrc-line,
  .fs-desktop .fs-lrc:hover .fs-lrc-line {
    filter: none;
    opacity: 1;
  }
}

/* 桌面底部条：进度条在上，信息/控制/时间在下 */
.fs-desktop .fs-prow {
  margin-top: 0;
}

.fs-desktop .fs-progress .p-bar {
  background: var(--music-accent, var(--accent1));
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
  color: var(--music-accent, var(--accent1));
}

.fs-btn.on {
  color: var(--music-accent, var(--accent1));
}

/* 队列列表（桌面右侧 / 移动端封面视图） */
.fs-q-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 4px 2px 0;
}
.fs-q-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: #fff;
}
.fs-q-count {
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.45);
}
.fs-q-idx {
  width: 22px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  font-size: 0.76rem;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.4);
}
.fs-q-idx svg {
  width: 14px;
  height: 14px;
}
.fs-q-idx.on {
  color: var(--music-accent, var(--accent1));
}
.fs-queue {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 8px;
}

.fs-queue::-webkit-scrollbar {
  width: 4px;
}

.fs-queue::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 99px;
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
  position: relative;
  background: rgba(255, 255, 255, 0.16);
}
.fs-q-row.active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 58%;
  border-radius: 99px;
  background: var(--music-accent, var(--accent1));
}

.fs-q-cov {
  width: 46px;
  height: 46px;
  border-radius: 10px;
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
  color: var(--music-accent, var(--accent1));
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

/* ── 移动端覆盖 ──
   必须写在样式表**末尾**：与基础规则同优先级，靠后写者生效；
   放进前面的媒体查询里会被后面定义的基础规则盖掉（这一点实测踩过）。 */
@media (max-width: 979px) {
  /* 手机的播放键大一点才好按（桌面保持 FluentPlayer 的 42px 规格） */
  .fs-play-btn {
    width: 56px;
    height: 56px;
  }

  .fs-play-btn svg {
    width: 30px;
    height: 30px;
  }

  /* 按钮行拉开：两端与进度条那一行的左右边缘（两侧时间的边缘）竖向对齐，
     而不是只在中间挤成一团。按钮 34px 装 24px 图标、图标自带 5px 内缩，
     所以容器反向缩 5px，两端图标的边缘才真正落在时间边缘上。 */
  .fs-controls {
    margin: 28px -5px 0; /* 上间距 28px：原来 14px 挨着进度条太近 */
    justify-content: space-between;
    gap: 0;
  }
}
</style>

<!-- 全局（非 scoped）：全屏播放期间把被盖住的两层停画。
     播放层是 Teleport 到 body 的（在 .more 之外），所以隐藏这两层不会把播放层自己藏掉。
     用 visibility 而不是 display:none —— 保留布局与里面正在播的 <audio>，只是不参与绘制；
     也避免 display:none 触发的重排/重栅格。类名由 MusicCard 的 syncCovered() 挂到 body 上。 -->
<style>
body.fs-open .page,
body.fs-open .more {
  visibility: hidden;
}
</style>
