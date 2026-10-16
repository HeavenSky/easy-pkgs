"use strict";
const { compileRoute, execRoute, parseKey, routeIdOf, keyOfRouteId, ParamError } = require("../helpers/src").loadSrc("route");

// 期望值取自 path-to-regexp@0.1.13 的实际匹配结果(同 express 4 路由: 不区分大小写, 非 strict, end)
const CASES = [
	["/user/:id", "/user/12", { id: "12" }],
	["/user/:id", "/user/12/", { id: "12" }],
	["/a/:id?", "/a", { id: undefined }],
	["/a/:id?", "/a/1", { id: "1" }],
	["/file/:name.:ext", "/file/a.b.c", { name: "a.b", ext: "c" }],
	["/u/:id(\\d+)", "/u/12", { id: "12" }],
	["/u/:id(\\d+)", "/u/ab", null],
	["/s/*", "/s/x/y", { 0: "x/y" }],
	["/s/:path*", "/s/x/y", { path: "x", 0: "/y" }],
	["/ab?cd", "/acd", {}],
	["/ab+cd", "/abbcd", {}],
	["/ab(cd)?e", "/abe", { 0: undefined }],
	["/a|b", "/a", {}],
	["/a\\.b", "/a.b", {}],
	["/x/:id", "/X/1", { id: "1" }],
	["/", "/", {}],
	["/x/(\\d+)", "/x/12", {}],
	["/:a/:b?/c", "/1/c", { a: "1", b: undefined }],
	["/ab*cd", "/abXYcd", { 0: "XY" }],
	["/a/(b|c)/:id", "/a/c/9", { id: "9" }],
	["/a/:x/(\\d+)/*", "/a/1/22/z", { x: "1", 0: "z" }],
	["/f/:n.:e?", "/f/a", { n: "a", e: undefined }],
	["/x/", "/x", {}],
	["/a.b", "/aXb", null],
	["/:id", "/A%20B", { id: "A B" }],
];

describe("compileRoute", () => {
	it.each(CASES)("%s 匹配 %s", (route, pathname, expected) => {
		expect(execRoute(compileRoute(route), pathname)).toEqual(expected);
	});

	it("同段多参数按 0.1.13 的 backtrack 取值", () => {
		expect(execRoute(compileRoute("/flights/:from-:to"), "/flights/A-B-C")).toEqual({ from: "A-B", to: "C" });
	});

	it("URL 解码失败同 express 4 抛 400", () => {
		expect(() => execRoute(compileRoute("/:id"), "/%E4")).toThrow(ParamError);
		try { execRoute(compileRoute("/:id"), "/%zz"); } catch (err) { expect(err.status).toBe(400); }
	});

	it("重复参数名: 后出现的 undefined 不覆盖已有值", () => {
		expect(execRoute(compileRoute("/:id/:id?"), "/a")).toEqual({ id: "a" });
		expect(execRoute(compileRoute("/:id/:id?"), "/a/b")).toEqual({ id: "b" });
	});

	it("+ 与 * 后缀, 参数正则内的 *", () => {
		expect(execRoute(compileRoute("/a/:id+"), "/a/xxx")).toEqual({ id: "xxx" });
		expect(execRoute(compileRoute("/a/:id*"), "/a/xxx")).toEqual({ id: "xxx", 0: "" });
		expect(execRoute(compileRoute("/a/:id(.*)"), "/a/x/y")).toEqual({ id: "x/y", 0: "/y" });
	});
});

describe("parseKey", () => {
	it("解析方法, 权重与路径", () => {
		expect(parseKey("get|POST:2 /a/:id")).toEqual({ methods: ["GET", "POST"], weight: 2, path: "/a/:id" });
		expect(parseKey("METHOD /x")).toEqual({ methods: ["ALL"], weight: 0, path: "/x" });
		expect(parseKey("ALL:-1 /x/*")).toEqual({ methods: ["ALL"], weight: -1, path: "/x/*" });
		expect(parseKey("GET:abc /x").weight).toBe(0);
	});

	it("非法 key 返回 null", () => {
		expect(parseKey("MOCK")).toBeNull();
		expect(parseKey("/x")).toBeNull();
		expect(parseKey("G-T /x")).toBeNull();
		expect(parseKey("BAD KEY")).toBeNull();
	});

	it("routeId 可逆", () => {
		const key = "GET|POST:1 /中文/:id";
		expect(keyOfRouteId(routeIdOf(key))).toBe(key);
		expect(routeIdOf(key)).toMatch(/^[\w-]+$/);
	});
});

describe("0.1.13 的边界写法", () => {
	it("参数正则内的嵌套分组按 0.1.13 原样处理", () => {
		expect(execRoute(compileRoute("/:id((a|b)c)"), "/ac")).toEqual({ id: "a", 0: "a" });
	});

	it("0.1.13 无法编译的写法同样抛错", () => {
		expect(() => compileRoute("/a/(?<n>\\d+)")).toThrow();
		expect(() => compileRoute("/x(")).toThrow();
	});
});
