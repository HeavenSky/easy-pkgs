// easy-gonz 官方测试集判定: 每条非非法用例要能解析(parse), toString() 逐字还原输入(roundtrip),
// 且结构大纲与参考解析器一致(outline, 见 outline.mjs; 缩进 Sass 没有参考解析器, 参考解析器失败的用例不判此级).
// 汇总表另列与 postcss 栈的差集(postcss 通过而 easy-gonz 不通过的用例数, 见 postcss.mjs), 目标是清零; 差集只作进度指标, 回退由基线负责.
// 用法: node gonz.mjs [--update] [--gap 语料名](列出该语料的差集用例); 基线为 packages/easy-gonz/test/official-baseline.json.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { report, summarize } from "./baseline.mjs";
import { compareOutline } from "./outline.mjs";
import { postcssPasses } from "./postcss.mjs";
import { loadCases } from "./extract.mjs";
import { runPool } from "./pool.mjs";

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../packages/easy-gonz");

export function setup({ pkg }) {
	const gonzales = createRequire(import.meta.url)(pkg);
	const judge = c => {
		let ast;
		try {
			ast = gonzales.parse(c.src, { syntax: c.syntax });
		} catch {
			return "parse";
		}
		if (ast.toString() !== c.src) return "roundtrip";
		if (c.syntax === "sass") return "pass";
		return compareOutline(ast, c).level === "diff" ? "outline" : "pass";
	};
	return c => ({ level: judge(c), postcss: postcssPasses(c) });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const cases = loadCases().filter(c => c.valid !== false);
	const results = await runPool(cases, import.meta.url, { pkg });
	const extra = {};
	const gapSuite = process.argv.includes("--gap")
		? process.argv[process.argv.indexOf("--gap") + 1]
		: null;
	cases.forEach((c, i) => {
		const row = (extra[c.suite] ??= { "postcss 通过": 0, "postcss 差集": 0 });
		if (!results[i].postcss) return;
		row["postcss 通过"]++;
		if (results[i].level !== "pass") {
			row["postcss 差集"]++;
			if (c.suite === gapSuite) console.log(results[i].level, c.id);
		}
	});
	const ok = report(
		"easy-gonz 官方测试集",
		summarize(cases, results),
		path.join(pkg, "test/official-baseline.json"),
		process.argv.includes("--update"),
		extra
	);
	process.exitCode = ok ? 0 : 1;
}
