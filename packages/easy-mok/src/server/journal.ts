// 请求日志: 环形缓冲, 响应体捕获与解码, 敏感头脱敏
import zlib from "zlib";
import type {
	IncomingHttpHeaders,
	IncomingMessage,
	OutgoingHttpHeaders,
	ServerResponse,
} from "http";

// 单条响应捕获上限 256KB: 覆盖常见 JSON 接口, 未截断的响应才能"存为场景"
const BODY_LIMIT = 256 * 1024;
const REQ_BODY_LIMIT = 64 * 1024;
// 全部日志的请求体与响应体合计上限 32MB, 超出时淘汰最旧的条目; 否则 500 条 x 320KB 最坏占约 160MB
export const TOTAL_LIMIT = 32 * 1024 * 1024;
export const SECRET_HEADERS = new Set([
	"authorization",
	"proxy-authorization",
	"cookie",
	"set-cookie",
	"x-auth-token",
]);

export type LogKind = "mock" | "proxy" | "pass" | "miss" | "error";
export type LogSummary = {
	id: string;
	time: number;
	method: string;
	url: string;
	kind: LogKind;
	routeId: string | null;
	routeKey: string | null;
	scene: string | null;
	sceneLevel: string | null;
	sceneFallback: boolean;
	status: number;
	durationMs: number;
};
export type LogPart = {
	headers: Record<string, string>;
	body: unknown;
	bodyEncoding: "utf8" | "base64" | "json" | "none";
	truncated: boolean;
};
export type LogDetail = LogSummary & { request: LogPart; response: LogPart };

export const redact = (headers: IncomingHttpHeaders | OutgoingHttpHeaders) => {
	const out: Record<string, string> = {};
	Object.entries(headers).forEach(([k, v]) => {
		if (v === undefined) {
			return;
		}
		const key = k.toLowerCase();
		out[key] = SECRET_HEADERS.has(key) ? "***" : Array.isArray(v) ? v.join(", ") : String(v);
	});
	return out;
};

export const decodeBody = (buf: Buffer, encoding: string | undefined) => {
	const enc = String(encoding || "")
		.trim()
		.toLowerCase();
	try {
		if (enc === "gzip" || enc === "x-gzip") {
			return zlib.gunzipSync(buf);
		}
		if (enc === "deflate") {
			return zlib.inflateSync(buf);
		}
		if (enc === "br") {
			return zlib.brotliDecompressSync(buf);
		}
		if (enc === "zstd" && typeof (zlib as any).zstdDecompressSync === "function") {
			return (zlib as any).zstdDecompressSync(buf) as Buffer;
		}
	} catch {
		return null;
	}
	return enc && enc !== "identity" ? null : buf;
};

/** 文本类型按 utf8 存, JSON 解析成对象, 其余存 base64 */
const encodeBody = (
	buf: Buffer | null,
	type: string | undefined,
	truncated: boolean
): Pick<LogPart, "body" | "bodyEncoding"> => {
	if (!buf || !buf.length) {
		return { body: null, bodyEncoding: "none" };
	}
	const t = String(type || "").toLowerCase();
	const textual = !t || /json|text|xml|javascript|x-www-form-urlencoded|graphql/.test(t);
	if (!textual) {
		return { body: buf.toString("base64"), bodyEncoding: "base64" };
	}
	const text = buf.toString("utf8");
	if (/json/.test(t) && !truncated) {
		try {
			return { body: JSON.parse(text), bodyEncoding: "json" };
		} catch {
			/* 按文本存 */
		}
	}
	return { body: text, bodyEncoding: "utf8" };
};

const requestBodyOf = (body: unknown) => {
	if (body === undefined || body === null) {
		return { body: null, bodyEncoding: "none" as const, truncated: false };
	}
	if (Buffer.isBuffer(body)) {
		const truncated = body.length > REQ_BODY_LIMIT;
		return {
			body: body.subarray(0, REQ_BODY_LIMIT).toString("base64"),
			bodyEncoding: "base64" as const,
			truncated,
		};
	}
	if (typeof body === "string") {
		const truncated = body.length > REQ_BODY_LIMIT;
		return { body: body.slice(0, REQ_BODY_LIMIT), bodyEncoding: "utf8" as const, truncated };
	}
	const text = JSON.stringify(body);
	if (text.length > REQ_BODY_LIMIT) {
		return {
			body: text.slice(0, REQ_BODY_LIMIT),
			bodyEncoding: "utf8" as const,
			truncated: true,
		};
	}
	return { body, bodyEncoding: "json" as const, truncated: false };
};

export const isFetchLike = (req: IncomingMessage) => {
	const dest = req.headers["sec-fetch-dest"];
	const xhr = String(req.headers["x-requested-with"] || "").toLowerCase() === "xmlhttprequest";
	return dest === "empty" || xhr;
};

/** 条目中请求体与响应体占用的大致字节数 */
const bytesOf = (e: LogDetail) =>
	[e.request.body, e.response.body].reduce((n: number, b) => {
		if (b == null) {
			return n;
		}
		return n + (typeof b === "string" ? b.length : JSON.stringify(b).length);
	}, 0);

