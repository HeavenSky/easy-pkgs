"use strict";
const fs = require("fs");
const path = require("path");
const { createStateStore, sanitize } = require("../helpers/src").loadSrc("state");
const { resolveScene } = require("../helpers/src").loadSrc("scene");
const { makeFixture } = require("../helpers/server");

describe("运行状态", () => {
	it("不存在时用默认值, 写入后可重新读取", () => {
		const dir = makeFixture({});
		const file = path.join(dir, "cache/state.json");
		const store = createStateStore(file);
		expect(store.get().enabled).toBe(true);
		store.update(s => { s.routes.a = { scene: "x", delay: 99999 }; s.group = "g"; s.groups.g = { a: "y" }; });
		const again = createStateStore(file);
		expect(again.get().routes.a).toEqual({ scene: "x", delay: 60000 });
		expect(again.get().group).toBe("g");
		expect(fs.readdirSync(path.dirname(file)).filter(n => n.endsWith(".tmp"))).toEqual([]);
	});

	it("损坏的状态文件被改名并以默认值启动", () => {
		const dir = makeFixture({ "state.json": "{oops" });
		const store = createStateStore(path.join(dir, "state.json"));
		expect(store.get().routes).toEqual({});
		expect(store.problems[0]).toMatch(/无法解析/);
		expect(fs.readdirSync(dir).some(n => n.startsWith("state.json.broken-"))).toBe(true);
	});

	it("更高版本的状态文件只读运行", () => {
		const dir = makeFixture({ "state.json": JSON.stringify({ version: 9, enabled: false }) });
		const file = path.join(dir, "state.json");
		const store = createStateStore(file);
		expect(store.readOnly).toBe(true);
		store.update(s => { s.enabled = true; });
		expect(JSON.parse(fs.readFileSync(file, "utf8")).version).toBe(9);
	});

	it("丢弃非法字段, 指向不存在组的 group 置空", () => {
		const s = sanitize({ enabled: "yes", group: "none", logLevel: "loud", routes: { a: { mode: "x", status: 700, scene: 1 } }, groups: { g: { a: 1, b: "s" } } });
		expect(s).toMatchObject({ enabled: true, group: null, logLevel: "hit", routes: {}, groups: { g: { b: "s" } } });
	});
});

describe("场景解析优先级", () => {
	const state = sanitize({ group: "全局", routes: { r: { scene: "手选" } }, groups: { 全局: { r: "全局场景" }, 浏览器: { r: "浏览器场景" } } });
	const has = n => ["default", "手选", "全局场景", "浏览器场景", "请求场景"].includes(n);

	it("请求级 > 浏览器组 > 路由手选 > 全局组 > default", () => {
		expect(resolveScene({ routeId: "r", has, state, request: { header: "请求场景", cookieGroup: "浏览器" } })).toEqual({ name: "请求场景", level: "request", fallback: false });
		expect(resolveScene({ routeId: "r", has, state, request: { cookieGroup: "浏览器" } }).level).toBe("browser");
		expect(resolveScene({ routeId: "r", has, state }).level).toBe("route");
		const noRoute = sanitize({ ...state, routes: {} });
		expect(resolveScene({ routeId: "r", has, state: noRoute }).level).toBe("group");
		expect(resolveScene({ routeId: "x", has, state: noRoute }).level).toBe("default");
	});

	it("指定的场景不存在时降级并标记 fallback", () => {
		expect(resolveScene({ routeId: "r", has, state, request: { query: "不存在" } })).toEqual({ name: "手选", level: "route", fallback: true });
	});
});
