"use strict";

const os = require("node:os");
const bytes = require("bytes");

// 安装阶段的 spinner 文字: 顶层依赖进度, 当前包, 已解析的包版本数, 已下载的 tarball 字节与平均速度;
// 每秒刷新一次, 下载大包时字节数也在涨, 不会看起来卡住
const TICK_MS = 1000;

exports.render = options => {
	if (!options.spinner) return;
	const progresses = options.progresses;
	let text = `[${progresses.finishedInstallTasks}/${progresses.installTasks}] Installing ${progresses.current}`;
	if (progresses.packages > 0) text += `, ${progresses.packages} packages`;
	if (options.totalTarballSize > 0) {
		text += `, ${bytes(options.totalTarballSize)} downloaded`;
		const seconds = (Date.now() - progresses.startTime) / 1000;
		if (seconds >= 1) text += ` (${bytes(Math.round(options.totalTarballSize / seconds))}/s)`;
	}
	// 末尾换行让 spinner 与紧随其后打印的日志分行
	options.spinner.text = text + os.EOL;
};

// 返回停止刷新的函数
exports.start = options => {
	options.progresses.startTime = Date.now();
	if (!options.spinner) return () => {};
	const timer = setInterval(() => exports.render(options), TICK_MS);
	timer.unref();
	return () => clearInterval(timer);
};
