"use strict";
const fs = require("fs");
const http = require("http");
const path = require("path");
const zlib = require("zlib");
const { listen, makeFixture, sleep, startHost, waitFor } = require("../helpers/server");
const { createMock, createMockware } = require("../helpers/src").loadSrc();

const MOCKS = `
const { scenes } = require(${JSON.stringify(path.join(__dirname, "../../src/server"))});
const dep = require("./dep");
module.exports = {
	"GET /api/user/:id": scenes({
		default: { id: 1, name: "张三" },
		empty: null,
		error: (req, res) => res.status(500).json({ code: 500, id: req.params.id }),
	}),
	"GET /api/text": "hello",
	"POST /api/echo": (req, res) => res.json({ body: req.body, query: req.query }),
	"GET /api/throw": () => { throw new Error("同步出错"); },
	"GET /api/reject": async (req, res) => { throw new Error("异步出错"); },
	"GET /api/next": (req, res, next) => next(),
	"GET /api/w": { w: 0 },
	"GET:5 /api/w": { w: 5 },
	"GET /api/:any": { generic: true },
	"GET /api/specific": { specific: true },
	"GET /dep/value": dep,
	"GET /fn/ret": () => ({ ret: true }),
	"GET /fn/async": async () => [1, 2],
	"GET /fn/one/:id": req => ({ id: req.params.id }),
	"GET /fn/dflt": (req = {}) => ({ dflt: !req.method }), // 首参带默认值时 length 为 0, 按无参函数调用
	"GET /fn/later": (req, res) => setTimeout(() => res.json({ later: true }), 10),
	"OPTIONS /fn/opt": (req, res) => res.status(200).json({ own: true }),
	"POST /fn/body": (req, res) => { global.__bodyHandled = (global.__bodyHandled || 0) + 1; res.json({ ok: 1 }); },
	"GET /fn/opt": { opt: true },
	"GET /n/nullish": null,
	"GET /n/skipped": undefined,
};
`;
const idOf = key => Buffer.from(key).toString("base64url");

