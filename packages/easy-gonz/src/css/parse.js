"use strict";

const comment = require("../comment");
const Node = require("../node/basic-node");
const NodeType = require("../node/node-types");
const TokenType = require("../token-types");

/**
 * @type {Array}
 */
let tokens;

/**
 * @type {Number}
 */
let tokensLength;

/**
 * @type {Number}
 */
let pos;

/**
 * Whether invalid input is kept through error recovery (`recover` option);
 *      when `false`, every recovery point throws instead
 * @type {Boolean}
 */
let recover = true;

const contexts = {
	atkeyword: () => {
		return checkAtkeyword(pos) && getAtkeyword();
	},
	atrule: () => {
		return checkAtrule(pos) && getAtrule();
	},
	attributeSelector: () => {
		return checkAttributeSelector(pos) && getAttributeSelector();
	},
	block: () => {
		return checkBlock(pos) && getBlock();
	},
	brackets: () => {
		return checkBrackets(pos) && getBrackets();
	},
	class: () => {
		return checkClass(pos) && getClass();
	},
	combinator: () => {
		return checkCombinator(pos) && getCombinator();
	},
	commentML: () => {
		return checkCommentML(pos) && getCommentML();
	},
	declaration: () => {
		return checkDeclaration(pos) && getDeclaration();
	},
	declDelim: () => {
		return checkDeclDelim(pos) && getDeclDelim();
	},
	delim: () => {
		return checkDelim(pos) && getDelim();
	},
	dimension: () => {
		return checkDimension(pos) && getDimension();
	},
	expression: () => {
		return checkExpression(pos) && getExpression();
	},
	function: () => {
		return checkFunction(pos) && getFunction();
	},
	ident: () => {
		return checkIdent(pos) && getIdent();
	},
	important: () => {
		return checkImportant(pos) && getImportant();
	},
	namespace: () => {
		return checkNamespace(pos) && getNamespace();
	},
	number: () => {
		return checkNumber(pos) && getNumber();
	},
	operator: () => {
		return checkOperator(pos) && getOperator();
	},
	parentheses: () => {
		return checkParentheses(pos) && getParentheses();
	},
	percentage: () => {
		return checkPercentage(pos) && getPercentage();
	},
	progid: () => {
		return checkProgid(pos) && getProgid();
	},
	property: () => {
		return checkProperty(pos) && getProperty();
	},
	propertyDelim: () => {
		return checkPropertyDelim(pos) && getPropertyDelim();
	},
	pseudoc: () => {
		return checkPseudoc(pos) && getPseudoc();
	},
	pseudoe: () => {
		return checkPseudoe(pos) && getPseudoe();
	},
	ruleset: () => {
		return checkRuleset(pos) && getRuleset();
	},
	s: () => {
		return checkS(pos) && getS();
	},
	selector: () => {
		return checkSelector(pos) && getSelector();
	},
	shash: () => {
		return checkShash(pos) && getShash();
	},
	string: () => {
		return checkString(pos) && getString();
	},
	stylesheet: () => {
		return checkStylesheet(pos) && getStylesheet();
	},
	unary: () => {
		return checkUnary(pos) && getUnary();
	},
	unicodeRange: () => {
		return checkUnicodeRange(pos) && getUnicodeRange();
	},
	universalSelector: () => {
		return checkUniversalSelector(pos) && getUniversalSelector();
	},
	urange: () => {
		return checkUrange(pos) && getUrange();
	},
	uri: () => {
		return checkUri(pos) && getUri();
	},
	value: () => {
		return checkValue(pos) && getValue();
	},
	vhash: () => {
		return checkVhash(pos) && getVhash();
	},
};

/**
 * Stop parsing and display error
 * @param {Number=} i Token's index number
 */
function throwError(i) {
	const ln = tokens[i].ln;

	throw { line: ln, syntax: "css" };
}

/**
 * @param {Object} exclude
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkExcluding(exclude, i) {
	const start = i;

	while (i < tokensLength) {
		if (exclude[tokens[i++].type]) break;
	}

	return i - start - 2;
}

/**
 * @param {Number} start
 * @param {Number} finish
 * @returns {String}
 */
function joinValues(start, finish) {
	let s = "";

	for (let i = start; i < finish + 1; i++) {
		s += tokens[i].value;
	}

	return s;
}

/**
 * @param {Number} start
 * @param {Number} num
 * @returns {String}
 */
function joinValues2(start, num) {
	if (start + num - 1 >= tokensLength) return;

	let s = "";

	for (let i = 0; i < num; i++) {
		s += tokens[start + i].value;
	}

	return s;
}

function getLastPosition(content, line, column, colOffset) {
	return typeof content === "string"
		? getLastPositionForString(content, line, column, colOffset)
		: getLastPositionForArray(content, line, column, colOffset);
}

function getLastPositionForString(content, line, column, colOffset) {
	let position = [];

	if (!content) {
		position = [line, column];
		if (colOffset) position[1] += colOffset - 1;
		return position;
	}

	const lastLinebreak = content.lastIndexOf("\n");
	const endsWithLinebreak = lastLinebreak === content.length - 1;
	const splitContent = content.split("\n");
	const linebreaksCount = splitContent.length - 1;
	const prevLinebreak =
		linebreaksCount === 0 || linebreaksCount === 1
			? -1
			: content.length - splitContent[linebreaksCount - 1].length - 2;

	// Line:
	let offset = endsWithLinebreak ? linebreaksCount - 1 : linebreaksCount;
	position[0] = line + offset;

	// Column:
	if (endsWithLinebreak) {
		offset = prevLinebreak !== -1 ? content.length - prevLinebreak : content.length - 1;
	} else {
		offset =
			linebreaksCount !== 0
				? content.length - lastLinebreak - column - 1
				: content.length - 1;
	}
	position[1] = column + offset;

	if (!colOffset) return position;

	if (endsWithLinebreak) {
		position[0]++;
		position[1] = colOffset;
	} else {
		position[1] += colOffset;
	}

	return position;
}

function getLastPositionForArray(content, line, column, colOffset) {
	let position;

	if (content.length === 0) {
		position = [line, column];
	} else {
		const c = content[content.length - 1];
		if (c.hasOwnProperty("end")) {
			position = [c.end.line, c.end.column];
		} else {
			position = getLastPosition(c.content, line, column);
		}
	}

	if (!colOffset) return position;

	if (tokens[pos - 1] && tokens[pos - 1].type !== "Newline") {
		position[1] += colOffset;
	} else {
		position[0]++;
		position[1] = 1;
	}

	return position;
}

function newNode(type, content, line, column, end) {
	if (!end) end = getLastPosition(content, line, column);
	return new Node({
		type: type,
		content: content,
		start: { line: line, column: column },
		end: { line: end[0], column: end[1] },
		syntax: "css",
	});
}

/**
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkAny(i) {
	let l;

	if ((l = checkBrackets(i))) tokens[i].any_child = 1;
	else if ((l = checkParentheses(i))) tokens[i].any_child = 2;
	else if ((l = checkString(i))) tokens[i].any_child = 3;
	else if ((l = checkPercentage(i))) tokens[i].any_child = 4;
	else if ((l = checkDimension(i))) tokens[i].any_child = 5;
	else if ((l = checkUnicodeRange(i))) tokens[i].any_child = 13;
	else if ((l = checkNumber(i))) tokens[i].any_child = 6;
	else if ((l = checkUri(i))) tokens[i].any_child = 7;
	else if ((l = checkExpression(i))) tokens[i].any_child = 8;
	else if ((l = checkFunction(i))) tokens[i].any_child = 9;
	else if ((l = checkIdent(i))) tokens[i].any_child = 10;
	else if ((l = checkClass(i))) tokens[i].any_child = 11;
	else if ((l = checkUnary(i))) tokens[i].any_child = 12;

	return l;
}

/**
 * @returns {Node}
 */
function getAny() {
	const childType = tokens[pos].any_child;

	if (childType === 1) return getBrackets();
	if (childType === 2) return getParentheses();
	if (childType === 3) return getString();
	if (childType === 4) return getPercentage();
	if (childType === 5) return getDimension();
	if (childType === 13) return getUnicodeRange();
	if (childType === 6) return getNumber();
	if (childType === 7) return getUri();
	if (childType === 8) return getExpression();
	if (childType === 9) return getFunction();
	if (childType === 10) return getIdent();
	if (childType === 11) return getClass();
	if (childType === 12) return getUnary();
}

/**
 * @returns {Node}
 */
function getArguments() {
	const type = NodeType.ArgumentsType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	let content = [];
	let body;

	// Skip `(`.
	pos++;

	while (pos < tokensLength && tokens[pos].type !== TokenType.RightParenthesis) {
		if (checkDeclaration(pos)) content.push(getDeclaration());
		else if (checkArgument(pos)) {
			body = getArgument();
			if (typeof body.content === "string") content.push(body);
			else content = content.concat(body);
		} else if (checkClass(pos)) content.push(getClass());
		else throwError(pos);
	}

	const end = getLastPosition(content, line, column, 1);

	// Skip `)`.
	pos++;

	return newNode(type, content, line, column, end);
}

/**
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkArgument(i) {
	let l;

	if ((l = checkVhash(i))) tokens[i].argument_child = 1;
	else if ((l = checkCustomProperty(i))) tokens[i].argument_child = 2;
	else if ((l = checkAny(i))) tokens[i].argument_child = 3;
	else if ((l = checkSC(i))) tokens[i].argument_child = 4;
	else if ((l = checkOperator(i))) tokens[i].argument_child = 5;
	else if ((l = checkComparison(i))) tokens[i].argument_child = 6;
	else if ((l = checkParentSelector(i))) tokens[i].argument_child = 7;
	else if ((l = checkValueBlock(i))) tokens[i].argument_child = 8;

	return l;
}

/**
 * @returns {Node}
 */
function getArgument() {
	const childType = tokens[pos].argument_child;

	if (childType === 1) return getVhash();
	if (childType === 2) return getCustomProperty();
	if (childType === 3) return getAny();
	if (childType === 4) return getSC();
	if (childType === 5) return getOperator();
	if (childType === 6) return getOperator();
	if (childType === 7) return getParentSelector();
	if (childType === 8) return getValueBlock();
}

/**
 * Check if token is part of an @-word (e.g. `@import`, `@include`)
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkAtkeyword(i) {
	let l;

	// Check that token is `@`:
	if (i >= tokensLength || tokens[i++].type !== TokenType.CommercialAt) return 0;

	l = checkIdent(i);
	return l ? l + 1 : 0;
}

/**
 * Get node with @-word
 * @returns {Node}
 */
function getAtkeyword() {
	const type = NodeType.AtkeywordType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;

	// Skip `@`.
	pos++;

	const content = [getIdent()];

	return newNode(type, content, line, column);
}

/**
 * Check if token is a part of an @-rule
 * @param {Number} i Token's index number
 * @returns {Number} Length of @-rule
 */
function checkAtrule(i) {
	let l;

	if (i >= tokensLength) return 0;

	// If token already has a record of being part of an @-rule,
	// return the @-rule's length:
	if (tokens[i].atrule_l !== undefined) return tokens[i].atrule_l;

	// If token is part of an @-rule, save the rule's type to token.
	// @keyframes:
	if ((l = checkKeyframesRule(i))) tokens[i].atrule_type = 4;
	// @-rule with ruleset:
	else if ((l = checkAtruler(i))) tokens[i].atrule_type = 1;
	// Block @-rule:
	else if ((l = checkAtruleb(i))) tokens[i].atrule_type = 2;
	// Single-line @-rule:
	else if ((l = checkAtrules(i))) tokens[i].atrule_type = 3;
	else return 0;

	// If token is part of an @-rule, save the rule's length to token:
	tokens[i].atrule_l = l;

	return l;
}

/**
 * Get node with @-rule
 * @returns {Node}
 */
function getAtrule() {
	const childType = tokens[pos].atrule_type;

	if (childType === 1) return getAtruler(); // @-rule with ruleset
	if (childType === 2) return getAtruleb(); // Block @-rule
	if (childType === 3) return getAtrules(); // Single-line @-rule
	if (childType === 4) return getKeyframesRule();
}

/**
 * Check if token is part of a block @-rule
 * @param {Number} i Token's index number
 * @returns {Number} Length of the @-rule
 */
function checkAtruleb(i) {
	const start = i;
	let l;

	if (i >= tokensLength) return 0;

	if ((l = checkAtkeyword(i))) i += l;
	else return 0;

	if ((l = checkTsets(i))) i += l;

	if ((l = checkBlock(i))) i += l;
	else return 0;

	return i - start;
}

/**
 * Get node with a block @-rule
 * @returns {Node}
 */
function getAtruleb() {
	const type = NodeType.AtruleType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = [].concat(getAtkeyword(), getTsets(), getBlock());

	return newNode(type, content, line, column);
}

/**
 * Check if token is part of an @-rule with ruleset
 * @param {Number} i Token's index number
 * @returns {Number} Length of the @-rule
 */
function checkAtruler(i) {
	const start = i;
	let l;

	if (i >= tokensLength) return 0;

	if ((l = checkAtkeyword(i))) i += l;
	else return 0;

	if ((l = checkTsets(i))) i += l;

	if (i < tokensLength && tokens[i].type === TokenType.LeftCurlyBracket) i++;
	else return 0;

	if ((l = checkAtrulers(i))) i += l;

	if (i < tokensLength && tokens[i].type === TokenType.RightCurlyBracket) i++;
	else return 0;

	return i - start;
}

/**
 * Get node with an @-rule with ruleset
 * @returns {Node}
 */
function getAtruler() {
	const type = NodeType.AtruleType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = [].concat(getAtkeyword(), getTsets(), getAtrulers());

	return newNode(type, content, line, column);
}

/**
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkAtrulers(i) {
	const start = i;
	let l;

	if (i >= tokensLength) return 0;

	if ((l = checkSC(i))) i += l;

	while (i < tokensLength) {
		if ((l = checkSC(i))) tokens[i].atrulers_child = 1;
		else if ((l = checkAtrule(i))) tokens[i].atrulers_child = 2;
		else if ((l = checkRuleset(i))) tokens[i].atrulers_child = 3;
		else break;
		i += l;
	}

	if (i < tokensLength) tokens[i].atrulers_end = 1;

	if ((l = checkSC(i))) i += l;

	return i - start;
}

/**
 * @returns {Node}
 */
