/**
 * impl npm install [pkg1, pkg2, ...]
 */

const debug = require("debug")("npd:local_install");
const chalk = require("chalk");
const path = require("path");
const os = require("os");
const ms = require("ms");
const pMap = require("p-map");
const semver = require("semver");
const bytes = require("bytes");
const Module = require("module");
const { writeFileSync } = require("fs");
const fs = require("fs/promises");
const dayjs = require("dayjs");
const util = require("util");
const utils = require("./utils");
const { runPackageScripts, runDependencyScripts } = require("./lifecycle_scripts");
const prepublish = require("./prepublish");
const prepare = require("./prepare");
const allowScripts = require("./allow_scripts");
const npLock = require("./np_lock");
const install = require("./install");
const dependencies = require("./dependencies");
const createResolution = require("./resolution");
const formatInstallOptions = require("./format_install_options");
const link = require("./link");
const bin = require("./bin");
const Context = require("./context");

/**
 * npm install
 * @param {Object} options - install options
 *  - {String} root - npm install root dir
 *  - {String} [registry] - npm registry url, default is `https://registry.npmjs.com`
 *  - {String} [targetDir] - node_modules target dir, default is ${root}.
 *  - {String} [storeDir] - npm modules store dir, default is `${targetDir}/node_modules`
 *  - {Number} [timeout] - npm registry request timeout, default is 60000 ms
 *  - {Number} [streamingTimeout] - download tar.gz stream timeout, default is 120000 ms
 *  - {Console} [console] - console logger instance, default is `console`
 *  - {Array<Object>} [pkgs] - optional packages to install, default is `[]`
 *  - {Boolean} [production] - production mode install, default is `false`
 *  - {Object} [env] - postinstall and preinstall scripts custom env.
 *  - {String} [cacheDir] - tarball cache store dir, default is `$HOME/.np_tarball`.
 *  - {Object} [binaryMirrors] - binary mirror config, default is `{}`
 *  - {Boolean} [ignoreScripts] - ignore pre / post install scripts, default is `false`
 *  - {Array} [forbiddenLicenses] - forbid installing packages that use these licenses
 *  - {Boolean} [trace] - show memory and CPU usage traces of the installation
 *  - {Boolean} [flatten] - flatten dependencies by matching ancestors' dependencies
 * @param {Object} context - install context
 */
module.exports = async (options, context = new Context()) => {
	options = formatInstallOptions(options);
	if (options.spinner) options.spinner.start();
	let traceTimer;
	let showTrace;
	if (options.trace) {
		const startTime = Date.now();
		let cpuUsage = process.cpuUsage && process.cpuUsage();
		showTrace = () => {
			cpuUsage = process.cpuUsage && process.cpuUsage(cpuUsage);
			const memoryUsage = process.memoryUsage();
			const loads = os
				.loadavg()
				.map(v => Math.round(v * 10) / 10 + "")
				.join(", ");
			if (cpuUsage) {
				options.console.warn(
					"[trace] %s 🏊  memory usage, rss: %s, heapTotal: %s, heapUsed: %s, external: %s; 💻  os free: %s, os load: %s; 🏃  cpu usage, user: %s, system: %s",
					ms(Date.now() - startTime),
					bytes(memoryUsage.rss),
					bytes(memoryUsage.heapTotal),
					bytes(memoryUsage.heapUsed),
					bytes(memoryUsage.external || 0),
					bytes(os.freemem()),
					loads,
					Math.floor(cpuUsage.user / 1000 / 1000),
					Math.floor(cpuUsage.system / 1000 / 1000)
				);
			} else {
				options.console.warn(
					"[trace] %s 🏊  memory usage, rss: %s, heapTotal: %s, heapUsed: %s, external: %s; 💻  os free: %s, os load: %s",
					ms(Date.now() - startTime),
					bytes(memoryUsage.rss),
					bytes(memoryUsage.heapTotal),
					bytes(memoryUsage.heapUsed),
					bytes(memoryUsage.external || 0),
					bytes(os.freemem()),
					loads
				);
			}
		};
		traceTimer = setInterval(showTrace, 1000);
	}

	try {
		await _install(options, context);
	} catch (err) {
		// 失败汇总由调用方输出, 这里只给一行结论
		const message =
			err.code === utils.INSTALL_FAILURES_CODE
				? `Install finished with ${err.failures.length} failed package(s)`
				: `Install failed! ${err}`;
		if (options.spinner) {
			options.spinner.fail(message);
		} else {
			options.console.error(message);
		}
		throw err;
	} finally {
		if (traceTimer) {
			clearInterval(traceTimer);
			showTrace();
		}
	}
};

