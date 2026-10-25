// 场景 bodyFile: 校验, 回放, 诊断, 预览与编辑接口, 归属文件随场景删除
"use strict";
const fs = require("fs");
const path = require("path");
const { startHost } = require("../helpers/server");
const { loadSrc } = require("../helpers/src");

const { createFileStore } = loadSrc("files.ts");
const KEY = "GET /api/export";
const ID = Buffer.from(KEY).toString("base64url");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe("场景 bodyFile", () => {
	let ctx;
	let store;
	let base;
	const put = (name, envelope, headers) =>
		ctx.api(`/routes/${ID}/scenes/${name}`, { method: "PUT", json: envelope, headers });

	beforeAll(async () => {
		ctx = await startHost({ files: { "mocks/a.js": `module.exports = { "${KEY}": { inline: true } };` } });
		store = createFileStore(path.join(ctx.dir, "mocks"));
		const owned = store.ownedDirOf(KEY);
		base = path.basename(owned);
		fs.mkdirSync(owned, { recursive: true });
		fs.writeFileSync(path.join(owned, "export.raw.csv"), "a,b\n1,2\n");
		fs.writeFileSync(path.join(owned, "logo.raw.png"), PNG);
		fs.mkdirSync(path.join(store.scenesDir, "shared"), { recursive: true });
		fs.writeFileSync(path.join(store.scenesDir, "shared", "keep.txt"), "keep");
	});
	afterAll(() => ctx.close());

	it("拒绝越界路径与互斥字段", async () => {
		for (const bodyFile of ["../x.csv", "/abs.csv", "a/./b.csv", "a\\b.csv", ""]) {
			expect((await put("bad", { bodyFile })).status).toBe(400);
		}
		expect((await put("bad", { bodyFile: `${base}/export.raw.csv`, body: 1 })).status).toBe(400);
		expect((await put("bad", { bodyFile: `${base}/export.raw.csv`, script: "() => 1" })).status).toBe(400);
	});

	it("按扩展名返回文件, 显式 content-type 优先, HEAD 不带体", async () => {
		const res = await put("csv", { status: 201, bodyFile: `${base}/export.raw.csv` });
		expect(res.status).toBe(201);
		expect(res.body.bodyFile).toMatchObject({ path: `${base}/export.raw.csv`, text: true, exists: true, size: 8 });
		const csv = await ctx.fetch("/api/export?__scene=csv");
		expect(csv.status).toBe(201);
		expect(csv.headers.get("content-type")).toBe("text/csv; charset=utf-8");
		expect(await csv.text()).toBe("a,b\n1,2\n");
		const head = await ctx.fetch("/api/export?__scene=csv", { method: "HEAD" });
		expect(head.headers.get("content-length")).toBe("8");

		await put("png", { bodyFile: `${base}/logo.raw.png`, headers: { "content-type": "image/x-test" } });
		const png = await ctx.fetch("/api/export?__scene=png");
		expect(png.headers.get("content-type")).toBe("image/x-test");
		expect(Buffer.from(await png.arrayBuffer()).equals(PNG)).toBe(true);
	});

	it("文件不存在时返回 500 并记诊断", async () => {
		await put("gone", { bodyFile: `${base}/missing.txt` });
		const res = await ctx.fetch("/api/export?__scene=gone");
		expect(res.status).toBe(500);
		expect((await res.json()).message).toMatch(/不存在/);
		const meta = (await ctx.api("/meta")).body;
		expect(meta.diagnostics.some(d => d.type === "missing-body-file")).toBe(true);
		await ctx.api(`/routes/${ID}/scenes/gone`, { method: "DELETE" });
	});

	it("预览与编辑文本文件, etag 不符时冲突", async () => {
		const body = await ctx.fetch(`/__mock/api/routes/${ID}/scenes/csv/body`);
		expect(body.headers.get("content-security-policy")).toBe("sandbox");
		expect(await body.text()).toBe("a,b\n1,2\n");
		const stale = await ctx.api(`/routes/${ID}/scenes/csv/body`, {
			method: "PUT",
			json: { text: "x" },
			headers: { "if-match": '"nope"' },
		});
		expect(stale.status).toBe(409);
		const detail = (await ctx.api(`/routes/${ID}`)).body.scenes.find(s => s.name === "csv");
		const ok = await ctx.api(`/routes/${ID}/scenes/csv/body`, {
			method: "PUT",
			json: { text: "a,b\n3,4\n" },
			headers: { "if-match": `"${detail.etag}"` },
		});
		expect(ok.status).toBe(200);
		expect(ok.body.etag).not.toBe(detail.etag);
		expect(await (await ctx.fetch("/api/export?__scene=csv")).text()).toBe("a,b\n3,4\n");
		const binary = await ctx.api(`/routes/${ID}/scenes/png/body`, {
			method: "PUT",
			json: { text: "x" },
			headers: { "if-match": `"${ok.body.etag}"` },
		});
		expect(binary.status).toBe(400);
	});

	it("删除场景时删除归属文件, 不动其他位置的文件", async () => {
		await put("shared", { bodyFile: "shared/keep.txt" });
		await ctx.api(`/routes/${ID}/scenes/shared`, { method: "DELETE" });
		expect(fs.existsSync(path.join(store.scenesDir, "shared", "keep.txt"))).toBe(true);
		await ctx.api(`/routes/${ID}/scenes/csv`, { method: "DELETE" });
		expect(fs.existsSync(path.join(store.ownedDirOf(KEY), "export.raw.csv"))).toBe(false);
		expect(fs.existsSync(path.join(store.ownedDirOf(KEY), "logo.raw.png"))).toBe(true);
		await ctx.api(`/routes/${ID}/scenes/png`, { method: "DELETE" });
		expect(fs.existsSync(store.ownedDirOf(KEY))).toBe(false);
	});
});