function getAtrulers() {
	const type = NodeType.BlockType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	let content = [];

	// Skip `{`.
	pos++;

	content = content.concat(getSC());

	while (pos < tokensLength && !tokens[pos].atrulers_end) {
		const childType = tokens[pos].atrulers_child;
		if (childType === 1) content = content.concat(getSC());
		else if (childType === 2) content.push(getAtrule());
		else if (childType === 3) content.push(getRuleset());
		else break;
	}

	content = content.concat(getSC());

	const end = getLastPosition(content, line, column, 1);

	// Skip `}`.
	pos++;

	return newNode(type, content, line, column, end);
}

/**
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkAtrules(i) {
	const start = i;
	let l;

	if (i >= tokensLength) return 0;

	if ((l = checkAtkeyword(i))) i += l;
	else return 0;

	if ((l = checkTsets(i))) i += l;

	return i - start;
}

/**
 * @returns {Node}
 */
function getAtrules() {
	const type = NodeType.AtruleType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = [].concat(getAtkeyword(), getTsets());

	return newNode(type, content, line, column);
}

/**
 * Check if token is part of a block (e.g. `{...}`).
 * @param {Number} i Token's index number
 * @returns {Number} Length of the block
 */
function checkBlock(i) {
	return i < tokensLength && tokens[i].type === TokenType.LeftCurlyBracket
		? tokens[i].right - i + 1
		: 0;
}

/**
 * Get node with a block
 * @returns {Node}
 */
function getBlock() {
	const type = NodeType.BlockType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const end = tokens[pos].right;
	let content = [];

	// Skip `{`.
	pos++;

	while (pos < end) {
		if (checkBlockdecl(pos)) content = content.concat(getBlockdecl());
		else {
			content = content.concat(getRawStatement(checkStatementEnd(pos, end), true));
		}
	}

	const end_ = getLastPosition(content, line, column, 1);
	pos = end + 1;

	return newNode(type, content, line, column, end_);
}

/**
 * Check if token is part of a declaration (property-value pair)
 * @param {Number} i Token's index number
 * @returns {Number} Length of the declaration
 */
function checkBlockdecl(i) {
	let l;

	if (i >= tokensLength) return 0;

	if ((l = checkBlockdecl1(i))) tokens[i].bd_type = 1;
	else if ((l = checkBlockdecl2(i))) tokens[i].bd_type = 2;
	else if ((l = checkBlockdecl3(i))) tokens[i].bd_type = 3;
	else if ((l = checkBlockdecl4(i))) tokens[i].bd_type = 4;
	else return 0;

	return l;
}

/**
 * @returns {Array}
 */
function getBlockdecl() {
	const childType = tokens[pos].bd_type;

	if (childType === 1) return getBlockdecl1();
	if (childType === 2) return getBlockdecl2();
	if (childType === 3) return getBlockdecl3();
	if (childType === 4) return getBlockdecl4();
}

/**
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkBlockdecl1(i) {
	const start = i;
	let l;

	if ((l = checkSC(i))) i += l;

	if ((l = checkCustomPropertyDeclaration(i))) tokens[i].bd_kind = 1;
	else if ((l = checkRuleset(i))) tokens[i].bd_kind = 3;
	else if ((l = checkDeclaration(i))) tokens[i].bd_kind = 1;
	else if ((l = checkAtrule(i))) tokens[i].bd_kind = 2;
	else return 0;

	i += l;

	if ((l = checkSC(i))) i += l;

	if (i < tokensLength && (l = checkDeclDelim(i))) i += l;
	else return 0;

	if ((l = checkSC(i))) i += l;
	else return 0;

	return i - start;
}

/**
 * @returns {Array}
 */
function getBlockdecl1() {
	const sc = getSC();
	let content;

	switch (tokens[pos].bd_kind) {
		case 1:
			content = getDeclaration();
			break;
		case 2:
			content = getAtrule();
			break;
		case 3:
			content = getRuleset();
			break;
	}

	return sc.concat(content, getSC(), getDeclDelim(), getSC());
}

/**
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkBlockdecl2(i) {
	const start = i;
	let l;

	if ((l = checkSC(i))) i += l;

	if ((l = checkCustomPropertyDeclaration(i))) tokens[i].bd_kind = 1;
	else if ((l = checkRuleset(i))) tokens[i].bd_kind = 3;
	else if ((l = checkDeclaration(i))) tokens[i].bd_kind = 1;
	else if ((l = checkAtrule(i))) tokens[i].bd_kind = 2;
	else return 0;

	i += l;

	if ((l = checkSC(i))) i += l;

	return i - start;
}

/**
 * @returns {Array}
 */
function getBlockdecl2() {
	const sc = getSC();
	let content;

	switch (tokens[pos].bd_kind) {
		case 1:
			content = getDeclaration();
			break;
		case 2:
			content = getAtrule();
			break;
		case 3:
			content = getRuleset();
			break;
	}

	return sc.concat(content, getSC());
}

/**
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkBlockdecl3(i) {
	const start = i;
	let l;

	if ((l = checkSC(i))) i += l;

	if ((l = checkDeclDelim(i))) i += l;
	else return 0;

	if ((l = checkSC(i))) i += l;

	return i - start;
}

/**
 * @returns {Array}
 */
function getBlockdecl3() {
	return [].concat(getSC(), getDeclDelim(), getSC());
}

/**
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkBlockdecl4(i) {
	return checkSC(i);
}

/**
 * @returns {Array}
 */
function getBlockdecl4() {
	return getSC();
}

/**
 * Check if token is part of text inside square brackets, e.g. `[1]`
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkBrackets(i) {
	if (i >= tokensLength) return 0;

	const start = i;

	// Skip `[`.
	if (tokens[i].type === TokenType.LeftSquareBracket && tokens[i].right !== undefined) i++;
	else return 0;

	if (i < tokens[start].right) {
		const l = checkTsets(i);
		if (l) i += l;
		else return 0;
	}

	// Skip `]`.
	i++;

	return i - start;
}

/**
 * Get node with text inside square brackets, e.g. `[1]`
 * @returns {Node}
 */
function getBrackets() {
	const type = NodeType.BracketsType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const right = token.right;
	let content = [];

	// Skip `[`.
	pos++;

	if (pos < right) {
		content = getTsets();
	}

	const end = getLastPosition(content, line, column, 1);

	// Skip `]`.
	pos++;

	return newNode(type, content, line, column, end);
}

/**
 * Check if token is part of a class selector (e.g. `.abc`)
 * @param {Number} i Token's index number
 * @returns {Number} Length of the class selector
 */
function checkClass(i) {
	const start = i;
	let l;

	if (i >= tokensLength) return 0;

	if (tokens[i].class_l) return tokens[i].class_l;

	// Skip `.`.
	if (tokens[i].type === TokenType.FullStop) i++;
	else return 0;

	if ((l = checkIdent(i))) {
		i += l;
		// Class name prefix (`.foo-*`, CSS Selectors 5 draft).
		if (
			i < tokensLength &&
			tokens[i].type === TokenType.Asterisk &&
			tokens[i - 1].type === TokenType.HyphenMinus
		) {
			tokens[start].classPrefixEnd = i;
			i++;
		}
		tokens[start].class_l = i - start;
	} else return 0;

	tokens[start].classEnd = i;

	return i - start;
}

/**
 * Get node with a class selector
 * @returns {Node}
 */
function getClass() {
	const type = NodeType.ClassType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;

	const prefixEnd = tokens[pos].classPrefixEnd;

	// Skip `.`
	pos++;

	let content;
	if (prefixEnd) {
		const t = tokens[pos];
		content = [newNode(NodeType.IdentType, joinValues(pos, prefixEnd), t.ln, t.col)];
		pos = prefixEnd + 1;
	} else content = [getIdent()];

	return newNode(type, content, line, column);
}

function checkCombinator(i) {
	if (i >= tokensLength) return 0;

	let l;
	if ((l = checkCombinator1(i))) tokens[i].combinatorType = 1;
	else if ((l = checkCombinator2(i))) tokens[i].combinatorType = 2;
	else if ((l = checkCombinator3(i))) tokens[i].combinatorType = 3;
	else if ((l = checkCombinator4(i))) tokens[i].combinatorType = 4;

	return l;
}

function getCombinator() {
	const type = tokens[pos].combinatorType;
	if (type === 1) return getCombinator1();
	if (type === 2) return getCombinator2();
	if (type === 3) return getCombinator3();
	if (type === 4) return getCombinator4();
}

/**
 * (1) `>>>`
 *
 * @param {Number} i
 * @returns {Number}
 */
function checkCombinator1(i) {
	if (
		i < tokensLength &&
		tokens[i++].type === TokenType.GreaterThanSign &&
		i < tokensLength &&
		tokens[i++].type === TokenType.GreaterThanSign &&
		i < tokensLength &&
		tokens[i++].type === TokenType.GreaterThanSign
	)
		return 3;

	return 0;
}

/**
 * @returns {Node}
 */
function getCombinator1() {
	const type = NodeType.CombinatorType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = `>>>`;

	// Skip combinator
	pos += 3;

	return newNode(type, content, line, column);
}

/**
 * (1) `||`
 * (2) `>>`
 *
 * @param {Number} i
 * @returns {Number}
 */
function checkCombinator2(i) {
	if (i + 1 >= tokensLength) return 0;

	if (tokens[i].type === TokenType.VerticalLine && tokens[i + 1].type === TokenType.VerticalLine)
		return 2;

	if (
		tokens[i].type === TokenType.GreaterThanSign &&
		tokens[i + 1].type === TokenType.GreaterThanSign
	)
		return 2;

	return 0;
}

/**
 * @returns {Node}
 */
function getCombinator2() {
	const type = NodeType.CombinatorType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = `${token.value}${tokens[pos + 1].value}`;

	// Skip combinator
	pos += 2;

	return newNode(type, content, line, column);
}

/**
 * (1) `>`
 * (2) `+`
 * (3) `~`
 *
 * @param {Number} i
 * @returns {Number}
 */
function checkCombinator3(i) {
	const type = tokens[i].type;
	if (
		type === TokenType.PlusSign ||
		type === TokenType.GreaterThanSign ||
		type === TokenType.Tilde
	)
		return 1;
	else return 0;
}

/**
 * @returns {Node}
 */
function getCombinator3() {
	const type = NodeType.CombinatorType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = token.value;

	// Skip combinator
	pos++;

	return newNode(type, content, line, column);
}

/**
 * (1) `/panda/`
 */
function checkCombinator4(i) {
	const start = i;

	if (tokens[i].type === TokenType.Solidus) i++;
	else return 0;

	let l;
	if ((l = checkIdent(i))) i += l;
	else return 0;

	if (tokens[i].type === TokenType.Solidus) i++;
	else return 0;

	return i - start;
}

/**
 * @returns {Node}
 */
function getCombinator4() {
	const type = NodeType.CombinatorType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;

	// Skip `/`.
	pos++;

	const ident = getIdent();

	// Skip `/`.
	pos++;

	const content = `/${ident.content}/`;

	return newNode(type, content, line, column);
}

/**
 * Check if token is a multiline comment.
 * @param {Number} i Token's index number
 * @returns {Number} `1` if token is a multiline comment, otherwise `0`
 */
function checkCommentML(i) {
	return i < tokensLength && tokens[i].type === TokenType.CommentML ? 1 : 0;
}

/**
 * Get node with a multiline comment
 * @returns {Node}
 */
function getCommentML() {
	const type = NodeType.CommentMLType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	let content = tokens[pos].value.substring(2);
	const l = content.length;
	// 到 EOF 仍未闭合的注释没有 `*/`, end 落在最后一个字符上, stringify 据此不补 `*/`
	const closed = content.charAt(l - 2) === "*" && content.charAt(l - 1) === "/";
	let end;

	if (closed) {
		content = content.substring(0, l - 2);
		end = getLastPosition(content, line, column, 2);
		if (end[0] === line) end[1] += 2;
	} else {
		end = comment.unclosedEnd(content, line, column);
	}
	pos++;

	return newNode(type, content, line, column, end);
}

/**
 * Check if token is part of a declaration (property-value pair)
 * @param {Number} i Token's index number
 * @returns {Number} Length of the declaration
 */
function checkDeclaration(i) {
	const start = i;
	let l;

	if (i >= tokensLength) return 0;

	if ((l = checkProperty(i))) i += l;
	else return 0;

	if ((l = checkSC(i))) i += l;

	if ((l = checkPropertyDelim(i))) i++;
	else return 0;

	if ((l = checkSC(i))) i += l;

	// Value may be empty (e.g. `a{b:}`, `--x:;`).
	i += checkValue(i);

	return i - start;
}

/**
 * Check if token is part of a custom property declaration
 *      (e.g. `--x: a { b } c`), which takes precedence over a rule
 *      with a selector like `--x:hover`
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkCustomPropertyDeclaration(i) {
	return checkCustomProperty(i) ? checkDeclaration(i) : 0;
}

/**
 * Get node with a declaration
 * @returns {Node}
 */
function getDeclaration() {
	const type = NodeType.DeclarationType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = [].concat(getProperty(), getSC(), getPropertyDelim(), getSC());

	if (checkValue(pos)) content.push(getValue());
	else {
		// Empty value has zero width right after the last node.
		const end = content[content.length - 1].end;
		content.push(
			newNode(NodeType.ValueType, [], end.line, end.column + 1, [end.line, end.column])
		);
	}

	return newNode(type, content, line, column);
}

/**
 * Check if token is a semicolon
 * @param {Number} i Token's index number
 * @returns {Number} `1` if token is a semicolon, otherwise `0`
 */
function checkDeclDelim(i) {
	return i < tokensLength && tokens[i].type === TokenType.Semicolon ? 1 : 0;
}

/**
 * Get node with a semicolon
 * @returns {Node}
 */
function getDeclDelim() {
	const type = NodeType.DeclDelimType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = ";";

	pos++;

	return newNode(type, content, line, column);
}

/**
 * Check if token is a comma
 * @param {Number} i Token's index number
 * @returns {Number} `1` if token is a comma, otherwise `0`
 */
function checkDelim(i) {
	return i < tokensLength && tokens[i].type === TokenType.Comma ? 1 : 0;
}

