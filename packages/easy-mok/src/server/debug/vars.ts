// 调试请求的变量解析: 环境组 < 各级分组 < 请求 < 快照逐层覆盖, 替换 {{var}}, 路径参数与查询参数, 生成认证头
import { MockError, isPlainObject } from "../util";
import type { EnvStore } from "./env";
import { SECRET_RE } from "./env";
import type { DebugStore } from "./store";

const VAR_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*\}\}/g;

export type ResolvedValue = { value: string; from: string };
export type ResolvedRequest = {
	method: string;
	url: string;
	/** URL 解析失败或协议不是 http/https 时的说明 */
	urlError: string | null;
	headers: Array<[string, string]>;
	body: Record<string, any>;
	values: Record<string, ResolvedValue>;
	unresolved: string[];
	/** 本次用到的敏感值原文, 供调用方在需要时脱敏 */
	secrets: string[];
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * mode 为 preview 时敏感值保留占位符, 不读取来源; send 时解析真实值, 来源不可用即抛 SECRET_UNAVAILABLE.
 * snapshotVars 为快照级变量, 优先级最高.
 */
export const resolveRequest = (
	deps: { store: DebugStore; envs: EnvStore },
	input: {
		requestId: string | null;
		definition: Record<string, any>;
		env: string | null;
		snapshotVars?: Record<string, string> | null;
		mode: "preview" | "send";
	}
): ResolvedRequest => {
	const { definition: def, env, mode } = input;
	const raw: Record<string, ResolvedValue> = {};
	if (env) {
		Object.entries(deps.envs.get(env).vars).forEach(([k, v]) => (raw[k] = { value: v, from: `env:${env}` }));
	}
	deps.store.varLayers(input.requestId).forEach(layer =>
		Object.entries(layer.vars).forEach(([k, v]) => (raw[k] = { value: v, from: layer.from }))
	);
	Object.entries(input.snapshotVars || {}).forEach(([k, v]) => (raw[k] = { value: v, from: "snapshot" }));

	const values: Record<string, ResolvedValue> = {};
	const unresolved = new Set<string>();
	const secrets: string[] = [];
	const lookup = (name: string) => {
		if (values[name]) return values[name].value;
		const r = raw[name];
		if (!r) {
			unresolved.add(name);
			return null;
		}
		const m = SECRET_RE.exec(r.value);
		if (!m) {
			values[name] = r;
			return r.value;
		}
		let value = `<secret:${m[1]}>`;
		if (mode === "send") {
			if (!env) {
				throw new MockError("SECRET_UNAVAILABLE", 400, `变量 ${name} 引用了敏感值来源 ${m[1]}, 需要先激活环境组`, { srcId: m[1] });
			}
			value = deps.envs.resolveSecret(env, m[1]);
			secrets.push(value);
		}
		values[name] = { value, from: `secret:${m[1]}` };
		return value;
	};
	const sub = (s: unknown) =>
		typeof s === "string" ? s.replace(VAR_RE, (all, name: string) => lookup(name) ?? all) : s;
	const deep = (v: unknown): unknown =>
		typeof v === "string"
			? sub(v)
			: Array.isArray(v)
				? v.map(deep)
				: isPlainObject(v)
					? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)]))
					: v;

	let url = String(sub(def.url || ""));
	Object.entries((def.params && def.params.path) || {}).forEach(([k, v]) => {
		const value = String(sub(v));
		values[k] = { value, from: "path" };
		url = url.replace(new RegExp(`:${escapeRe(k)}(?=[/?#]|$)`, "g"), encodeURIComponent(value));
	});
	let urlError: string | null = null;
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			urlError = `只支持 http 与 https: ${parsed.protocol}`;
		}
		((def.params && def.params.query) || []).forEach((row: [string, string, boolean]) => {
			if (row[2] !== false && row[0]) parsed.searchParams.append(String(sub(row[0])), String(sub(row[1])));
		});
		url = parsed.toString();
	} catch {
		urlError = url ? `URL 无效: ${url}` : "URL 不能为空";
	}

	const headers: Array<[string, string]> = ((def.headers || []) as Array<[string, string, boolean]>)
		.filter(row => row[2] !== false && row[0])
		.map(row => [row[0].toLowerCase(), String(sub(row[1]))]);
	const auth = def.auth || {};
	if (!headers.some(([k]) => k === "authorization")) {
		if (auth.type === "bearer") headers.push(["authorization", `Bearer ${sub(auth.token || "")}`]);
		if (auth.type === "basic") {
			const pair = `${sub(auth.username || "")}:${sub(auth.password || "")}`;
			headers.push(["authorization", `Basic ${Buffer.from(pair).toString("base64")}`]);
		}
	}

	const body = deep(def.body || { type: "none" }) as Record<string, any>;
	return {
		method: String(def.method || "GET").toUpperCase(),
		url,
		urlError,
		headers,
		body,
		values,
		unresolved: [...unresolved].sort(),
		secrets,
	};
};
