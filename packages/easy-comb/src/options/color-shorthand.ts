import type { Node } from "easy-gonz";
import { defineOption } from "../option.ts";
import { text } from "../node.ts";

export default defineOption({
	name: "color-shorthand",

	syntax: ["css", "less", "sass", "scss"],

	accepts: { boolean: [true, false] },

	/**
	 * Processes ast and fixes found code style errors.
	 */
	process(ast: Node) {
		const value = this.value;

		ast.traverseByType("color", function (color) {
			// 支持带 alpha 的 8 位/4 位写法, 必须整串匹配, 否则会截坏 `#0000004d`
			color.content = value
				? text(color).replace(/^(\w)\1(\w)\2(\w)\3(?:(\w)\4)?$/i, "$1$2$3$4")
				: text(color).replace(
						/^(\w)(\w)(\w)(\w)?$/,
						(m: string, r: string, g: string, b: string, a?: string) =>
							r + r + g + g + b + b + (a ? a + a : "")
					);
		});
	},

	/**
	 * Detects the value of this option in ast.
	 * @returns List of detected values
	 */
	detect(ast: Node) {
		const detected: boolean[] = [];

		ast.traverseByType("color", function (color) {
			if (text(color).match(/^\w{3}(\w)?$/)) {
				detected.push(true);
			} else if (text(color).match(/^(\w)\1(\w)\2(\w)\3(?:(\w)\4)?$/)) {
				detected.push(false);
			}
		});

		return detected;
	},
});
