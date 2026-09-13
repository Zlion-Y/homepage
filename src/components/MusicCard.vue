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
            v-show="coverLoaded"
            class="cover-img"
            :class="{ spinning: coverSpinning }"
            :src="fsCoverSrc || hdCover(track.pic)"
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
              <button class="btn-lrc" :class="{ on: lrcOpen }" title="歌词" @click="toggleLrc">
                <Icon name="subtitles" :size="18" />
              </button>
              <button class="btn-fs" title="全屏播放" @click="openFs">
                <Icon name="maximize" :size="16" />
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
      <button class="btn-drawer" :class="{ on: plOpen }" title="播放列表" @click="togglePlaylistDrawer">
        <Icon name="playlist" :size="19" />
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
            v-for="(t, i) in playlist"
            :key="i"
            class="pl-item"
            :class="{ active: i === index }"
            @click="playIndex(i)"
          >
            <div class="pi-cover">
              <img v-if="t.pic" :src="t.pic" loading="lazy" alt="" />
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

    <!-- 全屏播放层（Apple Music 风格）：Teleport 到 body，避免卡片 tilt transform 困住 fixed 定位 -->
    <Teleport to="body">
      <Transition name="fs">
        <div v-if="fsOpen" class="fs-player">
          <div class="fs-bg-wrap">
            <img
              v-if="fsCoverSrc"
              class="fs-bg-img"
              :class="{ show: bgShown }"
              :src="fsCoverSrc"
              alt=""
              @load="bgShown = true"
            />
          </div>
          <div class="fs-shade"></div>
          <div class="fs-sheet" ref="fsSheet">
            <div class="fs-handle" @click="closeFs" @touchstart="fsDragStart" @touchmove="fsDragMove" @touchend="fsDragEnd">
              <span></span>
            </div>
            <p class="fs-from">正在播放</p>

            <div class="fs-cover-zone">
              <img
                v-if="!fsLrcOpen && fsCoverSrc"
                class="fs-cover"
                :src="fsCoverSrc"
                alt=""
              />
              <div v-else-if="!fsLrcOpen" class="fs-cover fs-cover-ph">
                <Icon name="music" :size="64" />
              </div>
              <div v-show="fsLrcOpen" class="fs-lrc" ref="fsLrcEl">
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
            </div>

            <div class="fs-info">
              <div class="fs-titles">
                <div class="fs-titles-l">
                  <h3 class="fs-title">{{ track.name || "音乐" }}</h3>
                  <p class="fs-artist">{{ track.artist || "未在播放" }}</p>
                </div>
                <button class="fs-lrc-btn" :class="{ on: fsLrcOpen }" title="歌词" @click="toggleFsLrc">
                  <Icon name="subtitles" :size="18" />
                </button>
              </div>
              <div class="fs-progress" @click="seek">
                <div class="p-bar" :style="{ width: pct + '%' }"></div>
                <div class="p-thumb" :style="{ left: pct + '%' }"></div>
              </div>
              <div class="fs-times">
                <span>{{ fmt(currentTime) }}</span>
                <span>-{{ fmt(Math.max(0, duration - currentTime)) }}</span>
              </div>
            </div>

            <div class="fs-controls">
              <button class="fs-btn" title="上一首" @click="prev()">
                <Icon name="skip-back" :size="32" />
              </button>
              <button class="fs-btn fs-play" :title="playing ? '暂停' : '播放'" @click="togglePlay">
                <Icon :name="playing ? 'pause' : 'play'" :size="44" />
              </button>
              <button class="fs-btn" title="下一首" @click="next()">
                <Icon name="skip-forward" :size="32" />
              </button>
            </div>

            <div class="fs-volume">
              <div class="fs-vol-track" @click="setVol">
                <div class="fs-vol-fill" :style="{ width: (isMuted ? 0 : volume * 100) + '%' }"></div>
                <div class="fs-vol-thumb" :style="{ left: (isMuted ? 0 : volume * 100) + '%' }"></div>
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
const playMode = ref(0); // 0 列表循环 1 单曲 2 随机
const volume = ref(1);
const isMuted = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const lyrics = ref([]);
const lrcIndex = ref(-1);
const coverLoaded = ref(false);

