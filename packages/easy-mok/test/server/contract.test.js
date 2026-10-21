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

	it("各接口响应符合契约", async () => {
		const z = await import("zod");
		const id = Buffer.from("GET /a/:id").toString("base64url");
		c.Meta.parse((await ctx.api("/meta")).body);
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
});