/**
 * Get node with a comma
 * @returns {Node}
 */
function getDelim() {
	const type = NodeType.DelimType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = ",";

	pos++;

	return newNode(type, content, line, column);
}

/**
 * Check if token is part of a number with dimension unit (e.g. `10px`)
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkDimension(i) {
	const ln = checkNumber(i);
	let li;

	if (i >= tokensLength || !ln || i + ln >= tokensLength) return 0;

	li = checkUnit(i + ln);
	return li ? ln + li : 0;
}

/**
 * Get node of a number with dimension unit
 * @returns {Node}
 */
function getDimension() {
	const type = NodeType.DimensionType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = [getNumber(), getUnit()];

	return newNode(type, content, line, column);
}

/**
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkExpression(i) {
	const start = i;

	if (
		i >= tokensLength ||
		tokens[i++].value !== "expression" ||
		i >= tokensLength ||
		tokens[i].type !== TokenType.LeftParenthesis
	) {
		return 0;
	}

	return tokens[i].right - start + 1;
}

/**
 * @returns {Node}
 */
function getExpression() {
	const type = NodeType.ExpressionType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;

	pos++;

	const content = joinValues(pos + 1, tokens[pos].right - 1);
	const end = getLastPosition(content, line, column, 1);

	if (end[0] === line) end[1] += 11;
	pos = tokens[pos].right + 1;

	return newNode(type, content, line, column, end);
}

/**
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkFunction(i) {
	const start = i;
	let l;

	if (i >= tokensLength) return 0;

	if ((l = checkIdent(i))) i += l;
	else return 0;

	return i < tokensLength && tokens[i].type === TokenType.LeftParenthesis
		? tokens[i].right - start + 1
		: 0;
}

/**
 * @returns {Node}
 */
function getFunction() {
	const type = NodeType.FunctionType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = [].concat(getIdent(), getArguments());

	return newNode(type, content, line, column);
}

/**
 * Check if token is part of an identifier
 * Grammar from CSS spec:
 *   h         [0-9a-f]
 *   nonascii  [\240-\377]
 *   unicode   \\{h}{1,6}(\r\n|[ \t\r\n\f])?
 *   escape    {unicode}|\\[^\r\n\f0-9a-f]
 *   nmstart   [_a-z]|{nonascii}|{escape}
 *   nmchar    [_a-z0-9-]|{nonascii}|{escape}
 *   ident     -?{nmstart}{nmchar}*
 *
 * @param {number} i Token's index number
 * @returns {number} Length of the identifier
 */
function checkIdent(i) {
	const start = i;

	if (i >= tokensLength) return 0;

	if (tokens[i].type === TokenType.HyphenMinus) i++;

	if (tokens[i].type === TokenType.LowLine || tokens[i].type === TokenType.Identifier) i++;
	else return 0;

	for (; i < tokensLength; i++) {
		if (
			tokens[i].type !== TokenType.HyphenMinus &&
			tokens[i].type !== TokenType.LowLine &&
			tokens[i].type !== TokenType.Identifier &&
			tokens[i].type !== TokenType.DecimalNumber
		)
			break;
	}

	tokens[start].ident_last = i - 1;

	return i - start;
}

/**
 * Get node with an identifier
 * @returns {Node}
 */
function getIdent() {
	const type = NodeType.IdentType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = joinValues(pos, tokens[pos].ident_last);

	pos = tokens[pos].ident_last + 1;

	return newNode(type, content, line, column);
}

/**
 * Check if token is part of `!important` word
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkImportant(i) {
	const start = i;
	let l;

	if (i >= tokensLength || tokens[i++].type !== TokenType.ExclamationMark) return 0;

	if ((l = checkSC(i))) i += l;

	if (
		i < tokensLength &&
		tokens[i].type === TokenType.Identifier &&
		tokens[i].value.toLowerCase() === "important"
	) {
		tokens[start].importantEnd = i;
		return i - start + 1;
	} else {
		return 0;
	}
}

/**
 * Get node with `!important` word
 * @returns {Node}
 */
function getImportant() {
	const type = NodeType.ImportantType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = joinValues(pos, token.importantEnd);

	pos = token.importantEnd + 1;

	return newNode(type, content, line, column);
}

/**
 * Check a single keyframe block - `5% {}`
 * @param {Number} i
 * @returns {Number}
 */
function checkKeyframesBlock(i) {
	const start = i;
	let l;

	if (i >= tokensLength) return 0;

	if ((l = checkKeyframesSelectorsGroup(i))) i += l;
	else return 0;

	if ((l = checkSC(i))) i += l;

	if ((l = checkBlock(i))) i += l;
	else return 0;

	return i - start;
}

/**
 * Get a single keyframe block - `5% {}`
 * @returns {Node}
 */
function getKeyframesBlock() {
	const type = NodeType.RulesetType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = [].concat(getKeyframesSelectorsGroup(), getSC(), getBlock());

	return newNode(type, content, line, column);
}

/**
 * Check all keyframe blocks - `5% {} 100% {}`
 * @param {Number} i
 * @returns {Number}
 */
function checkKeyframesBlocks(i) {
	const start = i;
	let l;

	if (i < tokensLength && tokens[i].type === TokenType.LeftCurlyBracket) i++;
	else return 0;

	if ((l = checkSC(i))) i += l;

	if ((l = checkKeyframesBlock(i))) i += l;
	else return 0;

	while (tokens[i].type !== TokenType.RightCurlyBracket) {
		if ((l = checkSC(i))) i += l;
		else if ((l = checkKeyframesBlock(i))) i += l;
		else break;
	}

	if (i < tokensLength && tokens[i].type === TokenType.RightCurlyBracket) i++;
	else return 0;

	return i - start;
}

/**
 * Get all keyframe blocks - `5% {} 100% {}`
 * @returns {Node}
 */
function getKeyframesBlocks() {
	const type = NodeType.BlockType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const keyframesBlocksEnd = token.right;
	let content = [];

	// Skip `{`.
	pos++;

	while (pos < keyframesBlocksEnd) {
		if (checkSC(pos)) content = content.concat(getSC());
		else if (checkKeyframesBlock(pos)) content.push(getKeyframesBlock());
	}

	const end = getLastPosition(content, line, column, 1);

	// Skip `}`.
	pos++;

	return newNode(type, content, line, column, end);
}

/**
 * Check if token is part of a @keyframes rule.
 * @param {Number} i Token's index number
 * @returns {Number} Length of the @keyframes rule
 */
function checkKeyframesRule(i) {
	const start = i;
	let l;

	if (i >= tokensLength) return 0;

	if ((l = checkAtkeyword(i))) i += l;
	else return 0;

	const atruleName = joinValues2(i - l, l);
	if (atruleName.toLowerCase().indexOf("keyframes") === -1) return 0;

	if ((l = checkSC(i))) i += l;
	else return 0;

	if ((l = checkIdent(i))) i += l;
	else return 0;

	if ((l = checkSC(i))) i += l;

	if ((l = checkKeyframesBlocks(i))) i += l;
	else return 0;

	return i - start;
}

/**
 * @returns {Node}
 */
function getKeyframesRule() {
	const type = NodeType.AtruleType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = [].concat(getAtkeyword(), getSC(), getIdent(), getSC(), getKeyframesBlocks());

	return newNode(type, content, line, column);
}

/**
 * Check a single keyframe selector - `5%`, `from` etc
 * @param {Number} i
 * @returns {Number}
 */
function checkKeyframesSelector(i) {
	const start = i;
	let l;

	if (i >= tokensLength) return 0;

	if ((l = checkIdent(i))) {
		// Valid selectors are only `from` and `to`.
		const selector = joinValues2(i, l);
		if (selector !== "from" && selector !== "to") return 0;

		i += l;
		tokens[start].keyframesSelectorType = 1;
	} else if ((l = checkPercentage(i))) {
		i += l;
		tokens[start].keyframesSelectorType = 2;
	} else {
		return 0;
	}

	return i - start;
}

/**
 * Get a single keyframe selector
 * @returns {Node}
 */
function getKeyframesSelector() {
	const keyframesSelectorType = NodeType.KeyframesSelectorType;
	const selectorType = NodeType.SelectorType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = [];

	if (token.keyframesSelectorType === 1) {
		content.push(getIdent());
	} else {
		content.push(getPercentage());
	}

	const keyframesSelector = newNode(keyframesSelectorType, content, line, column);

	return newNode(selectorType, [keyframesSelector], line, column);
}

/**
 * Check the keyframe's selector groups
 * @param {Number} i
 * @returns {Number}
 */
function checkKeyframesSelectorsGroup(i) {
	const start = i;
	let l;

	if ((l = checkKeyframesSelector(i))) i += l;
	else return 0;

	while (i < tokensLength) {
		const spaceBefore = checkSC(i);
		const comma = checkDelim(i + spaceBefore);
		if (!comma) break;

		const spaceAfter = checkSC(i + spaceBefore + comma);
		if ((l = checkKeyframesSelector(i + spaceBefore + comma + spaceAfter))) {
			i += spaceBefore + comma + spaceAfter + l;
		} else break;
	}

	tokens[start].selectorsGroupEnd = i;

	return i - start;
}

/**
 * Get the keyframe's selector groups
 * @returns {Array} An array of keyframe selectors
 */
function getKeyframesSelectorsGroup() {
	let selectorsGroup = [];
	const selectorsGroupEnd = tokens[pos].selectorsGroupEnd;

	selectorsGroup.push(getKeyframesSelector());

	while (pos < selectorsGroupEnd) {
		selectorsGroup = selectorsGroup.concat(
			getSC(),
			getDelim(),
			getSC(),
			getKeyframesSelector()
		);
	}

	return selectorsGroup;
}

/**
 * Check if token is a namespace sign (`|`)
 * @param {Number} i Token's index number
 * @returns {Number} `1` if token is `|`, `0` if not
 */
function checkNamespace(i) {
	return i < tokensLength && tokens[i].type === TokenType.VerticalLine ? 1 : 0;
}

/**
 * Get node with a namespace sign
 * @returns {Node}
 */
function getNamespace() {
	const type = NodeType.NamespaceSeparatorType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = "|";

	pos++;

	return newNode(type, content, line, column);
}

/**
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkNmName2(i) {
	if (tokens[i].type === TokenType.Identifier) return 1;
	else if (tokens[i].type !== TokenType.DecimalNumber) return 0;

	i++;

	return i < tokensLength && tokens[i].type === TokenType.Identifier ? 2 : 1;
}

/**
 * @returns {String}
 */
function getNmName2() {
	let s = tokens[pos].value;

	if (
		tokens[pos++].type === TokenType.DecimalNumber &&
		pos < tokensLength &&
		tokens[pos].type === TokenType.Identifier
	)
		s += tokens[pos++].value;

	return s;
}

/**
 * Check if token is part of a number
 * @param {Number} i Token's index number
 * @returns {Number} Length of number
 */
function checkNumber(i) {
	if (i >= tokensLength) return 0;

	if (tokens[i].number_l) return tokens[i].number_l;

	// `10`:
	// An exponent ends the number (`3e-2.1` is `3e-2` and `.1`):
	if (
		i < tokensLength &&
		tokens[i].type === TokenType.DecimalNumber &&
		(!tokens[i + 1] ||
			/[eE]/.test(tokens[i].value) ||
			(tokens[i + 1] && tokens[i + 1].type !== TokenType.FullStop))
	) {
		tokens[i].number_l = 1;
		return 1;
	}

	// `10.`:
	if (
		i < tokensLength &&
		tokens[i].type === TokenType.DecimalNumber &&
		tokens[i + 1] &&
		tokens[i + 1].type === TokenType.FullStop &&
		(!tokens[i + 2] || tokens[i + 2].type !== TokenType.DecimalNumber)
	) {
		tokens[i].number_l = 2;
		return 2;
	}

	// `.10`:
	if (
		i < tokensLength &&
		tokens[i].type === TokenType.FullStop &&
		tokens[i + 1] &&
		tokens[i + 1].type === TokenType.DecimalNumber
	) {
		tokens[i].number_l = 2;
		return 2;
	}

	// `10.10`:
	if (
		i < tokensLength &&
		tokens[i].type === TokenType.DecimalNumber &&
		tokens[i + 1] &&
		tokens[i + 1].type === TokenType.FullStop &&
		tokens[i + 2] &&
		tokens[i + 2].type === TokenType.DecimalNumber
	) {
		tokens[i].number_l = 3;
		return 3;
	}

	return 0;
}

/**
 * Get node with number
 * @returns {Node}
 */
function getNumber() {
	const type = NodeType.NumberType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const l = tokens[pos].number_l;
	let content = "";

	for (let j = 0; j < l; j++) {
		content += tokens[pos + j].value;
	}

	pos += l;

	return newNode(type, content, line, column);
}

/**
 * Check if token is an operator (`/`, `,`, `:`, `=`, `*`).
 * @param {Number} i Token's index number
 * @returns {Number} `1` if token is an operator, otherwise `0`
 */
function checkOperator(i) {
	if (i >= tokensLength) return 0;

	switch (tokens[i].type) {
		case TokenType.Solidus:
		case TokenType.Comma:
		case TokenType.Colon:
		case TokenType.EqualsSign:
		case TokenType.Asterisk:
			return 1;
	}

	return 0;
}

/**
 * Get node with an operator
 * @returns {Node}
 */
function getOperator() {
	const type = NodeType.OperatorType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = token.value;

	pos++;

	return newNode(type, content, line, column);
}

/**
 * Check if token is part of text inside parentheses, e.g. `(1)`
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkParentheses(i) {
	if (i >= tokensLength) return 0;

	const start = i;
	const right = tokens[i].right;

	// Skip `(`.
	if (tokens[i].type === TokenType.LeftParenthesis && right !== undefined) i++;
	else return 0;

	if (i < right) {
		const l = checkTsets(i);
		if (l) i += l;
		else return 0;
	}

	// Skip `)`.
	i++;

	return i - start;
}

/**
 * Get node with text inside parentheses, e.g. `(1)`
 * @returns {Node}
 */
function getParentheses() {
	const type = NodeType.ParenthesesType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const right = token.right;
	let content = [];

	// Skip `(`.
	pos++;

	if (pos < right) {
		content = getTsets();
	}

	const end = getLastPosition(content, line, column, 1);

	// Skip `)`.
	pos++;

	return newNode(type, content, line, column, end);
}

