// 独立运行: 用 node:http 承载 easy-mok, 供函数调用 startMock() 与命令行 easy-mok 使用
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { createJiti } from "jiti";
import { createMock } from "./index";
import type { MockApp, MockOptions } from "./index";
import { exportedTable } from "./loader";
import { privateAddresses } from "./lan";
import { setCors } from "./respond";
import { isLoopback } from "./security";
import { isPlainObject } from "./util";

export interface StartOptions extends MockOptions {
	/** 监听端口, 默认 4100, 0 表示随机端口 */
	port?: number;
	/** 监听地址, 默认 127.0.0.1; 0.0.0.0 时局域网可访问 mock(管理页仍需 lan). 监听回环地址时, 局域网访问开关打开期间额外监听本机私有网段地址 */
	host?: string;
}

export interface StartedMock {
	server: http.Server;
	mock: MockApp;
	/** mock 服务地址, 如 http://127.0.0.1:4100 */
	url: string;
	port: number;
	/** 关闭 http 服务, 文件监听与 SSE 连接 */
	close(): Promise<void>;
}

export const DEFAULT_PORT = 4100;
export const DEFAULT_HOST = "127.0.0.1";

/** 监听 0.0.0.0 / :: 时地址里用回环地址, IPv6 加方括号 */
const urlOf = (host: string, port: number) => {
	const h =
		host === "0.0.0.0" || host === ""
			? "127.0.0.1"
			: host === "::"
				? "[::1]"
				: host.includes(":")
					? `[${host}]`
					: host;
	return `http://${h}:${port}`;
};

const listenError = (err: NodeJS.ErrnoException, host: string, port: number) => {
	if (err.code === "EADDRINUSE") {
		return new Error(
			`端口 ${port} 已被占用, 请换一个端口(命令行 --port <端口>, 函数调用 port 选项; 0 表示随机端口)`
		);
	}
	if (err.code === "EACCES") {
		return new Error(
			`没有权限监听 ${host}:${port}, 1024 以下端口通常需要管理员权限, 请换一个端口`
		);
	}
	if (err.code === "EADDRNOTAVAIL" || err.code === "ENOTFOUND") {
		return new Error(`无法监听地址 ${host}, 请检查 --host / host 选项`);
	}
	return err;
};

/**
 * 独立启动 mock 服务. 未命中返回 404 JSON; 页面与 mock 不同源时跨域规则同挂载模式:
 * 本机, 同 Host, 同 IP 其他端口, hosts 与 lan 开启时私有网段 IP 的来源才回显 access-control-allow-origin(未命中的 404 与预检同样适用).
 */
