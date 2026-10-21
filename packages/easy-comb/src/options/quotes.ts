import type { Node } from "easy-gonz";
import { defineOption } from "../option.ts";
import { text } from "../node.ts";

/**
 * 跳过从 start(指向 `#{` 的 `#`)开始的插值, 返回插值结束后的位置; 插值里可以有嵌套的花括号, 字符串与插值.
 */
function skipInterpolation(text: string, start: number): number {
	let depth = 0;
	for (let i = start + 1; i < text.length; i++) {
		const ch = text[i];
		if (ch === "\\") {
			i++;
		} else if (ch === '"' || ch === "'") {
			// 内层字符串, 其中仍可能有插值
			for (i++; i < text.length && text[i] !== ch; i++) {
				if (text[i] === "\\") i++;
				else if (text[i] === "#" && text[i + 1] === "{") i = skipInterpolation(text, i) - 1;
			}
		} else if (ch === "{") {
			depth++;
		} else if (ch === "}") {
			depth--;
			if (depth === 0) return i + 1;
		}
	}
	return text.length;
}

/**
 * 只转换插值之外的字符串内容, 插值原样保留.
 */
function convertOutsideInterpolation(text: string, convert: (part: string) => string): string {
	let result = "";
	let last = 0;
	for (let i = 0; i < text.length; i++) {
		if (text[i] === "\\") {
			i++;
		} else if (text[i] === "#" && text[i + 1] === "{") {
			const end = skipInterpolation(text, i);
			result += convert(text.slice(last, i)) + text.slice(i, end);
			last = end;
			i = end - 1;
		}
	}
	return result + convert(text.slice(last));
}

export default defineOption({
	name: "quotes",

	syntax: ["css", "less", "sass", "scss"],

	accepts: { string: /^(?:single|double)$/ },

	/**
	 * Processes tree node.
	 */
	process: function (ast: Node) {
		let to = this.value === "single" ? "'" : '"';

		ast.traverseByType("string", function (string) {
			let from = text(string)[0];
			if (from === to || (from !== '"' && from !== "'")) return;

			// 逐个处理转义序列: 原引号去转义, 其余转义(含 `\\`)原样保留,
			// 未转义的目标引号补转义. 整体正则替换会把 `"\\"` 误判成转义引号.
			const convert = (text: string) =>
				text.replace(
					/\\([\s\S])|([\s\S])/g,
					function (match: string, escaped: string | undefined, char: string) {
						if (escaped !== undefined) return escaped === from ? escaped : match;
						return char === to ? "\\" + char : char;
					}
				);
			let inner = text(string).slice(1, -1);
			// scss / sass 字符串里的 `#{...}` 是表达式, 其中的引号属于内层字符串, 原样保留
			const interpolated =
				(string.syntax === "scss" || string.syntax === "sass") &&
				inner.indexOf("#{") !== -1;
			// 内容里有未转义的目标引号时, 换引号只会多出一串转义, 保持原引号(#645)
			let hasTarget = false;
			const scan = (text: string) => {
				if (text.replace(/\\[\s\S]/g, "").indexOf(to) !== -1) hasTarget = true;
				return text;
			};
			if (interpolated) convertOutsideInterpolation(inner, scan);
			else scan(inner);
			if (hasTarget) return;
			string.content =
				to +
				(interpolated ? convertOutsideInterpolation(inner, convert) : convert(inner)) +
				to;
		});
	},

	/**
	 * Detects the value of an option at the tree node.
	 */
	detect: function (ast: Node) {
		let detected: string[] = [];

		ast.traverseByType("string", function (string) {
			if (string.content[0] === '"') {
				detected.push("double");
			} else if (string.content[0] === "'") {
				detected.push("single");
			}
		});

		return detected;
	},
});
