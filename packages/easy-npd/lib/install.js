"use strict";

const debug = require("debug")("npd:install");
const path = require("path");
const chalk = require("chalk");
const semver = require("semver");
const pMap = require("p-map");
const download = require("./download");
const utils = require("./utils");
const { queueDependencyScripts } = require("./lifecycle_scripts");
const allowScripts = require("./allow_scripts");
const installProgress = require("./install_progress");
const npa = require("./npa");
const bin = require("./bin");
const link = require("./link");
const dependencies = require("./dependencies");
const resolve = require("./download/npm").resolve;
const { REGISTRY_TYPES, LOCAL_TYPES } = require("./npa_types");

module.exports = install;

async function install(parentDir, pkg, ancestors, options, context) {
	const state = {};
	try {
		return await _install(parentDir, pkg, ancestors, options, context, state);
	} catch (err) {
		if (pkg.optional) {
			// 子树中已排队的脚本不再运行, 见 lib/lifecycle_scripts.js runDependencyScripts
			if (state.dir) options.skippedOptionalDirs.add(state.dir);
			if (err.name === "UnSupportedPlatformError") {
				// ignore log error
				debug("%s", err.message);
				return;
			}
			options.console.error(
				chalk.yellow(`[${pkg.name}@${pkg.version}] optional install error: ${err.stack}`)
			);
			options.optionalFailures.push({
				displayName: `${pkg.name}@${pkg.version}`,
				error: err,
			});
		} else if (ancestors.some(ancestor => ancestor.optional)) {
			// 可选依赖子树中的失败交给最近的可选祖先处理, 与 npm 一样整体跳过该可选依赖
			throw err;
		} else {
			// 不中止整次安装: 记下后继续安装其余包, 安装结束时汇总并以失败退出
			const displayName = utils.getDisplayName(pkg, ancestors);
			options.failures.push({ displayName, error: err });
			options.console.error(
				chalk.red("[npd:install:error] %s: %s"),
				displayName,
				err.message
			);
		}
	}
}

