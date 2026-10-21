import gonzales from "easy-gonz";
import type { Node } from "easy-gonz";
import { defineOption } from "../option.ts";
import { text } from "../node.ts";

// 属性名中厂商前缀的解析结果.
interface PrefixInfo {
	id: string;
	baseName: string;
	prefixLength: number;
	extra: number;
}

interface Indent {
	prefixLength: number;
	extra: number;
}

type IndentDict = Record<string, Indent>;

interface WalkArgs {
	node: Node;
	selector(node: Node): string | undefined;
	payload(info: PrefixInfo, i: number): void;
	namespaceSelector?(node: Node): string | undefined;
	getExtraSymbols(nodes: Node, i: number): number | undefined;
}

// Vendor prefixes list:
var PREFIXES = ["webkit", "khtml", "moz", "ms", "o"];

var oneline: boolean;

/**
 * Makes namespace from property name.
 */
function makeNamespace(propertyName: string | undefined): string | undefined {
	var info = getPrefixInfo(propertyName);
	return info && info.baseName;
}

/**
 * Creates object which contains info about vendor prefix used
 * in propertyName.
 *
 * @param propertyName property name
 * @param [namespace] namespace name, defaults to ''
 * @param [extraSymbols] extra symbols count, defaults to 0
 */
function getPrefixInfo(
	propertyName: string | undefined,
	namespace?: string,
	extraSymbols?: number
): PrefixInfo | undefined {
	var baseName = propertyName as string;
	var prefixLength = 0;

	namespace = namespace || "";
	extraSymbols = extraSymbols || 0;

	if (!propertyName) return;

	PREFIXES.some(function (prefix) {
		prefix = "-" + prefix + "-";
		if (propertyName.indexOf(prefix) !== 0) return;

		baseName = baseName.substr(prefix.length);
		prefixLength = prefix.length;

		return true;
	});

	return {
		id: namespace + baseName,
		baseName: baseName,
		prefixLength: prefixLength,
		extra: extraSymbols,
	};
}

/**
 * Returns extra indent for item in arguments
 *
 * @param nodes nodes to process
 */
function extraIndent(nodes: Node[]): number | undefined {
	if (!nodes || !nodes.length) return;

	var node: Node;
	var crPos: number;
	var tabPos: number;
	var result = 0;

	for (var i = nodes.length; i--;) {
		node = nodes[i];

		if (!node.content) {
			crPos = -1;
		} else {
			crPos = text(node).lastIndexOf("\n");
			tabPos = text(node).lastIndexOf("\t");
			if (tabPos > crPos) crPos = tabPos;
		}

		if (crPos !== -1) oneline = false;

		if (node.is("space")) {
			result += node.content.length - crPos - 1;
			if (crPos !== -1) break;
		}
		if (node.is("multilineComment")) {
			if (crPos === -1) {
				// Comment symbols length
				let offset = 4;
				result += node.content.length + offset;
			} else {
				// Only last comment symbols length - 1 (not count \n)
				let offset = crPos - 1;
				result += node.content.length - offset;
				break;
			}
		}
	}

	return result;
}

/**
 * Wrapper for extra indent function for `property` node.
 *
 * @param nodes all nodes
 * @param i position in nodes array
 */
function extraIndentProperty(nodes: Node, i: number): number | undefined {
	var subset: Node[] = [];
	while (i--) {
		if (!nodes.get(i) || nodes.get(i)!.is("declarationDelimiter")) break;
		subset.unshift(nodes.get(i)!);
	}
	return extraIndent(subset);
}

/**
 * Wrapper for extra indent function for val-node.
 *
 * @param nodes all nodes
 * @param i position in nodes array
 */
function extraIndentVal(nodes: Node, i: number): number | undefined {
	var subset: Node[] = [];
	var declaration = nodes.get(i)!;
	if (!declaration.is("declaration")) return;

	for (var x = declaration.length; x--;) {
		if (!declaration.get(x)!.is("value")) continue;

		x--;

		while (!declaration.get(x)!.is("propertyDelimiter")) {
			subset.push(declaration.get(x)!);
			x--;
		}

		break;
	}
	return extraIndent(subset);
}

/**
 * Walks across nodes, and call payload for every node that pass
 * selector check.
 *
 * @param args arguments in form of:
 *  {
 *      node: {object} current node,
 *      selector: {function} propertyName selector
 *      payload: {function} work to do with gathered info
 *      namespaceSelector: {function} selector for namespace
 *      getExtraSymbols: {Number} extra symbols count
 *  }
 */
