<template>
  <div class="glass music" :style="{ '--music-accent': musicAccent || undefined }">
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
            ref="coverImgEl"
            v-show="coverLoaded"
            class="cover-img"
            :class="{ spinning: playing }"
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
            <div class="vol-track" @pointerdown="volPointerDown">
              <div class="vol-fill" :style="{ width: (isMuted ? 0 : volume * 100) + '%' }"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Progress（拖拽逻辑与全屏共用 ProgressSlider） -->
    <ProgressSlider />

    <p class="play-err" v-show="errTip">{{ errTip }}</p>
    <p class="play-hint" v-show="resolving && !errTip">正在解析音源直链…</p>

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
        <div class="lrc-container" ref="lrcEl" @scroll="onUserLrcScroll" @wheel="onLrcUserInput">
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
      :ref="attachAudio"
      preload="none"
      @timeupdate="onTime"
      @loadedmetadata="onTime"
      @ended="onEnded"
      @error="onAudioError"
    ></audio>

    <!-- 全屏播放层（Apple Music 风格）：状态在引擎（useMusicPlayer），视图在此子组件 -->
    <FullPlayer />
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from "vue";
import { useMusicPlayer } from "@/composables/useMusicPlayer";
import { useProgressiveList, scrollListToActive } from "@/composables/useProgressiveList";
import { bumpSmoothScroll, smoothScrollTo } from "@/utils/smoothScroll";
import ProgressSlider from "@/components/music/ProgressSlider.vue";
import FullPlayer from "@/components/music/FullPlayer.vue";
import Icon from "@/components/Icon.vue";

const p = useMusicPlayer();
const {
  loading, playing, playMode, modeIcon, track, playlist, index,
  volume, isMuted, currentTime, duration, errTip, resolving,
  lyrics, lrcIndex,
  fmt, seekTo, playIndex, togglePlay, prev, next, cycleMode,
  toggleMute, volPointerDown, attachAudio,
  onTime, onEnded, onAudioError,
  initPlayer, disposePlayer, openFs,
} = p;
const art = p.art;
const { musicAccent, cardCoverSrc, coverImgEl, coverLoaded } = art;

// ── 小卡抽屉状态 ───────────────────────────────────────────────────────
const lrcOpen = ref(false);
const plOpen = ref(true); // 播放列表默认展开（手机端有 230px 封顶内滚，不会撑长卡片）

// 歌单渐进上屏（引擎里同一份 playlist；全屏队列那份在引擎）
const plEl = ref(null);
let plRecenterTimer = null;
function scrollPlaylistToActive() {
  // 当前行可能还没被渐进渲染出来，先补到它，再等 DOM 落地后定位
  plList.ensure(index.value + 1);
  nextTick(() => {
    const row = plEl.value?.children?.[index.value];
    scrollListToActive(plEl.value, row);
  });
}
const plList = useProgressiveList(playlist, 24, () => scrollPlaylistToActive());
const plRows = plList.rows;

// 播放列表容器进入视口（首次打开面板）时定位当前行：
// 二级面板默认 display:none，补齐完成的 onDone 定位时 offsetTop 读不到（=0），
// 列表停在顶部；等容器真正可见再补一次定位。
// ⚠️不要 disconnect：面板隐藏期间锁屏切歌（MediaSession nexttrack）触发的定位
// 全写在 0 上，重开面板时必须再补一次，否则列表停在顶部、当前行不在视野里
let plSeenObserver = null;
watch(plEl, (el) => {
  if (plSeenObserver || !el || !("IntersectionObserver" in window)) return;
  plSeenObserver = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      nextTick(() => scrollPlaylistToActive());
    }
  }, { threshold: 0.01 });
  plSeenObserver.observe(el);
});

// 歌单到位后开始渐进上屏（空歌单时 limit 归零，拿到数据再从头补）；
// 补完最后一行后再定位一次当前播放行（onDone = scrollPlaylistToActive）：
// 行是渐进追加的，早先那次定位时后面的行还没进 DOM，容器高度/偏移与最终不一致
watch(
  () => playlist.value.length,
  () => plList.restart(),
  { immediate: true }
);

watch(index, () => {
  nextTick(() => scrollPlaylistToActive());
});

// 高亮行变化 → 抽屉展开时跟随滚动（全屏侧的跟随在 FullPlayer）
watch(lrcIndex, (idx) => {
  if (idx !== -1 && lrcOpen.value && !isUserScrolling && lrcEl.value) {
    scrollLrcTo(idx, "smooth");
  }
});

// ── 小卡歌词滚动：程序滚动与用户滚动的区分 ─────────────────────────────
const lrcEl = ref(null);
let isUserScrolling = false;
let scrollTimeout = null;
let progScrollUntil = 0; // 程序滚动期间触发的事件不算用户滚动

