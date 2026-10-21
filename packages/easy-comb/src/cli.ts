// 命令行入口: csscomb [options] [file1 [dir1 [fileN [dirN]]]]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import CSScomb from "./csscomb.ts";
import { loadConfigFile } from "./config.ts";
import type { Config } from "./config.ts";
import Errors from "./errors.ts";

interface CliOptions {
	config?: string;
	detect?: string;
	syntax?: string;
	lint?: boolean;
	help?: boolean;
	version?: boolean;
	verbose?: boolean;
	"tty-mode"?: boolean;
	_: string[];
}

// 输出写到管道时是异步的, 直接 process.exit() 会截断未写完的部分(macOS 上只剩管道缓冲区大小, 如 64KB 或 128KB),
// 所以正常路径只设置 process.exitCode, 等事件循环自然结束.
// --syntax 的取值, 只作用于标准输入; 文件仍按扩展名决定语法.
const STDIN_SYNTAXES = ["css", "scss", "less", "sass"];

const comb = new CSScomb();
const options = getOptions();
await main();

async function main(): Promise<void> {
	if (options.help) {
		displayHelp();
		return;
	}

	if (options.version) {
		process.stdout.write(getVersion() + os.EOL);
		return;
	}

	if (options.detect) {
		process.stdout.write(JSON.stringify(detectInFile(options.detect), null, 4));
		return;
	}

	const files = options._.filter(file => file !== "-");
	const readFromStdin =
		!options["tty-mode"] &&
		(options._.length === 0 ? !process.stdin.isTTY : options._.join() === "-");

	// 没有路径且 stdin 是终端时不等待输入, 提示用法
	if (!readFromStdin && files.length === 0) {
		displayHelp(process.stderr);
		process.exitCode = 1;
		return;
	}

	// 先报出不存在的路径, 不处理任何文件
	for (const file of files) {
		if (!fs.existsSync(file)) fail(`File or directory ${file} was not found.`);
	}

	const { config, configPath } = await getConfig();
	comb.configure(config);
	// 配置文件里的 exclude 相对配置文件所在目录; 内置配置仍相对 cwd.
	if (configPath) comb._excludeBase = path.dirname(fs.realpathSync(configPath));

	if (readFromStdin) {
		await processSTDIN();
	} else {
		await processFiles(files);
	}
}

function getOptions(): CliOptions {
	const known = {
		config: { type: "string", short: "c" },
		detect: { type: "string", short: "d" },
		syntax: { type: "string" },
		lint: { type: "boolean", short: "l" },
		help: { type: "boolean", short: "h" },
		version: { type: "boolean", short: "V" },
		verbose: { type: "boolean", short: "v" },
		"tty-mode": { type: "boolean", short: "t" },
	} as const;
	const { values, positionals } = parseArgs({
		args: process.argv.slice(2),
		options: known,
		allowPositionals: true,
		strict: false,
	});
	// strict 为 false 时未知选项也落在 values 上(短选项按单个字母); 报错退出, 不处理任何文件
	for (const name of Object.keys(values)) {
		if (Object.hasOwn(known, name)) continue;
		usageError(`Unknown option '${name.length === 1 ? "-" : "--"}${name}'.`);
	}
	// strict 为 false 时缺少取值的 string 选项会被解析成 true, 这里报出可读错误
	for (const [name, arg] of [
		["config", "path"],
		["detect", "file"],
		["syntax", "name"],
	]) {
		if (name in values && typeof values[name] !== "string")
			fail(`Option --${name} requires a <${arg}> argument.`);
	}
	if (typeof values.syntax === "string" && !STDIN_SYNTAXES.includes(values.syntax))
		usageError(
			`Invalid value '${values.syntax}' for option '--syntax'. Expected one of: ${STDIN_SYNTAXES.join(", ")}.`
		);
	return { ...values, _: positionals } as CliOptions;
}

// 用法错误: 打印错误与帮助后以 2 退出, 不处理任何文件.
function usageError(message: string): never {
	process.stderr.write(message + os.EOL + os.EOL);
	displayHelp(process.stderr);
	process.exit(2);
}

