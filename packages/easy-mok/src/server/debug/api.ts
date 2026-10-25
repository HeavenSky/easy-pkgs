// 调试接口 /__mock/api/debug/*: 请求集合, 环境组, 敏感值来源, 变量解析预览, 发送与历史
import crypto from "crypto";
import fs from "fs";
import path from "path";
import express from "express";
import type { NextFunction, Request as Req, Response as Res } from "express";
import { MockError, isPlainObject, writeJsonAtomic } from "../util";
import { isLoopback } from "../security";
import type { createStateStore } from "../state";
import type { LanControl } from "../lan";
import { streamFile } from "../respond";
import { createHistoryStore } from "./history";
import { createSnapshotStore } from "./snapshot";
import type { Refs } from "./refs";
import { createRedactRules, redactRequest, redactValues, secretHitsOf } from "./redact";
import { diffResults } from "./diff";
import { createCookieJar } from "./cookies";
import { curlOfResolved, curlOfTemplate, parseCurl, toCurl } from "./curl";
import { exportOpenApi, importOpenApi, sanitizeName } from "./openapi";
import { performSend } from "./send";
import type { SendResult } from "./send";
import { META_FILE } from "./names";
import { createEnvStore } from "./env";
import { decodeId } from "./names";
import { createDebugStore, defaultDefinition, normalizeDefinition } from "./store";
import type { LogDetail } from "../journal";
import { resolveRequest } from "./vars";

export type DebugApiContext = {
	folder: string;
	state: ReturnType<typeof createStateStore>;
	/** 通知管理页数据变化 */
	emit: (scope: string) => void;
	lan: LanControl;
	/** 场景引用快照的索引与改写; 缺省时不做引用完整性检查 */
	refs?: Refs;
	/** 按方法与路径名推荐 mock 路由 */
	routeCandidates?: (method: string, pathname: string) => Array<{ routeId: string; key: string }>;
};

const pad = (n: number) => String(n).padStart(2, "0");
/** 带时区偏移的本地时间, 如 2026-10-26T00:12:03+08:00 */
export const localIso = (d: Date) => {
	const off = -d.getTimezoneOffset();
	const sign = off >= 0 ? "+" : "-";
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
};

