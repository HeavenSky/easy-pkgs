// 缩进语法续行: 把语句尚未结束处的换行 token 改成空白, 让 markBlocks 把续行并入同一逻辑行.
"use strict";

var TokenType = require("../token-types");

// 规则依据 Sass 的 indented syntax improvements 提案与 dart-sass 实际行为:
// 1. `()`, `[]`, `{}` 内的换行都是空白;
// 2. 行尾未写完时续行: 逗号, `!`, 变量声明的 `:`, 运算符, 单独的 at-rule 名,
//    以及所属 at-rule 的后续关键字(例: `@for $i from`);
// 3. 下一行开头只能是续行时续行: 变量声明的 `:`, `@each` 的 `,`,
//    所属 at-rule 的后续关键字, 混入与函数的参数列表.
// `@import`, `@media`, `@supports` 在括号外不允许换行, 不在上述规则内.

// 名字之后可以换行的 at-rule
var AT_RULES_WITH_ARGUMENTS = [
	"debug",
	"warn",
	"error",
	"return",
	"for",
	"each",
	"while",
	"if",
	"use",
	"forward",
	"include",
	"mixin",
	"function",
	"extend",
];

// 出现在行尾时续行的关键字, 按所属 at-rule 限定; `$` 表示变量声明
var KEYWORDS_AT_END = {
	for: ["from", "through", "to"],
	each: ["in"],
	if: ["and", "or", "not"],
	else: ["and", "or", "not", "if"],
	while: ["and", "or", "not"],
	use: ["as", "with"],
	forward: ["as", "with", "show", "hide"],
	include: ["using"],
	$: ["and", "or", "not"],
};

// 出现在行首时续行的关键字, 按所属 at-rule 限定; `@keyframes` 下的 `from` 等不在此列
var KEYWORDS_AT_START = {
	for: ["from", "through", "to"],
	each: ["in"],
	if: ["and", "or"],
	else: ["and", "or", "if"],
	while: ["and", "or"],
};

// 参数列表可以另起一行的 at-rule
var AT_RULES_WITH_PARAMS = ["function", "mixin", "include"];

var OPERATORS = [
	TokenType.PlusSign,
	TokenType.HyphenMinus,
	TokenType.Asterisk,
	TokenType.Solidus,
	TokenType.PercentSign,
	TokenType.EqualsSign,
	TokenType.EqualitySign,
	TokenType.InequalitySign,
	TokenType.LessThanSign,
	TokenType.GreaterThanSign,
];

function isSpace(token) {
	return token.type === TokenType.Space || token.type === TokenType.Tab;
}

function isComment(token) {
	return token.type === TokenType.CommentSL || token.type === TokenType.CommentML;
}

/**
 * 按换行切分 token.
 * `first` 是首个非空白 token, `last` 是末个既非空白也非注释的 token,
 * 空行两者都是 -1; `nl` 是行尾换行 token, `depth` 是该换行处的括号深度.
 * @param {!Array} tokens
 * @returns {!Array}
 */
function getLines(tokens) {
	var lines = [];
	var line = { first: -1, last: -1, nl: -1, depth: 0 };
	var depth = 0;
	// 未闭合的括号类型, 栈顶是换行处最内层的括号
	var open = [];

	for (var i = 0; i < tokens.length; i++) {
		var t = tokens[i];

		if (t.type === TokenType.Newline) {
			line.nl = i;
			line.depth = depth;
			line.inGroup =
				open[open.length - 1] === TokenType.LeftParenthesis ||
				open[open.length - 1] === TokenType.LeftCurlyBracket;
			lines.push(line);
			line = { first: -1, last: -1, nl: -1, depth: 0 };
			continue;
		}

		if (
			t.type === TokenType.LeftParenthesis ||
			t.type === TokenType.LeftSquareBracket ||
			t.type === TokenType.LeftCurlyBracket
		) {
			depth++;
			open.push(t.type);
		} else if (
			t.type === TokenType.RightParenthesis ||
			t.type === TokenType.RightSquareBracket ||
			t.type === TokenType.RightCurlyBracket
		) {
			depth = Math.max(0, depth - 1);
			open.pop();
		}

		if (isSpace(t)) continue;
		if (line.first === -1) line.first = i;
		if (!isComment(t)) line.last = i;
	}

	lines.push(line);

	return lines;
}

/**
 * 不属于 at-rule 与变量声明的逻辑行是否为属性声明(值上下文), 否则按选择器处理.
 * 声明: 以 `:` 开头(旧式 `:prop value`), 或属性名(可带 `*`/`_` hack 前缀与插值)后紧跟 `:`
 * 且 `:` 后是空白或行尾; `a:hover` 这类 `:` 后紧跟内容的写法按选择器处理.
 * @param {!Array} tokens
 * @param {number} head 逻辑行首个 token 的下标
 * @param {number} end 逻辑行末个 token 的下标
 * @returns {boolean}
 */
