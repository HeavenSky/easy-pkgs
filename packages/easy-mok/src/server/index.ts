// easy-mok 入口: 组装路由表, 运行状态, 请求日志, 管理接口, 返回可挂到任意宿主的 express 应用
import crypto from "crypto";
import fs from "fs";
import path from "path";
import express from "express";
import type { Express, NextFunction, Request, Response } from "express";
import type { IncomingMessage, ServerResponse } from "http";
import { createRegistry } from "./loader";
import { createStateStore } from "./state";
import { createJournal } from "./journal";
import { createEvents } from "./events";
import { createFileStore } from "./files";
import { createGuard } from "./security";
import { createResponder } from "./respond";
import { createAdmin } from "./admin";
import { scenes } from "./scene";
import { compileRoute } from "./route";
import { createIgnore } from "./ignore";

const { version } = require("../../package.json") as { version: string };

export const FLOAT_PATH = "/__mock/float.js";

export interface MockOptions {
	/** mock 目录, 相对 cwd, 默认 src/mocks */
	folder?: string;
	/** 解析相对路径的基准目录, 默认 process.cwd() */
	cwd?: string;
	/** 先于 mock 文件加载的内置路由 */
	builtin?: Record<string, unknown>;
	/** 是否提供管理页与管理接口 /__mock/, 默认读环境变量 MOCK_UI !== "0" */
	ui?: boolean;
	/** 是否提供页内悬浮条, 默认读 MOCK_FLOAT !== "0", ui 关闭时恒为 false */
	float?: boolean;
	/** 是否允许私有网段访问管理接口, 并把私有网段 IP 来源当作可信跨域来源; 默认读 MOCK_LAN === "1" */
	lan?: boolean;
	/**
	 * 额外受信任的 Host 名, 默认读 MOCK_HOSTS(逗号分隔); 以 . 开头时同时匹配子域名.
	 * 本机名, IP 与 *.localhost 始终受信任; mock 路由收到其他 Host 时返回 403(防 DNS rebinding), 写 "*" 时 mock 路由不校验 Host
	 */
	hosts?: string[];
	/** 请求日志保留条数, 默认 500 */
	logSize?: number;
	/** 运行状态文件, 默认 node_modules/.cache/easy-mok/state.json */
	stateFile?: string;
	/** 是否监听文件变化, 默认 true */
	watch?: boolean;
	/** 追加的请求忽略规则(命中的请求不进请求日志, 不打印终端日志), 如 ["/health", "GET /static/**"] */
	ignore?: string[];
	/** 为 false 时关闭内置忽略规则(浏览器探测与 dev server 内部请求) */
	ignoreDefaults?: boolean;
}

export type MockHandler = (req: Request, res: Response, next: NextFunction) => unknown;
export type ProxyFactory = () => Record<string, unknown>;
export type SceneValue = unknown | MockHandler | ProxyFactory;

const resolveOptions = (options: MockOptions = {}) => {
	const env = process.env;
	const cwd = path.resolve(options.cwd || process.cwd());
	const ui = options.ui ?? env.MOCK_UI !== "0";
	let folder = path.resolve(cwd, options.folder || "src/mocks");
	// 取真实路径: require.cache 与依赖以真实路径为键, 软链路径下的监听事件会对不上
	try { folder = fs.realpathSync(folder); } catch (_error) { /* 目录可能尚未创建 */ }
	return {
		cwd,
		folder,
		builtin: options.builtin,
		ui,
		float: ui && (options.float ?? env.MOCK_FLOAT !== "0"),
		lan: options.lan ?? env.MOCK_LAN === "1",
		hosts: options.hosts || String(env.MOCK_HOSTS || "").split(",").map(s => s.trim()).filter(Boolean),
		logSize: options.logSize || 500,
		stateFile: path.resolve(cwd, options.stateFile || "node_modules/.cache/easy-mok/state.json"),
		watch: options.watch !== false,
		ignore: (options.ignore || []).map(String),
		ignoreDefaults: options.ignoreDefaults !== false,
	};
};

export type ResolvedOptions = ReturnType<typeof resolveOptions>;

/** mock 目录不存在时只警告不抛错, 否则之后的请求全部未命中而毫无提示; 关闭监听时创建后需重启 */
const warnMissingFolder = (folder: string, watching: boolean) => {
	if (fs.existsSync(folder)) { return; }
	const later = watching ? "创建后自动加载, 无需重启" : "创建后需重启 easy-mok 才能加载(已关闭文件监听)";
	console.warn(`[easy-mok] mock 目录不存在: ${folder}\n  所有请求都不会命中 mock. 请创建该目录并放入 mock 文件(如 mkdir -p "${folder}"), ${later};`
		+ " 或用 folder 选项 / --folder / MOCK_FOLDER 指向已有目录");
};

export interface MockApp extends Express {
	(req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void): void;
	/** 命中 mock 且不是放行模式时返回 true, 供 fastify 等先判断再接管响应 */
	match(req: IncomingMessage): boolean;
	/** 关闭文件监听与 SSE 连接 */
	close(): Promise<void>;
	/** 悬浮条入口脚本路径, 未启用时为 null */
	floatScript: string | null;
	mock: {
		options: ResolvedOptions;
		registry: ReturnType<typeof createRegistry>;
		store: ReturnType<typeof createStateStore>;
		journal: ReturnType<typeof createJournal>;
		events: ReturnType<typeof createEvents>;
		bootId: string;
	};
}

