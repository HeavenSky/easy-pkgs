#!/usr/bin/env node
// 命令行入口 easy-mok: 解析参数, 独立启动 mock 服务, 收到 SIGINT / SIGTERM 时关闭后退出
import { CLI_HELP, lanAddresses, loadBuiltin, parseCliArgs, startMock } from "./standalone";

const { version } = require("../../package.json") as { version: string };

/** @returns 进程退出码; 服务启动后不返回, 由信号处理退出 */
export const main = async (argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number | null> => {
	const parsed = parseCliArgs(argv, env);
	if (parsed.error) {
		console.error(`[easy-mok] ${parsed.error}\n\n${CLI_HELP}`);
		return 1;
	}
	if (parsed.help) { console.log(CLI_HELP); return 0; }
	if (parsed.version) { console.log(version); return 0; }
	const { builtinFile, ...options } = parsed.options;
	try {
		if (builtinFile) { options.builtin = loadBuiltin(builtinFile); }
		const started = await startMock(options);
		const host = options.host || "127.0.0.1";
		const lines = [`[easy-mok] mock 服务: ${started.url}/`];
		started.mock.mock.options.ui && lines.push(`[easy-mok] 管理页:    ${started.url}/__mock/`);
		if (host === "0.0.0.0" || host === "::") {
			lanAddresses().forEach(ip => lines.push(`[easy-mok] 局域网:    http://${ip}:${started.port}/`));
			started.mock.mock.options.ui && !started.mock.mock.options.lan && lines.push("[easy-mok] 局域网访问管理页需加 --lan");
		}
		lines.push(`[easy-mok] mock 目录: ${started.mock.mock.options.folder}`);
		console.log(lines.join("\n"));
		let closing = false;
		const stop = (signal: string) => {
			if (closing) { return; }
			closing = true;
			console.log(`[easy-mok] 收到 ${signal}, 正在关闭`);
			started.close().then(() => process.exit(0), err => { console.error("[easy-mok] 关闭出错:", err); process.exit(1); });
		};
		process.once("SIGINT", () => stop("SIGINT"));
		process.once("SIGTERM", () => stop("SIGTERM"));
		return null;
	} catch (err) {
		console.error(`[easy-mok] 启动失败: ${(err as Error).message || err}`);
		return 1;
	}
};

if (require.main === module) {
	main(process.argv.slice(2)).then(code => { if (code !== null) { process.exitCode = code; } });
}
