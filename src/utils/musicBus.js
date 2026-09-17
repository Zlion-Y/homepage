// 极简共享控制器：MusicCard 挂载时注册 togglePlay/openFs，供欢迎卡等触发操控。
// MorePanel 首次打开后常驻挂载；面板打开前 ctrl 为空，此时用 ensureAnd 先请求
// 打开面板（App 提供 setOpenPanel），等 MusicCard 挂载注册后再执行动作，
// 从而支持「首页直接点播放 / 全屏」。
import { ref, watch } from "vue";

const ctrl = ref(null); // 当前音乐卡控制器 { togglePlay, openFs }
const playing = ref(false); // 当前是否播放（供外部图标切换）
let openPanel = null; // App 注册：用于从首页直接打开二级面板
const pending = []; // ctrl 就绪前暂存的待执行动作
let watching = false;

function syncPlaying(v) {
  playing.value = !!v;
}
function register(c) {
  ctrl.value = c || null;
}
function unregister() {
  ctrl.value = null;
  syncPlaying(false); // 音乐卡卸载后复位播放态，避免外层图标残留播放中
}
function setOpenPanel(fn) {
  openPanel = fn || null;
}
function ensureAnd(action) {
  if (ctrl.value) {
    action();
    return;
  }
  pending.push(action);
  if (openPanel) openPanel(); // 先打开面板 → MusicCard 挂载注册
  if (!watching) {
    watching = true;
    const stop = watch(ctrl, (v) => {
      if (v) {
        watching = false;
        stop();
        const q = pending.splice(0);
        q.forEach((a) => a());
      }
    });
    // 5s 超时：ctrl 仍未就绪则清空 pending，避免动作永久滞留
    setTimeout(() => {
      if (watching) {
        watching = false;
        stop();
        pending.length = 0;
      }
    }, 5000);
  }
}
function togglePlay() {
  ctrl.value?.togglePlay();
}
function openFs() {
  ctrl.value?.openFs();
}

export const musicBus = {
  playing,
  register,
  unregister,
  syncPlaying,
  setOpenPanel,
  ensureAnd,
  togglePlay,
  openFs,
};