/** 创建 mock 应用; 返回值是 express 应用, 可直接 app.use(mock) 或作为 (req, res, next) 调用. */
export const createMock = (options?: MockOptions): MockApp => {
	const opt = resolveOptions(options);
	warnMissingFolder(opt.folder, opt.watch);
	const bootId = crypto.randomBytes(6).toString("hex");
	const events = createEvents();
	const fileStore = createFileStore(opt.folder);
	const store = createStateStore(opt.stateFile);
	let responder: ReturnType<typeof createResponder> | null = null; // 注册表启动时先加载一次, 此时还没有代理需要清理
	const registry = createRegistry({
		folder: opt.folder, builtin: opt.builtin, fileStore, watch: opt.watch,
		cacheDir: path.resolve(opt.cwd, "node_modules/.cache/easy-mok/jiti"),
		onReload: () => { responder && responder.prune(); events.emit("changed", { scope: "routes" }); },
	});
	const journal = createJournal({ size: opt.logSize, onLog: entry => events.emit("log", entry) });
	const ignore = createIgnore({ defaults: opt.ignoreDefaults, extra: opt.ignore, state: () => store.get().ignore });
	const handler = createResponder({ registry, store, journal, hosts: opt.hosts, lan: opt.lan, ignore });
	responder = handler;

	const app = express();
	app.disable("x-powered-by");
	app.set("etag", false);
	if (opt.ui) {
		const admin = createAdmin({
			registry, store, journal, events, fileStore, guard: createGuard({ lan: opt.lan, hosts: opt.hosts }),
			bootId, folder: opt.folder, version, float: opt.float, ignore, sceneKind: handler.sceneKind,
		});
		app.use("/__mock", admin.router);
	}
	app.use(handler.handle);

	// express 进入时把 req/res 的原型换成自己的并挂上 req.res, res.req, res.locals; express 宿主挂载子应用时会还原,
	// connect(vite), 原生 http 等宿主不会, 未命中交回宿主前在这里还原, 免得宿主后续中间件拿到被改过的对象
	const handle = (app as any).handle.bind(app) as (req: any, res: any, callback?: (err?: unknown) => void) => void;
	(app as any).handle = (req: any, res: any, callback?: (err?: unknown) => void) => {
		if (!callback) { return handle(req, res); }
		const reqProto = Object.getPrototypeOf(req);
		const resProto = Object.getPrototypeOf(res);
		const own = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);
		const saved = { reqRes: own(req, "res") ? [req.res] : null, resReq: own(res, "req") ? [res.req] : null, locals: own(res, "locals") ? [res.locals] : null };
		return handle(req, res, (err?: unknown) => {
			Object.setPrototypeOf(req, reqProto);
			Object.setPrototypeOf(res, resProto);
			saved.reqRes ? (req.res = saved.reqRes[0]) : delete req.res;
			saved.resReq ? (res.req = saved.resReq[0]) : delete res.req;
			saved.locals ? (res.locals = saved.locals[0]) : delete res.locals;
			callback(err);
		});
	};

	return Object.assign(app, {
		match: handler.match,
		close: async () => { events.close(); handler.close(); await registry.close(); },
		floatScript: opt.float ? FLOAT_PATH : null,
		mock: { options: opt, registry, store, journal, events, bootId },
	}) as MockApp;
};

/** 兼容旧签名: createMockware(folder) */
export const createMockware = (folder?: string, options?: MockOptions): MockApp => createMock({ ...options, folder: folder || options?.folder });
export const mockVite = createMockware;

/** vite allowedHosts 转为 hosts: true 表示不校验, 数组原样沿用(. 开头匹配子域名) */
const viteHosts = (allowed: unknown): string[] => (allowed === true ? ["*"] : Array.isArray(allowed) ? allowed.map(String) : []);

/**
 * vite 插件: 挂载 mock 并在开发页面注入悬浮条. 未指定 hosts 与 MOCK_HOSTS 时沿用 vite 的 server.allowedHosts.
 * 服务关闭(含 middlewareMode 下调用 server.close())时停止文件监听.
 */
export const mockVitePlugin = (options?: MockOptions) => {
	let app: MockApp | null = null;
	const close = () => {
		const current = app;
		app = null;
		return current ? current.close() : Promise.resolve();
	};
	return {
		name: "easy-mok",
		apply: "serve" as const,
		async configureServer(server: any) {
			await close(); // vite 重启时会再次调用, 先关掉上一个实例
			const hosts = options?.hosts || (process.env.MOCK_HOSTS ? undefined : viteHosts(server.config?.server?.allowedHosts));
			const current = createMock({ ...options, hosts });
			app = current;
			server.middlewares.use(current);
			server.httpServer && server.httpServer.once("close", () => { app === current && close(); });
		},
		/** vite 关闭开发服务器时调用插件的 buildEnd, middlewareMode 下没有 httpServer 只能靠它 */
		buildEnd: close,
		transformIndexHtml(): Array<{ tag: string; attrs: Record<string, unknown>; injectTo: "body" }> {
			return app && app.floatScript ? [{ tag: "script", attrs: { src: app.floatScript, defer: true }, injectTo: "body" }] : [];
		},
	};
};

export { scenes, compileRoute };
export { startMock } from "./standalone";
export type { StartOptions, StartedMock } from "./standalone";
