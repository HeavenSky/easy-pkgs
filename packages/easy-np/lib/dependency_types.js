// 安装和清理共用依赖字段名称及 --only 参数语法
const { userError } = require("./utils");

const DEP_TYPE = /^[a-z][a-zA-Z0-9]*$/;
const TYPE_FIELDS = {
	__proto__: null,
	prod: "dependencies",
	dev: "devDependencies",
	optional: "optionalDependencies",
	peer: "peerDependencies",
};

const fieldOf = type => TYPE_FIELDS[type] || `${type}Dependencies`;

function parseDepTypes(value, flag) {
	const types = []
		.concat(value ?? [])
		.flatMap(item => String(item).split(","))
		.map(item => item.trim())
		.filter(Boolean);
	for (const type of types) {
		if (!DEP_TYPE.test(type))
			throw userError(`${flag} takes dependency types like client or build, got "${type}"`);
	}
	return [...new Set(types)];
}

module.exports = { TYPE_FIELDS, fieldOf, parseDepTypes };