function displayHelp(stream: NodeJS.WritableStream = process.stdout): void {
	const help = [
		"NAME",
		"    csscomb — Lint and fix style errors in css files",
		"",
		"SYNOPSIS",
		"    csscomb [options] file.css",
		"    cat file.css | csscomb [options] -",
		"    cat file.scss | csscomb [options] --syntax scss -",
		"",
		"OPTIONS",
		"    -c, --config <path>",
		"        Path to configuration file (.json, .js, .cjs, .mjs, .ts, .cts, .mts),",
		"        or a .css file to detect the configuration from.",
		"    -d, --detect <file>",
		"        Print the options detected in the given stylesheet as JSON.",
		"    --syntax <name>",
		"        Syntax of standard input: css (default), scss, less or sass.",
		"        Files are always parsed by their extension.",
		"    -l, --lint",
		"        Run the tool in linter mode, without modifying files.",
		"    -h, --help",
		"        Display help message.",
		"    -V, --version",
		"        Print the version number.",
		"    -v, --verbose",
		"        Whether to print logging info.",
		"    -t, --tty-mode",
		"        Run the tool in TTY mode using external app (e.g. IDE).",
		"",
	];
	stream.write(help.join(os.EOL));
}

function getVersion(): string {
	// src/ 与 dist/ 都在包根目录下一级
	const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
	return pkg.version;
}

// 只用于短的错误信息: 一次写入不超过管道缓冲区, 在退出前已写完.
function fail(message: string): never {
	process.stderr.write(message + os.EOL);
	process.exit(1);
}

function detectInFile(file: string): Config {
	if (!fs.existsSync(file)) fail(`File ${file} was not found.`);
	try {
		return CSScomb.detectInFile(file);
	} catch (e) {
		fail((e as Error).message);
	}
}

async function getConfig(): Promise<{ config: Config; configPath: string | null }> {
	const configPath = options.config
		? path.resolve(process.cwd(), options.config)
		: CSScomb.getCustomConfigPath();

	let config: Config;
	if (!configPath) {
		config = CSScomb.getConfig();
	} else if (!fs.existsSync(configPath)) {
		fail(`Configuration file ${configPath} was not found.`);
	} else if (configPath.endsWith(".css")) {
		config = detectInFile(configPath);
	} else {
		try {
			config = await loadConfigFile(configPath);
		} catch (e) {
			fail(Errors.configParsingError(configPath) + os.EOL + (e as Error).message);
		}
	}

	// 配置文件里的 template 与 exclude 一样相对配置文件所在目录; 内置配置仍相对 cwd.
	applyTemplate(config, configPath ? path.dirname(configPath) : process.cwd());
	if (options.verbose) config.verbose = options.verbose;
	if (options.lint) config.lint = options.lint;

	return { config, configPath };
}

function applyTemplate(config: Config, base: string): void {
	if (!config.template) return;

	const template = path.resolve(base, config.template);
	if (!fs.existsSync(template)) fail(Errors.missingTemplateFile(template));

	const templateConfig = detectInFile(template) as Record<string, unknown>;
	const target = config as Record<string, unknown>;
	for (const name in templateConfig) {
		if (Object.hasOwn(templateConfig, name) && !target[name]) {
			target[name] = templateConfig[name];
		}
	}
}

async function processFiles(files: string[]): Promise<void> {
	let results: Array<number | undefined>;
	try {
		results = (await Promise.all(files.map(file => comb.processPath(file)))).flat();
	} catch (error) {
		// 文件系统错误(权限等)只打信息, 其他错误保留调用栈便于报告问题
		const e = error as NodeJS.ErrnoException;
		fail((e.code ? e.message : e.stack) || String(error));
	}

	const tbchanged = results.reduce<number>((sum, isChanged) => sum + (isChanged || 0), 0);
	const changed = options.lint ? 0 : tbchanged;

	if (options.verbose) {
		const message = [
			`${results.length} file${results.length === 1 ? "" : "s"} processed`,
			`${changed} file${changed === 1 ? "" : "s"} fixed`,
			"",
		].join(os.EOL);
		process.stdout.write(message);
	}

	process.exitCode = options.lint && tbchanged ? 1 : 0;
}

async function processSTDIN(): Promise<void> {
	let input = "";
	process.stdin.setEncoding("utf8");
	for await (const chunk of process.stdin) input += chunk;

	let output: string;
	try {
		output = await comb.processString(input, { syntax: options.syntax || "css" });
	} catch (e) {
		fail((e as Error).message);
	}
	process.stdout.write(output);
}
