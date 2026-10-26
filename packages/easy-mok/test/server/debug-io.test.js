// 导入导出: cURL 词法与参数映射, 导出往返; OpenAPI 3.0 / 3.1 导入, tag 分组, 名字清洗, 示例生成快照, 导出往返
"use strict";
const { startHost } = require("../helpers/server");
const { loadSrc } = require("../helpers/src");

const { shellWords, parseCurl, curlOfTemplate } = loadSrc("debug/curl.ts");
const enc = s => Buffer.from(s).toString("base64url");

const CHROME = `curl 'https://api.example.com/v1/users?page=2&size=10' \\
  -H 'accept: application/json' \\
  -H $'x-note: it\\'s' \\
  -H "authorization: Bearer abc" \\
  -b 'sid=1; theme=dark' \\
  --data-raw '{"name":"张三"}' \\
  --compressed -k --foo`;

const OPENAPI_31 = `openapi: 3.1.0
info: { title: demo, version: "1" }
servers:
  - url: https://api.example.com/
paths:
  /users/{user-id}:
    parameters:
      - { name: user-id, in: path, required: true, schema: { type: string, example: "7" } }
    get:
      operationId: getUser
      summary: 获取用户
      tags: [用户]
      parameters:
        - { name: verbose, in: query, schema: { type: boolean, default: false } }
      responses:
        "200":
          content:
            application/json:
              examples:
                ok: { value: { id: 7, name: Alice } }
                empty: { value: null }
        "404":
          content:
            application/json:
              example: { message: not found }
  /users:
    post:
      operationId: "create user!"
      tags: [用户]
      requestBody:
        content:
          application/json:
            schema: { $ref: "#/components/schemas/User" }
      responses: { "201": { description: created } }
  /ping:
    get:
      responses: { "200": { content: { text/plain: { example: pong } } } }
components:
  schemas:
    User: { type: object, example: { name: Bob } }
`;

describe("cURL", () => {
	it("按 shell 规则拆词; 引号未闭合或没有 URL 时报错", () => {
		expect(shellWords(`curl 'a b' "c \\"d\\"" $'e\\nf' g\\ h`)).toEqual([
			"curl",
			"a b",
			'c "d"',
			"e\nf",
			"g h",
		]);
		expect(() => shellWords("curl 'x")).toThrow(/未闭合/);
		expect(() => parseCurl("curl -H 'a: b'")).toThrow(/没有 URL/);
	});

	it("解析 Chrome 复制的命令", () => {
		const { definition: d, warnings } = parseCurl(CHROME);
		expect(d.method).toBe("POST");
		expect(d.url).toBe("https://api.example.com/v1/users");
		expect(d.params.query).toEqual([
			["page", "2", true],
			["size", "10", true],
		]);
		expect(d.headers).toEqual([
			["accept", "application/json", true],
			["x-note", "it's", true],
			["authorization", "Bearer abc", true],
			["cookie", "sid=1; theme=dark", true],
			["accept-encoding", "gzip, deflate, br", true],
		]);
		expect(d.body).toEqual({ type: "form", fields: [['{"name":"张三"}', "", true]] });
		expect(d.settings.insecureTLS).toBe(true);
		expect(warnings).toEqual(["未识别的参数, 已忽略: --foo"]);
	});

	it("JSON 体, 表单, multipart, Basic 认证与 -G", () => {
		expect(
			parseCurl(`curl -XPUT http://x/a -H 'Content-Type: application/json' -d '{"a":1}'`)
				.definition
		).toMatchObject({ method: "PUT", body: { type: "json", content: { a: 1 } } });
		expect(parseCurl(`curl http://x/a -d a=1 -d b=2`).definition.body).toEqual({
			type: "form",
			fields: [
				["a", "1", true],
				["b", "2", true],
			],
		});
		expect(parseCurl(`curl http://x/a -F f=@_data/a.png -F t=v`).definition.body).toEqual({
			type: "multipart",
			parts: [
				{ name: "f", file: "_data/a.png", enabled: true },
				{ name: "t", value: "v", enabled: true },
			],
		});
		expect(parseCurl(`curl -u me:pw http://x/a`).definition.auth).toEqual({
			type: "basic",
			username: "me",
			password: "pw",
		});
		const g = parseCurl(`curl -G http://x/a -d q=1`).definition;
		expect(g).toMatchObject({
			method: "GET",
			body: { type: "none" },
			params: { query: [["q", "1", true]] },
		});
	});

	it("导出后再解析得到相同的请求", () => {
		const { definition } = parseCurl(
			`curl -X PATCH 'http://x/a?b=1' -H 'x-a: 1' -H 'content-type: application/json' --data-raw '{"k":"it\\'s"}'`.replace(
				"\\'",
				"'\\''"
			)
		);
		const again = parseCurl(curlOfTemplate(definition)).definition;
		expect(again).toMatchObject({
			method: definition.method,
			url: definition.url,
			params: definition.params,
			body: definition.body,
		});
	});
});

