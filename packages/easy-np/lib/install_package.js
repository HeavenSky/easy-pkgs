const debug = require("node:util").debuglog("np:install");
const path = require("node:path");
const os = require("node:os");
const chalk = require("chalk");
const semver = require("semver");
const pMap = require("p-map");
const download = require("./download");
const utils = require("./utils");
const npa = require("./npa");
const bin = require("./bin");
const link = require("./link");
const dependencies = require("./dependencies");
const resolve = require("./download/npm").resolve;
const { REGISTRY_TYPES, LOCAL_TYPES } = require("./npa_types");
const { queueDependencyScripts } = require("./lifecycle_scripts");
const allowScripts = require("./allow_scripts");

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
			options.console.error(chalk.red("[np:install:error] %s: %s"), displayName, err.message);
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
	const requested = pkg;

	pkg = options.resolution(pkg, ancestors, context.nested);

	debug(
		"[%s/%s] install %s@%s in %s",
		options.progresses.finishedInstallTasks,
		options.progresses.installTasks,
		pkg.name,
		pkg.version,
		parentDir
	);
	if (options.spinner) {
		options.spinner.text = `[${options.progresses.finishedInstallTasks}/${options.progresses.installTasks}] Installing ${pkg.name}@${pkg.version}${os.EOL}`;
	}
	// 依赖(registry, git, url 包及其本地依赖)声明的本地路径按声明者目录解析, 不受信: 只执行依赖脚本, 按声明者的身份审核;
	// 全局安装时被装的包就是根, 它的 overrides 与本地依赖同样不受信
	const globalRoot = options.globalRootDeclarer;
	const parent = ancestors[ancestors.length - 1] || globalRoot;
	const trusted = !parent || (!!pkg.overridden && !globalRoot) || !!parent.trustedLocal;
	let p = npa(pkg.name ? `${pkg.name}@${pkg.version}` : pkg.version, {
		where: trusted ? options.root : parent.where,
		nested: context.nested,
	});
	// 命令行的 `x@npm:foo` 与 package.json 中同一声明拆出的 foo@latest 必须用同一个 np-lock.json 键
	if (p.type === "alias" && !p.subSpec.rawSpec) {
		p = npa(`${p.name}@npm:${p.subSpec.name}@latest`, { nested: context.nested });
	}
	const isLocal = LOCAL_TYPES.includes(p.type);
	const scriptOwner = isLocal && !trusted ? parent.scriptIdentity : null;
	if (scriptOwner) {
		p.untrustedLocal = true;
		p.scriptsOwner = allowScripts.keyOf(scriptOwner);
	}
	const displayName = (p.displayName = utils.getDisplayName(pkg, ancestors));

	if (options.registryOnly && REGISTRY_TYPES.includes(p.type)) {
		throw new Error(`Only registry packages are allowed, but "${displayName}" is ${p.type}`);
	}

	if (options.flatten || forceFlatten(pkg)) {
		const res = await matchAncestorDependencies(p, ancestorsWithRoot, options, context);
		if (res) {
			// output anti semver info if not the same version
			// ignore `<name>@*`
			if (res.childResolved !== res.ancestorResolved && res.childSpec !== "*") {
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

	if (ancestors.length === 0) {
		requested.lockKey = LOCAL_TYPES.includes(p.type) ? null : (p.subSpec || p).raw;
	}

	// 不受信本地包的相对路径因声明者而异, 按解析出的绝对路径区分
	const key = scriptOwner
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
				if (utils.fastSemverSatisfies(realPkg.version, p.fetchSpec)) {
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
	options.packageVersions[realPkg.name].add(realPkg.version);

	// update package name when installing using git
	if (p.type === "git") {
		pkg.name = realPkg.name;
	}

	options.cache[key] = { package: realPkg, dir: realPkgDir };

	if (rangeKey) {
		options.cache[rangeKey] = { package: realPkg, dir: realPkgDir };
	}

	// 记录带来源标识的版本, 链接时按它拼出 git / url / 本地包的 store 目录
	const storeVersion = info.storeVersion || realPkg.version;
	const existingVersion = options.latestVersions.get(realPkg.name);
	if (!existingVersion || semver.gt(storeVersion, existingVersion)) {
		options.latestVersions.set(realPkg.name, storeVersion);
		if (options.publicHoistPattern?.test(realPkg.name)) {
			options.publicHoistLatestVersions.set(realPkg.name, storeVersion);
		}
	}

	// 启用锁文件时已完成的包按 finish 阶段重新遍历一次子依赖, 否则它的子树不会记进 np-lock.json, 完整安装写锁时被当作无用条目删除
	const revisit =
		info.exists &&
		!info.stage &&
		!!options.lockPackages &&
		!options.visitedStoreDirs.has(realPkgDir);
	if (info.exists && !info.stage && !revisit) {
		// make sure bins will be links to ${parentDir}/node_modules/.bin
		await linkModule(pkg, parentDir, realPkg, realPkgDir, options, displayName, ancestors);
		return { exists: true, dir: realPkgDir };
	}
	options.visitedStoreDirs.add(realPkgDir);
	const stage = revisit ? utils.FINISH_INSTALL_STAGE : info.stage || utils.FIRST_INSTALL_STAGE;
	if (info.stage) {
		options.console.warn(
			chalk.yellow("[np:resume] %s continue from %s, root: %j"),
			displayName,
			options.rebuild ? "the beginning (np-x rebuild)" : stage,
			realPkgDir
		);
	}

	// install steps:
	// 1. install dependencies (don't install bundledDependencies, but need link)
	// 2. link bin files
	// 3. link package to node_modules dir
	// 4. queue lifecycle scripts, they run after the whole tree is linked (lib/lifecycle_scripts.js runDependencyScripts)

	if (!revisit) {
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
		if (nodeVersion && !utils.fastSemverSatisfies(process.version, nodeVersion)) {
			const err = new Error(
				`"node@${process.version}" is incompatible with ${displayName}, expected node@${nodeVersion}`
			);
			err.name = "UnSupportedNodeError";
			if (options.engineStrict) {
				throw err;
			} else {
				options.console.warn(
					"\n%s %s",
					chalk.magenta("WARN node unsupported"),
					err.message
				);
			}
		}
	}

	// 未完成的包总是重新遍历子依赖, 已完成的子依赖只做链接, 不再重新解压; 停在某个脚本时子依赖的延后脚本也可能未运行
	const childDirs = [];
	// link bundleDependencies' bin
	// np fsevents
	const bundledDependencies = await getBundleDependencies(realPkg, realPkgDir);
	await Promise.all(
		bundledDependencies.map(name => bundleBin(name, realPkgDir, options, displayName))
	);

	const deps = dependencies(realPkg, options, context.nested);
	const pkgs = deps.prod;
	const pkgMaps = deps.prodMap;

	const nodeModulesDir = path.join(realPkgDir, "node_modules");

	const peerDependencies = realPkg.peerDependencies || {};
	const peerDependenciesMeta = realPkg.peerDependenciesMeta || {};
	const needLinkPeerDependencies = [];
	if (Object.keys(peerDependencies).length > 0) {
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
				pkgs.push({ name, version: res.ancestorSpec });
				needLinkPeerDependencies.push({ name, version: res.ancestorSpec });
			} else if (peerDependenciesMeta[name]?.optional !== true) {
				// 安装结束时仍按实际解析结果校验, 自动安装失败或被跳过时照旧告警
				unmatched[name] = version;
				const declared =
					reverseAncestors.some(ancestor => ancestor.dependencies[name]) ||
					(options.isWorkspacePackage && context.workspaceRootDepNames?.has(name));
				if (!options.legacyPeerDeps && !declared) {
					// 与 npm 7+ 一致: 没有祖先声明的 peer 作为本包的依赖自动安装, 失败时按可选依赖跳过;
					// 祖先或 workspace 根声明了不兼容版本时不自动安装, 否则同一个 peer 会出现两份实例, 只告警
					pkgs.push({ name, version, optional: true });
				}
			}
		}
		// 不能改写 realPkg.peerDependencies: 它与锁文件条目是同一个对象, 改写后 np-lock.json 记下的 peer 会被删掉
		if (!revisit) {
			options.peerDependencies.push({
				package: realPkg,
				packageDir: realPkgDir,
				displayName,
				parentDir,
				peerDependencies: unmatched,
			});
		}
	}

	// handle sub-dependencies
	if (pkgs.length > 0) {
		await utils.mkdirp(nodeModulesDir);
		const needPkgs = pkgs.filter(childPkg => !bundledDependencies.includes(childPkg.name));
		context.nested.update(
			needPkgs.map(pkg => `${pkg.name}@${pkg.version}`),
			`${realPkg.name}@${realPkg.version}`
		);

		const declarer = {
			displayName: `${realPkg.name}@${realPkg.version}`,
			name: realPkg.name,
			version: realPkg.version,
			dependencies: deps.prodMap,
			optional: !!pkg.optional,
			where: realPkgDir,
			trustedLocal: isLocal && trusted,
			scriptIdentity: isLocal
				? scriptOwner
				: allowScripts.identityOf(p.type, realPkg, p.fetchSpec),
			storeDir: realPkgDir,
		};
		if (isLocal)
			declarer.where = p.type === "directory" ? p.fetchSpec : path.dirname(p.fetchSpec);
		const mapper = async childPkg => {
			const res = await install(
				realPkgDir,
				childPkg,
				ancestors.concat(declarer),
				options,
				context
			);
			if (res && res.dir) childDirs.push(res.dir);
		};
		// NOTE: any chance that the installation will speed up slightly if we use
		// a global queue?
		await pMap(needPkgs, mapper, 10);
	}
	if (needLinkPeerDependencies.length > 0) {
		for (const peer of needLinkPeerDependencies) {
			const key = `install:${peer.name}@${peer.version}`;
			const c = options.cache[key];
			if (c) {
				// scoped package
				const relativePath =
					pkg.name && pkg.name.startsWith("@")
						? `../../${c.package.name}`
						: `../${c.package.name}`;
				const linkDir = path.join(realPkgDir, relativePath);
				const relative = await utils.forceSymlink(c.dir, linkDir);
				debug(
					"%s link peer package(%s@%s) %s => %s, parentDir: %s",
					displayName,
					c.package.name,
					c.package.version,
					linkDir,
					relative,
					realPkgDir
				);
			}
		}
	}

	// from here, a package is already downloaded and unpacked into
	// <root>/.store/<name>/node_modules/<name>. but there is no sub-dependencies
	// in the same node_modules, following logic will link the package itself into
	// parent's node_modules folder.
	await linkModule(pkg, parentDir, realPkg, realPkgDir, options, displayName, ancestors);

	debug(
		"[%s/%s] installed %s@%s at %s",
		options.progresses.finishedInstallTasks,
		options.progresses.installTasks,
		realPkg.name,
		realPkg.version,
		realPkgDir
	);
	if (revisit) {
		return { exists: true, dir: realPkgDir };
	}

	if (options.ignoreScripts || stage === utils.FINISH_INSTALL_STAGE) {
		await utils.setInstallStage(realPkgDir, utils.FINISH_INSTALL_STAGE);
		options.stagedDirs.add(realPkgDir);
	} else {
		// 阶段标记保持不变直到脚本运行完: 中断后下次运行仍经由本包遍历子依赖并重新排队
		queueDependencyScripts(options, {
			pkg: realPkg,
			dir: realPkgDir,
			origin: pkg,
			displayName: scriptOwner
				? `${displayName} (declared by ${p.scriptsOwner})`
				: displayName,
			failureName: displayName,
			stage,
			source: scriptOwner ? { identity: scriptOwner } : undefined,
			deps: childDirs,
		});
	}

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

async function bundleBin(name, parentDir, options, displayName) {
	const pkgDir = path.join(parentDir, "node_modules", name);
	const pkgfile = path.join(pkgDir, "package.json");
	const pkg = await utils.readJSON(pkgfile);
	await bin(parentDir, pkg, pkgDir, options, displayName);
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
		if (satisfied) {
			return satisfied;
		}
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
		if (utils.fastSemverSatisfies(resolveAncestorPkg.version, childPkg.fetchSpec)) {
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

function forceFlatten(pkg) {
	// 1.x, 1.0.x
	if (utils.endsWithX(pkg.version)) return true;
	// typeScript definitions
	if (pkg.name.startsWith("@types/")) return true;
}

// link module and bin files
async function linkModule(pkg, parentDir, realPkg, realPkgDir, options, displayName, ancestors) {
	const linkDir = path.join(parentDir, "node_modules", pkg.alias || realPkg.name);
	const binDir = bin.getBinDir(parentDir, options);
	await utils.removeStaleBins(linkDir, realPkg, binDir);
	noteScriptNeed(
		options,
		realPkgDir,
		pkg.optional
			? { dir: realPkgDir, name: realPkg.name, displayName }
			: nearestOptional(ancestors)
	);
	// fix concurrent install same bin name error
	try {
		await bin(parentDir, realPkg, realPkgDir, options, displayName);
	} catch (err) {
		if (err.code !== "EEXIST") {
			throw err;
		}
		// retry
		await bin(parentDir, realPkg, realPkgDir, options, displayName);
	}
	// 记下实际的链接位置(store 中的依赖链接在父包旁边, 不在 parentDir/node_modules 下), 脚本失败被跳过时据此撤掉
	const linkedDir = await link(parentDir, realPkg, realPkgDir, pkg.alias, options);
	if (pkg.optional) {
		if (!options.optionalLinks.has(realPkgDir)) options.optionalLinks.set(realPkgDir, []);
		options.optionalLinks.get(realPkgDir).push({ linkDir: linkedDir, binDir });
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
