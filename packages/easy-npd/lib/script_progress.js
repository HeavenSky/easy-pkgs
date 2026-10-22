"use strict";

const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const bytes = require("bytes");
const ms = require("ms");
const chalk = require("chalk");

// 后台依赖脚本不显示输出, 下载二进制等耗时步骤看起来像卡住; 这里汇总每个运行中脚本的耗时与下载进度:
// 终端里有 spinner 时每秒刷新 spinner 文字; --detail 或非 TTY(例: CI)没有 spinner 时给运行较久的脚本定期打印一行
const HOOK_FILE = path.join(__dirname, "script_progress_hook.js");
const PROGRESS_ENV = "npd_progress_file";
const TICK_MS = 1000;
const DETAIL_INTERVAL_MS = 10000;
const SPINNER_MAX_SCRIPTS = 3;

// NODE_OPTIONS 按空白分隔参数, 双引号内的反斜杠是转义符
function requireOption() {
	return `--require "${HOOK_FILE.replace(/[\\"]/g, "\\$&")}"`;
}

function readDownloads(dir, prefix) {
	let received = 0;
	let total = 0;
	let unknownTotal = false;
	let names = [];
	try {
		names = fs.readdirSync(dir).filter(name => name.startsWith(prefix));
	} catch {
		return null;
	}
	for (const name of names) {
		let items;
		try {
			items = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
		} catch {
			continue;
		}
		for (const item of Array.isArray(items) ? items : []) {
			received += item.received || 0;
			if (item.total) total += item.total;
			else unknownTotal = true;
		}
	}
	if (received === 0 && total === 0) return null;
	return { received, total: unknownTotal ? 0 : total };
}

function describe(entry, now) {
	let text = `${entry.name} ${ms(now - entry.start)}`;
	const download = readDownloads(entry.dir, entry.prefix);
	if (download) {
		text += `, downloading ${bytes(download.received)}`;
		if (download.total) {
			const percent = Math.min(100, Math.floor((download.received / download.total) * 100));
			text += `/${bytes(download.total)} (${percent}%)`;
		}
	}
	return text;
}

// 返回的 tracker 交给 utils.runScript: begin 为一个后台脚本分配进度文件并给出要合并进脚本的环境变量, end 在脚本结束后清理
exports.start = options => {
	const cacheRoot =
		options.cacheDir ||
		process.env.np_cache ||
		process.env.npm_config_cache ||
		path.join(os.homedir(), ".np_tarball");
	const dir = path.join(
		cacheRoot,
		"np-tmp",
		`script-progress-${crypto.randomUUID().slice(0, 8)}`
	);
	const running = new Set();
	const spinner = options.spinner && options.spinner.isEnabled ? options.spinner : null;
	let seq = 0;
	let enabled = true;
	try {
		fs.mkdirSync(dir, { recursive: true });
	} catch (err) {
		options.console.info(
			"[npd:script-progress] disabled, create %j error: %s",
			dir,
			err.message
		);
		enabled = false;
	}

	// spinner 转动时直接打印的日志会与 spinner 行粘连, 打印前先清掉 spinner 行, 打印后重绘
	const console = options.console;
	if (spinner) {
		options.console = {};
		for (const method of Object.keys(console)) {
			options.console[method] = (...args) => {
				if (!spinner.isSpinning) return console[method](...args);
				spinner.clear();
				console[method](...args);
				spinner.render();
			};
		}
		spinner.start("Running scripts");
	}

	const tick = () => {
		const now = Date.now();
		const entries = [...running.values()].sort((a, b) => a.start - b.start);
		if (spinner) {
			if (entries.length === 0) return;
			const shown = entries.slice(0, SPINNER_MAX_SCRIPTS).map(entry => describe(entry, now));
			const more = entries.length - shown.length;
			spinner.text = `Running ${entries.length} script${entries.length > 1 ? "s" : ""}: ${shown.join(", ")}${more > 0 ? `, +${more} more` : ""}`;
			return;
		}
		for (const entry of entries) {
			if (now - entry.lastPrint < DETAIL_INTERVAL_MS) continue;
			entry.lastPrint = now;
			console.warn("%s %s", chalk.yellow("scripts.running"), describe(entry, now));
		}
	};
	const timer = setInterval(tick, TICK_MS);
	timer.unref();

	return {
		begin(name) {
			const start = Date.now();
			const entry = { name, start, lastPrint: start, dir, prefix: `${++seq}.` };
			running.add(entry);
			const env = {};
			if (enabled) {
				env[PROGRESS_ENV] = path.join(dir, String(seq));
				env.NODE_OPTIONS = requireOption();
			}
			return {
				env,
				end() {
					running.delete(entry);
					if (!enabled) return;
					try {
						for (const file of fs.readdirSync(dir)) {
							if (file.startsWith(entry.prefix))
								fs.rmSync(path.join(dir, file), { force: true });
						}
					} catch {}
				},
			};
		},
		stop() {
			clearInterval(timer);
			// 停下并清掉 spinner 行, 否则最后一帧的进度会留在屏幕上, 与随后直接打印的日志接在同一行
			if (spinner) spinner.stop();
			options.console = console;
			if (!enabled) return;
			try {
				fs.rmSync(dir, { recursive: true, force: true });
			} catch {}
		},
	};
};
