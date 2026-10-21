import assert from "node:assert/strict";
import Test from "../../helpers/core-test.ts";

describe("css", function () {
	it("Should parse variables", function () {
		const test = new Test(this);

		test.comb.configure({});

		return test.shouldBeEqual("variable.css");
	});

	it("Should preserve CRLF line endings", function () {
		const test = new Test(this);
		const input = "a { top: 0; color: red }\n\n\n/* x */\nb\n{\n  top: 0\n}\n";

		test.useConfig("csscomb");

		return Promise.all([
			test.comb.processString(input),
			test.comb.processString(input.replace(/\n/g, "\r\n")),
		]).then(([lf, crlf]) => {
			assert.ok(!lf.includes("\r"));
			assert.equal(crlf, lf.replace(/\n/g, "\r\n"));
		});
	});
});