function walk(args: WalkArgs): void {
	// #628: 只对齐连续的同基名属性, 一组以无前缀属性收尾; 组号拼进 id, 使各组分别计算缩进
	var run = 0;
	var prev: PrefixInfo | undefined;

	args.node.forEach(function (item, i) {
		if (
			item.is("space") ||
			item.is("declarationDelimiter") ||
			item.is("multilineComment") ||
			item.is("singlelineComment")
		)
			return;

		var name = args.selector(item);
		var namespace = args.namespaceSelector && makeNamespace(args.namespaceSelector(item));
		var extraSymbols = args.getExtraSymbols(args.node, i);

		var info = name && getPrefixInfo(name, namespace, extraSymbols);
		if (!info || !prev || prev.id !== info.id || prev.prefixLength === 0) run++;
		prev = info || undefined;
		if (!info) return;
		args.payload({ ...info, id: info.id + "#" + run }, i);
	});
}

/**
 * Returns property name.
 * e.g.
 * for: 'color: #fff'
 * returns string: 'color'
 */
function getPropertyName(node: Node): string | undefined {
	if (!node.is("declaration")) return;
	// 只对普通属性对齐: 变量(`$x` / `@x`)与自定义属性(`--x`)不是带前缀的属性, 参与对齐会被错误缩进
	const property = node.get(0);
	if (!property || !property.is("property")) return;
	const name = property.get(0);
	return name && name.is("ident") ? text(name) : undefined;
}

/**
 * Returns property value name.
 * e.g.
 * for: '-webkit-transition: -webkit-transform 150ms linear'
 * returns string: '-webkit-transform', and
 * for: 'background: -webkit-linear-gradient(...)'
 * returns string: '-webkit-linear-gradient'
 */
function getValName(node: Node): string | undefined {
	if (!node.is("declaration")) return;

	var first = node.first("value")!.get(0);
	if (!first) return;
	if (first.is("ident")) return text(first);
	if (first.is("function")) return text(first.get(0)!);
}

/**
 * Updates dict which contains info about items align.
 */
function updateDict(info: PrefixInfo, dict: IndentDict): void {
	if (info.prefixLength === 0 && info.extra === 0) return;

	var indent = dict[info.id] || { prefixLength: 0, extra: 0 };

	let indentLength = indent.prefixLength + indent.extra;
	let infoLength = info.prefixLength + info.extra;
	if (indentLength > infoLength) {
		dict[info.id] = indent;
	} else {
		dict[info.id] = { prefixLength: info.prefixLength, extra: info.extra };
	}
}

/**
 * Returns string with correct number of spaces for info.baseName property.
 */
function updateIndent(info: PrefixInfo, dict: IndentDict, whitespaceNode: string): string {
	var item = dict[info.id];
	if (!item) return whitespaceNode;

	var crPos = whitespaceNode.lastIndexOf("\n");
	var tabPos = whitespaceNode.lastIndexOf("\t");
	if (tabPos > crPos) crPos = tabPos;

	var firstPart = whitespaceNode.substr(0, crPos + 1);
	var extraIndent = Array.from({
		length:
			item.prefixLength -
			info.prefixLength +
			(item.extra - info.extra) +
			whitespaceNode.length -
			firstPart.length +
			1,
	}).join(" ");

	return firstPart.concat(extraIndent);
}

