// 场景引用快照: 校验, 回放与覆盖, set-cookie 回放开关, 失效降级与诊断, 拷贝, 反向索引, 改名移动改写, 删除确认, 路由推荐
"use strict";
const fs = require("fs");
const http = require("http");
const path = require("path");
const { listen, startHost } = require("../helpers/server");

const enc = s => Buffer.from(s).toString("base64url");
const KEY = "GET /api/user/:id";
const RID = enc(KEY);

describe("场景引用快照", () => {
	let ctx;
	let up;
	let upUrl;
	let n = 0;
	const api = (url, init) => ctx.api(url, init);
	const dapi = (url, init) => ctx.api(`/debug${url}`, init);
	const putScene = (name, envelope, extra = "") => api(`/routes/${RID}/scenes/${name}${extra}`, { method: "PUT", json: envelope });
	const fromSnap = (name, body) => api(`/routes/${RID}/scenes/${name}/from-snapshot`, { method: "POST", json: body });
	const capture = async (request, name, overwrite = false) => {
		const sent = (await dapi("/send", { method: "POST", json: { request } })).body;
		return dapi(`/history/${enc(sent.id)}/snapshot`, { method: "POST", json: { request, name, overwrite } });
	};
	const setUrl = async (id, url) => {
		const got = (await dapi(`/requests/${enc(id)}`)).body;
		await dapi(`/requests/${enc(id)}`, { method: "PUT", json: { definition: { ...got.definition, url } } });
	};

	beforeAll(async () => {
		up = http.createServer((req, res) => {
			n++;
			if (req.url.startsWith("/csv")) {
				res.writeHead(200, [["content-type", "text/csv"], ["set-cookie", "sid=1"], ["x-up", "csv"]]);
				return res.end("a,b\n1,2\n");
			}
			if (req.url.startsWith("/fail")) {
				req.socket.destroy();
				return;
			}
			res.writeHead(201, { "content-type": "application/json", "x-up": "json" });
			res.end(JSON.stringify({ n, url: req.url }));
		});
		upUrl = `http://127.0.0.1:${await listen(up)}`;
		ctx = await startHost({
			files: { "mocks/a.js": `module.exports = { "${KEY}": { id: 0 }, "POST /api/other": 1 };` },
		});
		await dapi("/nodes", { method: "POST", json: { parent: null, kind: "group", name: "u" } });
		for (const r of ["get", "csv"]) await dapi("/nodes", { method: "POST", json: { parent: "u", kind: "request", name: r } });
		await setUrl("u/get", `${upUrl}/api/user/1`);
		await setUrl("u/csv", `${upUrl}/csv`);
		await capture("u/get", "ok");
		await capture("u/csv", "table");
	});
	afterAll(async () => {
		await ctx.close();
		up.close();
	});

	it("校验 ref 形态与互斥字段", async () => {
		for (const ref of ["x", "a#", "#b", "a#b#c", "_a#b"]) expect((await putScene("bad", { ref })).status).toBe(400);
		expect((await putScene("bad", { ref: "u/get#ok", body: 1 })).status).toBe(400);
	});

	it("引用快照回放状态码, 响应头与响应体; envelope 覆盖; 快照被覆盖后立即生效", async () => {
		expect((await putScene("snap", { ref: "u/get#ok" })).status).toBe(201);
		const detail = (await api(`/routes/${RID}`)).body.scenes.find(s => s.name === "snap");
		expect(detail).toMatchObject({ kind: "ref", ref: { snapshot: "u/get#ok", broken: false } });
		let res = await ctx.fetch("/api/user/9?__scene=snap");
		expect(res.status).toBe(201);
		expect(res.headers.get("x-up")).toBe("json");
		const first = await res.json();
		expect(first.url).toBe("/api/user/1");
		await putScene("snap2", { ref: "u/get#ok", status: 202, headers: { "x-up": "override" } });
		res = await ctx.fetch("/api/user/9?__scene=snap2");
		expect(res.status).toBe(202);
		expect(res.headers.get("x-up")).toBe("override");
		await capture("u/get", "ok", true);
		const after = await (await ctx.fetch("/api/user/9?__scene=snap")).json();
		expect(after.n).toBeGreaterThan(first.n);
	});

	it("set-cookie 默认不回放, 快照开启后回放", async () => {
		await putScene("table", { ref: "u/csv#table" });
		let res = await ctx.fetch("/api/user/1?__scene=table");
		expect(res.headers.get("content-type")).toBe("text/csv");
		expect(await res.text()).toBe("a,b\n1,2\n");
		expect(res.headers.get("set-cookie")).toBeNull();
		await dapi(`/snapshots/${enc("u/csv#table")}`, { method: "PATCH", json: { replay: { setCookie: true } } });
		res = await ctx.fetch("/api/user/1?__scene=table");
		expect(res.headers.get("set-cookie")).toBe("sid=1");
	});

	it("拷贝: 小 JSON 内联, 其他写归属文件; 失败的发送不能用作场景", async () => {
		const json = await fromSnap("copied", { snapshot: "u/get#ok", mode: "copy" });
		expect(json.status).toBe(201);
		expect(json.body.content).toMatchObject({ status: 201, headers: { "x-up": "json", "content-type": "application/json" } });
		expect(json.body.content.body).toMatchObject({ url: "/api/user/1" });
		const csv = await fromSnap("csvcopy", { snapshot: "u/csv#table", mode: "copy" });
		expect(csv.body.bodyFile).toMatchObject({ text: true, exists: true });
		expect(csv.body.content.headers["set-cookie"]).toBeUndefined();
		expect(await (await ctx.fetch("/api/user/1?__scene=csvcopy")).text()).toBe("a,b\n1,2\n");
		expect((await fromSnap("copied", { snapshot: "u/get#ok", mode: "ref" })).status).toBe(409);
		expect((await fromSnap("copied", { snapshot: "u/get#ok", mode: "ref", overwrite: true })).body.ref.snapshot).toBe("u/get#ok");
		await dapi("/nodes", { method: "POST", json: { parent: "u", kind: "request", name: "down" } });
		await setUrl("u/down", `${upUrl}/fail`);
		await capture("u/down", "err");
		expect((await fromSnap("bad", { snapshot: "u/down#err", mode: "ref" })).status).toBe(400);
	});

	it("反向索引, 快照改名与请求移动时改写引用", async () => {
		const index = () => JSON.parse(fs.readFileSync(path.join(ctx.dir, "mocks", "__debug__", "requests", "__refs__.json"), "utf8"));
		expect(Object.keys(index().refs)).toEqual(["u/csv#table", "u/get#ok"]);
		expect(index().refs["u/get#ok"].map(r => r.scene)).toEqual(["copied", "snap", "snap2"]);
		expect((await dapi(`/snapshots/${enc("u/get#ok")}/refs`)).body.length).toBe(3);
		const renamed = await dapi(`/snapshots/${enc("u/get#ok")}`, { method: "PATCH", json: { name: "good" } });
		expect(renamed.body.rewritten).toBe(3);
		expect(Object.keys(index().refs)).toEqual(["u/csv#table", "u/get#good"]);
		expect((await ctx.fetch("/api/user/1?__scene=snap")).status).toBe(201);
		await dapi("/nodes", { method: "POST", json: { parent: null, kind: "group", name: "v" } });
		const moved = await dapi(`/nodes/${enc("u")}`, { method: "PATCH", json: { parent: "v" } });
		expect(moved.body.rewritten).toBe(4);
		expect(Object.keys(index().refs)).toEqual(["v/u/csv#table", "v/u/get#good"]);
		expect((await ctx.fetch("/api/user/1?__scene=table")).status).toBe(200);
	});

	it("删除被引用的快照需要确认, 删除后降级到下一级并记诊断", async () => {
		const blocked = await dapi(`/snapshots/${enc("v/u/get#good")}`, { method: "DELETE" });
		expect(blocked.status).toBe(409);
		expect(blocked.body.error.code).toBe("REF_IN_USE");
		expect(blocked.body.error.details.refs.length).toBe(3);
		expect((await dapi(`/nodes/${enc("v")}?recursive=1`, { method: "DELETE" })).status).toBe(409);
		expect((await dapi(`/snapshots/${enc("v/u/get#good")}?force=1`, { method: "DELETE" })).status).toBe(204);
		const res = await ctx.fetch("/api/user/1?__scene=snap", { headers: { "sec-fetch-dest": "empty" } });
		expect(await res.json()).toEqual({ id: 0 });
		const logs = (await api("/logs")).body;
		expect(logs[logs.length - 1]).toMatchObject({ scene: "default", sceneFallback: true });
		const meta = (await api("/meta")).body;
		expect(meta.diagnostics.filter(d => d.type === "broken-ref").length).toBe(3);
		expect((await api(`/routes/${RID}`)).body.scenes.find(s => s.name === "snap").ref.broken).toBe(true);
	});

	it("按请求解析后的路径推荐路由", async () => {
		const out = (await dapi(`/requests/${enc("v/u/get")}/route-match`)).body;
		expect(out).toEqual({ pathname: "/api/user/1", candidates: [{ routeId: RID, key: KEY }] });
	});
});
