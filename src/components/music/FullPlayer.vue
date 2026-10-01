<template>
  <!-- 全屏播放层（移动端竖排 / 桌面端左封面右歌词队列）：Teleport 到 body，避免卡片 tilt transform 困住 fixed 定位 -->
  <Teleport to="body">
    <!-- 被盖住的两层（主页 / 二级面板）的隐藏时机挂在 after-enter / before-leave 上：
         进场时播放层还是半透明带位移的，那一瞬间就把下层藏掉会看到"面板提前消失" -->
    <Transition name="fs" @after-enter="syncCovered" @before-leave="syncCovered">
      <div v-if="fsOpen" class="fs-player" :class="{ 'fs-desktop': fsDesktop, 'fs-immersive': fsImmersive }" @touchstart="fsSwipeStart" @touchmove="fsSwipeMove" @touchend="fsSwipeEnd" :style="{ '--music-accent': musicAccent || undefined }">
        <div class="fs-color-wash" :style="fsWashStyle"></div>
        <div class="fs-bg-wrap">
          <img
            v-if="fsBgSrc"
            ref="fsBgImgEl"
            class="fs-bg-img"
            :class="{ show: bgShown }"
            :src="fsBgSrc"
            alt=""
            @load="bgShown = true"
            @error="bgShown = false"
          />
        </div>
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
                <div class="fs-cover-box" ref="coverBoxEl" @mousemove="coverMove" @mouseenter="coverEnter" @mouseleave="coverLeave">
                  <div class="fs-cover-inner" :style="{ transform: coverTransform }">
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
                    <div class="fs-shine" :style="{ background: shineBg, opacity: hovering ? 1 : 0 }"></div>
                  </div>
                  <div class="fs-cover-shadow" :style="{ transform: shadowTransform }"></div>
                </div>
              </div>
              <!-- 歌词 / 播放列表（桌面端右侧栏；移动端覆盖封面视图） -->
              <div class="fs-side">
                <div v-show="fsView === 'lyrics'" class="fs-lrc" :class="{ 'fs-lrc-scan': fsScan }" ref="fsLrcEl" @scroll="onFsLrcScroll" @wheel="onFsUserInput" @touchstart="onFsUserInput">
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
              <ProgressSlider fs />
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
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import { useMusicPlayer } from "@/composables/useMusicPlayer";
import { useCoverTilt } from "@/composables/useCoverTilt";
import { bumpSmoothScroll, smoothScrollTo } from "@/utils/smoothScroll";
import { pushEsc } from "@/utils/escStack";
import { hdCover } from "@/utils/netease";
import ProgressSlider from "./ProgressSlider.vue";
import Icon from "@/components/Icon.vue";
import LogoBadge from "@/components/LogoBadge.vue";

const p = useMusicPlayer();
const {
  fsOpen, fsImmersive, fsDesktop, fsView,
  playing, track, playlist, index,
  lyrics, lrcIndex, currentTime, duration,
  fmt, seekTo, togglePlay, prev, next, cycleMode, closeFs,
  fsQueueEl, fsQRows,
} = p;
const art = p.art;
const { fsWashStyle, fsBgSrc, fsCoverSrc, bgShown, musicAccent, fsBgImgEl, onFsCoverError } = art;
const tilt = useCoverTilt();
const { coverBoxEl, hovering, coverTransform, shadowTransform, shineBg, coverMove, coverEnter, coverLeave } = tilt;

// FluentPlayer 同款模式图标（填充路径）：顺序 / 单曲循环 / 随机
const fsModeIcons = {
  0: "M7 7h10v2H9v2.5L5.5 8 9 4.5V7zm10 10H7v-2h8v-2.5l3.5 3.5-3.5 3.5V17z",
  1: "M7 7h10v2H9v2.5L5.5 8 9 4.5V7zm10 10H7v-2h8v-2.5l3.5 3.5-3.5 3.5V17z M12 13c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z",
  2: "M14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z",
};
const fsModeIcon = computed(() => fsModeIcons[p.playMode.value] || fsModeIcons[0]);
// 模式 0 是 (index+1) % n，播到末尾会绕回第一首，叫"列表循环"而不是"顺序播放"
const fsModeTitle = computed(() => ({ 0: "列表循环", 1: "单曲循环", 2: "随机播放" }[p.playMode.value] || "播放模式"));

// 全屏播放层整屏不透明（#0a0a0a + 整屏色洗），所以它盖住的主页与二级面板没必要继续合成。
// 播放层是 Teleport 到 body 的，因此隐藏那两层不会连带把播放层自己藏掉（规则见文件末尾的全局样式块）。
function syncCovered() {
  document.body.classList.toggle("fs-open", fsOpen.value);
}

