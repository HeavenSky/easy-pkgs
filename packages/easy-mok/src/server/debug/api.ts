// 调试接口 /__mock/api/debug/*: 请求集合, 环境组, 敏感值来源与变量解析预览
import express from "express";
import type { NextFunction, Request as Req, Response as Res } from "express";
import { MockError, isPlainObject } from "../util";
import { isLoopback } from "../security";
import type { createStateStore } from "../state";
import { createEnvStore } from "./env";
import { decodeId } from "./names";
import { createDebugStore, normalizeDefinition } from "./store";
import { resolveRequest } from "./vars";

export type DebugApiContext = {
	folder: string;
	state: ReturnType<typeof createStateStore>;
	/** 通知管理页数据变化 */
	emit: (scope: string) => void;
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

	return { router, store, envs, activeEnv, resolveInput, changed };
};

export type DebugApi = ReturnType<typeof createDebugApi>;
