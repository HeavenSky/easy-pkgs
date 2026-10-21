import assert from "node:assert/strict";
import Test from "../../../helpers/option-test.ts";

describe("Option `space-after-selector-delimiter`, process", function () {
	describe("css", function () {
		it("Array value => should not change anything", function () {
			let test = new Test(
				this,
				{ "space-after-selector-delimiter": ["", " "] },
				{ warns: true }
			);
			return test.shouldBeEqual("test.css");
		});

		it("Invalid string value => should not change anything", function () {
			let test = new Test(
				this,
				{ "space-after-selector-delimiter": "  nani  " },
				{ warns: true }
			);
			return test.shouldBeEqual("test.css");
		});

		it("Float number value => should not change anything", function () {
			let test = new Test(this, { "space-after-selector-delimiter": 3.5 }, { warns: true });
			return test.shouldBeEqual("test.css");
		});

		it("Integer value => should set proper space after selector delimiter", function () {
			let test = new Test(this, { "space-after-selector-delimiter": 0 });
			return test.shouldBeEqual("test.css", "test.expected.css");
		});

		it("Valid string value (spaces only) => should set proper space after selector delimiter", function () {
			let test = new Test(this, { "space-after-selector-delimiter": "  " });
			return test.shouldBeEqual("test.css", "test-2.expected.css");
		});

		it("Valid string value (spaces and newlines) => should set proper space after selector delimiter", function () {
			let test = new Test(this, { "space-after-selector-delimiter": "\n    " });
			return test.shouldBeEqual("test.css", "test-3.expected.css");
		});
	});

	describe("sass", function () {
		it("Issue 238", function () {
			let test = new Test(this, { "space-after-selector-delimiter": "\n" });
			return test.shouldBeEqual("issue-238.sass", "issue-238.expected.sass");
		});
	});

	describe("consecutive delimiters", function () {
		it("Should not throw on `a,, b`", function () {
			let test = new Test(this, { "space-after-selector-delimiter": " " });
			return test.comb
				.processString("a,, b {c: d}", { syntax: "scss" })
				.then(function (actual) {
					assert.equal(actual, "a,, b {c: d}");
				});
		});
	});

	describe("sass @extend", function () {
		it("Should keep the line break after a comma in `@extend`", async function () {
			let test = new Test(this, { "space-after-selector-delimiter": " " });
			let actual = await test.comb.processString("g\n  @extend a,\n  d\n", {
				syntax: "sass",
			});
			assert.equal(actual, "g\n  @extend a,\n  d\n");
		});
		it("Should replace both the line break and the indent after a comma in a selector", async function () {
			let test = new Test(this, { "space-after-selector-delimiter": " " });
			let actual = await test.comb.processString("a,\n    b\n  c: d\n", { syntax: "sass" });
			assert.equal(actual, "a, b\n  c: d\n");
		});
	});
});
