// 局域网开关: 运行时切换, 只能本机切换, standalone 额外监听私有网段地址
"use strict";
const http = require("http");
const { makeFixture, startHost, waitFor } = require("../helpers/server");
const { loadSrc } = require("../helpers/src");

const { createMock, startMock } = loadSrc();
const { createGuard } = loadSrc("security.ts");
const { privateAddresses } = loadSrc("lan.ts");

const PRIVATE_IP = privateAddresses()[0];
const withPrivateIp = PRIVATE_IP ? it : it.skip;
const PING = { "mocks/a.js": "module.exports = { 'GET /api/ping': { ok: true } };" };

const putLan = (api, access) => api("/lan", { method: "PUT", json: { access } });
/** 以 standalone 方式在随机端口启动 */
const standalone = extra =>
	startMock({
		cwd: makeFixture({ "state.json": "{}", ...PING }),
		folder: "mocks",
		stateFile: "state.json",
		port: 0,
		watch: false,
		...extra,
	});

describe("局域网开关", () => {
	it("运行时切换后管理接口守卫与 mock 的跨域回显立即生效; lan 选项是初始值", async () => {
		let on = false;
		const guard = createGuard({ lan: () => on, hosts: [] });
		const fake = {
			socket: { remoteAddress: "192.168.1.5" },
			headers: { host: "192.168.1.2:3000" },
			method: "GET",
		};
		expect(() => guard(fake)).toThrow(/允许局域网访问/);
		on = true;
		expect(() => guard(fake)).not.toThrow();

		const ctx = await startHost({ files: PING });
		try {
			const origin = "http://192.168.1.9:5173";
			const acao = async () =>
				(await ctx.fetch("/api/ping", { headers: { origin } })).headers.get(
					"access-control-allow-origin"
				);
			expect(await acao()).toBeNull();
			const meta = (await ctx.api("/meta")).body;
			expect(meta.lan).toMatchObject({ access: false, initial: false, canToggle: true });

			const res = await putLan(ctx.api, true);
			expect(res.status).toBe(200);
			expect(res.body).toMatchObject({ access: true, reachable: "no", listening: [] });
			expect(await acao()).toBe(origin);
			expect((await ctx.api("/meta")).body.lan.access).toBe(true);

			expect((await putLan(ctx.api, "yes")).status).toBe(400);
			await putLan(ctx.api, false);
			expect(await acao()).toBeNull();
		} finally {
			await ctx.close();
		}
		const initial = await startHost({ files: PING, options: { lan: true } });
		try {
			expect((await initial.api("/meta")).body.lan).toMatchObject({
				access: true,
				initial: true,
			});
		} finally {
			await initial.close();
		}
	});

	withPrivateIp("局域网来源可以访问管理页, 但不能切换开关", async () => {
		const dir = makeFixture({ "state.json": "{}", ...PING });
		const mock = createMock({
			cwd: dir,
			folder: "mocks",
			stateFile: "state.json",
			lan: true,
			watch: false,
		});
		const server = http.createServer(mock);
		await new Promise(resolve => server.listen(0, PRIVATE_IP, resolve));
		const base = `http://${PRIVATE_IP}:${server.address().port}/__mock/api`;
		try {
			const meta = await (await fetch(`${base}/meta`)).json();
			expect(meta.lan).toMatchObject({ access: true, canToggle: false, reachable: "yes" });
			const res = await fetch(`${base}/lan`, {
				method: "PUT",
				headers: { "x-mock-ui": "1", "content-type": "application/json" },
				body: JSON.stringify({ access: false }),
			});
			expect(res.status).toBe(403);
			expect(mock.mock.lan.access).toBe(true);
		} finally {
			await mock.close();
			if (server.closeAllConnections) server.closeAllConnections();
			await new Promise(resolve => server.close(resolve));
		}
	});

	withPrivateIp("standalone 监听回环地址时, 开关打开期间额外监听私有网段地址", async () => {
		const started = await standalone();
		const lanUrl = `http://${PRIVATE_IP}:${started.port}/api/ping`;
		const api = async (url, init = {}) => {
			const res = await fetch(`${started.url}/__mock/api${url}`, {
				...init,
				headers: { "x-mock-ui": "1", "content-type": "application/json" },
				body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
			});
			return { status: res.status, body: await res.json() };
		};
		try {
			await expect(fetch(lanUrl)).rejects.toThrow();
			await putLan(api, true);
			await waitFor(async () => (await api("/meta")).body.lan.listening.length > 0);
			const meta = (await api("/meta")).body.lan;
			expect(meta.reachable).toBe("yes");
			expect(meta.listening).toContain(`${PRIVATE_IP}:${started.port}`);
			expect(await (await fetch(lanUrl)).json()).toEqual({ ok: true });
			await putLan(api, false);
			await expect(fetch(lanUrl)).rejects.toThrow();
			expect((await api("/meta")).body.lan.listening).toEqual([]);
		} finally {
			await started.close();
		}
	});

	withPrivateIp("standalone 以 lan: true 启动时直接额外监听, close 后关闭", async () => {
		const started = await standalone({ lan: true });
		const lanUrl = `http://${PRIVATE_IP}:${started.port}/api/ping`;
		await waitFor(async () => started.mock.mock.lan.listening.addresses.length > 0);
		expect((await fetch(lanUrl)).status).toBe(200);
		await started.close();
		await expect(fetch(lanUrl)).rejects.toThrow();
	});

	it("主监听不是回环地址时不额外监听", async () => {
		const started = await standalone({ host: "0.0.0.0", lan: true });
		try {
			expect(started.mock.mock.lan.listening.addresses).toEqual([]);
			expect((await fetch(`http://127.0.0.1:${started.port}/api/ping`)).status).toBe(200);
		} finally {
			await started.close();
		}
	});
});
