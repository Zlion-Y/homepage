import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";
import { readdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { currentSiteFont } from "./src/fonts.js";

// 本地 dev/preview 代理网易接口时补上伪装头，和线上 lib/netease.mjs 的函数代发
// 行为一致——裸请求（不带 UA/Referer）从 Vite 进程出去容易触发网易风控
const NETEASE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Referer: "https://music.163.com/",
};

const neteaseProxy = (rewrite) => ({
  target: "https://music.163.com",
  changeOrigin: true,
  headers: NETEASE_HEADERS,
  rewrite,
});

/**
 * 构建产物字体裁剪：public/font/ 里 7 个候选字体共约 680KB，但 siteFont
 * 同一时刻只用一个。开发时保留全部（方便 config.js 一行切换预览），
 * 打包后只把现役字体留在 dist/font/，其余从部署产物里剔除。
 * 换字体 = 改 config.js 再重新构建，Vercel 每次部署都会按当前配置裁。
 */
function pruneUnusedFonts() {
  return {
    name: "prune-unused-fonts",
    closeBundle() {
      const dir = fileURLToPath(new URL("./dist/font", import.meta.url));
      // public/font 整个被移除（或输出目录变动）时别让构建炸在 ENOENT 上
      if (!existsSync(dir)) return;
      const keep = currentSiteFont().file;
      let removed = 0;
      for (const f of readdirSync(dir)) {
        if (f.toLowerCase().endsWith(".ttf") && f !== keep) {
          rmSync(join(dir, f));
          removed++;
        }
      }
      if (removed) console.log(`[prune-fonts] 已从构建产物移除 ${removed} 个未启用字体（保留 ${keep}）`);
    },
  };
}

export default defineConfig({
  plugins: [vue(), pruneUnusedFonts()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // 博客 RSS 同源代理（生产环境由 vercel.json 的 rewrites 提供）
  server: {
    proxy: {
      "/blog-rss": {
        target: "https://blog.example.com", // 改成你自己的博客域名
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/blog-rss/, "/rss.xml"),
      },
      "/netease-search": neteaseProxy((path) => path.replace(/^\/netease-search/, "/api/search/get/web")),
      "/netease-album": neteaseProxy((path) => path.replace(/^\/netease-album/, "/api/v1/album")),
      "/netease-songs": neteaseProxy((path) => path.replace(/^\/netease-songs/, "/api/song/detail/")),
    },
  },
  preview: {
    proxy: {
      "/blog-rss": {
        target: "https://blog.example.com", // 改成你自己的博客域名
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/blog-rss/, "/rss.xml"),
      },
      "/netease-search": neteaseProxy((path) => path.replace(/^\/netease-search/, "/api/search/get/web")),
      "/netease-album": neteaseProxy((path) => path.replace(/^\/netease-album/, "/api/v1/album")),
      "/netease-songs": neteaseProxy((path) => path.replace(/^\/netease-songs/, "/api/song/detail/")),
    },
  },
  build: {
    chunkSizeWarningLimit: 1024,
  },
});
