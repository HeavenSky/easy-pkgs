// 快照对比与刷新: JSON 排序后比较, 数组顺序敏感, 文本 hunk, 二进制与过大只比摘要, 响应头增删改, 刷新不覆盖快照
"use strict";
const fs = require("fs");
const http = require("http");
const path = require("path");
const { listen, makeFixture, startHost } = require("../helpers/server");
const { loadSrc } = require("../helpers/src");

const { diffLines, hunksOf, diffResults, DIFF_LIMIT } = loadSrc("debug/diff.ts");
const enc = s => Buffer.from(s).toString("base64url");

/** 造一侧: 响应头与响应体文件 */
const side = (name, headers, body, ext = "json") => {
	const dir = makeFixture({ [`raw.${ext}`]: body });
	const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
	return {
		dir,
		meta: {
			response: {
				status: 200,
				headers,
				body: { file: `raw.${ext}`, size: buf.length, sha256: require("crypto").createHash("sha256").update(buf).digest("hex"), contentType: null, decoded: true },
			},
		},
	};
};

describe("diff 计算", () => {
	it("Myers 编辑脚本与上下文 hunk", () => {
		const a = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
		const b = ["1", "2", "3", "4", "x", "6", "7", "8", "9", "10", "11"];
		const script = diffLines(a, b);
		expect(script.filter(l => l.op !== " ")).toEqual([
			{ op: "-", text: "5" },
			{ op: "+", text: "x" },
			{ op: "+", text: "11" },
		]);
		const hunks = hunksOf(script);
		expect(hunks.length).toBe(1);
		expect(hunks[0]).toMatchObject({ aStart: 2, bStart: 2 });
		expect(hunksOf(diffLines(a, a))).toEqual([]);
		expect(diffLines([], [])).toEqual([]);
	});

	it("JSON key 顺序不同视为相同, 数组顺序变化视为不同", () => {
		const r = diffResults(side("a", [], '{"b":1,"a":[1,2]}'), side("b", [], '{"a":[1,2],"b":1}'));
		expect(r.body).toMatchObject({ mode: "json", same: true, hunks: [] });
		const r2 = diffResults(side("a", [], '{"a":[1,2]}'), side("b", [], '{"a":[2,1]}'));
		expect(r2.body.same).toBe(false);
		expect(r2.body.hunks[0].lines.some(l => l.op === "-")).toBe(true);
	});

	it("文本按行比较, 二进制与过大只比摘要, 响应头按名对齐", () => {
		const t = diffResults(side("a", [["x-a", "1"], ["x-b", "1"]], "a\nb\n", "csv"), side("b", [["x-a", "2"], ["x-c", "1"]], "a\nc\n", "csv"));
		expect(t.body.mode).toBe("text");
		expect(t.headers).toEqual([
			{ name: "x-a", a: ["1"], b: ["2"], change: "changed" },
			{ name: "x-b", a: ["1"], b: [], change: "removed" },
			{ name: "x-c", a: [], b: ["1"], change: "added" },
		]);
		const bin = diffResults(side("a", [], Buffer.from([0, 1]), "png"), side("b", [], Buffer.from([0, 1]), "png"));
		expect(bin.body).toMatchObject({ mode: "binary", same: true });
		const big = side("a", [], "x");
		big.meta.response.body.size = DIFF_LIMIT + 1;
		expect(diffResults(big, side("b", [], "x")).body.mode).toBe("too-large");
	});
});

describe("刷新快照", () => {
	let ctx;
	let up;
	let n = 0;
	const api = (url, init) => ctx.api(`/debug${url}`, init);

	beforeAll(async () => {
		up = http.createServer((req, res) => {
			n++;
			res.setHeader("content-type", "application/json");
			res.end(JSON.stringify({ n, path: req.url }));
		});
		const port = await listen(up);
		ctx = await startHost({ files: { "mocks/a.js": "module.exports = {};" } });
		await api("/nodes", { method: "POST", json: { parent: null, kind: "request", name: "r" } });
		const got = (await api(`/requests/${enc("r")}`)).body;
		await api(`/requests/${enc("r")}`, { method: "PUT", json: { definition: { ...got.definition, url: `http://127.0.0.1:${port}/x` } } });
		const sent = (await api("/send", { method: "POST", json: { request: "r" } })).body;
		await api(`/history/${enc(sent.id)}/snapshot`, { method: "POST", json: { request: "r", name: "ok" } });
	});
	afterAll(async () => {
		await ctx.close();
		up.close();
	});

	it("刷新返回新历史与 diff, 不覆盖快照; 也能对比任意两条", async () => {
		const res = await api(`/snapshots/${enc("r#ok")}/refresh`, { method: "POST", json: {} });
		expect(res.status).toBe(200);
		expect(res.body.diff.body).toMatchObject({ mode: "json", same: false });
		const changed = res.body.diff.body.hunks[0].lines.filter(l => l.op !== " ").map(l => l.text.trim());
		expect(changed).toEqual(['"n": 1,', '"n": 2,']);
		const raw = await ctx.fetch(`/__mock/api/debug/snapshots/${enc("r#ok")}/raw`);
		expect((await raw.json()).n).toBe(1);
		const d = await api(`/diff?a=${encodeURIComponent("snapshot:r#ok")}&b=${encodeURIComponent(`history:${res.body.history.id}`)}`);
		expect(d.body.status).toEqual({ a: 200, b: 200 });
		expect((await api("/diff?a=x&b=y")).status).toBe(400);
		const dir = path.join(ctx.dir, "mocks", "__debug__", "requests", "r", "res", "ok");
		expect(fs.existsSync(dir)).toBe(true);
	});
});