export const createJournal = (
	opt: { size?: number; totalBytes?: number; onLog?: (entry: LogSummary) => void } = {}
) => {
	const size = Math.max(10, opt.size || 500);
	const totalLimit = opt.totalBytes || TOTAL_LIMIT;
	let entries: LogDetail[] = [];
	const sizes = new WeakMap<LogDetail, number>();
	let total = 0;
	let seq = 0;

	const push = (entry: LogDetail) => {
		const bytes = bytesOf(entry);
		sizes.set(entry, bytes);
		entries.push(entry);
		total += bytes;
		while (entries.length > size || (total > totalLimit && entries.length > 1)) {
			total -= sizes.get(entries.shift() as LogDetail) || 0;
		}
		if (opt.onLog) opt.onLog(summaryOf(entry));
	};

	const summaryOf = (e: LogDetail): LogSummary => ({
		id: e.id,
		time: e.time,
		method: e.method,
		url: e.url,
		kind: e.kind,
		routeId: e.routeId,
		routeKey: e.routeKey,
		scene: e.scene,
		sceneLevel: e.sceneLevel,
		sceneFallback: e.sceneFallback,
		status: e.status,
		durationMs: e.durationMs,
	});

	/**
	 * 包装 res.write / res.end 收集响应字节, 只读不改; 请求结束后写入日志.
	 * @param describe 结束时调用, 取路由, 场景与 kind
	 */
	const capture = (
		req: IncomingMessage & { body?: unknown },
		res: ServerResponse,
		describe: () => Partial<LogSummary>
	) => {
		const start = Date.now();
		const chunks: Buffer[] = [];
		let length = 0;
		let truncated = false;
		const collect = (chunk: unknown, encoding?: unknown) => {
			if (chunk == null || typeof chunk === "function") {
				return;
			}
			if (length >= BODY_LIMIT) {
				truncated = true;
				return;
			}
			const buf = Buffer.isBuffer(chunk)
				? chunk
				: chunk instanceof Uint8Array
					? Buffer.from(chunk)
					: Buffer.from(
							String(chunk),
							typeof encoding === "string" ? (encoding as BufferEncoding) : "utf8"
						);
			const room = BODY_LIMIT - length;
			if (buf.length > room) {
				truncated = true;
			}
			chunks.push(buf.subarray(0, room));
			length += Math.min(buf.length, room);
		};
		const write = res.write;
		const end = res.end;
		res.write = function (this: any, chunk: any, ...args: any[]) {
			collect(chunk, args[0]);
			return (write as any).call(this, chunk, ...args);
		} as any;
		res.end = function (this: any, chunk: any, ...args: any[]) {
			collect(chunk, args[0]);
			return (end as any).call(this, chunk, ...args);
		} as any;
		let done = false;
		const finish = () => {
			if (done) {
				return;
			}
			done = true;
			const info = describe();
			const headers = res.getHeaders();
			const raw = Buffer.concat(chunks);
			const decoded = truncated
				? null
				: decodeBody(raw, headers["content-encoding"] as string | undefined);
			const part = decoded
				? encodeBody(decoded, headers["content-type"] as string | undefined, truncated)
				: raw.length
					? { body: raw.toString("base64"), bodyEncoding: "base64" as const }
					: { body: null, bodyEncoding: "none" as const };
			const reqBody = requestBodyOf(req.body);
			push({
				id: String(++seq),
				time: start,
				method: String(req.method || "GET").toUpperCase(),
				url: (req as any).originalUrl || req.url || "/",
				kind: info.kind || "miss",
				routeId: info.routeId || null,
				routeKey: info.routeKey || null,
				scene: info.scene || null,
				sceneLevel: info.sceneLevel || null,
				sceneFallback: !!info.sceneFallback,
				status: res.headersSent ? res.statusCode : 0,
				durationMs: Date.now() - start,
				request: { headers: redact(req.headers), ...reqBody },
				response: { headers: redact(headers), ...part, truncated },
			});
		};
		res.on("finish", finish);
		res.on("close", finish);
	};

	return {
		capture,
		summaryOf,
		list: (query: { after?: string; limit?: number; kind?: string; q?: string } = {}) => {
			const after = Number(query.after) || 0;
			const limit = Math.min(Math.max(Number(query.limit) || 200, 1), size);
			const q = String(query.q || "").toLowerCase();
			const kinds = query.kind ? String(query.kind).split(",") : null;
			const list = entries.filter(
				e =>
					Number(e.id) > after &&
					(!kinds || kinds.includes(e.kind)) &&
					(!q || `${e.method} ${e.url} ${e.routeKey || ""}`.toLowerCase().includes(q))
			);
			return list.slice(-limit).map(summaryOf);
		},
		get: (id: string) => entries.find(e => e.id === id) || null,
		clear: () => {
			entries = [];
			total = 0;
		},
		/** 当前日志请求体与响应体合计的大致字节数 */
		get bytes() {
			return total;
		},
	};
};