const lrcOpen = ref(false);
const plOpen = ref(true); // 播放列表默认展开（手机端有 230px 封顶内滚，不会撑长卡片）
const errTip = ref(""); // 播放失败提示（整曲所有源失败时短暂显示）

// 全屏播放层
const fsOpen = ref(false);
const fsLrcOpen = ref(false);
const fsLrcEl = ref(null);
const fsSheet = ref(null);
const fsCoverSrc = ref("");
const bgShown = ref(false); // 背景大图首次加载完成后淡入（此后原地换图不闪）
let fsPrevBodyOverflow = "";
// 官方封面解析缓存（会话内）：歌名 → 官方 picUrl，切回听过的歌不再重复请求
const fsCoverCache = new Map();

async function resolveFsCover() {
  const t = track.value;
  if (!t || !t.pic) {
    fsCoverSrc.value = "";
    return;
  }
  // 封面只走网易云官方接口（不使用 Meting 封面代理）；
  // 切歌时保留当前封面不重置，官方解析成功原地替换（缓存命中秒切，全程无闪烁）
  const cached = fsCoverCache.get(t.name);
  if (cached) {
    fsCoverSrc.value = cached;
    return;
  }

  try {
    const q = encodeURIComponent((t.name || "").trim());
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 8000);
    const search = await fetch(`/netease-search?s=${q}&type=1&limit=3`, { signal: ctrl.signal }).then((r) => r.json());
    const albumId = search?.result?.songs?.[0]?.album?.id;
    if (!albumId) return;
    const ctrl2 = new AbortController();
    setTimeout(() => ctrl2.abort(), 8000);
    const detail = await fetch(`/netease-album/${albumId}`, { signal: ctrl2.signal }).then((r) => r.json());
    const pic = detail?.album?.picUrl;
    if (pic) {
      const hd = pic.replace(/^http:\/\//i, "https://") + "?param=1024y1024";
      fsCoverCache.set(t.name, hd);
      // 歌曲未再变化时才替换，避免慢响应覆盖新歌的封面
      if (track.value === t) fsCoverSrc.value = hd;
    }
  } catch {
    // 官方接口失败：回落播放列表自带封面
    fsCoverSrc.value = hdCover(t.pic);
  }
}

function openFs() {
  fsOpen.value = true;
  fsPrevBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden"; // 全屏期间锁背景滚动
  resolveFsCover();
  nextTick(() => {
    if (fsLrcOpen.value) fsLrcFollow(true);
  });
}

function closeFs() {
  fsOpen.value = false;
  fsLrcOpen.value = false;
  document.body.style.overflow = fsPrevBodyOverflow;
}

function toggleFsLrc() {
  fsLrcOpen.value = !fsLrcOpen.value;
  if (fsLrcOpen.value) nextTick(() => fsLrcFollow(true));
}

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
  if (fsOpen.value && fsLrcOpen.value) fsLrcFollow(false);
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

// ── 歌单预载：页面一打开就开始拉，进二级面板时多半已就绪 ──
const playlistReady = (async () => {
  try {
    const cached = JSON.parse(localStorage.getItem("music_playlist_v2") || "null");
    if (cached && Date.now() - cached.ts < 6 * 60 * 60 * 1000 && cached.playlist.length) {
      return cached.playlist;
    }
  } catch {
    // 缓存解析失败则正常请求
  }
  try {
    const tracks = await fetchPlaylistAll();
    try {
      localStorage.setItem("music_playlist_v2", JSON.stringify({ ts: Date.now(), playlist: tracks }));
    } catch {
      // 存储失败不影响展示
    }
    return tracks;
  } catch {
    return []; // 页面刚打开时源全挂不算最终失败，开面板时还会重试
  }
})();

