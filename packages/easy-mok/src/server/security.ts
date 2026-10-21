// 管理接口的访问控制: 来源地址, Host(防 DNS rebinding), 写操作的自定义头与同源校验
import net from "net";
import type { IncomingMessage } from "http";
import { MockError } from "./util";

/** 去掉 IPv6 zone 与 IPv4 映射前缀; URL 把 [::ffff:127.0.0.1] 规范成 [::ffff:7f00:1], 十六进制形式也还原成点分 IPv4 */
const normalizeIp = (ip: string) => {
	const v = String(ip || "").replace(/%.*$/, "");
	const hex = /^::ffff:([\da-f]{1,4}):([\da-f]{1,4})$/i.exec(v);
	if (hex) {
		const [hi, lo] = [parseInt(hex[1], 16), parseInt(hex[2], 16)];
		return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
	}
	return v.replace(/^::ffff:/i, "");
};

export const isLoopback = (ip: string) => {
	const v = normalizeIp(ip);
	return v === "::1" || v.startsWith("127.");
};

export const isPrivate = (ip: string) => {
	const v = normalizeIp(ip);
	if (net.isIPv4(v)) {
		const [a, b] = v.split(".").map(Number);
		return (
			a === 10 ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168) ||
			(a === 169 && b === 254)
		);
	}
	return /^f[cd]/i.test(v) || /^fe80:/i.test(v);
};

/** Host 头取主机名: 小写, 去端口与 IPv6 方括号, 去掉末尾的根域点(localhost. 与 localhost 等价) */
export const hostnameOf = (host: string | undefined) => {
	const h = String(host || "")
		.trim()
		.toLowerCase();
	if (h.startsWith("[")) {
		return h.slice(1, h.indexOf("]"));
	}
	const i = h.lastIndexOf(":");
	return (i > -1 && h.indexOf(":") === i ? h.slice(0, i) : h).replace(/\.$/, "");
};

/** 主机名是否在受信任列表中; 列表项以 . 开头时同时匹配该域名与其子域名(同 vite allowedHosts) */
export const hostListed = (hostname: string, hosts: Set<string>) =>
	hosts.has(hostname) ||
	[...hosts].some(x => x.startsWith(".") && (hostname === x.slice(1) || hostname.endsWith(x)));

/** 本机名, IP 或受信任列表中的主机; 用于防 DNS rebinding: 攻击者域名解析到本机时 Host 仍是攻击者域名 */
export const isTrustedHost = (hostname: string, hosts: Set<string>) =>
	hostname === "localhost" ||
	hostname.endsWith(".localhost") ||
	net.isIP(hostname) > 0 ||
	hostListed(hostname, hosts);

/**
 * mock 响应的跨域放行: 本机, 与请求同 Host, 与请求同一 IP 的其他端口, hosts 中的主机名, lan 开启时再加私有网段 IP;
 * 其余来源不回显, 防止任意网页(含同局域网其他机器上的页面)带凭证读取
 */
export const isTrustedOrigin = (
	origin: string,
	host: string | undefined,
	hosts: Set<string>,
	lan = false
) => {
	let url: URL;
	try {
		url = new URL(origin);
	} catch {
		return false;
	}
	const h = url.hostname
		.replace(/^\[|\]$/g, "")
		.toLowerCase()
		.replace(/\.$/, "");
	// isLoopback 只认前缀, 必须先确认是 IP, 否则 127.0.0.1.nip.io 这类攻击者域名会被当成本机
	const ip = net.isIP(h) > 0;
	return (
		h === "localhost" ||
		h.endsWith(".localhost") ||
		(ip && (isLoopback(h) || (lan && isPrivate(h)))) ||
		url.host === String(host || "").toLowerCase() ||
		(ip && h === hostnameOf(host)) ||
		hostListed(h, hosts)
	);
};

export const createGuard = (opt: { lan: boolean; hosts: string[] }) => {
	const hosts = new Set(opt.hosts.map(h => h.toLowerCase()));
	return (req: IncomingMessage) => {
		const ip = req.socket.remoteAddress || "";
		if (!isLoopback(ip) && !(opt.lan && isPrivate(ip))) {
			throw new MockError(
				"FORBIDDEN",
				403,
				"管理页默认只允许本机访问, 局域网访问需设置环境变量 MOCK_LAN=1"
			);
		}
		const hostname = hostnameOf(req.headers.host);
		if (!isTrustedHost(hostname, hosts)) {
			throw new MockError(
				"FORBIDDEN",
				403,
				`不受信任的 Host: ${hostname}, 可通过环境变量 MOCK_HOSTS 放行`
			);
		}
		const method = String(req.method || "GET").toUpperCase();
		if (method === "GET" || method === "HEAD") {
			return;
		}
		if (req.headers["x-mock-ui"] !== "1") {
			throw new MockError("FORBIDDEN", 403, "写操作缺少请求头 x-mock-ui: 1");
		}
		const origin = req.headers.origin;
		if (origin) {
			let same = false;
			try {
				same = new URL(origin).host === String(req.headers.host || "").toLowerCase();
			} catch {
				same = false;
			}
			if (!same) {
				throw new MockError("FORBIDDEN", 403, "跨源写操作被拒绝");
			}
		}
		const length = Number(req.headers["content-length"] || 0);
		const type = String(req.headers["content-type"] || "");
		if (
			(length > 0 || req.headers["transfer-encoding"]) &&
			!/^application\/json\s*(;|$)/i.test(type)
		) {
			throw new MockError("BAD_REQUEST", 400, "请求体必须是 application/json");
		}
	};
};
