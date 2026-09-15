import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";
import { currentSiteFont } from "./fonts";

// 预加载站名手写体（config.siteFont 可配置，?font= 参数可临时覆盖预览）
const font = currentSiteFont();
const link = document.createElement("link");
link.rel = "preload";
link.href = "/font/" + font.file;
link.as = "font";
link.type = "font/ttf";
link.crossOrigin = "";
document.head.appendChild(link);

createApp(App).mount("#app");
