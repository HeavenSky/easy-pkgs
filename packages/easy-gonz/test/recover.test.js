var assert = require("assert");
var describe = require("node:test").describe;
var it = require("node:test").it;
var gonzales = require("../");
var corpus = require("./corpus");

function strictError(css, syntax) {
	try {
		gonzales.parse(css, { syntax: syntax, recover: false });
	} catch (e) {
		return e;
	}
	return null;
}

function hasRaw(node) {
	return node.type === "raw" || (Array.isArray(node.content) && node.content.some(hasRaw));
}

function sameAst(css, options) {
	var strict = { recover: false };
	Object.keys(options).forEach(function (key) {
		strict[key] = options[key];
	});
	assert.strictEqual(
		JSON.stringify(gonzales.parse(css, strict)),
		JSON.stringify(gonzales.parse(css, options))
	);
}

describe("recover: false", function () {
	[
		["css", "a{}\n\nb{ c }", 3],
		["css", "a{}\n}\n", 2],
		["css", "a{b:c}\nd { e: f", 2],
		["css", "[ | a] { color: red; }", 1],
		["less", "a { b: c }\n.d {\n  e: f;\n  x y z;\n}", 4],
		["less", "this is not css;\na {}", 1],
	].forEach(function (c) {
		it(
			"throws a parsing error at the first recovered statement: " +
				c[0] +
				" " +
				JSON.stringify(c[1]),
			function () {
				var e = strictError(c[1], c[0]);
				assert.ok(e, "did not throw");
				assert.strictEqual(e.name, "Parsing error");
				assert.strictEqual(e.syntax, c[0]);
				assert.strictEqual(e.line, c[2]);
				assert.strictEqual(
					e.message,
					"Please check validity of the block starting from line #" + c[2]
				);
				assert.ok(!(e instanceof Error));
				assert.doesNotThrow(function () {
					gonzales.parse(c[1], { syntax: c[0] });
					gonzales.parse(c[1], { syntax: c[0], recover: true });
				});
			}
		);
	});

	it("keeps raw nodes that valid input produces", function () {
		sameAst("a{--x: {a: b}}", { syntax: "css" });
		sameAst("<!-- a{} -->", { syntax: "css" });
		sameAst("a{b:url(x.png)}", { syntax: "less" });
		sameAst(".a{--x: {a: b}}", { syntax: "scss" });
	});

	it("does not change scss and sass", function () {
		sameAst("a { b: c }", { syntax: "scss" });
		sameAst("a\n  b: c", { syntax: "sass" });
		assert.throws(function () {
			gonzales.parse("a { b", { syntax: "scss", recover: false });
		});
		assert.throws(function () {
			gonzales.parse("a { b", { syntax: "scss" });
		});
	});

	it("matches the default AST on the corpus or throws only where it recovered", function () {
		corpus.load().forEach(function (group) {
			group.cases.forEach(function (c) {
				if (c.skip) return;
				var name = group.syntax + "/" + group.context + "/" + c.name;
				var options = { syntax: group.syntax, context: group.context };
				var ast = gonzales.parse(c.input, options);
				var strict;
				try {
					strict = gonzales.parse(c.input, {
						syntax: group.syntax,
						context: group.context,
						recover: false,
					});
				} catch (e) {
					assert.strictEqual(e.name, "Parsing error", name);
					assert.ok(group.syntax === "css" || group.syntax === "less", name);
					assert.ok(hasRaw(ast), name + " threw without recovering");
					return;
				}
				assert.strictEqual(JSON.stringify(strict), JSON.stringify(ast), name);
			});
		});
	});
});