async function _install(parentDir, pkg, ancestors, options, context, state) {
	const rootPkgDependencies = options.production
		? options.rootPkgDependencies.prodMap
		: options.rootPkgDependencies.allMap;
	const ancestorsWithRoot = [
		{ dependencies: rootPkgDependencies, name: "root package.json" },
	].concat(ancestors);

	// default install latest version
	if (!pkg.version) {
		pkg.version = "*";
	}

	pkg = options.resolution(pkg, ancestors, context.nested);

	debug(
		"[%s/%s] install %s@%s in %s",
		options.progresses.finishedInstallTasks,
		options.progresses.installTasks,
		pkg.name,
		pkg.version,
		parentDir
	);
	options.progresses.current = `${pkg.name}@${pkg.version}`;
	installProgress.render(options);
	// 只有根项目, 受信本地包与 overrides / resolutions 声明的依赖受信; 其余依赖声明的本地路径必须按声明者目录解析并按声明者审核脚本, 否则未放行的包能借 file: 依赖执行脚本
	const parent = ancestors[ancestors.length - 1] || options.rootDeclarer;
	const trusted = !parent || (!!pkg.overridden && !options.rootDeclarer) || parent.trustedLocal;
	const where = trusted ? options.root : parent.where;
	let p = npa(pkg.name ? `${pkg.name}@${pkg.version}` : pkg.version, {
		where,
		nested: context.nested,
	});
	const displayName = (p.displayName = utils.getDisplayName(pkg, ancestors));
	const isLocal = LOCAL_TYPES.includes(p.type);
	if (isLocal && !trusted) {
		p.untrustedLocal = true;
		p.scriptsOwner = allowScripts.keyOf(parent.scriptIdentity);
	}

	if (options.registryOnly && REGISTRY_TYPES.includes(p.type)) {
		throw new Error(`Only registry packages are allowed, but "${displayName}" is ${p.type}`);
	}

	if (options.flatten || forceFlatten(pkg)) {
		const res = await matchAncestorDependencies(p, ancestorsWithRoot, options, context);
		if (res) {
			// output anti semver info if not the same version
			if (res.childResolved !== res.ancestorResolved) {
				options.pendingMessages.push([
					"warn",
					"%s %s declares %s(resolved as %s) but uses ancestor(%s)'s dependency %s(resolved as %s)",
					chalk.magenta("anti semver"),
					chalk.gray(res.displayName),
					chalk.yellow(`${res.name}@${res.childSpec}`),
					chalk.yellow(res.childResolved),
					chalk.gray(res.ancestor),
					chalk.yellow(`${res.name}@${res.ancestorSpec}`),
					chalk.yellow(res.ancestorResolved),
				]);
			}
			// use ancestor's spec
			p = npa(`${res.name}@${res.ancestorSpec}`, {
				where: options.root,
				nested: context.nested,
			});
			pkg = Object.assign({}, pkg, { version: res.ancestorSpec });
		}
	}

	// 不受信的本地路径相对声明者解析, 同一个 spec 在不同声明者下指向不同目录
	const key = p.untrustedLocal
		? `install:${pkg.name}@${p.fetchSpec}#untrusted`
		: `install:${pkg.name}@${pkg.version}`;
	const c = options.cache[key]; // {package: packageInfo, dir: realDir}
	if (c) {
		const realPkg = c.package;
		const realPkgDir = c.dir;
		await linkModule(pkg, parentDir, realPkg, realPkgDir, options, displayName, ancestors);
		return { exists: true, dir: realPkgDir };
	}

	// cache if two ranges have the same max bound
	let rangeKey;
	if (p.type === "range") {
		const max = utils.getMaxRange(semver.validRange(p.fetchSpec, true));
		if (max) {
			rangeKey = `install:${pkg.name}:range:${max}`;
			const c = options.cache[rangeKey];
			if (c) {
				const realPkg = c.package;
				if (semver.satisfies(realPkg.version, p.fetchSpec)) {
					// add to cache.dependenciesTree, keep resolve version data complete
					options.cache.dependenciesTree[p.raw] = realPkg;
					if (options.lockPackages) options.lockPackages[p.raw] = realPkg;
					const realPkgDir = c.dir;
					await linkModule(
						pkg,
						parentDir,
						realPkg,
						realPkgDir,
						options,
						displayName,
						ancestors
					);
					return { exists: true, dir: realPkgDir };
				}
			}
		}
	}

	const info = await download(p, options);

	const realPkg = info.package;
	const realPkgDir = info.dir;

	if (!realPkgDir) {
		return;
	}
	state.dir = realPkgDir;

	// record version
	options.packageVersions[realPkg.name] = options.packageVersions[realPkg.name] || new Set();
	if (!options.packageVersions[realPkg.name].has(realPkg.version)) options.progresses.packages++;
	options.packageVersions[realPkg.name].add(realPkg.version);

	// update package name when installing using git
	if (p.type === "git") {
		pkg.name = realPkg.name;
	}

	options.cache[key] = { package: realPkg, dir: realPkgDir };

	if (rangeKey) {
		options.cache[rangeKey] = { package: realPkg, dir: realPkgDir };
	}

	const existingVersion = options.latestVersions.get(realPkg.name);
	if (!existingVersion || semver.gt(realPkg.version, existingVersion)) {
		options.latestVersions.set(realPkg.name, realPkg.version);
		options.latestPackages.set(realPkg.name, realPkgDir);
	}

	// 已装好的包: 启用锁文件时仍遍历一次子依赖但不执行脚本, 否则这棵子树不会记进 np-lock.json, 完整安装时被当作无用条目删除
	const revisit = info.exists && !info.stage;
	if (revisit && (!options.lockPackages || options.visitedStoreDirs.has(realPkgDir))) {
		// make sure bins will be links to ${parentDir}/node_modules/.bin
		await linkModule(pkg, parentDir, realPkg, realPkgDir, options, displayName, ancestors);
		return { exists: true, dir: realPkgDir };
	}
	options.visitedStoreDirs.add(realPkgDir);
	const stage = revisit ? utils.FINISH_INSTALL_STAGE : info.stage || utils.FIRST_INSTALL_STAGE;
	// 逐包明细只在 --detail 时显示, 默认在安装阶段结束后汇总成一行(lib/local_install.js)
	if (info.stage) {
		options.progresses.resumedPackages++;
		options.console.info(
			chalk.yellow("[npd:resume] %s continue from %s, root: %j"),
			displayName,
			options.rebuild ? "the beginning (npd-x rebuild)" : stage,
			realPkgDir
		);
	}

	// install steps:
	// 1. install dependencies (don't install bundledDependencies, but need link)
	// 2. link bin files
	// 3. link package to node_modules dir
	// 4. queue lifecycle scripts, they run after the whole tree is linked (lib/lifecycle_scripts.js runDependencyScripts)

	if (!revisit) checkPackage(realPkg, displayName, options);

	// 依赖的安装脚本需在 allowScripts 中放行, 未放行时 preinstall / install / postinstall 都不执行
	let scriptIdentity = null;
	if (!isLocal) scriptIdentity = allowScripts.identityOf(p.type, realPkg, p.fetchSpec);
	else if (!trusted) scriptIdentity = parent.scriptIdentity;
	const scriptsAllowed =
		!revisit &&
		(options.ignoreScripts ||
			(await allowScripts.allowPackage(
				realPkg,
				realPkgDir,
				scriptIdentity,
				p.untrustedLocal ? `${displayName} (declared by ${p.scriptsOwner})` : displayName,
				options
			)));
	// 未完成的包总是重新遍历子依赖, 已完成的子依赖只做链接; 停在某个脚本时子依赖的延后脚本也可能未运行
	const childDirs = [];
	// link bundleDependencies' bin
	// npd fsevents
	const bundledDependencies = await getBundleDependencies(realPkg, realPkgDir);
	if (!revisit)
		await Promise.all(bundledDependencies.map(name => bundleBin(name, realPkgDir, options)));

	const deps = dependencies(realPkg, options, context.nested);
	const pkgs = deps.prod;
	const pkgMaps = deps.prodMap;

	const nodeModulesDir = path.join(realPkgDir, "node_modules");

	const peerDependencies = realPkg.peerDependencies || {};
	const peerDependenciesMeta = realPkg.peerDependenciesMeta || {};
	if (Object.keys(peerDependencies).length) {
		const unmatched = {};
		const reverseAncestors = ancestorsWithRoot.slice().reverse();
		for (const name in peerDependencies) {
			const version = peerDependencies[name];
			const raw = `${name}@${version}`;
			context.nested.update([raw], p.raw);
			// don't need to check if peer dependency is in dependencies
			if (pkgMaps[name]) continue;

			// if we can get any matched version from ancestor
			// install it as dependency
			const childPkg = npa(raw, { where: options.root, nested: context.nested });
			// check in reverse
			const res = await matchAncestorDependencies(
				childPkg,
				reverseAncestors,
				options,
				context
			);
			if (res) {
				pkgs.push({ name, version: res.ancestorSpec, peer: true });
			} else if (peerDependenciesMeta[name]?.optional !== true) {
				// 安装结束时仍按实际解析结果校验, 自动安装失败或被跳过时照旧告警
				unmatched[name] = version;
				if (
					!options.legacyPeerDeps &&
					!reverseAncestors.some(ancestor => ancestor.dependencies[name])
				) {
					// 与 npm 7+ 一致: 没有祖先声明的 peer 作为本包的依赖自动安装, 失败时按可选依赖跳过;
					// 祖先声明了不兼容版本时不自动安装, 否则同一个 peer 会出现两份实例, 只告警
					pkgs.push({ name, version, optional: true });
				}
			}
		}
		// 不能写回 realPkg.peerDependencies: 它就是 np-lock.json 里的 manifest, 改写后锁文件丢失原始 peer 声明
		if (!revisit) {
			options.peerDependencies.push({
				package: realPkg,
				displayName,
				parentDir,
				peerDependencies: unmatched,
			});
		}
	}

	if (pkgs.length > 0) {
		await utils.mkdirp(nodeModulesDir);
		const needPkgs = pkgs.filter(childPkg => !bundledDependencies.includes(childPkg.name));
		context.nested.update(
			needPkgs.map(pkg => `${pkg.name}@${pkg.version}`),
			`${realPkg.name}@${realPkg.version}`
		);

		const mapper = async childPkg => {
			const res = await install(
				realPkgDir,
				childPkg,
				ancestors.concat({
					displayName: `${realPkg.name}@${realPkg.version}`,
					name: realPkg.name,
					version: realPkg.version,
					dependencies: deps.prodMap,
					optional: !!pkg.optional,
					where: packageWhere(p, realPkgDir),
					trustedLocal: isLocal && trusted,
					scriptIdentity,
					storeDir: realPkgDir,
				}),
				options,
				context
			);
			if (res && res.dir) childDirs.push(res.dir);
		};
		await pMap(needPkgs, mapper, 10);
	}

	await linkModule(pkg, parentDir, realPkg, realPkgDir, options, displayName, ancestors);
	// 阶段标记保持不变直到脚本运行完: 中断后下次运行仍经由本包遍历子依赖并重新排队;
	// 不执行脚本的包也排队, 依赖它的包仍要等它的子依赖的脚本跑完
	if (!revisit) {
		queueDependencyScripts(options, {
			pkg: realPkg,
			dir: realPkgDir,
			displayName: p.untrustedLocal
				? `${displayName} (declared by ${p.scriptsOwner})`
				: displayName,
			failureName: displayName,
			stage,
			skip: !scriptsAllowed || options.ignoreScripts || stage === utils.FINISH_INSTALL_STAGE,
			deps: childDirs,
		});
	}

	debug(
		"[%s/%s] installed %s@%s at %s",
		options.progresses.finishedInstallTasks,
		options.progresses.installTasks,
		realPkg.name,
		realPkg.version,
		realPkgDir
	);

	return { exists: !!info.exists, dir: realPkgDir };
}

