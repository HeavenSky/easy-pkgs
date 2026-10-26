// 调试请求的服务端发送与历史: 变量与敏感值, 解压, 截断, 重定向, 超时, 取消, 代理, 历史拆分与删除, 局域网代发开关
"use strict";
const fs = require("fs");
const http = require("http");
const path = require("path");
const zlib = require("zlib");
const { listen, startHost, waitFor } = require("../helpers/server");
const { loadSrc } = require("../helpers/src");

const { privateAddresses } = loadSrc("lan.ts");
const { createMock } = loadSrc();
const PRIVATE_IP = privateAddresses()[0];
const enc = s => Buffer.from(s).toString("base64url");
const SETTINGS = { timeoutMs: 5000, followRedirects: true, insecureTLS: false, proxy: null };
const def = (url, over = {}) => ({
	method: "GET",
	url,
	params: { path: {}, query: [] },
	headers: [],
	auth: { type: "none" },
	body: { type: "none" },
	settings: SETTINGS,
	route: null,
	...over,
});

const target = () => {
	const server = http.createServer((req, res) => {
		const url = new URL(req.url, "http://x");
		const chunks = [];
		req.on("data", c => chunks.push(c));
		req.on("end", () => {
			const body = Buffer.concat(chunks).toString();
			switch (url.pathname) {
				case "/echo":
					res.setHeader("content-type", "application/json");
					return res.end(
						JSON.stringify({
							method: req.method,
							url: req.url,
							headers: req.headers,
							body,
						})
					);
				case "/gzip":
					res.setHeader("content-type", "text/csv");
					res.setHeader("content-encoding", "gzip");
					return res.end(zlib.gzipSync("a,b\n1,2\n"));
				case "/br":
					res.setHeader("content-type", "application/problem+json");
					res.setHeader("content-encoding", "br");
					return res.end(zlib.brotliCompressSync('{"ok":true}'));
				case "/badgz":
					res.setHeader("content-encoding", "gzip");
					return res.end("not gzip");
				case "/dup":
					res.writeHead(201, [
						["Set-Cookie", "a=1"],
						["Set-Cookie", "b=2"],
						["X-Dup", "1"],
						["X-Dup", "2"],
					]);
					return res.end();
				case "/r302":
					res.writeHead(302, { location: "/echo?from=302" });
					return res.end();
				case "/r303":
					res.writeHead(303, { location: "/echo" });
					return res.end();
				case "/loop":
					res.writeHead(302, { location: "/loop" });
					return res.end();
				case "/slow":
					return; // 不响应
				case "/big": {
					res.setHeader("content-type", "application/octet-stream");
					const block = Buffer.alloc(1024 * 1024, 1);
					let left = 51;
					const pump = () => {
						while (left > 0) {
							left--;
							if (!res.write(block)) return res.once("drain", pump);
						}
						res.end();
					};
					return pump();
				}
				default:
					res.statusCode = 404;
					return res.end("nope");
			}
		});
	});
	return server;
};