describe.each(["express4", "express5"])("宿主 %s", hostName => {
	/** @type {Awaited<ReturnType<typeof startHost>>} */
	let ctx;
	/** @type {http.Server} */
	let upstream;
	let upstreamPort = 0;

	beforeAll(async () => {
		upstream = http.createServer((req, res) => {
			const body = zlib.gzipSync(
				JSON.stringify({
					upstream: true,
					url: req.url,
					auth: req.headers["x-auth-token"] || null,
				})
			);
			res.writeHead(200, {
				"content-type": "application/json",
				"content-encoding": "gzip",
				"x-up": "1",
			});
			res.end(body);
		});
		upstreamPort = await listen(upstream);
		ctx = await startHost({
			host: hostName,
			files: {
				"mocks/main.js": MOCKS,
				"mocks/dep.js": "module.exports = { v: 1 };",
				"mocks/proxy.js": `module.exports = {
					"GET /proxy/*": () => ({
						target: "http://127.0.0.1:${upstreamPort}",
						onProxyReq: proxyReq => proxyReq.setHeader("x-auth-token", "forever"),
						onProxyRes: proxyRes => { proxyRes.headers["x-rewritten"] = "yes"; },
					}),
				};`,
			},
		});
	});

	afterAll(async () => {
		await ctx.close();
		await new Promise(resolve => upstream.close(resolve));
	});

	const postJson = (url, body) =>
		ctx.fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body });
	const patchRoute = (key, json) =>
		ctx.api(`/routes/${idOf(key)}/state`, { method: "PATCH", json });

	it.each([
		["数据场景, 解析路径参数", "/api/user/7", { id: 1, name: "张三" }],
		["权重高者优先", "/api/w", { w: 5 }],
		["同权重先声明者优先, 具体路由不因声明在后而生效", "/api/specific", { generic: true }],
		["无参函数返回数据即响应体", "/fn/ret", { ret: true }],
		["无参异步函数返回数据即响应体", "/fn/async", [1, 2]],
		["带参函数未响应时用返回值", "/fn/one/5", { id: "5" }],
		["首参带默认值按无参函数调用", "/fn/dflt", { dflt: true }],
		["带参函数稍后自行响应", "/fn/later", { later: true }],
	])("%s: GET %s", async (_, url, expected) => {
		const res = await ctx.fetch(url);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual(expected);
	});

	it.each([
		["未命中", "/nope"],
		["函数场景调用 next()", "/api/next"],
		["// 开头的路径不被当成主机名", "//x/api/text"],
	])("%s 时交给宿主, 且宿主拿回自己的 req/res 原型", async (_, url) => {
		const res = await ctx.fetch(url);
		expect(res.status).toBe(404);
		expect(await res.json()).toMatchObject({ host: true, isHostApp: true });
	});

	it("解析请求体与查询参数", async () => {
		const res = await postJson("/api/echo?a=1", JSON.stringify({ x: [1] }));
		expect(await res.json()).toEqual({ body: { x: [1] }, query: { a: "1" } });
	});

	it("代码中值为 null 的路由回放 null, undefined 的跳过", async () => {
		const res = await ctx.fetch("/n/nullish");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toMatch(/json/);
		expect(await res.text()).toBe("null");
		expect((await ctx.fetch("/n/skipped")).status).toBe(404);
	});

	it.each([
		["/api/throw", "同步出错"],
		["/api/reject", "异步出错"],
	])("同步与异步异常都返回 500 JSON: %s", async (url, message) => {
		const res = await ctx.fetch(url);
		expect(res.status).toBe(500);
		expect(await res.json()).toMatchObject({ mock: true, message });
	});

	it("预检只拦截命中的路由, 显式声明的 OPTIONS 路由接管预检, HEAD 回落到 GET", async () => {
		const preflight = (url, origin) =>
			ctx.fetch(url, {
				method: "OPTIONS",
				headers: { ...(origin && { origin }), "access-control-request-method": "GET" },
			});
		const hit = await preflight("/api/user/1", "http://localhost:5173");
		expect(hit.status).toBe(204);
		expect(hit.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
		expect(hit.headers.get("access-control-allow-credentials")).toBe("true");
		expect((await preflight("/nope")).status).toBe(404);
		const own = await preflight("/fn/opt", "http://localhost");
		expect(own.status).toBe(200);
		expect(await own.json()).toEqual({ own: true });
		expect((await ctx.fetch("/api/text", { method: "HEAD" })).status).toBe(200);
		expect(await (await ctx.fetch("/api/text")).text()).toBe("hello");
	});

	it("跨域只放行本机与同 Host 来源, 不回显任意网页; 私有网段来源默认不放行", async () => {
		const acao = async origin =>
			(await ctx.fetch("/api/text", origin ? { headers: { origin } } : {})).headers.get(
				"access-control-allow-origin"
			);
		for (const bad of [
			"http://evil.test",
			"http://8.8.8.8",
			"null",
			"http://192.168.1.2:3000",
		]) {
			expect([bad, await acao(bad)]).toEqual([bad, null]);
		}
		expect(await acao(ctx.base)).toBe(ctx.base);
		expect(await acao()).toBe("*");
	});

	it("请求体非法返回 400, 超限返回 413, 处理函数不执行", async () => {
		global.__bodyHandled = 0;
		const bad = await postJson("/fn/body", "{bad");
		expect(bad.status).toBe(400);
		expect(await bad.json()).toMatchObject({ mock: true, route: "POST /fn/body" });
		const big = await postJson("/fn/body", JSON.stringify({ s: "x".repeat(6 * 1024 * 1024) }));
		expect(big.status).toBe(413);
		expect(global.__bodyHandled).toBe(0);
		expect((await postJson("/fn/body", "{}")).status).toBe(200);
		expect(global.__bodyHandled).toBe(1);
	});

	it("代理场景: 旧写法 onProxyReq / onProxyRes 生效", async () => {
		const res = await ctx.fetch("/proxy/a?b=1");
		expect(res.headers.get("x-rewritten")).toBe("yes");
		expect(await res.json()).toEqual({ upstream: true, url: "/proxy/a?b=1", auth: "forever" });
	});

	it("场景切换: 路由手选, 请求头, 查询参数, cookie 组", async () => {
		const user = async init => (await ctx.fetch("/api/user/1", init)).json();
		const DEFAULT = { id: 1, name: "张三" };
		expect((await patchRoute("GET /api/user/:id", { scene: "empty" })).status).toBe(200);
		expect(await user()).toBeNull();
		expect(await user({ headers: { "x-mock-scene": "default" } })).toEqual(DEFAULT);
		const err = await ctx.fetch("/api/user/9?__scene=error");
		expect(err.status).toBe(500);
		expect(await err.json()).toEqual({ code: 500, id: "9" });
		await ctx.api("/groups/浏览器", {
			method: "PUT",
			json: { [idOf("GET /api/user/:id")]: "default" },
		});
		const cookie = `__mock_group=${encodeURIComponent("浏览器")}`;
		expect(await user({ headers: { cookie } })).toEqual(DEFAULT);
		await patchRoute("GET /api/user/:id", { scene: null });
		expect(await user()).toEqual(DEFAULT);
	});

	it("延迟, 状态码覆盖, 放行与全局开关", async () => {
		await patchRoute("GET /api/text", { delay: 300, status: 503 });
		const t0 = Date.now();
		const res = await ctx.fetch("/api/text");
		expect(Date.now() - t0).toBeGreaterThanOrEqual(290);
		expect(res.status).toBe(503);
		expect(await res.text()).toBe("hello");
		await patchRoute("GET /proxy/*", { status: 418 });
		expect((await ctx.fetch("/proxy/x")).status).toBe(418);
		await patchRoute("GET /proxy/*", { status: null });
		await patchRoute("GET /api/text", { mode: "pass", delay: null, status: null });
		expect(await (await ctx.fetch("/api/text")).json()).toMatchObject({ host: true });
		const match = () => ctx.mock.match({ method: "GET", url: "/api/text", headers: {} });
		expect(match()).toBe(false);
		await patchRoute("GET /api/text", { mode: "mock" });
		expect(match()).toBe(true);
		await ctx.api("/state", { method: "PATCH", json: { enabled: false } });
		expect((await ctx.fetch("/api/text")).status).toBe(404);
		await ctx.api("/state", { method: "PATCH", json: { enabled: true } });
		expect((await ctx.fetch("/api/text")).status).toBe(200);
	});

	it("修改 mock 文件与其依赖后自动重载, 代码 MOCK: false 关闭全部 mock, 删除的路由失效", async () => {
		fs.writeFileSync(path.join(ctx.dir, "mocks/dep.js"), "module.exports = { v: 2 };");
		await waitFor(async () => (await (await ctx.fetch("/dep/value")).json()).v === 2);
		fs.writeFileSync(
			path.join(ctx.dir, "mocks/extra.js"),
			"module.exports = { 'GET /extra': { ok: 1 }, MOCK: true };"
		);
		await waitFor(async () => (await ctx.fetch("/extra")).status === 200);
		fs.writeFileSync(path.join(ctx.dir, "mocks/extra.js"), "module.exports = { MOCK: false };");
		await waitFor(async () => (await ctx.fetch("/api/text")).status === 404);
		fs.unlinkSync(path.join(ctx.dir, "mocks/extra.js"));
		await waitFor(async () => (await ctx.fetch("/api/text")).status === 200);
		expect((await ctx.fetch("/extra")).status).toBe(404);
	});
});

