import { ref, computed, watch, nextTick } from "vue";
import { siteConfig } from "../config.js";
import { musicBus } from "../utils/musicBus.js";
import { songIdOf, neteasePic, hdCover, memoSet } from "../utils/netease.js";
import { probeAudio } from "../utils/audioProbe.js";
import { useProgressiveList, scrollListToActive } from "./useProgressiveList.js";
import { createLyrics } from "./useLyrics.js";
import { createCoverArt } from "./useCoverArt.js";

// Meting 数据源：与博客完全一致——i-meto 主源（博客实测手机网络可用）+ 两备源
const APIS = [
  "https://api.i-meto.com/meting/api?server=netease&type=playlist&id=:id&r=:r",
  "https://api.injahow.cn/meting/?server=netease&type=playlist&id=:id",
  "https://api.moeyao.cn/meting/?server=netease&type=playlist&id=:id",
];

// ── State（模块级单例：小卡与全屏层共用同一份状态）─────────────────────
const loading = ref(true);
const playlist = ref([]);
const index = ref(0);
const playing = ref(false);
// 默认列表循环（0 列表循环 1 单曲 2 随机）。
// 不用随机做默认：随机模式下"下一首"不可预知，prefetchNextTrack 与代理直链预解析
// 都只能跳过（下一首命中率≈1/n，纯耗流量），切歌要等冷启动。列表循环的下一首是确定的，
// 预载才能命中，切歌直接复用它探活出的源。
const playMode = ref(0);
const volume = ref(1);
const isMuted = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const errTip = ref(""); // 播放失败提示（整曲所有源失败时短暂显示）
const resolving = ref(false); // 代理直链解析中：这段时间是静音的，给个提示，别让人以为切歌没生效

const track = computed(() => playlist.value[index.value] || { name: "音乐", artist: "未在播放" });
const pct = computed(() => (duration.value ? (currentTime.value / duration.value) * 100 : 0));
const modeIcon = computed(() =>
  playMode.value === 2 ? "shuffle" : playMode.value === 1 ? "repeat-one" : "repeat"
);

// ── 全屏播放层 UI 状态（视图在 FullPlayer.vue，状态在引擎里保证两端共享）──
const fsOpen = ref(false);
const fsImmersive = ref(false); // 沉浸式歌词：隐藏封面/进度/底部控件，歌词整屏居中
const fsDesktop = ref(false); // 桌面布局：左封面右歌词队列；移动端：竖排
const fsView = ref("cover"); // 全屏视图：cover（仅移动端）/ lyrics / queue

const lyricsCtl = createLyrics({ playlist, index });
const art = createCoverArt({ track });

// ── 全屏播放列表（渐进上屏）────────────────────────────────────────────
const fsQueueEl = ref(null);
const fsQList = useProgressiveList(playlist, 32, () => scrollQueueToActive());
const fsQRows = fsQList.rows;

function scrollQueueToActive() {
  // 当前行可能还没被渐进渲染出来，先补到它，再等 DOM 落地后定位
  fsQList.ensure(index.value + 1);
  nextTick(() => {
    // .fs-queue 的第一个子元素是标题头（.fs-q-head），children[index] 会错位到上一行，
    // 必须按类名取行
    const row = fsQueueEl.value?.querySelectorAll(".fs-q-row")[index.value];
    scrollListToActive(fsQueueEl.value, row);
  });
}

watch(index, () => {
  nextTick(() => {
    if (fsOpen.value && fsView.value === "queue") scrollQueueToActive();
  });
});
// 歌单到位后全屏队列如正开着，从头渐进补齐（空歌单时 limit 归零，拿到数据再从头补）
watch(
  () => playlist.value.length,
  () => {
    if (fsOpen.value && fsView.value === "queue") fsQList.restart();
  }
);
watch(fsView, (v) => {
  if (v === "queue") nextTick(() => scrollQueueToActive());
});

// ── 歌单数据（三源并发竞速）────────────────────────────────────────────
let winnerApi = 0; // 本轮竞速胜出的源；单曲降级链优先复用它

