import { ref } from "vue";

// Background 壁纸实际加载成功后写入（展示用绝对 URL，不带探针随机参数）；
// MusicCard 全屏无封面时读它做背景兜底，替代此前的 querySelector DOM 探测（E5 解耦）。
export const wallpaperUrl = ref("");