describe("ESM 与 TS 写法的 mock 文件", () => {
	const SERVER = JSON.stringify(path.join(__dirname, "../../src/server"));
	/** @type {Awaited<ReturnType<typeof startHost>>} */
	let ctx;

	beforeAll(async () => {
		ctx = await startHost({
			files: {
				"package.json": JSON.stringify({ type: "module" }),
				"shared/dep.ts": "export const v: number = 1;\n",
				"mocks/esm.js": `import { scenes } from ${SERVER};\nexport default { "GET /esm": scenes({ default: { esm: true }, other: { esm: 2 } }) };\n`,
				"mocks/user.ts": `import { v } from "../shared/dep.ts";\nenum Role { Admin = 1 }\ninterface User { id: number, role: Role }\nconst user: User = { id: 1, role: Role.Admin };\nexport default { "GET /ts/user": user, "GET /ts/dep": { v } };\n`,
				"mocks/m.mts": 'export default { "GET /mts": { mts: true } as const };\n',
				"mocks/c.cts":
					'const value: { cts: boolean } = { cts: true };\nmodule.exports = { "GET /cts": value };\n',
				"mocks/types.d.ts": "export interface Unused { id: number }\n",
				"shared/legacy.cjs": "module.exports = { legacy: 1 };\n",
				// 默认导入 CJS 模块(node 内置模块, mockjs 等 CJS 包)要经 interopDefault, 否则取到 undefined
				"mocks/interop.ts":
					'import path from "node:path";\nimport legacy from "../shared/legacy.cjs";\nexport default { "GET /interop": () => ({ base: path.basename("/a/b.txt"), legacy: legacy.legacy }) };\n',
			},
		});
	});

	afterAll(async () => {
		await ctx.close();
	});

	const get = async (url, init) => (await ctx.fetch(url, init)).json();

	it("加载 ESM 与 TS 文件, 默认导入 CJS 模块, 跳过 .d.ts", async () => {
		expect(await get("/esm")).toEqual({ esm: true });
		expect(await get("/esm", { headers: { "x-mock-scene": "other" } })).toEqual({ esm: 2 });
		expect(await get("/ts/user")).toEqual({ id: 1, role: 1 });
		expect(await get("/ts/dep")).toEqual({ v: 1 });
		expect(await get("/mts")).toEqual({ mts: true });
		expect(await get("/cts")).toEqual({ cts: true });
		expect(await get("/interop")).toEqual({ base: "b.txt", legacy: 1 });
		expect((await ctx.api("/meta")).body.diagnostics).toEqual([]);
	});

	it.each([
		[
			"ESM 写法的 .js",
			"mocks/esm.js",
			'export default { "GET /esm": { esm: 3 } };\n',
			"/esm",
			{ esm: 3 },
		],
		[
			"mock 目录外的 TS 依赖",
			"shared/dep.ts",
			"export const v: number = 2;\n",
			"/ts/dep",
			{ v: 2 },
		],
		[
			"TS 文件",
			"mocks/m.mts",
			'export default { "GET /mts": { mts: 2 } };\n',
			"/mts",
			{ mts: 2 },
		],
	])("修改%s后自动重载", async (_, file, content, url, expected) => {
		fs.writeFileSync(path.join(ctx.dir, file), content);
		await waitFor(async () => JSON.stringify(await get(url)) === JSON.stringify(expected));
	});
});

