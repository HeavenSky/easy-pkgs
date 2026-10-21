// 用法: npm run test:scripts
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const script = path.join(import.meta.dirname, "shrinkwrap.mjs");

function run(lock) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shrinkwrap-"));
	try {
		fs.writeFileSync(path.join(dir, "package-lock.json"), JSON.stringify(lock));
		execFileSync(process.execPath, [script, dir], { stdio: "ignore" });
		return JSON.parse(fs.readFileSync(path.join(dir, "npm-shrinkwrap.json"), "utf8"));
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

test("去掉 packages 与 dependencies 中的 dev 条目和根节点的 devDependencies", () => {
	const out = run({
		name: "x",
		lockfileVersion: 2,
		packages: {
			"": { name: "x", dependencies: { a: "1" }, devDependencies: { d: "1" } },
			"node_modules/a": { version: "1.0.0" },
			"node_modules/d": { version: "1.0.0", dev: true },
		},
		dependencies: {
			a: {
				version: "1.0.0",
				dependencies: { e: { version: "1.0.0", dev: true }, f: { version: "1.0.0" } },
			},
			d: { version: "1.0.0", dev: true },
		},
	});
	assert.deepEqual(Object.keys(out.packages), ["", "node_modules/a"]);
	assert.equal(out.packages[""].devDependencies, undefined);
	assert.deepEqual(out.packages[""].dependencies, { a: "1" });
	assert.deepEqual(Object.keys(out.dependencies), ["a"]);
	assert.deepEqual(Object.keys(out.dependencies.a.dependencies), ["f"]);
	assert.equal(out.lockfileVersion, 2);
});

test("devOptional 条目保留(它是生产依赖的可选依赖, 同时也被开发依赖用到, 线上安装仍需要)", () => {
	const out = run({
		lockfileVersion: 3,
		packages: { "": {}, "node_modules/o": { version: "1.0.0", devOptional: true } },
	});
	assert.ok(out.packages["node_modules/o"]);
	assert.equal(out.dependencies, undefined);
});