export const startMock = (options: StartOptions = {}): Promise<StartedMock> => {
	const { port: portOpt, host: hostOpt, ...mockOptions } = options;
	const port = portOpt ?? DEFAULT_PORT;
	const host = hostOpt || DEFAULT_HOST;
	if (!Number.isInteger(port) || port < 0 || port > 65535) {
		return Promise.reject(new Error(`端口必须是 0-65535 的整数: ${portOpt}`));
	}
	const mock = createMock(mockOptions);
	const trusted = new Set(mock.mock.options.hosts.map(h => h.toLowerCase()));
	const onRequest = (req: http.IncomingMessage, res: http.ServerResponse) =>
		mock(req, res, () => {
			setCors(req, res as any, trusted, mock.mock.lan.access); // 让跨域页面读得到 404 说明, 预检直接放行
			if (
				String(req.method).toUpperCase() === "OPTIONS" &&
				req.headers["access-control-request-method"]
			) {
				res.statusCode = 204;
				res.end();
				return;
			}
			res.statusCode = 404;
			res.setHeader("content-type", "application/json; charset=utf-8");
			res.end(
				JSON.stringify({
					mock: false,
					message: "未命中 mock 路由",
					method: req.method,
					url: req.url,
				})
			);
		});
	const server = http.createServer(onRequest);
	// 主监听在回环地址时, 局域网访问开关打开期间在每个私有网段地址上以同一端口额外监听; 逐个绑定具体地址, 不绑 0.0.0.0, 免得在 Linux 上与回环地址的同端口冲突
	const lan = mock.mock.lan;
	const extra = new Map<string, http.Server>();
	const loopbackHost = host === "localhost" || isLoopback(host);
	const closeExtra = () => {
		extra.forEach(s => {
			if (s.closeAllConnections) s.closeAllConnections();
			s.close();
		});
		extra.clear();
		lan.setListening({ addresses: [], errors: [] });
	};
	const syncLan = (port: number) => {
		if (!loopbackHost) {
			return;
		}
		if (!lan.access) {
			closeExtra();
			return;
		}
		const errors: string[] = [];
		Promise.all(
			privateAddresses()
				.filter(addr => !extra.has(addr))
				.map(
					addr =>
						new Promise<void>(resolve => {
							const s = http.createServer(onRequest);
							s.once("error", (err: NodeJS.ErrnoException) => {
								errors.push(`${addr}:${port} ${err.code || err.message}`);
								console.warn(
									`[easy-mok] 局域网地址监听失败: ${addr}:${port}`,
									err.code || err.message
								);
								resolve();
							});
							s.listen(port, addr, () => {
								if (lan.access) {
									extra.set(addr, s);
									console.log(`[easy-mok] 局域网可访问: ${urlOf(addr, port)}`);
								} else {
									s.close(); // 监听期间开关已被关闭
								}
								resolve();
							});
						})
				)
		).then(() => {
			if (lan.access) {
				lan.setListening({
					addresses: [...extra.keys()].map(addr => `${addr}:${port}`),
					errors,
				});
				mock.mock.events.emit("changed", { scope: "meta" });
			}
		});
	};
	let unsubscribe = () => {};
	const close = async () => {
		unsubscribe();
		closeExtra();
		await mock.close(); // 先结束 SSE 长连接, 否则 server.close 等不到连接关闭
		if (server.closeAllConnections) server.closeAllConnections();
		await new Promise<void>(resolve => server.close(() => resolve()));
	};
	return new Promise((resolve, reject) => {
		const onError = (err: NodeJS.ErrnoException) => {
			mock.close().finally(() => reject(listenError(err, host, port)));
		};
		server.once("error", onError);
		server.listen(port, host, () => {
			server.removeListener("error", onError);
			const actual = (server.address() as { port: number }).port;
			unsubscribe = lan.subscribe(() => syncLan(actual));
			syncLan(actual);
			resolve({ server, mock, url: urlOf(host, actual), port: actual, close });
		});
	});
};

/** 本机的局域网 IPv4 地址, 监听 0.0.0.0 时打印给用户 */
export const lanAddresses = () =>
	Object.values(os.networkInterfaces())
		.flat()
		.filter(i => i && i.family === "IPv4" && !i.internal)
		.map(i => (i as os.NetworkInterfaceInfo).address);

const BUILTIN_EXTS = [".ts", ".mts", ".cts", ".js", ".mjs", ".cjs", ".json"];

/** 相对 cwd 解析并经 jiti 加载内置路由文件(支持 ts / esm, 与 mock 文件一致) */
export const loadBuiltin = (file: string, cwd = process.cwd()) => {
	const abs = path.resolve(cwd, file);
	// 先确认文件存在: jiti 的报错只带出作为解析基准的 _easy-mok-cli.js, 看不出缺的是哪个文件
	const candidates = [
		abs,
		...BUILTIN_EXTS.map(ext => abs + ext),
		...BUILTIN_EXTS.map(ext => path.join(abs, `index${ext}`)),
	];
	if (
		!candidates.some(f => {
			try {
				return fs.statSync(f).isFile();
			} catch {
				return false;
			}
		})
	) {
		throw new Error(
			`内置路由文件不存在: ${abs} (请检查 --builtin / MOCK_BUILTIN, 相对路径按当前目录 ${cwd} 解析)`
		);
	}
	const value = exportedTable(
		createJiti(path.join(cwd, "_easy-mok-cli.js"), {
			interopDefault: true,
			moduleCache: false,
		})(abs)
	);
	if (!isPlainObject(value)) {
		throw new TypeError(`内置路由文件必须导出路由对象: ${abs}`);
	}
	return value;
};

export const CLI_HELP = `用法: easy-mok [选项]

独立启动 easy-mok mock 服务与管理页.

选项:
  --folder <目录>     mock 目录, 相对当前目录, 默认 src/mocks      (环境变量 MOCK_FOLDER)
  --debug-dir <目录>  调试页的存储目录(请求, 环境组, 快照, 历史),
                      相对当前目录, 默认 <mock 目录>/__debug__      (MOCK_DEBUG_DIR)
  --port <端口>       监听端口, 默认 ${DEFAULT_PORT}, 0 为随机端口       (MOCK_PORT)
  --host <地址>       监听地址, 默认 ${DEFAULT_HOST}, 0.0.0.0 允许局域网访问 (MOCK_HOST)
  --builtin <文件>    先于 mock 文件加载的内置路由, 支持 js / ts / esm (MOCK_BUILTIN)
  --no-ui             不提供管理页与管理接口 /__mock/              (MOCK_UI=0)
  --no-float          不提供页内悬浮条                           (MOCK_FLOAT=0)
  --lan               允许私有网段访问管理接口与跨域读取 mock        (MOCK_LAN=1)
  --hosts <a,b>       额外受信任的主机名, 逗号分隔                  (MOCK_HOSTS)
  --ignore <a,b>      追加请求忽略规则(不进请求日志), 逗号分隔      (MOCK_IGNORE)
  -h, --help          显示帮助
  -v, --version       显示版本

命令行参数优先于环境变量.`;

