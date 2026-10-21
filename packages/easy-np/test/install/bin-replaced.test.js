const assert = require("node:assert");
const path = require("node:path");
const fs = require("node:fs/promises");
const { execFile } = require("node:child_process");
const coffee = require("coffee");
const helper = require("../support/helper");

// esbuild 等包的 postinstall 把 bin 入口从 JS 换成原生程序; .bin 下的入口要按换过之后的内容执行
describe("test/install/bin-replaced.test.js", () => {
	const [tmp, cleanup] = helper.tmp();
	const [cache, cleanupCache] = helper.tmp();
	let registry;
	const env = () => ({ ...process.env, np_cache: cache, npm_config_cache: cache });
	const runBin = args =>
		new Promise(resolve =>
			execFile(path.join(tmp, "node_modules/.bin/swapbin"), args, (err, stdout, stderr) =>
				resolve({ code: err ? err.code : 0, stdout, stderr })
			)
		);

	before(async () => {
		registry = helper.createRegistry("registry", []);
		await new Promise(resolve => registry.server.listen(0, "127.0.0.1", resolve));
		registry.prefix = `http://127.0.0.1:${registry.server.address().port}/`;
	});
	after(() => registry.server.close());
	beforeEach(async () => {
		await cleanup();
		await cleanupCache();
		const tarball = await helper.packTarball(
			tmp,
			{
				name: "swapbin",
				version: "1.0.0",
				bin: { swapbin: "bin/swapbin" },
				scripts: { postinstall: "node swap.js" },
			},
			{
				"bin/swapbin":
					'#!/usr/bin/env node\nconsole.log("js entry", process.argv.slice(2).join(","))\n',
				"swap.js":
					'require("fs").writeFileSync("bin/swapbin", "#!/bin/sh\\necho \\"sh entry $*\\"\\n", { mode: 0o755 })\n',
			}
		);
		registry.packages = { swapbin: { "1.0.0": tarball } };
		await fs.writeFile(
			path.join(tmp, "package.json"),
			JSON.stringify({ name: "root", version: "1.0.0", dependencies: { swapbin: "1.0.0" } })
		);
	});
	afterEach(async () => {
		await cleanup();
		await cleanupCache();
	});

	it("should run the entry replaced by postinstall", async function () {
		if (process.platform === "win32") this.skip();
		await coffee
			.fork(helper.npminstall, [`--registry=${registry.prefix.slice(0, -1)}`], {
				cwd: tmp,
				env: env(),
			})
			.expect("code", 0)
			.end();
		const res = await runBin(["a", "b"]);
		assert.equal(res.stderr, "");
		assert.equal(res.stdout.trim(), "sh entry a b");
	});

	it("should run the entry replaced by np-x rebuild after the scripts were skipped", async function () {
		if (process.platform === "win32") this.skip();
		const x = path.join(__dirname, "../..", "bin", "x.js");
		await coffee
			.fork(x, ["install", "--no-lockfile", `--registry=${registry.prefix.slice(0, -1)}`], {
				cwd: tmp,
				env: env(),
			})
			.expect("code", 0)
			.end();
		// 安装脚本未放行, 入口仍是 JS
		assert.equal((await runBin(["a"])).stdout.trim(), "js entry a");
		await coffee
			.fork(
				x,
				[
					"rebuild",
					"swapbin",
					"--allow-scripts=swapbin",
					`--registry=${registry.prefix.slice(0, -1)}`,
				],
				{ cwd: tmp, env: env() }
			)
			.expect("code", 0)
			.end();
		const res = await runBin(["a", "b"]);
		assert.equal(res.stderr, "");
		assert.equal(res.stdout.trim(), "sh entry a b");
	});
});
