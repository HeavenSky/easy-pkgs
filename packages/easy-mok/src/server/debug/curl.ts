// cURL 命令与请求定义的互转: 按 POSIX shell 规则拆词, 识别常用参数, 导出时一律单引号转义
import { defaultDefinition } from "./store";
import type { ResolvedRequest } from "./vars";

/** POSIX shell 词法: 单引号, 双引号, $'...' 与反斜杠续行; 不做变量展开 */
export const shellWords = (input: string) => {
	const words: string[] = [];
	let cur = "";
	let has = false;
	let i = 0;
	const s = input.replace(/\\\r?\n/g, " ");
	const ansi: Record<string, string> = { n: "\n", t: "\t", r: "\r", "\\": "\\", "'": "'", '"': '"', "0": "\0" };
	while (i < s.length) {
		const c = s[i];
		if (/\s/.test(c)) {
			if (has) words.push(cur);
			cur = "";
			has = false;
			i++;
		} else if (c === "'") {
			const end = s.indexOf("'", i + 1);
			if (end < 0) throw new Error("单引号未闭合");
			cur += s.slice(i + 1, end);
			has = true;
			i = end + 1;
		} else if (c === "$" && s[i + 1] === "'") {
			i += 2;
			while (i < s.length && s[i] !== "'") {
				if (s[i] === "\\" && i + 1 < s.length) {
					const n = s[i + 1];
					if (n === "x" && /^[0-9a-fA-F]{2}$/.test(s.slice(i + 2, i + 4))) {
						cur += String.fromCharCode(parseInt(s.slice(i + 2, i + 4), 16));
						i += 4;
					} else if (n === "u" && /^[0-9a-fA-F]{4}$/.test(s.slice(i + 2, i + 6))) {
						cur += String.fromCharCode(parseInt(s.slice(i + 2, i + 6), 16));
						i += 6;
					} else {
						cur += ansi[n] ?? n;
						i += 2;
					}
				} else cur += s[i++];
			}
			if (s[i] !== "'") throw new Error("$'...' 未闭合");
			has = true;
			i++;
		} else if (c === '"') {
			i++;
			while (i < s.length && s[i] !== '"') {
				if (s[i] === "\\" && /["\\$`]/.test(s[i + 1] || "")) {
					cur += s[i + 1];
					i += 2;
				} else cur += s[i++];
			}
			if (s[i] !== '"') throw new Error("双引号未闭合");
			has = true;
			i++;
		} else if (c === "\\" && i + 1 < s.length) {
			cur += s[i + 1];
			has = true;
			i += 2;
		} else {
			cur += c;
			has = true;
			i++;
		}
	}
	if (has) words.push(cur);
	return words;
};

const VALUE_FLAGS: Record<string, string> = {
	"-X": "request",
	"--request": "request",
	"-H": "header",
	"--header": "header",
	"-d": "data",
	"--data": "data",
	"--data-ascii": "data",
	"--data-raw": "data-raw",
	"--data-binary": "data-binary",
	"--data-urlencode": "data-urlencode",
	"-F": "form",
	"--form": "form",
	"-u": "user",
	"--user": "user",
	"-b": "cookie",
	"--cookie": "cookie",
	"--url": "url",
	"-A": "agent",
	"--user-agent": "agent",
	"-e": "referer",
	"--referer": "referer",
};
const BOOL_FLAGS: Record<string, string> = {
	"--compressed": "compressed",
	"-k": "insecure",
	"--insecure": "insecure",
	"-L": "location",
	"--location": "location",
	"-G": "get",
	"--get": "get",
};
/** 不影响请求内容的参数, 静默忽略 */
const IGNORED = new Set(["-s", "--silent", "-S", "--show-error", "-v", "--verbose", "-i", "--include", "--globoff", "-g"]);

/** 解析 cURL 命令为请求定义; 无法识别的参数进 warnings */
export const parseCurl = (text: string) => {
	const words = shellWords(text.trim());
	if (words[0] === "curl") words.shift();
	const warnings: string[] = [];
	const def = defaultDefinition();
	const headers: Array<[string, string, boolean]> = [];
	const data: string[] = [];
	const urlencoded: string[] = [];
	const form: Array<{ name: string; value?: string; file?: string; enabled: boolean }> = [];
	let method: string | null = null;
	let url = "";
	let get = false;
	let binary = false;
	for (let i = 0; i < words.length; i++) {
		let w = words[i];
		let inline: string | null = null;
		const eq = w.startsWith("--") ? w.indexOf("=") : -1;
		if (eq > 0 && VALUE_FLAGS[w.slice(0, eq)]) {
			inline = w.slice(eq + 1);
			w = w.slice(0, eq);
		}
		// -XPOST, -H'a: b' 这类短参数直接带值
		if (!VALUE_FLAGS[w] && /^-[XHdFubAe]./.test(w)) {
			inline = w.slice(2);
			w = w.slice(0, 2);
		}
		const kind = VALUE_FLAGS[w];
		if (kind) {
			const value = inline ?? words[++i];
			if (value === undefined) {
				warnings.push(`${w} 缺少取值`);
				continue;
			}
			if (kind === "request") method = value.toUpperCase();
			else if (kind === "header") {
				const c = value.indexOf(":");
				if (c > 0) headers.push([value.slice(0, c).trim().toLowerCase(), value.slice(c + 1).trim(), true]);
				else warnings.push(`无法识别的请求头: ${value}`);
			} else if (kind === "data" || kind === "data-raw") data.push(value);
			else if (kind === "data-binary") {
				if (value.startsWith("@")) {
					warnings.push(`--data-binary 引用了本地文件 ${value.slice(1)}, 已改为 binary 请求体, 请确认路径相对 mock 目录`);
					def.body = { type: "binary", file: value.slice(1) };
					binary = true;
				} else data.push(value);
			} else if (kind === "data-urlencode") urlencoded.push(value);
			else if (kind === "form") {
				const e = value.indexOf("=");
				const name = value.slice(0, e);
				const v = value.slice(e + 1);
				if (v.startsWith("@")) form.push({ name, file: v.slice(1).split(";")[0], enabled: true });
				else form.push({ name, value: v, enabled: true });
			} else if (kind === "user") {
				const c = value.indexOf(":");
				def.auth = { type: "basic", username: c < 0 ? value : value.slice(0, c), password: c < 0 ? "" : value.slice(c + 1) };
			} else if (kind === "cookie") headers.push(["cookie", value, true]);
			else if (kind === "url") url = value;
			else if (kind === "agent") headers.push(["user-agent", value, true]);
			else if (kind === "referer") headers.push(["referer", value, true]);
			continue;
		}
		const flag = BOOL_FLAGS[w];
		if (flag === "insecure") def.settings.insecureTLS = true;
		else if (flag === "location") def.settings.followRedirects = true;
		else if (flag === "get") get = true;
		else if (flag === "compressed") headers.some(h => h[0] === "accept-encoding") || headers.push(["accept-encoding", "gzip, deflate, br", true]);
		else if (IGNORED.has(w)) continue;
		else if (w.startsWith("-")) warnings.push(`未识别的参数, 已忽略: ${w}`);
		else if (!url) url = w;
		else warnings.push(`多余的参数, 已忽略: ${w}`);
	}
	if (!url) throw new Error("命令中没有 URL");
	let parsed: URL;
	try {
		parsed = new URL(/^https?:\/\//i.test(url) ? url : `http://${url}`);
	} catch {
		throw new Error(`URL 无效: ${url}`);
	}
	const bodyText = [...data, ...urlencoded.map(v => {
		const e = v.indexOf("=");
		return e < 0 ? encodeURIComponent(v) : `${v.slice(0, e)}=${encodeURIComponent(v.slice(e + 1))}`;
	})].join("&");
	if (get && bodyText) {
		new URLSearchParams(bodyText).forEach((v, k) => parsed.searchParams.append(k, v));
	}
	def.params.query = [...parsed.searchParams.entries()].map(([k, v]) => [k, v, true]);
	parsed.search = "";
	def.url = parsed.toString();
	const ctype = headers.find(h => h[0] === "content-type")?.[1] || "";
	if (form.length) def.body = { type: "multipart", parts: form };
	else if (bodyText && !get && !binary) {
		if (/json/i.test(ctype)) {
			try {
				def.body = { type: "json", content: JSON.parse(bodyText) };
			} catch {
				def.body = { type: "text", content: bodyText };
			}
		} else if (!ctype || /x-www-form-urlencoded/i.test(ctype)) {
			def.body = { type: "form", fields: [...new URLSearchParams(bodyText).entries()].map(([k, v]) => [k, v, true]) };
		} else def.body = { type: "text", content: bodyText };
	}
	// 生成的 content-type 与请求体一致时去掉手写的, 交给发送时补
	if (["form", "multipart", "json"].includes(def.body.type)) {
		const i = headers.findIndex(h => h[0] === "content-type");
		if (i >= 0 && def.body.type !== "json") headers.splice(i, 1);
	}
	def.headers = headers;
	def.method = method || (def.body.type !== "none" ? "POST" : "GET");
	return { definition: def, warnings };
};

const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** 由请求定义(模板)或解析后的请求生成 cURL 命令 */
export const toCurl = (input: { method: string; url: string; headers: Array<[string, string]>; body: Record<string, any>; user?: string }) => {
	const parts = ["curl"];
	if (input.method !== "GET") parts.push("-X", input.method);
	parts.push(q(input.url));
	if (input.user !== undefined) parts.push("-u", q(input.user));
	input.headers.forEach(([k, v]) => parts.push("-H", q(`${k}: ${v}`)));
	const body = input.body || { type: "none" };
	if (body.type === "json") parts.push("--data-raw", q(JSON.stringify(body.content ?? null)));
	if (body.type === "text") parts.push("--data-raw", q(String(body.content ?? "")));
	if (body.type === "form") {
		(body.fields || []).filter((r: [string, string, boolean]) => r[2] !== false).forEach((r: [string, string]) => parts.push("--data-urlencode", q(`${r[0]}=${r[1]}`)));
	}
	if (body.type === "multipart") {
		(body.parts || []).filter((p: { enabled?: boolean }) => p.enabled !== false).forEach((p: { name: string; value?: string; file?: string }) =>
			parts.push("-F", q(p.file !== undefined ? `${p.name}=@${p.file}` : `${p.name}=${p.value ?? ""}`))
		);
	}
	if (body.type === "binary") parts.push("--data-binary", q(`@${body.file}`));
	return parts.join(" ");
};

/** 模板形式: URL 与参数保留 {{var}} */
export const curlOfTemplate = (def: Record<string, any>) => {
	let url = String(def.url || "");
	const query = (def.params?.query || []).filter((r: [string, string, boolean]) => r[2] !== false);
	if (query.length) url += (url.includes("?") ? "&" : "?") + query.map((r: [string, string]) => `${r[0]}=${r[1]}`).join("&");
	const headers = (def.headers || []).filter((r: [string, string, boolean]) => r[2] !== false).map((r: [string, string]) => [r[0], r[1]] as [string, string]);
	const auth = def.auth || {};
	let user: string | undefined;
	if (!headers.some(([k]: [string, string]) => k === "authorization")) {
		if (auth.type === "bearer") headers.push(["authorization", `Bearer ${auth.token || ""}`]);
		if (auth.type === "basic") user = `${auth.username || ""}:${auth.password || ""}`;
	}
	return toCurl({ method: def.method || "GET", url, headers, body: def.body, user });
};

export const curlOfResolved = (r: ResolvedRequest) => toCurl({ method: r.method, url: r.url, headers: r.headers, body: r.body });