/**
 * Check if token is part of a number with percent sign (e.g. `10%`)
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkPercentage(i) {
	const start = i;
	let l;

	if (i >= tokensLength) return 0;

	if ((l = checkNumber(i))) i += l;
	else return 0;

	if (i >= tokensLength) return 0;

	// Skip `%`.
	if (tokens[i].type === TokenType.PercentSign) i++;
	else return 0;

	return i - start;
}

/**
 * Get node of number with percent sign
 * @returns {Node}
 */
function getPercentage() {
	const type = NodeType.PercentageType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = [getNumber()];
	const end = getLastPosition(content, line, column, 1);

	// Skip `%`.
	pos++;

	return newNode(type, content, line, column, end);
}

/**
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkProgid(i) {
	const start = i;
	let l;

	if (i >= tokensLength) return 0;

	if (joinValues2(i, 6) === "progid:DXImageTransform.Microsoft.") i += 6;
	else return 0;

	if ((l = checkIdent(i))) i += l;
	else return 0;

	if ((l = checkSC(i))) i += l;

	if (tokens[i].type === TokenType.LeftParenthesis) {
		tokens[start].progid_end = tokens[i].right;
		i = tokens[i].right + 1;
	} else return 0;

	return i - start;
}

/**
 * @returns {Node}
 */
function getProgid() {
	const type = NodeType.ProgidType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const progid_end = token.progid_end;
	const content = joinValues(pos, progid_end);

	pos = progid_end + 1;

	return newNode(type, content, line, column);
}

/**
 * Check if token is part of a property
 * @param {Number} i Token's index number
 * @returns {Number} Length of the property
 */
function checkProperty(i) {
	const start = i;
	let l;

	if ((l = checkProperty1(i))) tokens[start].propertyType = 1;
	else if ((l = checkProperty2(i))) tokens[start].propertyType = 2;

	return l;
}

/**
 * Get node with a property
 * @returns {Node}
 */
function getProperty() {
	const type = tokens[pos].propertyType;

	if (type === 1) return getProperty1();
	if (type === 2) return getProperty2();
}

/**
 * Check if token is part of a property
 * @param {Number} i Token's index number
 * @returns {Number} Length of the property
 */
function checkProperty1(i) {
	const start = i;
	let l;

	if (i >= tokensLength) return 0;

	// IE hack `*zoom`:
	if (tokens[i].type === TokenType.Asterisk) i++;

	if (i < tokensLength && (l = checkIdent(i))) i += l;
	else return 0;

	return i - start;
}

/**
 * Get node with a property
 * @returns {Node}
 */
function getProperty1() {
	const type = NodeType.PropertyType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const star = token.type === TokenType.Asterisk ? tokens[pos++] : null;
	const content = [getIdent()];

	// The `*` hack prefix is kept in the first identifier.
	if (star && content[0].type === NodeType.IdentType) {
		content[0] = newNode(NodeType.IdentType, "*" + content[0].content, star.ln, star.col);
	} else if (star) {
		content.unshift(newNode(NodeType.IdentType, "*", star.ln, star.col));
	}

	return newNode(type, content, line, column);
}

/**
 * Check if token is part of a custom property
 * @param {Number} i Token's index number
 * @returns {Number} Length of the property
 */
function checkProperty2(i) {
	return checkCustomProperty(i);
}

/**
 * Get node with a custom property
 * @returns {Node}
 */
function getProperty2() {
	return getCustomProperty();
}

/**
 * Check if token is part of a custom property
 * @param {Number} i Token's index number
 * @returns {Number} Length of the property
 */
function checkCustomProperty(i) {
	const start = i;
	let l;

	if (i >= tokensLength) return 0;

	if (
		tokens[i].type !== TokenType.HyphenMinus ||
		(tokens[i + 1] && tokens[i + 1].type !== TokenType.HyphenMinus)
	)
		return 0;

	// Skip `--`
	i += 2;

	if ((l = checkIdent(i))) i += l;
	else return 0;

	return i - start;
}

/**
 * Get node with a custom property
 * @returns {Node}
 */
function getCustomProperty() {
	const type = NodeType.CustomPropertyType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;

	// Skip `--`
	pos += 2;

	const content = [getIdent()];

	return newNode(type, content, line, column);
}

/**
 * Check if token is a colon
 * @param {Number} i Token's index number
 * @returns {Number} `1` if token is a colon, otherwise `0`
 */
function checkPropertyDelim(i) {
	return i < tokensLength && tokens[i].type === TokenType.Colon ? 1 : 0;
}

/**
 * Get node with a colon
 * @returns {Node}
 */
function getPropertyDelim() {
	const type = NodeType.PropertyDelimType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = ":";

	// Skip `:`.
	pos++;

	return newNode(type, content, line, column);
}

/**
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkPseudo(i) {
	return checkPseudoe(i) || checkPseudoc(i);
}

/**
 * @returns {Node}
 */
function getPseudo() {
	if (checkPseudoe(pos)) return getPseudoe();
	if (checkPseudoc(pos)) return getPseudoc();
}

/**
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkPseudoe(i) {
	let l;

	// Check `::`
	if (
		i >= tokensLength ||
		tokens[i].type !== TokenType.Colon ||
		i >= tokensLength ||
		tokens[i + 1].type !== TokenType.Colon
	)
		return 0;

	if ((l = checkPseudoElement1(i))) tokens[i].pseudoElementType = 1;
	else if ((l = checkPseudoElement3(i))) tokens[i].pseudoElementType = 3;
	else if ((l = checkPseudoElement2(i))) tokens[i].pseudoElementType = 2;
	else return 0;

	return l;
}

/**
 * @returns {Node}
 */
function getPseudoe() {
	const childType = tokens[pos].pseudoElementType;
	if (childType === 1) return getPseudoElement1();
	if (childType === 2) return getPseudoElement2();
	if (childType === 3) return getPseudoElement3();
}

/**
 * (1) `::slotted(selector)`
 * (2) `::slotted(selector, selector)`
 */
function checkPseudoElement1(i) {
	const start = i;
	let l;

	// Skip `::`.
	i += 2;

	if (i >= tokensLength) return 0;

	if ((l = checkIdent(i))) i += l;
	else return 0;

	if (i >= tokensLength || tokens[i].type !== TokenType.LeftParenthesis) return 0;

	const right = tokens[i].right;

	// Skip `(`.
	i++;

	if ((l = checkSC(i))) i += l;

	if ((l = checkSelectorsGroup(i))) i += l;
	else return 0;

	if ((l = checkSC(i))) i += l;

	if (i !== right) return 0;

	// Skip `)`.
	i++;

	return i - start;
}

/**
 * (1) `::slotted(selector)`
 * (2) `::slotted(selector, selector)`
 */
function getPseudoElement1() {
	const type = NodeType.PseudoeType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = [];

	// Skip `::`.
	pos += 2;

	content.push(getIdent());

	{
		const type = NodeType.ArgumentsType;
		const token = tokens[pos];
		const line = token.ln;
		const column = token.col;

		// Skip `(`.
		pos++;

		const selectorContent = [].concat(getSC(), getSelectorsGroup(), getSC());

		const end = getLastPosition(selectorContent, line, column, 1);
		const args = newNode(type, selectorContent, line, column, end);
		content.push(args);

		// Skip `)`.
		pos++;
	}

	return newNode(type, content, line, column);
}

function checkPseudoElement2(i) {
	const start = i;
	let l;

	// Skip `::`.
	i += 2;

	if ((l = checkIdent(i))) i += l;
	else return 0;

	return i - start;
}

/**
 * @returns {Node}
 */
function getPseudoElement2() {
	const type = NodeType.PseudoeType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;

	// Skip `::`.
	pos += 2;

	let content = [getIdent()];

	return newNode(type, content, line, column);
}

/**
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkPseudoc(i) {
	let l;

	if (i >= tokensLength || tokens[i].type !== TokenType.Colon) return 0;

	// `:nth-child(An+B of S)`: An+B before the selector list.
	if ((l = checkPseudoClass8(i))) {
		tokens[i].pseudoClassType = 8;
		return l;
	}

	// 参数以组合符开头(`:nth-child(+n)`)时先按 An+B 解析, 与 gonzales-pe 4.3.0 一致;
	// 其余以组合符开头的参数才是关系选择器(`:has(+ a)`).
	if (checkPseudoArgumentsStartWithCombinator(i)) {
		if ((l = checkPseudoClass2(i))) tokens[i].pseudoClassType = 2;
		else if ((l = checkPseudoClass3(i))) tokens[i].pseudoClassType = 3;
		else if ((l = checkPseudoClass4(i))) tokens[i].pseudoClassType = 4;
		else if ((l = checkPseudoClass5(i))) tokens[i].pseudoClassType = 5;
		if (l) return l;
	}

	if ((l = checkPseudoClass1(i))) tokens[i].pseudoClassType = 1;
	else if ((l = checkPseudoClass2(i))) tokens[i].pseudoClassType = 2;
	else if ((l = checkPseudoClass3(i))) tokens[i].pseudoClassType = 3;
	else if ((l = checkPseudoClass4(i))) tokens[i].pseudoClassType = 4;
	else if ((l = checkPseudoClass5(i))) tokens[i].pseudoClassType = 5;
	else if ((l = checkPseudoClass7(i))) tokens[i].pseudoClassType = 7;
	else if ((l = checkPseudoClass6(i))) tokens[i].pseudoClassType = 6;
	else return 0;

	return l;
}

/**
 * Check if pseudo-class arguments start with a combinator, e.g. `:a( +n)`
 * @param {Number} i Token's index number (`:`)
 * @returns {Boolean}
 */
function checkPseudoArgumentsStartWithCombinator(i) {
	let l;

	// Skip `:`.
	i++;

	if ((l = checkIdent(i))) i += l;
	else return false;

	if (i >= tokensLength || tokens[i].type !== TokenType.LeftParenthesis) return false;

	// Skip `(`.
	i++;

	if ((l = checkSC(i))) i += l;

	return i < tokensLength && checkCombinator(i) > 0;
}

/**
 * @returns {Node}
 */
function getPseudoc() {
	const childType = tokens[pos].pseudoClassType;
	if (childType === 1) return getPseudoClass1();
	if (childType === 2) return getPseudoClass2();
	if (childType === 3) return getPseudoClass3();
	if (childType === 4) return getPseudoClass4();
	if (childType === 5) return getPseudoClass5();
	if (childType === 6) return getPseudoClass6();
	if (childType === 8) return getPseudoClass8();
	if (childType === 7) return getPseudoClass7();
}

/**
 * (-) `:nth-child(2n + 1 of .a)`, `:nth-last-child(odd of .a, .b)`
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkPseudoClass8(i) {
	const start = i;
	let l;

	// Skip `:`.
	i++;

	if ((l = checkIdent(i))) i += l;
	else return 0;

	let name = "";
	for (let j = i - l; j < i; j++) name += tokens[j].value;
	name = name.toLowerCase();
	if (name !== "nth-child" && name !== "nth-last-child") return 0;

	if (i >= tokensLength || tokens[i].type !== TokenType.LeftParenthesis) return 0;

	const right = tokens[i].right;

	// Skip `(`.
	i++;

	if ((l = checkSC(i))) i += l;

	if ((l = checkAnPlusB(i))) i += l;
	else return 0;

	if ((l = checkSC(i))) i += l;
	else return 0;

	if (
		i >= tokensLength ||
		tokens[i].type !== TokenType.Identifier ||
		tokens[i].value.toLowerCase() !== "of"
	)
		return 0;

	i++;

	if ((l = checkSC(i))) i += l;
	else return 0;

	if ((l = checkSelectorsGroup(i))) i += l;
	else return 0;

	if ((l = checkSC(i))) i += l;

	if (i !== right) return 0;

	// Skip `)`.
	i++;

	return i - start;
}

/**
 * @returns {Node}
 */
function getPseudoClass8() {
	const type = NodeType.PseudocType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;

	// Skip `:`.
	pos++;

	const content = [getIdent()];

	const l = tokens[pos].ln;
	const c = tokens[pos].col;

	// Skip `(`.
	pos++;

	let value = getSC();

	value = value.concat(getAnPlusB(), getSC());

	// `of`:
	value.push(newNode(NodeType.IdentType, tokens[pos].value, tokens[pos].ln, tokens[pos].col));
	pos++;

	value = value.concat(getSC(), getSelectorsGroup(), getSC());

	const end = getLastPosition(value, l, c, 1);
	content.push(newNode(NodeType.ArgumentsType, value, l, c, end));

	// Skip `)`.
	pos++;

	return newNode(type, content, line, column);
}

/**
 * Check if tokens are an An+B microsyntax (`odd`, `-n+3`, `2n - 1`, `+5`)
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkAnPlusB(i) {
	const start = i;
	let l;

	if (i >= tokensLength) return 0;

	if (tokens[i].type === TokenType.Identifier && /^(odd|even)$/i.test(tokens[i].value)) {
		tokens[start].anb_rest = 0;
		return 1;
	}

	if ((l = checkUnary(i))) i += l;

	const hasNumber =
		i < tokensLength &&
		tokens[i].type === TokenType.DecimalNumber &&
		!/[eE]/.test(tokens[i].value);
	if (hasNumber) i++;

	if (
		i >= tokensLength ||
		tokens[i].type !== TokenType.Identifier ||
		tokens[i].value.toLowerCase() !== "n"
	) {
		if (!hasNumber) return 0;
		tokens[start].anb_rest = 0;
		return i - start;
	}

	// Skip `n`.
	i++;
	tokens[start].anb_rest = 0;

	// ` + 1`:
	let j = i;
	if ((l = checkSC(j))) j += l;
	if (
		j < tokensLength &&
		(tokens[j].type === TokenType.PlusSign || tokens[j].type === TokenType.HyphenMinus)
	) {
		j++;
		if ((l = checkSC(j))) j += l;
		if (
			j < tokensLength &&
			tokens[j].type === TokenType.DecimalNumber &&
			!/[eE]/.test(tokens[j].value)
		) {
			i = j + 1;
			tokens[start].anb_rest = 1;
		}
	}

	return i - start;
}

/**
 * @returns {Array}
 */
