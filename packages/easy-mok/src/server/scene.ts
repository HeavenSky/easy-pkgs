// 场景声明助手与场景解析优先级
import { isPlainObject } from "./util";
import type { MockState } from "./state";

export const SCENES = Symbol.for("easy-mok.scenes");

export type SceneKind = "data" | "function" | "proxy" | "envelope";
/** 管理页展示的场景类型: 无参函数(内部 kind 为 proxy)尚未调用时为 nullary, 调用后按返回值为 function 或 proxy; 带脚本的信封为 script */
export type DisplayKind = SceneKind | "nullary" | "script";
export type SceneSource = "code" | "json";
/** script 为管理页写的处理函数源码; 有 script 时忽略 body */
export type Envelope = { status?: number, headers?: Record<string, string>, body?: unknown, delay?: number, script?: string };
/** handler 是 envelope 中 script 编译后的函数 */
export type Scene = { name: string, source: SceneSource, kind: SceneKind, value: unknown, etag?: string, overrides?: boolean, handler?: Function };
export type SceneLevel = "request" | "browser" | "route" | "group" | "default";
export type ActiveScene = { name: string, level: SceneLevel, fallback: boolean };

/** 声明多场景路由; 必须含 default, 缺失时以第一个场景为 default 并记诊断. */
export const scenes = <T extends Record<string, unknown>>(map: T): T => {
	if (!isPlainObject(map) || !Object.keys(map).length) {
		throw new TypeError("scenes() 需要一个至少包含一个场景的对象");
	}
	return Object.defineProperty({ ...map }, SCENES, { value: true });
};

export const isScenes = (value: unknown) => !!value && typeof value === "object" && (value as any)[SCENES] === true;

/**
 * 场景值的类型只看 fn.length, 不解析函数源码(bind, 包装函数与转译都会让源码失真):
 * - 非函数: 数据, 直接作为响应体
 * - length > 0: 自行处理 (req, res, next) 的函数; 未响应也未调用 next() 时返回值即响应体
 * - length === 0: 无参函数, 返回含 target / router 的对象时为代理配置, 否则返回值即响应体; 不解析请求体
 * 禁止用 (...args) => 这类剩余参数定义路由函数, 首个参数也不要带默认值: 它们的 length 为 0, 会被当作无参函数
 * (返回值当代理配置或响应体, 且不解析请求体). 自行处理请求时显式写出形参 (req, res, next) =>.
 */
export const kindOf = (value: unknown): SceneKind => {
	if (typeof value !== "function") { return "data"; }
	return value.length === 0 ? "proxy" : "function";
};

/** 代码声明的值 → 场景表; 普通值只有 default. */
export const codeScenes = (value: unknown): { scenes: Map<string, Scene>, missingDefault: boolean } => {
	const map = new Map<string, Scene>();
	if (!isScenes(value)) {
		map.set("default", { name: "default", source: "code", kind: kindOf(value), value });
		return { scenes: map, missingDefault: false };
	}
	const obj = value as Record<string, unknown>;
	Object.keys(obj).forEach(name => {
		map.set(name, { name, source: "code", kind: kindOf(obj[name]), value: obj[name] });
	});
	const missingDefault = !map.has("default");
	if (missingDefault) {
		const first = map.values().next().value as Scene;
		map.set("default", { ...first, name: "default" });
	}
	return { scenes: map, missingDefault };
};

export const parseCookie = (header: string | undefined): Record<string, string> => {
	const out: Record<string, string> = {};
	String(header || "").split(";").forEach(part => {
		const i = part.indexOf("=");
		if (i < 0) { return; }
		const k = part.slice(0, i).trim();
		let v = part.slice(i + 1).trim();
		try { v = decodeURIComponent(v); } catch (_error) { /* 保留原值 */ }
		if (k && !(k in out)) { out[k] = v; }
	});
	return out;
};

/** 按优先级解析生效场景: 请求级 > 浏览器组 > 路由手选 > 全局组 > default; 指定的场景不存在时降到下一级. */
export const resolveScene = ({ routeId, has, state, request = {} }: {
	routeId: string,
	has: (name: string) => boolean,
	state: MockState,
	request?: { header?: string | null, query?: string | null, cookieGroup?: string | null },
}): ActiveScene => {
	let fallback = false;
	const chain: Array<[SceneLevel, string | null | undefined]> = [
		["request", request.header || request.query],
		["browser", request.cookieGroup ? state.groups[request.cookieGroup]?.[routeId] : null],
		["route", state.routes[routeId]?.scene],
		["group", state.group ? state.groups[state.group]?.[routeId] : null],
	];
	for (const [level, name] of chain) {
		if (!name) { continue; }
		if (has(name)) { return { name, level, fallback }; }
		fallback = true;
	}
	return { name: "default", level: "default", fallback };
};