describe("调试请求发送与历史", () => {
	let ctx;
	let up;
	let upUrl;
	let proxy;
	let proxied = 0;
	const api = (url, init) => ctx.api(`/debug${url}`, init);
	const send = (definition, extra = {}) =>
		api("/send", { method: "POST", json: { request: null, definition, ...extra } });
	const raw = async id => {
		const res = await ctx.fetch(`/__mock/api/debug/history/${enc(id)}/raw`);
		return { res, buf: Buffer.from(await res.arrayBuffer()) };
	};
	const post = (url, body) => send(def(url, { method: "POST", body }));
	/** 回显服务收到的请求(历史中的原始响应体) */
	const echoOf = async id => JSON.parse((await raw(id)).buf.toString());

	beforeAll(async () => {
		up = target();
		upUrl = `http://127.0.0.1:${await listen(up)}`;
		proxy = http.createServer((req, res) => {
			proxied++;
			const u = new URL(req.url);
			const fwd = http.request(
				{
					host: u.hostname,
					port: u.port,
					path: u.pathname + u.search,
					method: req.method,
					headers: {
						...req.headers,
						"x-via-proxy": req.headers["proxy-authorization"] || "1",
					},
				},
				r => {
					res.writeHead(r.statusCode, r.headers);
					r.pipe(res);
				}
			);
			req.pipe(fwd);
		});
		await listen(proxy);
		ctx = await startHost({
			files: { "mocks/a.js": "module.exports = {};", "mocks/_data/up.txt": "file-body" },
		});
		await api("/envs/dev", {
			method: "PUT",
			json: { vars: { base: upUrl, token: "<secret:tk>" } },
		});
		await api("/envs/dev/secrets/tk", {
			method: "PUT",
			json: { from: "value", value: "s3cret-token" },
		});
		await api("/active-env", { method: "PUT", json: { name: "dev" } });
	});
	afterAll(async () => {
		await ctx.close();
		up.closeAllConnections();
		up.close();
		proxy.close();
	});

	it("替换变量与敏感值, 记录实际请求与模板, 未解析变量被拒", async () => {
		const res = await send(
			def("{{base}}/echo", {
				method: "POST",
				auth: { type: "bearer", token: "{{token}}" },
				body: { type: "json", content: { a: "{{base}}" } },
			})
		);
		expect(res.status).toBe(200);
		const { meta, id } = res.body;
		expect(meta.response.status).toBe(200);
		expect(meta.request.url).toBe(`${upUrl}/echo`);
		// 历史中敏感值回填为占位符
		expect(meta.request.headers).toContainEqual(["authorization", "Bearer <secret:tk>"]);
		expect(meta.request.body).toEqual({ type: "text", text: JSON.stringify({ a: upUrl }) });
		expect(meta.template.values.token).toEqual({ value: "<secret:tk>", from: "secret:tk" });
		expect(meta.template.request.url).toBe("{{base}}/echo");
		expect(meta.reqHash).toMatch(/^sha256:[0-9a-f]{64}$/);
		const echoed = await echoOf(id);
		expect(echoed.headers["content-type"]).toBe("application/json");
		expect(echoed.body).toBe(JSON.stringify({ a: upUrl }));
		const bad = await send(def("{{base}}/echo?x={{nope}}"));
		expect(bad.status).toBe(400);
		expect(bad.body.error).toMatchObject({
			code: "UNRESOLVED_VARS",
			details: { vars: ["nope"] },
		});
	});

	it("解压 gzip 与 br, 解压失败时保存原始字节, 重复响应头保留", async () => {
		const gz = (await send(def("{{base}}/gzip"))).body;
		expect(gz.meta.response.body).toMatchObject({
			file: "raw.csv",
			contentType: "text/csv",
			originalEncoding: "gzip",
			decoded: true,
			size: 8,
		});
		expect((await raw(gz.id)).buf.toString()).toBe("a,b\n1,2\n");
		expect((await raw(gz.id)).res.headers.get("content-security-policy")).toBe("sandbox");
		const br = (await send(def("{{base}}/br"))).body;
		expect(br.meta.response.body).toMatchObject({ file: "raw.json", decoded: true });
		const bad = (await send(def("{{base}}/badgz"))).body;
		expect(bad.meta.response.body).toMatchObject({ decoded: false, file: "raw.bin" });
		expect((await raw(bad.id)).buf.toString()).toBe("not gzip");
		const dup = (await send(def("{{base}}/dup"))).body;
		expect(dup.meta.response.status).toBe(201);
		expect(dup.meta.response.headers.filter(([k]) => k === "set-cookie")).toEqual([
			["set-cookie", "a=1"],
			["set-cookie", "b=2"],
		]);
		expect(dup.meta.response.headers.filter(([k]) => k === "x-dup").length).toBe(2);
		expect(dup.meta.response.body.file).toBeNull();
	});

	it("跟随重定向, 303 转 GET, 次数上限, 可关闭跟随", async () => {
		const r = (await send(def("{{base}}/r302"))).body;
		expect(r.meta.response.redirects).toEqual([
			{ status: 302, location: `${upUrl}/echo?from=302` },
		]);
		const p = (await post("{{base}}/r303", { type: "text", content: "x" })).body;
		expect(await echoOf(p.id)).toMatchObject({ method: "GET", body: "" });
		const loop = (await send(def("{{base}}/loop"))).body;
		expect(loop.meta.error.code).toBe("TOO_MANY_REDIRECTS");
		const noFollow = { settings: { ...SETTINGS, followRedirects: false } };
		const off = (await send(def("{{base}}/r302", noFollow))).body;
		expect(off.meta.response.status).toBe(302);
	});

	// 连接拒绝(ECONNREFUSED)见 debug-snapshot 的草稿用例
	it("超时与客户端取消都写入带 error 的历史", async () => {
		const fast = { settings: { ...SETTINGS, timeoutMs: 200 } };
		const slow = (await send(def("{{base}}/slow", fast))).body;
		expect(slow.meta.error.code).toBe("TIMEOUT");
		expect(slow.meta.response).toBeNull();
		const ac = new AbortController();
		const pending = ctx.fetch("/__mock/api/debug/send", {
			method: "POST",
			signal: ac.signal,
			headers: { "x-mock-ui": "1", "content-type": "application/json" },
			body: JSON.stringify({ request: null, definition: def("{{base}}/slow") }),
		});
		setTimeout(() => ac.abort(), 200);
		await expect(pending).rejects.toThrow();
		await waitFor(
			async () => (await api("/history?limit=1")).body.items[0]?.error === "ABORTED"
		);
	});

	it("请求体: 表单, multipart 文件, 文件越界被拒", async () => {
		const fields = [
			["a", "1", true],
			["b", "2", false],
		];
		const form = (await post("{{base}}/echo", { type: "form", fields })).body;
		expect(await echoOf(form.id)).toMatchObject({
			body: "a=1",
			headers: { "content-type": "application/x-www-form-urlencoded" },
		});
		const parts = [
			{ name: "f", file: "_data/up.txt" },
			{ name: "t", value: "v" },
		];
		const mp = (await post("{{base}}/echo", { type: "multipart", parts })).body;
		const echoed = await echoOf(mp.id);
		expect(echoed.headers["content-type"]).toMatch(/^multipart\/form-data; boundary=/);
		expect(echoed.body).toContain('filename="up.txt"');
		expect(echoed.body).toContain("file-body");
		const out = await post("{{base}}/echo", { type: "binary", file: "../../etc/passwd" });
		expect(out.status).toBe(400);
	});

	it("HTTP 代理与 Basic 认证", async () => {
		const before = proxied;
		const via = `http://u:p@127.0.0.1:${proxy.address().port}`;
		const r = (await send(def("{{base}}/echo", { settings: { ...SETTINGS, proxy: via } })))
			.body;
		expect(proxied).toBe(before + 1);
		expect((await echoOf(r.id)).headers["x-via-proxy"]).toBe(
			`Basic ${Buffer.from("u:p").toString("base64")}`
		);
	});

	it("超过 50MB 截断; 历史分页, 当天超过 50MB 后按小时存放, 按天删除", async () => {
		const slowBig = { settings: { ...SETTINGS, timeoutMs: 30000 } };
		const big = (await send(def("{{base}}/big", slowBig))).body;
		expect(big.meta.response.body).toMatchObject({ truncated: true, size: 50 * 1024 * 1024 });
		const all = (await api("/history?limit=2")).body;
		expect(all.items.length).toBe(2);
		expect(all.next).toBe(all.items[1].id);
		const next = (await api(`/history?limit=2&cursor=${encodeURIComponent(all.next)}`)).body;
		expect(next.items[0].id).not.toBe(all.items[1].id);
		expect(all.totalBytes).toBeGreaterThan(50 * 1024 * 1024);
		const hist = path.join(ctx.dir, "mocks", "__debug__", "history");
		const day = fs.readdirSync(hist).find(n => /^\d{8}$/.test(n));
		const r = (await send(def("{{base}}/echo"))).body;
		expect(r.id.split("/").length).toBe(3); // 当天已超过 50MB(上面的截断), 新条目在小时目录下
		expect(fs.existsSync(path.join(hist, ...r.id.split("/"), "__meta__.json"))).toBe(true);
		const days = (await api("/history-days")).body;
		expect(days[0]).toMatchObject({ day });
		const meta = (await ctx.api("/meta")).body;
		expect(meta.debug.historyBytes).toBeGreaterThan(0);
		expect((await api(`/history-days/${day}`, { method: "DELETE" })).status).toBe(204);
		expect((await api("/history")).body.items).toEqual([]);
		expect((await ctx.api("/meta")).body.debug.historyBytes).toBe(0);
	}, 30000);

	(PRIVATE_IP ? it : it.skip)("局域网设备在代发开关关闭时不能发送", async () => {
		const mock = createMock({
			cwd: ctx.dir,
			folder: "mocks",
			stateFile: "state.json",
			lan: true,
			watch: false,
		});
		const server = http.createServer(mock);
		await new Promise(resolve => server.listen(0, PRIVATE_IP, resolve));
		const base = `http://${PRIVATE_IP}:${server.address().port}/__mock/api`;
		const post = () =>
			fetch(`${base}/debug/send`, {
				method: "POST",
				headers: { "x-mock-ui": "1", "content-type": "application/json" },
				body: JSON.stringify({
					request: null,
					definition: def(`${upUrl}/echo`),
					env: null,
				}),
			});
		try {
			expect((await post()).status).toBe(403);
			mock.mock.lan.set({ send: true });
			expect((await post()).status).toBe(200);
		} finally {
			await mock.close();
			server.closeAllConnections();
			await new Promise(resolve => server.close(resolve));
		}
	});

	it("局域网代发开关依赖访问开关", async () => {
		expect((await ctx.api("/lan", { method: "PUT", json: { send: true } })).status).toBe(400);
		expect(
			(await ctx.api("/lan", { method: "PUT", json: { access: true, send: true } })).body
		).toMatchObject({ access: true, send: true });
		expect(
			(await ctx.api("/lan", { method: "PUT", json: { access: false } })).body
		).toMatchObject({ access: false, send: false });
	});
});