async function _install(options, context) {
	const rootPkgFile = path.join(options.root, "package.json");
	const rootPkg = await utils.readJSON(rootPkgFile);
	const displayName = `${rootPkg.name}@${rootPkg.version}`;
	let pkgs = options.pkgs;
	const rootPkgDependencies = dependencies(rootPkg, options, context.nested, options.rootFields);
	options.rootPkgDependencies = rootPkgDependencies;
	options.resolution = createResolution(rootPkg, options);
	if (pkgs.length === 0) {
		if (options.production) {
			pkgs = rootPkgDependencies.prod;
		} else {
			pkgs = rootPkgDependencies.all;
		}
		debug(
			`about to locally install pkgs (production: ${options.production}, rootFields: ${options.rootFields}): ${JSON.stringify(pkgs, null, 2)}`
		);
	} else {
		// try to fix no version package from rootPkgDependencies
		const allDeps = rootPkgDependencies.allMap;
		for (const childPkg of pkgs) {
			if (!childPkg.version && allDeps[childPkg.name]) {
				childPkg.version = allDeps[childPkg.name];
				debug("auto fill version: %j", childPkg);
			}
		}
	}

	if (options.installRoot) await removeLegacyLayout(options);

	context.nested.update(
		pkgs.map(pkg => `${pkg.name}@${pkg.version}`),
		rootPkg.name && rootPkg.version ? displayName : "root"
	);
	const nodeModulesDir = path.join(options.targetDir, "node_modules");
	await utils.mkdirp(nodeModulesDir);
	const rootPkgsMap = new Map();
	const mapper = async childPkg => {
		childPkg.name = childPkg.name || "";
		rootPkgsMap.set(childPkg.name, true);
		options.progresses.installTasks++;
		await installOne(options.targetDir, childPkg, options, context);
	};

	await pMap(pkgs, mapper, 10);
	options.downloadFinished = Date.now();
	if (options.spinner) options.spinner.succeed(`Installed ${pkgs.length} packages`);

	// dedupe mode https://docs.npmjs.com/cli/dedupe
	// link every packages' latest version to target directory
	// won't override exists target directory
	await linkAllLatestVersion(rootPkgsMap, options);

	// link peerDependencies if not match the version in target directory
	await linkPeer(options);

	// 依赖脚本在整棵树(含根目录的最高版本链接与 peer 链接)就位后运行
	await runDependencyScripts(options);
	if (options.spinner) options.spinner.succeed(`Run ${options.runscriptCount} scripts`);
	// 有失败时保留本次运行全部阶段标记, 下次运行经由上层包找到失败的包
	if (options.failures.length === 0) await clearInstallStages(options);

	// 根包的 preinstall / install / postinstall 与 npm 7+ 一致在依赖全部安装后运行, 之后是 prepublish / prepare(非 production)
	// see:
	// - https://docs.npmjs.com/misc/scripts
	// - https://github.com/npm/npm/issues/3059#issuecomment-32057292
	// 根包脚本通常依赖已安装的依赖, 有依赖失败时跳过, 下次运行成功后再执行
	if (options.installRoot) {
		if (options.failures.length > 0) {
			options.console.warn(
				chalk.yellow(
					"[npd:runscript] skip %s lifecycle scripts because %s package(s) failed"
				),
				displayName,
				options.failures.length
			);
		} else {
			try {
				if (!options.ignoreScripts)
					await runPackageScripts(rootPkg, options.root, displayName, options);
				if (!options.production) {
					await prepublish(rootPkg, options.root, options);
					await prepare(rootPkg, options.root, options);
				}
			} catch (err) {
				options.failures.push({ displayName, error: err });
			}
		}
	}

	await validatePeer(options);

	// print all pending messages
	printPendingMessages(options);

	// record and print recently update modules
	recordRecentlyUpdates(options);

	// record all installed packages' versions
	recordPackageVersions(options);

	// record dependencies tree resolved from npm
	printOptionalFailures(options);
	const scriptPolicyError = allowScripts.report(options);
	if (scriptPolicyError)
		options.failures.push({ displayName: "allowScripts", error: scriptPolicyError });
	if (options.failures.length > 0) {
		throw utils.installFailuresError(options.failures);
	}

	// print install finished
	finishInstall(options);
}