// 三源并发竞速：谁先返回有效歌单用谁（串行最坏要等 3×超时，并发只需最快那家）
async function fetchPlaylistAll() {
  const id = siteConfig.musicPlaylist;
  const ctrls = [];
  const timers = [];
  const tryOne = async (api, i) => {
    const ctrl = new AbortController();
    ctrls.push(ctrl);
    timers.push(setTimeout(() => ctrl.abort(), 4000));
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
    timers.forEach(clearTimeout); // 悬着的 4s abort 定时器一并清掉
  }
}

async function upgradeCovers(tracks) {
  const items = tracks.map((t) => ({ t, id: songIdOf(t) })).filter((x) => x.id);
  const CHUNK = 100;
  const batchTimers = [];
  for (let i = 0; i < items.length; i += CHUNK) {
    const part = items.slice(i, i + CHUNK);
    try {
      const ctrl = new AbortController();
      batchTimers.push(setTimeout(() => ctrl.abort(), 10000));
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
  batchTimers.forEach(clearTimeout);
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

// ── 歌单预载：页面一打开就开始拉，进二级面板时多半已就绪 ────────────────
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

// ── 播放直链来源（config.musicSource）──────────────────────────────────
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

// 超时给 12 秒：函数冷启动时要装载全部音源脚本（实测约 1 秒）再解析，而**音源自身的耗时在网络
// 抖动时能到 5~6 秒**（实测某聚合源 1.4s ⇄ 5.8s 反复横跳）。3 秒/5 秒这种紧超时会在最需要它的
// 时候超时，然后静默退回 Meting——而 Meting 对 VIP 曲只有 404，结果就是"VIP 歌直接没声"。
// 12 秒装得下服务端最坏情况（INVOKE_TIMEOUT_MS=9s + 装载/探活）。
const PROXY_TIMEOUT_MS = 12000;

async function resolveProxyUrl(t, ms = PROXY_TIMEOUT_MS) {
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
    memoSet(proxyMemo, id, { url, at: Date.now() });
    return url;
  } catch (e) {
    // 静默退回 Meting 候选链，提示只打一次：多半是 /api/url 没部署成功或音源全失效
    if (!proxyWarned) {
      proxyWarned = true;
      console.warn("[music] 音源解析失败，已退回 Meting：", e && e.message, "（打开 /api/health 看音源装载情况）");
    }
    memoSet(proxyMemo, id, { url: "", at: Date.now(), fail: true });
    return "";
  } finally {
    clearTimeout(timer);
  }
}

// ── Playback ───────────────────────────────────────────────────────────
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

let audio = null; // <audio> 元素由 MusicCard 模板注入（attachAudio）

function attachAudio(el) {
  audio = el;
  if (el) {
    el.volume = volume.value;
    el.muted = isMuted.value;
  }
}

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
  if (!audio) return;
  const ver = ++loadVersion;
  wantPlay = autoPlay;
  if (errorSkipTimer) {
    clearTimeout(errorSkipTimer);
    errorSkipTimer = null;
  }

  // ★ 切歌那一刻就把上一首掐掉。
  // 以前是等 playCurrentUrl 才换 audio.src，中间隔着整个"解析直链"的时间（代理模式下最长
  // 十秒），于是封面/歌词/标题早就换好了，耳朵里还在放上一首——这正是"切了歌还在放旧歌"的成因。
  // 清掉 src 而不是留着：否则这段空档里点播放会走 togglePlay 的 `audio.src` 分支，把旧歌又放起来。
  try {
    audio.pause();
  } catch {
    // 某些环境暂停会抛（媒体未就绪），忽略
  }
  audio.removeAttribute("src");
  audio.load();
  playing.value = false;
  resolving.value = false;

  // Meting 候选链：歌单竞速的胜出源优先（当前网络下它最可达），其余源殿后。
  // 代理模式下它同时扮演两个角色——代理没结果时的兜底，以及代理直链失效后的降级链。
  const meting = metingCandidates(t);

  lyricsCtl.loadLyrics(t);
  lyricsCtl.prefetchNextLyrics();
  // 顺手把下一首的直链也解析掉（延迟一点发起，别和当前这首抢）：切歌时不必再等冷启动。
  // 随机模式下下一首不可预知，预取等于白花一次函数调用（与 prefetchNextTrack 的判断保持一致）。
  // 1.5s 窗口内用户又切了歌就放弃本次预取（nx 是旧时刻算出的下一首）——比对的是
  // 本次 loadAndPlay 的版本号；⚠️绝不能 ++loadVersion，那会让当前这首歌自己的
  // 播放回调全部失配（实测：src 不被设置、无声）
  if (proxyEnabled() && playMode.value !== 2) {
    const nx = playlist.value[(i + 1) % playlist.value.length];
    if (nx && nx !== t) {
      setTimeout(() => {
        if (ver === loadVersion) resolveProxyUrl(nx);
      }, 1500);
    }
  }
  art.coverLoaded.value = false;
  art.syncBgShown();
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
  // 提示延迟 350ms 才出现：解析快时（实测线上 p50 ≈0.53s）闪一下文案反而更烦，
  // 只在真的等久了才提示。切歌/落定都要能取消它。
  const hintTimer = setTimeout(() => {
    if (ver === loadVersion) resolving.value = true;
  }, 350);
  resolveProxyUrl(t).then((u) => {
    clearTimeout(hintTimer);
    if (ver !== loadVersion) return; // 解析期间又切歌了：提示与播放都交给新那次
    resolving.value = false;
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
  // 切歌瞬间是我们自己清掉 src 的（见 loadAndPlay），那不算"播放失败"
  if (!audio || !audio.getAttribute("src")) return;
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
  if (i === index.value && audio && !audio.paused) {
    togglePlay();
  } else {
    loadAndPlay(i, true);
  }
}

function togglePlay() {
  if (!audio || !playlist.value.length) return;
  if (audio.paused) {
    wantPlay = true;
    if (!audio.src) {
      loadAndPlay(index.value);
      return;
    }
    armLoadTimer(loadVersion); // 用户点了播放：挂起源同样要走看门狗
    audio.play().then(() => {
      playing.value = true;
      // 首曲是页面加载时以 autoPlay=false 预载的，没走过 playCurrentUrl 的成功分支，
      // 这里补一次——否则第一首播完切歌仍是冷启动。函数内部自带模式/缓存判断，重复调用无副作用
      prefetchNextTrack();
    }).catch((e) => {
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
  if (!audio) return;
  // 元数据/进度到达 = 当前源活着，撤掉挂起看门狗
  if (audio.duration) {
    clearLoadTimer();
    consecutiveSkips = 0; // 源活着 = 播放健康，连续失败清零
  }
  currentTime.value = audio.currentTime || 0;
  duration.value = audio.duration || 0;
  lyricsCtl.updateLrcHighlight(audio.currentTime || 0);
}

function seekTo(time) {
  if (audio) audio.currentTime = time;
}

// ── 进度条拖拽（pointer 事件 + 捕获，点按与拖动统一走这一条路）──
// 拖动中只更新本地预览（scrub），松手才真正 seek：逐 move 都 seek 会让音频
// 在弱网下磕磕绊绊
const scrub = ref(null); // 拖动中的预览进度（百分数）；null = 未在拖动
const displayPct = computed(() => (scrub.value != null ? scrub.value : pct.value));

function progressDown(e) {
  const el = e.currentTarget;
  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    // 不支持捕获就退化成点按
  }
  scrubMove(e);
  el.onpointermove = scrubMove;
  el.onpointerup = scrubUp;
  el.onpointercancel = scrubUp;
}

function scrubMove(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  const p = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
  scrub.value = p * 100;
}

function scrubUp(e) {
  const el = e.currentTarget;
  el.onpointermove = null;
  el.onpointerup = null;
  el.onpointercancel = null;
  if (scrub.value == null) return;
  // 以松手点为准提交：末尾的 pointermove 可能被浏览器合并而没落在真正的松手
  // 位置，preview 会在松手前停在中途——松手事件本身一定带着最终坐标
  let p = scrub.value;
  if (e.type === "pointerup" && typeof e.clientX === "number") {
    const rect = el.getBoundingClientRect();
    p = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1) * 100;
  }
  if (audio && duration.value) audio.currentTime = (p / 100) * duration.value;
  scrub.value = null;
}

function toggleMute() {
  if (!audio) return;
  isMuted.value = !isMuted.value;
  audio.muted = isMuted.value;
  try {
    localStorage.setItem("music_muted", isMuted.value ? "1" : "0");
  } catch {
    // 存储失败不影响播放
  }
}

function setVol(e) {
  if (!audio) return;
  const rect = e.currentTarget.getBoundingClientRect();
  volume.value = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
  audio.volume = volume.value;
  if (volume.value > 0) isMuted.value = false;
  audio.muted = isMuted.value;
  try {
    localStorage.setItem("music_volume", String(volume.value));
    localStorage.setItem("music_muted", isMuted.value ? "1" : "0");
  } catch {
    // 存储失败不影响播放
  }
}

// 音量条拖拽：pointer 捕获后 move 事件持续派发到轨道元素，按下即可滑动调音量
function volPointerDown(e) {
  const el = e.currentTarget;
  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    // 不支持捕获就退化成点按
  }
  setVol(e);
  el.onpointermove = setVol;
  // 松手以松手点为准（末尾 move 可能被合并，同 scrubUp 的理由）
  el.onpointerup = (ev) => {
    if (ev.type === "pointerup") setVol(ev);
    el.onpointermove = null;
    el.onpointerup = null;
  };
  // 触屏中断（来电/手势冲突）时清掉残留 handler，否则之后指针扫过音量条会误改音量
  el.onpointercancel = el.onpointerup;
}

// ── 播放时钟：rAF 高频驱动歌词高亮 ─────────────────────────────────────
// 移动端 timeupdate 稀疏（约 1Hz）导致高亮滞后/跳行，改用 rAF 高频驱动。
// 但移动端 audio.currentTime 本身也常按 ~1Hz 步进，rAF 每帧读到的仍是台阶值——
// 表现就是歌词/进度永远比歌声慢半拍。所以再按真实时间在两次步进之间外插：
// currentTime 一变就重新锚定；超过 1.2s 一步都没走（缓冲/卡顿）则放弃外插回吸
// 实测值。桌面端 currentTime 平滑推进，每帧都命中重新锚定分支，外插不生效。
let mediaAnchor = { at: 0, time: 0 };
function mediaNow(a) {
  const t = a.currentTime || 0;
  const now = performance.now();
  if (a.paused || t !== mediaAnchor.time || now - mediaAnchor.at > 1200) {
    mediaAnchor = { at: now, time: t };
    return t;
  }
  return mediaAnchor.time + (now - mediaAnchor.at) / 1000;
}

let lrcRaf = 0;
function startLrcTicker() {
  if (lrcRaf) return;
  const tick = () => {
    if (audio && !audio.paused) {
      const t = mediaNow(audio);
      // 写入节流（性能）：currentTime 变化会触发整棵卡片树重渲染，原来每帧写一次
      // 等于播放时 60fps 全量 patch。进度条自带 0.1s linear 过渡、时间文本粒度是 1s，
      // 把写入降到 ≥0.1s 一次（约 10Hz）视觉完全一致，重渲染开销降一个量级。
      // 歌词高亮判定不受影响：它吃的是插值后的局部 t，不经过响应式写入。
      if (Math.abs(t - currentTime.value) >= 0.1) currentTime.value = t;
      lyricsCtl.updateLrcHighlight(t);
    }
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

// ── 全屏播放层开关 ─────────────────────────────────────────────────────
let fsPrevBodyOverflow = "";

function openFs() {
  fsOpen.value = true;
  fsImmersive.value = false; // 每次打开默认歌词视图
  fsDesktop.value = window.matchMedia("(min-width: 980px)").matches;
  fsView.value = "lyrics"; // 两端都默认歌词视图（移动端歌词常驻封面下方）
  fsPrevBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden"; // 全屏期间锁背景滚动
  art.resolveFsCover();
  art.syncBgShown();
  // 打开全屏就开始后台渐进铺队列，点列表时已就绪。已铺满时别 restart——那会把
  // 列表砍回首屏 chunk 重新排队，深处的当前曲在铺回来之前定位不到
  if (!fsQList.isDone()) fsQList.restart();
}

function closeFs() {
  fsOpen.value = false;
  document.body.style.overflow = fsPrevBodyOverflow;
}

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
      if (audio && d && d.seekTime != null) audio.currentTime = d.seekTime;
    });
    // 锁屏/耳机上的快进快退键（±10s）
    ms.setActionHandler("seekbackward", () => {
      if (audio) audio.currentTime = Math.max(0, audio.currentTime - 10);
    });
    ms.setActionHandler("seekforward", () => {
      if (audio) audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 10);
    });
  } catch {
    // 不支持的动作或被禁用时静默跳过
  }
}

