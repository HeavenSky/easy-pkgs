// 扫描与加载 mock 文件, 合并 JSON 场景, 生成路由表与加载诊断, 监听变化后全量重建
import fs from "fs";
import path from "path";
import { watch } from "chokidar";
import { createJiti } from "jiti";
import { compileRoute, matchRoute, parseKey, routeIdOf } from "./route";
import type { CompiledRoute, ParsedKey } from "./route";
import { codeScenes } from "./scene";
import { compileScript } from "./script";
import type { Scene } from "./scene";
import { SCENES_DIR, GUI_FILE } from "./files";
import type { SceneFile, createFileStore } from "./files";
import { etagOf, isPlainObject } from "./util";

export type Diagnostic = {
	type:
		| "load-error"
		| "invalid-key"
		| "invalid-route"
		| "duplicate"
		| "missing-default"
		| "orphan-scenes"
		| "broken-scene-file"
		| "script-error"
		| "state"
		| "stale-state";
	message: string;
	file?: string;
	line?: number | null;
	key?: string;
	routeId?: string;
};
export type RouteEntry = {
	id: string;
	key: string;
	methods: string[];
	path: string;
	weight: number;
	order: number;
	source: { type: "code" | "gui" | "builtin"; file: string | null; line: number | null };
	compiled: CompiledRoute;
	scenes: Map<string, Scene>;
};
export type Matcher = { route: RouteEntry; method: string; routeOrder: number };
type SnapItem = {
	key: string;
	value: unknown;
	parsed: ParsedKey;
	compiled: CompiledRoute;
	line: number | null;
};
/** 入口快照: 导入, key 解析与路径编译全部成功才生成 */
type Snapshot = { flag: unknown; items: SnapItem[] };
const EMPTY: Snapshot = { flag: undefined, items: [] };

/** 入口中的某个 key 无法解析或编译; 整个入口按失败处理 */
class EntryError extends Error {
	type: "invalid-key" | "invalid-route";
	key: string;

	constructor(type: "invalid-key" | "invalid-route", key: string, message: string) {
		super(message);
		this.type = type;
		this.key = key;
	}
}

const isMockFile = (file: string) =>
	/\.([cm]?[jt]s|json)$/.test(file) && !/\.d\.[cm]?ts$/.test(file);
/** 不当作入口的目录与文件名: node_modules, . 开头, _ 开头(放公共方法与数据, 被入口引用时仍随之重载; __scenes__ 也因此跳过) */
const skipName = (name: string) => name === "node_modules" || /^[._]/.test(name);
const CONFIG_JSON = /^(package|[jt]sconfig.*)\.json$/;

/** mock 入口: 目录下的 js/cjs/mjs/ts/cts/mts/json, 跳过 .d.ts, 工程配置 JSON 与 skipName 命中的路径段; 根目录的 __gui__.json 例外 */
export const isEntry = (folder: string, file: string) => {
	const rel = path.relative(folder, file);
	if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
		return false;
	}
	if (rel === GUI_FILE) {
		return true;
	}
	return (
		isMockFile(file) &&
		!CONFIG_JSON.test(path.basename(file)) &&
		!rel.split(path.sep).some(skipName)
	);
};

/** child 是 dir 本身或位于其下 */
const isWithin = (dir: string, child: string) => {
	const rel = path.relative(dir, child);
	return !rel.startsWith("..") && !path.isAbsolute(rel);
};

/** dir 本身或最近的已存在祖先目录 */
const nearestExisting = (dir: string) => {
	let d = dir;
	while (!fs.existsSync(d) && path.dirname(d) !== d) {
		d = path.dirname(d);
	}
	return d;
};

/** 收集目录下的 mock 入口; 不跟随软链目录(软链环会无限递归), 目录不存在时返回空数组 */
export const walk = (folder: string, dir = folder): string[] => {
	let items: fs.Dirent[] = [];
	try {
		items = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}
	return items.flatMap(item => {
		const file = path.join(dir, item.name);
		if (item.isDirectory()) {
			return skipName(item.name) ? [] : walk(folder, file);
		}
		return isEntry(folder, file) ? [file] : [];
	});
};

/** 顶层 await 的报错没有指出原因, 补一句提示 */
const hintOf = (message: string) =>
	/await is only valid|top-level await/i.test(message)
		? " (mock 文件不支持顶层 await, 请把异步逻辑放进处理函数, 或改为导出无参的 async 函数)"
		: "";

