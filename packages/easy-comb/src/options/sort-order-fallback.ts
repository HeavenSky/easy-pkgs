import { defineOption } from "../option.ts";

export default defineOption({
	name: "sort-order-fallback",

	syntax: ["css", "less", "sass", "scss"],

	accepts: { string: /^abc$/ },

	process: function () {},

	detect: () => [],
});
