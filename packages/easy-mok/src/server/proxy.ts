// 代理场景: 把用户配置归一化为 http-proxy-middleware 3 的写法后创建中间件
import { createProxyMiddleware } from "http-proxy-middleware";

const LEGACY = [
	["onProxyReq", "proxyReq"],
	["onProxyRes", "proxyRes"],
	["onError", "error"],
	["onProxyReqWs", "proxyReqWs"],
	["onOpen", "open"],
	["onClose", "close"],
] as const;

/** hpm 3 只认 on.*, 旧写法 onProxyReq 等会被静默忽略, 这里转换; 同名时 on.* 优先. */
export const normalizeProxyOptions = (opt: Record<string, any>) => {
	const out = { ...opt };
	const on: Record<string, Function> = { ...opt.on };
	LEGACY.forEach(([legacy, name]) => {
		if (typeof out[legacy] === "function" && !on[name]) {
			on[name] = out[legacy];
		}
		delete out[legacy];
	});
	if (Object.keys(on).length) {
		out.on = on;
	}
	if ("logLevel" in out) {
		delete out.logLevel;
	} // hpm 3 改用 logger
	// ws 不交给 hpm 自行订阅 server 的 upgrade(每个实例各挂一个, 热更新后解绑不了, 多个实例还会重复处理), 由 respond.ts 统一分发
	out.ws = false;
	return out;
};

export const createProxy = (opt: Record<string, any>) =>
	createProxyMiddleware(normalizeProxyOptions(opt));
