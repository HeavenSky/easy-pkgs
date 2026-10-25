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
	it("按 shell 规则拆词", () => {
		expect(shellWords(`curl 'a b' "c \\"d\\"" $'e\\nf' g\\ h`)).toEqual(["curl", "a b", 'c "d"', "e\nf", "g h"]);
		expect(() => shellWords("curl 'x")).toThrow(/未闭合/);
	});

	it("解析 Chrome 复制的命令", () => {
		const { definition: d, warnings } = parseCurl(CHROME);
		expect(d.method).toBe("POST");
		expect(d.url).toBe("https://api.example.com/v1/users");
		expect(d.params.query).toEqual([["page", "2", true], ["size", "10", true]]);
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
		expect(parseCurl(`curl -XPUT http://x/a -H 'Content-Type: application/json' -d '{"a":1}'`).definition).toMatchObject({ method: "PUT", body: { type: "json", content: { a: 1 } } });
		expect(parseCurl(`curl http://x/a -d a=1 -d b=2`).definition.body).toEqual({ type: "form", fields: [["a", "1", true], ["b", "2", true]] });
		expect(parseCurl(`curl http://x/a -F f=@_data/a.png -F t=v`).definition.body).toEqual({ type: "multipart", parts: [{ name: "f", file: "_data/a.png", enabled: true }, { name: "t", value: "v", enabled: true }] });
		expect(parseCurl(`curl -u me:pw http://x/a`).definition.auth).toEqual({ type: "basic", username: "me", password: "pw" });
		const g = parseCurl(`curl -G http://x/a -d q=1`).definition;
		expect(g).toMatchObject({ method: "GET", body: { type: "none" }, params: { query: [["q", "1", true]] } });
		expect(() => parseCurl("curl -H 'a: b'")).toThrow(/没有 URL/);
	});

	it("导出后再解析得到相同的请求", () => {
		const { definition } = parseCurl(`curl -X PATCH 'http://x/a?b=1' -H 'x-a: 1' -H 'content-type: application/json' --data-raw '{"k":"it\\'s"}'`.replace("\\'", "'\\''"));
		const again = parseCurl(curlOfTemplate(definition)).definition;
		expect(again).toMatchObject({ method: definition.method, url: definition.url, params: definition.params, body: definition.body });
	});
});

describe("导入导出接口", () => {
	let ctx;
	const api = (url, init) => ctx.api(`/debug${url}`, init);

	beforeAll(async () => {
		ctx = await startHost({ files: { "mocks/a.js": "module.exports = {};" } });
	});
	afterAll(() => ctx.close());

	it("cURL 导入与导出", async () => {
		const res = await api("/import/curl", { method: "POST", json: { text: CHROME, parent: null } });
		expect(res.status).toBe(201);
		expect(res.body.node).toMatchObject({ id: "users", kind: "request", method: "POST" });
		expect(res.body.warnings).toEqual(["未识别的参数, 已忽略: --foo"]);
		const out = (await api("/export/curl", { method: "POST", json: { source: "request:users" } })).body.text;
		expect(out).toMatch(/^curl -X POST 'https:\/\/api\.example\.com\/v1\/users\?page=2&size=10'/);
		expect((await api("/import/curl", { method: "POST", json: { text: "curl" } })).status).toBe(400);
	});

	it("OpenAPI 3.1 YAML 导入: tag 分组, 路径参数, 名字清洗, 示例快照, baseUrl", async () => {
		const res = await api("/import/openapi", { method: "POST", json: { text: OPENAPI_31, parent: null, env: "dev", snapshots: true } });
		expect(res.status).toBe(201);
		expect(res.body.created).toBe(3);
		const tree = (await api("/tree")).body.nodes;
		const group = tree.find(n => n.id === "用户");
		expect(group.children.map(c => c.id).sort()).toEqual(["用户/create-user", "用户/getUser"]);
		const get = group.children.find(c => c.id === "用户/getUser");
		expect(get.snapshots.map(s => s.name).sort()).toEqual(["200-empty", "200-ok", "404"]);
		const def = (await api(`/requests/${enc("用户/getUser")}`)).body;
		expect(def.definition).toMatchObject({ url: "{{baseUrl}}/users/:user_id", params: { path: { user_id: "7" }, query: [["verbose", "false", true]] } });
		expect(def.meta.title).toBe("获取用户");
		expect((await api(`/requests/${enc("用户/create-user")}`)).body.definition.body).toEqual({ type: "json", content: { name: "Bob" } });
		expect(tree.some(n => n.id === "get-ping")).toBe(true);
		expect((await api("/envs")).body.groups.find(g => g.name === "dev").vars.baseUrl).toBe("https://api.example.com");
		const snap = await ctx.fetch(`/__mock/api/debug/snapshots/${enc("用户/getUser#200-ok")}/raw`);
		expect(await snap.json()).toEqual({ id: 7, name: "Alice" });
		// 再导入一次: 同名请求自动加后缀
		await api("/import/openapi", { method: "POST", json: { text: OPENAPI_31, parent: null } });
		expect((await api("/tree")).body.nodes.find(n => n.id === "用户").children.length).toBe(4);
	});

	it("OpenAPI 3.0 JSON 可导入, 2.0 被拒绝", async () => {
		await api("/nodes", { method: "POST", json: { parent: null, kind: "group", name: "v30" } });
		const doc = { openapi: "3.0.3", info: { title: "t", version: "1" }, paths: { "/a": { delete: { responses: {} } } } };
		expect((await api("/import/openapi", { method: "POST", json: { text: JSON.stringify(doc), parent: "v30" } })).body.created).toBe(1);
		expect((await api("/import/openapi", { method: "POST", json: { text: '{"swagger":"2.0"}', parent: null } })).status).toBe(400);
	});

	it("导出分组为 OpenAPI 再导入得到相同的请求集合", async () => {
		const out = (await api("/export/openapi", { method: "POST", json: { node: "用户", format: "yaml" } })).body;
		expect(out.filename).toBe("用户.openapi.yaml");
		expect(out.text).toContain("operationId: getUser");
		expect(out.text).toContain("200-ok");
		await api("/nodes", { method: "POST", json: { parent: null, kind: "group", name: "again" } });
		const back = await api("/import/openapi", { method: "POST", json: { text: out.text, parent: "again", snapshots: true } });
		// 两次导入产生的同方法同路径请求只导出第一个, 并给出警告
		expect(out.warnings.length).toBe(2);
		expect(back.body.created).toBe(2);
		const tree = (await api("/tree")).body.nodes;
		const group = tree.find(n => n.id === "again").children.find(n => n.kind === "group");
		expect(group.children.map(c => c.name).sort()).toEqual(["create-user", "getUser"]);
		expect(group.children.find(c => c.name === "getUser").snapshots.map(s => s.name).sort()).toEqual(["200-empty", "200-ok", "404"]);
		const json = (await api("/export/openapi", { method: "POST", json: { node: null, format: "json" } })).body;
		expect(JSON.parse(json.text).openapi).toBe("3.1.0");
	});
});
