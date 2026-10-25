// 调试数据的隔离与脱敏: 自忽略的 .gitignore, 敏感值回填, 敏感头, 字段规则, keychain / command / prompt 来源
"use strict";
const fs = require("fs");
const http = require("http");
const path = require("path");
const { listen, startHost } = require("../helpers/server");
const { loadSrc } = require("../helpers/src");

const { secretHitsOf, replaceSecrets, redactRequest, redactFields, redactJsonText } = loadSrc("debug/redact.ts");
const enc = s => Buffer.from(s).toString("base64url");

describe("脱敏函数", () => {
	it("只回填足够长的敏感值, 长的先替换", () => {
		const hits = secretHitsOf({
			a: { value: "abc", from: "secret:short" },
			b: { value: "token-123456", from: "secret:tk" },
			c: { value: "token-123456-long", from: "secret:long" },
			d: { value: "plain-value", from: "env:dev" },
		});
		expect(hits.map(h => h.id)).toEqual(["long", "tk"]);
		expect(replaceSecrets("x token-123456-long y token-123456", hits)).toBe("x <secret:long> y <secret:tk>");
	});

	it("敏感请求头没有占位符时写成 ***", () => {
		const hits = [{ id: "tk", value: "token-123456" }];
		const out = redactRequest(
			{ url: "http://x/?k=token-123456", headers: [["authorization", "Bearer token-123456"], ["cookie", "sid=1"], ["x-a", "1"]], body: { type: "text", text: "t=token-123456" } },
			hits
		);
		expect(out.url).toBe("http://x/?k=<secret:tk>");
		expect(out.headers).toEqual([["authorization", "Bearer <secret:tk>"], ["cookie", "***"], ["x-a", "1"]]);
		expect(out.body.text).toBe("t=<secret:tk>");
	});

	it("字段规则: 任意层级的同名 key 与 $. 路径(* 通配)", () => {
		const v = { token: "t", data: { list: [{ phone: "1", name: "a" }], phone: "2", user: { Password: "p" } } };
		const out = redactFields(v, ["token", "password", "$.data.list.*.phone"]);
		expect(out.count).toBe(3);
		expect(out.value).toEqual({ token: "***", data: { list: [{ phone: "***", name: "a" }], phone: "2", user: { Password: "***" } } });
		expect(redactJsonText('{"a":1}', ["token"])).toEqual({ text: '{"a":1}', count: 0 });
		expect(redactJsonText("not json", ["token"]).count).toBe(0);
	});
});