describe("加载失败与依赖追踪", () => {
	let dir = "";
	let base = "";
	/** @type {any} */
	let app;
	/** @type {http.Server} */
	let server;
	const get = async url => (await fetch(base + url)).json();
	const write = (name, content) => fs.writeFileSync(path.join(dir, name), content);
	const A = (extra = "") =>
		`const pre = require("../shared/pre.js");\nconst d = require("../shared/data.json");\nmodule.exports = { "GET /a": { pre: pre.v, j: d.j }${extra} };\n`;

	beforeAll(async () => {
		dir = makeFixture({
			"state.json": JSON.stringify({ logLevel: "silent" }),
			"shared/pre.js": "module.exports = { v: 1 };",
			"shared/data.json": JSON.stringify({ j: 1 }),
			"mocks/a.js": A(),
			"mocks/named.mjs": "export const x = 1;\n",
			"mocks/broken.js": "module.exports = {",
		});
		require(path.join(dir, "shared/pre.js")); // 宿主先加载的共享模块
		app = createMock({ cwd: dir, folder: "mocks", stateFile: "state.json" });
		server = http.createServer((req, res) =>
			app(req, res, () => {
				res.statusCode = 404;
				res.end('{"host":true}');
			})
		);
		base = `http://127.0.0.1:${await listen(server)}`;
		await sleep(300); // 等 chokidar 初始扫描完成
	});

	afterAll(async () => {
		await app.close();
		await new Promise(resolve => server.close(resolve));
	});

	it("启动时加载失败与仅命名导出给出诊断, 其他文件照常", async () => {
		expect(await get("/a")).toEqual({ pre: 1, j: 1 });
		const types = (await get("/__mock/api/meta")).diagnostics.map(d => [
			path.basename(d.file || ""),
			d.type,
		]);
		expect(types).toEqual(
			expect.arrayContaining([
				["broken.js", "load-error"],
				["named.mjs", "load-error"],
			])
		);
	});

	it("宿主预加载的外部模块与 JSON 依赖变化后重载", async () => {
		write("shared/pre.js", "module.exports = { v: 2 };");
		await waitFor(async () => (await get("/a")).pre === 2);
		write("shared/data.json", JSON.stringify({ j: 2 }));
		await waitFor(async () => (await get("/a")).j === 2);
	});

	it("热更新出错时沿用上次成功的路由与 MOCK 开关, 修好后生效", async () => {
		write("mocks/a.js", A(", MOCK: false"));
		await waitFor(async () => (await get("/a")).host === true);
		write("mocks/a.js", `${A(", MOCK: false")}}}}`);
		await waitFor(async () =>
			(await get("/__mock/api/meta")).diagnostics.some(d => /沿用上次成功/.test(d.message))
		);
		expect(await get("/a")).toEqual({ host: true });
		write("mocks/a.js", A());
		await waitFor(async () => (await get("/a")).pre === 2);
	});
});