function scrollLrcTo(idx, behavior) {
  const line = lrcEl.value?.children[idx];
  if (!line || !lrcEl.value) return;
  const target = line.offsetTop - lrcEl.value.clientHeight / 2 + line.offsetHeight / 2;
  // 一次跨越超过半屏（切歌 / 拖动进度条跳段）直接到位：若仍走 900ms 平滑，
  // 会从旧位置一路追到新目标，看起来就是"跳一下再滚回"（与全屏 fsLrcFollow 同理）
  const far = Math.abs(target - lrcEl.value.scrollTop) > lrcEl.value.clientHeight * 0.5;
  if (far) behavior = "auto";
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

function onUserLrcScroll() {
  // 程序化的居中滚动自身会触发 scroll 事件，不计为用户滚动
  if (performance.now() < progScrollUntil) return;
  isUserScrolling = true;
  resetScrollTimeout();
}

// 用户滚轮/触摸 = 明确的手势意图：立刻终止进行中的程序滚动并进入抑制期。
// 否则歌曲开头自动跟随的 900ms 平滑滚动还没结束，用户的滚动会被逐帧拉回目标位，
// 表现就是"刚开曲滚动歌词来回抖动"（scroll 事件此时被程序滚动标志吞掉，拦不住）
function onLrcUserInput() {
  bumpSmoothScroll();
  progScrollUntil = 0;
  isUserScrolling = true;
  resetScrollTimeout();
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
    // 重开时把当前行重新居中：抽屉折叠（0fr）期间容器零高度，IntersectionObserver
    // 视其为「仍然相交」（零面积元素特性）不会触发重定位，而折叠期间行的
    // content-visibility 行高是估算值，scrollTop 数值虽在、行位置已经漂移——
    // 表现就是拖过进度条/切过歌词后再打开列表，当前行不在正中。
    // 先立即定位，待 0.3s 展开动画结束再校正一次（与歌词分支同款时序）
    nextTick(() => scrollPlaylistToActive());
    plRecenterTimer = setTimeout(() => {
      if (plOpen.value) scrollPlaylistToActive();
    }, 360);
  }
}

onMounted(() => {
  initPlayer();
});

onUnmounted(() => {
  disposePlayer();
  plList.stop();
  if (plSeenObserver) {
    plSeenObserver.disconnect();
    plSeenObserver = null;
  }
  clearTimeout(scrollTimeout);
  clearTimeout(plRecenterTimer);
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

.play-hint {
  margin-top: 6px;
  font-size: 0.72rem;
  color: var(--text-dim);
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

.btn-fs:hover {
  color: var(--text);
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
  /* 按住拖动调音量：不让浏览器把 pointermove 拿去当滚动 */
  touch-action: none;
}

.vol-fill {
  height: 100%;
  border-radius: 99px;
  background: var(--music-accent, var(--accent1));
}

/* Controls */
.controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* 进度条左右各留 4px（见 ProgressSlider 的 .progress margin），而按钮自带 8px padding ——
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
  transition: filter 0.3s ease;
}

.btn-play:hover {
  filter: brightness(1.15);
}

/* Drawers（grid-rows 过渡，对齐博客） */
.drawer {
  display: grid;
  grid-template-rows: 0fr;
  min-height: 0; /* 卡片定高时允许 flex 压缩抽屉，列表/歌词才能约束在可视槽内 */
  opacity: 0;
  transition: grid-template-rows 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
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
  overflow-anchor: none; /* 关掉滚动锚定补偿，避免它和程序滚动互相拉扯 */
  margin-top: 8px;
  padding: 60px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  /* ⚠️ 不要设 scroll-behavior: smooth：CSS 的它会覆盖 scrollTo({behavior:"auto"})，
     把"开抽屉定位""用户滚动后回正"这些本该瞬时到位的调用也变成动画。
     平滑滚动只交给 smoothScrollTo 一处负责，两套动画叠加会加重抖动 */
  scroll-behavior: auto;
}

.lrc-line {
  font-size: 0.84rem;
  color: var(--text-dim);
  padding: 4px 0;
  cursor: pointer;
  opacity: 0.55;
  transition: opacity 0.9s ease, color 0.3s ease;
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
  color: rgba(255, 255, 255, 0.9);
  font-weight: 700;
  /* 不再放大字号：字号突变会改变行高，后面所有行的 offsetTop 整体下移，
     而滚动目标是用变字号之前量到的 offsetTop 算的——现象就是高亮先被甩到
     下面、再被滚回中间。与全屏 .fs-lrc-line.active 保持一致：提亮 + 加粗区分 */
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
  font-size: 0.88rem;
  letter-spacing: 0.5px;
  /* 小卡歌词抽屉空态：占满剩余高度并居中（容器是纵向 flex） */
  flex: 1;
  display: grid;
  place-items: center;
  padding: 0;
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
</style>