describe("Cookie jar", () => {
	let ctx;
	let up;
	let base;
	const api = (url, init) => ctx.api(`/debug${url}`, init);
	const send = async (p, settings = {}, headers = []) => {
		const definition = def(`{{base}}${p}`, { headers, settings: { ...SETTINGS, ...settings } });
		const r = (await api("/send", { method: "POST", json: { request: null, definition } }))
			.body;
		const raw = await ctx.fetch(`/__mock/api/debug/history/${enc(r.id)}/raw`);
		return { meta: r.meta, body: raw.status === 200 ? await raw.json() : null };
	};

	beforeAll(async () => {
		up = http.createServer((req, res) => {
			const p = new URL(req.url, "http://x").pathname;
			if (p === "/login") {
				res.writeHead(200, [
					["set-cookie", "sid=1; Path=/"],
					["set-cookie", "p=2; Path=/admin"],
					["set-cookie", "s=3; Secure"],
					["set-cookie", "old=1; Expires=Thu, 01 Jan 1970 00:00:00 GMT"],
					["set-cookie", "evil=1; Domain=example.com"],
				]);
				return res.end();
			}
			if (p === "/logout") {
				res.writeHead(200, [["set-cookie", "sid=; Path=/; Max-Age=0"]]);
				return res.end();
			}
			if (p === "/redir") {
				res.writeHead(302, [
					["set-cookie", "r=1; Path=/"],
					["location", "/check"],
				]);
				return res.end();
			}
			res.setHeader("content-type", "application/json");
			res.end(JSON.stringify({ cookie: req.headers.cookie || null }));
		});
		base = `http://127.0.0.1:${await listen(up)}`;
		ctx = await startHost({ files: { "mocks/a.js": "module.exports = {};" } });
		await api("/envs/dev", { method: "PUT", json: { vars: { base } } });
		await api("/active-env", { method: "PUT", json: { name: "dev" } });
	});
	afterAll(async () => {
		await ctx.close();
		up.close();
	});

	it("保存并按路径, Secure 与域名匹配携带; 列表不含值", async () => {
		await send("/login");
		expect((await send("/check")).body.cookie).toBe("sid=1");
		expect((await send("/admin/check")).body.cookie).toBe("p=2; sid=1");
		const list = (await api("/envs/dev/cookies")).body;
		expect(list.map(c => c.name).sort()).toEqual(["p", "s", "sid"]);
		expect(JSON.stringify(list)).not.toContain('"value"');
	});

	it("重定向中途设置的 cookie 被后续跳使用; Max-Age=0 删除", async () => {
		expect((await send("/redir")).body.cookie).toBe("sid=1; r=1");
		await send("/logout");
		expect((await send("/check")).body.cookie).toBe("r=1");
	});

	it("skipCookieJar 时不读不写; 手写同名 cookie 优先", async () => {
		expect((await send("/check", { skipCookieJar: true })).body.cookie).toBeNull();
		expect((await send("/check", {}, [["cookie", "r=manual", true]])).body.cookie).toBe(
			"r=manual"
		);
	});

	it("清除单个或全部, 环境组改名时 cookie 跟着走", async () => {
		await send("/login");
		await api("/envs/dev/cookies", { method: "DELETE", json: { name: "sid" } });
		expect((await send("/check")).body.cookie).toBe("r=1");
		await api("/envs/dev", { method: "PATCH", json: { name: "dev2" } });
		expect((await api("/envs/dev2/cookies")).body.length).toBeGreaterThan(0);
		await api("/envs/dev2/cookies", { method: "DELETE" });
		expect((await api("/envs/dev2/cookies")).body).toEqual([]);
	});
});