describe("隔离, 字段规则与敏感值来源", () => {
	let ctx;
	let up;
	let upUrl;
	let debugDir;
	const api = (url, init) => ctx.api(`/debug${url}`, init);
	const def = (p, over = {}) => ({
		method: "GET",
		url: `${upUrl}${p}`,
		params: { path: {}, query: [] },
		headers: [],
		auth: { type: "bearer", token: "{{token}}" },
		body: { type: "none" },
		settings: { timeoutMs: 5000, followRedirects: true, insecureTLS: false, proxy: null },
		route: null,
		...over,
	});
	const send = (p, over) => api("/send", { method: "POST", json: { request: "r", definition: def(p, over) } });

	beforeAll(async () => {
		up = http.createServer((req, res) => {
			res.writeHead(200, [["content-type", "application/json"], ["set-cookie", "sid=abc"]]);
			res.end(JSON.stringify({ auth: req.headers.authorization || null, token: "server-token", data: [{ phone: "13800000000", name: "a" }] }, null, 2));
		});
		upUrl = `http://127.0.0.1:${await listen(up)}`;
		ctx = await startHost({ files: { "mocks/a.js": "module.exports = {};" } });
		debugDir = path.join(ctx.dir, "mocks", "__debug__");
		await api("/nodes", { method: "POST", json: { parent: null, kind: "request", name: "r" } });
		await api("/envs/dev", { method: "PUT", json: { vars: { token: "<secret:tk>" } } });
		await api("/active-env", { method: "PUT", json: { name: "dev" } });
	});
	afterAll(async () => {
		await ctx.close();
		up.close();
	});

	it("secret 与 history 目录写入自忽略的 .gitignore", async () => {
		await api("/envs/dev/secrets/tk", { method: "PUT", json: { from: "value", value: "value-secret-1" } });
		expect(fs.readFileSync(path.join(debugDir, "environments", "secret", ".gitignore"), "utf8")).toBe("*\n");
		const sent = (await send("/a")).body;
		expect(fs.readFileSync(path.join(debugDir, "history", ".gitignore"), "utf8")).toBe("*\n");
		const text = fs.readFileSync(path.join(debugDir, "history", ...sent.id.split("/"), "__meta__.json"), "utf8");
		expect(text).not.toContain("value-secret-1");
		expect(sent.meta.request.headers).toContainEqual(["authorization", "Bearer <secret:tk>"]);
		// 历史保留真实的 set-cookie, 快照默认脱敏
		expect(sent.meta.response.headers).toContainEqual(["set-cookie", "sid=abc"]);
		expect(fs.existsSync(path.join(debugDir, "requests", ".gitignore"))).toBe(false);
	});

	it("另存快照: 默认规则脱敏凭据字段, 自定义路径规则, set-cookie 默认脱敏", async () => {
		expect((await api("/redact")).body).toMatchObject({ custom: false, fields: expect.arrayContaining(["token", "password"]) });
		const sent = (await send("/b")).body;
		const res = await api(`/history/${enc(sent.id)}/snapshot`, { method: "POST", json: { request: "r", name: "s1" } });
		expect(res.body.redaction).toEqual({ fields: 1, setCookie: "masked", binaryRequest: false });
		const raw = await (await ctx.fetch(`/__mock/api/debug/snapshots/${enc("r#s1")}/raw`)).json();
		expect(raw.token).toBe("***");
		expect(raw.data[0].phone).toBe("13800000000");
		const histRaw = await (await ctx.fetch(`/__mock/api/debug/history/${enc(sent.id)}/raw`)).json();
		expect(histRaw.token).toBe("server-token"); // 历史保留原文
		expect((await api("/redact", { method: "PUT", json: { fields: ["$.bad..x"] } })).status).toBe(400);
		expect((await api("/redact", { method: "PUT", json: { fields: ["token", "$.data.*.phone"] } })).body.custom).toBe(true);
		const res2 = await api(`/history/${enc(sent.id)}/snapshot`, { method: "POST", json: { request: "r", name: "s2", keepSetCookie: true } });
		expect(res2.body.redaction).toEqual({ fields: 2, setCookie: "kept", binaryRequest: false });
		const meta = (await api(`/snapshots/${enc("r#s2")}`)).body.meta;
		expect(meta.response.headers).toContainEqual(["set-cookie", "sid=abc"]);
		expect(meta.replay).toEqual({ setCookie: true });
		expect(meta.response.body.redacted).toBe(true);
		expect(JSON.parse(fs.readFileSync(path.join(debugDir, "redact.json"), "utf8")).fields).toEqual(["token", "$.data.*.phone"]);
	});

	it("command 来源: 取值后回填占位符, 失败时报 SECRET_UNAVAILABLE", async () => {
		await api("/envs/dev/secrets/tk", { method: "PUT", json: { from: "command", argv: [process.execPath, "-e", "process.stdout.write('cmd-secret-12')"] } });
		const sent = (await send("/c")).body;
		const echoed = await (await ctx.fetch(`/__mock/api/debug/history/${enc(sent.id)}/raw`)).json();
		expect(echoed.auth).toBe("Bearer cmd-secret-12");
		expect(JSON.stringify(sent.meta)).not.toContain("cmd-secret-12");
		await api("/envs/dev/secrets/tk", { method: "PUT", json: { from: "command", argv: [process.execPath, "-e", "process.exit(3)"] } });
		const bad = await send("/c");
		expect(bad.status).toBe(400);
		expect(bad.body.error).toMatchObject({ code: "SECRET_UNAVAILABLE", details: { srcId: "tk" } });
		expect((await api("/envs/dev/secrets/tk", { method: "PUT", json: { from: "command", argv: [] } })).status).toBe(400);
	});

	it("keychain 来源取不到时报 SECRET_UNAVAILABLE", async () => {
		await api("/envs/dev/secrets/tk", { method: "PUT", json: { from: "keychain", service: "easy-mok-test-missing", account: "nobody" } });
		expect((await api("/envs/dev/secrets")).body).toContainEqual({ id: "tk", from: "keychain", configured: true, service: "easy-mok-test-missing", account: "nobody" });
		const res = await send("/k");
		expect(res.status).toBe(400);
		expect(res.body.error.code).toBe("SECRET_UNAVAILABLE");
	});

	it("prompt 来源: 未输入时提示输入, 输入后只保存在内存", async () => {
		await api("/envs/dev/secrets/tk", { method: "PUT", json: { from: "prompt" } });
		const first = await send("/p");
		expect(first.body.error).toMatchObject({ code: "SECRET_UNAVAILABLE", details: { srcId: "tk", prompt: true } });
		expect((await api("/envs/dev/secrets/tk/value", { method: "PUT", json: { value: "typed-secret-1" } })).status).toBe(204);
		expect((await api("/envs/dev/secrets")).body).toContainEqual({ id: "tk", from: "prompt", configured: true, entered: true });
		const sent = (await send("/p")).body;
		const echoed = await (await ctx.fetch(`/__mock/api/debug/history/${enc(sent.id)}/raw`)).json();
		expect(echoed.auth).toBe("Bearer typed-secret-1");
		const file = fs.readFileSync(path.join(debugDir, "environments", "secret", "dev.json"), "utf8");
		expect(file).not.toContain("typed-secret-1");
	});
});
