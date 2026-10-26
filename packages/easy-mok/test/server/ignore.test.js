// 请求忽略: 规则匹配, 内置规则, 自定义规则持久化与接口校验, 忽略后不入日志但响应照常
"use strict";
const fs = require("fs");
const path = require("path");
const { startHost, sleep } = require("../helpers/server");
const { loadSrc } = require("../helpers/src");

const { compileIgnore, createIgnore, DEFAULT_IGNORE, validateIgnore } = loadSrc("ignore.ts");

const match = (pattern, method, pathname) => {
	const r = compileIgnore(pattern);
	return (!r.method || r.method.includes(method)) && r.re.test(pathname);
};

describe("规则匹配", () => {
	it("* 只匹配一段, ** 匹配任意段与自身, 不区分大小写, 可限定方法, 其余字符按原样匹配", () => {
		for (const [pattern, method, pathname, expected] of [
			["/.well-known/**", "GET", "/.well-known/appspecific/com.chrome.devtools.json", true],
			["/.well-known/**", "GET", "/.well-known", true],
			["/.well-known/**", "GET", "/.well-knownx", false],
			["/a/*", "GET", "/a/b", true],
			["/a/*", "GET", "/a/b/c", false],
			["/a/**", "GET", "/a/b/c", true],
			["/a/*/c", "GET", "/A/B/C", true],
			["**/*.hot-update.json", "GET", "/x/main.abc.hot-update.json", true],
			["**/*.hot-update.json", "GET", "/main.hot-update.json", true],
			["/apple-touch-icon*.png", "GET", "/apple-touch-icon-precomposed.png", true],
			["/apple-touch-icon*.png", "GET", "/x/apple-touch-icon.png", false],
			["GET /x/**", "GET", "/x/1", true],
			["GET /x/**", "POST", "/x/1", false],
			["get|post /x", "POST", "/x", true],
			["/a.b", "GET", "/aXb", false],
			["/a(b)", "GET", "/a(b)", true],
		]) {
			const args = [pattern, method, pathname];
			expect([args, match(pattern, method, pathname)]).toEqual([args, expected]);
		}
	});

	it("非法规则给出原因", () => {
		expect(() => compileIgnore("abc")).toThrow(/开头/);
		expect(() => compileIgnore("GET")).toThrow(/开头/);
		expect(() => compileIgnore("/a/***")).toThrow(/三个/);
		expect(() => compileIgnore("GET /a b")).toThrow(/格式/);
		expect(validateIgnore(["/ok", "", "bad"]).map(e => e.index)).toEqual([1, 2]);
	});

	it("内置规则覆盖浏览器探测与 dev server 噪音, 不忽略可能是业务资源的路径", () => {
		const ig = createIgnore({
			defaults: true,
			extra: [],
			state: () => ({ defaults: true, disabled: [], custom: [] }),
		});
		for (const p of [
			"/.well-known/appspecific/com.chrome.devtools.json",
			"/favicon.ico",
			"/apple-touch-icon.png",
			"/robots.txt",
			"/__webpack_hmr",
			"/sockjs-node/info",
			"/ws",
			"/@vite/client",
			"/@fs/x",
			"/@id/x",
			"/node_modules/.vite/deps/a.js",
			"/a.hot-update.json",
			"/__mock/x",
		]) {
			expect([p, ig.test("GET", p)]).toEqual([p, true]);
		}
		for (const p of ["/manifest.json", "/sw.js", "/api/user", "/ws/chat", "/static/app.js"]) {
			expect([p, ig.test("GET", p)]).toEqual([p, false]);
		}
		expect(DEFAULT_IGNORE.every(r => compileIgnore(r.pattern))).toBe(true);
	});

	it("总开关, 逐条停用, 选项与自定义规则叠加", () => {
		let state = { defaults: true, disabled: ["/favicon.ico"], custom: ["/health"] };
		const ig = createIgnore({
			defaults: true,
			extra: ["GET /static/**", "bad"],
			state: () => state,
		});
		expect(ig.test("GET", "/favicon.ico")).toBe(false);
		expect(ig.test("GET", "/robots.txt")).toBe(true);
		expect(ig.test("GET", "/static/a.js")).toBe(true);
		expect(ig.test("GET", "/health")).toBe(true);
		state = { defaults: false, disabled: [], custom: [] };
		expect(ig.test("GET", "/robots.txt")).toBe(false);
		const off = createIgnore({
			defaults: false,
			extra: [],
			state: () => ({ defaults: true, disabled: [], custom: [] }),
		});
		expect(off.test("GET", "/robots.txt")).toBe(false);
	});
});

