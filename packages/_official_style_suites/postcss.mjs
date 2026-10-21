// postcss 栈(stylelint 所用: postcss / postcss-scss / postcss-less / postcss-sass)对同一用例的判定, 作为 easy-gonz 的对标线.
// 通过 = 能解析 + 原样写回 + 每个选择器与声明值经 postcss-selector-parser / postcss-value-parser 逐字还原.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function postcssPasses(c) {
	const postcss = require("postcss");
	const syntax = { css: postcss, scss: require("postcss-scss"), less: require("postcss-less") }[
		c.syntax
	];
	// postcss-sass 在官方语料上几乎全部失败, 不安装, 缩进 Sass 视为 postcss 不通过
	if (!syntax) return false;
	try {
		const root = syntax.parse(c.src, { from: undefined });
		if ((c.syntax === "css" ? root.toString() : root.toString(syntax)) !== c.src) return false;
		const selectorParser = require("postcss-selector-parser");
		const valueParser = require("postcss-value-parser");
		let ok = true;
		root.walkRules(n => {
			if (ok && selectorParser().processSync(n.selector, { lossless: true }) !== n.selector)
				ok = false;
		});
		root.walkDecls(n => {
			if (ok && valueParser(n.value).toString() !== n.value) ok = false;
		});
		return ok;
	} catch {
		return false;
	}
}
