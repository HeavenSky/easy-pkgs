"use strict";
const path = require("path");
const { startHost } = require("../helpers/server");
const { loadSrc } = require("../helpers/src");

const enc = s => Buffer.from(s).toString("base64url");
const RID = enc("GET /a/:id");

// 用管理页的 zod schema 校验服务端真实响应, 任一侧改了字段这里就会失败
describe("接口契约", () => {
	let ctx;
	let c;
	let d;
	let z;
	/** 调管理接口并返回响应体; method 省略时发 GET, json 省略时不带请求体 */
	const call = async (url, method, json) =>
		(await ctx.api(url, method ? { method, json } : undefined)).body;

	beforeAll(async () => {
		c = await import("../../src/ui/api/contract.ts");
		d = await import("../../src/ui/api/debug-contract.ts");
		z = await import("zod");
		ctx = await startHost({
			files: {
				"mocks/a.js": `const { scenes } = require(${JSON.stringify(path.join(__dirname, "../../src/server"))});
module.exports = { "GET /a/:id": scenes({ default: 1, fn: (req, res) => res.json(2), proxy: () => ({ target: "http://127.0.0.1:1" }) }) };`,
				"mocks/bad.js": "module.exports = { BAD: 1 };", // 无效 key 让整个入口失败, 单独放一个文件以产生诊断
			},
		});
	});
	afterAll(() => ctx.close());

	it("各接口响应符合契约", async () => {
		c.Meta.parse(await call("/meta"));
		c.LanInfo.parse(await call("/lan", "PUT", { access: false }));
		c.IgnoreConfig.parse(await call("/ignore"));
		c.IgnoreConfig.parse(await call("/ignore", "PUT", { custom: ["/x"] }));
		c.IgnoreValidation.parse(await call("/ignore/validate", "POST", { rules: ["bad"] }));
		z.array(c.RouteSummary).parse(await call("/routes"));
		c.RouteDetail.parse(await call(`/routes/${RID}`));
		c.SceneDetail.parse(
			await call(`/routes/${RID}/scenes/x`, "PUT", {
				status: 201,
				body: { a: 1 },
				headers: { "x-a": "1" },
			})
		);
		c.RouteSummary.parse(
			await call(`/routes/${RID}/state`, "PATCH", { scene: "x", delay: 10 })
		);
		c.RouteSummary.parse(
			await call("/routes", "POST", { methods: ["GET"], path: "/b", response: { body: 1 } })
		);
		c.Groups.parse(await call("/groups/g", "PUT", { [RID]: "x" }));
		c.Groups.parse(await call("/groups/g2/snapshot", "POST"));
		c.Meta.parse(await call("/state", "PATCH", { group: "g" }));
		await ctx.fetch("/a/1", { headers: { "sec-fetch-dest": "empty" } });
		await ctx.fetch("/zzz", { headers: { "sec-fetch-dest": "empty" } });
		const logs = z.array(c.LogSummary).parse(await call("/logs"));
		c.LogDetail.parse(await call(`/logs/${logs[0].id}`));
		c.SaveSceneResult.parse(await call(`/logs/${logs[1].id}/scene`, "POST", { name: "saved" }));
		c.Removed.parse(await call("/state/cleanup", "POST"));
		c.ApiErrorBody.parse(await call("/routes/nope"));
	});

	it("调试接口响应符合契约, 名字正则与服务端逐字相同", async () => {
		const { DEBUG_NAME_RE } = loadSrc("debug/names.ts");
		expect(d.DEBUG_NAME_RE.source).toBe(DEBUG_NAME_RE.source);
		expect(d.DEBUG_NAME_RE.flags).toBe(DEBUG_NAME_RE.flags);
		const dc = (url, method, json) => call(`/debug${url}`, method, json);
		const ImportResult = z.object({ node: d.TreeNode, warnings: z.array(z.string()) });
		d.TreeNode.parse(await dc("/nodes", "POST", { parent: null, kind: "group", name: "g" }));
		d.TreeNode.parse(await dc("/nodes", "POST", { parent: "g", kind: "request", name: "r" }));
		d.DebugTree.parse(await dc("/tree"));
		const req = d.DebugRequest.parse(await dc(`/requests/${enc("g/r")}`));
		d.DebugRequest.parse(
			await dc(`/requests/${enc("g/r")}`, "PUT", {
				definition: { ...req.definition, url: "{{base}}/x" },
			})
		);
		d.TreeNode.parse(await dc(`/nodes/${enc("g/r")}`, "PATCH", { title: "R" }));
		d.EnvGroup.parse(await dc("/envs/dev", "PUT", { vars: { base: "http://127.0.0.1:1" } }));
		d.EnvList.parse(await dc("/envs"));
		z.object({ active: z.string().nullable() }).parse(
			await dc("/active-env", "PUT", { name: "dev" })
		);
		d.SecretItem.parse(await dc("/envs/dev/secrets/tk", "PUT", { from: "env", name: "HOME" }));
		z.array(d.SecretItem).parse(await dc("/envs/dev/secrets"));
		d.Resolved.parse(await dc("/resolve", "POST", { request: "g/r" }));
		const sent = d.HistoryEntry.parse(await dc("/send", "POST", { request: "g/r" }));
		expect(sent.meta.error.code).toBe("ECONNREFUSED");
		d.HistoryPage.parse(await dc("/history"));
		d.HistoryEntry.parse(await dc(`/history/${enc(sent.id)}`));
		d.HistoryDays.parse(await dc("/history-days"));
		d.SnapshotSummary.parse(
			await dc(`/history/${enc(sent.id)}/snapshot`, "POST", { request: "g/r", name: "down" })
		);
		const snap = `/snapshots/${enc("g/r#down")}`;
		d.SnapshotDetail.parse(await dc(snap));
		d.SnapshotSummary.parse(await dc(snap, "PATCH", { weight: 1 }));
		d.DiffResult.parse(
			await dc(
				`/diff?a=${encodeURIComponent("snapshot:g/r#down")}&b=${encodeURIComponent(`history:${sent.id}`)}`
			)
		);
		d.RefreshResult.parse(await dc(`${snap}/refresh`, "POST", {}));
		ImportResult.parse(
			await dc("/import/curl", "POST", { text: "curl http://x/a", parent: "g" })
		);
		z.object({ text: z.string() }).parse(
			await dc("/export/curl", "POST", { source: "request:g/r" })
		);
		z.object({ created: z.number(), warnings: z.array(z.string()) }).parse(
			await dc("/import/openapi", "POST", {
				text: '{"openapi":"3.1.0","paths":{}}',
				parent: null,
			})
		);
		z.object({ text: z.string(), filename: z.string(), warnings: z.array(z.string()) }).parse(
			await dc("/export/openapi", "POST", { node: null })
		);
		z.array(z.object({ name: z.string(), domain: z.string(), path: z.string() }).loose()).parse(
			await dc("/envs/dev/cookies")
		);
		expect((await ctx.api("/debug/envs/dev/cookies", { method: "DELETE" })).status).toBe(204);
		const lastLog = z
			.array(c.LogSummary)
			.parse(await call("/logs"))
			.pop();
		ImportResult.parse(
			await call(`/logs/${lastLog.id}/debug-request`, "POST", {
				parent: "g",
				name: "fromlog",
			})
		);
		c.ApiErrorBody.parse(
			await call(`/routes/${RID}/scenes/fs/from-snapshot`, "POST", {
				snapshot: "g/r#down",
				mode: "ref",
			})
		);
		c.SceneDetail.parse(await call(`/routes/${RID}/scenes/rs`, "PUT", { ref: "g/r#down" }));
		z.array(z.object({ route: z.string(), scene: z.string(), file: z.string() })).parse(
			await dc(`${snap}/refs`)
		);
		z.object({
			pathname: z.string(),
			candidates: z.array(z.object({ routeId: z.string(), key: z.string() })),
		}).parse(await dc(`/requests/${enc("g/r")}/route-match`));
	});
});
