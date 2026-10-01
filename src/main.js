import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";
import { currentSiteFont } from "./fonts";
import { initFrost } from "./utils/frost";

// 预加载站名手写体（config.siteFont 可配置）
const font = currentSiteFont();
const link = document.createElement("link");
link.rel = "preload";
link.href = "/font/" + font.file;
link.as = "font";
link.type = "font/ttf";
link.crossOrigin = "";
document.head.appendChild(link);

// 空闲时预取二级面板分包（MorePanel + 音乐播放器等）：App.vue 用 defineAsyncComponent
// 按需加载，这里保证用户真点击「探索更多」之前 chunk 基本已在缓存，打开无需等待；
// 首屏 JS 只剩主页本体，解析/执行成本显著下降。
const prewarmPanel = () => import("./components/MorePanel.vue");
if ("requestIdleCallback" in window) {
  requestIdleCallback(prewarmPanel, { timeout: 3000 });
} else {
  setTimeout(prewarmPanel, 1500);
}

createApp(App).mount("#app");

// 毛玻璃快照：壁纸就绪后把各卡背后的静态区域烘焙成 background-image 并撤掉
// 实时 backdrop-filter，交互脏区不再触发逐帧重模糊（详见 utils/frost.js）
initFrost();
