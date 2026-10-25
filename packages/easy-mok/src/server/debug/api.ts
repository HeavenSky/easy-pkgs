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
import { performSend } from "./send";
import type { SendResult } from "./send";
import { META_FILE } from "./names";
import { createEnvStore } from "./env";
import { decodeId } from "./names";
import { createDebugStore, normalizeDefinition } from "./store";
import { resolveRequest } from "./vars";

export type DebugApiContext = {
	folder: string;
	state: ReturnType<typeof createStateStore>;
	/** 通知管理页数据变化 */
	emit: (scope: string) => void;
	lan: LanControl;
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

	router.patch(
		"/nodes/:id",
		wrap(req => {
			const out = store.updateNode(idParam(req), req.body || {}, parseIfMatch(req.headers["if-match"]));
			changed();
			return out.node;
		})
	);

	router.delete(
		"/nodes/:id",
		wrap((req, res) => {
			store.deleteNode(idParam(req), req.query.recursive === "1");
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
		return { requestId, definition, env };
	};

	router.post(
		"/resolve",
		wrap(req => {
			const body = isPlainObject(req.body) ? req.body : {};
			const { requestId, definition, env } = resolveInput(body);
			const out = resolveRequest({ store, envs }, { requestId, definition, env, mode: "preview" });
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
		const resolved = resolveRequest({ store, envs }, { ...input, mode: "send" });
		if (resolved.unresolved.length) {
			throw new MockError("UNRESOLVED_VARS", 400, `有未解析的变量: ${resolved.unresolved.join(", ")}`, { vars: resolved.unresolved });
		}
		if (resolved.urlError) throw new MockError("BAD_REQUEST", 400, resolved.urlError, { field: "url" });
		const slot = history.allocate();
		let result: SendResult;
		try {
			result = await performSend({ resolved, settings: input.definition.settings, folder: ctx.folder, dir: slot.dir, signal });
		} catch (err) {
			fs.rmSync(slot.dir, { recursive: true, force: true });
			throw err;
		}
		if (extra) result = extra(result);
		const meta = {
			version: 1,
			origin: { kind: "debug", request: input.requestId },
			capturedAt: localIso(new Date()),
			reqHash: reqHashOf(input.definition),
			timing: result.timing,
			request: result.request,
			template: { env: input.env, request: input.definition, values: resolved.values },
			response: result.response,
			error: result.error,
			note: "",
		};
		writeJsonAtomic(path.join(slot.dir, META_FILE), meta);
		const line = history.commit(slot, {
			request: input.requestId,
			env: input.env,
			method: result.request.method,
			url: result.request.url,
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

	const historyInfo = () => ({ historyBytes: history.totalBytes(), historyWarn: history.warn() });

	return { router, store, envs, history, activeEnv, resolveInput, changed, sendAndRecord, sendStored, historyInfo };
};

export type DebugApi = ReturnType<typeof createDebugApi>;
