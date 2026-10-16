// 由包目录的 package-lock.json 生成去掉开发依赖的 npm-shrinkwrap.json, 发布时随包附带, 让用户安装时整棵依赖树按已测版本解析
// 用法: node scripts/shrinkwrap.mjs <包目录>
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.argv[2] || ".");
const lock = JSON.parse(fs.readFileSync(path.join(dir, "package-lock.json"), "utf8"));

// lockfileVersion 2 同时有 packages(npm 7+ 读)与 dependencies(npm 6 读), 两边都要去掉 dev 条目
const packages = {};
for (const [key, entry] of Object.entries(lock.packages || {})) {
	if (key === "") {
		const { devDependencies, ...root } = entry;
		packages[key] = root;
	} else if (!entry.dev) {
		packages[key] = entry;
	}
}

const pruneDeps = deps => {
	if (!deps) { return deps; }
	const out = {};
	for (const [name, entry] of Object.entries(deps)) {
		if (entry.dev) { continue; }
		out[name] = entry.dependencies ? { ...entry, dependencies: pruneDeps(entry.dependencies) } : entry;
	}
	return out;
};

const shrinkwrap = { ...lock, packages };
if (lock.dependencies) { shrinkwrap.dependencies = pruneDeps(lock.dependencies); }
const file = path.join(dir, "npm-shrinkwrap.json");
fs.writeFileSync(file, `${JSON.stringify(shrinkwrap, null, 2)}\n`);
console.log(`已生成 ${file}: ${Object.keys(packages).length - 1} 个依赖(原 lockfile ${Object.keys(lock.packages || {}).length - 1} 个)`);
