import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { currentSiteFont } from "./src/fonts.js";

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
      "/netease-search": {
        target: "https://music.163.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/netease-search/, "/api/search/get/web"),
      },
      "/netease-album": {
        target: "https://music.163.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/netease-album/, "/api/v1/album"),
      },
      "/netease-songs": {
        target: "https://music.163.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/netease-songs/, "/api/song/detail/"),
      },
    },
  },
  preview: {
    proxy: {
      "/blog-rss": {
        target: "https://blog.example.com", // 改成你自己的博客域名
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/blog-rss/, "/rss.xml"),
      },
      "/netease-search": {
        target: "https://music.163.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/netease-search/, "/api/search/get/web"),
      },
      "/netease-album": {
        target: "https://music.163.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/netease-album/, "/api/v1/album"),
      },
      "/netease-songs": {
        target: "https://music.163.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/netease-songs/, "/api/song/detail/"),
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1024,
  },
});
