/**
 * 用 esbuild 把扩展打成单文件 CJS bundle。
 *
 * 目标与入口全部从 `package.json` 推导, 因此本文件不需要随插件内容改动:
 * - 扩展宿主是 CJS, 所以必须 bundle 成 cjs 才能被 require;
 * - 声明了 `browser` 入口的插件按 browser platform 打包 —— 一旦有人 import 了 node
 *   内置模块, 构建会立即失败, 而不是留到 Web Extension Host 运行时才炸;
 * - `target` 对齐 `engines.vscode` 下限所搭载的 Node 版本。
 *
 * 没有 `main` 的扩展 (纯主题, 图标主题这类无运行时代码的形态) 直接跳过构建并成功退出, 因此
 * `vscode:prepublish` 与调试任务照常可用; esbuild 也只在真正构建时才加载, 这类仓库不必安装它。
 *
 * 偏离骨架 (easy-graph 特有, 同步骨架时保留以下三处):
 * 1. askpass: git 在子进程里运行 `out/askpass/*.sh`, 脚本再用 node 运行 `askpassMain.js`, 所以它是
 *    独立入口, 脚本按原样拷到同一目录。
 * 2. webview: `web/*.ts` 是共享同一作用域的全局脚本 (原先由 tsc 逐个编译再拼接进一个 IIFE),
 *    这里按原顺序 (utils.ts, 其余文件, main.ts) 拼成一个虚拟入口交给 esbuild, 由它解析
 *    `src/types.ts` 的枚举; 样式按原顺序 (main.css, 其余文件) 拼接后压缩。产物在 `out/web/`。
 * 3. `fs`: Electron 会把 `fs` 换成识别 `.asar` 的版本, 仓库里的 `.asar` 文件因此会被当成目录;
 *    扩展 bundle 里的 `fs` 优先取 `original-fs` (Git Graph 原先在编译后替换 require 达到同样效果)。
 *
 * 用法: node build.mjs [--production] [--watch]
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

if (!pkg.main) {
	console.log("package.json 没有 main: 无运行时代码, 跳过构建");
	process.exit(0);
}

const esbuild = await import("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

const browser = Boolean(pkg.browser);
const outfile = pkg.main.replace(/^\.\//, "");

/** 让 bundle 里的 `fs` 在 Electron 下取 `original-fs`, 不可用时退回 `fs` (见文件头第 3 条)。 */
const originalFsPlugin = {
	name: "original-fs",
	setup(build) {
		build.onResolve({ filter: /^fs$/ }, args =>
			args.namespace === "original-fs"
				? { path: "fs", external: true }
				: { path: "fs", namespace: "original-fs" }
		);
		build.onLoad({ filter: /.*/, namespace: "original-fs" }, () => ({
			contents:
				"let fs; try { fs = require('original-fs'); } catch { fs = require('fs'); } module.exports = fs;",
			loader: "js",
		}));
	},
};

/** @type {import('esbuild').BuildOptions} */
const common = {
	bundle: true,
	format: "cjs",
	platform: browser ? "browser" : "node",
	target: browser ? "es2022" : "node22",
	external: ["vscode", "original-fs"],
	minify: production,
	sourcemap: production ? false : "linked",
	legalComments: "none",
	logLevel: "info",
	...(browser ? { define: { global: "globalThis" } } : {}),
};

/** @type {import('esbuild').BuildOptions[]} */
const builds = [
	{ ...common, entryPoints: ["src/extension.ts"], outfile, plugins: [originalFsPlugin] },
	{
		...common,
		entryPoints: ["src/askpass/askpassMain.ts"],
		outfile: "out/askpass/askpassMain.js",
	},
	{ ...common, ...webOptions(), format: "iife", platform: "browser", target: "es2022" },
];

/** webview 的虚拟入口 (见文件头第 2 条)。 */
function webOptions() {
	const files = readdirSync("web").filter(
		name => name.endsWith(".ts") && !name.endsWith(".d.ts")
	);
	const ordered = [
		"utils.ts",
		...files.filter(name => name !== "utils.ts" && name !== "main.ts").sort(),
		"main.ts",
	];
	const contents = [
		'import * as GG from "../src/types";',
		...ordered.map(name => `// web/${name}\n` + readFileSync(`web/${name}`, "utf8")),
	].join("\n");
	return {
		stdin: { contents, resolveDir: "web", sourcefile: "web.ts", loader: "ts" },
		outfile: "out/web/out.min.js",
	};
}

/** 拼接并压缩 webview 样式, 拷贝 askpass 脚本 (见文件头第 1, 2 条)。 */
async function buildAssets() {
	const styles = readdirSync("web/styles").filter(name => name.endsWith(".css"));
	const ordered = ["main.css", ...styles.filter(name => name !== "main.css").sort()];
	const css = ordered.map(name => readFileSync(`web/styles/${name}`, "utf8")).join("\n");
	const result = await esbuild.transform(css, {
		loader: "css",
		minify: production,
		legalComments: "none",
	});
	mkdirSync("out/web", { recursive: true });
	writeFileSync("out/web/out.min.css", result.code);

	mkdirSync("out/askpass", { recursive: true });
	for (const name of readdirSync("src/askpass").filter(name => name.endsWith(".sh"))) {
		copyFileSync(`src/askpass/${name}`, `out/askpass/${name}`);
	}
}

if (watch) {
	for (const options of builds) {
		const context = await esbuild.context(options);
		await context.watch();
	}
	await buildAssets();
	console.log(`watching… → ${outfile} (样式与 askpass 脚本改动后需重新运行)`);
} else {
	await Promise.all(builds.map(options => esbuild.build(options)));
	await buildAssets();
}
