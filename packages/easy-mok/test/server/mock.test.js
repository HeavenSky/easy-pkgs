"use strict";
const fs = require("fs");
const http = require("http");
const path = require("path");
const zlib = require("zlib");
const { listen, sleep, startHost, waitFor } = require("../helpers/server");

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
	"GET /api/dep": () => undefined,
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
`.replace(`"GET /api/dep": () => undefined,\n`, "");

describe.each(["express4", "express5"])("宿主 %s", hostName => {
	/** @type {Awaited<ReturnType<typeof startHost>>} */
	let ctx;
	/** @type {http.Server} */
	let upstream;
	let upstreamPort = 0;

	beforeAll(async () => {
		upstream = http.createServer((req, res) => {
			const body = zlib.gzipSync(JSON.stringify({ upstream: true, url: req.url, auth: req.headers["x-auth-token"] || null }));
			res.writeHead(200, { "content-type": "application/json", "content-encoding": "gzip", "x-up": "1" });
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

	it("命中数据场景并解析路径参数", async () => {
		const res = await ctx.fetch("/api/user/7");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ id: 1, name: "张三" });
		expect(await (await ctx.fetch("/api/text")).text()).toBe("hello");
	});

	it("未命中时交给宿主, 且宿主拿回自己的 req/res 原型", async () => {
		const res = await ctx.fetch("/nope");
		expect(res.status).toBe(404);
		expect(await res.json()).toMatchObject({ host: true, isHostApp: true });
	});

	it("函数场景可调用 next() 回落到宿主", async () => {
		const res = await ctx.fetch("/api/next");
		expect(await res.json()).toMatchObject({ host: true, isHostApp: true });
	});

	it("解析请求体与查询参数", async () => {
		const res = await ctx.fetch("/api/echo?a=1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ x: [1] }) });
		expect(await res.json()).toEqual({ body: { x: [1] }, query: { a: "1" } });
	});

	it("权重高者优先, 同权重先声明者优先, 具体路由不因声明在后而生效", async () => {
		expect(await (await ctx.fetch("/api/w")).json()).toEqual({ w: 5 });
		expect(await (await ctx.fetch("/api/specific")).json()).toEqual({ generic: true });
	});

	it("代码中值为 null 的路由回放 null, undefined 的跳过", async () => {
		const res = await ctx.fetch("/n/nullish");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toMatch(/json/);
		expect(await res.text()).toBe("null");
		expect((await ctx.fetch("/n/skipped")).status).toBe(404);
	});

	it("同步与异步异常都返回 500 JSON", async () => {
		const a = await ctx.fetch("/api/throw");
		expect(a.status).toBe(500);
		expect(await a.json()).toMatchObject({ mock: true, message: "同步出错" });
		const b = await ctx.fetch("/api/reject");
		expect(b.status).toBe(500);
		expect(await b.json()).toMatchObject({ message: "异步出错" });
	});

	it("预检只拦截命中的路由", async () => {
		const hit = await ctx.fetch("/api/user/1", { method: "OPTIONS", headers: { origin: "http://localhost:5173", "access-control-request-method": "GET" } });
		expect(hit.status).toBe(204);
		expect(hit.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
		expect(hit.headers.get("access-control-allow-credentials")).toBe("true");
		const miss = await ctx.fetch("/nope", { method: "OPTIONS", headers: { "access-control-request-method": "GET" } });
		expect(miss.status).toBe(404);
	});

	it("跨域只放行本机与同 Host 来源, 不回显任意网页; 私有网段来源默认不放行", async () => {
		const acao = async origin => (await ctx.fetch("/api/text", { headers: { origin } })).headers.get("access-control-allow-origin");
		expect(await acao("http://evil.test")).toBeNull();
		expect(await acao("http://8.8.8.8")).toBeNull();
		expect(await acao("null")).toBeNull();
		expect(await acao("http://192.168.1.2:3000")).toBeNull();
		expect(await acao(ctx.base)).toBe(ctx.base);
		expect((await ctx.fetch("/api/text")).headers.get("access-control-allow-origin")).toBe("*");
	});

	it("显式声明的 OPTIONS 路由接管预检, HEAD 回落到 GET", async () => {
		const own = await ctx.fetch("/fn/opt", { method: "OPTIONS", headers: { origin: "http://localhost", "access-control-request-method": "GET" } });
		expect(own.status).toBe(200);
		expect(await own.json()).toEqual({ own: true });
		const head = await ctx.fetch("/api/text", { method: "HEAD" });
		expect(head.status).toBe(200);
	});

	it("无参函数返回数据即响应体, 带参函数未响应时用返回值, 首参带默认值按无参函数调用", async () => {
		expect(await (await ctx.fetch("/fn/ret")).json()).toEqual({ ret: true });
		expect(await (await ctx.fetch("/fn/async")).json()).toEqual([1, 2]);
		expect(await (await ctx.fetch("/fn/one/5")).json()).toEqual({ id: "5" });
		expect(await (await ctx.fetch("/fn/dflt")).json()).toEqual({ dflt: true });
		expect(await (await ctx.fetch("/fn/later")).json()).toEqual({ later: true });
	});

	it("请求体非法返回 400, 超限返回 413, 处理函数不执行", async () => {
		global.__bodyHandled = 0;
		const bad = await ctx.fetch("/fn/body", { method: "POST", headers: { "content-type": "application/json" }, body: "{bad" });
		expect(bad.status).toBe(400);
		expect(await bad.json()).toMatchObject({ mock: true, route: "POST /fn/body" });
		const big = await ctx.fetch("/fn/body", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ s: "x".repeat(6 * 1024 * 1024) }) });
		expect(big.status).toBe(413);
		expect(global.__bodyHandled).toBe(0);
		expect((await ctx.fetch("/fn/body", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(200);
		expect(global.__bodyHandled).toBe(1);
	});

	it("// 开头的路径不被当成主机名", async () => {
		const res = await ctx.fetch("//x/api/text");
		expect(await res.json()).toMatchObject({ host: true });
	});

	it("代理场景: 旧写法 onProxyReq / onProxyRes 生效", async () => {
		const res = await ctx.fetch("/proxy/a?b=1");
		expect(res.headers.get("x-rewritten")).toBe("yes");
		expect(await res.json()).toEqual({ upstream: true, url: "/proxy/a?b=1", auth: "forever" });
	});

	it("场景切换: 路由手选, 请求头, 查询参数, cookie 组", async () => {
		const id = Buffer.from("GET /api/user/:id").toString("base64url");
		expect((await ctx.api(`/routes/${id}/state`, { method: "PATCH", json: { scene: "empty" } })).status).toBe(200);
		expect(await (await ctx.fetch("/api/user/1")).json()).toBeNull();
		expect(await (await ctx.fetch("/api/user/1", { headers: { "x-mock-scene": "default" } })).json()).toEqual({ id: 1, name: "张三" });
		const err = await ctx.fetch("/api/user/9?__scene=error");
		expect(err.status).toBe(500);
		expect(await err.json()).toEqual({ code: 500, id: "9" });
		await ctx.api("/groups/浏览器", { method: "PUT", json: { [id]: "default" } });
		const viaCookie = await ctx.fetch("/api/user/1", { headers: { cookie: `__mock_group=${encodeURIComponent("浏览器")}` } });
		expect(await viaCookie.json()).toEqual({ id: 1, name: "张三" });
		await ctx.api(`/routes/${id}/state`, { method: "PATCH", json: { scene: null } });
		expect(await (await ctx.fetch("/api/user/1")).json()).toEqual({ id: 1, name: "张三" });
	});

	it("延迟, 状态码覆盖与放行", async () => {
		const id = Buffer.from("GET /api/text").toString("base64url");
		await ctx.api(`/routes/${id}/state`, { method: "PATCH", json: { delay: 300, status: 503 } });
		const t0 = Date.now();
		const res = await ctx.fetch("/api/text");
		expect(Date.now() - t0).toBeGreaterThanOrEqual(290);
		expect(res.status).toBe(503);
		expect(await res.text()).toBe("hello");
		const proxyId = Buffer.from("GET /proxy/*").toString("base64url");
		await ctx.api(`/routes/${proxyId}/state`, { method: "PATCH", json: { status: 418 } });
		expect((await ctx.fetch("/proxy/x")).status).toBe(418);
		await ctx.api(`/routes/${proxyId}/state`, { method: "PATCH", json: { status: null } });
		await ctx.api(`/routes/${id}/state`, { method: "PATCH", json: { mode: "pass", delay: null, status: null } });
		expect(await (await ctx.fetch("/api/text")).json()).toMatchObject({ host: true });
		expect(ctx.mock.match({ method: "GET", url: "/api/text", headers: {} })).toBe(false);
		await ctx.api(`/routes/${id}/state`, { method: "PATCH", json: { mode: "mock" } });
		expect(ctx.mock.match({ method: "GET", url: "/api/text", headers: {} })).toBe(true);
	});

	it("全局开关与代码 MOCK:false", async () => {
		await ctx.api("/state", { method: "PATCH", json: { enabled: false } });
		expect((await ctx.fetch("/api/text")).status).toBe(404);
		await ctx.api("/state", { method: "PATCH", json: { enabled: true } });
		expect((await ctx.fetch("/api/text")).status).toBe(200);
	});

	it("修改 mock 文件与其依赖后自动重载, 删除的路由失效", async () => {
		fs.writeFileSync(path.join(ctx.dir, "mocks/dep.js"), "module.exports = { v: 2 };");
		await waitFor(async () => (await (await ctx.fetch("/dep/value")).json()).v === 2);
		fs.writeFileSync(path.join(ctx.dir, "mocks/extra.js"), "module.exports = { 'GET /extra': { ok: 1 }, MOCK: true };");
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
				"mocks/m.mts": "export default { \"GET /mts\": { mts: true } as const };\n",
				"mocks/c.cts": "const value: { cts: boolean } = { cts: true };\nmodule.exports = { \"GET /cts\": value };\n",
				"mocks/types.d.ts": "export interface Unused { id: number }\n",
				"shared/legacy.cjs": "module.exports = { legacy: 1 };\n",
				// 默认导入 CJS 模块(node 内置模块, mockjs 等 CJS 包)要经 interopDefault, 否则取到 undefined
				"mocks/interop.ts": "import path from \"node:path\";\nimport legacy from \"../shared/legacy.cjs\";\nexport default { \"GET /interop\": () => ({ base: path.basename(\"/a/b.txt\"), legacy: legacy.legacy }) };\n",
			},
		});
	});

	afterAll(async () => { await ctx.close(); });

	it("加载 ESM 与 TS 文件, 默认导入 CJS 模块, 跳过 .d.ts", async () => {
		expect(await (await ctx.fetch("/esm")).json()).toEqual({ esm: true });
		expect(await (await ctx.fetch("/esm", { headers: { "x-mock-scene": "other" } })).json()).toEqual({ esm: 2 });
		expect(await (await ctx.fetch("/ts/user")).json()).toEqual({ id: 1, role: 1 });
		expect(await (await ctx.fetch("/mts")).json()).toEqual({ mts: true });
		expect(await (await ctx.fetch("/cts")).json()).toEqual({ cts: true });
		expect(await (await ctx.fetch("/interop")).json()).toEqual({ base: "b.txt", legacy: 1 });
		expect((await ctx.api("/meta")).body.diagnostics).toEqual([]);
	});

	it("修改 ESM 写法的 .js 后自动重载", async () => {
		fs.writeFileSync(path.join(ctx.dir, "mocks/esm.js"), "export default { \"GET /esm\": { esm: 3 } };\n");
		await waitFor(async () => (await (await ctx.fetch("/esm")).json()).esm === 3);
	});

	it("修改 TS 文件与 mock 目录外的 TS 依赖后自动重载", async () => {
		fs.writeFileSync(path.join(ctx.dir, "shared/dep.ts"), "export const v: number = 2;\n");
		await waitFor(async () => (await (await ctx.fetch("/ts/dep")).json()).v === 2);
		fs.writeFileSync(path.join(ctx.dir, "mocks/m.mts"), "export default { \"GET /mts\": { mts: 2 } };\n");
		await waitFor(async () => (await (await ctx.fetch("/mts")).json()).mts === 2);
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
	const A = (extra = "") => `const pre = require("../shared/pre.js");\nconst d = require("../shared/data.json");\nmodule.exports = { "GET /a": { pre: pre.v, j: d.j }${extra} };\n`;

	beforeAll(async () => {
		const { makeFixture } = require("../helpers/server");
		const { createMock } = require("../helpers/src").loadSrc();
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
		server = http.createServer((req, res) => app(req, res, () => { res.statusCode = 404; res.end("{\"host\":true}"); }));
		base = `http://127.0.0.1:${await listen(server)}`;
		await sleep(300); // 等 chokidar 初始扫描完成
	});

	afterAll(async () => {
		await app.close();
		await new Promise(resolve => server.close(resolve));
	});

	it("启动时加载失败与仅命名导出给出诊断, 其他文件照常", async () => {
		expect(await get("/a")).toEqual({ pre: 1, j: 1 });
		const types = (await get("/__mock/api/meta")).diagnostics.map(d => [path.basename(d.file || ""), d.type]);
		expect(types).toEqual(expect.arrayContaining([["broken.js", "load-error"], ["named.mjs", "load-error"]]));
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
		await waitFor(async () => (await get("/__mock/api/meta")).diagnostics.some(d => /沿用上次成功/.test(d.message)));
		expect(await get("/a")).toEqual({ host: true });
		write("mocks/a.js", A());
		await waitFor(async () => (await get("/a")).pre === 2);
	});
});

