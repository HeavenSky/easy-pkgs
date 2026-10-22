// np-x rebuild <pkg>: 不下载包, 不改依赖与 package.json, 只重跑 .store 中指定包已安装版本的生命周期脚本

const path = require("node:path");
const fs = require("node:fs/promises");
const Module = require("node:module");
const chalk = require("chalk");
const utils = require("./utils");
const formatInstallOptions = require("./format_install_options");
const { runLifecycleScripts } = require("./lifecycle_scripts");
const allowScripts = require("./allow_scripts");

module.exports = async options => {
	options = formatInstallOptions(options);
	// 显式重跑时总是输出脚本日志
	options.foregroundScripts = true;
	const targets = [];
	for (const spec of options.rebuildSpecs) {
		const matched = await findInstalled(spec, options);
		if (matched.length === 0) {
			throw utils.userError(
				`np-x rebuild: ${spec.raw} is not installed in ${path.join(options.root, "node_modules")}, ` +
					`run np-x rebuild without package names or np to install it`
			);
		}
		targets.push(...matched);
	}

	// 一个包失败不影响其余包, 结束时汇总; 失败的包阶段停在失败的脚本
	for (const { pkg, dir, name, version } of await sortByDependencies(targets)) {
		const owner = allowScripts.ownerOfInstalled(pkg);
		const displayName = owner
			? `${name}@${version} (declared by ${owner})`
			: `${name}@${version}`;
		try {
			// 与安装时一致要在 allowScripts 中放行: git 与 url 依赖按 package.json 记录的解析地址比对
			const identity = allowScripts.identityOfInstalled(pkg, dir);
			const { skipped } = allowScripts.ensure(options);
			const skippedBefore = skipped.length;
			await runLifecycleScripts(
				{ ...pkg, name, version },
				dir,
				{},
				displayName,
				options,
				"preinstall",
				{ identity }
			);
			// 未放行时脚本没有执行, 阶段标记保持原样, 由结束时的跳过列表提示如何放行
			if (skipped.length > skippedBefore) continue;
			await utils.setInstallStage(dir);
			options.console.info(chalk.green("rebuilt %s"), displayName);
		} catch (err) {
			options.failures.push({ displayName, error: err, name });
		}
	}
	const scriptPolicyError = allowScripts.report(options);
	if (scriptPolicyError)
		options.failures.push({ displayName: "allowScripts", error: scriptPolicyError });
	if (options.failures.length > 0) {
		// 被其他包依赖的子包不会被普通 np 遍历到, 只能再次 np-x rebuild
		const names = [...new Set(options.failures.map(item => item.name))].join(" ");
		throw utils.installFailuresError(
			options.failures,
			`run np-x rebuild ${names} again to rerun their scripts`
		);
	}
	return targets;
};

// 列出的包按依赖顺序重跑: 依赖(含经由未列出的包间接依赖)先于依赖它的包; 互相依赖成环时按列出的顺序; 同一目录只跑一次
async function sortByDependencies(targets) {
	const index = new Map();
	const unique = [];
	for (const target of targets) {
		const dir = await fs.realpath(target.dir);
		if (index.has(dir)) continue;
		index.set(dir, unique.length);
		unique.push(target);
	}
	const depsCache = new Map();
	const depsOf = async dir => {
		if (depsCache.has(dir)) return depsCache.get(dir);
		const pkg = await utils.readJSON(path.join(dir, "package.json"));
		const names = Object.keys({
			...pkg.dependencies,
			...pkg.optionalDependencies,
			...pkg.peerDependencies,
		});
		// 与 Node 解析依赖的查找路径一致, 取第一个存在的
		const lookups = Module._nodeModulePaths(dir);
		const dirs = [];
		for (const name of names) {
			for (const lookup of lookups) {
				const real = await fs.realpath(path.join(lookup, name)).catch(() => null);
				if (real) {
					dirs.push(real);
					break;
				}
			}
		}
		depsCache.set(dir, dirs);
		return dirs;
	};
	// before[i]: 第 i 个包经由依赖链能到达的其他列出的包
	const before = [];
	for (const [dir, i] of index) {
		const reached = new Set();
		const seen = new Set([dir]);
		const stack = [dir];
		while (stack.length > 0) {
			for (const dep of await depsOf(stack.pop())) {
				if (seen.has(dep)) continue;
				seen.add(dep);
				if (index.has(dep)) reached.add(index.get(dep));
				stack.push(dep);
			}
		}
		before[i] = reached;
	}
	const done = new Set();
	const order = [];
	while (order.length < unique.length) {
		// 剩余的包中总有一个只依赖已跑过的包或与它成环的包
		const next = unique.findIndex(
			(_, i) => !done.has(i) && [...before[i]].every(j => done.has(j) || before[j].has(i))
		);
		done.add(next);
		order.push(unique[next]);
	}
	return order;
}

// 按名称在 .store 中查找全部已安装版本, spec 带版本时按 semver 范围过滤
async function findInstalled(spec, options) {
	// 必须与 utils.getPackageStorePath 的目录规则一致
	const storeRoot = path.join(
		options.enableWorkspace ? options.workspaceRoot : options.root,
		"node_modules/.store"
	);
	const prefix = `${spec.name.replace("/", "+")}@`;
	let entries;
	try {
		entries = await fs.readdir(storeRoot);
	} catch {
		return [];
	}
	const matched = [];
	for (const entry of entries.sort()) {
		if (!entry.startsWith(prefix)) continue;
		const { version, suffix } = utils.parseStoreVersion(entry.slice(prefix.length));
		if (spec.range && !utils.fastSemverSatisfies(version, spec.range)) continue;
		const dir = utils.getPackageStorePath(
			path.join(options.root, "node_modules"),
			{ name: spec.name, version },
			options,
			suffix
		);
		const pkg = await utils.readJSON(path.join(dir, "package.json"));
		if (pkg.name) matched.push({ pkg, dir, name: spec.name, version });
	}
	return matched;
}
