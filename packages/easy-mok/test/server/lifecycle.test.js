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
	server.on("connection", s => {
		sockets.add(s);
		s.on("close", () => sockets.delete(s));
	});
	server.destroyAll = () => sockets.forEach(s => s.destroy());
	return server;
};

/** 上游: 普通请求回显名字, WebSocket 升级回 101 并带上名字与收到的路径, 统计收到的升级次数 */
const startUpstream = async name => {
	const server = trackSockets(
		http.createServer((req, res) => res.end(JSON.stringify({ up: name, url: req.url })))
	);
	server.upgrades = 0;
	server.on("upgrade", (req, socket) => {
		server.upgrades++;
		socket.end(
			`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nX-Up: ${name}\r\nX-Url: ${req.url}\r\n\r\n`
		);
	});
	const port = await listen(server);
	return {
		server,
		port,
		close: () => {
			server.destroyAll();
			return new Promise(resolve => server.close(resolve));
		},
	};
};

/**
 * 在临时目录建不监听文件的 mock 实例, 经 wrap 包成请求处理函数后起 http 服务;
 * 默认直接调用 mock, 未命中时宿主回 404 "host"
 */
const startMock = async (
	files,
	wrap = mock => (req, res) =>
		mock(req, res, () => {
			res.statusCode = 404;
			res.end("host");
		})
) => {
	const dir = makeFixture({ "state.json": JSON.stringify({ logLevel: "silent" }), ...files });
	const mock = createMock({ cwd: dir, folder: "mocks", stateFile: "state.json", watch: false });
	const server = trackSockets(http.createServer(wrap(mock)));
	const port = await listen(server);
	return {
		dir,
		mock,
		server,
		port,
		base: `http://127.0.0.1:${port}`,
		close: async () => {
			await mock.close();
			server.destroyAll();
			await new Promise(resolve => server.close(resolve));
		},
	};
};

/** 把 mock 挂到 express 5 宿主的 prefix 下, 未命中时宿主回 404 "host" */
const expressHost =
	(prefix = "/") =>
	mock => {
		const host = express5();
		host.use(prefix, mock);
		host.use((req, res) => res.status(404).end("host"));
		return host;
	};

/** 发起 WebSocket 升级, 返回响应头 header(默认 X-Up, 即响应方的名字); 宿主回普通响应时返回 "http <状态码>", 无人处理时超时返回 null */
const upgrade = (port, urlPath, header = "x-up") =>
	new Promise(resolve => {
		const req = http.request({
			host: "127.0.0.1",
			port,
			path: urlPath,
			headers: { connection: "Upgrade", upgrade: "websocket" },
		});
		req.on("upgrade", (res, socket) => {
			socket.destroy();
			resolve(res.headers[header] || null);
		});
		req.on("response", res => {
			res.resume();
			resolve(`http ${res.statusCode}`);
		});
		req.on("error", () => resolve(null));
		req.setTimeout(500, () => {
			req.destroy();
			resolve(null);
		});
		req.end();
	});

