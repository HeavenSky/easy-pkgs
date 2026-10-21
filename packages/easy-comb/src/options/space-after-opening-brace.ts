import gonzales from "easy-gonz";
import type { Node } from "easy-gonz";
import { defineOption } from "../option.ts";
import { text } from "../node.ts";

export default defineOption({
	name: "space-after-opening-brace",

	runBefore: "block-indent",

	syntax: ["css", "less", "scss"],

	accepts: { number: true, string: /^[ \t\n]*$/ },

	/**
	 * Processes tree node.
	 */
	process(ast: Node) {
		const value = this.value;

		ast.traverse(function (node, i, parent) {
			// If found block node stop at the next one for space check
			if (!node.is("block") && !node.is("atrulers")) return;
			// CSS 值里的 `{}`(自定义属性值, 函数参数)是值的一部分, 改了会改变值
			if (node.syntax === "css" && parent && parent.is("value")) return;

			if (node.first() && node.first()!.is("space")) {
				node.first()!.content = value;
			} else if (value !== "") {
				const space = gonzales.createNode({
					type: "space",
					content: value,
					syntax: ast.syntax,
				});
				node.insert(0, space);
			}
		});
	},

	/**
	 * Detects the value of an option at the tree node.
	 */
	detect(ast: Node) {
		const detected: string[] = [];

		ast.traverse(function (node, i, parent) {
			if (!node.is("block") && !node.is("atrulers")) return;
			if (node.syntax === "css" && parent && parent.is("value")) return;

			if (node.first()!.is("space")) {
				detected.push(text(node.first()!));
			} else {
				detected.push("");
			}
		});

		return detected;
	},
});
