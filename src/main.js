import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";
import { siteConfig } from "./config";
import { resolveSiteFont } from "./fonts";

// 按配置预加载站名手写体（config.siteFont 可换，静态 preload 写死会浪费带宽）
const font = resolveSiteFont(siteConfig.siteFont);
const link = document.createElement("link");
link.rel = "preload";
link.href = "/font/" + font.file;
link.as = "font";
link.type = "font/ttf";
link.crossOrigin = "";
document.head.appendChild(link);

createApp(App).mount("#app");
