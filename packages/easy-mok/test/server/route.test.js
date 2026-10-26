"use strict";
const { compileRoute, execRoute, parseKey, routeIdOf, keyOfRouteId, ParamError } =
	require("../helpers/src").loadSrc("route");

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
	// 同段多参数按 0.1.13 的 backtrack 取值
	["/flights/:from-:to", "/flights/A-B-C", { from: "A-B", to: "C" }],
	// 重复参数名: 后出现的 undefined 不覆盖已有值
	["/:id/:id?", "/a", { id: "a" }],
	["/:id/:id?", "/a/b", { id: "b" }],
	// + 与 * 后缀, 参数正则内的 *
	["/a/:id+", "/a/xxx", { id: "xxx" }],
	["/a/:id*", "/a/xxx", { id: "xxx", 0: "" }],
	["/a/:id(.*)", "/a/x/y", { id: "x/y", 0: "/y" }],
	// 参数正则内的嵌套分组按 0.1.13 原样处理
	["/:id((a|b)c)", "/ac", { id: "a", 0: "a" }],
];

describe("compileRoute", () => {
	it.each(CASES)("%s 匹配 %s", (route, pathname, expected) => {
		expect(execRoute(compileRoute(route), pathname)).toEqual(expected);
	});

	it.each(["/%E4", "/%zz"])("URL 解码失败同 express 4 抛 400: %s", pathname => {
		const run = () => execRoute(compileRoute("/:id"), pathname);
		expect(run).toThrow(ParamError);
		expect(run).toThrow(expect.objectContaining({ status: 400 }));
	});

	it.each(["/a/(?<n>\\d+)", "/x("])("0.1.13 无法编译的写法同样抛错: %s", route => {
		expect(() => compileRoute(route)).toThrow(SyntaxError);
	});
});

describe("parseKey", () => {
	it.each([
		["get|POST:2 /a/:id", { methods: ["GET", "POST"], weight: 2, path: "/a/:id" }],
		["METHOD /x", { methods: ["ALL"], weight: 0, path: "/x" }],
		["ALL:-1 /x/*", { methods: ["ALL"], weight: -1, path: "/x/*" }],
		["GET:abc /x", { methods: ["GET"], weight: 0, path: "/x" }],
	])("解析方法, 权重与路径: %s", (key, expected) => {
		expect(parseKey(key)).toEqual(expected);
	});

	it.each(["MOCK", "/x", "G-T /x", "BAD KEY"])("非法 key 返回 null: %s", key => {
		expect(parseKey(key)).toBeNull();
	});

	it("routeId 可逆", () => {
		const key = "GET|POST:1 /中文/:id";
		expect(keyOfRouteId(routeIdOf(key))).toBe(key);
		expect(routeIdOf(key)).toMatch(/^[\w-]+$/);
	});
});
