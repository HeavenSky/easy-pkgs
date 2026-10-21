"use strict";
const fs = require("fs");
const http = require("http");
const path = require("path");
const zlib = require("zlib");
const { createGuard, hostnameOf, isPrivate } = require("../helpers/src").loadSrc("security");
const { listen, startHost, waitFor } = require("../helpers/server");

const idOf = key => Buffer.from(key).toString("base64url");
const USER = "GET /api/user/:id";

/** @param {number} port @param {Record<string, string>} headers */
const rawGet = (port, urlPath, headers) =>
	new Promise((resolve, reject) => {
		http.get({ host: "127.0.0.1", port, path: urlPath, headers }, res => {
			let text = "";
			res.on("data", c => {
				text += c;
			});
			res.on("end", () => resolve({ status: res.statusCode, body: text }));
		}).on("error", reject);
	});

describe("管理接口", () => {
	/** @type {Awaited<ReturnType<typeof startHost>>} */
	let ctx;
	let upstream;
	let upPort = 0;

	beforeAll(async () => {
		upstream = http.createServer((req, res) => {
			const body = zlib.brotliCompressSync(JSON.stringify({ real: true, path: req.url }));
			res.writeHead(201, {
				"content-type": "application/json; charset=utf-8",
				"content-encoding": "br",
				"x-real": "1",
				"set-cookie": "sid=secret",
			});
			res.end(body);
		});
		upPort = await listen(upstream);
		ctx = await startHost({
			files: {
				"mocks/user.js": `const { scenes } = require(${JSON.stringify(path.join(__dirname, "../../src/server"))});
module.exports = {
	${JSON.stringify(USER)}: scenes({ default: { id: 1 }, vip: { id: 1, vip: true }, fn: (req, res) => res.json({ fn: true }) }),
	"GET /proxy/*": () => ({ target: "http://127.0.0.1:${upPort}" }),
	"GET /dup": 1,
	"GET /lazy": scenes({ default: async () => ({ lazy: true }), real: () => ({ target: "http://127.0.0.1:${upPort}" }) }),
};`,
				"mocks/badkey.js": "module.exports = { 'BAD KEY': 1, 'GET /badkey': 1 };",
				"mocks/dup.js": "module.exports = { 'GET /dup': 2, 'GET /broken': {} };",
				"mocks/boom.js": "throw new Error('加载失败');",
				"mocks/__scenes__/orphan.json": JSON.stringify({
					key: "GET /gone",
					scenes: { a: { body: 1 } },
				}),
				"mocks/__scenes__/bad.json": "{",
			},
		});
	});

	afterAll(async () => {
		await ctx.close();
		await new Promise(resolve => upstream.close(resolve));
	});

	it("meta 返回开关, 计数与诊断", async () => {
		const { status, body, headers } = await ctx.api("/meta");
		expect(status).toBe(200);
		expect(headers.get("x-mock-boot")).toBe(body.bootId);
		expect(body.enabled).toEqual({ code: true, state: true, effective: true });
		const types = body.diagnostics.map(d => d.type).sort();
		expect(types).toEqual(
			expect.arrayContaining([
				"broken-scene-file",
				"duplicate",
				"invalid-key",
				"load-error",
				"orphan-scenes",
			])
		);
		expect(body.diagnostics.find(d => d.type === "load-error").message).toMatch(/加载失败/);
	});

	it("路由列表与详情", async () => {
		const list = (await ctx.api("/routes")).body;
		const user = list.find(r => r.key === USER);
		expect(user).toMatchObject({
			methods: ["GET"],
			path: "/api/user/:id",
			scenes: ["default", "vip", "fn"],
			mode: "mock",
			active: { name: "default", level: "default" },
		});
		expect(user.source.line).toBe(3);
		expect((await ctx.api("/routes?q=proxy")).body.map(r => r.key)).toEqual(["GET /proxy/*"]);
		const detail = (await ctx.api(`/routes/${idOf(USER)}`)).body;
		expect(detail.scenes.find(s => s.name === "fn")).toMatchObject({
			kind: "function",
			editable: false,
		});
		expect(detail.scenes.find(s => s.name === "fn").content.source).toMatch(/fn: true/);
		expect((await ctx.api("/routes/xxx")).body.error.code).toBe("NOT_FOUND");
	});

	it("无参函数场景按实际返回值标注类型: 未请求前为无参函数, 返回数据为函数, 返回代理配置为代理", async () => {
		const kinds = async () =>
			Object.fromEntries(
				(await ctx.api(`/routes/${idOf("GET /lazy")}`)).body.scenes.map(s => [
					s.name,
					s.kind,
				])
			);
		expect(await kinds()).toEqual({ default: "nullary", real: "nullary" });
		expect(await (await ctx.fetch("/lazy")).json()).toEqual({ lazy: true });
		expect((await ctx.fetch("/lazy", { headers: { "x-mock-scene": "real" } })).status).toBe(
			201
		);
		expect(await kinds()).toEqual({ default: "function", real: "proxy" });
	});

	it("JSON 场景: 新建, 更新需 etag, 冲突, 删除, 代码场景只读", async () => {
		const url = `/routes/${idOf(USER)}/scenes/empty`;
		const created = await ctx.api(url, {
			method: "PUT",
			json: { status: 404, headers: { "X-A": "1" }, body: { msg: "无" } },
		});
		expect(created.status).toBe(201);
		expect(created.body).toMatchObject({
			source: "json",
			kind: "envelope",
			editable: true,
			content: { status: 404, headers: { "x-a": "1" } },
		});
		const r1 = await ctx.fetch("/api/user/1?__scene=empty");
		expect(r1.status).toBe(404);
		expect(r1.headers.get("x-a")).toBe("1");
		expect((await ctx.api(url, { method: "PUT", json: { body: 1 } })).body.error.code).toBe(
			"CONFLICT"
		);
		const conflict = await ctx.api(url, {
			method: "PUT",
			json: { body: 1 },
			headers: { "if-match": "stale" },
		});
		expect(conflict.status).toBe(409);
		expect(conflict.body.error.details.current.etag).toBe(created.body.etag);
		const updated = await ctx.api(url, {
			method: "PUT",
			json: { body: 2 },
			headers: { "if-match": `"${created.body.etag}"` },
		});
		expect(updated.status).toBe(200);
		const files = fs.readdirSync(path.join(ctx.dir, "mocks/__scenes__"));
		expect(files.some(f => /^GET_api_user_id\.[0-9a-f]{8}\.json$/.test(f))).toBe(true);
		const override = await ctx.api(`/routes/${idOf(USER)}/scenes/vip`, {
			method: "PUT",
			json: { body: "覆盖" },
		});
		expect(override.body.overrides).toBe(true);
		expect(await (await ctx.fetch("/api/user/1?__scene=vip")).text()).toBe("覆盖");
		expect(
			(await ctx.api(`/routes/${idOf(USER)}/scenes/fn`, { method: "DELETE" })).body.error.code
		).toBe("READ_ONLY");
		expect((await ctx.api(url, { method: "DELETE" })).status).toBe(204);
		expect(
			(await ctx.api(`/routes/${idOf(USER)}/scenes/vip`, { method: "DELETE" })).status
		).toBe(204);
		expect(await (await ctx.fetch("/api/user/1?__scene=vip")).json()).toEqual({
			id: 1,
			vip: true,
		});
		expect(
			(
				await ctx.api(`/routes/${idOf(USER)}/scenes/${encodeURIComponent("a b")}`, {
					method: "PUT",
					json: { body: 1 },
				})
			).body.error.code
		).toBe("INVALID_NAME");
		expect(
			(
				await ctx.api(`/routes/${idOf(USER)}/scenes/x`, {
					method: "PUT",
					json: { status: 999 },
				})
			).body.error.code
		).toBe("BAD_REQUEST");
	});

	it("脚本场景: 保存前编译检查, 回放时按处理函数执行, 状态码与响应头作为默认值", async () => {
		fs.writeFileSync(
			path.join(ctx.dir, "mocks/_helper.js"),
			"module.exports = { twice: n => n * 2 };"
		);
		const url = `/routes/${idOf(USER)}/scenes/script`;
		const script = `// 注释
(req, res) => ({ id: req.params.id, q: req.query.q, twice: require("./_helper").twice(2) }); // 末尾分号与注释`;
		const created = await ctx.api(url, {
			method: "PUT",
			json: { status: 202, headers: { "x-s": "1" }, body: { ignored: true }, script },
		});
		expect(created.status).toBe(201);
		expect(created.body).toMatchObject({
			source: "json",
			kind: "script",
			editable: true,
			content: { script, body: null, status: 202 },
		});
		const r = await ctx.fetch("/api/user/7?__scene=script&q=x");
		expect(r.status).toBe(202);
		expect(r.headers.get("x-s")).toBe("1");
		expect(await r.json()).toEqual({ id: "7", q: "x", twice: 4 });
		fs.writeFileSync(
			path.join(ctx.dir, "mocks/_helper.js"),
			"module.exports = { twice: n => n * 20 };"
		); // 脚本 require 的模块改动后热更新
		await waitFor(
			async () => (await (await ctx.fetch("/api/user/7?__scene=script")).json()).twice === 40,
			5000
		);
		const own = await ctx.api(url, {
			method: "PUT",
			json: { script: "async (req, res) => { res.status(418).send('teapot'); }" },
			headers: { "if-match": `"${created.body.etag}"` },
		});
		expect(own.status).toBe(200);
		const tea = await ctx.fetch("/api/user/7?__scene=script");
		expect([tea.status, await tea.text()]).toEqual([418, "teapot"]);
		for (const bad of ["(req) => {", "42", "   "]) {
			const res = await ctx.api(`/routes/${idOf(USER)}/scenes/bad`, {
				method: "PUT",
				json: { script: bad },
			});
			expect([bad, res.status, res.body.error.details.field]).toEqual([bad, 400, "script"]);
		}
		const created2 = await ctx.api("/routes", {
			method: "POST",
			json: {
				methods: ["POST"],
				path: "/api/scripted",
				response: { script: "req => ({ got: req.body })" },
			},
		});
		expect(created2.status).toBe(201);
		expect(
			await (
				await ctx.fetch("/api/scripted", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: '{"a":1}',
				})
			).json()
		).toEqual({ got: { a: 1 } });
		expect((await ctx.api(url, { method: "DELETE" })).status).toBe(204);
		expect(
			(await ctx.api(`/routes/${idOf("POST /api/scripted")}`, { method: "DELETE" })).status
		).toBe(204);
	});

	it("场景文件中无法编译的脚本记为诊断并忽略该场景", async () => {
		const file = path.join(ctx.dir, "mocks/__scenes__/script-bad.json");
		fs.writeFileSync(
			file,
			JSON.stringify({
				key: USER,
				scenes: { broken: { script: "(req) => {" }, fine: { script: "() => 1" } },
			})
		);
		ctx.mock.mock.registry.reload();
		const diag = (await ctx.api("/meta")).body.diagnostics.find(d => d.type === "script-error");
		expect(diag.message).toMatch(/场景 broken 的脚本无法编译/);
		const scenes = (await ctx.api(`/routes/${idOf(USER)}`)).body.scenes.map(x => x.name);
		expect(scenes).toContain("fine");
		expect(scenes).not.toContain("broken");
		fs.unlinkSync(file);
		ctx.mock.mock.registry.reload();
	});

	it("新建与删除 GUI 路由", async () => {
		const bad = await ctx.api("/routes", {
			method: "POST",
			json: { methods: ["GET"], path: "no-slash" },
		});
		expect(bad.body.error.code).toBe("INVALID_ROUTE");
		const created = await ctx.api("/routes", {
			method: "POST",
			json: {
				methods: ["get", "post"],
				path: "/gui/:id",
				response: { status: 202, body: { gui: 1 } },
			},
		});
		expect(created.status).toBe(201);
		expect(created.body.source.type).toBe("gui");
		const res = await ctx.fetch("/gui/1", { method: "POST" });
		expect(res.status).toBe(202);
		expect(await res.json()).toEqual({ gui: 1 });
		expect(
			JSON.parse(fs.readFileSync(path.join(ctx.dir, "mocks/__gui__.json"), "utf8"))
		).toEqual({ "GET|POST /gui/:id": { gui: 1 } });
		expect(
			(
				await ctx.api("/routes", {
					method: "POST",
					json: { methods: ["GET", "POST"], path: "/gui/:id" },
				})
			).body.error.code
		).toBe("CONFLICT");
		expect((await ctx.api(`/routes/${idOf(USER)}`, { method: "DELETE" })).body.error.code).toBe(
			"READ_ONLY"
		);
		expect((await ctx.api(`/routes/${created.body.id}`, { method: "DELETE" })).status).toBe(
			204
		);
		expect((await ctx.fetch("/gui/1")).status).toBe(404);
	});

	it("场景组: 新建, 快照, 重命名, 设为全局, 删除", async () => {
		await ctx.api(`/routes/${idOf(USER)}/state`, { method: "PATCH", json: { scene: "vip" } });
		const snap = await ctx.api("/groups/会员/snapshot", { method: "POST" });
		expect(snap.body.groups["会员"]).toEqual({ [idOf(USER)]: "vip" });
		await ctx.api(`/routes/${idOf(USER)}/state`, { method: "PATCH", json: { scene: null } });
		expect(
			(await ctx.api("/state", { method: "PATCH", json: { group: "不存在" } })).body.error
				.code
		).toBe("NOT_FOUND");
		await ctx.api("/state", { method: "PATCH", json: { group: "会员" } });
		expect(await (await ctx.fetch("/api/user/1")).json()).toEqual({ id: 1, vip: true });
		const renamed = await ctx.api("/groups/会员/rename", {
			method: "POST",
			json: { to: "VIP" },
		});
		expect(renamed.body.active).toBe("VIP");
		expect((await ctx.api("/routes")).body.find(r => r.key === USER).active).toEqual({
			name: "vip",
			level: "group",
			fallback: false,
		});
		expect((await ctx.api("/groups/VIP", { method: "DELETE" })).status).toBe(204);
		expect((await ctx.api("/meta")).body.group).toBeNull();
	});

	it("清理失效引用与孤儿场景文件", async () => {
		await ctx.api("/groups/g", {
			method: "PUT",
			json: { [idOf("GET /none")]: "x", [idOf(USER)]: "nope" },
		});
		const meta = (await ctx.api("/meta")).body;
		expect(meta.diagnostics.filter(d => d.type === "stale-state").length).toBe(2);
		expect((await ctx.api("/state/cleanup", { method: "POST" })).body.removed).toBe(2);
		expect((await ctx.api("/orphans", { method: "DELETE" })).body.removed).toBe(1);
		expect(fs.existsSync(path.join(ctx.dir, "mocks/__scenes__/orphan.json"))).toBe(false);
	});

	it("请求日志: 命中, 代理解码与脱敏, 未命中只记 fetch, 存为场景", async () => {
		await ctx.api("/logs", { method: "DELETE" });
		await ctx.fetch("/api/user/5", { headers: { authorization: "Bearer x" } });
		await ctx.fetch("/proxy/real");
		await ctx.fetch("/static.js");
		await ctx.fetch("/api/miss", { headers: { "sec-fetch-dest": "empty" } });
		await ctx.fetch("/sockjs-node/info", { headers: { "sec-fetch-dest": "empty" } });
		const logs =
			(await waitFor(async () => (await ctx.api("/logs")).body.length === 3),
			(await ctx.api("/logs")).body);
		expect(logs.map(l => [l.kind, l.url])).toEqual([
			["mock", "/api/user/5"],
			["proxy", "/proxy/real"],
			["miss", "/api/miss"],
		]);
		const hit = (await ctx.api(`/logs/${logs[0].id}`)).body;
		expect(hit.request.headers.authorization).toBe("***");
		expect(hit.response).toMatchObject({ bodyEncoding: "json", body: { id: 1 } });
		const proxied = (await ctx.api(`/logs/${logs[1].id}`)).body;
		expect(proxied.status).toBe(201);
		expect(proxied.response.body).toEqual({ real: true, path: "/proxy/real" });
		expect(proxied.response.headers["set-cookie"]).toBe("***");
		const saved = await ctx.api(`/logs/${logs[1].id}/scene`, {
			method: "POST",
			json: { name: "real" },
		});
		expect(saved.status).toBe(201);
		expect(saved.body.scene.content).toEqual({
			status: 201,
			headers: { "content-type": "application/json; charset=utf-8", "x-real": "1" },
			body: { real: true, path: "/proxy/real" },
		});
		const fromMiss = await ctx.api(`/logs/${logs[2].id}/scene`, {
			method: "POST",
			json: { name: "first" },
		});
		expect(fromMiss.body.route.key).toBe("GET /api/miss");
		expect((await ctx.fetch("/api/miss")).status).toBe(200);
		expect((await ctx.api("/logs/99999")).status).toBe(404);
	});

	it("SSE 推送日志事件", async () => {
		const controller = new AbortController();
		const res = await ctx.fetch("/__mock/api/events", { signal: controller.signal });
		expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
		expect(res.headers.get("cache-control")).toMatch(/no-transform/);
		const reader = res.body.getReader();
		let text = "";
		await ctx.fetch("/api/user/1");
		await waitFor(async () => {
			const { value } = await reader.read();
			text += Buffer.from(value).toString();
			return /event: log/.test(text);
		});
		expect(text).toMatch(/retry: 3000/);
		controller.abort();
	});

	it("写操作缺少 x-mock-ui, 跨源, 非 JSON, 错误 Host, 超大请求体都被拒绝", async () => {
		const id = idOf(USER);
		const noHeader = await fetch(`${ctx.base}/__mock/api/routes/${id}/state`, {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: "{}",
		});
		expect(noHeader.status).toBe(403);
		const cross = await ctx.api(`/routes/${id}/state`, {
			method: "PATCH",
			json: {},
			headers: { origin: "http://evil.test" },
		});
		expect(cross.status).toBe(403);
		const sameOrigin = await ctx.api(`/routes/${id}/state`, {
			method: "PATCH",
			json: {},
			headers: { origin: ctx.base },
		});
		expect(sameOrigin.status).toBe(200);
		const text = await ctx.api(`/routes/${id}/state`, {
			method: "PATCH",
			body: "{}",
			headers: { "content-type": "text/plain" },
		});
		expect(text.status).toBe(400);
		expect((await rawGet(ctx.port, "/__mock/api/meta", { host: "evil.test" })).status).toBe(
			403
		);
		expect((await rawGet(ctx.port, "/__mock/api/meta", { host: "localhost:1" })).status).toBe(
			200
		);
		const big = await ctx.api("/groups/big", {
			method: "PUT",
			json: { x: "a".repeat(2.1 * 1024 * 1024) },
		});
		expect(big.status).toBe(413);
		expect(big.body.error.code).toBe("PAYLOAD_TOO_LARGE");
	});

	it("管理页未构建时返回 503 提示, 未知接口 404", async () => {
		const res = await ctx.fetch("/__mock/");
		expect([200, 503]).toContain(res.status);
		expect((await ctx.api("/nope")).body.error.code).toBe("NOT_FOUND");
		const loader = await ctx.fetch("/__mock/float.js");
		expect(await loader.text()).toMatch(/__MOCK_FLOAT__/);
	});
});

