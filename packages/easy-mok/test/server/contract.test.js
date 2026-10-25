"use strict";
const path = require("path");
const { startHost } = require("../helpers/server");

// 用管理页的 zod schema 校验服务端真实响应, 任一侧改了字段这里就会失败
describe("接口契约", () => {
	let ctx;
	let c;

	beforeAll(async () => {
		c = await import("../../src/ui/api/contract.ts");
		ctx = await startHost({
			files: {
				"mocks/a.js": `const { scenes } = require(${JSON.stringify(path.join(__dirname, "../../src/server"))});
module.exports = { "GET /a/:id": scenes({ default: 1, fn: (req, res) => res.json(2), proxy: () => ({ target: "http://127.0.0.1:1" }) }) };`,
				"mocks/bad.js": "module.exports = { BAD: 1 };", // 无效 key 让整个入口失败, 单独放一个文件以产生诊断
			},
		});
	});
	afterAll(() => ctx.close());

	let z;
	it("各接口响应符合契约", async () => {
		z = await import("zod");
		const id = Buffer.from("GET /a/:id").toString("base64url");
		c.Meta.parse((await ctx.api("/meta")).body);
		c.LanInfo.parse((await ctx.api("/lan", { method: "PUT", json: { access: false } })).body);
		c.IgnoreConfig.parse((await ctx.api("/ignore")).body);
		c.IgnoreConfig.parse(
			(await ctx.api("/ignore", { method: "PUT", json: { custom: ["/x"] } })).body
		);
		c.IgnoreValidation.parse(
			(await ctx.api("/ignore/validate", { method: "POST", json: { rules: ["bad"] } })).body
		);
		z.array(c.RouteSummary).parse((await ctx.api("/routes")).body);
		c.RouteDetail.parse((await ctx.api(`/routes/${id}`)).body);
		c.SceneDetail.parse(
			(
				await ctx.api(`/routes/${id}/scenes/x`, {
					method: "PUT",
					json: { status: 201, body: { a: 1 }, headers: { "x-a": "1" } },
				})
			).body
		);
		c.RouteSummary.parse(
			(
				await ctx.api(`/routes/${id}/state`, {
					method: "PATCH",
					json: { scene: "x", delay: 10 },
				})
			).body
		);
		c.RouteSummary.parse(
			(
				await ctx.api("/routes", {
					method: "POST",
					json: { methods: ["GET"], path: "/b", response: { body: 1 } },
				})
			).body
		);
		c.Groups.parse((await ctx.api("/groups/g", { method: "PUT", json: { [id]: "x" } })).body);
		c.Groups.parse((await ctx.api("/groups/g2/snapshot", { method: "POST" })).body);
		c.Meta.parse((await ctx.api("/state", { method: "PATCH", json: { group: "g" } })).body);
		await ctx.fetch("/a/1", { headers: { "sec-fetch-dest": "empty" } });
		await ctx.fetch("/zzz", { headers: { "sec-fetch-dest": "empty" } });
		const logs = z.array(c.LogSummary).parse((await ctx.api("/logs")).body);
		c.LogDetail.parse((await ctx.api(`/logs/${logs[0].id}`)).body);
		c.SaveSceneResult.parse(
			(
				await ctx.api(`/logs/${logs[1].id}/scene`, {
					method: "POST",
					json: { name: "saved" },
				})
			).body
		);
		c.Removed.parse((await ctx.api("/state/cleanup", { method: "POST" })).body);
		c.ApiErrorBody.parse((await ctx.api("/routes/nope")).body);
	});

	it("调试接口响应符合契约, 名字正则与服务端逐字相同", async () => {
		z = z || (await import("zod"));
		const d = await import("../../src/ui/api/debug-contract.ts");
		const { DEBUG_NAME_RE } = require("../helpers/src").loadSrc("debug/names.ts");
		expect(d.DEBUG_NAME_RE.source).toBe(DEBUG_NAME_RE.source);
		expect(d.DEBUG_NAME_RE.flags).toBe(DEBUG_NAME_RE.flags);
		const api = (url, init) => ctx.api(`/debug${url}`, init);
		const enc = s => Buffer.from(s).toString("base64url");
		d.TreeNode.parse((await api("/nodes", { method: "POST", json: { parent: null, kind: "group", name: "g" } })).body);
		d.TreeNode.parse((await api("/nodes", { method: "POST", json: { parent: "g", kind: "request", name: "r" } })).body);
		d.DebugTree.parse((await api("/tree")).body);
		const req = d.DebugRequest.parse((await api(`/requests/${enc("g/r")}`)).body);
		d.DebugRequest.parse((await api(`/requests/${enc("g/r")}`, { method: "PUT", json: { definition: { ...req.definition, url: "{{base}}/x" } } })).body);
		d.TreeNode.parse((await api(`/nodes/${enc("g/r")}`, { method: "PATCH", json: { title: "R" } })).body);
		d.EnvGroup.parse((await api("/envs/dev", { method: "PUT", json: { vars: { base: "http://127.0.0.1:1" } } })).body);
		d.EnvList.parse((await api("/envs")).body);
		z.object({ active: z.string().nullable() }).parse((await api("/active-env", { method: "PUT", json: { name: "dev" } })).body);
		d.SecretItem.parse((await api("/envs/dev/secrets/tk", { method: "PUT", json: { from: "env", name: "HOME" } })).body);
		z.array(d.SecretItem).parse((await api("/envs/dev/secrets")).body);
		d.Resolved.parse((await api("/resolve", { method: "POST", json: { request: "g/r" } })).body);
		const sent = d.HistoryEntry.parse((await api("/send", { method: "POST", json: { request: "g/r" } })).body);
		expect(sent.meta.error.code).toBe("ECONNREFUSED");
		d.HistoryPage.parse((await api("/history")).body);
		d.HistoryEntry.parse((await api(`/history/${enc(sent.id)}`)).body);
		d.HistoryDays.parse((await api("/history-days")).body);
		d.SnapshotSummary.parse((await api(`/history/${enc(sent.id)}/snapshot`, { method: "POST", json: { request: "g/r", name: "down" } })).body);
		d.SnapshotDetail.parse((await api(`/snapshots/${enc("g/r#down")}`)).body);
		d.SnapshotSummary.parse((await api(`/snapshots/${enc("g/r#down")}`, { method: "PATCH", json: { weight: 1 } })).body);
		d.DiffResult.parse((await api(`/diff?a=${encodeURIComponent("snapshot:g/r#down")}&b=${encodeURIComponent(`history:${sent.id}`)}`)).body);
		d.RefreshResult.parse((await api(`/snapshots/${enc("g/r#down")}/refresh`, { method: "POST", json: {} })).body);
		z.object({ node: d.TreeNode, warnings: z.array(z.string()) }).parse((await api("/import/curl", { method: "POST", json: { text: "curl http://x/a", parent: "g" } })).body);
		z.object({ text: z.string() }).parse((await api("/export/curl", { method: "POST", json: { source: "request:g/r" } })).body);
		z.object({ created: z.number(), warnings: z.array(z.string()) }).parse((await api("/import/openapi", { method: "POST", json: { text: '{"openapi":"3.1.0","paths":{}}', parent: null } })).body);
		z.object({ text: z.string(), filename: z.string(), warnings: z.array(z.string()) }).parse((await api("/export/openapi", { method: "POST", json: { node: null } })).body);
		const routeId = Buffer.from("GET /a/:id").toString("base64url");
		c.ApiErrorBody.parse((await ctx.api(`/routes/${routeId}/scenes/fs/from-snapshot`, { method: "POST", json: { snapshot: "g/r#down", mode: "ref" } })).body);
		c.SceneDetail.parse((await ctx.api(`/routes/${routeId}/scenes/rs`, { method: "PUT", json: { ref: "g/r#down" } })).body);
		z.array(z.object({ route: z.string(), scene: z.string(), file: z.string() })).parse((await api(`/snapshots/${enc("g/r#down")}/refs`)).body);
		z.object({ pathname: z.string(), candidates: z.array(z.object({ routeId: z.string(), key: z.string() })) }).parse((await api(`/requests/${enc("g/r")}/route-match`)).body);
	});
});