async function installOne(parentDir, childPkg, options, context) {
	if (!(await needInstall(parentDir, childPkg, options))) {
		options.progresses.finishedInstallTasks++;
		options.console.info(
			chalk.gray(
				`[${options.progresses.finishedInstallTasks}/${options.progresses.installTasks}]`
			),
			chalk.cyan("Package "),
			chalk.gray(childPkg.name + "@" + childPkg.version),
			chalk.cyan("is skipped because it already exists at:"),
			path.join(parentDir, "node_modules", childPkg.alias || childPkg.name)
		);
		return;
	}

	const res = await install(parentDir, childPkg, [], options, context);
	options.progresses.finishedInstallTasks++;
	if (res) {
		options.console.info(
			"[%s/%s] %s %s at %s",
			options.progresses.finishedInstallTasks,
			options.progresses.installTasks,
			chalk.gray(childPkg.name + "@" + childPkg.version),
			res.exists ? chalk.cyan("existed") : chalk.green("installed"),
			path.relative(parentDir, res.dir)
		);
	}
}

async function needInstall(parentDir, childPkg, options) {
	// always install if not install from package.json
	if (!options.installRoot || options.rebuild) return true;

	const pkgDir = path.join(parentDir, "node_modules", childPkg.alias || childPkg.name);
	const pkg = await utils.readJSON(path.join(pkgDir, "package.json"));
	try {
		if (
			pkg.name &&
			pkg.version &&
			childPkg.version &&
			!(await utils.isInstallUnfinished(pkgDir))
		) {
			// 启用锁文件时已装的根依赖仍要走一遍安装, 否则子依赖不会按锁定版本校正, 也不会记进 np-lock.json; 已装的就是锁定版本时只是不删链接
			const locked =
				options.lockPackages &&
				npLock.lookup(
					options.cache.dependenciesTree,
					`${childPkg.name}@${childPkg.version}`
				);
			// 声明从 git / url / 本地路径改回 registry 版本时, 版本满足范围的旧包也要换成 registry 包
			if (
				semver.validRange(childPkg.version, true) &&
				semver.satisfies(pkg.version, childPkg.version) &&
				!utils.isNonRegistryInstall(pkg)
			) {
				if (!options.lockPackages) return false;
				if (locked && locked.version === pkg.version) return true;
			}
			// git 与 tarball url 依赖: 已装的就是锁定的 commit 或 url; 锁文件里的地址去掉了凭据
			if (
				locked &&
				locked._resolved &&
				utils.stripUrlAuth(pkg._resolved) === utils.stripUrlAuth(locked._resolved)
			) {
				return true;
			}
		}
	} catch (err) {
		// ignore, maybe pkg.version invalid
		debug("[%s@%s] version invalid: %s", pkg.name, pkg.version, err);
	}
	// clean up
	if (childPkg.name) {
		await utils.rimraf(pkgDir);
	}
	return true;
}

async function checkLinkPeerDependencies(params, options) {
	const parentDir = params.parentDir;
	const realPkg = params.realPkg;
	const realPkgDir = params.realPkgDir;

	let rootPkg = {};
	try {
		rootPkg = await utils.readJSON(
			path.join(options.targetDir, "node_modules", realPkg.name, "package.json")
		);
		if (rootPkg.version === realPkg.version) return;
	} catch {
		// ignore
	}
	options.console.warn(
		"%s %s in %s unmet with %s(%s)",
		chalk.yellow("peerDependencies link"),
		chalk.yellow(`${realPkg.name}@${realPkg.version}`),
		chalk.gray(parentDir),
		chalk.gray(path.join(options.targetDir, "node_modules", realPkg.name)),
		chalk.yellow(rootPkg.version || "-")
	);
	await bin(parentDir, realPkg, realPkgDir, options);
	await link(parentDir, realPkg, realPkgDir);
}

