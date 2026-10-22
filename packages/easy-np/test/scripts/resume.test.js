const assert = require("node:assert");
const path = require("node:path");
const util = require("node:util");
const fs = require("node:fs/promises");
const { realpathSync } = require("node:fs");
const npminstall = require("../support/npminstall");
const helper = require("../support/helper");
const { getInstallState, sourceSuffix } = require("../../lib/utils");
const { rebuild: rebuildPackages } = require("../..");

describe("test/scripts/resume.test.js", () => {
	const [root, cleanup] = helper.tmp();
	const logFile = path.join(root, "scripts.log");
	const flagFile = path.join(root, "postinstall.ok");
	const pkgDir = path.join(
		root,
		`node_modules/.np/resume-scripts@1.0.0+${sourceSuffix("file", realpathSync.native(helper.fixtures("resume-scripts")))}`,
		"node_modules/resume-scripts"
	);
	const install = (extra = {}) =>
		npminstall({
			root,
			pkgs: [{ version: helper.fixtures("resume-scripts"), type: "local" }],
			env: { RESUME_LOG: logFile, RESUME_FLAG: flagFile },
			...extra,
		});
	const readLog = async () => (await fs.readFile(logFile, "utf8")).trim().split("\n");

	beforeEach(cleanup);
	afterEach(cleanup);

	it("should continue from the failed script on next install", async () => {
		await assert.rejects(
			install(),
			/run np again to continue from where they stopped:\n {2}- .*resume-scripts.*: run postinstall error/
		);
		let pkg = (await getInstallState(pkgDir)) || {};
		// 进度标记写在 store 的状态文件里, 不修改依赖包自己的 package.json
		assert.equal(
			(await helper.readJSON(path.join(pkgDir, "package.json"))).__np_stage,
			undefined
		);
		assert.equal(pkg.done, true);
		assert.equal(pkg.stage, "postinstall");
		assert.deepEqual(await readLog(), ["preinstall", "postinstall"]);

		await fs.writeFile(flagFile, "");
		await install();
		pkg = (await getInstallState(pkgDir)) || {};
		assert.equal(pkg.stage, undefined);
		// preinstall 已成功, 不再重复执行
		assert.deepEqual(await readLog(), ["preinstall", "postinstall", "postinstall"]);

		// 已完成的包不再执行脚本
		await install();
		assert.deepEqual(await readLog(), ["preinstall", "postinstall", "postinstall"]);

		await install({ rebuild: true });
		assert.deepEqual(await readLog(), [
			"preinstall",
			"postinstall",
			"postinstall",
			"preinstall",
			"postinstall",
		]);
	});

	it("should summarize resumed packages in one line unless --detail", async () => {
		await assert.rejects(install());
		await fs.writeFile(flagFile, "");
		const logs = { info: [], warn: [] };
		await install({
			console: {
				info: (...args) => logs.info.push(util.format(...args)),
				log() {},
				warn: (...args) => logs.warn.push(util.format(...args)),
				error() {},
			},
		});
		// 逐包明细走 info(只在 --detail 时可见), 汇总只有一行
		assert(
			logs.info.some(line =>
				/\[np:resume\] .*resume-scripts.* continue from postinstall/.test(line)
			)
		);
		assert.deepEqual(
			logs.warn.filter(line => line.includes("np:resume")),
			[
				"[np:resume] continued 1 package(s) left unfinished by the previous run, run with --detail to list them",
			]
		);
	});

	it("should rerun scripts of the listed packages with np-x rebuild <pkg>", async () => {
		// rebuild 按 registry 包处理已安装的版本, 需要在 allowScripts 中放行
		await fs.writeFile(
			path.join(root, "package.json"),
			JSON.stringify({ allowScripts: { "resume-scripts": true } })
		);
		await fs.writeFile(flagFile, "");
		await install();
		const rebuild = specs =>
			rebuildPackages({
				root,
				rebuildSpecs: specs,
				env: { RESUME_LOG: logFile, RESUME_FLAG: flagFile },
			});
		const rebuilt = await rebuild([
			{ raw: "resume-scripts@^1", name: "resume-scripts", range: "^1" },
		]);
		assert.deepEqual(
			rebuilt.map(item => item.dir),
			[pkgDir]
		);
		assert.deepEqual(await readLog(), [
			"preinstall",
			"postinstall",
			"preinstall",
			"postinstall",
		]);
		const pkg = (await getInstallState(pkgDir)) || {};
		assert.equal(pkg.stage, undefined);

		await assert.rejects(
			rebuild([{ raw: "resume-scripts@^2", name: "resume-scripts", range: "^2" }]),
			/resume-scripts@\^2 is not installed/
		);

		await fs.rm(flagFile);
		await assert.rejects(
			rebuild([{ raw: "resume-scripts", name: "resume-scripts", range: null }]),
			/run np-x rebuild resume-scripts again/
		);
	});

	it("should rerun the listed packages in dependency order with np-x rebuild <pkg>", async () => {
		await fs.writeFile(
			path.join(root, "package.json"),
			JSON.stringify({
				name: "rebuild-order-root",
				version: "1.0.0",
				dependencies: { "rebuild-order-parent": "file:../rebuild-order-parent" },
				allowScripts: { "rebuild-order-parent": true, "resume-scripts": true },
			})
		);
		await fs.writeFile(flagFile, "");
		const env = { RESUME_LOG: logFile, RESUME_FLAG: flagFile };
		await npminstall({ root, env });
		await fs.rm(logFile);
		// 先列出依赖它的 rebuild-order-parent, 仍先重跑被依赖的 resume-scripts
		await rebuildPackages({
			root,
			rebuildSpecs: [
				{ raw: "rebuild-order-parent", name: "rebuild-order-parent", range: null },
				{ raw: "resume-scripts", name: "resume-scripts", range: null },
			],
			env,
		});
		assert.deepEqual(await readLog(), ["preinstall", "postinstall", "parent"]);
	});

	it("should keep installing other packages when one fails and resume only the failed one", async () => {
		await fs.writeFile(
			path.join(root, "package.json"),
			JSON.stringify({
				name: "keep-going-root",
				version: "1.0.0",
				dependencies: {
					"resume-scripts": "file:../resume-scripts",
					"keep-going-ok": "file:../keep-going-ok",
				},
				scripts: { postinstall: "node ../resume-scripts/log.js root-postinstall" },
			})
		);
		const installRoot = () =>
			npminstall({ root, env: { RESUME_LOG: logFile, RESUME_FLAG: flagFile } });
		await assert.rejects(installRoot(), /1 package\(s\) failed, run np again/);
		// 失败的包不影响其余包; 有依赖失败时跳过根包脚本
		assert.deepEqual((await readLog()).sort(), ["ok-postinstall", "postinstall", "preinstall"]);

		await fs.writeFile(flagFile, "");
		await installRoot();
		assert.deepEqual((await readLog()).sort(), [
			"ok-postinstall",
			"postinstall",
			"postinstall",
			"preinstall",
			"root-postinstall",
		]);
		const okPkg = (await getInstallState(path.join(root, "node_modules/keep-going-ok"))) || {};
		assert.equal(okPkg.stage, undefined);
	});

	it("should reach the failed dependency through its parent on next install", async () => {
		// file: 依赖按安装根目录解析, root 位于 fixtures 下
		await fs.writeFile(
			path.join(root, "package.json"),
			JSON.stringify({
				name: "resume-root",
				version: "1.0.0",
				dependencies: { "resume-parent": "file:../resume-parent" },
			})
		);
		const installRoot = () =>
			npminstall({ root, env: { RESUME_LOG: logFile, RESUME_FLAG: flagFile } });
		await assert.rejects(installRoot(), /continue from/);
		assert.deepEqual(await readLog(), ["preinstall", "postinstall"]);

		await fs.writeFile(flagFile, "");
		await installRoot();
		assert.deepEqual(await readLog(), ["preinstall", "postinstall", "postinstall"]);

		await installRoot();
		assert.deepEqual(await readLog(), ["preinstall", "postinstall", "postinstall"]);
	});

	it("should run dependency scripts after the whole tree is linked", async () => {
		// script-order-peer 要等子依赖较慢的 preinstall 跑完才会链接; 依赖脚本若逐包立即运行, needs-peer 的脚本找不到它
		await fs.writeFile(
			path.join(root, "package.json"),
			JSON.stringify({
				name: "script-order-root",
				version: "1.0.0",
				dependencies: {
					"script-order-needs-peer": "file:../script-order-needs-peer",
					"script-order-pre-needs-peer": "file:../script-order-pre-needs-peer",
					"script-order-peer": "file:../script-order-peer",
				},
			})
		);
		await npminstall({ root });
	});

	it("should skip the optional dependency when a dependency inside it fails", async () => {
		await fs.writeFile(
			path.join(root, "package.json"),
			JSON.stringify({
				name: "optional-root",
				version: "1.0.0",
				optionalDependencies: { "resume-parent": "file:../resume-parent" },
			})
		);
		// 失败的是可选依赖下的普通子依赖: 与 npm 一样只跳过该可选依赖, 整次安装成功
		await npminstall({ root, env: { RESUME_LOG: logFile, RESUME_FLAG: flagFile } });
		assert.deepEqual(await readLog(), ["preinstall", "postinstall"]);
		await assert.rejects(fs.lstat(path.join(root, "node_modules/resume-parent")), /ENOENT/);

		// 下次运行重试该可选依赖, 子依赖从失败的脚本继续
		await fs.writeFile(flagFile, "");
		await npminstall({ root, env: { RESUME_LOG: logFile, RESUME_FLAG: flagFile } });
		assert.deepEqual(await readLog(), ["preinstall", "postinstall", "postinstall"]);
		assert.ok(await fs.lstat(path.join(root, "node_modules/resume-parent")));
	});

	it("should also remove the fallback link of a skipped nested optional dependency", async () => {
		await fs.writeFile(
			path.join(root, "package.json"),
			JSON.stringify({
				name: "nested-optional-root",
				version: "1.0.0",
				dependencies: { "opt-holder": "file:../opt-holder" },
			})
		);
		// resume-parent 是 opt-holder 的可选依赖, 不在根依赖中, 会被链接到回退目录 .np/node_modules
		await npminstall({ root, env: { RESUME_LOG: logFile, RESUME_FLAG: flagFile } });
		await assert.rejects(
			fs.lstat(path.join(root, "node_modules/.np/node_modules/resume-parent")),
			/ENOENT/
		);
		await assert.rejects(
			fs.lstat(
				path.join(
					await fs.realpath(path.join(root, "node_modules/opt-holder")),
					"../resume-parent"
				)
			),
			/ENOENT/
		);
	});

	it("should not run queued scripts inside an optional dependency skipped by a failed download", async () => {
		await fs.writeFile(
			path.join(root, "package.json"),
			JSON.stringify({
				name: "optional-partial-root",
				version: "1.0.0",
				optionalDependencies: { "optional-partial": "file:../optional-partial" },
			})
		);
		await fs.writeFile(flagFile, "");
		await npminstall({ root, env: { RESUME_LOG: logFile, RESUME_FLAG: flagFile } });
		await assert.rejects(fs.lstat(path.join(root, "node_modules/optional-partial")), /ENOENT/);
		// 同一可选依赖下的 resume-scripts 已排队, 但所在可选依赖因兄弟依赖下载失败被跳过, 它的脚本不再运行
		await assert.rejects(fs.stat(logFile), /ENOENT/);
	});

	it("should fail when the failed package is also a required dependency", async () => {
		await fs.writeFile(
			path.join(root, "package.json"),
			JSON.stringify({
				name: "optional-and-required-root",
				version: "1.0.0",
				dependencies: { "resume-scripts": "file:../resume-scripts" },
				optionalDependencies: { "resume-parent": "file:../resume-parent" },
			})
		);
		// resume-scripts 在可选依赖里, 但根包也直接依赖它: 脚本失败不能当作可选依赖失败跳过
		await assert.rejects(
			npminstall({ root, env: { RESUME_LOG: logFile, RESUME_FLAG: flagFile } }),
			/resume-scripts.*: run postinstall error/
		);
	});

	it("should run root preinstall after the dependencies are installed", async () => {
		// 与 npm 7+ 一致: 根包的 preinstall 在依赖全部安装之后运行, 可以加载依赖
		await fs.writeFile(
			path.join(root, "package.json"),
			JSON.stringify({
				name: "root-preinstall",
				version: "1.0.0",
				scripts: { preinstall: "node -e \"require('script-order-peer')\"" },
				dependencies: { "script-order-peer": "file:../script-order-peer" },
			})
		);
		await npminstall({ root });
	});
});