describe("忽略后的记录与接口", () => {
	/** @type {Awaited<ReturnType<typeof startHost>>} */
	let ctx;
	const FETCH = { "sec-fetch-dest": "empty" };
	const urls = () => ctx.mock.mock.journal.list().map(e => e.url);

	beforeAll(async () => {
		ctx = await startHost({
			files: {
				"mocks/a.js":
					"module.exports = { 'GET /.well-known/mocked': { ok: 1 }, 'GET /api/x': { x: 1 }, 'GET /api/pass': 1 };",
			},
		});
	});
	afterAll(async () => {
		await ctx.close();
	});

	it("内置规则命中的请求不进日志, 命中的 mock 照常响应; 终端日志也不打印", async () => {
		ctx.mock.mock.store.update(s => {
			s.logLevel = "all";
		});
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		expect(
			(
				await ctx.fetch("/.well-known/appspecific/com.chrome.devtools.json", {
					headers: FETCH,
				})
			).status
		).toBe(404);
		expect(await (await ctx.fetch("/.well-known/mocked", { headers: FETCH })).json()).toEqual({
			ok: 1,
		});
		await ctx.fetch("/api/x", { headers: FETCH });
		await ctx.fetch("/nope", { headers: FETCH });
		await sleep(30);
		expect(urls()).toEqual(expect.arrayContaining(["/api/x", "/nope"]));
		expect(urls().some(u => u.startsWith("/.well-known"))).toBe(false);
		expect(log.mock.calls.flat().join(" ")).not.toMatch(/well-known/);
		log.mockRestore();
		ctx.mock.mock.store.update(s => {
			s.logLevel = "silent";
		});
	});

	it("自定义规则持久化与接口校验, 关闭内置规则后重新记录", async () => {
		expect((await ctx.api("/ignore")).body.defaults.rules.length).toBeGreaterThan(10);
		const bad = await ctx.api("/ignore", { method: "PUT", json: { custom: ["/ok", "nope"] } });
		expect(bad.status).toBe(400);
		expect(bad.body.error.code).toBe("INVALID_RULE");
		expect(
			(await ctx.api("/ignore", { method: "PUT", json: { disabled: ["/not-builtin"] } }))
				.status
		).toBe(400);
		expect(
			(await ctx.api("/ignore/validate", { method: "POST", json: { rules: ["/a", "x"] } }))
				.body.errors
		).toHaveLength(1);
		const ok = await ctx.api("/ignore", {
			method: "PUT",
			json: { custom: ["GET /api/**"], disabled: ["/favicon.ico"] },
		});
		expect(ok.status).toBe(200);
		expect(ok.body.custom).toEqual(["GET /api/**"]);
		const saved = JSON.parse(fs.readFileSync(path.join(ctx.dir, "state.json"), "utf8"));
		expect(saved.ignore).toEqual({
			defaults: true,
			disabled: ["/favicon.ico"],
			custom: ["GET /api/**"],
		});
		ctx.mock.mock.journal.clear();
		expect(await (await ctx.fetch("/api/x", { headers: FETCH })).json()).toEqual({ x: 1 });
		const id = Buffer.from("GET /api/pass").toString("base64url");
		await ctx.api(`/routes/${id}/state`, { method: "PATCH", json: { mode: "pass" } });
		await ctx.fetch("/api/pass", { headers: FETCH });
		await ctx.fetch("/favicon.ico", { headers: FETCH });
		await sleep(30);
		expect(urls()).toEqual(["/favicon.ico"]); // /api/** 的 mock 与放行都不记录, 已停用的内置规则重新记录
		await ctx.api("/ignore", { method: "PUT", json: { defaults: false, custom: [] } });
		await ctx.fetch("/.well-known/appspecific/com.chrome.devtools.json", { headers: FETCH });
		await sleep(30);
		expect(urls()).toContain("/.well-known/appspecific/com.chrome.devtools.json");
	});

	it("选项 ignore 与 ignoreDefaults: false", async () => {
		const other = await startHost({
			files: { "mocks/a.js": "module.exports = {};" },
			options: { ignore: ["/health"], ignoreDefaults: false },
		});
		await other.fetch("/health", { headers: FETCH });
		await other.fetch("/robots.txt", { headers: FETCH });
		await sleep(30);
		expect(other.mock.mock.journal.list().map(e => e.url)).toEqual(["/robots.txt"]);
		const cfg = (await other.api("/ignore")).body;
		expect(cfg.defaults.forcedOff).toBe(true);
		expect(cfg.options).toEqual(["/health"]);
		await other.close();
	});
});