// E6 可访问性：Esc 关闭全屏（键盘退出，不依赖鼠标）。
// 统一 Esc 栈：谁最后打开谁在最顶，Esc 只弹最顶层（替代旧版
// stopImmediatePropagation + body.fs-open 类名守卫的补丁组合）。
// ⚠️不能在 onMounted 里压栈：本组件随小卡常驻挂载（v-if 只包住内层 div），
// 启动即压栈会沉到栈底、让面板的 Esc 反而先弹。改为跟随 fsOpen 进出栈：
// 全屏打开时入栈成顶；关闭即出栈——离场动画期间再按 Esc 会落到面板的处理器
// 上（与旧版 body.fs-open 类被摘后的行为一致：先关全屏，再按一次才关面板）。
let removeEsc = null;
watch(fsOpen, (v) => {
  if (v) removeEsc = pushEsc(closeFs);
  else if (removeEsc) {
    removeEsc();
    removeEsc = null;
  }
});
onUnmounted(() => {
  if (removeEsc) removeEsc();
  clearTimeout(fsScrollTimeout);
  clearTimeout(fsProgramEndTimer);
});

// ── 全屏歌词跟随当前句（居中）──────────────────────────────────────────
const fsLrcEl = ref(null);
const fsScan = ref(false); // 手动滚动期间取消歌词模糊，便于点行调整进度
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