function getAnPlusB() {
	let value = [];
	const rest = tokens[pos].anb_rest;
	const token = tokens[pos];

	// `odd`, `even`:
	if (token.type === TokenType.Identifier && token.value.toLowerCase() !== "n") {
		pos++;
		return [newNode(NodeType.IdentType, token.value, token.ln, token.col)];
	}

	if (checkUnary(pos)) value.push(getUnary());

	if (tokens[pos].type === TokenType.DecimalNumber) {
		const t = tokens[pos];
		value.push(newNode(NodeType.NumberType, t.value, t.ln, t.col));
		pos++;
	}

	if (
		pos < tokensLength &&
		tokens[pos].type === TokenType.Identifier &&
		tokens[pos].value.toLowerCase() === "n"
	) {
		const t = tokens[pos];
		value.push(newNode(NodeType.IdentType, t.value, t.ln, t.col));
		pos++;
	}

	if (!rest) return value;

	value = value.concat(getSC());
	value.push(getUnary());
	value = value.concat(getSC());

	const t = tokens[pos];
	value.push(newNode(NodeType.NumberType, t.value, t.ln, t.col));
	pos++;

	return value;
}

/**
 * (1) `:panda(selector)`
 * (2) `:panda(selector, selector)`
 */
function checkPseudoClass1(i) {
	const start = i;
	let l;

	// Skip `:`.
	i++;

	if (i >= tokensLength) return 0;

	if ((l = checkIdent(i))) i += l;
	else return 0;

	if (i >= tokensLength || tokens[i].type !== TokenType.LeftParenthesis) return 0;

	const right = tokens[i].right;

	// Skip `(`.
	i++;

	if ((l = checkSC(i))) i += l;

	if ((l = checkSelectorsGroup(i))) i += l;
	else return 0;

	if ((l = checkSC(i))) i += l;

	if (i !== right) return 0;

	// Skip `)`.
	i++;

	return i - start;
}

/**
 * (-) `:not(panda)`
 */
function getPseudoClass1() {
	const type = NodeType.PseudocType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = [];

	// Skip `:`.
	pos++;

	content.push(getIdent());

	{
		const type = NodeType.ArgumentsType;
		const token = tokens[pos];
		const line = token.ln;
		const column = token.col;

		// Skip `(`.
		pos++;

		const selectorContent = [].concat(getSC(), getSelectorsGroup(), getSC());

		const end = getLastPosition(selectorContent, line, column, 1);
		const args = newNode(type, selectorContent, line, column, end);
		content.push(args);

		// Skip `)`.
		pos++;
	}

	return newNode(type, content, line, column);
}

/**
 * (1) `:nth-child(odd)`
 * (2) `:nth-child(even)`
 * (3) `:lang(de-DE)`
 */
function checkPseudoClass2(i) {
	const start = i;
	let l;

	// Skip `:`.
	i++;

	if (i >= tokensLength) return 0;

	if ((l = checkIdent(i))) i += l;
	else return 0;

	if (i >= tokensLength || tokens[i].type !== TokenType.LeftParenthesis) return 0;

	const right = tokens[i].right;

	// Skip `(`.
	i++;

	if ((l = checkSC(i))) i += l;

	if ((l = checkIdent(i))) i += l;
	else return 0;

	if ((l = checkSC(i))) i += l;

	if (i !== right) return 0;

	// Skip `)`.
	i++;

	return i - start;
}

function getPseudoClass2() {
	const type = NodeType.PseudocType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = [];

	// Skip `:`.
	pos++;

	content.push(getIdent());

	// Skip `(`.
	pos++;

	const l = tokens[pos].ln;
	const c = tokens[pos].col;
	const value = [].concat(getSC(), getIdent(), getSC());

	const end = getLastPosition(value, l, c, 1);
	const args = newNode(NodeType.ArgumentsType, value, l, c, end);
	content.push(args);

	// Skip `)`.
	pos++;

	return newNode(type, content, line, column);
}

/**
 * (-) `:nth-child(-3n + 2)`
 */
function checkPseudoClass3(i) {
	const start = i;
	let l;

	// Skip `:`.
	i++;

	if (i >= tokensLength) return 0;

	if ((l = checkIdent(i))) i += l;
	else return 0;

	if (i >= tokensLength || tokens[i].type !== TokenType.LeftParenthesis) return 0;

	const right = tokens[i].right;

	// Skip `(`.
	i++;

	if ((l = checkSC(i))) i += l;

	if ((l = checkUnary(i))) i += l;

	if (i >= tokensLength) return 0;
	if (tokens[i].type === TokenType.DecimalNumber) i++;

	if (i >= tokensLength) return 0;
	if (tokens[i].value === "n") i++;
	else return 0;

	if ((l = checkSC(i))) i += l;

	if (i >= tokensLength) return 0;

	if (tokens[i].type === TokenType.PlusSign || tokens[i].type === TokenType.HyphenMinus) i++;
	else return 0;

	if ((l = checkSC(i))) i += l;

	if (tokens[i].type === TokenType.DecimalNumber) i++;
	else return 0;

	if ((l = checkSC(i))) i += l;

	if (i !== right) return 0;

	// Skip `)`.
	i++;

	return i - start;
}

function getPseudoClass3() {
	const type = NodeType.PseudocType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = [];

	// Skip `:`.
	pos++;

	content.push(getIdent());

	const l = tokens[pos].ln;
	const c = tokens[pos].col;
	let value = [];

	// Skip `(`.
	pos++;

	value = value.concat(getSC());

	if (checkUnary(pos)) value.push(getUnary());
	if (checkNumber(pos)) value.push(getNumber());

	{
		const l = tokens[pos].ln;
		const c = tokens[pos].col;
		const content = tokens[pos].value;
		const ident = newNode(NodeType.IdentType, content, l, c);
		value.push(ident);
		pos++;
	}

	value = value.concat(getSC());

	if (checkUnary(pos)) value.push(getUnary());

	value = value.concat(getSC());

	if (checkNumber(pos)) value.push(getNumber());

	value = value.concat(getSC());

	const end = getLastPosition(value, l, c, 1);
	const args = newNode(NodeType.ArgumentsType, value, l, c, end);
	content.push(args);

	// Skip `)`.
	pos++;

	return newNode(type, content, line, column);
}

/**
 * (-) `:nth-child(-3n)`
 */
function checkPseudoClass4(i) {
	const start = i;
	let l;

	// Skip `:`.
	i++;

	if (i >= tokensLength) return 0;

	if ((l = checkIdent(i))) i += l;
	else return 0;

	if (i >= tokensLength) return 0;
	if (tokens[i].type !== TokenType.LeftParenthesis) return 0;

	const right = tokens[i].right;

	// Skip `(`.
	i++;

	if ((l = checkSC(i))) i += l;

	if ((l = checkUnary(i))) i += l;
	if (tokens[i].type === TokenType.DecimalNumber) i++;

	if (tokens[i].value === "n") i++;
	else return 0;

	if ((l = checkSC(i))) i += l;

	if (i !== right) return 0;

	// Skip `)`.
	i++;

	return i - start;
}

function getPseudoClass4() {
	const type = NodeType.PseudocType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = [];

	// Skip `:`.
	pos++;

	content.push(getIdent());

	const l = tokens[pos].ln;
	const c = tokens[pos].col;
	let value = [];

	// Skip `(`.
	pos++;

	value = value.concat(getSC());

	if (checkUnary(pos)) value.push(getUnary());
	if (checkNumber(pos)) value.push(getNumber());
	if (checkIdent(pos)) value.push(getIdent());

	value = value.concat(getSC());

	const end = getLastPosition(value, l, c, 1);
	const args = newNode(NodeType.ArgumentsType, value, l, c, end);
	content.push(args);

	// Skip `)`.
	pos++;

	return newNode(type, content, line, column);
}

/**
 * (-) `:nth-child(+8)`
 */
function checkPseudoClass5(i) {
	const start = i;
	let l;

	// Skip `:`.
	i++;

	if (i >= tokensLength) return 0;

	if ((l = checkIdent(i))) i += l;
	else return 0;

	if (i >= tokensLength) return 0;
	if (tokens[i].type !== TokenType.LeftParenthesis) return 0;

	const right = tokens[i].right;

	// Skip `(`.
	i++;

	if ((l = checkSC(i))) i += l;

	if ((l = checkUnary(i))) i += l;
	if (tokens[i].type === TokenType.DecimalNumber) i++;
	else return 0;

	if ((l = checkSC(i))) i += l;

	if (i !== right) return 0;

	// Skip `)`.
	i++;

	return i - start;
}

function getPseudoClass5() {
	const type = NodeType.PseudocType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = [];

	// Skip `:`.
	pos++;

	content.push(getIdent());

	const l = tokens[pos].ln;
	const c = tokens[pos].col;
	let value = [];

	// Skip `(`.
	pos++;

	value = value.concat(getSC());

	if (checkUnary(pos)) value.push(getUnary());
	if (checkNumber(pos)) value.push(getNumber());

	value = value.concat(getSC());

	const end = getLastPosition(value, l, c, 1);
	const args = newNode(NodeType.ArgumentsType, value, l, c, end);
	content.push(args);

	// Skip `)`.
	pos++;

	return newNode(type, content, line, column);
}

/**
 * Check if token is part of a functional pseudo-class whose argument is not
 * covered by the forms above (e.g. `:has(> a)`, `:state(--foo)`,
 * `:nth-child(2n of .a)`, `:heading(1, 2)`)
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkPseudoClass7(i) {
	const start = i;
	let l;

	// Skip `:`.
	i++;

	if ((l = checkIdent(i))) i += l;
	else return 0;

	if ((l = checkPseudoArguments(i))) i += l;
	else return 0;

	return i - start;
}

/**
 * @returns {Node}
 */
function getPseudoClass7() {
	const type = NodeType.PseudocType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;

	// Skip `:`.
	pos++;

	const content = [getIdent(), getPseudoArguments()];

	return newNode(type, content, line, column);
}

/**
 * Check if token is part of a functional pseudo-element whose argument is
 * not a selector (e.g. `::part(label)`, `::part(--foo)`)
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkPseudoElement3(i) {
	const start = i;
	let l;

	// Skip `::`.
	i += 2;

	if ((l = checkIdent(i))) i += l;
	else return 0;

	if ((l = checkPseudoArguments(i))) i += l;
	else return 0;

	return i - start;
}

/**
 * @returns {Node}
 */
function getPseudoElement3() {
	const type = NodeType.PseudoeType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;

	// Skip `::`.
	pos += 2;

	const content = [getIdent(), getPseudoArguments()];

	return newNode(type, content, line, column);
}

/**
 * Check if tokens are parenthesized pseudo-class or pseudo-element arguments
 * made of selectors, combinators, commas, numbers and identifiers
 * @param {Number} i Token's index number (`(`)
 * @returns {Number}
 */
function checkPseudoArguments(i) {
	const start = i;
	let l;

	if (i >= tokensLength || tokens[i].type !== TokenType.LeftParenthesis) return 0;

	const right = tokens[i].right;
	if (!right) return 0;

	// Skip `(`.
	i++;

	while (i < right) {
		if ((l = checkPseudoArgument(i))) i += l;
		else return 0;
	}

	return right - start + 1;
}

/**
 * @returns {Node}
 */
function getPseudoArguments() {
	const type = NodeType.ArgumentsType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const right = token.right;
	let content = [];

	// Skip `(`.
	pos++;

	while (pos < right) content = content.concat(getPseudoArgument());

	const end = getLastPosition(content, line, column, 1);

	// Skip `)`.
	pos++;

	return newNode(type, content, line, column, end);
}

/**
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkPseudoArgument(i) {
	let l;

	if ((l = checkSC(i))) tokens[i].pseudo_argument = 1;
	else if ((l = checkDelim(i))) tokens[i].pseudo_argument = 2;
	else if ((l = checkCombinator(i))) tokens[i].pseudo_argument = 3;
	else if ((l = checkCompoundSelector(i))) tokens[i].pseudo_argument = 4;
	else if ((l = checkDashedIdent(i))) tokens[i].pseudo_argument = 5;
	else if ((l = checkNumber(i))) tokens[i].pseudo_argument = 6;
	else if ((l = checkIdent(i))) tokens[i].pseudo_argument = 7;
	else if ((l = checkString(i))) tokens[i].pseudo_argument = 8;
	else if ((l = checkOperator(i))) tokens[i].pseudo_argument = 9;
	else if ((l = checkUnary(i))) tokens[i].pseudo_argument = 10;
	else if ((l = checkStrayDelim(i))) tokens[i].pseudo_argument = 11;

	return l;
}

/**
 * @returns {Array}
 */
function getPseudoArgument() {
	const childType = tokens[pos].pseudo_argument;

	if (childType === 1) return getSC();
	if (childType === 2) return getDelim();
	if (childType === 3) return getCombinator();
	if (childType === 4) return getCompoundSelector();
	if (childType === 5) return getDashedIdent();
	if (childType === 6) return getNumber();
	if (childType === 7) return getIdent();
	if (childType === 8) return getString();
	if (childType === 9) return getOperator();
	if (childType === 10) return getUnary();
	if (childType === 11) return getOperator();
}

/**
 * Check if tokens are a dashed identifier (`--foo`, `--`, `--1`)
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkDashedIdent(i) {
	const start = i;

	if (
		i + 1 >= tokensLength ||
		tokens[i].type !== TokenType.HyphenMinus ||
		tokens[i + 1].type !== TokenType.HyphenMinus
	)
		return 0;

	i += 2;

	while (
		i < tokensLength &&
		(tokens[i].type === TokenType.HyphenMinus ||
			tokens[i].type === TokenType.LowLine ||
			tokens[i].type === TokenType.Identifier ||
			tokens[i].type === TokenType.DecimalNumber)
	)
		i++;

	tokens[start].dashed_ident_l = i - start;

	return i - start;
}

/**
 * @returns {Node}
 */
function getDashedIdent() {
	const token = tokens[pos];
	const end = pos + token.dashed_ident_l - 1;
	const content = joinValues(pos, end);

	pos = end + 1;

	return newNode(NodeType.IdentType, content, token.ln, token.col);
}

/**
 * (-) `:checked`
 */
