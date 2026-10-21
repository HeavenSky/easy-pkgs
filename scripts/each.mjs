// 在每个 packages/* 下执行同一个 npm 脚本, 没有该脚本的包跳过.
//
// 用法: node scripts/each.mjs <脚本名> [包目录名...]
// 例: node scripts/each.mjs test; node scripts/each.mjs build easy-comb
// `install` 是特例: 在每个包里按 lockfile 执行 npm ci.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [script, ...only] = process.argv.slice(2);

if (!script) {
	console.error("用法: node scripts/each.mjs <脚本名> [包目录名...]");
	process.exit(2);
}

const packages = readdirSync(path.join(root, "packages"), { withFileTypes: true })
	.filter(
		entry =>
			entry.isDirectory() &&
			existsSync(path.join(root, "packages", entry.name, "package.json"))
	)
	.map(entry => entry.name)
	.filter(name => only.length === 0 || only.includes(name))
	.sort();

const failed = [];
for (const name of packages) {
	const dir = path.join(root, "packages", name);
	const { scripts = {} } = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
	const args = script === "install" ? ["ci"] : ["run", script];
	if (script !== "install" && !scripts[script]) {
		console.log(`- ${name}: 没有 ${script} 脚本, 跳过`);
		continue;
	}

	console.log(`\n> ${name}: npm ${args.join(" ")}`);
	// Windows 上 npm 是 npm.cmd, 需要经由 shell 启动.
	const result = spawnSync("npm", args, {
		cwd: dir,
		stdio: "inherit",
		shell: process.platform === "win32",
	});
	if (result.status !== 0) failed.push(name);
}

if (failed.length) {
	console.error(`\n失败: ${failed.join(", ")}`);
	process.exit(1);
}
