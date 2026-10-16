// 加固项: pnpm 路径下的静态文件, 入口过滤, Buffer 响应, 终端诊断, 代理创建失败, 顶层 await 提示, 原型还原, vite 关闭, Host 校验, 日志内存上限
"use strict";
const fs = require("fs");
const http = require("http");
const path = require("path");
const { EventEmitter } = require("events");
const { createJiti } = require("jiti");
const { listen, makeFixture, sleep, startHost, waitFor, TMP_ROOT } = require("../helpers/server");
const { loadSrc } = require("../helpers/src");

const PKG = path.join(__dirname, "../..");
const { createMock, mockVitePlugin } = loadSrc();
const { createJournal } = loadSrc("journal.ts");

/** @param {number} port @param {string} urlPath @param {Record<string, string>} headers */
const rawGet = (port, urlPath, headers = {}) => new Promise((resolve, reject) => {
	http.get({ host: "127.0.0.1", port, path: urlPath, headers }, res => {
		let text = "";
		res.on("data", c => { text += c; });
		res.on("end", () => resolve({ status: res.statusCode, body: text, headers: res.headers }));
	}).on("error", reject);
});

/** 起一个原生 http 宿主, 未命中时回落 404 */
const startRaw = async app => {
	const server = http.createServer((req, res) => app(req, res, () => { res.statusCode = 404; res.end("fallback"); }));
	const port = await listen(server);
	return { port, base: `http://127.0.0.1:${port}`, close: () => new Promise(resolve => server.close(resolve)) };
};

describe("包装在 node_modules/.pnpm 下", () => {
	it("悬浮条入口与管理页不被 dotfiles 规则拒绝", async () => {
		const root = path.join(TMP_ROOT, `pnpm-${process.pid}`, "node_modules/.pnpm/easy-mok");
		fs.mkdirSync(path.join(root, "src"), { recursive: true });
		fs.cpSync(path.join(PKG, "src/server"), path.join(root, "src/server"), { recursive: true });
		fs.cpSync(path.join(PKG, "src/float"), path.join(root, "src/float"), { recursive: true });
		fs.copyFileSync(path.join(PKG, "package.json"), path.join(root, "package.json"));
		if (fs.existsSync(path.join(PKG, "dist/ui"))) { fs.cpSync(path.join(PKG, "dist/ui"), path.join(root, "dist/ui"), { recursive: true }); }
		fs.symlinkSync(path.join(PKG, "node_modules"), path.join(root, "node_modules"));
		const copy = createJiti(__filename)(path.join(root, "src/server/index.ts"));
		const dir = makeFixture({ "mocks/a.js": "module.exports = { 'GET /a': 1 };" });
		const app = copy.createMock({ cwd: dir, folder: "mocks", stateFile: "s.json", watch: false });
		const host = await startRaw(app);
		const loader = await rawGet(host.port, "/__mock/float.js", { host: "localhost" });
		expect(loader.status).toBe(200);
		expect(loader.body).toMatch(/__MOCK_FLOAT__/);
		const page = await rawGet(host.port, "/__mock/", { host: "localhost" });
		expect([200, 503]).toContain(page.status); // 未构建管理页时 503
		await app.close();
		await host.close();
	});
});

