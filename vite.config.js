import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // 博客 RSS 同源代理（生产环境由 vercel.json 的 rewrites 提供）
  server: {
    proxy: {
      "/blog-rss": {
        target: "https://blog.zlion.top",
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
        target: "https://blog.zlion.top",
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
