var assert = require("assert");
var describe = require("node:test").describe;
var it = require("node:test").it;
var corpus = require("./corpus");

describe("corpus format", function () {
	var node = {
		type: "stylesheet",
		syntax: "css",
		start: { line: 1, column: 1 },
		end: { line: 1, column: 4 },
		content: [
			{
				type: "ident",
				syntax: "css",
				content: 'a"\r\n',
				start: { line: 1, column: 1 },
				end: { line: 1, column: 1 },
			},
			{
				type: "space",
				syntax: "scss",
				content: " ",
				start: { line: 1, column: 2 },
				end: { line: 1, column: 2 },
			},
			{
				type: "raw",
				content: "",
				start: { line: 1, column: 3 },
				end: { line: 1, column: 4 },
			},
			{
				type: "block",
				syntax: "css",
				content: [],
				start: { line: 1, column: 4 },
				end: { line: 1, column: 4 },
			},
		],
	};

	it("writes syntax only when it differs from the parent", function () {
		assert.strictEqual(
			corpus.serialize(node),
			[
				"stylesheet 1:1-1:4 {css}",
				'  ident 1:1-1:1 "a\\"\\r\\n"',
				'  space 1:2-1:2 {scss} " "',
				'  raw 1:3-1:4 {-} ""',
				"  block 1:4-1:4",
			].join("\n")
		);
	});

	it("rejects nodes it cannot represent", function () {
		assert.throws(function () {
			corpus.serialize({
				type: "x",
				content: "a",
				start: { line: 1, column: 1 },
				end: { line: 1, column: 1 },
				extra: 1,
			});
		}, /extra/);
		assert.throws(function () {
			corpus.serialize({
				type: "x",
				content: 1,
				start: { line: 1, column: 1 },
				end: { line: 1, column: 1 },
			});
		}, /content/);
	});

	it("round-trips cases through format and parse", function () {
		var cases = [
			{ name: "crlf/0", skip: false, input: "a{\r\n}", tree: "stylesheet 1:1-2:1 {css}" },
			{ name: "empty", skip: true, input: "", tree: "" },
			{
				name: "blank-lines",
				skip: false,
				input: "a\n\n\nb",
				tree: 'x 1:1-1:1 {css}\n  y 1:1-1:1 ""',
			},
		];
		assert.deepStrictEqual(corpus.parse(corpus.format(cases)), cases);
	});

	it("refuses inputs containing separator lines", function () {
		assert.throws(function () {
			corpus.format([{ name: "a", skip: false, input: "a\n---\nb", tree: "" }]);
		}, /---/);
		assert.throws(function () {
			corpus.format([{ name: "a", skip: false, input: "=== b", tree: "" }]);
		}, /===/);
	});

	it("refuses names that would not parse back", function () {
		assert.throws(function () {
			corpus.format([{ name: "a [skip]", skip: false, input: "a", tree: "" }]);
		}, /a \[skip\]/);
	});

	it("round-trips shared cases with their syntaxes", function () {
		var cases = [
			{
				name: "a",
				syntaxes: ["css", "less"],
				skip: false,
				input: "x",
				tree: 'ident 1:1-1:1 {*} "x"',
			},
			{ name: "b", syntaxes: ["sass", "scss"], skip: true, input: "", tree: "" },
		];
		var text = corpus.format(cases);
		assert.ok(text.indexOf("=== a [css less]\n") === 0);
		assert.ok(text.indexOf("\n=== b [sass scss] [skip]\n") > 0);
		assert.deepStrictEqual(corpus.parse(text, "f", true), cases);
	});

	it("rejects shared headers without valid syntaxes", function () {
		[
			["=== a\nx\n---\n", /适用语法/],
			["=== a [less css]\nx\n---\n", /字母序/],
			["=== a [css css]\nx\n---\n", /字母序/],
			["=== a [skip]\nx\n---\n", /未知语法/],
		].forEach(function (sample) {
			assert.throws(function () {
				corpus.parse(sample[0], "f", true);
			}, sample[1]);
		});
	});

	it("swaps only the root syntax for the placeholder", function () {
		var tree = 'stylesheet 1:1-1:2 {scss}\n  ident 1:1-1:2 {css} "{scss}"';
		var shared = 'stylesheet 1:1-1:2 {*}\n  ident 1:1-1:2 {css} "{scss}"';
		assert.strictEqual(corpus.shareTree(tree, "scss"), shared);
		assert.strictEqual(corpus.expandTree(shared, "scss"), tree);
		assert.strictEqual(corpus.shareTree(tree, "css"), tree);
		assert.strictEqual(corpus.shareTree("", "css"), "");
	});

	it("expands shared cases into each syntax after its own cases", function () {
		var own = { name: "own", skip: false, input: "y", tree: 'ident 1:1-1:1 {css} "y"' };
		var files = [
			{ syntax: "css", context: "ident", cases: [own] },
			{
				syntax: null,
				context: "ident",
				cases: [
					{
						name: "s",
						syntaxes: ["css", "scss"],
						skip: true,
						input: "x",
						tree: 'ident 1:1-1:1 {*} "x"',
					},
				],
			},
		];
		assert.deepStrictEqual(corpus.expandFiles(files), [
			{
				syntax: "css",
				context: "ident",
				cases: [
					own,
					{ name: "s", skip: true, input: "x", tree: 'ident 1:1-1:1 {css} "x"' },
				],
			},
			{
				syntax: "scss",
				context: "ident",
				cases: [{ name: "s", skip: true, input: "x", tree: 'ident 1:1-1:1 {scss} "x"' }],
			},
		]);
		files[1].cases[0].name = "own";
		assert.throws(function () {
			corpus.expandFiles(files);
		}, /css\/ident 用例重名: own/);
	});

	it("splits syntaxes whose updated tree diverges from the shared one", function () {
		var c = {
			name: "a",
			syntaxes: ["css", "less", "scss"],
			skip: false,
			input: "x",
			tree: 'ident 1:1-1:1 {*} "x"',
		};
		assert.deepStrictEqual(
			corpus.reshare(c, {
				css: 'ident 1:1-1:1 {css} "x"',
				less: 'ident 1:1-1:1 {less} "x"',
				scss: 'ident 1:1-1:1 {scss} "y"',
			}),
			{
				kept: {
					name: "a",
					syntaxes: ["css", "less"],
					skip: false,
					input: "x",
					tree: 'ident 1:1-1:1 {*} "x"',
				},
				split: [
					{
						syntax: "scss",
						entry: {
							name: "a",
							skip: false,
							input: "x",
							tree: 'ident 1:1-1:1 {scss} "y"',
						},
					},
				],
			}
		);

		var pair = {
			name: "b",
			syntaxes: ["css", "less"],
			skip: false,
			input: "x",
			tree: 'ident 1:1-1:1 {*} "x"',
		};
		assert.deepStrictEqual(
			corpus.reshare(pair, {
				css: 'ident 1:1-1:1 {css} "z"',
				less: 'ident 1:1-1:1 {less} "x"',
			}),
			{
				kept: null,
				split: [
					{
						syntax: "less",
						entry: {
							name: "b",
							skip: false,
							input: "x",
							tree: 'ident 1:1-1:1 {less} "x"',
						},
					},
					{
						syntax: "css",
						entry: {
							name: "b",
							skip: false,
							input: "x",
							tree: 'ident 1:1-1:1 {css} "z"',
						},
					},
				],
			}
		);

		assert.deepStrictEqual(
			corpus.reshare(pair, {
				css: 'ident 1:1-1:1 {css} "z"',
				less: 'ident 1:1-1:1 {less} "z"',
			}),
			{
				kept: {
					name: "b",
					syntaxes: ["css", "less"],
					skip: false,
					input: "x",
					tree: 'ident 1:1-1:1 {*} "z"',
				},
				split: [],
			}
		);
	});
});

corpus.load().forEach(function (group) {
	describe(group.syntax + "/" + group.context, function () {
		group.cases.forEach(function (c) {
			it(c.name, { skip: c.skip }, function () {
				corpus.check(group, c);
			});
		});
	});
});
