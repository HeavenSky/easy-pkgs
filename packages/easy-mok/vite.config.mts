import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const DEV_API = process.env.MOCK_DEV_API || "http://127.0.0.1:4100";

export default defineConfig(({ command }) => ({
	root: path.resolve(import.meta.dirname, "src/ui"),
	// 构建产物用相对路径, 管理页由服务端注入 <base href="<挂载前缀>/ui/">, 宿主把 easy-mok 挂在子路径时资源也能找到
	base: command === "build" ? "./" : "/__mock/ui/",
	plugins: [react(), tailwindcss()],
	resolve: { alias: { "@": path.resolve(import.meta.dirname, "src/ui") } },
	build: {
		outDir: path.resolve(import.meta.dirname, "dist/ui"),
		emptyOutDir: true,
		chunkSizeWarningLimit: 900,
	},
	server: {
		port: 4101,
		proxy: { "/__mock/api": { target: DEV_API, changeOrigin: false } },
	},
}));
