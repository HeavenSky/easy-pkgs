// 选项新建的节点必须带上所在语法树的 syntax, 否则对其 toString() 时解析器打出 `Syntax "undefined" is not supported yet`.
import assert from "node:assert/strict";
import gonzales from "easy-gonz";
import type { Node, Syntax } from "easy-gonz";
import Comb from "../../../src/csscomb.ts";

// 嵌套写法: 嵌套规则前要插入空行, sort-order 与 lines-between-rulesets 都会新建空白节点.
const nested: Record<string, string> = {
	css: ".a{color:#FFF;&:hover{z-index:1}}",
	less: ".a{color:#FFF;&:hover{z-index:1}}",
	scss: ".a{color:#FFF;&:hover{z-index:1}}",
	sass: ".a\n  color: #FFF\n  &:hover\n    z-index: 1\n",
};

// 让各选项走到"新建节点"分支: 缺空白, 缺分号, 未对齐的厂商前缀, 跨组排序, 跨行声明.
const samples: Record<string, string[]> = {
	css: [
		"a,b>c+d{-webkit-box-sizing:border-box;box-sizing:border-box;top:0;color:red}",
		"a{color:red;\n  top:0}\n.b{}",
	],
	less: [
		".m(){top:0}\na,b>c+d{-webkit-box-sizing:border-box;box-sizing:border-box;.m();color:red;&:hover{top:0}}",
		"a{color:red;\n  top:0}\n.b{}",
	],
	scss: [
		"@mixin m{top:0}\na,b>c+d{-webkit-box-sizing:border-box;box-sizing:border-box;@include m;color:red;&:hover{top:0}}",
		"a{$x:1;color:red;\n  top:0;@extend .b}\n.b{}",
	],
	sass: [
		"a,b>c+d\n  -webkit-box-sizing: border-box\n  box-sizing: border-box\n  color: red\n  top: 0\n  &:hover\n    top: 0\n",
	],
};

const configs: Record<string, unknown>[] = [
	Comb.getConfig() as Record<string, unknown>,
	{
		"space-before-colon": " ",
		"space-before-combinator": " ",
		"space-before-selector-delimiter": " ",
		"space-before-opening-brace": " ",
		"space-after-opening-brace": " ",
		"space-before-closing-brace": " ",
		"always-semicolon": true,
		"sort-order": [["$variable"], ["$include"], ["color"], ["top"]],
	},
];

// 桩掉控制台与 stderr, 返回期间所有输出.
async function captureStderr(fn: () => Promise<unknown> | unknown): Promise<string[]> {
	const output: string[] = [];
	const { error, warn } = console;
	const write = process.stderr.write;
	console.error = (...args: unknown[]) => {
		output.push(args.join(" "));
	};
	console.warn = (...args: unknown[]) => {
		output.push(args.join(" "));
	};
	process.stderr.write = ((chunk: unknown) => {
		output.push(String(chunk));
		return true;
	}) as typeof write;
	try {
		await fn();
	} finally {
		console.error = error;
		console.warn = warn;
		process.stderr.write = write;
	}
	return output;
}

function nodesWithoutSyntax(ast: Node): string[] {
	const missing: string[] = [];
	ast.traverse((node: Node) => {
		if (node.syntax !== ast.syntax)
			missing.push(`${node.type} ${JSON.stringify(node.content)}`);
	});
	return missing;
}

describe("node syntax", function () {
	for (const syntax of Object.keys(nested) as Syntax[]) {
		it(`${syntax}: nested rules are processed without stderr output`, async function () {
			const comb = new Comb("csscomb");
			let result = "";
			const output = await captureStderr(async () => {
				result = await comb.processString(nested[syntax], { syntax });
			});
			assert.deepEqual(output, []);
			assert.match(result, /\n\n\s*&:hover/);
		});

		it(`${syntax}: every created node carries the tree syntax`, async function () {
			for (const config of configs) {
				const comb = new Comb(config);
				for (const input of [nested[syntax], ...samples[syntax]]) {
					const ast = gonzales.parse(input, { syntax });
					const output = await captureStderr(() => comb._processTree(ast));
					assert.deepEqual(output, [], input);
					assert.deepEqual(nodesWithoutSyntax(ast), [], input);
				}
			}
		});
	}
});
