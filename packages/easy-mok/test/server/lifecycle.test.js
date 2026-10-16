// 代理生命周期与 WebSocket 分发, 入口快照, 子路径挂载, 路由编译(同 express 4), 函数类型只看 fn.length
"use strict";
const fs = require("fs");
const http = require("http");
const path = require("path");
const { listen, makeFixture, sleep } = require("../helpers/server");
const { loadSrc } = require("../helpers/src");

const { createMock } = loadSrc();
const express5 = require("express5");

/** 记下 server 的全部连接, 关闭时一并销毁; 升级后的连接不在 closeAllConnections 范围内 */
const trackSockets = server => {
	const sockets = new Set();
	server.on("connection", s => { sockets.add(s); s.on("close", () => sockets.delete(s)); });
	server.destroyAll = () => sockets.forEach(s => s.destroy());
	return server;
};

/** 上游: 普通请求回显名字, WebSocket 升级回 101 并带上名字, 统计收到的升级次数 */
const startUpstream = async name => {
	const server = trackSockets(http.createServer((req, res) => res.end(JSON.stringify({ up: name, url: req.url }))));
	server.upgrades = 0;
	server.on("upgrade", (req, socket) => {
		server.upgrades++;
		socket.end(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nX-Up: ${name}\r\n\r\n`);
	});
	const port = await listen(server);
	return { server, port, close: () => { server.destroyAll(); return new Promise(resolve => server.close(resolve)); } };
};

/** 发起 WebSocket 升级, 返回响应方的名字(X-Up 头); 无人处理时超时返回 null */
const upgrade = (port, urlPath) => new Promise(resolve => {
	const req = http.request({ host: "127.0.0.1", port, path: urlPath, headers: { connection: "Upgrade", upgrade: "websocket" } });
	req.on("upgrade", (res, socket) => { socket.destroy(); resolve(res.headers["x-up"] || null); });
	req.on("response", res => { res.resume(); resolve(`http ${res.statusCode}`); });
	req.on("error", () => resolve(null));
	req.setTimeout(500, () => { req.destroy(); resolve(null); });
	req.end();
});

describe("代理生命周期与 WebSocket 分发", () => {
	let upA;
	let upB;
	let dir = "";
	let mock;
	let server;
	let base = "";
	const write = (extra = "") => fs.writeFileSync(path.join(dir, "mocks/px.js"), `module.exports = {
		"GET /a/*": async () => { await new Promise(r => setTimeout(r, 30)); return { target: "http://127.0.0.1:${upA.port}", ws: true }; },
		"GET /b/*": () => ({ target: "http://127.0.0.1:${upB.port}", ws: true }),
		"GET /plain": () => ({ target: "http://127.0.0.1:${upA.port}" }),
	};${extra}`);
	const counts = () => ({ close: server.listenerCount("close"), upgrade: server.listenerCount("upgrade") });

	beforeAll(async () => {
		upA = await startUpstream("A");
		upB = await startUpstream("B");
		dir = makeFixture({ "state.json": JSON.stringify({ logLevel: "silent" }) });
		fs.mkdirSync(path.join(dir, "mocks"));
		write();
		mock = createMock({ cwd: dir, folder: "mocks", stateFile: "state.json", watch: false });
		const host = express5();
		host.use(mock);
		host.use((req, res) => res.status(404).end("host"));
		server = trackSockets(http.createServer(host));
		// 宿主自己的 upgrade 处理(如 dev server 热更新): 只接 /hmr
		server.on("upgrade", (req, socket) => { req.url === "/hmr" && socket.end("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nX-Up: host\r\n\r\n"); });
		base = `http://127.0.0.1:${await listen(server)}`;
	});

	afterAll(async () => {
		await mock.close();
		server.destroyAll();
		await new Promise(resolve => server.close(resolve));
		await upA.close();
		await upB.close();
	});

	it("并发首批请求共用一个代理, 重载后旧代理退场, close() 后监听器归零", async () => {
		const before = counts();
		const all = await Promise.all([1, 2, 3].map(() => fetch(`${base}/a/x`).then(r => r.json())));
		expect(all.every(x => x.up === "A")).toBe(true);
		await sleep(20); // hpm 在响应结束前挂 close 监听器
		expect(counts()).toEqual({ close: before.close + 1, upgrade: before.upgrade + 1 }); // 一个代理 + 一个 upgrade 分发
		for (let i = 0; i < 3; i++) {
			write(`\n// ${i}`);
			mock.mock.registry.reload();
			expect((await (await fetch(`${base}/a/x`)).json()).up).toBe("A");
			await sleep(20);
			expect(counts()).toEqual({ close: before.close + 1, upgrade: before.upgrade + 1 });
		}
		await fetch(`${base}/b/x`);
		await fetch(`${base}/plain`);
		await sleep(20);
		expect(counts()).toEqual({ close: before.close + 3, upgrade: before.upgrade + 1 });
	});

	it("两条 ws 路由各自只处理一次, 未命中与非 ws 代理留给宿主", async () => {
		const a0 = upA.server.upgrades;
		const b0 = upB.server.upgrades;
		expect(await upgrade(Number(new URL(base).port), "/a/ws")).toBe("A");
		expect(await upgrade(Number(new URL(base).port), "/b/ws")).toBe("B");
		expect(upA.server.upgrades - a0).toBe(1);
		expect(upB.server.upgrades - b0).toBe(1);
		expect(await upgrade(Number(new URL(base).port), "/hmr")).toBe("host");
		expect(await upgrade(Number(new URL(base).port), "/plain")).toBeNull();
		expect(upA.server.upgrades - a0).toBe(1);
	});

	it("放行模式与总开关关闭时不接管 upgrade", async () => {
		const id = Buffer.from("GET /a/*").toString("base64url");
		mock.mock.store.update(s => { s.routes[id] = { mode: "pass" }; });
		const a0 = upA.server.upgrades;
		expect(await upgrade(Number(new URL(base).port), "/a/ws")).toBeNull();
		mock.mock.store.update(s => { delete s.routes[id]; s.enabled = false; });
		expect(await upgrade(Number(new URL(base).port), "/a/ws")).toBeNull();
		expect(upA.server.upgrades - a0).toBe(0);
		mock.mock.store.update(s => { s.enabled = true; });
	});

	it("close() 移除代理与 upgrade 监听器", async () => {
		await mock.close();
		expect(counts()).toEqual({ close: 0, upgrade: 1 }); // 只剩宿主自己的 upgrade 监听器
	});
});