function checkPseudoClass6(i) {
	const start = i;
	let l;

	// Skip `:`.
	i++;

	if (i >= tokensLength) return 0;

	if ((l = checkIdent(i))) i += l;
	else return 0;

	return i - start;
}

function getPseudoClass6() {
	const type = NodeType.PseudocType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;

	// Skip `:`.
	pos++;

	const content = [getIdent()];

	return newNode(type, content, line, column);
}

/**
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkRuleset(i) {
	const start = i;
	let l;

	if (i >= tokensLength) return 0;

	// Selector may be missing (e.g. `{}`).
	if ((l = checkSelectorsGroup(i))) i += l;

	if ((l = checkSC(i))) i += l;

	if ((l = checkBlock(i))) i += l;
	else return 0;

	return i - start;
}

/**
 * @returns {Node}
 */
function getRuleset() {
	const type = NodeType.RulesetType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = [].concat(
		checkSelectorsGroup(pos) ? getSelectorsGroup() : [],
		getSC(),
		getBlock()
	);

	return newNode(type, content, line, column);
}

/**
 * Check if token is marked as a space (if it's a space or a tab
 *      or a line break).
 * @param {Number} i
 * @returns {Number} Number of spaces in a row starting with the given token.
 */
function checkS(i) {
	return i < tokensLength && tokens[i].ws ? tokens[i].ws_last - i + 1 : 0;
}

/**
 * Get node with spaces
 * @returns {Node}
 */
function getS() {
	const type = NodeType.SType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = joinValues(pos, tokens[pos].ws_last);

	pos = tokens[pos].ws_last + 1;

	return newNode(type, content, line, column);
}

/**
 * Check if token is a space or a comment.
 * @param {Number} i Token's index number
 * @returns {Number} Number of similar (space or comment) tokens
 *      in a row starting with the given token.
 */
function checkSC(i) {
	if (i >= tokensLength) return 0;

	let l;
	let lsc = 0;

	while (i < tokensLength) {
		if ((l = checkS(i))) tokens[i].sc_child = 1;
		else if ((l = checkCommentML(i))) tokens[i].sc_child = 2;
		else break;

		i += l;
		lsc += l;
	}

	return lsc || 0;
}

/**
 * Get node with spaces and comments
 * @returns {Array}
 */
function getSC() {
	const sc = [];

	if (pos >= tokensLength) return sc;

	while (pos < tokensLength) {
		const childType = tokens[pos].sc_child;

		if (childType === 1) sc.push(getS());
		else if (childType === 2) sc.push(getCommentML());
		else break;
	}

	return sc;
}

/**
 * Check if token is part of a hexadecimal number (e.g. `#fff`) inside
 *      a simple selector
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkShash(i) {
	const start = i;
	let l;

	if (i >= tokensLength) return 0;

	if (tokens[i].type === TokenType.NumberSign) i++;
	else return 0;

	if ((l = checkIdent(i))) tokens[start].shash_digit = false;
	else if ((l = checkHashName(i))) tokens[start].shash_digit = true;
	else return 0;

	return i + l - start;
}

/**
 * Check if tokens are a hash name that is not an identifier
 *      (e.g. `1`, `-2`, `--3` in `#1`, `#-2`, `#--3`)
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkHashName(i) {
	const start = i;
	let l;

	while (i < tokensLength && tokens[i].type === TokenType.HyphenMinus) i++;

	if (i < tokensLength && (l = checkNmName2(i))) return i + l - start;

	return 0;
}

/**
 * Get node with a hexadecimal number (e.g. `#fff`) inside a simple
 *      selector
 * @returns {Node}
 */
function getShash() {
	const type = NodeType.ShashType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;

	// Skip `#`.
	pos++;

	let content;
	if (token.shash_digit) {
		const ident = tokens[pos];
		let name = "";
		while (tokens[pos].type === TokenType.HyphenMinus) name += tokens[pos++].value;
		content = [newNode(NodeType.IdentType, name + getNmName2(), ident.ln, ident.col)];
	} else content = [getIdent()];

	return newNode(type, content, line, column);
}

/**
 * Check if token is part of a string (text wrapped in quotes)
 * @param {Number} i Token's index number
 * @returns {Number} `1` if token is part of a string, `0` if not
 */
function checkString(i) {
	if (i >= tokensLength) return 0;

	if (tokens[i].type === TokenType.StringSQ || tokens[i].type === TokenType.StringDQ) {
		return 1;
	}

	return 0;
}

/**
 * Get string's node
 * @returns {Array} `['string', x]` where `x` is a string (including
 *      quotes).
 */
function getString() {
	const type = NodeType.StringType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = token.value;

	pos++;

	return newNode(type, content, line, column);
}

/**
 * Validate stylesheet: it should consist of any number (0 or more) of
 * rulesets (sets of rules with selectors), @-rules, whitespaces or
 * comments.
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkStylesheet(i) {
	const start = i;
	let l;

	while (i < tokensLength) {
		if ((l = checkSC(i))) tokens[i].stylesheet_child = 1;
		else if ((l = checkCdoCdc(i))) tokens[i].stylesheet_child = 6;
		else {
			const end = checkStatementEnd(i, tokensLength);
			const unclosed = statementUnclosed;

			if ((l = checkCustomPropertyDeclaration(i))) tokens[i].stylesheet_child = 5;
			else if ((l = checkRuleset(i))) tokens[i].stylesheet_child = 2;
			else if ((l = checkAtrule(i))) tokens[i].stylesheet_child = 3;
			else if ((l = checkDeclDelim(i))) tokens[i].stylesheet_child = 4;

			// Error recovery: a statement no rule matches, or one with a bracket
			// left open (CSS Syntax closes it at the end of input) that the
			// matched rule doesn't cover entirely, is kept as a raw statement.
			if (!l || (unclosed && i + l + checkSC(i + l) < tokensLength)) {
				l = unclosed ? tokensLength - i : checkRawStatement(i, end);
				tokens[i].stylesheet_child = 7;
				tokens[i].raw_end = end;
			}
		}

		i += l;
	}

	return i - start;
}

/**
 * @returns {Array} `['stylesheet', x]` where `x` is all stylesheet's
 *      nodes.
 */
function getStylesheet() {
	const type = NodeType.StylesheetType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	let content = [];

	while (pos < tokensLength) {
		const childType = tokens[pos].stylesheet_child;

		if (childType === 1) content = content.concat(getSC());
		if (childType === 2) content.push(getRuleset());
		if (childType === 3) content.push(getAtrule());
		if (childType === 4) content.push(getDeclDelim());
		if (childType === 5) content.push(getDeclaration());
		if (childType === 6) content.push(getCdoCdc());
		if (childType === 7) {
			content = content.concat(getRawStatement(tokens[pos].raw_end, false));
		}
	}

	return newNode(type, content, line, column);
}

/**
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkTset(i) {
	let l;

	if ((l = checkVhash(i))) tokens[i].tset_child = 1;
	else if ((l = checkAny(i))) tokens[i].tset_child = 2;
	else if ((l = checkSC(i))) tokens[i].tset_child = 3;
	else if ((l = checkOperator(i))) tokens[i].tset_child = 4;
	else if ((l = checkComparison(i))) tokens[i].tset_child = 5;
	else if ((l = checkParentSelector(i))) tokens[i].tset_child = 6;
	else if ((l = checkStrayDelim(i))) tokens[i].tset_child = 7;

	return l;
}

/**
 * @returns {Array}
 */
function getTset() {
	const childType = tokens[pos].tset_child;

	if (childType === 1) return getVhash();
	if (childType === 2) return getAny();
	if (childType === 3) return getSC();
	if (childType === 4) return getOperator();
	if (childType === 5) return getOperator();
	if (childType === 6) return getParentSelector();
	if (childType === 7) return getOperator();
}

/**
 * Check if token is a comparison sign of a media query range
 *      (e.g. `>` in `(width >= 0)`)
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkComparison(i) {
	return i < tokensLength &&
		(tokens[i].type === TokenType.LessThanSign || tokens[i].type === TokenType.GreaterThanSign)
		? 1
		: 0;
}

/**
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkTsets(i) {
	const start = i;
	let l;

	if (i >= tokensLength) return 0;

	while ((l = checkTset(i))) {
		i += l;
	}

	tokens[start].tsets_end = i;
	return i - start;
}

/**
 * @returns {Array}
 */
function getTsets() {
	let content = [];
	let t;

	if (pos >= tokensLength) return content;

	const end = tokens[pos].tsets_end;
	while (pos < end) {
		t = getTset();
		if (typeof t.content === "string") content.push(t);
		else content = content.concat(t);
	}

	return content;
}

/**
 * Check if token is an unary (arithmetical) sign (`+` or `-`)
 * @param {Number} i Token's index number
 * @returns {Number} `1` if token is an unary sign, `0` if not
 */
function checkUnary(i) {
	if (i >= tokensLength) return 0;

	if (tokens[i].type === TokenType.HyphenMinus || tokens[i].type === TokenType.PlusSign) {
		return 1;
	}

	return 0;
}

/**
 * Get node with an unary (arithmetical) sign (`+` or `-`)
 * @returns {Array} `['unary', x]` where `x` is an unary sign
 *      converted to string.
 */
function getUnary() {
	const type = NodeType.OperatorType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = token.value;

	pos++;

	return newNode(type, content, line, column);
}

/**
 * Check if token is a unicode range (single or multiple <urange> nodes)
 * @param {number} i Token's index
 * @returns {number} Unicode range node's length
 */
function checkUnicodeRange(i) {
	const start = i;
	let l;

	if (i >= tokensLength) return 0;

	if ((l = checkUrange(i))) i += l;
	else return 0;

	while (i < tokensLength) {
		const spaceBefore = checkSC(i);
		const comma = checkDelim(i + spaceBefore);
		if (!comma) break;

		const spaceAfter = checkSC(i + spaceBefore + comma);
		if ((l = checkUrange(i + spaceBefore + comma + spaceAfter))) {
			i += spaceBefore + comma + spaceAfter + l;
		} else break;
	}

	return i - start;
}

/**
 * Get a unicode range node
 * @returns {Node}
 */
function getUnicodeRange() {
	const type = NodeType.UnicodeRangeType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	let content = [];

	while (pos < tokensLength) {
		if (checkSC(pos)) content = content.concat(getSC());
		else if (checkDelim(pos)) content.push(getDelim());
		else if (checkUrange(pos)) content.push(getUrange());
		else break;
	}

	return newNode(type, content, line, column);
}

/**
 * Check if token is unit
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkUnit(i) {
	const units = [
		"em",
		"ex",
		"ch",
		"rem",
		"vh",
		"vw",
		"vmin",
		"vmax",
		"px",
		"mm",
		"q",
		"cm",
		"in",
		"pt",
		"pc",
		"deg",
		"grad",
		"rad",
		"turn",
		"s",
		"ms",
		"Hz",
		"kHz",
		"dpi",
		"dpcm",
		"dppx",
	];

	return units.indexOf(tokens[i].value) !== -1 ? 1 : 0;
}

/**
 * Get unit node of type ident
 * @returns {Node} An ident node containing the unit value
 */
function getUnit() {
	const type = NodeType.IdentType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = token.value;

	pos++;

	return newNode(type, content, line, column);
}

/**
 * Check if token is a u-range (part of a unicode-range)
 * (1) `U+416`
 * (2) `U+400-4ff`
 * (3) `U+4??`
 * @param {number} i Token's index
 * @returns {number} Urange node's length
 */
function checkUrange(i) {
	const start = i;
	let l;

	if (i >= tokensLength) return 0;

	// Check for unicode prefix (u+ or U+)
	if (tokens[i].value === "U" || tokens[i].value === "u") i += 1;
	else return 0;

	if (i >= tokensLength) return 0;

	if (tokens[i].value === "+") i += 1;
	else return 0;

	while (i < tokensLength) {
		if ((l = checkIdent(i))) i += l;
		else if ((l = checkNumber(i))) i += l;
		else if ((l = checkUnary(i))) i += l;
		else if ((l = _checkUnicodeWildcard(i))) i += l;
		else break;
	}

	tokens[start].urangeEnd = i - 1;

	return i - start;
}

/**
 * Get a u-range node (part of a unicode-range)
 * @returns {Node}
 */
function getUrange() {
	const startPos = pos;
	const type = NodeType.UrangeType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	let content = [];

	content = joinValues(startPos, tokens[startPos].urangeEnd);
	pos = tokens[startPos].urangeEnd + 1;

	return newNode(type, content, line, column);
}

/**
 * Check for unicode wildcard characters `?`
 * @param {number} i Token's index
 * @returns {number} Wildcard length
 */
function _checkUnicodeWildcard(i) {
	const start = i;

	if (i >= tokensLength) return 0;

	while (i < tokensLength) {
		if (tokens[i].type === TokenType.QuestionMark) i += 1;
		else break;
	}

	return i - start;
}

/**
 * Check if token is part of URI (e.g. `url('/css/styles.css')`)
 * @param {Number} i Token's index number
 * @returns {Number} Length of URI
 */
function checkUri(i) {
	const start = i;

	if (i >= tokensLength || tokens[i].value !== "url") return 0;

	// Skip `url`.
	i++;

	if (i >= tokensLength || tokens[i].type !== TokenType.LeftParenthesis) return 0;

	const right = tokens[i].right;
	let l;

	// Skip `(`.
	i++;

	// Content must be exactly what `getUri` consumes: an optionally padded
	// string or raw value. Anything else (e.g. `url('a' b)`) is left to
	// `checkFunction`, otherwise `getUri` would stop short of `)`.
	if ((l = checkUri1(i))) {
		i += l;
	} else {
		if ((l = checkSC(i))) i += l;

		while (
			i < right &&
			tokens[i].type !== TokenType.Space &&
			tokens[i].type !== TokenType.Tab &&
			tokens[i].type !== TokenType.Newline &&
			tokens[i].type !== TokenType.LeftParenthesis &&
			tokens[i].type !== TokenType.RightParenthesis
		)
			i++;

		if ((l = checkSC(i))) i += l;
	}

	if (i !== right) return 0;

	return right - start + 1;
}

/**
 * Get node with URI
 * @returns {Array} `['uri', x]` where `x` is URI's nodes (without `url`
 *      and braces, e.g. `['string', ''/css/styles.css'']`).
 */