describe("mock 目录出现软链环", () => {
	it("监听报错只告警, 进程不退出", async () => {
		const ctx = await startHost({
			files: { "mocks/a.js": "module.exports = { 'GET /a': { a: 1 } };" },
		});
		await sleep(300); // 等 chokidar 初始扫描完成, 之前的新增不触发事件
		fs.mkdirSync(path.join(ctx.dir, "mocks/sub"));
		fs.symlinkSync("..", path.join(ctx.dir, "mocks/sub/loop"));
		fs.writeFileSync(
			path.join(ctx.dir, "mocks/b.js"),
			"module.exports = { 'GET /b': { b: 1 } };"
		);
		await waitFor(async () => (await ctx.fetch("/b")).status === 200);
		expect(await (await ctx.fetch("/a")).json()).toEqual({ a: 1 });
		await ctx.close();
	});
});

describe("挂到原生 http 与关闭", () => {
	it("作为 (req, res, next) 调用, close() 后进程资源释放", async () => {
		const dir = makeFixture({ "m/a.js": "module.exports = { 'GET /a': { a: 1 } };" });
		const app = createMockware(path.join(dir, "m"), { stateFile: path.join(dir, "s.json") });
		const server = http.createServer((req, res) =>
			app(req, res, () => {
				res.statusCode = 404;
				res.end("fallback");
			})
		);
		const port = await listen(server);
		expect(await (await fetch(`http://127.0.0.1:${port}/a`)).json()).toEqual({ a: 1 });
		expect(await (await fetch(`http://127.0.0.1:${port}/b`)).text()).toBe("fallback");
		await app.close();
		await new Promise(resolve => server.close(resolve));
		await sleep(10);
	});
});
