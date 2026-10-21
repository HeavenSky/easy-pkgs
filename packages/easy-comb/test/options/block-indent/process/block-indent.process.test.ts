import assert from "node:assert/strict";
import Test from "../../../helpers/option-test.ts";

describe("Option `block-indent`, process", function () {
	describe("css", function () {
		it("Array value => should not change anything", function () {
			let test = new Test(this, { "block-indent": ["", " "] }, { warns: true });
			return test.shouldBeEqual("test.css");
		});

		it("Invalid string value => should not change anything", function () {
			let test = new Test(this, { "block-indent": "  nani  " }, { warns: true });
			return test.shouldBeEqual("test.css");
		});

		it("Float number value => should not change anything", function () {
			let test = new Test(this, { "block-indent": 3.5 }, { warns: true });
			return test.shouldBeEqual("test.css");
		});

		it("Integer value => should set proper number of spaces", function () {
			let test = new Test(this, { "block-indent": 0 });
			return test.shouldBeEqual("test.css", "test.expected.css");
		});

		it("Valid string value => should set proper number of spaces", function () {
			let test = new Test(this, { "block-indent": "    " });
			return test.shouldBeEqual("test.css", "test-2.expected.css");
		});

		it("Should work together with space-before-closing-brace", function () {
			let test = new Test(this, { "block-indent": 4, "space-before-closing-brace": "\n" });
			return test.shouldBeEqual("test.css", "test-3.expected.css");
		});

		it("Issue 379", function () {
			let test = new Test(this, { "block-indent": 4 });
			return test.shouldBeEqual("issue-379.css", "issue-379.expected.css");
		});
	});

	describe("sass", function () {
		it("First level ruleset's block", function () {
			let test = new Test(this, { "block-indent": 2 });
			return test.shouldBeEqual("block.sass", "block.expected.sass");
		});

		it("Nested ruleset", function () {
			let test = new Test(this, { "block-indent": 2 });
			return test.shouldBeEqual("nested-ruleset.sass", "nested-ruleset.expected.sass");
		});

		it("Mixin", function () {
			let test = new Test(this, { "block-indent": 4 });
			return test.shouldBeEqual("mixin.sass", "mixin.expected.sass");
		});
	});

	describe("scss", function () {
		it("Issue 213", function () {
			let test = new Test(this, { "block-indent": 2 });
			return test.shouldBeEqual("nested-include.scss", "nested-include.expected.scss");
		});
	});

	describe("css custom property value", function () {
		it("Should keep `{}` blocks and line breaks in the value as is", function () {
			let test = new Test(this, {
				"block-indent": 2,
				"space-after-opening-brace": "\n",
				"space-before-closing-brace": "\n",
			});
			return test.comb
				.processString("div {\n.a { }\n--x:hover { }\n    .b { }\n}")
				.then(function (actual) {
					assert.equal(actual, "div {\n  .a {\n  }\n  --x:hover { }\n    .b { }\n}");
				});
		});
	});

	describe("sass line breaks", function () {
		it("Should not indent a lone `\\r` line break", async function () {
			let test = new Test(this, { "block-indent": 2 });
			let actual = await test.comb.processString("a\r  d: e\r\r  b: c\r", { syntax: "sass" });
			assert.equal(actual, "a\r  d: e\r\r  b: c\r");
		});
	});
});