describe("访问控制", () => {
	const fake = (ip, host, extra = {}) => ({
		socket: { remoteAddress: ip },
		method: "GET",
		headers: { host, ...extra },
	});

	it("默认只允许回环地址, MOCK_LAN 放行私有网段", () => {
		const local = createGuard({ lan: false, hosts: [] });
		expect(() => local(fake("::ffff:127.0.0.1", "localhost:8888"))).not.toThrow();
		expect(() => local(fake("::1", "[::1]:8888"))).not.toThrow();
		expect(() => local(fake("192.168.1.5", "192.168.1.2:8888"))).toThrow(/MOCK_LAN/);
		const lan = createGuard({ lan: true, hosts: ["dev.local"] });
		expect(() => lan(fake("192.168.1.5", "dev.local:8888"))).not.toThrow();
		expect(() => lan(fake("8.8.8.8", "localhost"))).toThrow(/MOCK_LAN/);
		expect(() => lan(fake("10.0.0.1", "attacker.com"))).toThrow(/Host/);
	});

	it("工具函数", () => {
		expect(hostnameOf("Localhost:80")).toBe("localhost");
		expect(hostnameOf("[::1]:80")).toBe("::1");
		expect(isPrivate("172.20.0.1")).toBe(true);
		expect(isPrivate("172.40.0.1")).toBe(false);
	});
});

