var assert = require("assert");
var describe = require("node:test").describe;
var it = require("node:test").it;
var ParsingError = require("../src/parsing-error");

describe("Parsing Error", function () {
	var error = { line: 5, syntax: "css" };
	var css = "a\nb\nc\nd\ne\nf\ng\nh";
	var parsingError = new ParsingError(error, css);

	it("context", function () {
		var context = "3 | c\n4 | d\n5*| e\n6 | f\n7 | g";
		assert.equal(parsingError.context, context);
	});
});
