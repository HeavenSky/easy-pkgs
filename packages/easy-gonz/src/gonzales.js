"use strict";

var Node = require("./node/basic-node");
var parse = require("./parse");

function createNode(options) {
	return new Node(options);
}

// 保持对象字面量且属性值都是标识符: Node ESM 用 cjs-module-lexer 静态识别具名导出,
// 这样 `import { parse } from 'easy-gonz'` 才能成立; 属性与 4.3.0 一致.
module.exports = { createNode: createNode, parse: parse };
