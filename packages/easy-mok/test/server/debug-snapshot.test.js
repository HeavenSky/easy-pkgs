// 命名快照: 由历史另存, 重名与覆盖, 改名查重, 元数据, 删除, 快照变量优先级, 树输出
"use strict";
const fs = require("fs");
const http = require("http");
const path = require("path");
const { listen, startHost } = require("../helpers/server");

const enc = s => Buffer.from(s).toString("base64url");

describe("命名快照", () => {
	let ctx;
	let up;
	let upUrl;
	let n = 0;
	const api = (url, init) => ctx.api(`/debug${url}`, init);
	const sendSaved = extra =>
		api("/send", { method: "POST", json: { request: "u/get", ...extra } });
	const save = (hid, body) =>
		api(`/history/${enc(hid)}/snapshot`, {
			method: "POST",
			json: { request: "u/get", ...body },
		});
	const snap = (name, init) => api(`/snapshots/${enc(`u/get#${name}`)}`, init);
	const patchSnap = (name, json) => snap(name, { method: "PATCH", json });
	const rawOf = async name =>
		(await ctx.fetch(`/__mock/api/debug/snapshots/${enc(`u/get#${name}`)}/raw`)).json();

	beforeAll(async () => {
		up = http.createServer((req, res) => {
			res.setHeader("content-type", "application/json");
			res.end(JSON.stringify({ n: ++n, url: req.url }));
		});
		upUrl = `http://127.0.0.1:${await listen(up)}`;
		ctx = await startHost({ files: { "mocks/a.js": "module.exports = {};" } });
		await api("/nodes", { method: "POST", json: { parent: null, kind: "group", name: "u" } });
		await api("/nodes", {
			method: "POST",
			json: { parent: "u", kind: "request", name: "get" },
		});
		const got = (await api(`/requests/${enc("u/get")}`)).body;
		await api(`/requests/${enc("u/get")}`, {
			method: "PUT",
			json: { definition: { ...got.definition, url: `${upUrl}/user/{{id}}` } },
		});
		await api(`/nodes/${enc("u/get")}`, { method: "PATCH", json: { vars: { id: "1" } } });
	});
	afterAll(async () => {
		await ctx.close();
		up.close();
	});

	it("另存为快照, 复制响应体与元数据, 树中列出", async () => {
		const sent = (await sendSaved()).body;
		const res = await save(sent.id, { name: "ok", title: "正常", weight: 3 });
		expect(res.status).toBe(201);
		expect(res.body).toMatchObject({
			id: "u/get#ok",
			request: "u/get",
			name: "ok",
			title: "正常",
			weight: 3,
			redaction: { fields: 0, setCookie: "none" },
		});
		const detail = (await snap("ok")).body;
		expect(detail.meta).toMatchObject({
			name: "正常",
			weight: 3,
			vars: {},
			replay: { setCookie: false },
			origin: { kind: "debug", historyId: sent.id },
		});
		expect(detail.meta.response.status).toBe(200);
		expect(await rawOf("ok")).toEqual({ n: 1, url: "/user/1" });
		const dir = path.join(ctx.dir, "mocks", "__debug__", "requests", "u", "get", "res", "ok");
		expect(fs.readdirSync(dir).sort()).toEqual(["__meta__.json", "raw.json"]);
		const tree = (await api("/tree")).body;
		expect(tree.nodes[0].children[0].snapshots).toEqual([
			{ name: "ok", title: "正常", weight: 3 },
		]);
	});

	it("重名(不区分大小写)需要覆盖确认, 覆盖保留快照级设置", async () => {
		await patchSnap("ok", { vars: { id: "9" }, replay: { setCookie: true } });
		const sent = (await sendSaved()).body;
		expect((await save(sent.id, { name: "OK" })).status).toBe(409);
		const over = await save(sent.id, { name: "ok", overwrite: true });
		expect(over.status).toBe(201);
		expect((await snap("ok")).body.meta).toMatchObject({
			name: "正常",
			weight: 3,
			vars: { id: "9" },
			replay: { setCookie: true },
		});
		expect(await rawOf("ok")).toMatchObject({ n: 2 });
	});

	it("快照变量优先于请求变量, 用于重新发送与预览", async () => {
		const preview = (
			await api("/resolve", {
				method: "POST",
				json: { request: "u/get", snapshot: "u/get#ok" },
			})
		).body;
		expect(preview.values.id).toEqual({ value: "9", from: "snapshot" });
		const sent = (await sendSaved({ snapshot: "u/get#ok" })).body;
		expect(sent.meta.request.url).toBe(`${upUrl}/user/9`);
	});

	it("改名查重, 元数据校验, 删除", async () => {
		const sent = (await sendSaved()).body;
		await save(sent.id, { name: "empty" });
		expect((await patchSnap("empty", { name: "Ok" })).status).toBe(409);
		const renamed = await patchSnap("empty", { name: "blank", weight: 9 });
		expect(renamed.body).toMatchObject({ id: "u/get#blank", weight: 9 });
		expect((await patchSnap("blank", { weight: 1.5 })).status).toBe(400);
		// 改名同时带非法字段: 拒绝且不改名
		expect((await patchSnap("blank", { name: "blank2", weight: 1.5 })).status).toBe(400);
		expect((await snap("blank")).status).toBe(200);
		const tree = (await api("/tree")).body;
		expect(tree.nodes[0].children[0].snapshots.map(s => s.name)).toEqual(["blank", "ok"]);
		expect((await snap("blank", { method: "DELETE" })).status).toBe(204);
		expect((await snap("blank")).status).toBe(404);
	});

	it("草稿的历史需要指定所属请求, 失败的发送也能另存", async () => {
		const draft = (
			await api("/send", {
				method: "POST",
				json: {
					request: null,
					definition: {
						...(await api(`/requests/${enc("u/get")}`)).body.definition,
						url: "http://127.0.0.1:1/x",
					},
					env: null,
				},
			})
		).body;
		expect(draft.meta.error.code).toBe("ECONNREFUSED");
		const noRequest = { method: "POST", json: { name: "x" } };
		expect((await api(`/history/${enc(draft.id)}/snapshot`, noRequest)).status).toBe(400);
		expect((await save(draft.id, { name: "down" })).status).toBe(201);
		expect((await snap("down")).body.meta.error.code).toBe("ECONNREFUSED");
	});
});
