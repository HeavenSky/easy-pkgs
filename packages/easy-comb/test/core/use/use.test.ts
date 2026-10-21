import assert from "node:assert/strict";
import Test from "../../helpers/core-test.ts";

describe(".use()", function () {
	it("Should set predefined options in correct order", function () {
		let test = new Test(this);
		var config = test.legacyConfig();
		test.comb.configure(config);
		var options = test.comb.plugins.map(function (plugin) {
			return plugin.name;
		});
		var expected = [
			"always-semicolon",
			"remove-empty-rulesets",
			"color-case",
			"color-shorthand",
			"element-case",
			"leading-zero",
			"quotes",
			"sort-order-fallback",
			"space-after-colon",
			"space-after-combinator",
			"space-after-opening-brace",
			"space-after-selector-delimiter",
			"space-before-colon",
			"space-before-combinator",
			"space-before-opening-brace",
			"space-before-selector-delimiter",
			"space-between-declarations",
			"block-indent",
			"sort-order",
			"lines-between-rulesets",
			"strip-spaces",
			"space-before-closing-brace",
			"unitless-zero",
			"eof-newline",
			"tab-size",
			"vendor-prefix-align",
		];
		assert.deepEqual(options, expected);
	});
});