export type CliResult = {
	help?: boolean;
	version?: boolean;
	error?: string;
	options: StartOptions & { builtinFile?: string };
};

/** 解析命令行参数; 未给出的选项读环境变量, 都没有时留空交给 createMock 的默认值. 手写解析以兼容 Node 18.0(无 util.parseArgs) */
export const parseCliArgs = (argv: string[], env: NodeJS.ProcessEnv = process.env): CliResult => {
	const values: Record<string, string | boolean> = {};
	const takesValue = new Set([
		"folder",
		"debug-dir",
		"port",
		"host",
		"builtin",
		"hosts",
		"ignore",
	]);
	const flags = new Set(["no-ui", "no-float", "lan", "help", "version"]);
	const alias: Record<string, string> = { h: "help", v: "version" };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		// 忽略 --: pnpm run x -- --port 1 等会把 -- 原样传进来; easy-mok 没有位置参数, 不需要用它结束选项解析
		if (arg === "--") {
			continue;
		}
		const m = /^--?([\w-]+)(?:=(.*))?$/.exec(arg);
		if (!m) {
			return { error: `无法识别的参数: ${arg}`, options: {} };
		}
		const name = arg.startsWith("--") ? m[1] : alias[m[1]];
		if (name && takesValue.has(name)) {
			const value = m[2] ?? argv[++i];
			// 分开写时以 - 开头的下一项是另一个参数(如 --folder -v), 不当作取值; 确需以 - 开头的取值用 --folder=-v
			if (value === undefined || (m[2] === undefined && value.startsWith("-"))) {
				return {
					error: `参数 --${name} 缺少取值${value === undefined ? "" : `(${value} 是另一个参数; 取值以 - 开头时写成 --${name}=${value})`}`,
					options: {},
				};
			}
			values[name] = value;
		} else if (name && flags.has(name) && m[2] === undefined) {
			values[name] = true;
		} else {
			return { error: `未知参数: ${arg}`, options: {} };
		}
	}
	if (values.help) {
		return { help: true, options: {} };
	}
	if (values.version) {
		return { version: true, options: {} };
	}
	const pick = (name: string, envName: string) =>
		typeof values[name] === "string" ? (values[name] as string) : env[envName] || undefined;
	const options: CliResult["options"] = {};
	const folder = pick("folder", "MOCK_FOLDER");
	if (folder) {
		options.folder = folder;
	}
	const debugDir = pick("debug-dir", "MOCK_DEBUG_DIR");
	if (debugDir) {
		options.debugDir = debugDir;
	}
	const portText = pick("port", "MOCK_PORT");
	if (portText !== undefined) {
		const port = Number(portText);
		if (!/^\d+$/.test(portText) || port > 65535) {
			return { error: `端口必须是 0-65535 的整数: ${portText}`, options: {} };
		}
		options.port = port;
	}
	const host = pick("host", "MOCK_HOST");
	if (host) {
		options.host = host;
	}
	const builtin = pick("builtin", "MOCK_BUILTIN");
	if (builtin) {
		options.builtinFile = builtin;
	}
	// ui / float / lan / hosts 未给出时留空, 由 createMock 读 MOCK_UI / MOCK_FLOAT / MOCK_LAN / MOCK_HOSTS
	if (values["no-ui"]) {
		options.ui = false;
	}
	if (values["no-float"]) {
		options.float = false;
	}
	if (values.lan) {
		options.lan = true;
	}
	if (typeof values.hosts === "string") {
		options.hosts = values.hosts
			.split(",")
			.map(s => s.trim())
			.filter(Boolean);
	}
	const ignore = pick("ignore", "MOCK_IGNORE");
	if (ignore) {
		options.ignore = ignore
			.split(",")
			.map(s => s.trim())
			.filter(Boolean);
	}
	return { options };
};
