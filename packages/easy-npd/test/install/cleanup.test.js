"use strict";

const assert = require("assert");
const path = require("path");
const fs = require("fs/promises");
const utils = require("../../lib/utils");
const npminstall = require("../support/npminstall");
const helper = require("../support/helper");

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

		let done = await utils.isInstallDone(
			path.join(tmp, "node_modules/.npd/_install-error@1.0.1@install-error/package.json")
		);
		assert.equal(done, false);
		// 子依赖失败不中止安装, install-error 照常链接, 但保留阶段标记, 下次运行经由它找到失败的子依赖
		const dirs = (await fs.readdir(path.join(tmp, "node_modules"))).filter(
			dir => !dir.startsWith(".")
		);
		assert.deepEqual(dirs.sort(), ["install-error"]);
		const versions = (await fs.readdir(path.join(tmp, "node_modules/.npd"))).filter(
			dir => !dir.startsWith(".")
		);
		assert.deepEqual(versions, ["_install-error@1.0.1@install-error"]);
		const state = await utils.getInstallState(
			path.join(tmp, "node_modules/.npd/_install-error@1.0.1@install-error")
		);
		assert(state.stage);

		// install again will try to download
		throwError = false;
		try {
			await npminstall({ root: tmp, pkgs: [{ name: "install-error", version: "latest" }] });
		} catch {
			throwError = true;
		}
		assert.equal(throwError, true);
		done = await utils.isInstallDone(
			path.join(tmp, "node_modules/.npd/_install-error@1.0.1@install-error/.npminstall.done")
		);
		assert.equal(done, false);
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

		let done = await utils.isInstallDone(
			path.join(
				tmp,
				"node_modules/.npd/_postinstall-error@1.0.0@postinstall-error/.npminstall.done"
			)
		);
		assert.equal(done, false);

		// install again will try to download
		throwError = false;
		try {
			await npminstall({ root: tmp, pkgs });
		} catch {
			throwError = true;
		}
		assert.equal(throwError, true);
		done = await utils.isInstallDone(
			path.join(
				tmp,
				"node_modules/.npd/_postinstall-error@1.0.0@postinstall-error/.npminstall.done"
			)
		);
		assert.equal(done, false);
	});

	it("should move packages installed by an older version into node_modules/.npd", async () => {
		// 0.0.6 及更早版本的布局: 版本目录直接在 node_modules 下, 顶层链接与 .bin 入口指向它
		await fs.writeFile(
			path.join(tmp, "package.json"),
			JSON.stringify({ name: "root", version: "1.0.0", dependencies: { pedding: "1.0.0" } })
		);
		const nodeModules = path.join(tmp, "node_modules");
		const legacy = path.join(nodeModules, "_pedding@1.0.0@pedding");
		await fs.mkdir(path.join(nodeModules, ".bin"), { recursive: true });
		await fs.mkdir(legacy);
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
			path.join(nodeModules, ".npd-state.json"),
			JSON.stringify({ packages: { "_pedding@1.0.0@pedding": { done: true } } })
		);

		await npminstall({ root: tmp });
		const names = await fs.readdir(nodeModules);
		assert(!names.some(name => name.startsWith("_")), names.join(", "));
		assert(!names.includes(".npd-state.json"));
		if (checkBin)
			assert(!(await fs.readdir(path.join(nodeModules, ".bin"))).includes("pedding-cli"));
		assert.equal(
			await fs.realpath(path.join(nodeModules, "pedding")),
			await fs.realpath(path.join(nodeModules, ".npd/_pedding@1.0.0@pedding"))
		);
	});
});
