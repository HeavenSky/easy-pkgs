"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const utils = require("../../lib/utils");
const scriptProgress = require("../../lib/script_progress");
const helper = require("../support/helper");

// 依赖脚本: 起一个分 4 段, 每段间隔 300ms 返回 1MB 的本地服务并下载到文件, 同时记下自己看到的 NODE_OPTIONS
const DOWNLOAD_SCRIPT = `
const http = require("http");
const fs = require("fs");
fs.writeFileSync("node-options.txt", process.env.NODE_OPTIONS || "");
const CHUNK = Buffer.alloc(256 * 1024, 1);
const server = http.createServer((req, res) => {
	res.writeHead(200, { "content-length": CHUNK.length * 4 });
	let sent = 0;
	const send = () => {
		res.write(CHUNK);
		if (++sent < 4) setTimeout(send, 300);
		else res.end();
	};
	send();
});
server.listen(0, "127.0.0.1", () => {
	http.get("http://127.0.0.1:" + server.address().port + "/bin", res => {
		const out = fs.createWriteStream("bin");
		res.pipe(out);
		out.on("finish", () => server.close());
	});
});
`;

describe("test/unit/script-progress.test.js", () => {
	const [root, cleanup] = helper.tmp();
	const pkgDir = path.join(root, "node_modules", "dep");
	const logs = [];
	const console = {
		info() {},
		log() {},
		warn: (...args) => logs.push(args.join(" ")),
		error: (...args) => logs.push(args.join(" ")),
	};

	beforeEach(async () => {
		await cleanup();
		logs.length = 0;
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(
			path.join(pkgDir, "package.json"),
			JSON.stringify({ name: "dep", version: "1.0.0" })
		);
		fs.writeFileSync(path.join(pkgDir, "download.js"), DOWNLOAD_SCRIPT);
	});
	afterEach(cleanup);

	it("should report http download progress of a background script", async () => {
		const tracker = scriptProgress.start({ cacheDir: root, spinner: null, console });
		let progressFile;
		const begin = tracker.begin;
		tracker.begin = name => {
			const progress = begin(name);
			progressFile = progress.env.npd_progress_file;
			return progress;
		};
		const seen = [];
		const poll = setInterval(() => {
			if (!progressFile) return;
			const dir = path.dirname(progressFile);
			for (const name of fs.readdirSync(dir)) {
				if (!name.startsWith(`${path.basename(progressFile)}.`)) continue;
				try {
					seen.push(...JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")));
				} catch {}
			}
		}, 50);
		try {
			await utils.runScript(pkgDir, "node download.js", {
				root,
				console,
				env: { NODE_OPTIONS: "--no-warnings" },
				scriptProgress: tracker,
			});
		} finally {
			clearInterval(poll);
			tracker.stop();
		}

		// 钩子只观察数据, 不影响脚本读到的内容
		assert.equal(fs.statSync(path.join(pkgDir, "bin")).size, 1024 * 1024);
		const nodeOptions = fs.readFileSync(path.join(pkgDir, "node-options.txt"), "utf8");
		assert.match(nodeOptions, /^--no-warnings --require ".*script_progress_hook\.js"$/);
		assert(
			seen.some(
				item =>
					item.total === 1024 * 1024 && item.received > 0 && item.received < item.total
			),
			JSON.stringify(seen)
		);
		// 脚本结束后进度文件随之清理, stop 后整个进度目录删除
		assert(!fs.existsSync(path.dirname(progressFile)));
	});

	it("should not touch foreground scripts", async () => {
		const tracker = scriptProgress.start({ cacheDir: root, spinner: null, console });
		try {
			await utils.runScript(pkgDir, "node download.js", {
				root,
				console,
				foregroundScripts: true,
				scriptProgress: tracker,
			});
		} finally {
			tracker.stop();
		}
		assert.doesNotMatch(
			fs.readFileSync(path.join(pkgDir, "node-options.txt"), "utf8"),
			/script_progress_hook/
		);
	});
});
