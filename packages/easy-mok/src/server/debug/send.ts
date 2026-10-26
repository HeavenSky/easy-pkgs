// 调试请求的服务端发送: 构建请求体, 经 node:http/https 发出(可走 HTTP 代理), 手动跟随重定向, 边解压边写盘
import crypto from "crypto";
import fs from "fs";
import http from "http";
import https from "https";
import path from "path";
import tls from "tls";
import zlib from "zlib";
import type { Transform } from "stream";
import { MockError } from "../util";
import { baseType, extOfFile, extOfType, isTextExt, typeOfExt } from "../mime";
import type { ResolvedRequest } from "./vars";

export const BODY_LIMIT = 50 * 1024 * 1024;
const REQ_INLINE_LIMIT = 64 * 1024;
const MAX_REDIRECTS = 10;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

export type SentRequest = {
	method: string;
	url: string;
	headers: Array<[string, string]>;
	body:
		| { type: "none" }
		| { type: "text"; text: string }
		| { type: "binary"; file: string; size: number; sha256: string };
};
export type ReceivedResponse = {
	status: number;
	statusText: string;
	httpVersion: string;
	headers: Array<[string, string]>;
	body: {
		file: string | null;
		contentType: string | null;
		charset: string | null;
		size: number;
		sha256: string;
		originalEncoding: string | null;
		decoded: boolean;
		truncated: boolean;
	};
	redirects: Array<{ status: number; location: string }>;
};
export type SendResult = {
	request: SentRequest;
	response: ReceivedResponse | null;
	error: { code: string; message: string } | null;
	timing: { durationMs: number; ttfbMs: number | null };
};

/** 发送失败的原因; code 写入历史, 不抛给调用方 */
class SendError extends Error {
	code: string;
	constructor(code: string, message: string) {
		super(message);
		this.code = code;
	}
}

const sha256 = (data: Buffer | string) => crypto.createHash("sha256").update(data).digest("hex");
const has = (headers: Array<[string, string]>, name: string) => headers.some(([k]) => k === name);

/** 相对 mock 目录的文件; 越界或不存在时抛 400 */
const readLocalFile = (folder: string, rel: unknown) => {
	if (typeof rel !== "string" || !rel.trim())
		throw new MockError("BAD_REQUEST", 400, "请填写文件路径", { field: "body" });
	const file = path.resolve(folder, rel);
	if (!file.startsWith(folder + path.sep))
		throw new MockError("BAD_REQUEST", 400, `文件必须位于 mock 目录内: ${rel}`, {
			field: "body",
		});
	try {
		return { file, data: fs.readFileSync(file) };
	} catch {
		throw new MockError("BAD_REQUEST", 400, `文件不存在: ${rel}`, { field: "body" });
	}
};

