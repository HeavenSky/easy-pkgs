import path from "node:path";
import { defineConfig } from "vite";

// 悬浮条单独打成 IIFE, 由 src/float/loader.js 在页面中按需加载
export default defineConfig({
	build: {
		outDir: path.resolve(import.meta.dirname, "dist/ui"),
		emptyOutDir: false,
		lib: {
			entry: path.resolve(import.meta.dirname, "src/float/main.ts"),
			formats: ["iife"],
			name: "EasyMokFloat",
			fileName: () => "float.js",
		},
	},
});
