import Test from "../../helpers/core-test.ts";

describe("less", function () {
	it("Should parse nested rules", function () {
		let test = new Test(this);
		test.comb.configure({});

		return test.shouldBeEqual("nested-rule.less");
	});

	it("Should parse operations", function () {
		let test = new Test(this);
		test.comb.configure({});

		return test.shouldBeEqual("operation.less");
	});

	it("Should parse parent selector &", function () {
		let test = new Test(this);
		test.comb.configure({});

		return test.shouldBeEqual("parent-selector.less");
	});

	it("Should parse variables", function () {
		let test = new Test(this);
		test.comb.configure({});

		return test.shouldBeEqual("variable.less");
	});

	it("Should parse interpolated variables inside selectors", function () {
		let test = new Test(this);
		test.comb.configure({});

		return test.shouldBeEqual("interpolated-variable-1.less");
	});

	it("Should parse interpolated variables inside values", function () {
		let test = new Test(this);
		test.comb.configure({});

		return test.shouldBeEqual("interpolated-variable-2.less");
	});

	it("Should parse @import", function () {
		let test = new Test(this);
		test.comb.configure({});

		return test.shouldBeEqual("import.less");
	});

	it("Should parse included mixins", function () {
		let test = new Test(this);
		test.comb.configure({});

		return test.shouldBeEqual("mixin.less");
	});

	it("Should parse nested @media", function () {
		let test = new Test(this);
		test.comb.configure({});

		return test.shouldBeEqual("nested-media.less");
	});

	it("Should parse interpolated property names", function () {
		let test = new Test(this);
		test.comb.configure({});

		return test.shouldBeEqual("interpolated-property.less");
	});

	it("Should parse interpolated class names", function () {
		let test = new Test(this);
		test.comb.configure({});

		return test.shouldBeEqual("interpolated-class.less");
	});

	it("Should keep the order of interpolated properties when sorting", function () {
		let test = new Test(this);
		test.comb.configure({ "sort-order": [["box-sizing"], ["padding"]] });

		return test.shouldBeEqual(
			"interpolated-property.less",
			"interpolated-property.expected.less"
		);
	});
});