export const clearRequireCache = (id: string) => {
	const mod = require.cache[id];
	if (!mod) {
		return;
	}
	const parent = (mod as any).parent;
	[mod, parent].forEach(m => {
		if (m && Array.isArray(m.children)) {
			const i = m.children.indexOf(mod);
			if (i >= 0) m.children.splice(i, 1);
		}
	});
	delete require.cache[id];
};

const lineOf = (file: string, key: string) => {
	let text = "";
	try {
		text = fs.readFileSync(file, "utf8");
	} catch {
		return null;
	}
	const quoted = [JSON.stringify(key), `'${key}'`, `\`${key}\``];
	for (const q of quoted) {
		const i = text.indexOf(q);
		if (i >= 0) {
			return text.slice(0, i).split("\n").length;
		}
	}
	return null;
};

const SPEC_RE =
	/\b(?:require|import)\s*\(\s*(['"`])([^'"`]+)\1\s*\)|\b(?:import|export)\s[^'"`;]*?\bfrom\s*(['"])([^'"]+)\3|\bimport\s*(['"])([^'"]+)\5/g;
const EXTS = [".ts", ".mts", ".cts", ".js", ".mjs", ".cjs", ".json"];
const SELF_DIRS = ["src", "dist"].map(d => path.resolve(__dirname, "../..", d) + path.sep);
/** 不随 mock 重载的模块: 第三方包与 easy-mok 自身 */
const isForeign = (id: string) =>
	/[\\/]node_modules[\\/]/.test(id) || SELF_DIRS.some(d => id.startsWith(d));
const isFile = (file: string) => {
	try {
		return fs.statSync(file).isFile();
	} catch {
		return false;
	}
};

/** 解析相对或绝对路径的引用; 包名与别名不处理, 它们不随 mock 热更新 */
const resolveLocal = (from: string, spec: string) => {
	if (!/^\.{1,2}(\/|$)|^\//.test(spec)) {
		return null;
	}
	const base = path.resolve(path.dirname(from), spec);
	const candidates = [
		base,
		...EXTS.map(e => base + e),
		...EXTS.map(e => path.join(base, `index${e}`)),
	];
	if (/\.[cm]?js$/.test(base)) candidates.push(base.replace(/js$/, "ts")); // TS 中 import "./x.js" 指向 x.ts
	const hit = candidates.find(isFile);
	if (!hit) {
		return null;
	}
	try {
		return fs.realpathSync(hit);
	} catch {
		return hit;
	} // require.cache 以真实路径为键
};

/** 静态扫描入口的项目内传递依赖; jiti 不为 JSON 与已缓存的 CJS 模块登记 children, 缓存差集也漏掉宿主预加载的模块 */
export const collectDeps = (entry: string) => {
	const seen = new Set<string>();
	const stack = [entry];
	while (stack.length) {
		const file = stack.pop() as string;
		if (seen.has(file)) {
			continue;
		}
		seen.add(file);
		if (file.endsWith(".json")) {
			continue;
		}
		let src = "";
		try {
			src = fs.readFileSync(file, "utf8");
		} catch {
			continue;
		}
		for (const m of src.matchAll(SPEC_RE)) {
			const dep = resolveLocal(file, m[2] || m[4] || m[6]);
			if (dep && !isForeign(dep)) stack.push(dep);
		}
	}
	seen.delete(entry);
	return seen;
};

/**
 * 入口只接受 module.exports = 路由对象 或 export default 路由对象.
 * jiti 开启 interopDefault 后返回 Proxy: ESM 入口自带 __esModule, 取 default(仅命名导出时没有 default, 报错);
 * CJS 入口的 __esModule 由 Proxy 合成, 浅拷贝成普通对象再校验.
 */
export const exportedTable = (mod: unknown) => {
	const esm =
		!!mod && typeof mod === "object" && Object.prototype.hasOwnProperty.call(mod, "__esModule");
	const raw = esm ? ("default" in (mod as object) ? (mod as any).default : undefined) : mod;
	return isPlainObject(raw) ? { ...raw } : raw;
};

const routeTableOf = (mod: unknown) => {
	const value = exportedTable(mod);
	if (!isPlainObject(value)) {
		throw new TypeError(
			"导出必须是路由对象: module.exports = {...} 或 export default {...}, 不支持 Promise, 函数与仅命名导出"
		);
	}
	return value;
};

export const createRegistry = (opt: {
	folder: string;
	builtin?: Record<string, unknown>;
	fileStore: ReturnType<typeof createFileStore>;
	watch?: boolean;
	onReload?: () => void;
	/** jiti 转译缓存目录 */
	cacheDir?: string;
}) => {
	const { folder, fileStore } = opt;
	// 经 jiti 加载以支持 ESM 与 TS 写法; 模块仍登记在 require.cache, 重载时按依赖清缓存
	// interopDefault 必须开启: 关闭时转译后的 import x from "cjs 模块"(如 node:path, mockjs)取到 undefined
	const jiti = createJiti(__filename, {
		interopDefault: true,
		moduleCache: true,
		tryNative: false,
		fsCache: opt.cacheDir || true,
	});
	const files = new Set(walk(folder));
	const deps = new Set<string>(); // mock 入口的项目内传递依赖, 含宿主预加载的模块
	const watchedDeps = new Set<string>(); // 额外监听的 mock 目录外依赖
	const lastGood = new Map<string, Snapshot>(); // 各入口上次导入, 校验与编译都成功的快照
	const lastGoodScenes = new Map<string, SceneFile>(); // 各场景文件上次能解析的内容
	let reported = new Map<string, string>(); // 已打印到终端的诊断, 同一问题不重复打印, 消失后清除
	let routes = new Map<string, RouteEntry>();
	let matchers: Matcher[] = [];
	let diagnostics: Diagnostic[] = [];
	let orphans: Array<{ file: string; key: string }> = [];
	let codeEnabled = true;
	const stats = new Map<string, { hits: number; lastHit: number | null }>();
	const guiFile = path.join(folder, GUI_FILE);

	// mock 目录不存在时监听最近的已存在祖先目录, 只放行通向 mock 目录的路径, 目录稍后创建(含多级)也能自动加载
	const root = nearestExisting(folder);
	const outside = (p: string) =>
		root !== folder && !watchedDeps.has(p) && !isWithin(folder, p) && !isWithin(p, folder);
	const watcher =
		opt.watch === false
			? null
			: watch(root, {
					ignoreInitial: true,
					ignored: p => /[\\/]node_modules([\\/]|$)/.test(p) || outside(p),
					followSymlinks: false, // 与 walk 一致不跟随软链, 软链环会让 chokidar 报 ELOOP
				});
	// 未监听的 error 事件会让宿主进程退出; 权限, 句柄耗尽等错误只告警
	if (watcher)
		watcher.on("error", err =>
			console.warn("[easy-mok] 文件监听出错:", (err as Error).message || err)
		);

	/** 校验并编译路由对象; strict 时任一 key 出错即抛 EntryError, 否则记诊断并跳过该 key(内置路由) */
	const compileEntry = (
		file: string | null,
		values: Record<string, unknown>,
		strict: boolean
	): Snapshot => {
		const snap: Snapshot = { flag: undefined, items: [] };
		Object.keys(values).forEach(key => {
			if (key === "MOCK") {
				snap.flag = values[key];
				return;
			}
			const line = file ? lineOf(file, key) : null;
			let error: EntryError | null = null;
			const parsed = parseKey(key);
			let compiled: CompiledRoute | null = null;
			if (!parsed) {
				error = new EntryError(
					"invalid-key",
					key,
					`无法解析的路由 key, 应为 "METHOD 路径": ${key}`
				);
			} else {
				try {
					compiled = compileRoute(parsed.path);
				} catch (err) {
					error = new EntryError(
						"invalid-route",
						key,
						`路由路径无法编译: ${key}: ${(err as Error).message}`
					);
				}
			}
			if (error) {
				if (strict) {
					throw error;
				}
				diagnostics.push({
					type: error.type,
					message: error.message,
					file: file || undefined,
					line,
					key,
				});
				return;
			}
			// 值为 undefined 的 key 跳过(如 { "GET /x": process.env.X && ... }); null 与 __gui__.json 一致表示响应体为 null
			if (values[key] !== undefined)
				snap.items.push({
					key,
					value: values[key],
					parsed: parsed as ParsedKey,
					compiled: compiled as CompiledRoute,
					line,
				});
		});
		return snap;
	};

	/** 导入, key 解析, 路径编译全部成功才更新快照; 任一失败整个入口沿用上次的快照, 免得编辑中的错误让路由消失并回落到真实服务 */
	const load = (file: string): Snapshot => {
		const before = new Set(Object.keys(require.cache));
		let snap: Snapshot;
		try {
			snap = compileEntry(file, routeTableOf(jiti(file)), true);
			lastGood.set(file, snap);
		} catch (err) {
			const e = err as Error;
			const prev = lastGood.get(file);
			const text = String((e && e.message) || e);
			const suffix = prev ? " (整个文件沿用上次成功加载的路由)" : " (该文件的路由未生效)";
			if (err instanceof EntryError) {
				diagnostics.push({
					type: err.type,
					message: `${text}${suffix}`,
					file,
					line: lineOf(file, err.key),
					key: err.key,
				});
			} else {
				diagnostics.push({
					type: "load-error",
					message: `${(e && e.name) || "Error"}: ${text}${hintOf(text)}${suffix}`,
					file,
				});
			}
			snap = prev || EMPTY;
		}
		Object.keys(require.cache).forEach(id => {
			if (!before.has(id) && !isForeign(id)) deps.add(id);
		});
		return snap;
	};

	/** 监听集合与本轮依赖对齐: 新增的加入, 不再引用的移除 */
	const syncWatch = () => {
		if (!watcher) {
			return;
		}
		const want = new Set([...deps].filter(id => path.relative(folder, id).startsWith("..")));
		watchedDeps.forEach(id => {
			if (!want.has(id)) {
				watcher.unwatch(id);
				watchedDeps.delete(id);
			}
		});
		want.forEach(id => {
			if (!watchedDeps.has(id)) {
				watchedDeps.add(id);
				watcher.add(id);
			}
		}); // 先登记, ignored 据此放行祖先目录监听下的依赖
	};

	/** 脚本场景运行时 require 的项目内模块并入依赖, 改动后与 mock 文件的依赖一样触发重载并清缓存 */
	const trackScriptDep = (id: string) => {
		if (!path.isAbsolute(id) || isForeign(id) || deps.has(id)) {
			return;
		}
		[id, ...collectDeps(id)].forEach(dep => deps.add(dep));
		syncWatch();
	};

	/** 诊断打印到终端: 按 类型 + 文件 + key 去重, 消息变化才再打印; 本轮不再出现的从记录中清除, 再次出现时重新打印 */
	const report = () => {
		const next = new Map<string, string>();
		diagnostics.forEach(d => {
			const id = `${d.type}\n${d.file || ""}\n${d.key || ""}`;
			next.set(id, d.message);
			if (reported.get(id) === d.message) {
				return;
			}
			const where = d.file ? `${d.file}${d.line ? `:${d.line}` : ""}` : "内置路由";
			if (d.type === "load-error") {
				console.error(`[easy-mok] mock 文件加载失败: ${where}\n  ${d.message}`);
			} else {
				console.warn(`[easy-mok] ${d.message} (${where})`);
			}
		});
		reported = next;
	};

	const reload = () => {
		const fresh = new Set<string>();
		files.forEach(file => collectDeps(file).forEach(dep => fresh.add(dep)));
		[...files, ...deps, ...fresh].forEach(clearRequireCache);
		deps.clear();
		fresh.forEach(dep => deps.add(dep));
		[...lastGood.keys()].forEach(file => {
			if (!files.has(file)) lastGood.delete(file);
		}); // 删除的入口不再沿用
		diagnostics = [];
		orphans = [];
		codeEnabled = true;
		const next = new Map<string, RouteEntry>();
		let order = 0;
		const sources: Array<{
			type: RouteEntry["source"]["type"];
			file: string | null;
			snap: Snapshot;
		}> = [];
		if (opt.builtin)
			sources.push({
				type: "builtin",
				file: null,
				snap: compileEntry(null, opt.builtin, false),
			});
		[...files].sort().forEach(file => {
			sources.push({ type: file === guiFile ? "gui" : "code", file, snap: load(file) });
		});
		sources.forEach(({ type, file, snap }) => {
			if (snap.flag !== undefined) {
				codeEnabled = snap.flag !== false;
			}
			snap.items.forEach(({ key, value, parsed, compiled, line }) => {
				const prev = next.get(key);
				if (prev) {
					diagnostics.push({
						type: "duplicate",
						key,
						routeId: prev.id,
						file: file || undefined,
						line,
						message: `同一路由在多处声明, 后者生效: ${prev.source.file || "内置"} → ${file || "内置"}`,
					});
				}
				const { scenes, missingDefault } = codeScenes(value);
				if (missingDefault) {
					diagnostics.push({
						type: "missing-default",
						message: "scenes() 缺少 default, 已用第一个场景代替",
						file: file || undefined,
						line,
						key,
						routeId: routeIdOf(key),
					});
				}
				next.set(key, {
					id: routeIdOf(key),
					key,
					methods: parsed.methods,
					path: parsed.path,
					weight: parsed.weight,
					order: prev ? prev.order : order++,
					source: { type, file, line },
					compiled,
					scenes,
				});
			});
		});
		const sceneFiles = fileStore.listSceneFiles();
		[...lastGoodScenes.keys()].forEach(file => {
			if (!sceneFiles.some(f => f.file === file)) lastGoodScenes.delete(file);
		}); // 删除的文件不再沿用
		sceneFiles.forEach(({ file, data: parsed }) => {
			let data = parsed;
			if (data) {
				lastGoodScenes.set(file, data);
			} else {
				data = lastGoodScenes.get(file) || null;
				diagnostics.push({
					type: "broken-scene-file",
					message: `场景文件不是合法的 { key, scenes } JSON, ${data ? "沿用上次能解析的内容" : "已忽略"}`,
					file,
				});
				if (!data) {
					return;
				}
			}
			const route = next.get(data.key);
			if (!route) {
				orphans.push({ file, key: data.key });
				diagnostics.push({
					type: "orphan-scenes",
					message: `场景文件对应的路由已不存在: ${data.key}`,
					file,
					key: data.key,
				});
				return;
			}
			Object.entries(data.scenes).forEach(([name, env]) => {
				const code = route.scenes.get(name);
				let handler: Function | undefined;
				if (env && typeof env.script === "string") {
					try {
						handler = compileScript(env.script, folder, file, trackScriptDep);
					} catch (err) {
						diagnostics.push({
							type: "script-error",
							message: `场景 ${name} 的脚本无法编译, 已忽略该场景: ${(err as Error).message || err}`,
							file,
							key: data.key,
							routeId: route.id,
						});
						return;
					}
				}
				route.scenes.set(name, {
					name,
					source: "json",
					kind: "envelope",
					value: env,
					etag: etagOf(env),
					overrides: !!code && code.source === "code",
					handler,
				});
			});
		});
		const pathOrder: Record<string, number> = {};
		const list: Matcher[] = [];
		[...next.values()]
			.sort((a, b) => a.order - b.order)
			.forEach(route => {
				if (!(route.path in pathOrder)) {
					pathOrder[route.path] = route.order;
				}
				route.methods.forEach(method =>
					list.push({ route, method, routeOrder: pathOrder[route.path] })
				);
			}); // 排序: 权重高优先 > 同一路径先声明优先 > 具体方法优先于 ALL > 声明顺序
		list.sort(
			(a, b) =>
				b.route.weight - a.route.weight ||
				a.routeOrder - b.routeOrder ||
				Number(a.method === "ALL") - Number(b.method === "ALL") ||
				a.route.order - b.route.order
		);
		routes = next;
		matchers = list;
		syncWatch();
		report();
		if (opt.onReload) opt.onReload();
	};

	let timer: NodeJS.Timeout | null = null;
	const schedule = () => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			reload();
		}, 100);
	};
	if (watcher) {
		watcher.on("all", (type, file) => {
			const own = !path.relative(folder, file).startsWith("..");
			const inScenes =
				own &&
				path.relative(path.join(folder, SCENES_DIR), file).split(path.sep)[0] !== "..";
			const ownMock = isEntry(folder, file); // 与 walk 同一判定; _ 开头等非入口文件靠 deps 触发重载
			if (type === "add" && ownMock) {
				files.add(file);
			}
			if (type === "unlink") {
				files.delete(file);
			}
			if (type === "unlinkDir") {
				files.forEach(f => f.startsWith(file + path.sep) && files.delete(f));
			}
			if (type === "addDir" && file === folder) {
				walk(folder).forEach(f => files.add(f));
				schedule();
			} // 目录连同文件一起创建时补登已有入口
			if (ownMock || inScenes || deps.has(file) || type.startsWith("unlink")) schedule();
		});
	}
	reload(); // 启动时同步加载, 避免首批请求漏掉 mock

	return {
		reload,
		/** 管理接口写文件后立即重建, 不等监听防抖; 新文件需先登记 */
		reloadNow: (file?: string) => {
			if (file && isEntry(folder, file)) files.add(file);
			reload();
		},
		get routes() {
			return routes;
		},
		get diagnostics() {
			return diagnostics;
		},
		get orphans() {
			return orphans;
		},
		get codeEnabled() {
			return codeEnabled;
		},
		get fileCount() {
			return files.size;
		},
		stats,
		/** exact 为 true 时只匹配显式声明该方法的路由, 不含 ALL */
		find: (method: string, pathname: string, exact = false) => {
			for (const m of matchers) {
				if (m.method !== method && (exact || m.method !== "ALL")) {
					continue;
				}
				const data = matchRoute(m.route.compiled, pathname);
				if (data) {
					return { route: m.route, data };
				}
			}
			return null;
		},
		hit: (id: string) => {
			const s = stats.get(id) || { hits: 0, lastHit: null };
			s.hits += 1;
			s.lastHit = Date.now();
			stats.set(id, s);
		},
		close: async () => {
			if (timer) clearTimeout(timer);
			if (watcher) await watcher.close();
		},
	};
};
