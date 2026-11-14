import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const DEV_API = process.env.MOCK_DEV_API || "http://127.0.0.1:4100";

// vite 的 SPA 回退只在 base(/__mock/ui/) 下生效, 直接访问 /__mock/<页面> 只会得到 404 提示;
// 重定向到 /__mock/ui/ 下, 与管理页客户端路由(wouter 基座含 /ui 段)对齐. 仅 dev: 生产由服务端 SPA_PATHS 兜底
const redirectMockUi = (): Plugin => ({
	name: "easy-mok:redirect-mock-ui",
	apply: "serve",
	configureServer(server) {
		server.middlewares.use((req, res, next) => {
			const url = req.url || "/";
			const q = url.indexOf("?");
			const path = q < 0 ? url : url.slice(0, q);
			const query = q < 0 ? "" : url.slice(q);
			// 不动 /__mock/ui(页面与静态资源)与 /__mock/api(代理到 easy-mok 服务端), 其余 /__mock/* 视为页面路径
			const m = /^\/__mock\/(?!ui(?:\/|$)|api(?:\/|$))(.*)$/.exec(path);
			if (!m || (req.method !== "GET" && req.method !== "HEAD")) {
				next();
				return;
			}
			res.statusCode = 302;
			res.setHeader("Location", `/__mock/ui/${m[1]}${query}`);
			res.end();
		});
	},
});

export default defineConfig(({ command }) => ({
	root: path.resolve(import.meta.dirname, "src/ui"),
	// 构建产物用相对路径, 管理页由服务端注入 <base href="<挂载前缀>/ui/">, 宿主把 easy-mok 挂在子路径时资源也能找到
	base: command === "build" ? "./" : "/__mock/ui/",
	plugins: [react(), tailwindcss(), redirectMockUi()],
	resolve: { alias: { "@": path.resolve(import.meta.dirname, "src/ui") } },
	build: {
		outDir: path.resolve(import.meta.dirname, "dist/ui"),
		emptyOutDir: true,
		chunkSizeWarningLimit: 900,
	},
	server: { port: 4101, proxy: { "/__mock/api": { target: DEV_API, changeOrigin: false } } },
}));
