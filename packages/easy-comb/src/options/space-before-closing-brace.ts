import gonzales from "easy-gonz";
import type { Node } from "easy-gonz";
import { defineOption } from "../option.ts";
import { text, children } from "../node.ts";

let valueFromSettings: string;
let blockIndent: string | undefined;

function getLastWhitespaceNode(node: Node): Node | null {
	let lastNode = node.last();

	// An empty value (`a{b: }`) ends the declaration after the spaces.
	if (lastNode && lastNode.is("value") && !lastNode.length) lastNode = node.get(node.length - 2);

	if (!lastNode || !lastNode.content) return null;

	if (lastNode.is("block")) return null;
	if (lastNode.is("space")) return lastNode;

	return getLastWhitespaceNode(lastNode);
}

function processBlock(x: Node, level?: number) {
	level = level || 0;

	x.forEach(function (node) {
		if (!node.is("block") && !node.is("atrulers")) return processBlock(node, level);
		// CSS 值里的 `{}`(自定义属性值, 函数参数)是值的一部分, 改了会改变值
		if (node.syntax === "css" && x.is("value")) return;

		level!++;

		let value = valueFromSettings;
		if (value.indexOf("\n") > -1) {
			// block-indent 为 '' 或未设置时不补缩进, 右花括号贴行首
			if (blockIndent) {
				value += Array.from({ length: level ?? 0 }).join(blockIndent);
			}
		}

		// If found block node stop at the next one for space check
		// For the pre-block node, find its last (the deepest) child
		const whitespaceNode = getLastWhitespaceNode(node);

		// If it's spaces, modify this node
		// If it's something different from spaces, add a space node
		// to the end
		if (whitespaceNode) {
			whitespaceNode.content = value;
		} else if (value !== "") {
			const space = gonzales.createNode({
				type: "space",
				content: value,
				syntax: node.syntax,
			});
			children(node).push(space);
		}

		processBlock(node, level);
	});
}

export default defineOption({
	name: "space-before-closing-brace",

	runBefore: "tab-size",

	syntax: ["css", "less", "scss"],

	accepts: { number: true, string: /^[ \t\n]*$/ },

	/**
	 * Processes tree node.
	 */
	process(ast: Node, config: Record<string, unknown>) {
		valueFromSettings = this.value;
		blockIndent = config["block-indent"] as string | undefined;

		processBlock(ast);
	},

	/**
	 * Detects the value of an option at the tree node.
	 */
	detect(ast: Node) {
		const detected: string[] = [];

		ast.traverseByTypes(["block", "atrulers"], function (node, i, parent) {
			if (node.syntax === "css" && parent && parent.is("value")) return;
			// For the block node, find its last (the deepest) child
			const whitespaceNode = getLastWhitespaceNode(node);
			if (whitespaceNode) {
				detected.push(text(whitespaceNode));
			} else {
				detected.push("");
			}
		});

		return detected;
	},
});