describe("代理生命周期与 WebSocket 分发", () => {
	let upA;
	let upB;
	let ctx;
	const PX = (extra = "") => `module.exports = {
		"GET /a/*": async () => { await new Promise(r => setTimeout(r, 30)); return { target: "http://127.0.0.1:${upA.port}", ws: true }; },
		"GET /b/*": () => ({ target: "http://127.0.0.1:${upB.port}", ws: true }),
		"GET /plain": () => ({ target: "http://127.0.0.1:${upA.port}" }),
	};${extra}`;
	const counts = () => ({
		close: ctx.server.listenerCount("close"),
		upgrade: ctx.server.listenerCount("upgrade"),
	});
	const upgrades = () => [upA.server.upgrades, upB.server.upgrades];

	beforeAll(async () => {
		upA = await startUpstream("A");
		upB = await startUpstream("B");
		ctx = await startMock({ "mocks/px.js": PX() }, expressHost());
		// 宿主自己的 upgrade 处理(如 dev server 热更新): 只接 /hmr
		ctx.server.on("upgrade", (req, socket) => {
			if (req.url === "/hmr")
				socket.end(
					"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nX-Up: host\r\n\r\n"
				);
		});
	});

	afterAll(async () => {
		await ctx.close();
		await upA.close();
		await upB.close();
	});

	it("并发首批请求共用一个代理, 重载后旧代理退场, 每条代理路由各一个代理", async () => {
		const before = counts();
		const expectCounts = async proxies => {
			await sleep(20); // hpm 在响应结束前挂 close 监听器
			// 每个代理一个 close 监听器, upgrade 分发只挂一个
			expect(counts()).toEqual({
				close: before.close + proxies,
				upgrade: before.upgrade + 1,
			});
		};
		const all = await Promise.all(
			[1, 2, 3].map(() => fetch(`${ctx.base}/a/x`).then(r => r.json()))
		);
		expect(all.every(x => x.up === "A")).toBe(true);
		await expectCounts(1);
		for (let i = 0; i < 3; i++) {
			fs.writeFileSync(path.join(ctx.dir, "mocks/px.js"), PX(`\n// ${i}`));
			ctx.mock.mock.registry.reload();
			expect((await (await fetch(`${ctx.base}/a/x`)).json()).up).toBe("A");
			await expectCounts(1);
		}
		await fetch(`${ctx.base}/b/x`);
		await fetch(`${ctx.base}/plain`);
		await expectCounts(3);
	});

	it("两条 ws 路由各自只处理一次, 未命中与非 ws 代理留给宿主", async () => {
		const [a0, b0] = upgrades();
		expect(await upgrade(ctx.port, "/a/ws")).toBe("A");
		expect(await upgrade(ctx.port, "/b/ws")).toBe("B");
		expect(await upgrade(ctx.port, "/hmr")).toBe("host");
		expect(await upgrade(ctx.port, "/plain")).toBeNull();
		expect(upgrades()).toEqual([a0 + 1, b0 + 1]);
	});

	it("放行模式与总开关关闭时不接管 upgrade", async () => {
		const id = Buffer.from("GET /a/*").toString("base64url");
		const [a0] = upgrades();
		ctx.mock.mock.store.update(s => {
			s.routes[id] = { mode: "pass" };
		});
		expect(await upgrade(ctx.port, "/a/ws")).toBeNull();
		ctx.mock.mock.store.update(s => {
			delete s.routes[id];
			s.enabled = false;
		});
		expect(await upgrade(ctx.port, "/a/ws")).toBeNull();
		expect(upgrades()[0]).toBe(a0);
		ctx.mock.mock.store.update(s => {
			s.enabled = true;
		});
	});

	it("close() 移除代理与 upgrade 监听器", async () => {
		await ctx.mock.close();
		expect(counts()).toEqual({ close: 0, upgrade: 1 }); // 只剩宿主自己的 upgrade 监听器
	});
});

describe("入口快照", () => {
	it("某个 key 无法解析或编译时整个入口沿用旧快照, 场景文件损坏时沿用上次能解析的内容", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const ctx = await startMock({
			"mocks/a.js": "module.exports = { 'GET /safe/:id': 'safe', 'GET /other': 'other' };",
		});
		const { registry } = ctx.mock.mock;
		const text = async url => (await fetch(ctx.base + url)).text();
		const both = async () => [await text("/safe/1"), await text("/other")];
		const write = s => {
			fs.writeFileSync(path.join(ctx.dir, "mocks/a.js"), s);
			registry.reload();
		};
		write("module.exports = { 'GET /safe/:id(': 'new', 'GET /other': 'other2' };");
		expect(await both()).toEqual(["safe", "other"]);
		expect(registry.diagnostics.map(d => d.type)).toEqual(["invalid-route"]);
		write("module.exports = { 'bad key': 1, 'GET /other': 'other3' };");
		expect(await both()).toEqual(["safe", "other"]);
		expect(registry.diagnostics[0].message).toMatch(/沿用上次成功/);
		write("module.exports = { 'GET /safe/:id': 'fixed' };");
		expect(await both()).toEqual(["fixed", "host"]);

		const id = Buffer.from("GET /safe/:id").toString("base64url");
		const api = (url, method, body) =>
			fetch(`${ctx.base}/__mock/api/routes/${id}${url}`, {
				method,
				headers: { "content-type": "application/json", "x-mock-ui": "1" },
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
			});
		expect((await api("/scenes/alt", "PUT", { body: "alt" })).status).toBe(201);
		await api("/state", "PATCH", { scene: "alt" });
		expect(await text("/safe/1")).toBe("alt");
		const scenesDir = path.join(ctx.dir, "mocks/__scenes__");
		fs.writeFileSync(path.join(scenesDir, fs.readdirSync(scenesDir)[0]), "{ broken");
		registry.reload();
		expect(await text("/safe/1")).toBe("alt");
		expect(registry.diagnostics.find(d => d.type === "broken-scene-file").message).toMatch(
			/沿用上次能解析/
		);
		await ctx.close();
		warn.mockRestore();
		error.mockRestore();
	});
});

