// 按语料汇总判定结果, 与包内提交的已知失败基线比较: 新增失败即回退, 基线中的用例已通过则要求 --update 收紧基线.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export function summarize(cases, results) {
	const out = {};
	cases.forEach((c, i) => {
		const s = (out[c.suite] ??= { total: 0, pass: 0, fail: {} });
		s.total++;
		const level = results[i].level;
		if (level === "pass") s.pass++;
		else (s.fail[level] ??= []).push(c.id);
	});
	for (const s of Object.values(out)) {
		for (const k of Object.keys(s.fail)) s.fail[k].sort();
		s.fail = Object.fromEntries(Object.entries(s.fail).sort());
	}
	return Object.fromEntries(Object.entries(out).sort());
}

// extra: 按语料追加到汇总表的列, 只用于展示
export function report(title, summary, file, update, extra = {}) {
	const old = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
	const rows = {};
	const problems = [];
	for (const [suite, s] of Object.entries(summary)) {
		const prev = old[suite];
		const known = new Set(prev ? Object.values(prev.fail).flat() : []);
		const failing = Object.values(s.fail).flat();
		const regressed = prev ? failing.filter(id => !known.has(id)) : [];
		const fixed = prev ? [...known].filter(id => !failing.includes(id)) : [];
		rows[suite] = {
			用例: s.total,
			通过: s.pass,
			通过率: ((100 * s.pass) / s.total).toFixed(1) + "%",
			回退: regressed.length,
			新通过: fixed.length,
			...extra[suite],
		};
		if (!prev) problems.push(`${suite}: 基线中没有该语料`);
		else if (prev.total !== s.total)
			problems.push(`${suite}: 用例数 ${prev.total} → ${s.total}, 语料或抽取规则变了`);
		for (const id of regressed.slice(0, 20)) problems.push(`回退 ${id}`);
		if (regressed.length > 20) problems.push(`... 共 ${regressed.length} 条回退`);
		if (fixed.length) problems.push(`${suite}: ${fixed.length} 条已通过但仍在基线中`);
	}
	for (const suite of Object.keys(old))
		if (!summary[suite]) problems.push(`${suite}: 基线中有, 本次未运行`);
	console.log(title);
	console.table(rows);
	if (update) {
		writeFileSync(file, JSON.stringify(summary, null, 2) + "\n");
		console.log(`已写入 ${file}`);
		return true;
	}
	if (!problems.length) return true;
	for (const p of problems) console.log("  " + p);
	console.log("确认是预期变化(修好了用例, 或升级了语料)后执行 --update 更新基线");
	return false;
}