function fsLrcFollow(instant) {
  const el = fsLrcEl.value;
  if (!el || lrcIndex.value === -1) return;
  const line = el.children[lrcIndex.value];
  if (!line) return;
  // 沉浸模式高亮向上提一行：居中位置上移一行间距，当前句偏上，下方露出更多待唱句
  const rowSpan = line.offsetHeight + 16; // 行高 + gap(16px) = 一行间距
  // ⚠️fsImmersive 是 ref，必须取 .value——直接写进三元恒为真，非沉浸模式也会上移一行
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

watch(fsOpen, (v) => {
  if (!v) return;
  nextTick(() => {
    if (fsView.value === "lyrics") fsLrcFollow(true);
  });
});
watch(lrcIndex, () => {
  if (fsOpen.value && fsView.value === "lyrics" && !fsIsUserScrolling) fsLrcFollow(false);
});
watch(fsView, (v) => {
  if (v === "lyrics") nextTick(() => fsLrcFollow(true));
  // queue 的定位在引擎里（与渐进列表同处一份状态）
});
// 进入沉浸模式字号放大（1.05→1.5rem），所有行 offsetTop 变化，active 行会错位到"下面"；
// 立即重新定位，避免"跳到下面再滚回居中"。等一帧让字号变化完成布局（reflow）后再取 offsetTop。
watch(fsImmersive, (v) => {
  if (v && fsOpen.value && fsView.value === "lyrics") {
    requestAnimationFrame(() => fsLrcFollow(true));
  }
});

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

// 滚轮/触摸歌词区：与 onFsLrcScroll 同一套抑制，但由真实手势事件直触——
// 不再依赖 scroll 事件绕过程序滚动标志（那是刚开曲抖动的根源，见小卡 onLrcUserInput）
function onFsUserInput() {
  bumpSmoothScroll();
  fsProgramScrolling = false;
  clearTimeout(fsProgramEndTimer);
  fsIsUserScrolling = true;
  fsScan.value = true;
  clearTimeout(fsScrollTimeout);
  fsScrollTimeout = setTimeout(() => {
    fsIsUserScrolling = false;
    fsScan.value = false;
    if (fsOpen.value && fsView.value === "lyrics" && lrcIndex.value !== -1) fsLrcFollow(false);
  }, 3000);
}

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
const fsSheet = ref(null);
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

// 全屏视图切换：歌词 ⇄ 播放列表（两端一致）
function fsToggleView(v) {
  fsView.value = fsView.value === v ? "lyrics" : v;
}

// 全屏播放列表选歌后自动收回列表（回到歌词）
function fsPickQueue(i) {
  p.playIndex(i);
  fsView.value = "lyrics";
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
</script>

<style scoped>
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
     饱和度已经烘焙进 fsWashStyle 的色值里（见 useCoverArt 注释），视觉一致，但省掉这层滤镜。 */
}

.fs-bg-wrap {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

/* 原来这里还有两层主色光斑（fs-grad-1/2，46s/62s ease-in-out 无限漂移，仿 FluentPlayer
   动态观感）——整层已按用户要求移除：连续插值的无限动画让合成器每个 vsync 出一帧，
   拖着下面 44px 模糊层全屏重合成，2560×1600@120Hz 实测贡献约 10% GPU（无头口径）。
   背景现在是纯静态三明治：fs-color-wash 主色底 + fs-bg-img 模糊封面 + fs-shade 渐晕。 */

.fs-bg-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* FluentPlayer 同款背景参数 */
  transform: scale(1.05);
  /* 不叠 mix-blend-mode：全屏动画层上的混合模式会强制逐帧重算，是这里最大的 GPU 开销 */
  filter: blur(44px) brightness(0.66) saturate(1.5);
  /* ⚠️曾经这里写着 will-change: transform，注释声称能让模糊层「只栅格化一次后缓存成
     纹理」——实测（有头 Chrome + Windows GPU Engine 计数器，2560×1392@120Hz）恰好相反：
     带 will-change 时鼠标每动一下这层都被重新处理（全屏移动 GPU ~46%），去掉后按静态
     层缓存（~14%，剩余为整树正常合成）。will-change 对本层只有反作用，已移除；
     无头探针测不出这种差异（「静态层代价在噪声内」的旧结论即由此而来，别再信）。 */
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
  /* ⚠️ transition 必须包含 filter：移动端这里没有 filter 无副作用，
     但桌面端 .fs-desktop .fs-lrc-line 会补回 blur(4px)，而它不重写 transition、
     靠继承这条——一旦漏掉 filter，blur 的 4px→1.5px→none 就是瞬跳（切句、
     hover 取消模糊都不再渐变），比 305e313 那版生硬。实测漏掉时
     computed transition-property = "opacity, color, font-size"。 */
  transition: filter 0.9s ease, opacity 0.9s ease, color 0.25s ease, font-size 0.25s ease;
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
   若不加限定会把这些行的模糊/强调态全取消，移动端"模糊丢失"。
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

/* 桌面进度条强调色（进度条本体样式在 ProgressSlider.vue，这里是桌面态覆写） */
.fs-desktop :deep(.fs-progress .p-bar) {
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

.fs-side-btn.on {
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
  /* ⚠️不要用 flex 列布局排这些行：Chrome 的 content-visibility 占位尺寸
     （contain-intrinsic-size）在 flex 主轴上不生效——离屏行会塌成纯 padding 高
     （实测 16px vs 真实 62px），滚动时高度随渲染增减漂移，定位永远不准。
     block 流下占位正常，行距用 margin 补回（原来是 gap: 10px）。 */
  display: block;
  padding-right: 8px;
}

.fs-queue > .fs-q-head {
  margin-bottom: 10px;
}

.fs-queue > .fs-q-row {
  margin-bottom: 10px;
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
  /* 同小卡 .pl-item：全屏队列也是 410 行，离屏行不进布局；占位值量的是内容盒（不含
     padding）——封面 46px 就是内容盒高度，填行高 62px 会让每行占位偏大、
     offsetTop 累积漂移，深处的行定位不准 */
  content-visibility: auto;
  contain-intrinsic-size: auto 46px;
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

.lrc-empty {
  color: var(--text-dim);
  font-size: 0.9rem;
  letter-spacing: 0.5px;
}

/* 歌词空态在歌词区居中：flex:1 吃掉两个 45% 弹性占位之间的空间，文字落在正中 */
.fs-lrc .lrc-empty {
  flex: 1;
  display: grid;
  place-items: center;
  padding: 0;
  font-size: 1rem;
}

/* 队列空态（块布局容器）：给足上下留白即可 */
.fs-queue .lrc-empty {
  padding: 30px 0;
  text-align: center;
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
     也避免 display:none 触发的重排/重栅格。类名由 FullPlayer 的 syncCovered() 挂到 body 上。
     ⚠️还必须暂停两层内的一切 CSS 动画：visibility:hidden 不停动画——播放中若让小卡黑胶
     旋转/均衡条继续跑，合成器仍每 vsync 出帧，而全屏树每次合成都要把整棵大图层树
     混成一遍（实测全屏播放中静止 GPU ~63%，暂停动画后归零）。!important 压过
     cover-img 上的内联 animation-play-state，全屏关闭即自动恢复。 -->
<style>
body.fs-open .page,
body.fs-open .more {
  visibility: hidden;
}

body.fs-open .page *,
body.fs-open .more *,
body.fs-open .page,
body.fs-open .more {
  animation-play-state: paused !important;
}
</style>