async function getBundleDependencies(pkg, parentDir) {
	const bundles = pkg.bundledDependencies || pkg.bundleDependencies || [];
	const existBundles = [];
	// ignore not exist bundle dependencies
	for (const name of bundles) {
		if (await utils.exists(path.join(parentDir, "node_modules", name))) {
			existBundles.push(name);
		}
	}
	return existBundles;
}

async function bundleBin(name, parentDir, options) {
	const pkgDir = path.join(parentDir, "node_modules", name);
	const pkgfile = path.join(pkgDir, "package.json");
	const pkg = await utils.readJSON(pkgfile);
	await bin(parentDir, pkg, pkgDir, options);
}

async function matchAncestorDependencies(childPkg, ancestors, options, context) {
	// only need check npm types
	if (!REGISTRY_TYPES.includes(childPkg.type)) return;

	for (const ancestor of ancestors) {
		const ancestorVersion = ancestor.dependencies[childPkg.name];
		if (!ancestorVersion) continue;
		const ancestorPkg = npa(`${childPkg.name}@${ancestorVersion}`, {
			where: options.root,
			nested: context.nested,
		});
		if (!REGISTRY_TYPES.includes(ancestorPkg.type)) continue;
		ancestorPkg.parent = ancestor.name;
		const satisfied = await satisfiesRange(childPkg, ancestorPkg, options);
		if (satisfied) return satisfied;
	}
}

