import type { Node } from "easy-gonz";
import { defineOption } from "../option.ts";
import { text } from "../node.ts";

export default defineOption({
	/**
	 * Option's name as it's used in config.
	 */
	name: "block-indent",

	/**
	 * Name of option that must run after this option.
	 */
	runBefore: "sort-order",

	/**
	 * List of syntaxes that are supported by this option.
	 */
	syntax: ["css", "less", "sass", "scss"],

	/**
	 * Types of values this option accepts in config.
	 */
	accepts: { number: true, string: /^[ \t]*$/ },

	/**
	 * Processes ast and fixes found code style errors.
	 */
	process(ast: Node) {
		ast.eachFor("space", function (whitespaceNode, i) {
			const spaces = text(whitespaceNode).replace(/\n[ \t]+/gm, "\n");

			if (spaces === "") {
				ast.removeChild(i);
			} else {
				whitespaceNode.content = spaces;
			}
		});

		this._processNode(ast, 0);
	},

	/**
	 * Detects the value of this option in ast.
	 * @returns List of detected values
	 */
	detect(ast: Node) {
		const detected: string[] = [];

		ast.traverse(function (node) {
			// Continue only with non-empty {...} blocks:
			if ((!node.is("atrulers") && !node.is("block")) || !node.length) return;

			node.eachFor("space", function (whitespaceNode) {
				const spaces: string = text(whitespaceNode);
				const lastIndex = spaces.lastIndexOf("\n");

				// Do not continue if there is no line break:
				if (lastIndex < 0) return;

				// Number of spaces from beginning of line:
				const spacesLength = spaces.slice(lastIndex + 1).length + 1;
				detected.push(Array.from({ length: spacesLength }).join(" "));
			});
		});

		return detected;
	},

	_processNode(node: Node, level: number) {
		node.forEach(n => {
			// CSS 自定义属性的值原样保留, 其中的换行与 `{}` 不按块缩进
			if (n.is("value") && n.syntax === "css" && node.first()!.is("customProperty")) return;

			if (node.syntax === "sass" && n.is("block")) {
				this._processSassBlock(n, level);
			}

			// Continue only with space nodes inside {...}:
			if (node.syntax !== "sass" && level !== 0 && n.is("space")) {
				this._processSpaceNode(n, level);
			}

			// 只有子节点进入下一层; block 之后的兄弟节点仍在当前层.
			let childLevel = n.is("block") || n.is("atrulers") ? level + 1 : level;

			this._processNode(n, childLevel);
		});
	},

	_processSassBlock(node: Node, level: number) {
		const value = this.value;

		node.eachFor("space", function (whitespaceNode) {
			// 只有一个换行的节点是语句的结束符(空行), 不是下一行的缩进; 缩进语法也认 `\r\n`, `\r`, `\f` 换行
			if (/^(?:\r\n|[\n\r\f])$/.test(text(whitespaceNode))) return;

			let spaces: string = text(whitespaceNode).replace(/[ \t]/gm, "");
			spaces += Array.from({ length: level + 2 }).join(value);
			whitespaceNode.content = spaces;
		});
	},

	_processSpaceNode(node: Node, level: number) {
		const value = this.value;

		// Remove all whitespaces and tabs, leave only new lines:
		let spaces: string = text(node).replace(/[ \t]/gm, "");

		if (!spaces) return;

		spaces += Array.from({ length: level + 1 }).join(value);
		node.content = spaces;
	},
});