describe("空响应体", () => {
	/** @type {Awaited<ReturnType<typeof startHost>>} */
	let ctx;
	const guiOf = dir => JSON.parse(fs.readFileSync(path.join(dir, "mocks/__gui__.json"), "utf8"));

	beforeAll(async () => {
		ctx = await startHost({
			files: { "mocks/a.js": "module.exports = { 'GET /a': 1 };" },
			after: app =>
				app.use((req, res) => {
					if (req.path === "/api/no-content") {
						res.status(204).end();
						return;
					}
					if (req.path === "/api/removed") {
						res.status(200).end();
						return;
					}
					if (req.path === "/api/null") {
						res.json(null);
						return;
					}
					res.status(404).json({ host: true });
				}),
		});
	});

	afterAll(async () => {
		await ctx.close();
	});

	it("响应体为 null 或省略时新建路由成功, 回放 null JSON, 不留诊断", async () => {
		const created = await ctx.api("/routes", {
			method: "POST",
			json: { methods: ["GET"], path: "/api/empty", response: { body: null } },
		});
		expect(created.status).toBe(201);
		expect(created.body.key).toBe("GET /api/empty");
		const res = await ctx.fetch("/api/empty");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toMatch(/json/);
		expect(await res.text()).toBe("null");
		expect(
			(
				await ctx.api("/routes", {
					method: "POST",
					json: { methods: ["POST"], path: "/api/bare" },
				})
			).status
		).toBe(201);
		expect(await (await ctx.fetch("/api/bare", { method: "POST" })).text()).toBe("null");
		expect(guiOf(ctx.dir)).toEqual({ "GET /api/empty": null, "POST /api/bare": null });
		expect((await ctx.api("/meta")).body.diagnostics).toEqual([]);
	});

	it("空响应与 null JSON 响应存为新路由的场景, 回放与原响应一致", async () => {
		await ctx.api("/logs", { method: "DELETE" });
		const fetchLike = { "sec-fetch-dest": "empty" };
		await ctx.fetch("/api/no-content", { method: "DELETE", headers: fetchLike });
		await ctx.fetch("/api/removed", { method: "DELETE", headers: fetchLike });
		await ctx.fetch("/api/null", { headers: fetchLike });
		await waitFor(async () => (await ctx.api("/logs")).body.length === 3);
		const logs = (await ctx.api("/logs")).body;
		const save = async url =>
			ctx.api(`/logs/${logs.find(l => l.url === url).id}/scene`, {
				method: "POST",
				json: { name: "real" },
			});
		const noContent = await save("/api/no-content");
		expect(noContent.status).toBe(201);
		expect(noContent.body.route.key).toBe("DELETE /api/no-content");
		const replay204 = await ctx.fetch("/api/no-content?__scene=real", { method: "DELETE" });
		expect(replay204.status).toBe(204);
		expect(await replay204.text()).toBe("");
		expect((await save("/api/removed")).status).toBe(201);
		const replay200 = await ctx.fetch("/api/removed?__scene=real", { method: "DELETE" });
		expect(replay200.status).toBe(200);
		expect(await replay200.text()).toBe("");
		expect((await save("/api/null")).status).toBe(201);
		const replayNull = await ctx.fetch("/api/null?__scene=real");
		expect(replayNull.headers.get("content-type")).toMatch(/json/);
		expect(await replayNull.text()).toBe("null");
		expect(await (await ctx.fetch("/api/null")).text()).toBe("null");
		expect((await ctx.api("/meta")).body.diagnostics).toEqual([]);
	});

	it("__gui__.json 不是合法 JSON 对象时拒绝写入, 不覆盖手改的内容", async () => {
		const gui = path.join(ctx.dir, "mocks/__gui__.json");
		const before = fs.readFileSync(gui, "utf8");
		for (const broken of ['{ "GET /a": 1, }', "[1]"]) {
			fs.writeFileSync(gui, broken);
			const failed = await ctx.api("/routes", {
				method: "POST",
				json: { methods: ["GET"], path: "/api/guard", response: { body: 1 } },
			});
			expect(failed.status).toBe(409);
			expect(failed.body.error.code).toBe("GUI_FILE_INVALID");
			expect(failed.body.error.message).toMatch(/拒绝写入/);
			expect(fs.readFileSync(gui, "utf8")).toBe(broken);
		}
		fs.writeFileSync(gui, before);
		ctx.mock.mock.registry.reload();
	});

	it("新建的路由未能加载时撤销写入并带出诊断", async () => {
		const gui = path.join(ctx.dir, "mocks/__gui__.json");
		const before = fs.readFileSync(gui, "utf8");
		fs.writeFileSync(gui, JSON.stringify({ ...guiOf(ctx.dir), "BAD KEY": 1 }));
		const broken = fs.readFileSync(gui, "utf8");
		ctx.mock.mock.registry.reload();
		const failed = await ctx.api("/routes", {
			method: "POST",
			json: {
				methods: ["GET"],
				path: "/api/later",
				response: { status: 201, body: { a: 1 } },
			},
		});
		expect(failed.status).toBe(500);
		expect(failed.body.error.code).toBe("LOAD_ERROR");
		expect(failed.body.error.message).toMatch(/已撤销写入[\s\S]*BAD KEY/);
		expect(failed.body.error.details.diagnostics.some(d => d.key === "BAD KEY")).toBe(true);
		expect(fs.readFileSync(gui, "utf8")).toBe(broken);
		const scenes = path.join(ctx.dir, "mocks/__scenes__");
		expect(
			(fs.existsSync(scenes) ? fs.readdirSync(scenes) : []).some(n =>
				n.startsWith("GET_api_later.")
			)
		).toBe(false);
		fs.writeFileSync(gui, before);
		ctx.mock.mock.registry.reload();
		expect(
			(
				await ctx.api("/routes", {
					method: "POST",
					json: {
						methods: ["GET"],
						path: "/api/later",
						response: { status: 201, body: { a: 1 } },
					},
				})
			).status
		).toBe(201);
	});
});