async function satisfiesRange(childPkg, ancestorPkg, options) {
	let satisfies = false;
	let resolveAncestorPkg = {};
	let resolveChildPkg = {};

	if (childPkg.raw === ancestorPkg.raw) {
		satisfies = true;
	} else {
		resolveAncestorPkg = await resolve(ancestorPkg, options);
		if (semver.satisfies(resolveAncestorPkg.version, childPkg.fetchSpec)) {
			resolveChildPkg = await resolve(childPkg, options);
			satisfies = true;
		}
	}
	if (!satisfies) return;

	debug(
		"%s declares %s(resolved as %s) but uses ancestor(%s)'s dependency %s(resolved as %s)",
		childPkg.displayName,
		`${childPkg.name}@${childPkg.rawSpec}`,
		resolveChildPkg.version || "-",
		ancestorPkg.parent,
		`${childPkg.name}@${ancestorPkg.rawSpec}`,
		resolveAncestorPkg.version || "-"
	);

	return {
		name: childPkg.name,
		displayName: childPkg.displayName,
		childSpec: childPkg.rawSpec,
		childResolved: resolveChildPkg.version || "-",
		ancestor: ancestorPkg.parent,
		ancestorSpec: ancestorPkg.rawSpec,
		ancestorResolved: resolveAncestorPkg.version || "-",
	};
}