// ── Lyrics ───────────────────────────────────────────────
function loadLyrics(t) {
  lyrics.value = [];
  lrcIndex.value = -1;

  if (!t.lrc) return;

  const isLrcUrl = /^(https?:)?\/\//.test(t.lrc) || t.lrc.startsWith("/") || /\.(lrc|txt)(\?|#|$)/i.test(t.lrc);

  if (isLrcUrl) {
    fetch(t.lrc)
      .then((r) => r.text())
      .then((text) => {
        // 已切歌则丢弃过期歌词
        if (playlist.value[index.value] !== t) return;
        lyrics.value = parseLRC(text);
      })
      .catch(() => (lyrics.value = []));
  } else {
    lyrics.value = parseLRC(t.lrc);
  }
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

async function playWithProbe(cands, ver) {
  const winner = await new Promise((resolve) => {
    let done = false;
    const finish = (u) => {
      if (!done) {
        done = true;
        resolve(u);
      }
    };
    cands.forEach((u) => probeAudio(u, 4000).then((ok) => ok && finish(u)));
    setTimeout(() => finish(null), 4100);
  });
  if (ver !== loadVersion || !wantPlay) return; // 已切歌或用户已暂停（探活期间点暂停）
  if (winner) {
    trackUrls = [winner, ...cands.filter((u) => u !== winner)];
    trackUrlIdx = 0;
  }
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

  loadLyrics(t);
  coverLoaded.value = false;
  currentTime.value = 0;
  duration.value = 0;
  if (autoPlay) {
    playWithProbe(trackUrls.slice(), ver);
  } else {
    playCurrentUrl(false, ver);
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
  }
}

function togglePlaylistDrawer() {
  plOpen.value = !plOpen.value;
  if (plOpen.value) lrcOpen.value = false;
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
          "music_playlist_v2",
          JSON.stringify({ ts: Date.now(), playlist: playlist.value })
        );
      } catch {
        // 存储失败不影响展示
      }
    }
    if (playlist.value.length) {
      // 预载第一首（不自动播），点播放立即出声
      loadAndPlay(0, false);
    } else {
      failedLoad();
    }
  } catch {
    failedLoad();
  }
  loading.value = false;
});

function failedLoad() {
  playlist.value = [];
}

onUnmounted(() => {
  audioEl.value?.pause();
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
  background: radial-gradient(120% 90% at 50% 0%, #1c2333 0%, #0a0e1a 70%);
}

/* 背景：封面大图模糊铺满，加载完成后淡入（切歌时交叉呼吸感） */
.fs-bg-wrap {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.fs-bg-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scale(1.15);
  filter: blur(52px) saturate(1.6) brightness(0.66);
  opacity: 0;
  transition: opacity 0.8s ease;
}

.fs-bg-img.show {
  opacity: 1;
}


.fs-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(rgba(10, 14, 26, 0.2), rgba(10, 14, 26, 0.5));
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
.fs-cover {
  width: min(78%, 330px);
  aspect-ratio: 1 / 1;
  object-fit: cover;
  max-height: 100%;
  border-radius: 12px;
  box-shadow: 0 26px 60px rgba(0, 0, 0, 0.55);
}

.fs-cover-ph {
  display: grid;
  place-items: center;
  color: rgba(255, 255, 255, 0.45);
  background: rgba(255, 255, 255, 0.08);
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
  margin-top: 14px;
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
  transform: translate(-50%, -50%);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}

.fs-times {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.55);
  font-variant-numeric: tabular-nums;
}

.fs-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  margin-top: 14px;
  flex-shrink: 0;
}

.fs-btn {
  border: none;
  background: transparent;
  color: #fff;
  cursor: pointer;
  display: grid;
  place-items: center;
  padding: 8px;
  transition: opacity 0.2s ease;
}

.fs-btn:hover {
  opacity: 0.75;
}

.fs-play {
  padding: 10px;
}

.fs-volume {
  margin-top: 18px;
  flex-shrink: 0;
}

/* 音量条：与进度条同款样式（带拇指），宽度与进度条对齐 */
.fs-vol-track {
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.22);
  cursor: pointer;
  position: relative;
}

.fs-vol-fill {
  height: 100%;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.85);
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