describe("mock 目录出现软链环", () => {
	it("监听报错只告警, 进程不退出", async () => {
		const ctx = await startHost({ files: { "mocks/a.js": "module.exports = { 'GET /a': { a: 1 } };" } });
		await sleep(300); // 等 chokidar 初始扫描完成, 之前的新增不触发事件
		fs.mkdirSync(path.join(ctx.dir, "mocks/sub"));
		fs.symlinkSync("..", path.join(ctx.dir, "mocks/sub/loop"));
		fs.writeFileSync(path.join(ctx.dir, "mocks/b.js"), "module.exports = { 'GET /b': { b: 1 } };");
		await waitFor(async () => (await ctx.fetch("/b")).status === 200);
		expect(await (await ctx.fetch("/a")).json()).toEqual({ a: 1 });
		await ctx.close();
	});
});

describe("挂到原生 http 与关闭", () => {
	it("作为 (req, res, next) 调用, close() 后进程资源释放", async () => {
		const { makeFixture } = require("../helpers/server");
		const { createMockware } = require("../helpers/src").loadSrc();
		const dir = makeFixture({ "m/a.js": "module.exports = { 'GET /a': { a: 1 } };" });
		const app = createMockware(path.join(dir, "m"), { stateFile: path.join(dir, "s.json") });
		const server = http.createServer((req, res) => app(req, res, () => { res.statusCode = 404; res.end("fallback"); }));
		const port = await listen(server);
		expect(await (await fetch(`http://127.0.0.1:${port}/a`)).json()).toEqual({ a: 1 });
		expect(await (await fetch(`http://127.0.0.1:${port}/b`)).text()).toBe("fallback");
		await app.close();
		await new Promise(resolve => server.close(resolve));
		await sleep(10);
	});
});