describe("入口快照", () => {
	it("某个 key 无法解析或编译时整个入口沿用旧快照, 场景文件损坏时沿用上次能解析的内容", async () => {
		const dir = makeFixture({
			"state.json": JSON.stringify({ logLevel: "silent" }),
			"mocks/a.js": "module.exports = { 'GET /safe/:id': 'safe', 'GET /other': 'other' };",
		});
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const mock = createMock({ cwd: dir, folder: "mocks", stateFile: "state.json", watch: false });
		const server = http.createServer((req, res) => mock(req, res, () => { res.statusCode = 404; res.end("host"); }));
		const b = `http://127.0.0.1:${await listen(server)}`;
		const text = async url => (await fetch(b + url)).text();
		const write = s => { fs.writeFileSync(path.join(dir, "mocks/a.js"), s); mock.mock.registry.reload(); };
		write("module.exports = { 'GET /safe/:id(': 'new', 'GET /other': 'other2' };");
		expect([await text("/safe/1"), await text("/other")]).toEqual(["safe", "other"]);
		expect(mock.mock.registry.diagnostics.map(d => d.type)).toEqual(["invalid-route"]);
		write("module.exports = { 'bad key': 1, 'GET /other': 'other3' };");
		expect([await text("/safe/1"), await text("/other")]).toEqual(["safe", "other"]);
		expect(mock.mock.registry.diagnostics[0].message).toMatch(/沿用上次成功/);
		write("module.exports = { 'GET /safe/:id': 'fixed' };");
		expect([await text("/safe/1"), await text("/other")]).toEqual(["fixed", "host"]);

		const id = Buffer.from("GET /safe/:id").toString("base64url");
		const api = (url, method, body) => fetch(`${b}/__mock/api${url}`, { method, headers: { "content-type": "application/json", "x-mock-ui": "1" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
		expect((await api(`/routes/${id}/scenes/alt`, "PUT", { body: "alt" })).status).toBe(201);
		await api(`/routes/${id}/state`, "PATCH", { scene: "alt" });
		expect(await text("/safe/1")).toBe("alt");
		const sceneFile = fs.readdirSync(path.join(dir, "mocks/__scenes__"))[0];
		fs.writeFileSync(path.join(dir, "mocks/__scenes__", sceneFile), "{ broken");
		mock.mock.registry.reload();
		expect(await text("/safe/1")).toBe("alt");
		expect(mock.mock.registry.diagnostics.find(d => d.type === "broken-scene-file").message).toMatch(/沿用上次能解析/);
		await mock.close();
		await new Promise(resolve => server.close(resolve));
		warn.mockRestore();
		error.mockRestore();
	});
});

describe("子路径挂载", () => {
	it("用挂载后的路径匹配, 请求日志记完整路径, 管理页与悬浮条按挂载前缀工作", async () => {
		const dir = makeFixture({ "state.json": JSON.stringify({ logLevel: "silent" }), "mocks/a.js": "module.exports = { 'GET /mount': 'mounted' };" });
		const mock = createMock({ cwd: dir, folder: "mocks", stateFile: "state.json", watch: false });
		const host = express5();
		host.use("/api", mock);
		host.use((req, res) => res.status(404).end("host"));
		const server = http.createServer(host);
		const b = `http://127.0.0.1:${await listen(server)}`;
		expect(await (await fetch(`${b}/api/mount`)).text()).toBe("mounted");
		expect(await (await fetch(`${b}/mount`)).text()).toBe("host");
		await sleep(10);
		expect(mock.mock.journal.list().map(e => e.url)).toContain("/api/mount");
		const page = await fetch(`${b}/api/__mock/routes`);
		if (page.status === 200) { expect(await page.text()).toContain('<base href="/api/__mock/ui/" />'); } // 未构建管理页时 503
		expect((await fetch(`${b}/api/__mock/float.js`)).status).toBe(200);
		expect((await fetch(`${b}/api/__mock/api/meta`)).status).toBe(200);
		await mock.close();
		await new Promise(resolve => server.close(resolve));
	});
});

describe("路由编译与函数类型", () => {
	let mock;
	let server;
	let b = "";

	beforeAll(async () => {
		const dir = makeFixture({
			"state.json": JSON.stringify({ logLevel: "silent" }),
			"mocks/a.js": `module.exports = {
				"GET /User/:id": req => ({ id: req.params.id }),
				"GET /plus/:id+": req => ({ id: req.params.id }),
				"POST /rest": (...args) => ({ rest: args.length }),
				"POST /dflt": (req = { body: "default" }) => ({ body: req.body }),
				"POST /bound": (function (req) { return { bound: !!req }; }).bind(null, null),
				"GET /fn": (req, res) => res.json({ fn: true }),
			};`,
		});
		mock = createMock({ cwd: dir, folder: "mocks", stateFile: "state.json", watch: false });
		server = http.createServer((req, res) => mock(req, res, () => { res.statusCode = 404; res.end("host"); }));
		b = `http://127.0.0.1:${await listen(server)}`;
	});

	afterAll(async () => {
		await mock.close();
		await new Promise(resolve => server.close(resolve));
	});

	it("同 express 4: 不区分大小写, + 后缀取整段, 参数解码失败返回 400", async () => {
		expect(await (await fetch(`${b}/user/7`)).json()).toEqual({ id: "7" });
		expect(await (await fetch(`${b}/plus/xxx`)).json()).toEqual({ id: "xxx" });
		const bad = await fetch(`${b}/user/%zz`);
		expect(bad.status).toBe(400);
		expect((await bad.json()).message).toMatch(/Failed to decode param/);
	});

	it("类型只看 fn.length: 剩余参数, 首参默认值与 bind 掉全部参数的函数按无参函数调用, 不解析请求体", async () => {
		const post = url => fetch(b + url, { method: "POST", headers: { "content-type": "application/json" }, body: "{\"a\":1}" }).then(r => r.json());
		expect(await post("/rest")).toEqual({ rest: 0 });
		expect(await post("/dflt")).toEqual({ body: "default" });
		expect(await post("/bound")).toEqual({ bound: false });
		expect(await (await fetch(`${b}/fn`)).json()).toEqual({ fn: true });
		const kinds = [...mock.mock.registry.routes.values()].map(r => [r.key, r.scenes.get("default").kind]);
		expect(Object.fromEntries(kinds)).toMatchObject({ "POST /rest": "proxy", "POST /dflt": "proxy", "GET /fn": "function", "GET /User/:id": "function" });
	});
});
