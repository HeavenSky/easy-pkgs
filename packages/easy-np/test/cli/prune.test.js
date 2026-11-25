const assert = require("node:assert");
const path = require("node:path");
const fs = require("node:fs/promises");
const coffee = require("coffee");
const helper = require("../support/helper");

describe("test/cli/prune.test.js", () => {
	const [tmp, cleanup] = helper.tmp();
	const store = path.join(tmp, "node_modules/.np");
	const x = path.join(__dirname, "../..", "bin", "x.js");
	const writePkg = dependencies =>
		fs.writeFile(
			path.join(tmp, "package.json"),
			JSON.stringify({ name: "root", version: "1.0.0", dependencies })
		);
	const run = (bin, args) =>
		coffee.fork(bin, args, { cwd: tmp, env: { ...process.env, np_lockfile: "false" } });
	const storeEntries = async () =>
		(await fs.readdir(store)).filter(name => name.includes("@")).sort();

	const outside = `${tmp}-outside`;
	const removeOutside = () => fs.rm(outside, { recursive: true, force: true });

	beforeEach(cleanup);
	afterEach(async () => {
		await cleanup();
		await removeOutside();
	});

	it("should keep every version when run from a symlink to the project", async () => {
		await writePkg({ debug: "4.3.4" });
		await run(helper.npminstall, []).expect("code", 0).end();
		await fs.symlink(tmp, outside, "junction");
		await coffee
			.fork(x, ["prune", "--dry-run"], { cwd: outside })
			.expect("code", 0)
			.expect("stdout", /Found 0 unreferenced/)
			.end();
	});

	it("should keep every version when node_modules is a symlink", async function () {
		if (process.platform === "win32") this.skip();
		await writePkg({ debug: "4.3.4" });
		await run(helper.npminstall, []).expect("code", 0).end();
		const before = await storeEntries();
		await fs.rename(path.join(tmp, "node_modules"), outside);
		await fs.symlink(outside, path.join(tmp, "node_modules"));
		await run(x, ["prune"])
			.expect("code", 0)
			.expect("stdout", /Removed 0 unreferenced/)
			.end();
		assert.deepEqual(await storeEntries(), before);
	});

	it("should remove versions left by upgrades only when asked, and by uninstalls right away", async () => {
		await writePkg({ debug: "4.3.4", pedding: "1.1.0" });
		await run(helper.npminstall, []).expect("code", 0).end();
		await writePkg({ debug: "3.2.7", pedding: "1.1.0" });
		await run(helper.npminstall, []).expect("code", 0).end();
		// 重装不删除旧版本
		const before = await storeEntries();
		assert(before.includes("debug@4.3.4"));
		assert(before.includes("pedding@1.1.0"));

		await run(x, ["prune", "--dry-run"])
			.expect("code", 0)
			.expect("stdout", /would remove debug@4\.3\.4/)
			.end();
		assert.deepEqual(await storeEntries(), before);

		await run(x, ["prune"])
			.expect("code", 0)
			.expect("stdout", /removed debug@4\.3\.4/)
			.end();
		// 卸载后立即回收被卸载的版本
		await run(x, ["uninstall", "pedding"])
			.expect("code", 0)
			.expect("stdout", /- pedding@1\.1\.0/)
			.end();
		const after = await storeEntries();
		assert.deepEqual(after, ["debug@3.2.7", "ms@2.1.3"]);
		const state = await helper.readJSON(path.join(store, ".np-state.json"));
		const stateEntries = Object.keys(state.packages).map(key => key.split("/")[0]);
		assert.deepEqual(stateEntries.sort(), after);
		// 回退目录不留指向已删除版本的链接
		for (const name of await fs.readdir(path.join(store, "node_modules"))) {
			await fs.stat(path.join(store, "node_modules", name));
		}
		await run(helper.npminstall, []).expect("code", 0).end();
		assert.equal(require(path.join(tmp, "node_modules/debug/package.json")).version, "3.2.7");
	});

	it("should prune selected fields and retain shared versions and peer links", async () => {
		const modules = path.join(tmp, "node_modules");
		const storePackage = (pkg, version) =>
			path.join(modules, ".np", `${pkg}@${version}/node_modules`, pkg);
		const manifest = JSON.stringify({
			dependencies: { app: "1.0.0" },
			devDependencies: { devtool: "1.0.0" },
			clientDependencies: { client: "1.0.0" },
		});
		const pkgFile = path.join(tmp, "package.json");
		await fs.writeFile(pkgFile, manifest);
		await fs.writeFile(path.join(tmp, "np-lock.json"), "{}");
		for (const [name, version, deps] of [
			[
				"app",
				"1.0.0",
				{ dependencies: { shared: "1.0.0" }, peerDependencies: { peer: "*" } },
			],
			["shared", "1.0.0"],
			["shared", "2.0.0"],
			["peer", "1.0.0"],
			["devtool", "1.0.0"],
			["client", "1.0.0"],
		]) {
			const dir = storePackage(name, version);
			await fs.mkdir(dir, { recursive: true });
			await fs.writeFile(
				path.join(dir, "package.json"),
				JSON.stringify({ name, version, ...deps })
			);
		}
		for (const name of ["app", "devtool", "peer", "client"]) {
			await fs.symlink(storePackage(name, "1.0.0"), path.join(modules, name), "junction");
		}
		const sharedDir = path.join(path.dirname(storePackage("app", "1.0.0")), "shared");
		await fs.mkdir(path.dirname(sharedDir), { recursive: true });
		const sharedBridge = path.join(modules, "shared-bridge");
		await fs.symlink(storePackage("shared", "1.0.0"), sharedBridge, "junction");
		await fs.symlink(sharedBridge, sharedDir, "junction");
		await fs.symlink(storePackage("shared", "2.0.0"), path.join(modules, "shared"), "junction");
		const external = path.join(tmp, "external");
		await fs.mkdir(external);
		await fs.symlink(external, path.join(modules, "undeclared"), "junction");

		const binDir = path.join(modules, ".bin");
		await fs.mkdir(binDir);
		for (const name of ["tool", "tool.cmd", "tool.ps1"]) {
			await fs.writeFile(path.join(binDir, name), "../devtool/cli.js");
		}
		await fs.writeFile(path.join(binDir, "other"), "../devtool-other/cli.js");

		await run(x, ["prune", "--only=prod", "--only=client", "--dry-run"])
			.expect("code", 0)
			.expect("stdout", /would remove .*devtool/)
			.notExpect("stdout", /would remove .*client/)
			.end();
		await run(x, ["prune", "--only=typo"])
			.expect("code", 1)
			.expect("stderr", /no typoDependencies/)
			.end();
		await fs.lstat(path.join(modules, "undeclared"));
		assert.deepEqual((await fs.readdir(binDir)).sort(), [
			"other",
			"tool",
			"tool.cmd",
			"tool.ps1",
		]);

		await run(x, ["prune", "--prod"])
			.expect("code", 0)
			.expect("stdout", /removed .*undeclared/)
			.end();
		assert.deepEqual((await fs.readdir(binDir)).sort(), ["other"]);
		for (const name of ["devtool", "client", "undeclared", "shared"]) {
			await assert.rejects(fs.lstat(path.join(modules, name)), { code: "ENOENT" });
		}
		await assert.rejects(fs.stat(storePackage("shared", "2.0.0")), { code: "ENOENT" });
		await fs.stat(external);
		await fs.stat(path.join(modules, "app"));
		await fs.stat(path.join(modules, "peer"));
		assert.equal(
			await fs.realpath(sharedDir),
			await fs.realpath(storePackage("shared", "1.0.0"))
		);
		assert.equal(await fs.readFile(pkgFile, "utf8"), manifest);
		assert.equal(await fs.readFile(path.join(tmp, "np-lock.json"), "utf8"), "{}");

		await run(x, ["prune", "--prod", "--dry-run"])
			.expect("code", 0)
			.notExpect("stdout", /would remove/)
			.end();
	});

	it("should apply the selection across workspaces and preserve a linked workspace's peer", async () => {
		const workspace = path.join(tmp, "packages", "app");
		const modules = path.join(tmp, "node_modules");
		await fs.writeFile(
			path.join(tmp, "package.json"),
			JSON.stringify({
				workspaces: ["packages/*"],
				dependencies: { app: "workspace:*" },
				devDependencies: { peer: "*", devtool: "*" },
			})
		);
		await fs.mkdir(path.join(workspace, "node_modules"), { recursive: true });
		await fs.writeFile(
			path.join(workspace, "package.json"),
			JSON.stringify({
				name: "app",
				version: "1.0.0",
				peerDependencies: { peer: "*" },
				devDependencies: { devtool: "*" },
			})
		);
		for (const name of ["peer", "devtool"]) {
			const dir = path.join(store, `${name}@1.0.0`, "node_modules", name);
			await fs.mkdir(dir, { recursive: true });
			await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({ name }));
			await fs.symlink(dir, path.join(modules, name), "junction");
		}
		const devtool = path.join(modules, "devtool");
		const workspaceDevtool = path.join(workspace, "node_modules", "devtool");
		await fs.symlink(devtool, workspaceDevtool, "junction");
		await fs.symlink(workspace, path.join(modules, "app"), "junction");
		const fallbackDir = path.join(store, "node_modules");
		await fs.mkdir(fallbackDir);
		await fs.symlink(devtool, path.join(fallbackDir, "devtool"), "junction");

		await coffee.fork(x, ["prune", "--prod"], { cwd: workspace }).expect("code", 0).end();

		await fs.stat(path.join(modules, "app"));
		await fs.stat(path.join(modules, "peer"));
		for (const link of [devtool, workspaceDevtool, path.join(fallbackDir, "devtool")]) {
			await assert.rejects(fs.lstat(link), { code: "ENOENT" });
		}
		assert.deepEqual(await storeEntries(), ["peer@1.0.0"]);
	});
});