function syncMediaSession() {
  if (!("mediaSession" in navigator)) return;
  const t = track.value;
  const cover = t && t.pic ? (art.fsCoverSrc.value || hdCover(t.pic)) : "";
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

// ── 初始化 / 销毁（由 MusicCard 的 onMounted/onUnmounted 触发，幂等）─────
let inited = false;

function initPlayer() {
  if (inited) return;
  inited = true;
  musicBus.register({ togglePlay, openFs });
  bindMediaSession();
  // 音量/静音记忆：刷新后还原用户上次的设置。
  // ⚠️先判键存在再 Number：Number(null)===0，直接转会把"从未设置过"的全新访客
  // 音量强制归零（表现为首次播放完全无声）
  try {
    const rawVol = localStorage.getItem("music_volume");
    if (rawVol !== null && rawVol !== "") {
      const savedVol = Number(rawVol);
      if (Number.isFinite(savedVol) && savedVol >= 0 && savedVol <= 1) volume.value = savedVol;
    }
    isMuted.value = localStorage.getItem("music_muted") === "1";
  } catch {
    // 读取失败用默认值
  }
  if (audio) {
    audio.volume = volume.value;
    audio.muted = isMuted.value;
  }
  watch(playing, (v) => {
    musicBus.syncPlaying(v);
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = v ? "playing" : "paused";
    // rAF 高频驱动歌词高亮：timeupdate 在手机上稀疏（约 1Hz），会滞后/跳行
    if (v) startLrcTicker();
    else stopLrcTicker();
  }, { immediate: true });

  // 切歌时始终解析官方高清封面（主卡小封面与全屏共用，面板关闭也在后台预取）
  watch(track, () => {
    // resolveFsCover 切歌时后台解析（不打开全屏也会跑）：先立即按当前可用封面设一次，
    // 官方高清封面（非网易图走异步检索）解析到位后，MediaSession 再同步一次，与全屏用同一张
    syncMediaSession();
    art.resolveFsCover().then(() => syncMediaSession());
  });

  loading.value = true;
  (async () => {
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
        playlist.value = [];
      }
    } catch {
      playlist.value = [];
    }
    loading.value = false;
    // 定位不在这一步做：此时行还没补齐，偏移不准，交给补齐完成后的 onDone
  })();
}

