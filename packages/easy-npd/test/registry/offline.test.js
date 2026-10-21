"use strict";

const assert = require("assert");
const path = require("path");
const fs = require("fs/promises");
const coffee = require("coffee");
const helper = require("../support/helper");

describe("test/registry/offline.test.js", () => {
	const [homedir, cleanupTmp] = helper.tmp();
	const demo = helper.fixtures("install-offline");
	const cleanupModules = helper.cleanup(demo);

	async function cleanup() {
		await cleanupModules();
		await cleanupTmp();
	}

	beforeEach(cleanup);
	afterEach(cleanup);

	it("should install fail when cache manifests not exists", async () => {
		await coffee
			.fork(helper.npminstall, ["--offline"], {
				cwd: demo,
				env: Object.assign({}, process.env, {
					npm_config_cache: path.join(homedir, "foocache/.npminstall_tarball"),
				}),
			})
			.debug()
			.expect("code", 1)
			.expect("stderr", /Can't find package .+? manifests in offline mode/)
			.end();
	});

	it("should install success when cache manifests exists", async () => {
		await coffee
			.fork(helper.npminstall, ["--detail"], {
				cwd: demo,
				env: Object.assign({}, process.env, {
					npm_config_cache: path.join(homedir, "foocache/.npminstall_tarball"),
				}),
			})
			.debug()
			.expect("code", 0)
			.expect("stdout", /All packages installed/)
			.end();

		await cleanupModules();
		await coffee
			.fork(helper.npminstall, ["--detail", "--offline"], {
				cwd: demo,
				env: Object.assign({}, process.env, {
					npm_config_cache: path.join(homedir, "foocache/.npminstall_tarball"),
				}),
			})
			.debug()
			.expect("code", 0)
			.expect("stdout", /All packages installed/)
			.expect(
				"stdout",
				/speed 0B\/s, json 0\(0B\), tarball 0B, manifests cache hit \d+, etag hit 0 \/ miss 0/
			)
			.end();
	});

	it("should fail at once when the tarball is not cached", async () => {
		const env = Object.assign({}, process.env, {
			npm_config_cache: path.join(homedir, "foocache/.npminstall_tarball"),
		});
		await coffee
			.fork(helper.npminstall, [], { cwd: demo, env })
			.debug()
			.expect("code", 0)
			.end();
		await cleanupModules();
		await fs.rm(path.join(homedir, "foocache/.npminstall_tarball/np-tgz"), { recursive: true });
		await coffee
			.fork(helper.npminstall, ["--offline"], { cwd: demo, env })
			.debug()
			.expect("code", 1)
			.expect("stderr", /Can't find tarball .+ in the disk cache in offline mode/)
			.notExpect("stderr", /fail count: 2/)
			.end();
	});

	it("should reject git packages in offline mode", async () => {
		await fs.mkdir(homedir, { recursive: true });
		await fs.writeFile(
			path.join(homedir, "package.json"),
			JSON.stringify({ name: "root", version: "1.0.0" })
		);
		await coffee
			.fork(helper.npminstall, ["--offline", "github:debug-js/debug"], {
				cwd: homedir,
				env: Object.assign({}, process.env, {
					npm_config_cache: path.join(homedir, "cache"),
				}),
			})
			.debug()
			.expect("code", 1)
			.expect("stderr", /git packages are always fetched from the network/)
			.end();
	});

	it("should require the disk cache", async () => {
		await coffee
			.fork(helper.npminstall, ["--offline", "--no-cache"], { cwd: demo })
			.debug()
			.expect("code", 1)
			.expect("stderr", /--offline needs the disk cache/)
			.end();
	});

	it("should not request the network without a cache", async () => {
		const http = require("http");
		const requests = [];
		// 所有请求都经这个代理发出, 收到任何请求都说明 --offline 联网了
		const proxy = http.createServer((req, res) => {
			requests.push(req.url);
			res.statusCode = 502;
			res.end();
		});
		proxy.on("connect", (req, socket) => {
			requests.push(`CONNECT ${req.url}`);
			socket.destroy();
		});
		await new Promise(resolve => proxy.listen(0, "127.0.0.1", resolve));
		const proxyUrl = `http://127.0.0.1:${proxy.address().port}`;
		const cwd = path.join(homedir, "empty-project");
		const cache = path.join(homedir, "empty-cache");
		try {
			await fs.mkdir(cwd, { recursive: true });
			await fs.writeFile(
				path.join(cwd, "package.json"),
				JSON.stringify({ name: "root", version: "1.0.0" })
			);
			await coffee
				.fork(
					helper.npminstall,
					["--offline", `--proxy=${proxyUrl}`, `--https-proxy=${proxyUrl}`],
					{ cwd, env: { ...process.env, np_cache: cache, npm_config_cache: cache } }
				)
				.expect("code", 0)
				.notExpect("stderr", /binary-mirror-config/)
				.notExpect("stdout", /binary-mirror-config/)
				.end();
			assert.deepEqual(requests, []);
		} finally {
			proxy.close();
		}
	});
});