describe("入口过滤", () => {
	it("跳过工程配置与 _ / . 开头的路径, __gui__.json 照常加载, 被引用的 _ 文件改动仍触发重载", async () => {
		const dir = makeFixture({
			"real/mocks/a.ts": "import { v } from \"./_lib/util\";\nimport d from \"./_data/d.json\";\nexport default { \"GET /a\": { v, d: d.d } };\n",
			"real/mocks/_lib/util.ts": "export const v: number = 1;\n",
			"real/mocks/_data/d.json": "{ \"d\": 1 }",
			"real/mocks/_draft.js": "module.exports = { 'GET /draft': 1 };",
			"real/mocks/.hidden.js": "module.exports = { 'GET /hidden': 1 };",
			"real/mocks/package.json": "{ \"name\": \"x\" }",
			"real/mocks/tsconfig.json": "{ \"compilerOptions\": {} }",
			"real/mocks/sub/tsconfig.app.json": "{ \"compilerOptions\": {} }",
			"real/mocks/__gui__.json": "{ \"GET /gui\": { \"gui\": true } }",
		});
		fs.symlinkSync(path.join(dir, "real"), path.join(dir, "link"));
		const app = createMock({ cwd: dir, folder: "link/mocks", stateFile: "s.json" }); // 经软链访问 mock 目录
		const host = await startRaw(app);
		await sleep(300); // 等 chokidar 初始扫描完成
		const get = async url => (await fetch(host.base + url)).json();
		expect(app.mock.registry.fileCount).toBe(2);
		expect(app.mock.registry.diagnostics).toEqual([]);
		expect(await get("/a")).toEqual({ v: 1, d: 1 });
		expect(await get("/gui")).toEqual({ gui: true });
		expect((await fetch(host.base + "/draft")).status).toBe(404);
		fs.writeFileSync(path.join(dir, "real/mocks/_lib/util.ts"), "export const v: number = 2;\n");
		await waitFor(async () => (await get("/a")).v === 2);
		fs.writeFileSync(path.join(dir, "real/mocks/_data/d.json"), "{ \"d\": 2 }");
		await waitFor(async () => (await get("/a")).d === 2);
		await app.close();
		await host.close();
	});
});

describe("响应与诊断", () => {
	/** @type {any} */
	let app;
	let host;
	let dir = "";
	let errors = [];
	let warns = [];

	beforeAll(async () => {
		vi.spyOn(console, "error").mockImplementation((...a) => { errors.push(a.join(" ")); });
		vi.spyOn(console, "warn").mockImplementation((...a) => { warns.push(a.map(String).join(" ")); });
		dir = makeFixture({
			"state.json": JSON.stringify({ logLevel: "silent" }),
			"mocks/a.js": `module.exports = {
				"GET /buf": Buffer.from("hi"),
				"GET /fnbuf": req => Buffer.from("x" + req.query.n),
				"GET /pxbad": () => ({ router: undefined }),
				"GET /dup": 1,
			};`,
			"mocks/b.js": "module.exports = { 'GET /dup': 2 };",
			"mocks/c.js": "module.exports = { 'bad key': 1 };",
			"mocks/broken.js": "module.exports = {",
			"mocks/tla.mjs": "const x = await Promise.resolve(1);\nexport default { 'GET /tla': x };\n",
		});
		app = createMock({ cwd: dir, folder: "mocks", stateFile: "state.json", watch: false });
		host = await startRaw(app);
	});

	afterAll(async () => {
		vi.restoreAllMocks();
		await app.close();
		await host.close();
	});

	it("Buffer 原样发送, 处理函数返回 Buffer 时当响应体", async () => {
		const buf = await fetch(host.base + "/buf");
		expect(await buf.text()).toBe("hi");
		expect(buf.headers.get("content-type")).toMatch(/octet-stream/);
		expect(await (await fetch(host.base + "/fnbuf?n=1")).text()).toBe("x1");
	});

	it("加载错误与路由诊断去重打印到终端, 消息变化再打印, 修好后清除", () => {
		const count = (list, re) => list.filter(s => re.test(s)).length;
		expect(count(errors, /broken\.js/)).toBe(1);
		expect(count(errors, /tla\.mjs[\s\S]*不支持顶层 await/)).toBe(1);
		expect(count(warns, /同一路由在多处声明/)).toBe(1);
		expect(count(warns, /bad key/)).toBe(1);
		app.mock.registry.reload();
		expect(count(errors, /broken\.js/)).toBe(1);
		expect(count(warns, /bad key/)).toBe(1);
		fs.writeFileSync(path.join(dir, "mocks/broken.js"), "module.exports = { 'GET /x': [ };");
		app.mock.registry.reload();
		expect(count(errors, /broken\.js/)).toBe(2);
		fs.writeFileSync(path.join(dir, "mocks/broken.js"), "module.exports = {};");
		app.mock.registry.reload();
		expect(count(errors, /broken\.js/)).toBe(2);
		fs.writeFileSync(path.join(dir, "mocks/broken.js"), "module.exports = { 'GET /x': [ };");
		app.mock.registry.reload();
		expect(count(errors, /broken\.js/)).toBe(3); // 修好后再坏, 重新打印
	});

	it("顶层 await 的诊断带提示", () => {
		const d = app.mock.registry.diagnostics.find(x => (x.file || "").endsWith("tla.mjs"));
		expect(d.message).toMatch(/不支持顶层 await/);
	});

	it("代理创建失败只告警一次, 后续直接 500, 路由表重建后重试", async () => {
		const tries = () => warns.filter(s => /代理配置无效/.test(s)).length;
		const before = tries();
		for (let i = 0; i < 3; i++) {
			const res = await fetch(host.base + "/pxbad");
			expect(res.status).toBe(500);
			expect((await res.json()).message).toMatch(/target/);
		}
		expect(tries() - before).toBe(1);
		app.mock.registry.reload();
		expect((await fetch(host.base + "/pxbad")).status).toBe(500);
		expect(tries() - before).toBe(2);
	});
});

