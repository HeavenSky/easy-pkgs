// 按 suites.json 把各官方语料钉死版本浅克隆到 <仓库根>/.cache/official/<名称>@<提交>/; 已完成的跳过.
// 下载内容只当数据读取, 本目录的脚本不执行其中任何代码.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const here = path.dirname(fileURLToPath(import.meta.url));
export const cacheRoot = process.env.OFFICIAL_CACHE
	? path.resolve(process.env.OFFICIAL_CACHE)
	: path.resolve(here, "../../.cache/official");
export const suites = JSON.parse(readFileSync(path.join(here, "suites.json"), "utf8"));

export function suiteDir(name) {
	return path.join(cacheRoot, `${name}@${suites[name].commit.slice(0, 12)}`);
}

function git(cwd, ...args) {
	execFileSync("git", args, {
		cwd,
		stdio: ["ignore", "ignore", "inherit"],
		timeout: 15 * 60 * 1000,
	});
}

export function fetchAll() {
	for (const [name, suite] of Object.entries(suites)) {
		const dir = suiteDir(name);
		const done = path.join(dir, ".official-done");
		if (existsSync(done)) continue;
		rmSync(dir, { recursive: true, force: true });
		mkdirSync(dir, { recursive: true });
		console.log(`下载 ${name}@${suite.commit.slice(0, 12)}`);
		git(dir, "init", "-q");
		git(dir, "remote", "add", "origin", suite.repo);
		if (suite.sparse) {
			git(dir, "config", "core.sparseCheckout", "true");
			writeFileSync(
				path.join(dir, ".git/info/sparse-checkout"),
				suite.sparse.join("\n") + "\n"
			);
		}
		git(dir, "fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", suite.commit);
		git(dir, "checkout", "-q", "FETCH_HEAD");
		writeFileSync(done, suite.commit + "\n");
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) fetchAll();
