// 管理接口 /__mock/api/* 与管理页静态资源
import fs from "fs";
import path from "path";
import express from "express";
import type { NextFunction, Request as Req, Response as Res } from "express";
import type { IncomingMessage } from "http";
import { compileRoute, keyOfRouteId, parseKey, splitUrl } from "./route";
import { resolveScene } from "./scene";
import type { DisplayKind, Scene, Envelope } from "./scene";
import { normalizeEnvelope } from "./files";
import { compileScript } from "./script";
import { isLoopback } from "./security";
import type { LanControl } from "./lan";
import type { createFileStore } from "./files";
import { MockError, assertName, etagOf } from "./util";
import { SECRET_HEADERS } from "./journal";
import type { createJournal } from "./journal";
import type { RouteEntry, createRegistry } from "./loader";
import type { MockState, createStateStore } from "./state";
import type { createEvents } from "./events";
import { DEFAULT_IGNORE, validateIgnore } from "./ignore";
import type { createIgnore } from "./ignore";

export const UI_DIR = path.join(__dirname, "../../dist/ui");
const FLOAT_LOADER = path.join(__dirname, "../../src/float/loader.js");
const SPA_PATHS = /^\/(routes|logs|groups|diagnostics)?(\/.*)?$/;
// 存为场景时不保留的响应头: 由传输层或服务器自动生成
const DROP_HEADERS = new Set([
	"content-length",
	"content-encoding",
	"transfer-encoding",
	"connection",
	"keep-alive",
	"date",
	"etag",
	"last-modified",
	"vary",
	"access-control-allow-origin",
	"access-control-allow-credentials",
	"access-control-allow-methods",
	"access-control-allow-headers",
	"access-control-max-age",
	"access-control-expose-headers",
	"x-powered-by",
]);

const jsonSafe = (value: unknown) => {
	try {
		return JSON.parse(JSON.stringify(value === undefined ? null : value));
	} catch {
		return String(value);
	}
};

/**
 * 发送包内固定文件. pnpm 把包装在 node_modules/.pnpm/ 下, express 5 默认 dotfiles: "ignore" 会按整条路径拒绝;
 * 出错时自行响应, 不交给错误处理中间件打印堆栈.
 */
const sendOwnFile = (res: Res, file: string) => {
	res.sendFile(file, { dotfiles: "allow" }, err => {
		if (!err) {
			return;
		}
		if ((err as NodeJS.ErrnoException).code !== "ECONNABORTED") {
			console.warn("[easy-mok] 发送文件失败:", file, err.message);
		}
		if (res.headersSent) {
			res.end();
			return;
		}
		res.status(Number((err as any).status || (err as any).statusCode) || 404).end();
	});
};

