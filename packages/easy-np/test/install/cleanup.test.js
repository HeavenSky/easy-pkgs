const assert = require("node:assert");
const path = require("node:path");
const fs = require("node:fs/promises");
const coffee = require("coffee");
const npminstall = require("../support/npminstall");
const helper = require("../support/helper");
const { getInstallState } = require("../../lib/utils");

describe("test/install/cleanup.test.js", () => {
	const [tmp, cleanup] = helper.tmp();

	beforeEach(cleanup);
	afterEach(cleanup);

	it("should remove donefile when install failed", async () => {
		let throwError = false;
		try {
			await npminstall({ root: tmp, pkgs: [{ name: "install-error", version: "latest" }] });
		} catch {
			throwError = true;
		}
		assert(throwError);

		// 子依赖失败不中止安装, install-error 照常链接, 但保留阶段标记, 下次运行经由它找到失败的子依赖
		const state = await getInstallState(path.join(tmp, "node_modules/install-error"));
		assert.equal(state.stage, "finish");

		// install again will try to download
		throwError = false;
		try {
			await npminstall({ root: tmp, pkgs: [{ name: "install-error", version: "latest" }] });
		} catch {
			throwError = true;
		}
		assert.equal(throwError, true);
	});

	it("should remove donefile when execute postinstall script failed", async () => {
		let throwError = false;
		const pkgs = [{ version: "../postinstall-error", type: "local" }];
		try {
			await npminstall({ root: tmp, pkgs });
		} catch {
			throwError = true;
		}
		assert.equal(throwError, true);

		// install again will try to download
		throwError = false;
		try {
			await npminstall({ root: tmp, pkgs });
		} catch {
			throwError = true;
		}
		assert.equal(throwError, true);
	});

	it("should move packages installed by an older version from node_modules/.store into node_modules/.np", async () => {
		// 0.0.6 及更早版本的布局: 包版本目录在 node_modules/.store 下, 顶层链接与 .bin 入口指向它
		await fs.writeFile(
			path.join(tmp, "package.json"),
			JSON.stringify({ name: "root", version: "1.0.0", dependencies: { pedding: "1.0.0" } })
		);
		const nodeModules = path.join(tmp, "node_modules");
		const legacy = path.join(nodeModules, ".store/pedding@1.0.0/node_modules/pedding");
		await fs.mkdir(legacy, { recursive: true });
		await fs.mkdir(path.join(nodeModules, ".bin"));
		await fs.writeFile(
			path.join(legacy, "package.json"),
			JSON.stringify({ name: "pedding", version: "1.0.0" })
		);
		await fs.writeFile(path.join(legacy, "cli.js"), "");
		await fs.symlink(legacy, path.join(nodeModules, "pedding"), "junction");
		// Windows 上创建文件符号链接需要额外权限, 只在其他平台检查 .bin 入口
		const checkBin = process.platform !== "win32";
		if (checkBin)
			await fs.symlink(
				path.join(legacy, "cli.js"),
				path.join(nodeModules, ".bin/pedding-cli")
			);
		await fs.writeFile(
			path.join(nodeModules, ".store/.np-state.json"),
			JSON.stringify({ packages: { "pedding@1.0.0/node_modules/pedding": { done: true } } })
		);

		await coffee
			.fork(helper.npminstall, [], {
				cwd: tmp,
				env: { ...process.env, np_lockfile: "false" },
			})
			.expect("code", 0)
			.expect("stderr", /move node_modules\/\.store to node_modules\/\.np/)
			.end();
		const names = await fs.readdir(nodeModules);
		assert(!names.includes(".store"), names.join(", "));
		if (checkBin)
			assert(!(await fs.readdir(path.join(nodeModules, ".bin"))).includes("pedding-cli"));
		assert.equal(
			await fs.realpath(path.join(nodeModules, "pedding")),
			await fs.realpath(path.join(nodeModules, ".np/pedding@1.0.0/node_modules/pedding"))
		);
	});
});
