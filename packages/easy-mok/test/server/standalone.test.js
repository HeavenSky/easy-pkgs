// 独立运行: startMock 函数与 easy-mok 命令行
"use strict";
const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const { listen, makeFixture, sleep, waitFor } = require("../helpers/server");
const { loadSrc } = require("../helpers/src");

const { startMock } = loadSrc();
const { loadBuiltin, parseCliArgs } = loadSrc("standalone.ts");
const CLI = path.join(__dirname, "../../src/server/cli.ts");

const fixture = () => makeFixture({
	"state.json": JSON.stringify({ logLevel: "silent" }),
	"mocks/a.js": "module.exports = { 'GET /api/hello': { hello: 'world' } };",
	"builtin.ts": "import path from 'node:path';\nconst v: number = Number(path.basename('/x/1'));\nexport default { 'GET /builtin': { builtin: v } };\n",
});

describe("startMock", () => {
	it("端口 0 启动, 命中 mock, 未命中返回 404 JSON, 跨域规则同挂载模式, close 后关闭", async () => {
		const dir = fixture();
		const started = await startMock({ cwd: dir, folder: "mocks", stateFile: "state.json", port: 0, watch: false });
		expect(started.port).toBeGreaterThan(0);
		expect(started.url).toBe(`http://127.0.0.1:${started.port}`);
		expect(await (await fetch(`${started.url}/api/hello`)).json()).toEqual({ hello: "world" });
		const miss = await fetch(`${started.url}/nope`, { headers: { origin: "http://localhost:5173" } });
		expect(miss.status).toBe(404);
		expect(miss.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
		expect(await miss.json()).toMatchObject({ mock: false, url: "/nope" });
		const evil = await fetch(`${started.url}/api/hello`, { headers: { origin: "http://evil.test" } });
		expect(evil.headers.get("access-control-allow-origin")).toBeNull();
		const pre = await fetch(`${started.url}/nope`, { method: "OPTIONS", headers: { origin: "http://localhost:5173", "access-control-request-method": "POST" } });
		expect(pre.status).toBe(204);
		expect((await fetch(`${started.url}/__mock/api/meta`)).status).toBe(200);
		await started.close();
		expect(started.server.listening).toBe(false);
	});

	it("mock 目录不存在时警告一次, 不抛错; 稍后创建的目录照常监听", async () => {
		const dir = fixture();
		const warns = [];
		const spy = vi.spyOn(console, "warn").mockImplementation((...a) => { warns.push(a.map(String).join(" ")); });
		try {
			const started = await startMock({ cwd: dir, folder: "later", stateFile: "state.json", port: 0 });
			const folder = path.join(dir, "later");
			const hits = warns.filter(w => w.includes("mock 目录不存在"));
			expect(hits.length).toBe(1);
			expect(hits[0]).toContain(folder);
			expect(hits[0]).toMatch(/mkdir -p/);
			expect((await fetch(`${started.url}/api/later`)).status).toBe(404);
			fs.mkdirSync(folder);
			fs.writeFileSync(path.join(folder, "a.js"), "module.exports = { 'GET /api/later': { later: true } };");
			await waitFor(async () => (await fetch(`${started.url}/api/later`)).status === 200, 5000);
			await started.close();
			// 上级目录也不存在: 监听最近的已存在祖先, 多级目录稍后创建同样自动加载
			const deep = await startMock({ cwd: dir, folder: "x/y/mocks", stateFile: "state.json", port: 0 });
			expect(warns.at(-1)).toMatch(/无需重启/);
			fs.writeFileSync(path.join(dir, "sibling.js"), "module.exports = { 'GET /api/sibling': 1 };"); // 不在通往 mock 目录的路径上, 不加载
			expect((await fetch(`${deep.url}/api/deep`)).status).toBe(404);
			await sleep(300); // 等监听就绪
			fs.mkdirSync(path.join(dir, "x/y/mocks"), { recursive: true });
			fs.writeFileSync(path.join(dir, "x/y/mocks/a.js"), "module.exports = { 'GET /api/deep': { deep: true } };");
			await waitFor(async () => (await fetch(`${deep.url}/api/deep`)).status === 200, 5000);
			expect((await fetch(`${deep.url}/api/sibling`)).status).toBe(404);
			await deep.close();
			const nested = await startMock({ cwd: dir, folder: "no/such/mocks", stateFile: "state.json", port: 0, watch: false });
			expect(warns.filter(w => w.includes("mock 目录不存在")).length).toBe(3);
			expect(warns.at(-1)).toMatch(/重启/);
			await nested.close();
			const ok = await startMock({ cwd: dir, folder: "mocks", stateFile: "state.json", port: 0, watch: false });
			expect(warns.filter(w => w.includes("mock 目录不存在")).length).toBe(3);
			await ok.close();
		} finally {
			spy.mockRestore();
		}
	});

	it("内置路由文件不存在时报出该文件路径", () => {
		const dir = fixture();
		expect(() => loadBuiltin("nope.ts", dir)).toThrow(`内置路由文件不存在: ${path.join(dir, "nope.ts")}`);
		expect(() => loadBuiltin("nope.ts", dir)).not.toThrow(/_easy-mok-cli/);
		expect(loadBuiltin("builtin", dir)).toEqual({ "GET /builtin": { builtin: 1 } }); // 省略扩展名仍可加载
	});

	it("端口被占用时给出可读错误", async () => {
		const blocker = http.createServer();
		const port = await listen(blocker);
		const dir = fixture();
		await expect(startMock({ cwd: dir, folder: "mocks", stateFile: "state.json", port, watch: false })).rejects.toThrow(/端口 \d+ 已被占用/);
		await new Promise(resolve => blocker.close(resolve));
	});
});

describe("命令行参数", () => {
	it("解析参数, 命令行优先于环境变量, 未给出的留空交给 createMock", () => {
		expect(parseCliArgs([], {}).options).toEqual({});
		expect(parseCliArgs(["--folder", "m", "--port=0", "--host", "0.0.0.0", "--builtin", "b.ts", "--no-ui", "--no-float", "--lan", "--hosts", "a.test, b.test"], {}).options)
			.toEqual({ folder: "m", port: 0, host: "0.0.0.0", builtinFile: "b.ts", ui: false, float: false, lan: true, hosts: ["a.test", "b.test"] });
		const env = { MOCK_PORT: "5000", MOCK_FOLDER: "envm", MOCK_HOST: "0.0.0.0", MOCK_BUILTIN: "x.js" };
		expect(parseCliArgs([], env).options).toEqual({ port: 5000, folder: "envm", host: "0.0.0.0", builtinFile: "x.js" });
		expect(parseCliArgs(["--port", "6000", "--folder", "cli"], env).options).toMatchObject({ port: 6000, folder: "cli", host: "0.0.0.0" });
		expect(parseCliArgs(["--ignore", "/health, GET /x/**"], {}).options.ignore).toEqual(["/health", "GET /x/**"]);
		expect(parseCliArgs([], { MOCK_IGNORE: "/a" }).options.ignore).toEqual(["/a"]);
		expect(parseCliArgs(["--ignore", "/b"], { MOCK_IGNORE: "/a" }).options.ignore).toEqual(["/b"]);
		expect(parseCliArgs(["-h"]).help).toBe(true);
		expect(parseCliArgs(["--version"]).version).toBe(true);
		expect(parseCliArgs(["--port", "abc"]).error).toMatch(/端口/);
		expect(parseCliArgs(["--nope"]).error).toMatch(/未知参数/);
		expect(parseCliArgs(["--folder"]).error).toMatch(/缺少取值/);
	});

	it("取值以 - 开头时报缺少取值, = 写法可显式传入; -- 结束选项解析", () => {
		expect(parseCliArgs(["--folder", "-v"], {}).error).toMatch(/参数 --folder 缺少取值/);
		expect(parseCliArgs(["--port", "-1"], {}).error).toMatch(/参数 --port 缺少取值/);
		expect(parseCliArgs(["--hosts", "--lan"], {}).error).toMatch(/参数 --hosts 缺少取值/);
		expect(parseCliArgs(["--folder=-v"], {}).options).toEqual({ folder: "-v" });
		expect(parseCliArgs(["--lan", "--"], {}).options).toEqual({ lan: true });
		expect(parseCliArgs(["--", "--port", "1"], {}).options).toEqual({ port: 1 }); // pnpm run x -- --port 1 原样传入的 -- 被忽略
		expect(parseCliArgs(["--", "extra"], {}).error).toMatch(/无法识别的参数: extra/);
	});
});

describe("命令行进程", () => {
	/** 经 jiti 运行 TS 源码的 CLI, 等到打印出管理页地址 */
	const run = (args, cwd, env = {}) => {
		const code = `require(${JSON.stringify(require.resolve("jiti"))}).createJiti(${JSON.stringify(CLI)})(${JSON.stringify(CLI)}).main(process.argv.slice(1)).then(c => { if (c !== null) process.exitCode = c; })`;
		const child = spawn(process.execPath, ["-e", code, "--", ...args], { cwd, env: { ...process.env, MOCK_UI: "", MOCK_HOSTS: "", ...env }, stdio: ["ignore", "pipe", "pipe"] });
		let out = "";
		child.stdout.on("data", d => { out += d; });
		child.stderr.on("data", d => { out += d; });
		const exited = new Promise(resolve => child.on("exit", (code, signal) => resolve({ code, signal })));
		const ready = new Promise((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error(`CLI 未就绪: ${out}`)), 10000);
			child.stdout.on("data", () => {
				const m = /mock 服务: (http:\/\/\S+?)\/\n/.exec(out);
				if (m && /mock 目录/.test(out)) { clearTimeout(timer); resolve(m[1]); }
			});
			exited.then(() => { clearTimeout(timer); reject(new Error(`CLI 提前退出: ${out}`)); });
		});
		return { child, ready, exited, output: () => out };
	};

	it("启动后可请求 mock, 内置路由与管理页, SIGINT 后以 0 退出", async () => {
		const dir = fixture();
		fs.mkdirSync(path.join(dir, "node_modules"), { recursive: true });
		const cli = run(["--folder", "mocks", "--port", "0", "--builtin", "builtin.ts"], dir);
		const url = await cli.ready;
		expect(cli.output()).toMatch(/管理页: +http/);
		expect(await (await fetch(`${url}/api/hello`)).json()).toEqual({ hello: "world" });
		expect(await (await fetch(`${url}/builtin`)).json()).toEqual({ builtin: 1 });
		expect((await fetch(`${url}/__mock/api/meta`)).status).toBe(200);
		cli.child.kill("SIGINT");
		expect(await cli.exited).toEqual({ code: 0, signal: null });
	});

	it("短参数被当作取值或内置路由文件不存在时以 1 退出并给出可读错误", async () => {
		const dir = fixture();
		const swallowed = run(["--folder", "-v", "--port", "0"], dir);
		await expect(swallowed.ready).rejects.toThrow(/参数 --folder 缺少取值/);
		expect((await swallowed.exited).code).toBe(1);
		expect(fs.existsSync(path.join(dir, "-v"))).toBe(false);
		const missing = run(["--folder", "mocks", "--port", "0", "--builtin", "nope.ts"], dir);
		await expect(missing.ready).rejects.toThrow(/内置路由文件不存在: \S*nope\.ts/);
		expect((await missing.exited).code).toBe(1);
		expect(missing.output()).not.toMatch(/_easy-mok-cli/);
	});

	it("环境变量 MOCK_PORT 生效, 命令行 --port 优先; 端口占用时以 1 退出并提示", async () => {
		const blocker = http.createServer();
		const port = await listen(blocker);
		const dir = fixture();
		const busy = run(["--folder", "mocks"], dir, { MOCK_PORT: String(port) });
		await expect(busy.ready).rejects.toThrow(/已被占用/);
		expect((await busy.exited).code).toBe(1);
		const ok = run(["--folder", "mocks", "--port", "0"], dir, { MOCK_PORT: String(port) });
		const url = await ok.ready;
		expect(url).not.toContain(`:${port}`);
		ok.child.kill("SIGTERM");
		expect((await ok.exited).code).toBe(0);
		await new Promise(resolve => blocker.close(resolve));
	});
});
