import assert from "node:assert/strict";
import Test from "../../../helpers/option-test.ts";

describe("Option `element-case`, process", function () {
	describe("css", function () {
		it("Invalid String should not change case of elements", function () {
			let test = new Test(this, { "element-case": "foobar" }, { warns: true });
			return test.comb.processString("LI a { color : red }").then(function (actual) {
				assert.equal(actual, "LI a { color : red }");
			});
		});

		it("Should switch tag name to upper case", function () {
			let test = new Test(this, { "element-case": "upper" });
			return test.comb.processString("div { color: #fff }").then(function (actual) {
				assert.equal(actual, "DIV { color: #fff }");
			});
		});

		it("Should switch tag name to lower case", function () {
			let test = new Test(this, { "element-case": "lower" });
			return test.comb.processString("DIV { color: #FFF }").then(function (actual) {
				assert.equal(actual, "div { color: #FFF }");
			});
		});

		it("Should switch element-case in complex rules", function () {
			let test = new Test(this, { "element-case": "lower" });
			return test.comb
				.processString("UL > LI > .foo:not(A) { color: red }")
				.then(function (actual) {
					assert.equal(actual, "ul > li > .foo:not(a) { color: red }");
				});
		});
	});

	describe("scss", function () {
		it("Should not touch mixin names", function () {
			let test = new Test(this, { "element-case": "lower" });
			return test.shouldBeEqual("mixin.scss", "mixin.expected.scss");
		});

		it("Should not change case of interpolated selectors (#455)", function () {
			let test = new Test(this, { "element-case": "lower" });
			return test.shouldBeEqual("interpolation.scss", "interpolation.expected.scss");
		});
	});

	describe("names that are not element names", function () {
		it("Should not change pseudo-class arguments that are not selectors, escapes or non-ASCII letters", function () {
			let test = new Test(this, { "element-case": "lower" });
			return test.comb
				.processString(":lang(\\*-FR), :not(DIV), \\212A, \u212A, :is(A, :lang(EN) B) {}")
				.then(function (actual) {
					assert.equal(
						actual,
						":lang(\\*-FR), :not(div), \\212A, \u212A, :is(a, :lang(EN) b) {}"
					);
				});
		});
	});

	describe("scss parent selector in values", function () {
		it("Should keep the case of selectors whose text `&` puts into values", async function () {
			let test = new Test(this, { "element-case": "lower" });
			let actual = await test.comb.processString("A{B{c:&}}D{E{f:g}}", { syntax: "scss" });
			assert.equal(actual, "A{B{c:&}}d{e{f:g}}");
		});
		it("Should keep the case of selectors interpolated with `#{&}`", async function () {
			let test = new Test(this, { "element-case": "lower" });
			let actual = await test.comb.processString("A{B#{&}C{d:e}}", { syntax: "scss" });
			assert.equal(actual, "A{B#{&}C{d:e}}");
		});
	});
});
