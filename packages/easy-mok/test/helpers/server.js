// 测试辅助: 在临时目录生成 mock 文件, 把 easy-mok 挂到 express 4 / 5 宿主上并监听随机端口
"use strict";
const fs = require("fs");
const http = require("http");
const path = require("path");
const { loadSrc } = require("./src");

const { createMock } = loadSrc();

const TMP_ROOT = path.join(__dirname, "../.tmp");
let seq = 0;

/** @param {Record<string, string>} files */
const makeFixture = files => {
	const dir = path.join(TMP_ROOT, `${process.pid}-${Date.now()}-${++seq}`);
	Object.entries(files).forEach(([name, content]) => {
		const file = path.join(dir, name);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, content);
	});
	fs.mkdirSync(dir, { recursive: true });
	return dir;
};

/** @param {import("http").Server} server */
const listen = server => new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));

/**
 * @param {{ host?: "express4" | "express5", files?: Record<string, string>, options?: object, after?: (app: any) => void }} [opt]
 */
const startHost = async (opt = {}) => {
	const dir = makeFixture({ "state.json": JSON.stringify({ logLevel: "silent" }), ...opt.files });
	const express = require(opt.host || "express5");
	const host = express();
	const mock = createMock({ cwd: dir, folder: "mocks", stateFile: "state.json", ...opt.options });
	host.use(mock);
	if (opt.after) { opt.after(host); } else {
		host.use((req, res) => { res.status(404).json({ host: true, url: req.originalUrl, isHostApp: res.app === host }); });
	}
	const server = http.createServer(host);
	const port = await listen(server);
	const base = `http://127.0.0.1:${port}`;
	return {
		dir, mock, host, server, port, base,
		/** @param {string} url @param {RequestInit} [init] */
		fetch: (url, init) => fetch(base + url, init),
		/** @param {string} url @param {RequestInit & { json?: unknown }} [init] */
		api: async (url, init = {}) => {
			const headers = { "x-mock-ui": "1", ...(init.json !== undefined ? { "content-type": "application/json" } : {}), ...init.headers };
			const res = await fetch(`${base}/__mock/api${url}`, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
			const text = await res.text();
			return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
		},
		close: async () => {
			await mock.close();
			server.closeAllConnections && server.closeAllConnections();
			await new Promise(resolve => server.close(resolve));
		},
	};
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** @param {() => Promise<boolean> | boolean} check */
const waitFor = async (check, timeout = 3000) => {
	const end = Date.now() + timeout;
	while (Date.now() < end) {
		if (await check()) { return true; }
		await sleep(50);
	}
	throw new Error("waitFor 超时");
};

module.exports = { makeFixture, startHost, listen, sleep, waitFor, TMP_ROOT };
