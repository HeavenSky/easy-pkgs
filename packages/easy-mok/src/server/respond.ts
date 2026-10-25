// mock 请求处理: 匹配路由, 解析场景, 延迟与状态码覆盖, 执行数据 / 函数 / 代理 / JSON 场景
import fs from "fs";
import type { EventEmitter } from "events";
import type { IncomingMessage } from "http";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import multer from "multer";
import type { Response } from "express";
import { extOfFile, typeOfExt } from "./mime";
import { createProxy } from "./proxy";
import { parseCookie, resolveScene } from "./scene";
import type { DisplayKind, Envelope, Scene } from "./scene";
import { isFetchLike } from "./journal";
import { ParamError, paramsOf, splitUrl } from "./route";
import { hostnameOf, isTrustedHost, isTrustedOrigin, lanGetter } from "./security";
import { isPlainObject } from "./util";
import type { RouteEntry, createRegistry } from "./loader";
import type { MockState, createStateStore } from "./state";
import type { createJournal } from "./journal";

const UPLOAD_LIMIT = 20 * 1024 * 1024;
const UPLOAD_TOTAL = 50 * 1024 * 1024; // 按 content-length 限制整个请求, multer 只能限单个文件
const BODY_LIMIT = "5mb";
export const SCENE_HEADER = "x-mock-scene";
export const SCENE_QUERY = "__scene";
export const GROUP_COOKIE = "__mock_group";

export type Req = IncomingMessage & {
	originalUrl?: string;
	params?: unknown;
	body?: unknown;
	files?: unknown;
};
export type Res = Response;
export type Next = (err?: unknown) => void;

const firstHeader = (req: Req, name: string) =>
	String(req.headers[name] || "")
		.split(",")[0]
		.trim();

export const setCors = (req: Req, res: Res, hosts: Set<string>, lan = false) => {
	const { origin } = req.headers;
	if (origin && !isTrustedOrigin(origin, req.headers.host, hosts, lan)) {
		return;
	} // 不回显即由浏览器拦下读取
	res.setHeader("access-control-allow-origin", origin || "*");
	if (origin) res.setHeader("access-control-allow-credentials", "true"); // 通配源时浏览器拒绝携带凭证
	res.setHeader(
		"access-control-allow-methods",
		firstHeader(req, "access-control-request-method") || "*"
	);
	res.setHeader(
		"access-control-allow-headers",
		String(req.headers["access-control-request-headers"] || "*")
	);
	res.setHeader("access-control-max-age", "86400");
	res.setHeader("access-control-expose-headers", "content-length, content-type");
};

