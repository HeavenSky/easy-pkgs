import assert from "node:assert/strict";
import Test from "../../../helpers/option-test.ts";

describe("Option `space-before-opening-brace`, process", function () {
	describe("css", function () {
		it("Array value => should not change anything", function () {
			let test = new Test(this, { "space-before-opening-brace": ["", " "] }, { warns: true });
			return test.shouldBeEqual("test.css");
		});

		it("Invalid string value => should not change anything", function () {
			let test = new Test(
				this,
				{ "space-before-opening-brace": "  nani  " },
				{ warns: true }
			);
			return test.shouldBeEqual("test.css");
		});

		it("Float number value => should not change anything", function () {
			let test = new Test(this, { "space-before-opening-brace": 3.5 }, { warns: true });
			return test.shouldBeEqual("test.css");
		});

		it("Integer value => should set proper space before {", function () {
			let test = new Test(this, { "space-before-opening-brace": 0 });
			return test.shouldBeEqual("test.css", "test.expected.css");
		});

		it("Valid string value (spaces only) => should set proper space before {", function () {
			let test = new Test(this, { "space-before-opening-brace": "  " });
			return test.shouldBeEqual("test.css", "test-2.expected.css");
		});

		it("Valid string value (spaces and newlines) => should set proper space before {", function () {
			let test = new Test(this, { "space-before-opening-brace": "\n    " });
			return test.shouldBeEqual("test.css", "test-3.expected.css");
		});

		it("Issue 232", function () {
			let test = new Test(this, { "space-before-opening-brace": 1 });
			return test.shouldBeEqual("issue-232.css", "issue-232.expected.css");
		});
	});

	describe("scss", function () {
		it("Issue 231", function () {
			let test = new Test(this, { "space-before-opening-brace": 1 });
			return test.shouldBeEqual("issue-231.scss", "issue-231.expected.scss");
		});

		it("Issue 319", function () {
			let test = new Test(this, { "space-before-opening-brace": 1 });
			return test.shouldBeEqual("issue-319.scss", "issue-319.expected.scss");
		});
	});

	describe("empty value", function () {
		it("Should not throw", function () {
			let test = new Test(this, { "space-before-opening-brace": " " });
			return test.comb.processString("a{foo:;bar:}").then(function (actual) {
				assert.equal(actual, "a {foo:;bar:}");
			});
		});
	});

	describe("line comments and guards", function () {
		it("Should keep the line break ending a `//` comment", async function () {
			let test = new Test(this, { "space-before-opening-brace": " " });
			let actual = await test.comb.processString("a //\n{b:c}", { syntax: "scss" });
			assert.equal(actual, "a //\n{b:c}");
		});
		it("Should set the space after a less guard", async function () {
			let test = new Test(this, { "space-before-opening-brace": " " });
			let actual = await test.comb.processString(".m() when (@a){b:c}.n() when (@a)  {b:c}", {
				syntax: "less",
			});
			assert.equal(actual, ".m() when (@a) {b:c}.n() when (@a) {b:c}");
		});
	});
});