async function validatePeerDependencies(params, options) {
	const parentDir = params.parentDir;

	const peerDependencies = params.peerDependencies;
	const names = Object.keys(peerDependencies);
	const cacheKey = `nodemodule:path:${parentDir}`;
	let paths = options.cache[cacheKey];
	if (!paths) {
		paths = options.cache[cacheKey] = Module._nodeModulePaths(parentDir);
	}
	for (const name of names) {
		const expectVersion = peerDependencies[name];
		const realPkg = await utils.getPkgFromPaths(name, paths);
		if (!realPkg) {
			options.console.warn(
				"%s %s requires a peer of %s but none was installed",
				chalk.red("peerDependencies WARNING"),
				chalk.gray(params.displayName),
				chalk.yellow(`${name}@${expectVersion}`)
			);
			continue;
		}
		if (!semver.satisfies(realPkg.version, expectVersion)) {
			options.console.warn(
				"%s %s requires a peer of %s but %s was installed",
				chalk.red("peerDependencies WARNING"),
				chalk.gray(params.displayName),
				chalk.yellow(`${name}@${expectVersion}`),
				chalk.yellow(`${name}@${realPkg.version}`)
			);
			continue;
		}
		debug(
			"%s requires a peer of %s and %s was installed at %s",
			chalk.green(params.displayName),
			chalk.green(`${name}@${expectVersion}`),
			chalk.green(`${name}@${realPkg.version}`),
			realPkg.installPath
		);
	}
}

async function linkAllLatestVersion(rootPkgsMap, options) {
	if (options.latestVersions.size > 0) {
		const mapper = async ([name, version]) => {
			if (!rootPkgsMap.has(name)) {
				options.progresses.linkTasks++;
				// link latest package to `storeDir/node_modules`
				await linkLatestVersion({ name, version }, options.storeDir, options);
			}
		};
		await pMap(options.latestVersions, mapper, 20);
	}
	if (options.spinner)
		options.spinner.succeed(`Linked ${options.latestVersions.size} latest versions`);
}

// 根目录直接依赖与提升链接都指向 .npd/_name@ver@name, 只能按 package.json 声明名单区分, 声明过的包永不覆盖
function isDeclaredRootPkg(name, options) {
	const { rootPkgDependencies } = options;
	return name in rootPkgDependencies.allMap;
}

// 完整安装时指向本 storeDir 下 .npd/_name@ver@name 的链接视为上次的提升结果, 直接更新为本次依赖树中的最高版本
async function isHoistedLink(pkg, linkDir, storeDir, options) {
	if (options.pkgs.length > 0) return false;
	try {
		const target = path.resolve(path.dirname(linkDir), await fs.readlink(linkDir));
		const parsed = utils.parsePackageStorePath(target);
		// scope 包的版本目录多一层: .npd/_@scope_name@ver@@scope/name
		const entryDir = pkg.name.startsWith("@")
			? path.dirname(path.dirname(target))
			: path.dirname(target);
		return (
			!!parsed &&
			parsed.name === pkg.name &&
			entryDir === path.resolve(utils.getPackagesDir(storeDir))
		);
	} catch {
		return false;
	}
}

async function shouldOverrideLink(pkg, linkDir, storeDir, options) {
	if (isDeclaredRootPkg(pkg.name, options)) return false;
	if (await isHoistedLink(pkg, linkDir, storeDir, options)) return true;

	const pkgJSONPath = path.join(linkDir, "package.json");
	try {
		const pkgJSON = await utils.readJSON(pkgJSONPath);
		if (semver.gt(pkg.version, pkgJSON.version)) {
			// pkg is the newer version
			return true;
		}

		return false;
	} catch {
		return true;
	}
}

