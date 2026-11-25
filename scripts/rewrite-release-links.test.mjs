import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./rewrite-release-links.mjs", import.meta.url));
const args = [script, "packages/demo/CHANGELOG.md", "abc123"];
const env = {
	...process.env,
	GITHUB_REPOSITORY: "example/repo",
	GITHUB_SERVER_URL: "https://github.com",
};

test("相对链接和图片使用发布提交, 并保留查询参数与锚点", () => {
	const result = execFileSync(process.execPath, args, {
		env,
		input: [
			'[用法](./docs/guide.md?mode=full#prune "短标题")',
			"[许可证](../../LICENSE)",
			"[本页](#release-notes)",
			"![界面](./docs/images/界面.png)",
			"[空格](<./docs/a b.md>)",
		].join("\n"),
		encoding: "utf8",
		timeout: 5000,
	});
	const blob = "https://github.com/example/repo/blob/abc123";
	assert.equal(
		result,
		[
			`[用法](${blob}/packages/demo/docs/guide.md?mode=full#prune "短标题")`,
			`[许可证](${blob}/LICENSE)`,
			`[本页](${blob}/packages/demo/CHANGELOG.md#release-notes)`,
			"![界面](https://raw.githubusercontent.com/example/repo/abc123/packages/demo/docs/images/%E7%95%8C%E9%9D%A2.png)",
			`[空格](<${blob}/packages/demo/docs/a%20b.md>)`,
		].join("\n")
	);
});

test("外部链接和代码样例保持原文", () => {
	const input = [
		"[外部](https://example.com/file.md)",
		"[协议相对](//example.com/file.md)",
		"`[内联](./file.md)`",
		"```md",
		"[代码块](./file.md)",
		"```",
	].join("\n");
	assert.equal(
		execFileSync(process.execPath, args, { env, input, encoding: "utf8", timeout: 5000 }),
		input
	);
});

test("缺少发布提交时退出并给出错误", () => {
	const result = spawnSync(process.execPath, args.slice(0, -1), { env, timeout: 5000 });
	assert.equal(result.status, 2);
	assert.match(result.stderr.toString(), /发布提交/);
});
