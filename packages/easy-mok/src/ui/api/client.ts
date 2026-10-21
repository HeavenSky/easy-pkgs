import type { z } from "zod";
import { ApiErrorBody } from "./contract";

/** 管理页挂载前缀: 按页面所在路径推算, 宿主把 easy-mok 挂在子路径(如 app.use("/api", mock))时为 /api/__mock */
export const mockBaseOf = (pathname: string) => {
	const m = /^(.*?\/__mock)(\/|$)/.exec(pathname);
	return m ? m[1] : "/__mock";
};

export const MOCK_BASE = mockBaseOf(
	typeof location === "undefined" ? "/__mock/" : location.pathname
);
export const API_BASE = `${MOCK_BASE}/api`;

export class ApiError extends Error {
	readonly code: string;
	readonly status: number;
	readonly details?: Record<string, unknown>;

	constructor(code: string, status: number, message: string, details?: Record<string, unknown>) {
		super(message);
		this.code = code;
		this.status = status;
		this.details = details;
	}
}

type BootListener = (bootId: string) => void;
const bootListeners = new Set<BootListener>();
export const onBootId = (fn: BootListener) => {
	bootListeners.add(fn);
	return () => {
		bootListeners.delete(fn);
	};
};

interface RequestOptions {
	method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	body?: unknown;
	headers?: Record<string, string>;
	signal?: AbortSignal;
}

export async function request<T>(
	schema: z.ZodType<T> | null,
	path: string,
	opt: RequestOptions = {}
): Promise<T> {
	const headers: Record<string, string> = { "x-mock-ui": "1", ...opt.headers };
	if (opt.body !== undefined) {
		headers["content-type"] = "application/json";
	}
	let res: Response;
	try {
		res = await fetch(API_BASE + path, {
			method: opt.method || "GET",
			headers,
			body: opt.body === undefined ? undefined : JSON.stringify(opt.body),
			signal: opt.signal,
		});
	} catch (err) {
		if ((err as Error).name === "AbortError") {
			throw err;
		}
		throw new ApiError("NETWORK", 0, "无法连接 dev server, 请确认开发服务仍在运行");
	}
	const boot = res.headers.get("x-mock-boot");
	if (boot) {
		bootListeners.forEach(fn => fn(boot));
	}
	const text = await res.text();
	let data: unknown = null;
	if (text) {
		try {
			data = JSON.parse(text);
		} catch {
			data = text;
		}
	}
	if (!res.ok) {
		const parsed = ApiErrorBody.safeParse(data);
		if (parsed.success) {
			const { code, message, details } = parsed.data.error;
			throw new ApiError(code, res.status, message, details);
		}
		throw new ApiError("HTTP", res.status, `请求失败 (${res.status})`);
	}
	if (!schema) {
		return data as T;
	}
	const parsed = schema.safeParse(data);
	if (!parsed.success) {
		console.error("[easy-mok] 接口返回不符合契约", path, parsed.error);
		throw new ApiError(
			"CONTRACT",
			res.status,
			"接口返回格式不符合预期, 请确认管理页与 easy-mok 版本一致"
		);
	}
	return parsed.data;
}

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));