async function linkLatestVersion(pkg, storeDir, options) {
	const linkDir = path.join(storeDir, pkg.name);
	if (
		(await utils.exists(linkDir)) &&
		!(await shouldOverrideLink(pkg, linkDir, storeDir, options))
	) {
		options.progresses.finishedLinkTasks++;
		return debug(
			"[%s/%s] %s already exists",
			options.progresses.finishedLinkTasks,
			options.progresses.linkTasks,
			linkDir
		);
	}
	await utils.rimraf(linkDir); // make sure to delete linkDir
	await utils.mkdirp(path.dirname(linkDir));
	const realDir = options.latestPackages.get(pkg.name);
	const relative = await utils.forceSymlink(realDir, linkDir);
	options.progresses.finishedLinkTasks++;
	debug(
		"[%s/%s] %s@%s link %s => %s",
		options.progresses.finishedLinkTasks,
		options.progresses.linkTasks,
		pkg.name,
		pkg.version,
		linkDir,
		relative
	);
}

// 0.0.6 及更早版本把包版本目录直接放在 node_modules 下: 完整安装前删掉旧目录, 指向它们的顶层链接与 .bin 入口, 以及旧的状态文件,
// 随后按 node_modules/.npd 下的新位置重新安装(tarball 仍在磁盘缓存中, 不重新下载); 只装指定包时不迁移, 旧目录照常可用
async function removeLegacyLayout(options) {
	const realDir = await fs.realpath(options.storeDir).catch(() => null);
	if (!realDir) return;
	const names = await fs.readdir(realDir);
	const legacy = new Set(names.filter(name => name.startsWith("_") && name.includes("@")));
	if (legacy.size === 0) return;
	options.console.warn(
		chalk.yellow(
			"[npd:migrate] move %s package folder(s) from node_modules/_<name>@<version>@<name> to node_modules/.npd, installing them again"
		),
		legacy.size
	);
	const pointsToLegacy = async file => {
		const stat = await fs.lstat(file).catch(() => null);
		if (!stat || !stat.isSymbolicLink()) return false;
		const target = await fs.realpath(file).catch(() => null);
		if (!target) return false;
		const relative = path.relative(realDir, target);
		return (
			!relative.startsWith("..") &&
			!path.isAbsolute(relative) &&
			legacy.has(relative.split(path.sep)[0])
		);
	};
	const stale = [];
	for (const name of names) {
		if (legacy.has(name)) continue;
		const dir = path.join(realDir, name);
		let entries = [dir];
		if (name === ".bin" || name.startsWith("@")) {
			entries = (await fs.readdir(dir).catch(() => [])).map(sub => path.join(dir, sub));
		}
		for (const entry of entries) {
			if (await pointsToLegacy(entry)) stale.push(entry);
		}
	}
	for (const entry of stale) await utils.rimraf(entry);
	for (const name of legacy) await utils.rimraf(path.join(realDir, name));
	await utils.rimraf(path.join(realDir, ".npd-state.json"));
}

async function clearInstallStages(options) {
	await pMap(options.stagedDirs, dir => utils.setInstallStage(dir), 10);
	options.stagedDirs.clear();
}

// 可选依赖失败不影响安装结果, 也不会被之后的 npd 重试, 结束时集中提示
function printOptionalFailures(options) {
	const items = options.optionalFailures;
	if (items.length === 0) return;
	options.console.warn(
		chalk.yellow("%s optional package(s) failed and were skipped:"),
		items.length
	);
	for (const { displayName, error } of items) {
		options.console.warn(
			chalk.yellow("  - %s: %s"),
			displayName,
			String(error.message).split("\n")[0]
		);
	}
	const names = [...new Set(items.filter(item => item.name).map(item => item.name))];
	if (names.length > 0) {
		options.console.warn(
			chalk.yellow("rerun their scripts with: npd-x rebuild %s"),
			names.join(" ")
		);
	}
}

function printPendingMessages(options) {
	for (const item of options.pendingMessages) {
		if (options.console[item[0]] && options.console[item[0]] !== debug) {
			options.console[item[0]](...item.slice(1));
		}
	}
}

