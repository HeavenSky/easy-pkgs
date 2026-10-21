import gonzales from "easy-gonz";
import type { Node } from "easy-gonz";
import { defineOption } from "../option.ts";
import { text } from "../node.ts";

// 声明之后可以跟的语句: 声明, 以及嵌套规则, Less mixin 调用, `@include` / `@extend` 等;
// 紧凑写法里它们与上一条声明在同一行, 需要和声明一样换行.
const STATEMENTS = [
	"declaration",
	"include",
	"extend",
	"mixin",
	"ruleset",
	"atrule",
	"atruleb",
	"atruler",
	"atrules",
	"conditionalStatement",
	"loop",
];

function isStatement(node: Node | null | undefined) {
	return !!node && typeof node !== "string" && STATEMENTS.some(type => node.is(type));
}

// 跳过空白与注释, 返回 i 之后的第一个节点.
function nextStatement(node: Node, i: number) {
	let next = node.get(++i);
	while (next && (next.is("space") || next.is("multilineComment"))) next = node.get(++i);
	return next;
}

function getDeclarationEnd(node: Node, i: number) {
	for (; i < node.length; i++) {
		if (!node.get(i + 1) || typeof node.get(i + 1) === "string") {
			return 0;
		} else if (node.get(i + 1)!.is("space")) {
			if (text(node.get(i + 1)!).indexOf("\n") > -1) {
				if (isStatement(node.get(i + 2))) {
					return i;
				} else {
					return 0;
				}
			} else if (node.get(i + 2) && node.get(i + 2)!.is("multilineComment")) {
				if (isStatement(node.get(i + 3))) {
					return i + 2;
				} else if (node.get(i + 3) && node.get(i + 3)!.is("space")) {
					if (isStatement(node.get(i + 4))) {
						return i + 2;
					} else {
						return 0;
					}
				} else {
					return 0;
				}
			} else if (isStatement(node.get(i + 2))) {
				return i;
			}
		} else if (isStatement(node.get(i + 1))) {
			return i;
		} else if (node.get(i + 1)!.is("multilineComment")) {
			if (isStatement(node.get(i + 2))) {
				return i + 1;
			} else if (node.get(i + 2) && node.get(i + 2)!.is("space")) {
				if (isStatement(node.get(i + 3))) {
					return i + 1;
				}
			} else {
				return 0;
			}
		} else {
			return 0;
		}
	}
}

export default defineOption({
	name: "space-between-declarations",

	runBefore: "block-indent",

	syntax: ["css", "less", "scss"],

	accepts: { number: true, string: /^[ \t\n]*$/ },

	/**
	 * Processes tree node.
	 */
	process(ast: Node) {
		const value = this.value;

		ast.traverseByType("declarationDelimiter", (delimiter, i, parent) => {
			// Grom user's point of view "declaration" includes semicolons
			// and comments placed on the same line.
			// So group those things together:
			const declarationEnd = getDeclarationEnd(parent!, i!);
			if (!declarationEnd) {
				return;
			} else {
				i = declarationEnd;
			}

			const nextNode = parent!.get(i + 1);
			// 非声明语句前已有换行时保留原样(例: 嵌套规则前的空行), 只拆开挤在同一行的情况
			if (
				nextNode &&
				nextNode.is("space") &&
				text(nextNode).indexOf("\n") > -1 &&
				!nextStatement(parent!, i)?.is("declaration")
			)
				return;

			if (nextNode && nextNode.is("space")) {
				nextNode.content = value;
			} else {
				const space = gonzales.createNode({
					type: "space",
					content: value,
					syntax: ast.syntax,
				});
				parent!.insert(i + 1, space);
			}
		});
	},

	/**
	 * Detects the value of this option in ast.
	 * @returns List of detected values
	 */
	detect(ast: Node) {
		const detected: string[] = [];

		ast.traverseByType("block", block => {
			let prevDeclaration = false;
			let nextDeclaration = false;

			block.forEach(blockContent => {
				if (blockContent.is("declaration")) {
					if (prevDeclaration) {
						prevDeclaration = false;
						nextDeclaration = true;
					} else {
						prevDeclaration = true;
						nextDeclaration = false;
					}
				} else if (prevDeclaration) {
					if (blockContent.is("multilineComment")) {
						// If there is comments between two declarations, then we need
						// to clean up whitespace and new line characters before each
						// comment keeping up the same characters after the comment.
						detected.splice(-1);
					} else if (blockContent.is("space")) {
						detected.push(text(blockContent));
					}
				}
			});

			if (!nextDeclaration) {
				// Remove the last detected space content after the property
				// declaration which does not have a pair for it in a block.
				detected.splice(-1);
			}
		});

		return detected;
	},
});