const parseIfMatch = (header: string | undefined) =>
	header ? String(header).replace(/^W\//, "").replace(/^"|"$/g, "") : null;

export interface AdminContext {
	registry: ReturnType<typeof createRegistry>;
	store: ReturnType<typeof createStateStore>;
	journal: ReturnType<typeof createJournal>;
	events: ReturnType<typeof createEvents>;
	fileStore: ReturnType<typeof createFileStore>;
	guard: (req: IncomingMessage) => void;
	bootId: string;
	folder: string;
	version: string;
	float: boolean;
	ignore: ReturnType<typeof createIgnore>;
	/** 局域网开关的运行时状态 */
	lan: LanControl;
	/** 场景的展示类型, 由 responder 按无参函数的实际返回值给出 */
	sceneKind?: (scene: Scene) => DisplayKind;
}

export const createAdmin = (ctx: AdminContext) => {
	const { registry, store, journal, events, fileStore } = ctx;
	const router = express.Router();
	const changed = (scope: string) => events.emit("changed", { scope });

	const routeOf = (id: string) => {
		const route = registry.routes.get(keyOfRouteId(id));
		if (!route) {
			throw new MockError("NOT_FOUND", 404, "路由不存在或已被删除", { id });
		}
		return route;
	};

	const summary = (route: RouteEntry) => {
		const state = store.get();
		const rs = state.routes[route.id] || {};
		const stat = registry.stats.get(route.id);
		return {
			id: route.id,
			key: route.key,
			methods: route.methods,
			path: route.path,
			weight: route.weight,
			source: route.source,
			scenes: [...route.scenes.keys()],
			active: resolveScene({ routeId: route.id, has: n => route.scenes.has(n), state }),
			mode: rs.mode || "mock",
			delay: rs.delay ?? null,
			status: rs.status ?? null,
			hits: stat ? stat.hits : 0,
			lastHit: stat ? stat.lastHit : null,
		};
	};

	const sceneDetail = (scene: Scene) => {
		let content: unknown;
		if (scene.kind === "function" || scene.kind === "proxy") {
			content = { source: String(scene.value).slice(0, 2048) };
		} else {
			content = jsonSafe(scene.value);
		}
		return {
			name: scene.name,
			source: scene.source,
			kind: ctx.sceneKind ? ctx.sceneKind(scene) : scene.kind,
			editable: scene.source === "json",
			overrides: !!scene.overrides,
			content,
			etag: scene.etag || null,
		};
	};

	const diagnostics = () => {
		const state = store.get();
		const list = [...registry.diagnostics];
		store.problems.forEach(message => list.push({ type: "state", message }));
		Object.entries(state.routes).forEach(([id, rs]) => {
			const route = registry.routes.get(keyOfRouteId(id));
			if (!route) {
				list.push({
					type: "stale-state",
					message: `状态中引用了已不存在的路由: ${keyOfRouteId(id)}`,
					routeId: id,
				});
			} else if (rs.scene && !route.scenes.has(rs.scene)) {
				list.push({
					type: "stale-state",
					message: `路由 ${route.key} 手选的场景 ${rs.scene} 已不存在`,
					routeId: id,
					key: route.key,
				});
			}
		});
		Object.entries(state.groups).forEach(([name, map]) => {
			Object.entries(map).forEach(([id, scene]) => {
				const route = registry.routes.get(keyOfRouteId(id));
				if (!route || !route.scenes.has(scene)) {
					list.push({
						type: "stale-state",
						message: `场景组 ${name} 引用了不存在的${route ? `场景 ${scene}` : `路由 ${keyOfRouteId(id)}`}`,
						routeId: id,
					});
				}
			});
		});
		return list;
	};

	/** 局域网开关状态; 可达性按收到本次请求的 server 的监听地址判断, 拿不到时为 unknown */
	const lanInfo = (req?: IncomingMessage) => {
		const { lan } = ctx;
		const server = req ? ((req.socket as any)?.server as { address?: () => unknown }) : null;
		const addr = server && typeof server.address === "function" ? server.address() : null;
		const bound =
			addr && typeof addr === "object"
				? (addr as { address: string; port: number })
				: null;
		const loopback = bound ? bound.address === "localhost" || isLoopback(bound.address) : null;
		const extra = lan.listening.addresses;
		let reachable: "yes" | "no" | "unknown";
		if (!lan.access) {
			reachable = "no";
		} else if (extra.length) {
			reachable = "yes";
		} else if (loopback === null) {
			reachable = "unknown";
		} else {
			reachable = loopback ? "no" : "yes";
		}
		const listening = extra.length
			? extra
			: lan.access && bound && !loopback
				? [`${bound.address.includes(":") ? `[${bound.address}]` : bound.address}:${bound.port}`]
				: [];
		return {
			access: lan.access,
			initial: lan.initial,
			canToggle: !!req && isLoopback(req.socket.remoteAddress || ""),
			reachable,
			listening,
			errors: lan.listening.errors,
		};
	};

	const meta = (req?: IncomingMessage) => {
		const state = store.get();
		return {
			name: "easy-mok",
			version: ctx.version,
			bootId: ctx.bootId,
			folder: ctx.folder,
			stateFile: store.file,
			enabled: {
				code: registry.codeEnabled,
				state: state.enabled,
				effective: registry.codeEnabled && state.enabled,
			},
			group: state.group,
			logLevel: state.logLevel,
			readOnly: store.readOnly,
			float: ctx.float,
			counts: { routes: registry.routes.size, files: registry.fileCount },
			diagnostics: diagnostics(),
			lan: lanInfo(req),
			env: { node: process.version, platform: process.platform },
		};
	};

	const wrap =
		(fn: (req: Req, res: Res) => unknown) => (req: Req, res: Res, next: NextFunction) => {
			try {
				const out = fn(req, res);
				if (out !== undefined && !res.headersSent) {
					res.json(out);
				}
			} catch (err) {
				next(err);
			}
		};

	const updateState = (mutate: (draft: MockState) => void, scope: string) => {
		try {
			store.update(mutate);
		} catch (err) {
			throw new MockError("IO_ERROR", 500, "写入状态文件失败", undefined, { cause: err });
		}
		changed(scope);
	};

	router.use((req, res, next) => {
		res.setHeader("x-mock-boot", ctx.bootId);
		try {
			ctx.guard(req);
			next();
		} catch (err) {
			next(err);
		}
	});

	// ---- 静态资源 ----
	router.get("/float.js", (_req, res) => {
		res.setHeader("cache-control", "no-cache");
		res.type("application/javascript");
		sendOwnFile(res, FLOAT_LOADER);
	});
	router.use(
		"/ui",
		express.static(UI_DIR, {
			index: false,
			setHeaders: (res, file) => {
				res.setHeader(
					"cache-control",
					/[\\/]assets[\\/]/.test(file)
						? "public, max-age=31536000, immutable"
						: "no-cache"
				);
			},
		})
	);

	// ---- 接口 ----
	const api = express.Router();
	api.use(express.json({ limit: "2mb", strict: false }));

	api.get(
		"/meta",
		wrap(req => meta(req))
	);

	/** 局域网开关只能在本机切换; 局域网用户无法自行放开访问 */
	api.put(
		"/lan",
		wrap(req => {
			if (!isLoopback(req.socket.remoteAddress || "")) {
				throw new MockError("FORBIDDEN", 403, "局域网开关只能在本机的管理页中切换");
			}
			const body = req.body || {};
			if ("access" in body && typeof body.access !== "boolean") {
				throw new MockError("BAD_REQUEST", 400, "access 必须是布尔值", { field: "access" });
			}
			ctx.lan.set({ access: body.access });
			changed("meta");
			return lanInfo(req);
		})
	);

	api.get(
		"/routes",
		wrap(req => {
			const q = String(req.query.q || "").toLowerCase();
			return [...registry.routes.values()]
				.sort((a, b) => a.order - b.order)
				.filter(r => !q || r.key.toLowerCase().includes(q))
				.map(summary);
		})
	);

	api.get(
		"/routes/:id",
		wrap(req => {
			const route = routeOf(String(req.params.id));
			return { route: summary(route), scenes: [...route.scenes.values()].map(sceneDetail) };
		})
	);

	api.patch(
		"/routes/:id/state",
		wrap(req => {
			const route = routeOf(String(req.params.id));
			const body = req.body || {};
			if ("scene" in body && body.scene !== null && !route.scenes.has(body.scene)) {
				throw new MockError("NOT_FOUND", 404, `场景不存在: ${body.scene}`, {
					field: "scene",
				});
			}
			if (
				"mode" in body &&
				body.mode !== null &&
				body.mode !== "mock" &&
				body.mode !== "pass"
			) {
				throw new MockError("BAD_REQUEST", 400, "mode 只能是 mock 或 pass", {
					field: "mode",
				});
			}
			if (
				"delay" in body &&
				body.delay !== null &&
				!(Number.isInteger(body.delay) && body.delay >= 0 && body.delay <= 60000)
			) {
				throw new MockError("BAD_REQUEST", 400, "延迟必须是 0-60000 的整数毫秒", {
					field: "delay",
				});
			}
			if (
				"status" in body &&
				body.status !== null &&
				!(Number.isInteger(body.status) && body.status >= 100 && body.status <= 599)
			) {
				throw new MockError("BAD_REQUEST", 400, "状态码必须是 100-599 的整数", {
					field: "status",
				});
			}
			updateState(draft => {
				const rs = { ...draft.routes[route.id] };
				["scene", "mode", "delay", "status"].forEach(k => {
					if (!(k in body)) {
						return;
					}
					if (body[k] === null || (k === "mode" && body[k] === "mock")) {
						delete (rs as any)[k];
					} else {
						(rs as any)[k] = body[k];
					}
				});
				if (Object.keys(rs).length) {
					draft.routes[route.id] = rs;
				} else {
					delete draft.routes[route.id];
				}
			}, "routes");
			return summary(route);
		})
	);

	/** 脚本在宿主进程中执行, 等同于改 mock 源文件: 即使开启 lan 也只接受本机写入, 并在写入前编译检查 */
	const checkScript = (req: Req, key: string, envelope: Envelope) => {
		if (envelope.script === undefined) {
			return;
		}
		if (!isLoopback(req.socket.remoteAddress || "")) {
			throw new MockError("FORBIDDEN", 403, "脚本场景只能在本机的管理页中保存", {
				field: "script",
			});
		}
		try {
			compileScript(envelope.script, ctx.folder, fileStore.sceneFileOf(key));
		} catch (err) {
			throw new MockError(
				"BAD_REQUEST",
				400,
				`脚本无法编译: ${(err as Error).message || err}`,
				{ field: "script" }
			);
		}
	};

	const writeScene = (
		route: RouteEntry,
		name: string,
		raw: unknown,
		ifMatch: string | null,
		req: Req,
		force?: boolean
	) => {
		assertName(name, "场景名");
		const envelope = normalizeEnvelope(raw);
		checkScript(req, route.key, envelope);
		const current = route.scenes.get(name);
		if (current && current.source === "json" && !force) {
			if (!ifMatch) {
				throw new MockError("CONFLICT", 409, `场景 ${name} 已存在`, {
					current: sceneDetail(current),
				});
			}
			if (ifMatch !== current.etag) {
				throw new MockError("CONFLICT", 409, "场景已被其他人修改", {
					current: sceneDetail(current),
				});
			}
		}
		fileStore.updateScenes(route.key, map => {
			map[name] = envelope;
		});
		registry.reloadNow();
		changed("routes");
		const fresh = routeOf(route.id).scenes.get(name) as Scene;
		return sceneDetail(fresh);
	};

	api.put(
		"/routes/:id/scenes/:name",
		wrap((req, res) => {
			const route = routeOf(String(req.params.id));
			const name = String(req.params.name);
			const existed = route.scenes.get(name)?.source === "json";
			const out = writeScene(
				route,
				name,
				req.body,
				parseIfMatch(req.headers["if-match"]),
				req
			);
			res.status(existed ? 200 : 201);
			return out;
		})
	);

	api.delete(
		"/routes/:id/scenes/:name",
		wrap((req, res) => {
			const route = routeOf(String(req.params.id));
			const name = String(req.params.name);
			const scene = route.scenes.get(name);
			if (!scene) {
				throw new MockError("NOT_FOUND", 404, `场景不存在: ${name}`);
			}
			if (scene.source !== "json") {
				throw new MockError("READ_ONLY", 409, "代码声明的场景只读, 请修改 mock 源文件");
			}
			const ifMatch = parseIfMatch(req.headers["if-match"]);
			if (ifMatch && ifMatch !== scene.etag) {
				throw new MockError("CONFLICT", 409, "场景已被其他人修改", {
					current: sceneDetail(scene),
				});
			}
			fileStore.updateScenes(route.key, map => {
				delete map[name];
			});
			registry.reloadNow();
			changed("routes");
			res.status(204).end();
		})
	);

	const keyFromInput = (body: unknown) => {
		const b = (body || {}) as Record<string, any>;
		const methods = Array.isArray(b.methods) ? b.methods.map(m => String(m).toUpperCase()) : [];
		const routePath = typeof b.path === "string" ? b.path.trim() : "";
		if (!methods.length || methods.some(m => !/^[A-Z]+$/.test(m))) {
			throw new MockError("BAD_REQUEST", 400, "请至少选择一个请求方法", { field: "methods" });
		}
		if (!routePath.startsWith("/") || /\s/.test(routePath)) {
			throw new MockError("INVALID_ROUTE", 400, "路径必须以 / 开头且不含空白", {
				field: "path",
			});
		}
		try {
			compileRoute(routePath);
		} catch (err) {
			throw new MockError("INVALID_ROUTE", 400, `路径无法编译: ${(err as Error).message}`, {
				field: "path",
			});
		}
		const weight = Number(b.weight) || 0;
		const key = `${methods.join("|")}${weight ? `:${weight}` : ""} ${routePath}`;
		if (!parseKey(key)) {
			throw new MockError("INVALID_ROUTE", 400, "路由无法解析", { field: "path" });
		}
		if (registry.routes.has(key)) {
			throw new MockError("CONFLICT", 409, `路由已存在: ${key}`, { field: "path" });
		}
		return key;
	};

	/** 写入 __gui__.json(响应体为 null 时也记为 null, 加载时保留); 写入后未能加载则还原两个文件, 不留坏记录 */
	const createGuiRoute = (key: string, envelope: Envelope) => {
		const restore = fileStore.snapshot(key);
		try {
			fileStore.updateGui(routes => {
				routes[key] = envelope.body === undefined ? null : envelope.body;
			});
			const { status, headers, delay, script } = envelope;
			if (
				(status && status !== 200) ||
				(headers && Object.keys(headers).length) ||
				delay ||
				script !== undefined
			) {
				fileStore.updateScenes(key, map => {
					map.default = envelope;
				});
			}
		} catch (err) {
			restore();
			throw err;
		}
		registry.reloadNow(fileStore.guiFile);
		const route = registry.routes.get(key);
		if (!route) {
			const found = registry.diagnostics.filter(
				d => d.file === fileStore.guiFile || d.key === key
			);
			restore();
			registry.reloadNow();
			changed("routes");
			const reason = found.length ? found.map(d => d.message).join("; ") : "未知原因";
			throw new MockError("LOAD_ERROR", 500, `新建的路由未能加载, 已撤销写入: ${reason}`, {
				diagnostics: found,
			});
		}
		changed("routes");
		return route;
	};

	api.post(
		"/routes",
		wrap((req, res) => {
			const key = keyFromInput(req.body);
			const envelope = normalizeEnvelope((req.body || {}).response || { body: null });
			checkScript(req, key, envelope);
			const route = createGuiRoute(key, envelope);
			res.status(201);
			return summary(route);
		})
	);

	api.delete(
		"/routes/:id",
		wrap((req, res) => {
			const route = routeOf(String(req.params.id));
			if (route.source.type !== "gui") {
				throw new MockError("READ_ONLY", 409, "只能删除在管理页中新建的路由");
			}
			fileStore.updateGui(routes => {
				delete routes[route.key];
			});
			fileStore.updateScenes(route.key, map => {
				Object.keys(map).forEach(k => delete map[k]);
			});
			registry.reloadNow();
			updateState(draft => {
				delete draft.routes[route.id];
			}, "routes");
			res.status(204).end();
		})
	);

	api.get(
		"/groups",
		wrap(() => ({ groups: store.get().groups, active: store.get().group }))
	);

	api.put(
		"/groups/:name",
		wrap(req => {
			const name = assertName(String(req.params.name), "场景组名");
			const body = req.body;
			if (!body || typeof body !== "object" || Array.isArray(body)) {
				throw new MockError(
					"BAD_REQUEST",
					400,
					"场景组内容必须是 { 路由 id: 场景名 } 对象"
				);
			}
			const map: Record<string, string> = {};
			Object.entries(body).forEach(([id, scene]) => {
				if (typeof scene !== "string" || !scene) {
					throw new MockError("BAD_REQUEST", 400, "场景名必须是非空字符串", {
						routeId: id,
					});
				}
				map[id] = scene;
			});
			updateState(draft => {
				draft.groups[name] = map;
			}, "groups");
			return { groups: store.get().groups, active: store.get().group };
		})
	);

	api.post(
		"/groups/:name/rename",
		wrap(req => {
			const name = String(req.params.name);
			const to = assertName((req.body || {}).to, "场景组名");
			const state = store.get();
			if (!state.groups[name]) {
				throw new MockError("NOT_FOUND", 404, `场景组不存在: ${name}`);
			}
			if (state.groups[to] && to !== name) {
				throw new MockError("CONFLICT", 409, `场景组已存在: ${to}`);
			}
			updateState(draft => {
				const g = draft.groups[name];
				delete draft.groups[name];
				draft.groups[to] = g;
				if (draft.group === name) {
					draft.group = to;
				}
			}, "groups");
			return { groups: store.get().groups, active: store.get().group };
		})
	);

	api.delete(
		"/groups/:name",
		wrap((req, res) => {
			const name = String(req.params.name);
			if (!store.get().groups[name]) {
				throw new MockError("NOT_FOUND", 404, `场景组不存在: ${name}`);
			}
			updateState(draft => {
				delete draft.groups[name];
				if (draft.group === name) {
					draft.group = null;
				}
			}, "groups");
			res.status(204).end();
		})
	);

	api.post(
		"/groups/:name/snapshot",
		wrap((req, res) => {
			const name = assertName(String(req.params.name), "场景组名");
			if (store.get().groups[name] && !(req.body || {}).overwrite) {
				throw new MockError("CONFLICT", 409, `场景组已存在: ${name}`);
			}
			const state = store.get();
			const map: Record<string, string> = {};
			registry.routes.forEach(route => {
				const active = resolveScene({
					routeId: route.id,
					has: n => route.scenes.has(n),
					state,
				});
				if (active.name !== "default") {
					map[route.id] = active.name;
				}
			});
			updateState(draft => {
				draft.groups[name] = map;
			}, "groups");
			res.status(201);
			return { groups: store.get().groups, active: store.get().group };
		})
	);

	api.patch(
		"/state",
		wrap(req => {
			const body = req.body || {};
			if ("enabled" in body && typeof body.enabled !== "boolean") {
				throw new MockError("BAD_REQUEST", 400, "enabled 必须是布尔值", {
					field: "enabled",
				});
			}
			if ("group" in body && body.group !== null && !store.get().groups[body.group]) {
				throw new MockError("NOT_FOUND", 404, `场景组不存在: ${body.group}`, {
					field: "group",
				});
			}
			if ("logLevel" in body && !["silent", "hit", "all"].includes(body.logLevel)) {
				throw new MockError("BAD_REQUEST", 400, "logLevel 只能是 silent, hit 或 all", {
					field: "logLevel",
				});
			}
			updateState(draft => {
				if ("enabled" in body) {
					draft.enabled = body.enabled;
				}
				if ("group" in body) {
					draft.group = body.group;
				}
				if ("logLevel" in body) {
					draft.logLevel = body.logLevel;
				}
			}, "state");
			return meta(req);
		})
	);

	api.post(
		"/state/cleanup",
		wrap(() => {
			let removed = 0;
			updateState(draft => {
				Object.entries(draft.routes).forEach(([id, rs]) => {
					const route = registry.routes.get(keyOfRouteId(id));
					if (!route) {
						delete draft.routes[id];
						removed++;
						return;
					}
					if (rs.scene && !route.scenes.has(rs.scene)) {
						delete rs.scene;
						removed++;
					}
					if (!Object.keys(rs).length) {
						delete draft.routes[id];
					}
				});
				Object.values(draft.groups).forEach(map => {
					Object.entries(map).forEach(([id, scene]) => {
						const route = registry.routes.get(keyOfRouteId(id));
						if (!route || !route.scenes.has(scene)) {
							delete map[id];
							removed++;
						}
					});
				});
			}, "state");
			return { removed };
		})
	);

	api.delete(
		"/orphans",
		wrap(() => {
			const files = registry.orphans.map(o => o.file);
			files.forEach(file => fileStore.removeFile(file));
			registry.reloadNow();
			changed("routes");
			return { removed: files.length };
		})
	);

	// ---- 请求忽略 ----
	const ignoreConfig = () => {
		const { ignore } = store.get();
		const off = new Set(ignore.disabled);
		return {
			defaults: {
				enabled: ignore.defaults,
				/** 选项 ignoreDefaults: false 时内置规则强制关闭, 管理页开关无效 */
				forcedOff: !ctx.ignore.optionDefaults,
				rules: DEFAULT_IGNORE.map(r => ({
					pattern: r.pattern,
					reason: r.reason,
					enabled: !off.has(r.pattern),
				})),
			},
			options: ctx.ignore.optionRules,
			custom: ignore.custom,
		};
	};

	api.get(
		"/ignore",
		wrap(() => ignoreConfig())
	);

	/** 只校验不保存, 供管理页即时提示 */
	api.post(
		"/ignore/validate",
		wrap(req => {
			const rules = (req.body || {}).rules;
			if (!Array.isArray(rules)) {
				throw new MockError("BAD_REQUEST", 400, "rules 必须是字符串数组", {
					field: "rules",
				});
			}
			return { errors: validateIgnore(rules) };
		})
	);

	api.put(
		"/ignore",
		wrap(req => {
			const body = req.body || {};
			if ("defaults" in body && typeof body.defaults !== "boolean") {
				throw new MockError("BAD_REQUEST", 400, "defaults 必须是布尔值", {
					field: "defaults",
				});
			}
			const known = new Set(DEFAULT_IGNORE.map(r => r.pattern));
			if (
				"disabled" in body &&
				!(
					Array.isArray(body.disabled) &&
					body.disabled.every((p: unknown) => typeof p === "string" && known.has(p))
				)
			) {
				throw new MockError("BAD_REQUEST", 400, "disabled 只能包含内置规则", {
					field: "disabled",
				});
			}
			if ("custom" in body) {
				if (!Array.isArray(body.custom) || body.custom.length > 200) {
					throw new MockError(
						"BAD_REQUEST",
						400,
						"custom 必须是不超过 200 条的字符串数组",
						{ field: "custom" }
					);
				}
				const errors = validateIgnore(body.custom);
				if (errors.length) {
					throw new MockError(
						"INVALID_RULE",
						400,
						`第 ${errors[0].index + 1} 条规则无效: ${errors[0].error}`,
						{ field: "custom", errors }
					);
				}
			}
			updateState(draft => {
				if ("defaults" in body) {
					draft.ignore.defaults = body.defaults;
				}
				if ("disabled" in body) {
					draft.ignore.disabled = body.disabled;
				}
				if ("custom" in body) {
					draft.ignore.custom = body.custom.map((p: string) => p.trim());
				}
			}, "ignore");
			return ignoreConfig();
		})
	);

	api.get(
		"/logs",
		wrap(req => journal.list(req.query as any))
	);

	api.get(
		"/logs/:id",
		wrap(req => {
			const entry = journal.get(String(req.params.id));
			if (!entry) {
				throw new MockError("NOT_FOUND", 404, "日志条目不存在或已滚出缓冲区");
			}
			return entry;
		})
	);

	api.delete(
		"/logs",
		wrap((_req, res) => {
			journal.clear();
			changed("logs");
			res.status(204).end();
		})
	);

	api.post(
		"/logs/:id/scene",
		wrap((req, res) => {
			const entry = journal.get(String(req.params.id));
			if (!entry) {
				throw new MockError("NOT_FOUND", 404, "日志条目不存在或已滚出缓冲区");
			}
			const body = req.body || {};
			const name = assertName(body.name, "场景名");
			const { response } = entry;
			if (response.truncated) {
				throw new MockError("BAD_REQUEST", 400, "响应超过 256KB 已被截断, 无法存为场景");
			}
			if (response.bodyEncoding === "base64") {
				throw new MockError("BAD_REQUEST", 400, "二进制或无法解码的响应不能存为场景");
			}
			const headers: Record<string, string> = {};
			Object.entries(response.headers).forEach(([k, v]) => {
				if (!DROP_HEADERS.has(k) && !SECRET_HEADERS.has(k) && !k.startsWith("x-mock")) {
					headers[k] = v;
				}
			});
			// 空响应(204, DELETE 等无响应体)存为空字符串, 回放时同样不带响应体; JSON 的 null 仍为 null
			const responseBody = response.bodyEncoding === "none" ? "" : response.body;
			const envelope = { status: entry.status || 200, headers, body: responseBody };
			let route: RouteEntry;
			if (body.routeId) {
				route = routeOf(String(body.routeId));
			} else if (entry.routeId) {
				route = routeOf(entry.routeId);
			} else {
				const key = keyFromInput(
					body.create || { methods: [entry.method], path: splitUrl(entry.url).pathname }
				);
				route = createGuiRoute(key, { body: responseBody });
			}
			const out = writeScene(route, name, envelope, null, req, !!body.overwrite);
			res.status(201);
			return { route: summary(routeOf(route.id)), scene: out };
		})
	);

	api.get("/events", (req, res) => events.connect(req, res));

	api.use((_req, _res, next) => next(new MockError("NOT_FOUND", 404, "接口不存在")));
	router.use("/api", api);

	// ---- 管理页 ----
	router.get(SPA_PATHS, (req, res) => {
		const index = path.join(UI_DIR, "index.html");
		if (!fs.existsSync(index)) {
			res.status(503)
				.type("text/html; charset=utf-8")
				.send(
					"<!doctype html><meta charset=utf-8><title>easy-mok</title><p>管理页尚未构建: 在 easy-mok 包目录运行 <code>npm run build</code>.</p>"
				);
			return;
		}
		// 资源是相对路径, 按挂载前缀注入 <base>; req.baseUrl 含宿主的挂载路径与 /__mock
		let html = "";
		try {
			html = fs.readFileSync(index, "utf8");
		} catch {
			sendOwnFile(res, index);
			return;
		}
		const base = `${req.baseUrl}/ui/`.replace(/"/g, "&quot;");
		res.setHeader("cache-control", "no-cache");
		res.type("text/html; charset=utf-8").send(
			html.replace(/<head>/i, `<head>\n\t\t<base href="${base}" />`)
		);
	});

	router.use((err: any, _req: Req, res: Res, next: NextFunction) => {
		if (res.headersSent) {
			return next(err);
		}
		let e: MockError;
		if (err instanceof MockError) {
			e = err;
		} else if (err && err.type === "entity.too.large") {
			e = new MockError("PAYLOAD_TOO_LARGE", 413, "请求体超过 2MB");
		} else if (err && err.type === "entity.parse.failed") {
			e = new MockError("BAD_REQUEST", 400, "请求体不是合法的 JSON");
		} else {
			console.error("[easy-mok] 管理接口出错:", err);
			e = new MockError("INTERNAL", 500, "服务内部错误, 详见 dev server 控制台");
		}
		if (e.cause) {
			console.error("[easy-mok]", e.message, e.cause);
		}
		res.status(e.status).json({
			error: {
				code: e.code,
				message: e.message,
				...(e.details ? { details: e.details } : {}),
			},
		});
	});

	return { router, meta, etagOf };
};