describe("非 express 宿主", () => {
	it("未命中交回宿主前还原 req/res 原型与 express 挂上的属性", async () => {
		const dir = makeFixture({ "m/a.js": "module.exports = { 'GET /a': 1 };" });
		const app = createMock({ cwd: dir, folder: "m", stateFile: "s.json", watch: false });
		let seen = null;
		const server = http.createServer((req, res) => app(req, res, () => {
			seen = {
				req: Object.getPrototypeOf(req) === http.IncomingMessage.prototype,
				res: Object.getPrototypeOf(res) === http.ServerResponse.prototype,
				extra: ["res" in req, res.req === req, "locals" in res], // Node 自身就有 res.req
			};
			res.end("fallback");
		}));
		const port = await listen(server);
		expect(await (await fetch(`http://127.0.0.1:${port}/miss`)).text()).toBe("fallback");
		expect(seen).toEqual({ req: true, res: true, extra: [false, true, false] });
		await app.close();
		await new Promise(resolve => server.close(resolve));
	});
});

describe("vite 插件", () => {
	it("沿用 allowedHosts, buildEnd 时关闭实例, 重启时先关掉旧实例", async () => {
		const dir = makeFixture({ "m/a.js": "module.exports = { 'GET /a': { a: 1 } };" });
		const plugin = mockVitePlugin({ cwd: dir, folder: "m", stateFile: "s.json" });
		let mw = null;
		const fakeServer = { middlewares: { use: fn => { mw = fn; } }, httpServer: null, config: { server: { allowedHosts: [".corp.test"] } } };
		const prevHosts = process.env.MOCK_HOSTS;
		delete process.env.MOCK_HOSTS;
		await plugin.configureServer(fakeServer);
		const first = mw;
		const closeSpy = vi.spyOn(first, "close");
		await plugin.configureServer(fakeServer); // vite 重启
		expect(closeSpy).toHaveBeenCalledTimes(1);
		const host = await startRaw(mw);
		expect((await rawGet(host.port, "/a", { host: "app.corp.test" })).status).toBe(200);
		expect((await rawGet(host.port, "/a", { host: "evil.test" })).status).toBe(403);
		expect(plugin.transformIndexHtml()).toHaveLength(1);
		const second = vi.spyOn(mw, "close");
		await plugin.buildEnd();
		expect(second).toHaveBeenCalledTimes(1);
		expect(plugin.transformIndexHtml()).toEqual([]);
		await host.close();
		if (prevHosts !== undefined) { process.env.MOCK_HOSTS = prevHosts; }
	});
});