function getUri() {
	const startPos = pos;
	const uriExcluding = {};
	let uri;
	let l;
	let raw;

	let rawContent;
	let t;

	pos += 2;

	uriExcluding[TokenType.Space] = 1;
	uriExcluding[TokenType.Tab] = 1;
	uriExcluding[TokenType.Newline] = 1;
	uriExcluding[TokenType.LeftParenthesis] = 1;
	uriExcluding[TokenType.RightParenthesis] = 1;

	if (checkUri1(pos)) {
		uri = [].concat(getSC(), getString(), getSC());
	} else {
		uri = checkSC(pos) ? getSC() : [];
		l = checkExcluding(uriExcluding, pos);
		rawContent = joinValues(pos, pos + l);
		t = tokens[pos];
		raw = newNode(NodeType.RawType, rawContent, t.ln, t.col);

		uri.push(raw);

		pos += l + 1;

		if (checkSC(pos)) uri = uri.concat(getSC());
	}

	t = tokens[startPos];
	const line = t.ln;
	const column = t.col;
	const end = getLastPosition(uri, line, column, 1);
	pos++;

	return newNode(NodeType.UriType, uri, line, column, end);
}

/**
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkUri1(i) {
	const start = i;
	let l;

	if (i >= tokensLength) return 0;

	if ((l = checkSC(i))) i += l;

	if (tokens[i].type !== TokenType.StringDQ && tokens[i].type !== TokenType.StringSQ) return 0;

	i++;

	if ((l = checkSC(i))) i += l;

	return i - start;
}

/**
 * Check if token is part of a value
 * @param {Number} i Token's index number
 * @returns {Number} Length of the value
 */
function checkValue(i) {
	const start = i;
	let l;
	let s;
	let _i;

	while (i < tokensLength) {
		s = checkSC(i);
		_i = i + s;

		if ((l = _checkValue(_i))) i += l + s;
		else break;
	}

	if (start < tokensLength) tokens[start].value_end = i;

	return i - start;
}

/**
 * @returns {Array}
 */
function getValue() {
	const type = NodeType.ValueType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const end = tokens[pos].value_end;
	let content = [];

	while (pos < end) {
		if (tokens[pos].value_child) content.push(_getValue());
		else content = content.concat(getSC());
	}

	return newNode(type, content, line, column);
}

/**
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function _checkValue(i) {
	let l;

	if ((l = checkProgid(i))) tokens[i].value_child = 1;
	else if ((l = checkVhash(i))) tokens[i].value_child = 2;
	else if ((l = checkAny(i))) tokens[i].value_child = 3;
	else if ((l = checkOperator(i))) tokens[i].value_child = 4;
	else if ((l = checkImportant(i))) tokens[i].value_child = 5;
	else if ((l = checkValueBlock(i))) tokens[i].value_child = 6;
	else if ((l = checkStrayDelim(i))) tokens[i].value_child = 7;
	else if ((l = checkAtkeyword(i))) tokens[i].value_child = 8;

	return l;
}

/**
 * @returns {Array}
 */
function _getValue() {
	const childType = tokens[pos].value_child;
	if (childType === 1) return getProgid();
	if (childType === 2) return getVhash();
	if (childType === 3) return getAny();
	if (childType === 4) return getOperator();
	if (childType === 5) return getImportant();
	if (childType === 6) return getValueBlock();
	if (childType === 7) return getOperator();
	if (childType === 8) return getAtkeyword();
}

/**
 * Check if token is part of a `{}` block inside a value or function
 *      arguments (e.g. `--x: { a }`, `paint(foo, {})`)
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkValueBlock(i) {
	if (
		i >= tokensLength ||
		tokens[i].type !== TokenType.LeftCurlyBracket ||
		tokens[i].right === undefined
	)
		return 0;

	const right = tokens[i].right;
	const start = i;

	i++;
	if (i < right) i += checkValue(i);
	if (i < right) i += checkSC(i);
	if (i !== right) return 0;

	return right - start + 1;
}

/**
 * @returns {Node}
 */
function getValueBlock() {
	const type = NodeType.BlockType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const right = token.right;
	let content = [];

	// Skip `{`.
	pos++;

	if (pos < right && checkValue(pos)) content = getValue().content;
	content = content.concat(getSC());

	const end = getLastPosition(content, line, column, 1);
	pos = right + 1;

	return newNode(type, content, line, column, end);
}

/**
 * Check if tokens are `<!--` or `-->`, which are ignored at the top level
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkCdoCdc(i) {
	const types =
		i < tokensLength && tokens[i].type === TokenType.LessThanSign
			? [
					TokenType.LessThanSign,
					TokenType.ExclamationMark,
					TokenType.HyphenMinus,
					TokenType.HyphenMinus,
				]
			: [TokenType.HyphenMinus, TokenType.HyphenMinus, TokenType.GreaterThanSign];

	for (let j = 0; j < types.length; j++) {
		if (i + j >= tokensLength || tokens[i + j].type !== types[j]) return 0;
	}

	return types.length;
}

/**
 * @returns {Node}
 */
function getCdoCdc() {
	const token = tokens[pos];
	const l = checkCdoCdc(pos);
	const content = joinValues(pos, pos + l - 1);

	pos += l;

	return newNode(NodeType.RawType, content, token.ln, token.col);
}

/**
 * Whether the statement last scanned by `checkStatementEnd` has a bracket
 *      left open
 * @type {Boolean}
 */
let statementUnclosed = false;

/**
 * Find where a statement ends for error recovery: before a `;` at depth 0,
 *      after a paired `{...}`, or at the end of the enclosing block. A
 *      bracket left open (`{`, `(`, `[` without a pair) runs to `end` and
 *      sets `statementUnclosed`.
 * @param {Number} i Token's index number
 * @param {Number} end Index of the enclosing block's `}` or of the last
 *      token plus one
 * @returns {Number} Index of the first token after the statement
 */
function checkStatementEnd(i, end) {
	statementUnclosed = false;

	while (i < end) {
		const t = tokens[i];

		if (t.type === TokenType.Semicolon || t.type === TokenType.RightCurlyBracket) return i;
		if (
			t.type === TokenType.LeftCurlyBracket ||
			t.type === TokenType.LeftParenthesis ||
			t.type === TokenType.LeftSquareBracket
		) {
			if (t.right === undefined) {
				statementUnclosed = true;
				return end;
			}
			if (t.type === TokenType.LeftCurlyBracket) return t.right + 1;
			i = t.right + 1;
		} else {
			i++;
		}
	}

	return end;
}

/**
 * @param {Number} start Index of the first token
 * @param {Number} end Index after the last token
 * @returns {Number} `end` moved back over trailing whitespace
 */
function trimEnd(start, end) {
	while (end > start && tokens[end - 1].ws) end--;

	return end;
}

/**
 * @param {Number} i Token's index number
 * @param {Number} end Index after the statement (see `checkStatementEnd`)
 * @returns {Number} Length of a raw fallback statement without its trailing
 *      whitespace; an unpaired `}` is a statement of its own
 */
function checkRawStatement(i, end) {
	if (end <= i) return 1;

	return Math.max(trimEnd(i, end) - i, 1);
}

/**
 * Get a raw node with the source text of the given tokens.
 * @param {Number} start Index of the first token
 * @param {Number} end Index after the last token
 * @returns {Node}
 */
function getRaw(start, end) {
	const token = tokens[start];

	return newNode(NodeType.RawType, joinValues(start, end - 1), token.ln, token.col);
}

/**
 * Get a fallback node for a statement the precise rules can't parse (CSS
 *      Syntax error recovery); the shapes follow the Less fallback:
 * (1) with a paired block: `ruleset` / `atrule` of `[raw, sc, block]`, the
 *     block parsed as usual (e.g. `.b <::x::> {}`, `[ | a] {}`);
 * (2) inside a block, with a colon and no block: `declaration` of
 *     `[property[raw], sc, propertyDelimiter, sc, value[raw]]`;
 * (3) otherwise (e.g. `error3234;`, an unpaired `}`, a statement with a
 *     bracket left open up to the end of input such as `a { b`):
 *     `atrule[raw]` when starting with `@`, else a bare `raw`. A statement
 *     left open to the end of input keeps its trailing whitespace.
 * @param {Number} end Index after the statement (see `checkStatementEnd`)
 * @param {Boolean} inBlock Whether the statement is inside a block
 * @returns {Array}
 */
function getRawStatement(end, inBlock) {
	const start = pos;
	const token = tokens[start];
	let block = -1;
	let colon = -1;
	let open = false;

	if (!recover) throwError(start);

	if (end <= start) end = start + 1;

	for (let i = start; i < end;) {
		const t = tokens[i];

		if (
			t.type === TokenType.LeftCurlyBracket ||
			t.type === TokenType.LeftParenthesis ||
			t.type === TokenType.LeftSquareBracket
		) {
			if (t.right === undefined) {
				open = true;
				break;
			}
			if (t.type === TokenType.LeftCurlyBracket) {
				block = i;
				break;
			}
			i = t.right + 1;
			continue;
		}

		if (t.type === TokenType.Colon && colon < 0) colon = i;
		i++;
	}

	const isAtrule = token.type === TokenType.CommercialAt;
	let content;

	if (block >= 0) {
		const headEnd = trimEnd(start, block);

		content = headEnd > start ? [getRaw(start, headEnd)] : [];
		pos = headEnd;
		checkSC(pos);
		content = content.concat(getSC(), getBlock());

		return [
			newNode(
				isAtrule ? NodeType.AtruleType : NodeType.RulesetType,
				content,
				token.ln,
				token.col
			),
		];
	}

	const last = open && end >= tokensLength ? end : start + checkRawStatement(start, end);

	if (inBlock && !open && !isAtrule && colon > start && trimEnd(start, colon) > start) {
		const propertyEnd = trimEnd(start, colon);
		const property = newNode(
			NodeType.PropertyType,
			[getRaw(start, propertyEnd)],
			token.ln,
			token.col
		);

		pos = propertyEnd;
		checkSC(pos);
		content = [property].concat(getSC(), getPropertyDelim());
		checkSC(pos);
		content = content.concat(getSC());

		const t = tokens[pos] || tokens[pos - 1];
		const value = newNode(
			NodeType.ValueType,
			pos < last ? [getRaw(pos, last)] : [],
			t.ln,
			t.col
		);

		content.push(value);
		if (pos < last) pos = last;

		return [newNode(NodeType.DeclarationType, content, token.ln, token.col)];
	}

	const raw = getRaw(start, last);

	pos = last;

	return [isAtrule ? newNode(NodeType.AtruleType, [raw], token.ln, token.col) : raw];
}

/**
 * Check if token is a delimiter that has no meaning on its own in a value
 *      (e.g. `!` in `x!`, `.` in `a{b:.}`, `>` of `-->`, an unclosed `[`)
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkStrayDelim(i) {
	if (i >= tokensLength) return 0;

	switch (tokens[i].type) {
		case TokenType.ExclamationMark:
		case TokenType.FullStop:
		case TokenType.LessThanSign:
		case TokenType.GreaterThanSign:
		case TokenType.VerticalLine:
		case TokenType.Tilde:
		case TokenType.CircumflexAccent:
		case TokenType.DollarSign:
			return 1;
		case TokenType.LeftSquareBracket:
		case TokenType.LeftParenthesis:
			return tokens[i].right === undefined ? 1 : 0;
		case TokenType.RightSquareBracket:
		case TokenType.RightParenthesis:
			return tokens[i].left === undefined ? 1 : 0;
	}

	return 0;
}

/**
 * Check if token is part of a hexadecimal number (e.g. `#fff`) inside
 *      some value
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkVhash(i) {
	const start = i;
	let l;

	if (i >= tokensLength) return 0;

	// Skip `#`.
	if (tokens[i].type === TokenType.NumberSign) i++;
	else return 0;

	if ((l = checkNmName2(i))) i += l;
	else return 0;

	return i - start;
}

/**
 * Get node with a hexadecimal number (e.g. `#fff`) inside some value
 * @returns {Array} `['vhash', x]` where `x` is a hexadecimal number
 *      converted to string (without `#`, e.g. `'fff'`).
 */
function getVhash() {
	const type = NodeType.VhashType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;

	// Skip `#`.
	pos++;

	const content = getNmName2();
	const end = getLastPosition(content, line, column + 1);
	return newNode(type, content, line, column, end);
}

function checkSelectorsGroup(i) {
	if (i >= tokensLength) return 0;

	const start = i;
	let l;
	let selectorCounter = 0;
	let delimCounter = 0;

	if ((l = checkSelector(i))) {
		i += l;
		selectorCounter++;
	} else return 0;

	while (i < tokensLength) {
		const tempStart = i;
		let tempIndex = i;
		let tempLength;

		let spaceBefore = checkSC(tempIndex);

		if ((tempLength = checkDelim(tempIndex + spaceBefore))) {
			tempIndex += spaceBefore + tempLength;
			delimCounter++;

			if ((tempLength = checkSC(tempIndex))) tempIndex += tempLength;
			if ((tempLength = checkSelector(tempIndex))) {
				tempIndex += tempLength;
				selectorCounter++;
			}
		} else break;

		i += tempIndex - tempStart;
	}

	tokens[start].selectorsGroupEnd = i;
	tokens[start].selectorsGroupSelectorCount = selectorCounter;
	tokens[start].selectorsGroupDelimCount = delimCounter;

	return i - start;
}

function getSelectorsGroup() {
	let selectorsGroup = [];
	let selectorCounter = 0;
	let delimCounter = 0;

	const selectorsGroupEnd = tokens[pos].selectorsGroupEnd;
	const selectorCount = tokens[pos].selectorsGroupSelectorCount;
	const delimCount = tokens[pos].selectorsGroupDelimCount;

	selectorsGroup.push(getSelector());
	selectorCounter++;

	while (pos < selectorsGroupEnd) {
		if (delimCounter < delimCount) {
			selectorsGroup = selectorsGroup.concat(getSC());
			selectorsGroup = selectorsGroup.concat(getDelim());
			delimCounter++;

			selectorsGroup = selectorsGroup.concat(getSC());

			// Selector may be missing after a comma (e.g. `a,, b` or `a, {`).
			if (selectorCounter < selectorCount && checkSelector(pos)) {
				selectorsGroup = selectorsGroup.concat(getSelector());
				selectorCounter++;
			}
		}
	}

	return selectorsGroup;
}