// 导入导出与日志转调试请求共用一个宿主: 日志转出的请求放在根下(user, bin), 不影响分组导出
describe("导入导出接口与日志转调试请求", () => {
	let ctx;
	const api = (url, init) => ctx.api(`/debug${url}`, init);
	const post = (url, json) => api(url, { method: "POST", json });
	const group = name => post("/nodes", { parent: null, kind: "group", name });
	const snapNames = node => node.snapshots.map(s => s.name).sort();

	beforeAll(async () => {
		ctx = await startHost({
			files: {
				"mocks/a.js":
					"module.exports = { 'POST /api/user': (req, res) => res.json({ ok: true }) };",
			},
		});
	});
	afterAll(() => ctx.close());

	it("cURL 导入与导出", async () => {
		const res = await post("/import/curl", { text: CHROME, parent: null });
		expect(res.status).toBe(201);
		expect(res.body.node).toMatchObject({ id: "users", kind: "request", method: "POST" });
		expect(res.body.warnings).toEqual(["未识别的参数, 已忽略: --foo"]);
		const out = (await post("/export/curl", { source: "request:users" })).body.text;
		expect(out).toMatch(
			/^curl -X POST 'https:\/\/api\.example\.com\/v1\/users\?page=2&size=10'/
		);
		expect((await post("/import/curl", { text: "curl" })).status).toBe(400);
	});

	it("OpenAPI 3.1 YAML 导入: tag 分组, 路径参数, 名字清洗, 示例快照, baseUrl", async () => {
		const res = await post("/import/openapi", {
			text: OPENAPI_31,
			parent: null,
			env: "dev",
			snapshots: true,
		});
		expect(res.status).toBe(201);
		expect(res.body.created).toBe(3);
		const tree = (await api("/tree")).body.nodes;
		const user = tree.find(n => n.id === "用户");
		expect(user.children.map(c => c.id).sort()).toEqual(["用户/create-user", "用户/getUser"]);
		expect(snapNames(user.children.find(c => c.id === "用户/getUser"))).toEqual([
			"200-empty",
			"200-ok",
			"404",
		]);
		const def = (await api(`/requests/${enc("用户/getUser")}`)).body;
		expect(def.definition).toMatchObject({
			url: "{{baseUrl}}/users/:user_id",
			params: { path: { user_id: "7" }, query: [["verbose", "false", true]] },
		});
		expect(def.meta.title).toBe("获取用户");
		expect((await api(`/requests/${enc("用户/create-user")}`)).body.definition.body).toEqual({
			type: "json",
			content: { name: "Bob" },
		});
		expect(tree.some(n => n.id === "get-ping")).toBe(true);
		expect((await api("/envs")).body.groups.find(g => g.name === "dev").vars.baseUrl).toBe(
			"https://api.example.com"
		);
		const snap = await ctx.fetch(
			`/__mock/api/debug/snapshots/${enc("用户/getUser#200-ok")}/raw`
		);
		expect(await snap.json()).toEqual({ id: 7, name: "Alice" });
		// 再导入一次: 同名请求自动加后缀
		await post("/import/openapi", { text: OPENAPI_31, parent: null });
		expect((await api("/tree")).body.nodes.find(n => n.id === "用户").children.length).toBe(4);
	});

	it("OpenAPI 3.0 JSON 可导入, 2.0 被拒绝", async () => {
		await group("v30");
		const doc = {
			openapi: "3.0.3",
			info: { title: "t", version: "1" },
			paths: { "/a": { delete: { responses: {} } } },
		};
		const v30 = await post("/import/openapi", { text: JSON.stringify(doc), parent: "v30" });
		expect(v30.body.created).toBe(1);
		const v20 = await post("/import/openapi", { text: '{"swagger":"2.0"}', parent: null });
		expect(v20.status).toBe(400);
	});

	it("导出分组为 OpenAPI 再导入得到相同的请求集合", async () => {
		const out = (await post("/export/openapi", { node: "用户", format: "yaml" })).body;
		expect(out.filename).toBe("用户.openapi.yaml");
		expect(out.text).toContain("operationId: getUser");
		expect(out.text).toContain("200-ok");
		await group("again");
		const back = await post("/import/openapi", {
			text: out.text,
			parent: "again",
			snapshots: true,
		});
		// 两次导入产生的同方法同路径请求只导出第一个, 并给出警告
		expect(out.warnings.length).toBe(2);
		expect(back.body.created).toBe(2);
		const tree = (await api("/tree")).body.nodes;
		const imported = tree.find(n => n.id === "again").children.find(n => n.kind === "group");
		expect(imported.children.map(c => c.name).sort()).toEqual(["create-user", "getUser"]);
		expect(snapNames(imported.children.find(c => c.name === "getUser"))).toEqual([
			"200-empty",
			"200-ok",
			"404",
		]);
		const json = (await post("/export/openapi", { node: null, format: "json" })).body;
		expect(JSON.parse(json.text).openapi).toBe("3.1.0");
	});

	/** 发一次 POST /api/user, 把产生的日志转成调试请求 */
	const fromLog = async (url, init, json) => {
		await ctx.fetch(url, { method: "POST", ...init });
		const logs = (await ctx.api("/logs")).body;
		return ctx.api(`/logs/${logs[logs.length - 1].id}/debug-request`, { method: "POST", json });
	};

	it("日志转调试请求: JSON 体与查询参数带入, 脱敏的头丢弃并提示", async () => {
		const res = await fromLog(
			"/api/user?x=1",
			{
				headers: {
					"content-type": "application/json",
					authorization: "Bearer s3",
					"x-a": "1",
				},
				body: JSON.stringify({ name: "a" }),
			},
			{ parent: null }
		);
		expect(res.status).toBe(201);
		expect(res.body.node).toMatchObject({
			id: "user",
			method: "POST",
			url: "{{baseUrl}}/api/user",
		});
		expect(res.body.warnings).toEqual([
			"请求头 authorization 在日志中已脱敏, 未带入, 请在请求或环境组中补上",
		]);
		const def = (await api(`/requests/${enc("user")}`)).body.definition;
		expect(def.params.query).toEqual([["x", "1", true]]);
		expect(def.body).toEqual({ type: "json", content: { name: "a" } });
		expect(
			def.headers.some(
				h => h[0] === "authorization" || h[0] === "host" || h[0] === "content-type"
			)
		).toBe(false);
		expect(def.headers).toContainEqual(["x-a", "1", true]);
	});

	it("日志转调试请求: 二进制请求体不带入并提示, 日志不存在时 404", async () => {
		const res = await fromLog(
			"/api/user",
			{
				headers: { "content-type": "application/octet-stream" },
				body: Buffer.from([0, 1, 2, 255]),
			},
			{ parent: null, name: "bin" }
		);
		expect(res.body.warnings).toContain("二进制请求体未带入");
		expect((await api(`/requests/${enc("bin")}`)).body.definition.body).toEqual({
			type: "none",
		});
		expect(
			(await ctx.api("/logs/nope/debug-request", { method: "POST", json: {} })).status
		).toBe(404);
	});
});
