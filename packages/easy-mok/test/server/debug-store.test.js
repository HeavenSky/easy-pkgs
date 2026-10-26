// 调试请求集合与环境组: 命名规则, 树, 节点增删改移, 请求定义, 环境组, 敏感值来源, 变量解析, 重载隔离
"use strict";
const fs = require("fs");
const http = require("http");
const path = require("path");
const { startHost, sleep } = require("../helpers/server");

const id = s => Buffer.from(s).toString("base64url");

describe("调试请求集合", () => {
	let ctx;
	let reloads = 0;
	let debugDir;
	const api = (url, init) => ctx.api(`/debug${url}`, init);
	const create = (parent, kind, name, extra = {}) =>
		api("/nodes", { method: "POST", json: { parent, kind, name, ...extra } });
	const patch = (node, json, headers) =>
		api(`/nodes/${id(node)}`, { method: "PATCH", json, headers });

	beforeAll(async () => {
		ctx = await startHost({
			files: { "mocks/a.js": "module.exports = { 'GET /api/user/:id': { id: 1 } };" },
		});
		debugDir = path.join(ctx.dir, "mocks", "__debug__");
		ctx.mock.mock.events.emit = new Proxy(ctx.mock.mock.events.emit, {
			apply(target, self, args) {
				if (args[0] === "changed" && args[1] && args[1].scope === "routes") reloads++;
				return Reflect.apply(target, self, args);
			},
		});
	});
	afterAll(() => ctx.close());

	it("名字规则与不区分大小写查重", async () => {
		const cases = [
			...["_a", "a.", "-a", "a b", "x".repeat(65), "res", "REQ.json", "café"].map(n => [
				n,
				400,
			]),
			["用户.v2", 201],
			["User", 201],
			["user", 409],
			// 按 NFC 规范化后比较: 兼容汉字 U+F900 规范化为 U+8C48
			["\u8c48", 201],
			["\uf900", 409],
		];
		for (const [name, status] of cases) {
			expect([name, (await create(null, "group", name)).status]).toEqual([name, status]);
		}
	});

	it("树按 weight 降序再按名称排序, 请求带方法与 URL", async () => {
		await create("User", "request", "get-user", { title: "获取用户", weight: 5 });
		await create("User", "request", "list");
		await create("User", "group", "admin", { weight: -1 });
		const tree = (await api("/tree")).body;
		const user = tree.nodes.find(n => n.id === "User");
		expect(user.children.map(n => n.id)).toEqual(["User/get-user", "User/list", "User/admin"]);
		expect(user.children[0]).toMatchObject({
			kind: "request",
			title: "获取用户",
			weight: 5,
			method: "GET",
			url: "",
		});
		expect((await create("User/get-user", "request", "x")).status).toBe(400); // 请求下不能建子节点
	});

	it("请求定义校验, etag 冲突, 未知字段保留", async () => {
		const got = (await api(`/requests/${id("User/get-user")}`)).body;
		expect(got.definition).toMatchObject({
			method: "GET",
			body: { type: "none" },
			route: null,
		});
		const definition = {
			...got.definition,
			url: "{{baseUrl}}/api/user/:id",
			params: { path: { id: "{{uid}}" }, query: [["page", "1", true]] },
			extra: 1,
		};
		const put = (definition, headers) =>
			api(`/requests/${id("User/get-user")}`, {
				method: "PUT",
				json: { definition },
				headers,
			});
		const ok = await put(definition, { "if-match": `"${got.etag}"` });
		expect(ok.status).toBe(200);
		expect(ok.body.definition.extra).toBe(1);
		expect((await put(definition, { "if-match": `"${got.etag}"` })).status).toBe(409); // etag 已过期
		expect((await put({ ...definition, method: "FOO" })).status).toBe(400);
	});

	it("改名, 移动, 元数据与删除", async () => {
		const renamed = await patch("User/list", {
			name: "list-users",
			title: "列表",
			vars: { page: "2" },
		});
		expect(renamed.body).toMatchObject({ id: "User/list-users", title: "列表" });
		const moved = await patch("User/list-users", { parent: "User/admin" });
		expect(moved.body.id).toBe("User/admin/list-users");
		expect((await patch("User", { parent: "User/admin" })).status).toBe(400);
		expect((await api(`/nodes/${id("User/admin")}`, { method: "DELETE" })).status).toBe(409);
		expect(
			(await api(`/nodes/${id("User/admin")}?recursive=1`, { method: "DELETE" })).status
		).toBe(204);
		expect(fs.existsSync(path.join(debugDir, "requests", "User", "admin"))).toBe(false);
	});

	it("元数据文件损坏时拒绝覆盖", async () => {
		await create(null, "group", "broken");
		fs.writeFileSync(path.join(debugDir, "requests", "broken", "__meta__.json"), "{");
		const res = await patch("broken", { title: "x" });
		expect(res.status).toBe(409);
		expect(res.body.error.code).toBe("META_FILE_INVALID");
		expect((await api("/tree")).body.problems.some(p => p.type === "meta-invalid")).toBe(true);
		// 改名同时改元数据: 校验失败时不能先把目录改了名
		expect((await patch("broken", { name: "broken2", title: "x" })).status).toBe(409);
		expect(fs.existsSync(path.join(debugDir, "requests", "broken"))).toBe(true);
		fs.writeFileSync(path.join(debugDir, "requests", "broken", "__meta__.json"), "{}");
		const stale = await patch(
			"broken",
			{ name: "broken2", title: "x" },
			{ "if-match": '"stale"' }
		);
		expect(stale.status).toBe(409);
		expect(fs.existsSync(path.join(debugDir, "requests", "broken"))).toBe(true);
	});

	it("环境组, 敏感值来源与激活, 改名联动", async () => {
		const env = await api("/envs/dev", {
			method: "PUT",
			json: {
				title: "开发",
				vars: { baseUrl: "https://dev.example.com", token: "<secret:tk>" },
			},
		});
		expect(env.status).toBe(200);
		expect((await api("/envs/Dev", { method: "PUT", json: { vars: {} } })).status).toBe(409);
		expect((await api("/envs/dev/secrets")).body).toEqual([
			{ id: "tk", from: null, configured: false },
		]);
		await api("/envs/dev/secrets/tk", {
			method: "PUT",
			json: { from: "value", value: "s3cret" },
		});
		const secrets = (await api("/envs/dev/secrets")).body;
		expect(secrets).toEqual([{ id: "tk", from: "value", configured: true }]);
		expect(JSON.stringify(secrets)).not.toContain("s3cret");
		await api("/active-env", { method: "PUT", json: { name: "dev" } });
		expect((await api("/envs")).body.active).toBe("dev");
		await api("/envs/dev", { method: "PATCH", json: { name: "development" } });
		expect((await api("/envs")).body.active).toBe("development");
		expect(
			fs.existsSync(path.join(debugDir, "environments", "secret", "development.json"))
		).toBe(true);
	});

	it("变量逐层覆盖, 敏感值在预览中保留占位, 未解析变量列出", async () => {
		fs.writeFileSync(
			path.join(debugDir, "requests", "__meta__.json"),
			JSON.stringify({ vars: { uid: "root", tenant: "t0" } })
		);
		await patch("User", { vars: { uid: "group" } });
		await patch("User/get-user", { vars: { uid: "42" } });
		const got = (await api(`/requests/${id("User/get-user")}`)).body;
		const definition = {
			...got.definition,
			headers: [
				["X-Tenant", "{{tenant}}", true],
				["x-off", "1", false],
				["x-miss", "{{nope}}", true],
			],
			auth: { type: "bearer", token: "{{token}}" },
		};
		const res = (
			await api("/resolve", {
				method: "POST",
				json: { request: "User/get-user", definition },
			})
		).body;
		expect(res.url).toBe("https://dev.example.com/api/user/42?page=1");
		expect(res.values.uid).toEqual({ value: "42", from: "request" });
		expect(res.values.tenant).toEqual({ value: "t0", from: "group:" });
		expect(res.values.token).toEqual({ value: "<secret:tk>", from: "secret:tk" });
		expect(res.values.id).toEqual({ value: "42", from: "path" });
		expect(res.headers).toEqual([
			["x-tenant", "t0"],
			["x-miss", "{{nope}}"],
			["authorization", "Bearer <secret:tk>"],
		]);
		expect(res.unresolved).toEqual(["nope"]);
		expect(JSON.stringify(res)).not.toContain("s3cret");
	});

	it("请求头, 认证与发送设置按 集合 → 分组 → 请求 逐层继承, 实际发出的请求带上合并结果", async () => {
		// 走真实链路: 本机回显服务收到什么就返回什么
		const echo = http.createServer((req, res) => res.end(JSON.stringify(req.headers)));
		await new Promise(r => echo.listen(0, "127.0.0.1", r));
		try {
			await api("/collection", {
				method: "PUT",
				json: {
					headers: [
						["Accept", "application/json", true],
						["X-Trace", "c", true],
					],
					settings: { timeoutMs: 9000 },
					auth: { type: "bearer", token: "col" },
				},
			});
			await patch("User", { headers: [["x-trace", "g", true]] });
			const fresh = (await create("User", "request", "fresh")).body;
			const definition = {
				...(await api(`/requests/${id(fresh.id)}`)).body.definition,
				url: `http://127.0.0.1:${echo.address().port}/x`,
				headers: [
					["accept", "", false],
					["X-Own", "1", true],
				],
			};
			const sent = (
				await api("/send", {
					method: "POST",
					json: { request: fresh.id, definition, env: null },
				})
			).body;
			const got = (await api(`/history/${id(sent.id)}/raw`)).body;
			expect(got["x-trace"]).toBe("g");
			expect(got["x-own"]).toBe("1");
			expect(got.accept).toBeUndefined();
			expect(got.authorization).toBe("Bearer col");
		} finally {
			echo.close();
			await api("/collection", {
				method: "PUT",
				json: { headers: [], settings: {}, auth: null },
			});
			await patch("User", { headers: null });
			await api(`/nodes/${id("User/fresh")}`, { method: "DELETE" });
		}
	});

	it("调试数据的写入不触发路由重载", async () => {
		const before = reloads;
		fs.mkdirSync(path.join(debugDir, "requests", "x"), { recursive: true });
		fs.writeFileSync(path.join(debugDir, "requests", "x", "req.json"), "{}");
		await create(null, "group", "later");
		await sleep(400);
		expect(reloads).toBe(before);
	});
});
