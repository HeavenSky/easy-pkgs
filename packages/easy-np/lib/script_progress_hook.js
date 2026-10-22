"use strict";

// np 经 NODE_OPTIONS --require 预加载进后台依赖脚本的 Node 进程(含脚本再启动的 Node 子进程), 把 http / https 下载进度写进
// np_progress_file 指向的路径加 .<pid> 的文件, 由 lib/script_progress.js 读取展示
// 只包装响应的 emit 计数 data 事件, 不改变流的读取方式; 脚本可能用任意 Node 版本运行, 写法保持保守, 任何异常都吞掉
const file = process.env.np_progress_file;
if (file) {
	const fs = require("fs");
	const out = file + "." + process.pid;
	const downloads = new Map();
	const WRITE_INTERVAL_MS = 300;
	let seq = 0;
	let lastWrite = 0;

	const write = force => {
		const now = Date.now();
		if (!force && now - lastWrite < WRITE_INTERVAL_MS) return;
		lastWrite = now;
		try {
			fs.writeFileSync(out, JSON.stringify(Array.from(downloads.values())));
		} catch {}
	};

	const track = function (res) {
		const req = this;
		// 没有其他 response 监听时 Node 会丢弃响应体; 多了这个监听后改由这里丢弃, 避免占住连接
		if (req.listenerCount("response") <= 1) {
			res.resume();
			return;
		}
		if (res.statusCode >= 300 && res.statusCode < 400) return;
		const id = ++seq;
		const item = { received: 0, total: Number(res.headers["content-length"]) || 0 };
		downloads.set(id, item);
		const emit = res.emit;
		res.emit = function (event, chunk) {
			try {
				if (event === "data" && chunk) {
					item.received += chunk.length;
					write(false);
				} else if (event === "end" || event === "close" || event === "error") {
					if (downloads.delete(id)) write(true);
				}
			} catch {}
			return emit.apply(this, arguments);
		};
	};

	// http.get / https.get 内部直接调用模块内的 request, 不会重复包装
	[require("http"), require("https")].forEach(mod => {
		["request", "get"].forEach(name => {
			const original = mod[name];
			mod[name] = function () {
				const req = original.apply(this, arguments);
				// 排在脚本自己的监听之前, 在它开始读取响应体前包装好 emit
				try {
					req.prependListener("response", track);
				} catch {}
				return req;
			};
		});
	});
}