/** 按请求体类型生成字节与默认 content-type */
export const buildBody = (
	body: Record<string, any>,
	folder: string
): { data: Buffer | null; type: string | null } => {
	switch (body.type) {
		case "json":
			return {
				data: Buffer.from(JSON.stringify(body.content ?? null)),
				type: "application/json",
			};
		case "text":
			return {
				data: Buffer.from(String(body.content ?? "")),
				type: "text/plain; charset=utf-8",
			};
		case "form": {
			const params = new URLSearchParams();
			(body.fields || []).forEach(
				(r: [string, string, boolean]) =>
					r[2] !== false && r[0] && params.append(r[0], r[1])
			);
			return {
				data: Buffer.from(params.toString()),
				type: "application/x-www-form-urlencoded",
			};
		}
		case "multipart": {
			const boundary = `----easymok${crypto.randomBytes(12).toString("hex")}`;
			const chunks: Buffer[] = [];
			const quote = (s: string) => s.replace(/"/g, "%22").replace(/\r|\n/g, " ");
			(body.parts || []).forEach(
				(p: { name: string; value?: string; file?: string; enabled?: boolean }) => {
					if (p.enabled === false || !p.name) return;
					if (p.file !== undefined) {
						const { file, data } = readLocalFile(folder, p.file);
						chunks.push(
							Buffer.from(
								`--${boundary}\r\ncontent-disposition: form-data; name="${quote(p.name)}"; filename="${quote(path.basename(file))}"\r\ncontent-type: ${typeOfExt(extOfFile(file))}\r\n\r\n`
							),
							data,
							Buffer.from("\r\n")
						);
					} else {
						chunks.push(
							Buffer.from(
								`--${boundary}\r\ncontent-disposition: form-data; name="${quote(p.name)}"\r\n\r\n${p.value ?? ""}\r\n`
							)
						);
					}
				}
			);
			chunks.push(Buffer.from(`--${boundary}--\r\n`));
			return {
				data: Buffer.concat(chunks),
				type: `multipart/form-data; boundary=${boundary}`,
			};
		}
		case "binary": {
			const { file, data } = readLocalFile(folder, body.file);
			return { data, type: typeOfExt(extOfFile(file)) };
		}
		default:
			return { data: null, type: null };
	}
};

/** [名, 值] 列表转 node:http 的头对象, 同名头合并为数组以保留重复项 */
const headerObject = (headers: Array<[string, string]>) => {
	const out: Record<string, string | string[]> = {};
	headers.forEach(([k, v]) => {
		const cur = out[k];
		out[k] = cur === undefined ? v : Array.isArray(cur) ? [...cur, v] : [cur, v];
	});
	return out;
};

type Hop = { res: http.IncomingMessage; ttfbMs: number };

/** 发出单跳请求; 代理为 http://[user:pass@]host:port, https 目标经 CONNECT 隧道 */
const requestOnce = (
	target: URL,
	method: string,
	headers: Array<[string, string]>,
	body: Buffer | null,
	settings: { insecureTLS: boolean; proxy: string | null },
	started: number,
	signal: AbortSignal
) =>
	new Promise<Hop>((resolve, reject) => {
		const secure = target.protocol === "https:";
		const port = Number(target.port) || (secure ? 443 : 80);
		const hostHeader = target.host;
		const headerList: Array<[string, string]> = has(headers, "host")
			? headers
			: [["host", hostHeader], ...headers];
		const proxy = settings.proxy ? new URL(settings.proxy) : null;
		const proxyAuth =
			proxy && proxy.username
				? `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString("base64")}`
				: null;
		let req: http.ClientRequest | null = null;
		const fail = (err: Error) => reject(err);
		const onAbort = () => {
			if (req) req.destroy(new SendError("ABORTED", "请求已取消"));
			reject(new SendError("ABORTED", "请求已取消"));
		};
		if (signal.aborted) return onAbort();
		signal.addEventListener("abort", onAbort, { once: true });
		const done = () => signal.removeEventListener("abort", onAbort);
		const start = (options: http.RequestOptions, mod: typeof http | typeof https) => {
			req = mod.request(options, res => {
				done();
				resolve({ res, ttfbMs: Date.now() - started });
			});
			req.on("error", err => {
				done();
				fail(err);
			});
			if (body) req.end(body);
			else req.end();
		};
		const base = { method, headers: headerObject(headerList) };
		if (!proxy) {
			start(
				{
					...base,
					host: target.hostname.replace(/^\[|\]$/g, ""),
					port,
					path: target.pathname + target.search,
					servername: target.hostname,
					rejectUnauthorized: !settings.insecureTLS,
				} as https.RequestOptions,
				secure ? https : http
			);
			return;
		}
		const proxyHost = proxy.hostname.replace(/^\[|\]$/g, "");
		const proxyPort = Number(proxy.port) || 80;
		if (!secure) {
			start(
				{
					...base,
					host: proxyHost,
					port: proxyPort,
					path: target.toString(),
					headers: headerObject(
						proxyAuth ? [...headerList, ["proxy-authorization", proxyAuth]] : headerList
					),
				},
				http
			);
			return;
		}
		const connect = http.request({
			host: proxyHost,
			port: proxyPort,
			method: "CONNECT",
			path: `${target.hostname}:${port}`,
			headers: {
				host: `${target.hostname}:${port}`,
				...(proxyAuth ? { "proxy-authorization": proxyAuth } : {}),
			},
		});
		req = connect;
		connect.once("connect", (res, socket) => {
			if (res.statusCode !== 200) {
				socket.destroy();
				done();
				return fail(new SendError("PROXY_FAILED", `代理拒绝建立隧道: ${res.statusCode}`));
			}
			start(
				{
					...base,
					path: target.pathname + target.search,
					agent: false,
					createConnection: () =>
						tls.connect({
							socket,
							servername: target.hostname,
							rejectUnauthorized: !settings.insecureTLS,
						}),
				} as https.RequestOptions,
				https
			);
		});
		connect.on("error", err => {
			done();
			fail(err);
		});
		connect.end();
	});

const decoderOf = (encoding: string): Transform | null => {
	if (encoding === "gzip" || encoding === "x-gzip") return zlib.createGunzip();
	if (encoding === "deflate") return zlib.createInflate();
	if (encoding === "br") return zlib.createBrotliDecompress();
	if (encoding === "zstd" && typeof (zlib as any).createZstdDecompress === "function") {
		return (zlib as any).createZstdDecompress() as Transform;
	}
	return null;
};

/** 把响应体写进 dir/raw.<ext>; 解压失败时改存原始字节, 超过上限时截断 */
const saveBody = (res: http.IncomingMessage, dir: string, signal: AbortSignal) =>
	new Promise<ReceivedResponse["body"]>((resolve, reject) => {
		const contentType =
			typeof res.headers["content-type"] === "string" ? res.headers["content-type"] : null;
		const charset = contentType
			? (/charset=([^;]+)/i.exec(contentType)?.[1] || "").trim().replace(/^"|"$/g, "") || null
			: null;
		const encoding = String(res.headers["content-encoding"] || "")
			.trim()
			.toLowerCase();
		const file = path.join(dir, `raw.${extOfType(contentType)}`);
		const rawTmp = path.join(dir, "raw.encoded.tmp");
		const decoder = encoding && encoding !== "identity" ? decoderOf(encoding) : null;
		const out = fs.createWriteStream(file);
		const rawOut = decoder ? fs.createWriteStream(rawTmp) : null;
		const hash = crypto.createHash("sha256");
		let size = 0;
		let truncated = false;
		let decoded = !(encoding && encoding !== "identity") || !!decoder;
		let settled = false;
		let ended = false;
		const finish = () => {
			if (settled) return;
			settled = true;
			const close = (s: fs.WriteStream | null) =>
				new Promise<void>(r => (s ? s.end(r) : r()));
			Promise.all([close(out), close(rawOut)]).then(() => {
				if (!decoded && rawOut) {
					fs.renameSync(rawTmp, file);
					const data = fs.readFileSync(file);
					size = data.length;
					hash.update(data);
				} else if (rawOut) {
					fs.rmSync(rawTmp, { force: true });
				}
				if (size === 0 && !truncated) fs.rmSync(file, { force: true });
				resolve({
					file: size === 0 && !truncated ? null : path.basename(file),
					contentType: contentType ? baseType(contentType) : null,
					charset,
					size,
					sha256: decoded
						? hash.digest("hex")
						: sha256(fs.existsSync(file) ? fs.readFileSync(file) : ""),
					originalEncoding: encoding && encoding !== "identity" ? encoding : null,
					decoded,
					truncated,
				});
			}, reject);
		};
		const write = (chunk: Buffer) => {
			if (truncated) return;
			const room = BODY_LIMIT - size;
			const part = chunk.length > room ? chunk.subarray(0, room) : chunk;
			size += part.length;
			hash.update(part);
			out.write(part);
			if (chunk.length > room) {
				truncated = true;
				res.destroy();
				finish();
			}
		};
		if (decoder) {
			decoder.on("data", write);
			decoder.on("end", finish);
			decoder.on("error", () => {
				decoded = false;
				if (ended) finish();
				else res.resume();
			});
		}
		let rawSize = 0;
		res.on("data", (chunk: Buffer) => {
			if (rawOut) {
				rawSize += chunk.length;
				if (rawSize <= BODY_LIMIT) rawOut.write(chunk);
				if (decoded && decoder) decoder.write(chunk);
			} else write(chunk);
		});
		res.on("end", () => {
			ended = true;
			if (decoder && decoded) decoder.end();
			else finish();
		});
		res.on("aborted", () => !truncated && reject(new SendError("ABORTED", "响应被中断")));
		res.on("error", err => !truncated && !settled && reject(err));
		signal.addEventListener(
			"abort",
			() => res.destroy(new SendError("ABORTED", "请求已取消")),
			{ once: true }
		);
		if (!decoder && encoding && encoding !== "identity") decoded = false;
	});

const codeOf = (err: any) =>
	err instanceof SendError
		? err.code
		: err && typeof err.code === "string"
			? err.code
			: "SEND_FAILED";

/**
 * 发送解析后的请求, 响应写入 dir. 失败(连接, 超时, 取消, 代理)时返回带 error 的结果, 不抛错;
 * 请求体构建失败(文件不存在等)直接抛 MockError, 由接口返回 400.
 */
export const performSend = async (opts: {
	resolved: ResolvedRequest;
	settings: {
		timeoutMs: number;
		followRedirects: boolean;
		insecureTLS: boolean;
		proxy: string | null;
	};
	folder: string;
	dir: string;
	signal: AbortSignal;
	/** 每一跳发送前取附加的 cookie 头, 收到响应后交回 set-cookie; Cookie jar 由调用方提供 */
	cookies?: {
		header: (url: URL) => string | null;
		store: (url: URL, setCookies: string[]) => void;
	};
}): Promise<SendResult> => {
	const { resolved, settings, dir } = opts;
	const built = buildBody(resolved.body, opts.folder);
	let headers = resolved.headers.filter(
		([k]) => k !== "content-length" && k !== "transfer-encoding"
	);
	if (built.data && !has(headers, "content-type"))
		headers.push(["content-type", built.type as string]);
	if (!has(headers, "accept-encoding")) headers.push(["accept-encoding", "gzip, deflate, br"]);
	let body = built.data;
	let method = resolved.method;
	let target = new URL(resolved.url);
	const started = Date.now();
	const controller = new AbortController();
	const abort = () => controller.abort();
	opts.signal.addEventListener("abort", abort, { once: true });
	const timer = setTimeout(
		() => controller.abort(new SendError("TIMEOUT", `请求超时(${settings.timeoutMs}ms)`)),
		settings.timeoutMs
	);
	const withCookies = (url: URL) => {
		const jar = opts.cookies?.header(url);
		if (!jar) return headers;
		const manual = headers.find(([k]) => k === "cookie");
		if (!manual) return [...headers, ["cookie", jar]] as Array<[string, string]>;
		// 手写的同名 cookie 优先
		const names = new Set(manual[1].split(";").map(p => p.split("=")[0].trim()));
		const extra = jar.split("; ").filter(p => !names.has(p.split("=")[0].trim()));
		return headers.map(h =>
			h === manual && extra.length ? ["cookie", `${manual[1]}; ${extra.join("; ")}`] : h
		) as Array<[string, string]>;
	};
	const sentHeaders = () => {
		const list = withCookies(target);
		const out: Array<[string, string]> = has(list, "host")
			? [...list]
			: [["host", target.host], ...list];
		if (body) out.push(["content-length", String(body.length)]);
		return out;
	};
	let firstHeaders = sentHeaders();
	const request: SentRequest = {
		method,
		url: target.toString(),
		headers: firstHeaders,
		body: { type: "none" },
	};
	if (body) {
		const text =
			/^(text\/|application\/(json|x-www-form-urlencoded|xml|javascript))|\+json|\+xml/.test(
				baseType(String(headers.find(([k]) => k === "content-type")?.[1] || ""))
			);
		if (text && body.length <= REQ_INLINE_LIMIT) {
			request.body = { type: "text", text: body.toString("utf8") };
		} else {
			fs.writeFileSync(path.join(dir, "req.bin"), body);
			request.body = {
				type: "binary",
				file: "req.bin",
				size: body.length,
				sha256: sha256(body),
			};
		}
	}
	const redirects: ReceivedResponse["redirects"] = [];
	try {
		for (let hop = 0; ; hop++) {
			const { res, ttfbMs } = await requestOnce(
				target,
				method,
				firstHeaders,
				body,
				settings,
				started,
				controller.signal
			).catch(err => {
				throw controller.signal.reason instanceof SendError
					? controller.signal.reason
					: err;
			});
			const setCookies = res.headers["set-cookie"];
			if (setCookies && opts.cookies) opts.cookies.store(target, setCookies);
			const location = res.headers.location;
			if (settings.followRedirects && REDIRECTS.has(res.statusCode || 0) && location) {
				if (hop >= MAX_REDIRECTS)
					throw new SendError("TOO_MANY_REDIRECTS", `重定向超过 ${MAX_REDIRECTS} 次`);
				res.resume();
				const next = new URL(location, target);
				redirects.push({ status: res.statusCode as number, location: next.toString() });
				const status = res.statusCode as number;
				if (
					status === 303 ||
					((status === 301 || status === 302) && method !== "GET" && method !== "HEAD")
				) {
					method = status === 303 && method === "HEAD" ? "HEAD" : "GET";
					body = null;
					headers = headers.filter(([k]) => k !== "content-type");
				}
				// 跨源重定向不携带认证头与手写 cookie, 与浏览器一致
				if (next.origin !== target.origin)
					headers = headers.filter(([k]) => k !== "authorization" && k !== "cookie");
				target = next;
				firstHeaders = sentHeaders();
				continue;
			}
			const raw = res.rawHeaders;
			const responseHeaders: Array<[string, string]> = [];
			for (let i = 0; i < raw.length; i += 2)
				responseHeaders.push([raw[i].toLowerCase(), raw[i + 1]]);
			const saved = await saveBody(res, dir, controller.signal).catch(err => {
				throw controller.signal.reason instanceof SendError
					? controller.signal.reason
					: err;
			});
			return {
				request,
				response: {
					status: res.statusCode || 0,
					statusText: res.statusMessage || "",
					httpVersion: res.httpVersion,
					headers: responseHeaders,
					body: saved,
					redirects,
				},
				error: null,
				timing: { durationMs: Date.now() - started, ttfbMs },
			};
		}
	} catch (err) {
		return {
			request,
			response: null,
			error: { code: codeOf(err), message: (err as Error).message || String(err) },
			timing: { durationMs: Date.now() - started, ttfbMs: null },
		};
	} finally {
		clearTimeout(timer);
		opts.signal.removeEventListener("abort", abort);
	}
};

/** 判断一个 raw 文件是否按文本处理(预览, diff) */
export const isTextFile = (file: string) => isTextExt(extOfFile(file));
