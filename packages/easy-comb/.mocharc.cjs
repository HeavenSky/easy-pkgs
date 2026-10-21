// https://mochajs.org/running/configuring
// .ts 用例由 Node 原生类型剥离加载, 不需要 tsx 等转译器.
module.exports = {
	file: ["./test/mocha.setup.ts"],
	extension: ["ts"],
	spec: "test/**/*.test.ts",
	recursive: true,
	parallel: false,
};
