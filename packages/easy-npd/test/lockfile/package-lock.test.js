const coffee = require("coffee");
const path = require("node:path");
const assert = require("node:assert");
const fs = require("node:fs/promises");
const { lockfileConverter } = require("../../lib/lockfile_resolver");
const Nested = require("../../lib/nested");
const helper = require("../support/helper");

describe("test/lockfile/package-lock.test.js", () => {
	const cwd = helper.fixtures("lockfile");
	const lockfile = require(path.join(cwd, "package-lock.json"));
	const nested = new Nested([]);
	const cleanup = helper.cleanup(cwd);

	beforeEach(cleanup);
	afterEach(cleanup);

	// the Windows path sucks, shamefully skip these tests
	if (process.platform !== "win32") {
		it("should install successfully", async () => {
			await coffee
				.fork(
					helper.npminstall,
					["--from-package-lock", path.join(cwd, "package-lock.json")],
					{ cwd }
				)
				.debug()
				.expect("code", 0)
				.notExpect(
					"stdout",
					"TypeError: Cannot read properties of undefined (reading 'ignoreOptionalDependencies')"
				)
				.end();
			assert.strictEqual(
				await fs.readlink(path.join(cwd, "node_modules", "lodash.has3"), "utf8"),
				".npd/_lodash.has@3.2.1@lodash.has"
			);

			assert.strictEqual(
				await fs.readlink(path.join(cwd, "node_modules", "lodash.has"), "utf8"),
				".npd/_lodash.has@4.0.0@lodash.has"
			);
		});

		it("should convert package-lock.json to .dependencies-tree.json successfully", () => {
			const dependenciesTree = lockfileConverter(
				lockfile,
				{ ignoreOptionalDependencies: true },
				nested
			);

			assert.strictEqual(Object.keys(dependenciesTree).length, 29);
		});
	}

	if (process.platform !== "win32") {
		// npm-shrinkwrap.json 与 package-lock.json 格式相同; 全局 gitignore 常忽略 npm-*.json, 用例里临时复制而不放 fixture
		it("should install from an npm-shrinkwrap.json", async () => {
			const shrinkwrap = path.join(cwd, "npm-shrinkwrap.json");
			await fs.copyFile(path.join(cwd, "package-lock.json"), shrinkwrap);
			try {
				await coffee
					.fork(helper.npminstall, ["--from-package-lock", shrinkwrap], { cwd })
					.debug()
					.expect("code", 0)
					.end();
				assert.strictEqual(
					await fs.readlink(path.join(cwd, "node_modules", "lodash.has"), "utf8"),
					".npd/_lodash.has@4.0.0@lodash.has"
				);
			} finally {
				await fs.rm(shrinkwrap, { force: true });
			}
		});
	}

	it("should reject a lockfileVersion 1 lockfile and suggest npm 7 or later", () => {
		assert.throws(
			() =>
				lockfileConverter(
					{ lockfileVersion: 1, dependencies: {} },
					{ ignoreOptionalDependencies: true },
					nested
				),
			/lockfileVersion 1 is not supported, regenerate it with npm 7 or later/
		);
	});

	it("should fail when the lockfile can not be loaded", async () => {
		await coffee
			.fork(helper.npminstall, ["--from-package-lock", path.join(cwd, "missing-lock.json")], {
				cwd,
			})
			.debug()
			.expect("code", 1)
			.expect("stderr", /load lockfile from .*missing-lock\.json error/)
			.end();
	});
});