describe("子路径挂载", () => {
	it("用挂载后的路径匹配, 请求日志记完整路径, 管理页与悬浮条按挂载前缀工作", async () => {
		const ctx = await startMock(
			{ "mocks/a.js": "module.exports = { 'GET /mount': 'mounted' };" },
			expressHost("/api")
		);
		const get = url => fetch(ctx.base + url);
		expect(await (await get("/api/mount")).text()).toBe("mounted");
		expect(await (await get("/mount")).text()).toBe("host");
		await sleep(10);
		expect(ctx.mock.mock.journal.list().map(e => e.url)).toContain("/api/mount");
		const page = await get("/api/__mock/routes");
		if (page.status === 200) {
			expect(await page.text()).toContain('<base href="/api/__mock/ui/" />');
		} // 未构建管理页时 503
		expect((await get("/api/__mock/float.js")).status).toBe(200);
		expect((await get("/api/__mock/api/meta")).status).toBe(200);
		await ctx.close();
	});

	it("WebSocket 代理与普通代理一样转发去掉挂载前缀的路径", async () => {
		const up = await startUpstream("U");
		const ctx = await startMock(
			{
				"mocks/px.js": `module.exports = { "GET /ws/*": () => ({ target: "http://127.0.0.1:${up.port}", ws: true }) };`,
			},
			expressHost("/api")
		);
		// 普通请求经过一次后才挂上 upgrade 分发
		expect((await (await fetch(`${ctx.base}/api/ws/x?a=1`)).json()).url).toBe("/ws/x?a=1");
		expect(await upgrade(ctx.port, "/api/ws/y?b=2", "x-url")).toBe("/ws/y?b=2");
		await ctx.close();
		await up.close();
	});
});

describe("路由编译与函数类型", () => {
	let ctx;

	beforeAll(async () => {
		ctx = await startMock({
			"mocks/a.js": `module.exports = {
				"GET /User/:id": req => ({ id: req.params.id }),
				"POST /rest": (...args) => ({ rest: args.length }),
				"POST /dflt": (req = { body: "default" }) => ({ body: req.body }),
				"POST /bound": (function (req) { return { bound: !!req }; }).bind(null, null),
				"GET /fn": (req, res) => res.json({ fn: true }),
			};`,
		});
	});

	afterAll(() => ctx.close());

	// + 等其余写法的匹配结果由 route.test.js 逐条覆盖
	it("同 express 4: 不区分大小写, 参数解码失败返回 400", async () => {
		expect(await (await fetch(`${ctx.base}/user/7`)).json()).toEqual({ id: "7" });
		const bad = await fetch(`${ctx.base}/user/%zz`);
		expect(bad.status).toBe(400);
		expect((await bad.json()).message).toMatch(/Failed to decode param/);
	});

	it("类型只看 fn.length: 剩余参数, 首参默认值与 bind 掉全部参数的函数按无参函数调用, 不解析请求体", async () => {
		const post = url =>
			fetch(ctx.base + url, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: '{"a":1}',
			}).then(r => r.json());
		expect(await post("/rest")).toEqual({ rest: 0 });
		expect(await post("/dflt")).toEqual({ body: "default" });
		expect(await post("/bound")).toEqual({ bound: false });
		expect(await (await fetch(`${ctx.base}/fn`)).json()).toEqual({ fn: true });
		const kinds = [...ctx.mock.mock.registry.routes.values()].map(r => [
			r.key,
			r.scenes.get("default").kind,
		]);
		expect(Object.fromEntries(kinds)).toMatchObject({
			"POST /rest": "proxy",
			"POST /dflt": "proxy",
			"GET /fn": "function",
			"GET /User/:id": "function",
		});
	});
});