export default defineOption({
	name: "vendor-prefix-align",

	syntax: ["css", "less", "sass", "scss"],

	accepts: { boolean: [true] },

	/**
	 * Processes tree node.
	 */
	process: function (ast: Node) {
		ast.traverseByType("block", function (node) {
			oneline = true;

			var dict: IndentDict = {};

			// Gathering Info
			walk({
				node: node,
				selector: getPropertyName,
				getExtraSymbols: extraIndentProperty,
				payload: function (info) {
					updateDict(info, dict);
				},
			});

			walk({
				node: node,
				selector: getValName,
				namespaceSelector: getPropertyName,
				getExtraSymbols: extraIndentVal,
				payload: function (info) {
					updateDict(info, dict);
				},
			});

			if (oneline && ast.syntax !== "sass") return;

			// Update nodes
			walk({
				node: node,
				selector: getValName,
				namespaceSelector: getPropertyName,
				getExtraSymbols: extraIndentVal,
				payload: function (info, i) {
					let x: number;
					for (x = node.get(i)!.length; x--;) {
						if (node.get(i)!.get(x)!.is("value")) break;
					}

					let prevNode = node.get(i)!.get(x - 1)!;
					if (!prevNode.is("space")) {
						var space = gonzales.createNode({
							type: "space",
							content: "",
							syntax: ast.syntax,
						});
						node.get(i)!.insert(x, space);
						++x;
					}

					let content = text(node.get(i)!.get(x - 1)!);
					let updatedIndent = updateIndent(info, dict, content);
					node.get(i)!.get(x - 1)!.content = updatedIndent;
				},
			});

			if (ast.syntax === "sass") return;

			walk({
				node: node,
				selector: getPropertyName,
				getExtraSymbols: extraIndentProperty,
				payload: function (info, i) {
					// `node.get(i - 1)` can be either space or comment:
					var whitespaceNode = node.get(i - 1);
					if (!whitespaceNode) return;
					// If it's a comment, insert an empty space node:
					if (!whitespaceNode.is("space")) {
						whitespaceNode = gonzales.createNode({
							type: "space",
							content: "",
							syntax: ast.syntax,
						});
						node.insert(i - 1, whitespaceNode);
					}
					let content = text(whitespaceNode);
					let updatedContent = updateIndent(info, dict, content);
					whitespaceNode.content = updatedContent;
				},
			});
		});
	},

	/**
	 * Detects the value of an option at the tree node.
	 */
	detect: function (ast: Node) {
		let detected: boolean[] = [];

		ast.traverseByType("block", function (node) {
			var result = { true: 0, false: 0 };

			var maybePrefix = false;
			var prevPrefixLength: number | false = false;
			var prevProp: string | undefined;
			var prevSum: number | undefined;
			var partialResult: boolean | null = null;

			var getResult = function (options: {
				node: Node;
				sum: number;
				info: PrefixInfo;
				i: number;
			}) {
				let { node, sum, info, i } = options;
				var prop = info.baseName;

				// If this is the last item in a row and we have a result,
				// then catch it
				if (prop !== prevProp && partialResult !== null) {
					if (partialResult) {
						result.true++;
					} else {
						result.false++;
					}
					partialResult = null;
				}

				if (prop === prevProp && info.prefixLength !== prevPrefixLength) {
					maybePrefix = true;
				} else {
					maybePrefix = false;
				}

				if (maybePrefix && partialResult !== false) {
					// If there is prefixed prop, check if the prefixes are
					// aligned, but only if we hadn't already catched
					// that it is false
					if (sum === prevSum) {
						partialResult = true;
					} else {
						partialResult = false;
					}
				}

				if (node.length === i + 3 && partialResult !== null) {
					// If we're at the last property and have a result,
					// catch it
					if (partialResult) {
						result.true++;
					} else {
						result.false++;
					}
				}

				prevPrefixLength = info.prefixLength;
				prevProp = prop;
				prevSum = sum;
			};

			// Gathering Info
			walk({
				node: node,
				selector: getPropertyName,
				getExtraSymbols: extraIndentProperty,
				payload: function (info, i) {
					if (node.get(i - 1) && node.get(i - 1)!.content) {
						let nodeLength: number = text(node.get(i - 1)!).replace(
							/^[ \t]*\n+/,
							""
						).length;
						var sum = nodeLength + info.prefixLength;
						getResult({ node: node, sum: sum, info: info, i: i });
					}
				},
			});

			walk({
				node: node,
				selector: getValName,
				getExtraSymbols: extraIndentVal,
				payload: function (info, i) {
					let x: number;
					for (x = node.get(i)!.length; x--;) {
						if (node.get(i)!.get(x)!.is("value")) break;
					}

					if (node.get(i)!.get(x - 1)) {
						let nodeLength: number = text(node.get(i)!.get(x - 1)!).replace(
							/^[ \t]*\n+/,
							""
						).length;
						var sum = nodeLength + info.prefixLength;
						getResult({ node: node, sum: sum, info: info, i: i });
					}
				},
			});

			if (result.true > 0 || result.false > 0) {
				if (result.true >= result.false) {
					detected.push(true);
				} else {
					detected.push(false);
				}
			}
		});

		return detected;
	},
});