function disposePlayer() {
  stopLrcTicker();
  musicBus.unregister();
  lyricsCtl.dispose();
  art.dispose();
  audio?.pause();
  fsQList.stop();
  clearLoadTimer();
  if (errorSkipTimer) clearTimeout(errorSkipTimer);
  if (errTipTimer) clearTimeout(errTipTimer);
  if (fsOpen.value) document.body.style.overflow = fsPrevBodyOverflow;
}

// ── Helpers ────────────────────────────────────────────────────────────
function fmt(seconds) {
  if (!seconds || Number.isNaN(seconds)) return "0:00";
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return min + ":" + (sec < 10 ? "0" : "") + sec;
}

const engine = {
  // 状态
  loading, playlist, index, playing, playMode, volume, isMuted,
  currentTime, duration, errTip, resolving, track, pct, modeIcon,
  // 全屏
  fsOpen, fsImmersive, fsDesktop, fsView, fsQueueEl, fsQRows,
  // 歌词 / 封面
  lyrics: lyricsCtl.lyrics,
  lrcIndex: lyricsCtl.lrcIndex,
  art,
  // 动作
  fmt, attachAudio,
  progressDown, displayPct,
  toggleMute, setVol, volPointerDown,
  playIndex, togglePlay, next, prev, cycleMode, seekTo,
  onTime, onEnded, onAudioError,
  openFs, closeFs, scrollQueueToActive,
  initPlayer, disposePlayer,
};

export function useMusicPlayer() {
  return engine;
}