function checkSelector(i) {
	if (i >= tokensLength) return 0;

	const start = i;
	let l;

	if ((l = checkCompoundSelector(i))) i += l;
	else if ((l = checkCombinator(i))) {
		i += l;
		const space = checkSC(i);
		if ((l = checkCompoundSelector(i + space))) i += space + l;
		else return 0;
	} else return 0;

	while (i < tokensLength) {
		const spaceBefore = checkSC(i);
		const comma = checkCombinator(i + spaceBefore);
		if (!spaceBefore && !comma) break;

		const spaceAfter = checkSC(i + spaceBefore + comma);
		if ((l = checkCompoundSelector(i + spaceBefore + comma + spaceAfter))) {
			i += spaceBefore + comma + spaceAfter + l;
		} else break;
	}

	tokens[start].selectorEnd = i;
	return i - start;
}

function getSelector() {
	const type = NodeType.SelectorType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const selectorEnd = token.selectorEnd;
	let content = checkCompoundSelector(pos)
		? getCompoundSelector()
		: [getCombinator()].concat(getSC(), getCompoundSelector());

	while (pos < selectorEnd) {
		content = content.concat(getSC());
		if (checkCombinator(pos)) content.push(getCombinator());
		content = content.concat(getSC(), getCompoundSelector());
	}

	return newNode(type, content, line, column);
}

function checkCompoundSelector(i) {
	let l;

	if ((l = checkCompoundSelector1(i))) {
		tokens[i].compoundSelectorType = 1;
	} else if ((l = checkCompoundSelector2(i))) {
		tokens[i].compoundSelectorType = 2;
	}

	return l;
}

function getCompoundSelector() {
	const type = tokens[pos].compoundSelectorType;
	if (type === 1) return getCompoundSelector1();
	if (type === 2) return getCompoundSelector2();
}

function checkCompoundSelector1(i) {
	if (i >= tokensLength) return 0;

	const start = i;
	let l;

	if ((l = checkUniversalSelector(i) || checkTypeSelector(i))) i += l;
	else return 0;

	while (i < tokensLength) {
		const l =
			checkShash(i) ||
			checkClass(i) ||
			checkAttributeSelector(i) ||
			checkPseudo(i) ||
			checkParentSelector(i);
		if (l) i += l;
		else break;
	}

	tokens[start].compoundSelectorEnd = i;

	return i - start;
}

function getCompoundSelector1() {
	const sequence = [];
	const compoundSelectorEnd = tokens[pos].compoundSelectorEnd;

	if (checkUniversalSelector(pos)) sequence.push(getUniversalSelector());
	else sequence.push(getTypeSelector());

	while (pos < compoundSelectorEnd) {
		if (checkShash(pos)) sequence.push(getShash());
		else if (checkClass(pos)) sequence.push(getClass());
		else if (checkAttributeSelector(pos)) sequence.push(getAttributeSelector());
		else if (checkPseudo(pos)) sequence.push(getPseudo());
		else if (checkParentSelector(pos)) sequence.push(getParentSelector());
	}

	return sequence;
}

function checkCompoundSelector2(i) {
	if (i >= tokensLength) return 0;

	const start = i;

	while (i < tokensLength) {
		const l =
			checkShash(i) ||
			checkClass(i) ||
			checkAttributeSelector(i) ||
			checkPseudo(i) ||
			checkParentSelector(i);

		if (l) i += l;
		else break;
	}

	tokens[start].compoundSelectorEnd = i;

	return i - start;
}

function getCompoundSelector2() {
	const sequence = [];
	const compoundSelectorEnd = tokens[pos].compoundSelectorEnd;

	while (pos < compoundSelectorEnd) {
		if (checkShash(pos)) sequence.push(getShash());
		else if (checkClass(pos)) sequence.push(getClass());
		else if (checkAttributeSelector(pos)) sequence.push(getAttributeSelector());
		else if (checkPseudo(pos)) sequence.push(getPseudo());
		else if (checkParentSelector(pos)) sequence.push(getParentSelector());
		else break;
	}

	return sequence;
}

/**
 * Check if token is a nesting selector, e.g. `&`
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkParentSelector(i) {
	return i < tokensLength && tokens[i].type === TokenType.Ampersand ? 1 : 0;
}

/**
 * @returns {Node}
 */
function getParentSelector() {
	const type = NodeType.ParentSelectorType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;

	pos++;

	return newNode(type, "&", line, column);
}

function checkUniversalSelector(i) {
	if (i >= tokensLength) return 0;

	const start = i;
	let l;

	if ((l = checkNamePrefix(i))) i += l;

	if (tokens[i].type === TokenType.Asterisk) i++;
	else return 0;

	return i - start;
}

function getUniversalSelector() {
	const type = NodeType.UniversalSelectorType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = [];
	let end;

	if (checkNamePrefix(pos)) {
		content.push(getNamePrefix());
		end = getLastPosition(content, line, column, 1);
	}

	pos++;

	return newNode(type, content, line, column, end);
}

function checkTypeSelector(i) {
	if (i >= tokensLength) return 0;

	const start = i;
	let l;

	if ((l = checkNamePrefix(i))) i += l;

	if ((l = checkIdent(i) || checkTypeDashedIdent(i))) i += l;
	else return 0;

	return i - start;
}

function getTypeSelector() {
	const type = NodeType.TypeSelectorType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = [];

	if (checkNamePrefix(pos)) content.push(getNamePrefix());

	content.push(checkIdent(pos) ? getIdent() : getDashedIdent());

	return newNode(type, content, line, column);
}

/**
 * Check if tokens are a dashed identifier with a name used as a type
 *      selector (e.g. `--foo` in `--foo {}`)
 * @param {Number} i Token's index number
 * @returns {Number}
 */
function checkTypeDashedIdent(i) {
	const l = checkDashedIdent(i);
	return l > 2 && !insideParentheses(i) ? l : 0;
}

/**
 * Check if token is inside parentheses of the current selector or value
 *      (e.g. `--foo` in `:state(--foo)` is not a type selector)
 * @param {Number} i Token's index number
 * @returns {Boolean}
 */
function insideParentheses(i) {
	for (let j = i - 1; j >= 0; j--) {
		const type = tokens[j].type;
		if (type === TokenType.LeftParenthesis && tokens[j].right > i) return true;
		if (
			type === TokenType.LeftCurlyBracket ||
			type === TokenType.RightCurlyBracket ||
			type === TokenType.Semicolon
		)
			return false;
	}

	return false;
}

function checkAttributeSelector(i) {
	let l;
	if ((l = checkAttributeSelector1(i))) tokens[i].attributeSelectorType = 1;
	else if ((l = checkAttributeSelector2(i))) tokens[i].attributeSelectorType = 2;

	return l;
}

function getAttributeSelector() {
	const type = tokens[pos].attributeSelectorType;
	if (type === 1) return getAttributeSelector1();
	else return getAttributeSelector2();
}

/**
 * (1) `[panda=nani]`
 * (2) `[panda='nani']`
 * (3) `[panda='nani' i]`
 *
 */
function checkAttributeSelector1(i) {
	const start = i;

	if (tokens[i].type === TokenType.LeftSquareBracket) i++;
	else return 0;

	let l;
	if ((l = checkSC(i))) i += l;

	if ((l = checkAttributeName(i))) i += l;
	else return 0;

	if ((l = checkSC(i))) i += l;

	if ((l = checkAttributeMatch(i))) i += l;
	else return 0;

	if ((l = checkSC(i))) i += l;

	if ((l = checkAttributeValue(i))) i += l;
	else return 0;

	if ((l = checkSC(i))) i += l;

	if ((l = checkAttributeFlags(i))) {
		i += l;
		if ((l = checkSC(i))) i += l;
	}

	if (tokens[i].type === TokenType.RightSquareBracket) i++;
	else return 0;

	return i - start;
}

function getAttributeSelector1() {
	const type = NodeType.AttributeSelectorType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	let content = [];

	// Skip `[`.
	pos++;

	content = content.concat(
		getSC(),
		getAttributeName(),
		getSC(),
		getAttributeMatch(),
		getSC(),
		getAttributeValue(),
		getSC()
	);

	if (checkAttributeFlags(pos)) {
		content.push(getAttributeFlags());
		content = content.concat(getSC());
	}

	// Skip `]`.
	pos++;

	const end = getLastPosition(content, line, column, 1);
	return newNode(type, content, line, column, end);
}

/**
 * (1) `[panda]`
 */
function checkAttributeSelector2(i) {
	const start = i;

	if (tokens[i].type === TokenType.LeftSquareBracket) i++;
	else return 0;

	let l;
	if ((l = checkSC(i))) i += l;

	if ((l = checkAttributeName(i))) i += l;
	else return 0;

	if ((l = checkSC(i))) i += l;

	if (tokens[i].type === TokenType.RightSquareBracket) i++;
	else return 0;

	return i - start;
}

function getAttributeSelector2() {
	const type = NodeType.AttributeSelectorType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	let content = [];

	// Skip `[`.
	pos++;

	content = content.concat(getSC(), getAttributeName(), getSC());

	// Skip `]`.
	pos++;

	const end = getLastPosition(content, line, column, 1);
	return newNode(type, content, line, column, end);
}

function checkAttributeName(i) {
	const start = i;
	let l;

	if ((l = checkNamePrefix(i))) i += l;

	if ((l = checkIdent(i))) i += l;
	else return 0;

	return i - start;
}

function getAttributeName() {
	const type = NodeType.AttributeNameType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = [];

	if (checkNamePrefix(pos)) content.push(getNamePrefix());
	content.push(getIdent());

	return newNode(type, content, line, column);
}

function checkAttributeMatch(i) {
	let l;
	if ((l = checkAttributeMatch1(i))) tokens[i].attributeMatchType = 1;
	else if ((l = checkAttributeMatch2(i))) tokens[i].attributeMatchType = 2;

	return l;
}

function getAttributeMatch() {
	const type = tokens[pos].attributeMatchType;
	if (type === 1) return getAttributeMatch1();
	else return getAttributeMatch2();
}

function checkAttributeMatch1(i) {
	const start = i;

	const type = tokens[i].type;
	if (
		type === TokenType.Tilde ||
		type === TokenType.VerticalLine ||
		type === TokenType.CircumflexAccent ||
		type === TokenType.DollarSign ||
		type === TokenType.Asterisk
	)
		i++;
	else return 0;

	if (tokens[i].type === TokenType.EqualsSign) i++;
	else return 0;

	return i - start;
}

function getAttributeMatch1() {
	const type = NodeType.AttributeMatchType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = tokens[pos].value + tokens[pos + 1].value;
	pos += 2;

	return newNode(type, content, line, column);
}

function checkAttributeMatch2(i) {
	if (tokens[i].type === TokenType.EqualsSign) return 1;
	else return 0;
}

function getAttributeMatch2() {
	const type = NodeType.AttributeMatchType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = "=";

	pos++;
	return newNode(type, content, line, column);
}

function checkAttributeValue(i) {
	return checkString(i) || checkIdent(i);
}

function getAttributeValue() {
	const type = NodeType.AttributeValueType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = [];

	if (checkString(pos)) content.push(getString());
	else content.push(getIdent());

	return newNode(type, content, line, column);
}

function checkAttributeFlags(i) {
	return checkIdent(i);
}

function getAttributeFlags() {
	const type = NodeType.AttributeFlagsType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = [getIdent()];

	return newNode(type, content, line, column);
}

function checkNamePrefix(i) {
	if (i >= tokensLength) return 0;

	let l;
	if ((l = checkNamePrefix1(i))) tokens[i].namePrefixType = 1;
	else if ((l = checkNamePrefix2(i))) tokens[i].namePrefixType = 2;

	return l;
}

function getNamePrefix() {
	const type = tokens[pos].namePrefixType;
	if (type === 1) return getNamePrefix1();
	else return getNamePrefix2();
}

/**
 * (1) `panda|`
 * (2) `panda<comment>|`
 */
function checkNamePrefix1(i) {
	const start = i;
	let l;

	if ((l = checkNamespacePrefix(i))) i += l;
	else return 0;

	if ((l = checkCommentML(i))) i += l;

	if ((l = checkNamespaceSeparator(i))) i += l;
	else return 0;

	return i - start;
}

function getNamePrefix1() {
	const type = NodeType.NamePrefixType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = [];

	content.push(getNamespacePrefix());

	if (checkCommentML(pos)) content.push(getCommentML());

	content.push(getNamespaceSeparator());

	return newNode(type, content, line, column);
}

/**
 * (1) `|`
 */
function checkNamePrefix2(i) {
	return checkNamespaceSeparator(i);
}

function getNamePrefix2() {
	const type = NodeType.NamePrefixType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = [getNamespaceSeparator()];

	return newNode(type, content, line, column);
}

/**
 * (1) `*`
 * (2) `panda`
 */
function checkNamespacePrefix(i) {
	if (i >= tokensLength) return 0;

	let l;

	if (tokens[i].type === TokenType.Asterisk) return 1;
	else if ((l = checkIdent(i))) return l;
	else return 0;
}

function getNamespacePrefix() {
	const type = NodeType.NamespacePrefixType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = [];

	if (token.type === TokenType.Asterisk) {
		const asteriskNode = newNode(NodeType.IdentType, "*", line, column);
		content.push(asteriskNode);
		pos++;
	} else if (checkIdent(pos)) content.push(getIdent());

	return newNode(type, content, line, column);
}

/**
 * (1) `|`
 */
function checkNamespaceSeparator(i) {
	if (i >= tokensLength) return 0;

	if (tokens[i].type !== TokenType.VerticalLine) return 0;

	// Return false if `|=` - [attr|=value]
	if (tokens[i + 1] && tokens[i + 1].type === TokenType.EqualsSign) return 0;

	return 1;
}

function getNamespaceSeparator() {
	const type = NodeType.NamespaceSeparatorType;
	const token = tokens[pos];
	const line = token.ln;
	const column = token.col;
	const content = "|";

	pos++;
	return newNode(type, content, line, column);
}

module.exports = function (_tokens, context, _recover) {
	tokens = _tokens;
	tokensLength = tokens.length;
	pos = 0;
	recover = _recover !== false;

	return contexts[context]();
};