async function linkPeer(options) {
	// only when root dependencies unmet peer dependencies
	// link the matched one as a dependencies
	// ensure peer dependencies flatten by default
	if (options.linkPeerDependencies.length) {
		await Promise.all(
			options.linkPeerDependencies.map(item => checkLinkPeerDependencies(item, options))
		);
	}
}

async function validatePeer(options) {
	if (options.peerDependencies.length) {
		await Promise.all(
			options.peerDependencies.map(item => validatePeerDependencies(item, options))
		);
	}
}

function recordRecentlyUpdates(options) {
	if (options.recentlyUpdates.size > 0) {
		const since = dayjs(options.recentlyUpdateMinDateTime).format("YYYY-MM-DD");
		const recentlyUpdatesTextFile = path.join(options.storeDir, ".recently_updates.txt");
		let recentlyUpdatesText = `Recently updated (since ${since})`;
		console.info(
			"%s: %s %s",
			chalk.gray(recentlyUpdatesText),
			`${chalk.green(options.recentlyUpdates.size)} packages`,
			chalk.gray(`(see details in ${recentlyUpdatesTextFile})`)
		);
		const displays = {};
		for (const item of options.recentlyUpdates) {
			const name = item[0];
			const publishDate = dayjs(item[1]);
			const key = publishDate.format("YYYY-MM-DD");
			const list = displays[key] || [];
			list.push(`${name} ${chalk.gray(publishDate.format("(HH:mm:ss)"))}`);
			displays[key] = list;
		}

		const today = dayjs().format("YYYY-MM-DD");
		const keys = Object.keys(displays).sort((a, b) => {
			return a > b ? -1 : 1;
		});

		recentlyUpdatesText += "\n";
		for (const key of keys) {
			const isToday = key === today;
			const label = isToday ? "Today:" : key;
			const logToConsole =
				!options.onlyShowTodayUpdateToConsole ||
				(options.onlyShowTodayUpdateToConsole && isToday);
			const text = `  ${label}`;
			recentlyUpdatesText += `${text}\n`;

			if (logToConsole) console.info(chalk.gray(text));
			const list = displays[key];
			for (const message of list) {
				const text = `    ${chalk.green("→")} ${message}`;
				recentlyUpdatesText += `${text}\n`;

				if (logToConsole) console.info(text);
			}
		}
		writeFileSync(recentlyUpdatesTextFile, recentlyUpdatesText);
	}
}

function recordPackageVersions(options) {
	if (!options.installRoot) return;
	const versions = {};
	for (const pkg in options.packageVersions) {
		versions[pkg] = Array.from(options.packageVersions[pkg]);
	}
	const packageVersionsFile = path.join(options.storeDir, ".package_versions.json");
	writeFileSync(packageVersionsFile, JSON.stringify(versions, null, 2));
}

function finishInstall(options) {
	const totalUse = Date.now() - options.start;
	const downloadUse = options.downloadFinished - options.start;
	const totalSize = options.totalTarballSize + options.totalJSONSize;
	const avgSpeed = utils.averageSpeed(totalSize, downloadUse);
	const logArguments = [
		chalk[options.detail ? "green" : "white"](
			"All packages installed (%s%s%s%sused %s(network %s), speed %s/s, json %s(%s), tarball %s, manifests cache hit %s, etag hit %s / miss %s)"
		),
		options.registryPackages
			? `${options.registryPackages} packages installed from npm registry, `
			: "",
		options.remotePackages
			? `${options.remotePackages} packages installed from remote url, `
			: "",
		options.localPackages
			? `${options.localPackages} packages installed from local file, `
			: "",
		options.gitPackages ? `${options.gitPackages} packages installed from git, ` : "",
		ms(totalUse),
		ms(downloadUse),
		bytes(avgSpeed),
		options.totalJSONCount,
		bytes(options.totalJSONSize),
		bytes(options.totalTarballSize),
		options.totalCacheJSONCount,
		options.totalEtagHitCount,
		options.totalEtagMissCount,
	];
	if (options.spinner) {
		options.spinner.succeed(util.format(...logArguments));
	} else {
		options.console.info(...logArguments);
	}
}