const parseIfMatch = (header: string | undefined) =>
	header ? String(header).replace(/^W\//, "").replace(/^"|"$/g, "") : null;

export const wrap =
	(fn: (req: Req, res: Res) => unknown) => async (req: Req, res: Res, next: NextFunction) => {
		try {
			const out = await fn(req, res);
			if (out !== undefined && !res.headersSent) {
				res.json(out);
			}
		} catch (err) {
			next(err);
		}
	};

export const localOnly = (req: Req, what: string) => {
	if (!isLoopback(req.socket.remoteAddress || "")) {
		throw new MockError("FORBIDDEN", 403, `${what}只能在本机的管理页中操作`);
	}
};

export const createDebugApi = (ctx: DebugApiContext) => {
	const store = createDebugStore(ctx.folder);
	const envs = createEnvStore(store.root);
	const history = createHistoryStore(store.root);
	const redactRules = createRedactRules(store.root);
	const snapshots = createSnapshotStore({ store, history, rules: () => redactRules.get().fields });
	const router = express.Router();
	const changed = () => ctx.emit("debug");
	const idParam = (req: Req, name = "id") => decodeId(req.params[name]);

	/** 激活的环境组; 已被删除时视为未激活 */
	const activeEnv = () => {
		const name = ctx.state.get().debug.env;
		if (!name) return null;
		try {
			return envs.get(name).name;
		} catch {
			return null;
		}
	};
	const setActive = (name: string | null) => {
		ctx.state.update(draft => {
			draft.debug.env = name;
		});
	};

	const requestOut = (r: ReturnType<typeof store.getRequest>) => ({
		id: r.id,
		definition: r.definition,
		meta: { title: r.meta.name || null, weight: r.meta.weight || 0, vars: r.meta.vars || {} },
		etag: r.etag,
		metaEtag: r.metaEtag,
	});

	router.get(
		"/tree",
		wrap(() => store.tree())
	);

	router.post(
		"/nodes",
		wrap((req, res) => {
			const node = store.createNode(req.body || {});
			changed();
			res.status(201);
			return node;
		})
	);

	/** 有场景引用且未带 force=1 时拒绝删除, 返回引用方 */
	const guardRefs = (req: Req, usages: Array<{ route: string; scene: string; file: string; ref: string }>) => {
		if (usages.length && req.query.force !== "1") {
			throw new MockError("REF_IN_USE", 409, `有 ${usages.length} 个场景引用了要删除的快照, 确认后再删除`, { refs: usages });
		}
	};

	router.patch(
		"/nodes/:id",
		wrap(req => {
			const out = store.updateNode(idParam(req), req.body || {}, parseIfMatch(req.headers["if-match"]));
			const rewritten = out.from !== out.to && ctx.refs ? ctx.refs.moveNode(out.from, out.to) : 0;
			changed();
			return { ...out.node, rewritten };
		})
	);

	router.delete(
		"/nodes/:id",
		wrap((req, res) => {
			const id = idParam(req);
			const usages = ctx.refs ? ctx.refs.forNode(store.nodeDir(id).segments.join("/")) : [];
			guardRefs(req, usages);
			store.deleteNode(id, req.query.recursive === "1");
			if (usages.length && ctx.refs) ctx.refs.reload(); // 刷新失效引用的诊断
			changed();
			res.status(204).end();
		})
	);

	router.get(
		"/requests/:id",
		wrap(req => requestOut(store.getRequest(idParam(req))))
	);

	router.put(
		"/requests/:id",
		wrap(req => {
			const body = req.body || {};
			const out = store.putRequest(idParam(req), body.definition, parseIfMatch(req.headers["if-match"]));
			changed();
			return requestOut(out);
		})
	);

	router.get(
		"/envs",
		wrap(() => {
			const { groups, problems } = envs.list();
			return { active: activeEnv(), groups, problems };
		})
	);

	router.put(
		"/active-env",
		wrap(req => {
			const name = (req.body || {}).name;
			if (name !== null && typeof name !== "string") {
				throw new MockError("BAD_REQUEST", 400, "name 必须是字符串或 null", { field: "name" });
			}
			setActive(name === null ? null : envs.get(name).name);
			changed();
			return { active: activeEnv() };
		})
	);

	router.put(
		"/envs/:name",
		wrap(req => {
			const out = envs.put(String(req.params.name), req.body || {}, parseIfMatch(req.headers["if-match"]));
			changed();
			return out;
		})
	);

	router.patch(
		"/envs/:name",
		wrap(req => {
			const from = String(req.params.name);
			const out = envs.rename(from, (req.body || {}).name);
			if (ctx.state.get().debug.env === from) setActive(out.name);
			changed();
			return out;
		})
	);

	router.delete(
		"/envs/:name",
		wrap((req, res) => {
			const name = envs.remove(String(req.params.name));
			if (ctx.state.get().debug.env === name) setActive(null);
			changed();
			res.status(204).end();
		})
	);

	router.get(
		"/envs/:name/cookies",
		wrap(req => createCookieJar(envs.cookiesFileOf(envs.get(String(req.params.name)).name)).list())
	);

	router.delete(
		"/envs/:name/cookies",
		wrap((req, res) => {
			createCookieJar(envs.cookiesFileOf(envs.get(String(req.params.name)).name)).clear(isPlainObject(req.body) ? req.body : undefined);
			changed();
			res.status(204).end();
		})
	);

	router.get(
		"/envs/:name/secrets",
		wrap(req => envs.listSecrets(String(req.params.name)))
	);

	router.put(
		"/envs/:name/secrets/:srcId",
		wrap(req => {
			localOnly(req, "敏感值来源");
			const out = envs.putSecret(String(req.params.name), String(req.params.srcId), req.body);
			changed();
			return out;
		})
	);

	/** prompt 来源: 在管理页输入的值只保存在内存中 */
	router.put(
		"/envs/:name/secrets/:srcId/value",
		wrap((req, res) => {
			localOnly(req, "敏感值");
			envs.enterPrompt(String(req.params.name), String(req.params.srcId), (req.body || {}).value);
			changed();
			res.status(204).end();
		})
	);

	router.get(
		"/redact",
		wrap(() => redactRules.get())
	);

	router.put(
		"/redact",
		wrap(req => {
			const out = redactRules.put((req.body || {}).fields);
			changed();
			return out;
		})
	);

	router.delete(
		"/envs/:name/secrets/:srcId",
		wrap((req, res) => {
			localOnly(req, "敏感值来源");
			envs.deleteSecret(String(req.params.name), String(req.params.srcId));
			changed();
			res.status(204).end();
		})
	);

	/** 解析输入: 已保存的请求可省略 definition, 草稿直接传 definition */
	const resolveInput = (body: Record<string, any>) => {
		const requestId = typeof body.request === "string" && body.request ? body.request : null;
		const definition = body.definition !== undefined
			? normalizeDefinition(body.definition)
			: requestId
				? store.getRequest(requestId).definition
				: (() => {
						throw new MockError("BAD_REQUEST", 400, "缺少 request 或 definition");
					})();
		if (requestId) store.nodeDir(requestId, "request");
		const env = body.env === undefined ? activeEnv() : body.env === null ? null : envs.get(String(body.env)).name;
		const snapshotVars = typeof body.snapshot === "string" && body.snapshot ? snapshots.varsOf(body.snapshot) : null;
		return { requestId, definition, env, snapshotVars };
	};

	router.post(
		"/resolve",
		wrap(req => {
			const body = isPlainObject(req.body) ? req.body : {};
			const { requestId, definition, env, snapshotVars } = resolveInput(body);
			const out = resolveRequest({ store, envs }, { requestId, definition, env, snapshotVars, mode: "preview" });
			return {
				method: out.method,
				url: out.url,
				urlError: out.urlError,
				headers: out.headers,
				values: out.values,
				unresolved: out.unresolved,
				env,
			};
		})
	);

	/** 按 D50: 请求定义按 key 排序后取 sha256 */
	const canonical = (v: unknown): unknown =>
		Array.isArray(v)
			? v.map(canonical)
			: isPlainObject(v)
				? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])]))
				: v;
	const reqHashOf = (def: unknown) =>
		`sha256:${crypto.createHash("sha256").update(JSON.stringify(canonical(def))).digest("hex")}`;

	/** 本机直接放行; 局域网设备需要访问与代发两个开关都打开 */
	const assertCanSend = (req: Req) => {
		if (isLoopback(req.socket.remoteAddress || "")) return;
		if (!(ctx.lan.access && ctx.lan.send)) {
			throw new MockError("FORBIDDEN", 403, "代发请求默认只允许本机, 局域网代发需在本机管理页打开「允许局域网代发」");
		}
	};

	/**
	 * 解析并发送, 结果写入一条历史; snapshotVars 为快照级变量. 返回 { id, meta }.
	 * signal 中止时(客户端断开)请求被取消, 历史中记为 ABORTED.
	 */
	const sendAndRecord = async (
		input: { requestId: string | null; definition: Record<string, any>; env: string | null; snapshotVars?: Record<string, string> | null },
		signal: AbortSignal,
		extra?: (result: SendResult) => SendResult
	) => {
		if (input.env) await envs.prefetchSecrets(input.env);
		const resolved = resolveRequest({ store, envs }, { ...input, mode: "send" });
		if (resolved.unresolved.length) {
			throw new MockError("UNRESOLVED_VARS", 400, `有未解析的变量: ${resolved.unresolved.join(", ")}`, { vars: resolved.unresolved });
		}
		if (resolved.urlError) throw new MockError("BAD_REQUEST", 400, resolved.urlError, { field: "url" });
		const slot = history.allocate();
		let result: SendResult;
		try {
			const jar = input.env && input.definition.settings.skipCookieJar !== true ? createCookieJar(envs.cookiesFileOf(input.env)) : null;
			result = await performSend({
				resolved,
				settings: input.definition.settings,
				folder: ctx.folder,
				dir: slot.dir,
				signal,
				cookies: jar ? { header: jar.header, store: jar.store } : undefined,
			});
		} catch (err) {
			fs.rmSync(slot.dir, { recursive: true, force: true });
			throw err;
		}
		if (extra) result = extra(result);
		// 历史与快照不落敏感值原文: 回填占位符, 敏感请求头写成 ***
		const hits = secretHitsOf(resolved.values);
		const request = redactRequest(result.request, hits);
		const meta = {
			version: 1,
			origin: { kind: "debug", request: input.requestId },
			capturedAt: localIso(new Date()),
			reqHash: reqHashOf(input.definition),
			timing: result.timing,
			request,
			template: { env: input.env, request: input.definition, values: redactValues(resolved.values) },
			response: result.response,
			error: result.error,
			note: "",
		};
		writeJsonAtomic(path.join(slot.dir, META_FILE), meta);
		const line = history.commit(slot, {
			request: input.requestId,
			env: input.env,
			method: request.method,
			url: request.url,
			status: result.response ? result.response.status : null,
			durationMs: result.timing.durationMs,
			time: Date.now(),
			error: result.error ? result.error.code : null,
		});
		ctx.emit("debug");
		ctx.emit("meta");
		return { id: line.id, meta, line };
	};

	router.post(
		"/send",
		wrap(async (req, res) => {
			assertCanSend(req);
			const body = isPlainObject(req.body) ? req.body : {};
			const input = resolveInput(body);
			const controller = new AbortController();
			res.on("close", () => {
				if (!res.writableEnded) controller.abort();
			});
			const out = await sendAndRecord(input, controller.signal);
			return { id: out.id, meta: out.meta };
		})
	);

	router.get(
		"/history",
		wrap(req => {
			const request = typeof req.query.request === "string" && req.query.request ? req.query.request : null;
			const out = history.list({
				request,
				cursor: typeof req.query.cursor === "string" ? req.query.cursor : null,
				limit: Number(req.query.limit) || 50,
			});
			return { ...out, totalBytes: history.totalBytes(), warn: history.warn() };
		})
	);

	router.get(
		"/history-days",
		wrap(() => history.days())
	);

	router.delete(
		"/history-days/:day",
		wrap((req, res) => {
			history.removeDay(String(req.params.day));
			ctx.emit("debug");
			ctx.emit("meta");
			res.status(204).end();
		})
	);

	router.get(
		"/history/:hid",
		wrap(req => {
			const entry = history.get(idParam(req, "hid"));
			return { id: entry.id, meta: entry.meta };
		})
	);

	/** 原文: 管理接口与管理页同源, 一律 sandbox, 防止 HTML 中的脚本在此源执行 */
	const sendStored = (res: Res, req: Req, file: string, contentType: string | null, charset: string | null) => {
		res.setHeader("content-security-policy", "sandbox");
		res.setHeader("x-content-type-options", "nosniff");
		res.setHeader("cache-control", "no-store");
		if (contentType) res.setHeader("content-type", charset ? `${contentType}; charset=${charset}` : contentType);
		return streamFile(req as any, res, file);
	};

	router.get(
		"/history/:hid/raw",
		wrap(async (req, res) => {
			const entry = history.get(idParam(req, "hid"));
			const body = entry.meta.response && entry.meta.response.body;
			if (!body || !body.file) throw new MockError("NOT_FOUND", 404, "该条目没有响应体");
			await sendStored(res, req, path.join(entry.dir, body.file), body.contentType, body.charset);
		})
	);

	router.get(
		"/history/:hid/req",
		wrap(async (req, res) => {
			const entry = history.get(idParam(req, "hid"));
			if (!entry.meta.request || entry.meta.request.body.type !== "binary") throw new MockError("NOT_FOUND", 404, "该条目没有单独保存的请求体");
			await sendStored(res, req, path.join(entry.dir, "req.bin"), "application/octet-stream", null);
		})
	);

	router.post(
		"/history/:hid/snapshot",
		wrap((req, res) => {
			const out = snapshots.saveFromHistory(idParam(req, "hid"), req.body || {});
			if (ctx.refs && ctx.refs.forSnapshot(out.id).length) ctx.refs.reload(); // 覆盖后引用可能由失效变为有效
			changed();
			res.status(201);
			return out;
		})
	);

	const snapshotOut = (sid: string) => {
		const s = snapshots.get(sid);
		return { id: s.id, request: s.request, name: s.name, meta: s.meta };
	};

	router.get(
		"/snapshots/:sid",
		wrap(req => snapshotOut(idParam(req, "sid")))
	);

	router.get(
		"/snapshots/:sid/raw",
		wrap(async (req, res) => {
			const s = snapshots.get(idParam(req, "sid"));
			const body = s.meta.response && s.meta.response.body;
			if (!body || !body.file) throw new MockError("NOT_FOUND", 404, "该快照没有响应体");
			await sendStored(res, req, path.join(s.dir, body.file), body.contentType, body.charset);
		})
	);

	router.get(
		"/snapshots/:sid/req",
		wrap(async (req, res) => {
			const s = snapshots.get(idParam(req, "sid"));
			if (!s.meta.request || s.meta.request.body.type !== "binary") throw new MockError("NOT_FOUND", 404, "该快照没有单独保存的请求体");
			await sendStored(res, req, path.join(s.dir, "req.bin"), "application/octet-stream", null);
		})
	);

	router.patch(
		"/snapshots/:sid",
		wrap(req => {
			const out = snapshots.update(idParam(req, "sid"), req.body || {});
			const rewritten = out.from !== out.to && ctx.refs ? ctx.refs.renameSnapshot(out.from, out.to) : 0;
			changed();
			return { ...out.snapshot, rewritten };
		})
	);

	router.delete(
		"/snapshots/:sid",
		wrap((req, res) => {
			const loc = snapshots.locate(idParam(req, "sid"));
			const usages = ctx.refs ? ctx.refs.forSnapshot(loc.id) : [];
			guardRefs(req, usages);
			snapshots.remove(loc.id);
			if (usages.length && ctx.refs) ctx.refs.reload(); // 刷新失效引用的诊断
			changed();
			res.status(204).end();
		})
	);

	router.get(
		"/snapshots/:sid/refs",
		wrap(req => {
			const loc = snapshots.locate(idParam(req, "sid"));
			return ctx.refs ? ctx.refs.forSnapshot(loc.id).map(({ route, scene, file }) => ({ route, scene, file })) : [];
		})
	);

	router.get(
		"/requests/:id/route-match",
		wrap(req => {
			const requestId = idParam(req);
			const { definition } = store.getRequest(requestId);
			const env = typeof req.query.env === "string" ? envs.get(req.query.env).name : activeEnv();
			const out = resolveRequest({ store, envs }, { requestId, definition, env, mode: "preview" });
			let pathname = "";
			try {
				pathname = new URL(out.url).pathname;
			} catch {
				pathname = "";
			}
			return {
				pathname,
				candidates: pathname && ctx.routeCandidates ? ctx.routeCandidates(out.method, pathname) : [],
			};
		})
	);

	/** diff 的一侧: snapshot:<快照标识> 或 history:<历史标识> */
	const sideOf = (raw: unknown) => {
		const text = String(raw || "");
		if (text.startsWith("snapshot:")) {
			const s = snapshots.get(text.slice(9));
			return { meta: s.meta, dir: s.dir };
		}
		if (text.startsWith("history:")) {
			const h = history.get(text.slice(8));
			return { meta: h.meta, dir: h.dir };
		}
		throw new MockError("BAD_REQUEST", 400, "a 与 b 必须是 snapshot:<快照标识> 或 history:<历史标识>");
	};

	router.get(
		"/diff",
		wrap(req => diffResults(sideOf(req.query.a), sideOf(req.query.b)))
	);

	/** 用快照记录的请求模板与快照变量重新发送, 返回新历史与 diff; 不覆盖快照 */
	router.post(
		"/snapshots/:sid/refresh",
		wrap(async (req, res) => {
			assertCanSend(req);
			const snap = snapshots.get(idParam(req, "sid"));
			const body = isPlainObject(req.body) ? req.body : {};
			const template = snap.meta.template || {};
			const definition = normalizeDefinition(template.request || store.getRequest(snap.request).definition);
			const env = body.env !== undefined ? (body.env === null ? null : envs.get(String(body.env)).name) : template.env ? envs.get(template.env).name : activeEnv();
			const controller = new AbortController();
			res.on("close", () => {
				if (!res.writableEnded) controller.abort();
			});
			const out = await sendAndRecord(
				{ requestId: snap.request, definition, env, snapshotVars: snapshots.varsOf(snap.id) },
				controller.signal
			);
			const fresh = history.get(out.id);
			return { history: { id: out.id, meta: out.meta }, diff: diffResults({ meta: snap.meta, dir: snap.dir }, { meta: fresh.meta, dir: fresh.dir }) };
		})
	);

	router.post(
		"/import/curl",
		wrap((req, res) => {
			const body = isPlainObject(req.body) ? req.body : {};
			if (typeof body.text !== "string" || !body.text.trim()) throw new MockError("BAD_REQUEST", 400, "请粘贴 cURL 命令", { field: "text" });
			let parsed: ReturnType<typeof parseCurl>;
			try {
				parsed = parseCurl(body.text);
			} catch (err) {
				throw new MockError("BAD_REQUEST", 400, `无法解析 cURL 命令: ${(err as Error).message}`, { field: "text" });
			}
			const fallback = sanitizeName(new URL(parsed.definition.url).pathname.split("/").filter(Boolean).pop() || "request", "request");
			const node = store.createNode({ parent: body.parent ?? null, kind: "request", name: typeof body.name === "string" && body.name ? body.name : fallback });
			store.putRequest(node.id, parsed.definition);
			changed();
			res.status(201);
			return { node: { ...node, method: parsed.definition.method, url: parsed.definition.url }, warnings: parsed.warnings };
		})
	);

	router.post(
		"/export/curl",
		wrap(async req => {
			const body = isPlainObject(req.body) ? req.body : {};
			const source = String(body.source || "");
			if (source.startsWith("request:")) {
				const requestId = source.slice(8);
				const { definition } = store.getRequest(requestId);
				if (body.resolve !== true) return { text: curlOfTemplate(definition) };
				const env = body.env === undefined ? activeEnv() : body.env === null ? null : envs.get(String(body.env)).name;
				if (env) await envs.prefetchSecrets(env);
				return { text: curlOfResolved(resolveRequest({ store, envs }, { requestId, definition, env, mode: "send" })) };
			}
			if (source.startsWith("history:")) {
				const entry = history.get(source.slice(8));
				if (body.resolve !== true) return { text: curlOfTemplate(entry.meta.template.request) };
				const sent = entry.meta.request;
				const reqBody =
					sent.body.type === "text"
						? { type: "text", content: sent.body.text }
						: sent.body.type === "binary"
							? { type: "binary", file: path.join(entry.dir, "req.bin") }
							: { type: "none" };
				const headers = (sent.headers as Array<[string, string]>).filter(([k]) => k !== "host" && k !== "content-length");
				return { text: toCurl({ method: sent.method, url: sent.url, headers, body: reqBody }) };
			}
			throw new MockError("BAD_REQUEST", 400, "source 必须是 request:<请求标识> 或 history:<历史标识>", { field: "source" });
		})
	);

	router.post(
		"/import/openapi",
		wrap((req, res) => {
			const out = importOpenApi({ store, envs }, isPlainObject(req.body) ? req.body : {});
			changed();
			res.status(201);
			return out;
		})
	);

	router.post(
		"/export/openapi",
		wrap(req => exportOpenApi(store, isPlainObject(req.body) ? req.body : {}))
	);

	/** 请求日志条目转成调试请求(规格 6.6, D54): URL 写成 {{baseUrl}}<原路径>, 脱敏的头与 base64 体不带入 */
	const fromLog = (entry: LogDetail, input: { parent?: unknown; name?: unknown }) => {
		const warnings: string[] = [];
		const def = defaultDefinition();
		def.method = entry.method.toUpperCase();
		const split = new URL(entry.url, "http://x");
		def.url = `{{baseUrl}}${split.pathname}`;
		def.params.query = [...split.searchParams.entries()].map(([k, v]) => [k, v, true]);
		const SKIP = new Set(["host", "content-length", "connection", "transfer-encoding", "accept-encoding", "x-mock-scene"]);
		Object.entries(entry.request.headers).forEach(([k, v]) => {
			if (SKIP.has(k)) return;
			if (v === "***") {
				warnings.push(`请求头 ${k} 在日志中已脱敏, 未带入, 请在请求或环境组中补上`);
				return;
			}
			def.headers.push([k, v, true]);
		});
		const { body, bodyEncoding, truncated } = entry.request;
		const ctype = String(entry.request.headers["content-type"] || "");
		if (truncated) warnings.push("请求体在日志中被截断, 未带入");
		else if (bodyEncoding === "json") def.body = { type: "json", content: body };
		else if (bodyEncoding === "utf8") {
			if (/x-www-form-urlencoded/i.test(ctype)) {
				def.body = { type: "form", fields: [...new URLSearchParams(String(body)).entries()].map(([k, v]) => [k, v, true]) };
			} else def.body = { type: "text", content: String(body) };
		} else if (bodyEncoding === "base64") warnings.push("二进制请求体未带入");
		if (["form", "json"].includes(def.body.type)) def.headers = def.headers.filter((h: [string, string, boolean]) => h[0] !== "content-type");
		const fallback = sanitizeName(split.pathname.split("/").filter(Boolean).pop() || "request", "request");
		const node = store.createNode({ parent: input.parent ?? null, kind: "request", name: typeof input.name === "string" && input.name ? input.name : fallback });
		store.putRequest(node.id, def);
		changed();
		return { node: { ...node, method: def.method, url: def.url }, warnings };
	};

	const historyInfo = () => ({ historyBytes: history.totalBytes(), historyWarn: history.warn() });

	return { router, store, envs, history, snapshots, fromLog, activeEnv, resolveInput, changed, sendAndRecord, sendStored, historyInfo };
};

export type DebugApi = ReturnType<typeof createDebugApi>;
