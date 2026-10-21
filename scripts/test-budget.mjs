// 测试数据预算检查: 统计各包 test/ 下被 git 跟踪的文件数与字节数, 与 test-budget.json 比较, 超出即以非零退出.
// 用法: node scripts/test-budget.mjs [--suggest]; --suggest 只打印当前用量与建议预算(当前值加 5% 取整), 不判定.
// test-budget.json 的 allow 放宽单个文件上限, reasons 记录对应理由(只供阅读).
import { execFileSync } from "node:child_process";
import { lstatSync, openSync, readFileSync, readSync, closeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const budget = JSON.parse(readFileSync(path.join(root, "test-budget.json"), "utf8"));
const suggest = process.argv.includes("--suggest");

// 前 8KB 含 NUL 视为二进制
function isBinary(file) {
	const fd = openSync(file, "r");
	try {
		const buf = Buffer.alloc(8192);
		return buf.subarray(0, readSync(fd, buf, 0, buf.length, 0)).includes(0);
	} finally {
		closeSync(fd);
	}
}

const listed = execFileSync("git", ["ls-files", "-z", "--", "packages"], {
	cwd: root,
	encoding: "utf8",
	maxBuffer: 1 << 26,
})
	.split("\0")
	.filter(rel => rel.split("/")[2] === "test");
const usage = {};
const problems = [];
for (const rel of listed) {
	const pkg = rel.split("/")[1];
	let stat;
	try {
		stat = lstatSync(path.join(root, rel));
	} catch {
		continue; // 已在工作区删除, 尚未提交
	}
	const u = (usage[pkg] ??= { files: 0, bytes: 0 });
	u.files++;
	u.bytes += stat.size;
	if (!stat.isFile()) continue;
	const binary = isBinary(path.join(root, rel));
	const limit = budget.allow[rel] ?? (binary ? budget.maxBinary : budget.maxFile);
	if (stat.size > limit)
		problems.push(
			`${rel}: ${stat.size} 字节, 超过${binary ? "二进制" : "单文件"}上限 ${limit}`
		);
}

const rows = {};
for (const [pkg, u] of Object.entries(usage).sort()) {
	const b = budget.packages[pkg];
	rows[pkg] = {
		文件: u.files,
		文件预算: b?.files ?? "-",
		字节: u.bytes,
		字节预算: b?.bytes ?? "-",
	};
	if (suggest) {
		rows[pkg]["建议文件预算"] = Math.ceil(u.files * 1.05);
		rows[pkg]["建议字节预算"] = Math.ceil((u.bytes * 1.05) / 1024) * 1024;
		continue;
	}
	if (!b) problems.push(`${pkg}: test-budget.json 中没有该包的预算`);
	else {
		if (u.files > b.files) problems.push(`${pkg}: test/ 文件数 ${u.files} 超过预算 ${b.files}`);
		if (u.bytes > b.bytes) problems.push(`${pkg}: test/ 字节数 ${u.bytes} 超过预算 ${b.bytes}`);
	}
}
for (const rel of Object.keys(budget.allow)) {
	if (!listed.includes(rel)) problems.push(`allow 中的 ${rel} 已不存在, 请删除该条`);
}
console.table(rows);
if (!suggest && problems.length) {
	for (const p of problems) console.log("  " + p);
	console.log("放宽预算须在同一提交中修改 test-budget.json 并写明理由, 见 README「测试数据」");
	process.exitCode = 1;
}
