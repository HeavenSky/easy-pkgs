import assert from "node:assert/strict";
import Test from "../../../helpers/option-test.ts";

describe("Option `space-after-combinator`, process", function () {
	describe("css", function () {
		it("Array value => should not change anything", function () {
			let test = new Test(this, { "space-after-combinator": ["", " "] }, { warns: true });
			return test.shouldBeEqual("test.css");
		});

		it("Invalid string value => should not change anything", function () {
			let test = new Test(this, { "space-after-combinator": "  nani  " }, { warns: true });
			return test.shouldBeEqual("test.css");
		});

		it("Float number value => should not change anything", function () {
			let test = new Test(this, { "space-after-combinator": 3.5 }, { warns: true });
			return test.shouldBeEqual("test.css");
		});

		it("Integer value => should set proper space after combinator", function () {
			let test = new Test(this, { "space-after-combinator": 0 });
			return test.shouldBeEqual("test.css", "test.expected.css");
		});

		it("Valid string value (spaces only) => should set proper space after combinator", function () {
			let test = new Test(this, { "space-after-combinator": "  " });
			return test.shouldBeEqual("test.css", "test-2.expected.css");
		});

		it("Valid string value (spaces and newlines) => should set proper space after combinator", function () {
			let test = new Test(this, { "space-after-combinator": "\n    " });
			return test.shouldBeEqual("test.css", "test-3.expected.css");
		});
	});

	describe("sass line breaks", function () {
		it("Should keep a line break after a combinator", async function () {
			let test = new Test(this, { "space-after-combinator": "" });
			let actual = await test.comb.processString("a >\nb\n  c: d\n", { syntax: "sass" });
			assert.equal(actual, "a >\nb\n  c: d\n");
		});
		it("Should not turn a leading `+ c` into a mixin include", async function () {
			let test = new Test(this, { "space-after-combinator": "" });
			let actual = await test.comb.processString("+ c\n  d: e\n", { syntax: "sass" });
			assert.equal(actual, "+ c\n  d: e\n");
		});
		it("Should not turn `+ c` at the start of a continued line into a mixin include", async function () {
			let test = new Test(this, { "space-after-combinator": "" });
			let actual = await test.comb.processString("a\n+ b\n  c: d\n", { syntax: "sass" });
			assert.equal(actual, "a\n+ b\n  c: d\n");
		});
		it("Should not turn a leading mixin include `+b` into a selector", async function () {
			let test = new Test(this, { "space-after-combinator": " " });
			let actual = await test.comb.processString("+b\n  c: d\n", { syntax: "sass" });
			assert.equal(actual, "+b\n  c: d\n");
		});
	});

	describe("trailing combinator", function () {
		// 选择器末尾的组合符后面的空白属于外层, 补空格会每格式化一次多一个
		it("Should not add a space after a combinator ending the selector", async function () {
			let test = new Test(this, { "space-after-combinator": " " });
			let input = "a > {b: c}\n:is(a +) {b: c}\n";
			let actual = await test.comb.processString(input, { syntax: "scss" });
			assert.equal(actual, input);
			let sass = await test.comb.processString("a ~\nb\n  c: d\n", { syntax: "sass" });
			assert.equal(sass, "a ~\nb\n  c: d\n");
		});
	});
});
