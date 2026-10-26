// 按环境组保存的 Cookie jar(RFC 6265 子集): 解析 set-cookie, 按域名, 路径, Secure 与过期时间匹配; 不实现公共后缀表
import fs from "fs";
import { isPlainObject, writeJsonAtomic } from "../util";
import { readJson } from "./store";

export type JarCookie = {
	name: string;
	value: string;
	domain: string;
	hostOnly: boolean;
	path: string;
	/** 毫秒时间戳; 会话 cookie 为 null */
	expires: number | null;
	secure: boolean;
	httpOnly: boolean;
};

/** 请求路径的默认 cookie 路径: 最后一个 / 之前的部分 */
const defaultPath = (pathname: string) => {
	if (!pathname.startsWith("/")) return "/";
	const i = pathname.lastIndexOf("/");
	return i <= 0 ? "/" : pathname.slice(0, i);
};

const domainMatch = (host: string, c: JarCookie) =>
	c.hostOnly ? host === c.domain : host === c.domain || host.endsWith(`.${c.domain}`);

const pathMatch = (reqPath: string, cookiePath: string) =>
	reqPath === cookiePath ||
	(reqPath.startsWith(cookiePath) &&
		(cookiePath.endsWith("/") || reqPath[cookiePath.length] === "/"));

/** 解析一条 set-cookie; 无效或 Domain 不属于当前主机时为 null */
export const parseSetCookie = (
	header: string,
	url: URL,
	now = Date.now()
): JarCookie | { delete: true; name: string; domain: string; path: string } | null => {
	const [pair, ...attrs] = header.split(";");
	const eq = pair.indexOf("=");
	if (eq <= 0) return null;
	const host = url.hostname.toLowerCase();
	const cookie: JarCookie = {
		name: pair.slice(0, eq).trim(),
		value: pair.slice(eq + 1).trim(),
		domain: host,
		hostOnly: true,
		path: defaultPath(url.pathname),
		expires: null,
		secure: false,
		httpOnly: false,
	};
	let maxAge: number | null = null;
	for (const attr of attrs) {
		const i = attr.indexOf("=");
		const key = (i < 0 ? attr : attr.slice(0, i)).trim().toLowerCase();
		const val = i < 0 ? "" : attr.slice(i + 1).trim();
		if (key === "domain" && val) {
			const d = val.replace(/^\./, "").toLowerCase();
			if (host !== d && !host.endsWith(`.${d}`)) return null;
			cookie.domain = d;
			cookie.hostOnly = false;
		} else if (key === "path" && val.startsWith("/")) cookie.path = val;
		else if (key === "expires") {
			const t = Date.parse(val);
			if (!Number.isNaN(t)) cookie.expires = t;
		} else if (key === "max-age" && /^-?\d+$/.test(val)) maxAge = Number(val);
		else if (key === "secure") cookie.secure = true;
		else if (key === "httponly") cookie.httpOnly = true;
	}
	if (maxAge !== null) cookie.expires = maxAge <= 0 ? 0 : now + maxAge * 1000;
	if (cookie.expires !== null && cookie.expires <= now) {
		return { delete: true, name: cookie.name, domain: cookie.domain, path: cookie.path };
	}
	return cookie;
};

export const createCookieJar = (file: string) => {
	const read = (now = Date.now()): JarCookie[] => {
		const { value } = readJson(file);
		const list =
			isPlainObject(value) && Array.isArray(value.cookies)
				? (value.cookies as JarCookie[])
				: [];
		return list.filter(
			c => c && typeof c.name === "string" && (c.expires === null || c.expires > now)
		);
	};
	const write = (cookies: JarCookie[]) => {
		if (!cookies.length && !fs.existsSync(file)) return;
		writeJsonAtomic(file, { version: 1, cookies });
	};
	const same = (
		a: { name: string; domain: string; path: string },
		b: { name: string; domain: string; path: string }
	) => a.name === b.name && a.domain === b.domain && a.path === b.path;

	/** 该 URL 应携带的 cookie 头; 路径长的在前 */
	const header = (url: URL) => {
		const host = url.hostname.toLowerCase();
		const secure = url.protocol === "https:";
		const hits = read()
			.filter(
				c =>
					domainMatch(host, c) &&
					pathMatch(url.pathname || "/", c.path) &&
					(!c.secure || secure)
			)
			.sort((a, b) => b.path.length - a.path.length);
		return hits.length ? hits.map(c => `${c.name}=${c.value}`).join("; ") : null;
	};

	const store = (url: URL, setCookies: string[]) => {
		let cookies = read();
		setCookies.forEach(h => {
			const parsed = parseSetCookie(h, url);
			if (!parsed) return;
			cookies = cookies.filter(c => !same(c, parsed));
			if (!("delete" in parsed)) cookies.push(parsed);
		});
		write(cookies);
	};

	/** 不返回值 */
	const list = () => read().map(({ value: _value, ...rest }) => rest);

	const clear = (filter?: { name?: unknown; domain?: unknown; path?: unknown }) => {
		if (!filter || filter.name === undefined) {
			write([]);
			return;
		}
		write(
			read().filter(
				c =>
					!(
						c.name === filter.name &&
						(filter.domain === undefined || c.domain === filter.domain) &&
						(filter.path === undefined || c.path === filter.path)
					)
			)
		);
	};

	return { header, store, list, clear };
};