function packageWhere(p, realPkgDir) {
	if (p.type === "directory") return p.fetchSpec;
	if (p.type === "file") return path.dirname(p.fetchSpec);
	return realPkgDir;
}

function checkPackage(realPkg, displayName, options) {
	if (realPkg.publish_time && realPkg.publish_time >= options.recentlyUpdateMinDateTime) {
		options.recentlyUpdates.set(
			`${displayName}(${chalk.green(realPkg.version)})`,
			new Date(realPkg.publish_time)
		);
	}

	if (realPkg.deprecated) {
		options.pendingMessages.push([
			"warn",
			"%s %s %s",
			chalk.red("deprecate"),
			chalk.gray(displayName),
			realPkg.deprecated,
		]);
	}

	if (
		realPkg.license &&
		options.forbiddenLicensesRegex &&
		options.forbiddenLicensesRegex.test(realPkg.license)
	) {
		options.pendingMessages.push([
			"warn",
			"%s %s %s",
			chalk.magenta("license forbidden"),
			chalk.gray(displayName),
			`package ${realPkg.name}'s license(${realPkg.license}) is not allowed`,
		]);
	}

	// https://docs.npmjs.com/files/package.json#engines
	const nodeVersion = realPkg.engines && realPkg.engines.node;
	if (nodeVersion && !semver.satisfies(process.version, nodeVersion)) {
		const err = new Error(
			`"node@${process.version}" is incompatible with ${displayName}, expected node@${nodeVersion}`
		);
		err.name = "UnSupportedNodeError";
		if (options.engineStrict) {
			throw err;
		} else {
			options.console.warn("\n%s %s", chalk.magenta("WARN node unsupported"), err.message);
		}
	}
}

function forceFlatten(pkg) {
	// 1.x, 1.0.x
	if (utils.endsWithX(pkg.version)) return true;
	// typeScript definitions
	if (pkg.name.startsWith("@types/")) return true;
}

// link module and bin files
async function linkModule(pkg, parentDir, realPkg, realPkgDir, options, displayName, ancestors) {
	noteScriptNeed(
		options,
		realPkgDir,
		pkg.optional
			? { dir: realPkgDir, name: realPkg.name, displayName }
			: nearestOptional(ancestors)
	);
	if (!pkg.peer) {
		const linkDir = path.join(parentDir, "node_modules", pkg.alias || realPkg.name);
		const binDir = bin.getBinDir(parentDir, options);
		await utils.removeStaleBins(linkDir, realPkg, binDir);
		// 脚本失败被跳过时据此撤掉
		if (pkg.optional) {
			if (!options.optionalLinks.has(realPkgDir)) options.optionalLinks.set(realPkgDir, []);
			options.optionalLinks.get(realPkgDir).push({ linkDir, binDir });
		}
		// fix concurrent install same bin name error
		try {
			await bin(parentDir, realPkg, realPkgDir, options);
		} catch (err) {
			if (err.code !== "EEXIST") {
				throw err;
			}
			// retry
			await bin(parentDir, realPkg, realPkgDir, options);
		}
		await link(parentDir, realPkg, realPkgDir, pkg.alias);
	} else {
		// peer dependencies will link after check root
		options.linkPeerDependencies.push({ parentDir, realPkg, realPkgDir });
	}
}

// 每次链接都记下这个包被谁需要: 任一处按普通依赖需要即为必需; 否则记下所在的可选依赖(最近的可选祖先或它自己),
// 延后运行的脚本失败时据此决定整体跳过哪些可选依赖, 见 lib/lifecycle_scripts.js runDependencyScripts
function noteScriptNeed(options, dir, optionalRoot) {
	let need = options.scriptNeeds.get(dir);
	if (!need) options.scriptNeeds.set(dir, (need = { required: false, roots: new Map() }));
	if (optionalRoot) need.roots.set(optionalRoot.dir, optionalRoot);
	else need.required = true;
}

function nearestOptional(ancestors) {
	for (let i = ancestors.length - 1; i >= 0; i--) {
		const { optional, storeDir, name, displayName } = ancestors[i];
		if (optional) return { dir: storeDir, name, displayName };
	}
	return null;
}
