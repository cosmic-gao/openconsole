import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

/** 后端 SSE 服务端口（与 server/index.ts 默认一致；可用 CHAT_SERVER_PORT 覆盖）。 */
const SERVER_PORT = process.env["CHAT_SERVER_PORT"] ?? "8787";

// 开发期：Vite 跑前端(5173)，把 /api 代理到 SSE 后端，省掉 CORS。
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: `http://localhost:${SERVER_PORT}`,
        changeOrigin: true,
      },
    },
  },
});
