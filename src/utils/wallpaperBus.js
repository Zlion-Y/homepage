import { ref } from "vue";

// Background 壁纸实际加载成功后写入（展示用绝对 URL，不带探针随机参数）；
// MusicCard 全屏无封面时读它做背景兜底，替代此前的 querySelector DOM 探测（E5 解耦）。
export const wallpaperUrl = ref("");

// 同一张图的原始像素尺寸（{ w, h }），由 Background 的探针 <img> 在 onload 时
// 一并写入。frost.js 要靠它算 cover 尺寸——如果让 frost 自己 new Image() 再加载
// 一次，就得多等一次 load（遇上 no-store/cache-busting 的源就是又一次完整网络
// 往返），而那一步卡在「揭幕门闩」的关键路径上。回退极光 / 展示层加载失败时清空。
export const wallpaperSize = ref(null);