const parsers = [
	cookieParser(),
	multer({
		limits: {
			fileSize: UPLOAD_LIMIT,
			files: 10,
			fields: 200,
			parts: 300,
			fieldSize: 1024 * 1024,
		},
	}).any(),
	bodyParser.raw({ limit: BODY_LIMIT }),
	bodyParser.urlencoded({ extended: true, limit: BODY_LIMIT }),
	bodyParser.json({ limit: BODY_LIMIT, strict: false }),
	bodyParser.text({ limit: BODY_LIMIT, type: "text/*" }),
];
/** 请求体解析失败, 带对应的 HTTP 状态; 处理函数不再执行 */
class BodyError extends Error {
	status: number;

	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

const bodyErrorOf = (err: any) => {
	if (err && err.name === "MulterError") {
		return new BodyError(
			/^LIMIT_(FILE_SIZE|FILE_COUNT|FIELD|PART)/.test(err.code) ? 413 : 400,
			`上传解析失败: ${err.message}`
		);
	}
	const status = Number(err && (err.status || err.statusCode)) || 400;
	return new BodyError(
		status >= 400 && status < 500 ? status : 400,
		`请求体解析失败: ${(err && err.message) || err}`
	);
};

/** 串行解析, 并行会争抢 req 流; 任一解析器出错即停止并拒绝 */
const parseBody = (req: Req, res: Res) => {
	if (Number(req.headers["content-length"] || 0) > UPLOAD_TOTAL) {
		return Promise.reject(new BodyError(413, `请求体超过 ${UPLOAD_TOTAL / 1024 / 1024}MB`));
	}
	return parsers.reduce(
		(p, h) =>
			p.then(
				() =>
					new Promise<void>((resolve, reject) => {
						h(req as any, res, (err: any) =>
							err ? reject(bodyErrorOf(err)) : resolve()
						);
					})
			),
		Promise.resolve()
	);
};

const sleep = (ms: number, res: Res) =>
	new Promise(resolve => {
		const timer = setTimeout(resolve, ms);
		res.once("close", () => {
			clearTimeout(timer);
			resolve(undefined);
		});
	});

/** 在写响应头前强制状态码, 对数据, 函数与代理场景都生效. */
const forceStatus = (res: Res, status: number) => {
	const writeHead = res.writeHead;
	res.writeHead = function (this: any, _code: number, ...rest: any[]) {
		return writeHead.call(this, status, ...rest);
	} as any;
	res.statusCode = status;
};

// 字符串与 Buffer 原样发送, 其余按 JSON; 数字走 send 会被 express 当作状态码, Buffer 走 json 会被序列化成 { type, data }
const sendBody = (res: Res, body: unknown) =>
	typeof body === "string" || Buffer.isBuffer(body)
		? res.send(body)
		: res.json(body === undefined ? null : body);

/** 流式返回文件; 未设置 content-type 时按扩展名补, 文件不存在时 reject */
export const streamFile = (req: Req, res: Res, file: string) =>
	new Promise<void>((resolve, reject) => {
		fs.stat(file, (err, stat) => {
			if (err || !stat.isFile()) {
				return reject(new Error(`响应体文件不存在: ${file}`));
			}
			if (!res.getHeader("content-type")) {
				res.setHeader("content-type", typeOfExt(extOfFile(file)));
			}
			res.setHeader("content-length", stat.size);
			if (String(req.method).toUpperCase() === "HEAD") {
				res.end();
				return resolve();
			}
			const stream = fs.createReadStream(file);
			stream.on("error", reject);
			res.once("close", () => {
				stream.destroy();
				resolve();
			});
			stream.pipe(res);
		});
	});

/** 处理函数的返回值能否当响应体: 数据才算, 定时器, res 等对象不算 */
const isBodyValue = (v: unknown) =>
	v === null ||
	["string", "number", "boolean"].includes(typeof v) ||
	Array.isArray(v) ||
	Buffer.isBuffer(v) ||
	isPlainObject(v);

/** 代理槽位: 初始化 Promise, hpm 实例, 是否转发 WebSocket, 以及 hpm 挂到 server 上需要解绑的监听器 */
type Slot = {
	promise: Promise<Slot | { data: unknown }>;
	proxy?: any;
	ws?: boolean;
	error?: unknown;
	owned: Array<[EventEmitter, string, (...args: unknown[]) => void]>;
	tracked: boolean;
};

const isProxyOptions = (v: unknown) => isPlainObject(v) && ("target" in v || "router" in v);

export const createResponder = ({
	registry,
	store,
	journal,
	hosts = [],
	lan = false,
	ignore,
}: {
	registry: ReturnType<typeof createRegistry>;
	store: ReturnType<typeof createStateStore>;
	journal: ReturnType<typeof createJournal>;
	hosts?: string[];
	/** 是否把私有网段 IP 来源当作可信跨域来源, 与管理接口的 lan 同一开关; 函数形式在每次请求时取值 */
	lan?: boolean | (() => boolean);
	/** 请求忽略规则; 命中的请求不进请求日志, 不打印终端日志, 路由匹配与响应照常 */
	ignore?: { test: (method: string, pathname: string) => boolean };
}) => {
	const trustedHosts = new Set(hosts.map(h => h.toLowerCase()));
	const anyHost = trustedHosts.has("*");
	const lanOn = lanGetter(lan);
	// 运行资源: 无参函数 → 代理槽位, 随路由表重建与 close() 销毁; 以函数为键, 沿用旧快照时代理不必重建
	const proxies = new Map<Function, Slot>();
	const servers = new Map<EventEmitter, string>(); // 已挂 upgrade 分发的 server → 挂载前缀(express 的 req.baseUrl)

	/** 销毁代理槽位: 解绑 hpm 挂在 server 上的监听器 */
	const dispose = (fn: Function) => {
		const slot = proxies.get(fn);
		if (!slot) {
			return;
		}
		proxies.delete(fn);
		slot.owned.forEach(([server, event, listener]) => server.removeListener(event, listener));
		slot.owned.length = 0;
	};

	/** 路由表重建后调用: 不再被引用的代理退场 */
	const prune = () => {
		const alive = new Set<unknown>();
		registry.routes.forEach(route =>
			route.scenes.forEach(scene => {
				if (scene.kind === "proxy") alive.add(scene.value);
			})
		);
		[...proxies.keys()].forEach(fn => {
			if (!alive.has(fn)) dispose(fn);
		});
	};

	/**
	 * 取代理槽位: 并发首批请求共用同一个初始化 Promise; 函数抛错时清除以便重试; 返回数据时不缓存, 每次请求重新调用.
	 * 代理配置无效(hpm 创建失败)时保留槽位与错误, 只告警一次, 路由表重建后重试.
	 */
	/** 无参函数最近一次调用的结果类型; 静态只看 length 分不清返回数据还是代理配置, 管理页按它标注场景类型 */
	const observed = new WeakMap<Function, "proxy" | "data">();
	const acquire = (fn: Function, key: string): Promise<Slot | { data: unknown }> => {
		const cached = proxies.get(fn);
		if (cached) {
			return cached.promise;
		}
		const slot = { owned: [], tracked: false } as unknown as Slot;
		const drop = () => {
			if (proxies.get(fn) === slot) proxies.delete(fn);
		};
		slot.promise = Promise.resolve()
			.then(() => fn())
			.then(out => {
				observed.set(fn, isProxyOptions(out) ? "proxy" : "data");
				if (!isProxyOptions(out)) {
					drop();
					return { data: out };
				}
				slot.ws = (out as Record<string, unknown>).ws === true;
				try {
					slot.proxy = createProxy(out);
				} catch (err) {
					slot.error = err;
					console.warn(
						"[easy-mok] 代理配置无效, 修改 mock 文件前该路由都返回 500:",
						key,
						(err as Error).message || err
					);
				}
				return slot;
			});
		slot.promise.catch(drop);
		proxies.set(fn, slot);
		return slot.promise;
	};

	/** 记下 hpm 首次请求时挂到 server 上的 close 监听器, 销毁时解绑; hpm 3 在异步准备后才挂, 故在响应结束时比对 */
	const track = (slot: Slot, req: Req, res: Res) => {
		const server = (req.socket as any)?.server as EventEmitter | undefined;
		if (slot.tracked || !server) {
			return;
		}
		slot.tracked = true;
		const before = new Set(server.listeners("close"));
		res.once("close", () =>
			server.listeners("close").forEach(listener => {
				if (!before.has(listener))
					slot.owned.push([server, "close", listener as (...args: unknown[]) => void]);
			})
		);
	};

	/** 按方法与挂载后的路径找路由; 总开关或代码 MOCK:false 关闭时不命中 */
	const inspectPath = (req: Req, pathname: string) => {
		const method = String(req.method || "GET").toUpperCase();
		let preflight =
			method === "OPTIONS" && firstHeader(req, "access-control-request-method").toUpperCase();
		const state = store.get();
		let hit: ReturnType<typeof registry.find> = null;
		if (registry.codeEnabled && state.enabled) {
			const own = preflight ? registry.find("OPTIONS", pathname, true) : null; // 显式声明 OPTIONS 时预检交给它
			if (own) {
				preflight = false;
			}
			hit =
				own ||
				registry.find(preflight || method, pathname) ||
				(method === "HEAD" ? registry.find("GET", pathname) : null); // 同 express, HEAD 回落到 GET
		}
		const routeState = hit ? state.routes[hit.route.id] || {} : {};
		return { method, preflight, state, hit, routeState };
	};

	/** 用挂载后的 req.url 匹配(同 express 的 req.path); 日志与请求日志用挂载前的 originalUrl */
	const inspect = (req: Req) => {
		const uri = splitUrl(req.url || "/");
		return { uri, ...inspectPath(req, uri.pathname) };
	};

	const activeScene = (
		req: Req,
		route: RouteEntry,
		state: MockState,
		uri: ReturnType<typeof splitUrl>
	) =>
		resolveScene({
			routeId: route.id,
			has: name => route.scenes.has(name),
			state,
			request: {
				header: firstHeader(req, SCENE_HEADER) || null,
				query: uri.searchParams.get(SCENE_QUERY),
				cookieGroup: parseCookie(req.headers.cookie)[GROUP_COOKIE] || null,
			},
		});

	const hostDenied = (req: Req) =>
		!anyHost &&
		!!req.headers.host &&
		!isTrustedHost(hostnameOf(req.headers.host), trustedHosts);

	/**
	 * WebSocket 升级统一分发: 每个 server 只挂一个监听器, 按当前路由表, 总开关, 放行模式与场景交给对应代理的 upgrade;
	 * 未命中或不是 ws 代理时不处理, 留给宿主(如 dev server 的热更新连接)
	 */
	const onUpgrade = (server: EventEmitter) => (req: Req, socket: unknown, head: unknown) => {
		if (hostDenied(req)) {
			return;
		}
		const base = servers.get(server) || "";
		let uri = splitUrl(req.url || "/");
		if (base) {
			if (uri.pathname !== base && !uri.pathname.startsWith(`${base}/`)) {
				return;
			}
			uri = { ...uri, pathname: uri.pathname.slice(base.length) || "/" };
		}
		const { hit, routeState, state } = inspectPath(req, uri.pathname);
		if (!hit || routeState.mode === "pass") {
			return;
		}
		const scene = hit.route.scenes.get(activeScene(req, hit.route, state, uri).name);
		if (!scene || scene.kind !== "proxy") {
			return;
		}
		acquire(scene.value as Function, hit.route.key)
			.then(slot => {
				if (!("owned" in slot && slot.proxy && slot.ws)) {
					return;
				}
				// 与普通代理请求一致转发去掉挂载前缀的路径(express 挂载时普通请求的 req.url 已不含前缀)
				if (base) {
					const rest = String(req.url || "/")
						.replace(/^[a-z][a-z\d+.-]*:\/\/[^/?]*/i, "")
						.slice(base.length);
					req.url = rest.startsWith("/") ? rest : `/${rest}`;
				}
				slot.proxy.upgrade(req, socket, head);
			})
			.catch(err => console.warn("[easy-mok] WebSocket 代理出错:", hit.route.key, err));
	};
	const upgradeListeners = new Map<EventEmitter, (...args: any[]) => void>();
	const watchUpgrade = (req: Req) => {
		const server = (req.socket as any)?.server as EventEmitter | undefined;
		if (!server || servers.has(server)) {
			return;
		}
		servers.set(server, String((req as any).baseUrl || ""));
		const listener = onUpgrade(server);
		upgradeListeners.set(server, listener);
		server.on("upgrade", listener);
	};

	/** 供 fastify 等宿主先判断是否接管: 命中且不是放行模式 */
	const match = (req: Req) => {
		const { hit, routeState } = inspect(req);
		return !!hit && routeState.mode !== "pass";
	};

	const handle = (req: Req, res: Res, next: Next) => {
		watchUpgrade(req);
		const { method, preflight, uri, state, hit, routeState } = inspect(req);
		const shown = splitUrl(req.originalUrl || req.url || "/").pathname; // 日志显示挂载前的完整路径
		const ignored = !!ignore && ignore.test(method, shown);
		const logAll = state.logLevel === "all" && !ignored;
		if (!hit) {
			if (isFetchLike(req) && !ignored) {
				journal.capture(req, res, () => ({ kind: "miss" }));
				if (logAll) console.log("[easy-mok] 未命中", method, shown);
			}
			return next();
		}
		const { route, data } = hit;
		if (routeState.mode === "pass") {
			if (!ignored)
				journal.capture(req, res, () => ({
					kind: "pass",
					routeId: route.id,
					routeKey: route.key,
				}));
			if (logAll) console.log("[easy-mok] 放行", method, shown, "→", route.key);
			return next();
		}
		// 防 DNS rebinding: 攻击者域名解析到本机后与 mock 同源, 能读取 mock 与代理响应; 无 Host 头的非浏览器请求放行
		if (hostDenied(req)) {
			const hostname = hostnameOf(req.headers.host);
			console.warn(
				`[easy-mok] 拒绝不受信任的 Host: ${hostname} (${method} ${shown}), 可通过环境变量 MOCK_HOSTS 或选项 hosts 放行`
			);
			res.statusCode = 403;
			res.setHeader("content-type", "application/json; charset=utf-8");
			return res.end(
				JSON.stringify({
					mock: true,
					route: route.key,
					message: `easy-mok 拒绝了不受信任的 Host: ${hostname}. 本机名, IP 与 *.localhost 默认放行; 自定义域名请设置环境变量 MOCK_HOSTS=${hostname}(逗号分隔, .example.com 匹配子域名)或传入选项 hosts`,
				})
			);
		}
		setCors(req, res, trustedHosts, lanOn());
		if (preflight) {
			res.statusCode = 204;
			return res.end();
		}
		const active = activeScene(req, route, state, uri);
		const scene = route.scenes.get(active.name) as Scene;
		registry.hit(route.id);
		if (state.logLevel !== "silent" && !ignored)
			console.log(`[easy-mok] ${method} ${shown} → ${route.key} (${active.name})`);
		let failed = false;
		let kind: "proxy" | "mock" = scene.kind === "proxy" ? "proxy" : "mock";
		if (!ignored)
			journal.capture(req, res, () => ({
				kind: failed ? "error" : kind,
				routeId: route.id,
				routeKey: route.key,
				scene: active.name,
				sceneLevel: active.level,
				sceneFallback: active.fallback,
			}));
		// 处理函数出错时返回 500, 参数解码失败同 express 4 返回 400, 避免请求挂起
		const fail = (err: unknown, quiet = false) => {
			failed = true;
			const status = err instanceof ParamError ? 400 : 500;
			if (!quiet && status === 500) console.warn("[easy-mok] 处理出错:", route.key, err);
			if (res.headersSent) {
				return res.end();
			}
			res.statusCode = status;
			res.setHeader("content-type", "application/json; charset=utf-8");
			res.end(
				JSON.stringify({
					mock: true,
					route: route.key,
					scene: active.name,
					message: String((err && (err as Error).message) || err),
				})
			);
		};
		const envelope = scene.kind === "envelope" ? (scene.value as Envelope) : null;
		const delay =
			typeof routeState.delay === "number"
				? routeState.delay
				: (envelope && envelope.delay) || 0;
		const run = async () => {
			(req as any).params = paramsOf(route.compiled, data);
			if (delay > 0) {
				await sleep(delay, res);
			}
			if (res.destroyed || res.writableEnded) {
				return;
			}
			if (typeof routeState.status === "number") {
				forceStatus(res, routeState.status);
			}
			if (scene.kind === "proxy") {
				// 不解析请求体, 以免消费 req 流
				const slot = await acquire(scene.value as Function, route.key);
				if (!("owned" in slot)) {
					kind = "mock";
					return sendBody(res, slot.data);
				} // 无参函数返回数据时当作响应体
				if (slot.error) {
					return fail(slot.error, true);
				}
				track(slot, req, res);
				return slot.proxy(req, res, next);
			}
			try {
				await parseBody(req, res);
			} catch (err) {
				if (!(err instanceof BodyError)) {
					throw err;
				}
				failed = true;
				if (res.destroyed) {
					return;
				} // 客户端已断开, 无需响应; req 读完即自动销毁, 不能用来判断
				console.warn("[easy-mok] 请求体解析失败:", route.key, err.message);
				res.statusCode = err.status;
				res.setHeader("content-type", "application/json; charset=utf-8");
				res.setHeader("connection", "close"); // 剩余请求体未读完, 不复用连接
				return res.end(
					JSON.stringify({ mock: true, route: route.key, message: err.message })
				);
			}
			const callHandler = async (fn: Function) => {
				let passed = false;
				const out = await Promise.resolve(
					fn(req, res, (err?: unknown) => {
						passed = true;
						next(err);
					})
				);
				// 未响应也未交给宿主时把返回的数据当响应体, 免得 req => ({...}) 写法挂起
				if (!passed && !res.headersSent && !res.writableEnded && isBodyValue(out)) {
					sendBody(res, out);
				}
			};
			if (scene.kind === "function") {
				return callHandler(scene.value as Function);
			}
			if (envelope) {
				if (typeof routeState.status !== "number" && envelope.status) {
					res.status(envelope.status);
				}
				Object.entries(envelope.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
				if (scene.handler) {
					return callHandler(scene.handler);
				}
				return scene.file ? streamFile(req, res, scene.file) : sendBody(res, envelope.body);
			}
			return sendBody(res, scene.value);
		};
		Promise.resolve()
			.then(run)
			.catch(err => fail(err));
	};

	/** 销毁全部代理并移除 upgrade 监听器 */
	const close = () => {
		[...proxies.keys()].forEach(dispose);
		upgradeListeners.forEach((listener, server) => server.removeListener("upgrade", listener));
		upgradeListeners.clear();
		servers.clear();
	};

	/** 管理页展示的场景类型: 无参函数调用前为 nullary, 之后按实际返回值为 function(返回数据)或 proxy */
	const sceneKind = (scene: Scene): DisplayKind => {
		if (scene.handler) {
			return "script";
		}
		if (scene.kind !== "proxy") {
			return scene.kind;
		}
		const seen = observed.get(scene.value as Function);
		return seen === "proxy" ? "proxy" : seen === "data" ? "function" : "nullary";
	};

	return {
		handle,
		match,
		prune,
		close,
		sceneKind,
		get proxyCount() {
			return proxies.size;
		},
	};
};