function isDeclaration(tokens, head, end) {
	var i = head;

	if (tokens[i].type === TokenType.Colon) return true;
	if (tokens[i].type === TokenType.Asterisk || tokens[i].type === TokenType.LowLine) i++;

	var start = i;
	for (; i <= end; i++) {
		var type = tokens[i].type;
		if (
			type === TokenType.Identifier ||
			type === TokenType.HyphenMinus ||
			type === TokenType.LowLine ||
			type === TokenType.DecimalNumber
		) {
			continue;
		}
		// 插值 `#{...}`: 跳到配对的 `}`
		if (
			type === TokenType.NumberSign &&
			i < end &&
			tokens[i + 1].type === TokenType.LeftCurlyBracket
		) {
			var depth = 0;
			for (i++; i <= end; i++) {
				if (tokens[i].type === TokenType.LeftCurlyBracket) depth++;
				else if (tokens[i].type === TokenType.RightCurlyBracket && !--depth) break;
			}
			continue;
		}
		break;
	}

	if (i === start || i > end || tokens[i].type !== TokenType.Colon) return false;

	return i === end || isSpace(tokens[i + 1]) || tokens[i + 1].type === TokenType.Newline;
}

/**
 * 行尾是否停在语句中间.
 * @param {!Array} tokens
 * @param {!Object} line
 * @param {number} head 逻辑行首个 token 的下标
 * @param {string} name 逻辑行所属 at-rule 名; 变量声明为 `$`, 其余为空串
 * @returns {boolean}
 */
function endsUnfinished(tokens, line, head, name) {
	if (line.last === -1) return false;

	var last = tokens[line.last];
	var type = last.type;

	if (type === TokenType.Comma || type === TokenType.ExclamationMark) {
		return true;
	}

	if (type === TokenType.Colon) return name === "$";

	// 单独一个 `=`: `=name` 混入简写的名字在下一行
	if (type === TokenType.EqualsSign && line.last === head) return true;

	// 运算符: at-rule 与变量声明里一律续行; 属性声明的值里只认前面带空白的(`a: 1 >`);
	// 选择器里行尾的 `>`, `+` 是组合符, dart-sass 当作语句结束, 不续行
	if (OPERATORS.indexOf(type) !== -1 && line.last !== head) {
		if (name !== "") return true;
		return isSpace(tokens[line.last - 1]) && isDeclaration(tokens, head, line.last);
	}

	// 单独的 at-rule 名(例: `@if`, `@include`)
	if (line.last === head + 1 && name !== "$") {
		return AT_RULES_WITH_ARGUMENTS.indexOf(name) !== -1;
	}

	return (
		type === TokenType.Identifier &&
		line.last > head + 1 &&
		(KEYWORDS_AT_END[name] || []).indexOf(last.value) !== -1
	);
}

/**
 * 下一行开头是否只能接续上一行.
 * @param {!Object} next 下一行首个 token
 * @param {string} name 上一逻辑行所属 at-rule 名, 同 endsUnfinished
 * @returns {boolean}
 */
function startsContinued(next, name) {
	if (next.type === TokenType.Colon) return name === "$";
	if (next.type === TokenType.Comma) return name === "each";

	if (next.type === TokenType.LeftParenthesis) {
		return AT_RULES_WITH_PARAMS.indexOf(name) !== -1;
	}

	return (
		next.type === TokenType.Identifier &&
		(KEYWORDS_AT_START[name] || []).indexOf(next.value) !== -1
	);
}

/**
 * 把语句未结束处的换行改成空白 token, value 保持原样以便逐字还原.
 * `wasNewline` 供位置计算识别原换行; `joined` 标记圆括号与插值花括号内(剩余参数 `...` 之前除外)
 * 与紧邻 `,`, 括号的换行, 旧解析器本就支持这些位置, 保留其独立空白节点以免 AST 形态变化.
 * @param {!Array} tokens
 * @returns {!Array}
 */
module.exports = function join(tokens) {
	var lines = getLines(tokens);

	for (var k = 0; k < lines.length - 1; k++) {
		var line = lines[k];
		var nextLine = lines[k + 1];
		// 逻辑行首: 已并入的行沿用第一行的行首
		var head = line.head !== undefined ? line.head : line.first;

		// 括号内的空行也属于同一语句, 其余情形空行不续行
		if (line.depth === 0) {
			if (line.first === -1 || nextLine.first === -1) continue;

			var name = "";

			if (tokens[head].type === TokenType.DollarSign) name = "$";
			else if (tokens[head].type === TokenType.CommercialAt && tokens[head + 1]) {
				name = tokens[head + 1].value;
			}

			if (
				!endsUnfinished(tokens, line, head, name) &&
				!startsContinued(tokens[nextLine.first], name)
			)
				continue;
		}

		var nl = tokens[line.nl];
		var last = line.last === -1 ? null : tokens[line.last];
		var next = nextLine.first === -1 ? null : tokens[nextLine.first];

		nl.type = TokenType.Space;
		nl.wasNewline = true;
		nl.joined = Boolean(
			(line.inGroup && !(next && next.type === TokenType.FullStop)) ||
			(last && (last.type === TokenType.Comma || last.type === TokenType.LeftParenthesis)) ||
			(next && next.type === TokenType.RightParenthesis)
		);
		nextLine.head = head;
	}

	return tokens;
};