describe("mock 路由的 Host 校验", () => {
	/** @type {Awaited<ReturnType<typeof startHost>>} */
	let ctx;

	beforeAll(async () => {
		ctx = await startHost({ files: { "mocks/a.js": "module.exports = { 'GET /a': { a: 1 } };" }, options: { hosts: ["dev.example.com", ".corp.test"] } });
	});

	afterAll(async () => { await ctx.close(); });

	it("放行本机名, IP 与 hosts, 其余返回带 MOCK_HOSTS 提示的 403", async () => {
		const status = async host => (await rawGet(ctx.port, "/a", { host })).status;
		for (const ok of ["localhost:1", "LOCALHOST", "localhost.", "app.localhost", "127.0.0.1:5173", "192.168.1.2:3000", "[::1]:80", "10.0.0.8", "dev.example.com", "corp.test", "a.b.corp.test:8080"]) {
			expect([ok, await status(ok)]).toEqual([ok, 200]);
		}
		for (const bad of ["evil.test", "dev.example.com.evil.test", "xcorp.test", "localhost.evil.test"]) {
			expect([bad, await status(bad)]).toEqual([bad, 403]);
		}
		const denied = await rawGet(ctx.port, "/a", { host: "evil.test" });
		expect(JSON.parse(denied.body).message).toMatch(/MOCK_HOSTS=evil\.test/);
		expect((await rawGet(ctx.port, "/miss", { host: "evil.test" })).status).toBe(404); // 未命中照常交给宿主
	});

	it("跨域与写操作的绕过变体", async () => {
		const acao = async origin => (await rawGet(ctx.port, "/a", { host: `localhost:${ctx.port}`, origin })).headers["access-control-allow-origin"] || null;
		for (const bad of ["null", "http://127.0.0.1.nip.io", "http://127.evil.test", "http://localhost.evil.test", "http://localhost@evil.test", "http://x.dev.example.com", "file://"]) {
			expect([bad, await acao(bad)]).toEqual([bad, null]);
		}
		for (const ok of ["HTTP://LOCALHOST:3000", "http://[::1]:3000", "http://evil.localhost", "http://a.corp.test"]) {
			expect([ok, await acao(ok)]).toEqual([ok, ok]);
		}
		expect(await acao("https://192.168.1.2")).toBeNull(); // 私有网段来源只在 lan 开启时放行
		const patch = headers => ctx.api("/state", { method: "PATCH", body: "{}", headers: { "content-type": "application/json", ...headers } });
		expect((await patch({ "content-type": "application/json-patch+json" })).status).toBe(400);
		expect((await patch({ "content-type": "application/json; charset=utf-8" })).status).toBe(200);
		expect((await patch({ "x-mock-ui": "true" })).status).toBe(403);
		expect((await patch({ origin: "null" })).status).toBe(403);
	});

	it("私有网段来源只在 lan 开启时放行, 同一 IP 的其他端口始终放行", () => {
		const { isTrustedOrigin } = loadSrc("security.ts");
		const none = new Set();
		expect(isTrustedOrigin("http://192.168.1.9:5173", "192.168.1.5:3000", none)).toBe(false);
		expect(isTrustedOrigin("http://192.168.1.9:5173", "192.168.1.5:3000", none, true)).toBe(true);
		expect(isTrustedOrigin("http://10.0.0.2", "localhost:3000", none, true)).toBe(true);
		expect(isTrustedOrigin("http://192.168.1.5:5173", "192.168.1.5:3000", none)).toBe(true);
		expect(isTrustedOrigin("http://[fd00::5]:5173", "[fd00::5]:3000", none)).toBe(true);
		expect(isTrustedOrigin("http://8.8.8.8", "8.8.8.8:3000", none)).toBe(true); // 同机不同端口, 与公网与否无关
		expect(isTrustedOrigin("http://evil.test:5173", "evil.test:3000", none)).toBe(false); // 域名仍要求 Host 完全一致
		expect(isTrustedOrigin("http://8.8.8.8", "localhost:3000", none, true)).toBe(false);
	});

	it("hosts 含 * 时不校验", async () => {
		const dir = makeFixture({ "m/a.js": "module.exports = { 'GET /a': 1 };" });
		const app = createMock({ cwd: dir, folder: "m", stateFile: "s.json", watch: false, hosts: ["*"] });
		const host = await startRaw(app);
		expect((await rawGet(host.port, "/a", { host: "anything.test" })).status).toBe(200);
		await app.close();
		await host.close();
	});
});

describe("请求日志内存上限", () => {
	it("请求体与响应体合计超过上限时淘汰最旧条目", () => {
		const journal = createJournal({ size: 500, totalBytes: 1000 });
		for (let i = 0; i < 6; i++) {
			const res = new EventEmitter();
			Object.assign(res, { write: () => true, end() { this.emit("finish"); }, getHeaders: () => ({ "content-type": "text/plain" }), headersSent: true, statusCode: 200 });
			journal.capture({ method: "GET", url: `/r${i}`, headers: {} }, res, () => ({ kind: "mock" }));
			res.end("x".repeat(400));
		}
		const list = journal.list();
		expect(list.map(e => e.url)).toEqual(["/r4", "/r5"]);
		expect(journal.bytes).toBeLessThanOrEqual(1000);
		journal.clear();
		expect(journal.bytes).toBe(0);
	});
});
