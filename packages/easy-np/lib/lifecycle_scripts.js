const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");
const chalk = require("chalk");
const npa = require("npm-package-arg");
const ms = require("ms");
const { LOCAL_TYPES } = require("./npa_types");
const utils = require("./utils");
const { BINARY_ATTEMPTS } = require("./get");
const { useBinarySource } = require("./download/npm");
const allowScripts = require("./allow_scripts");

// scripts that should run in root package and linked package
exports.DEFAULT_ROOT_SCRIPTS = [
	"preinstall",
	"install",
	"postinstall",
	"prepublish",
	"preprepare",
	"prepare",
	"postprepare",
];

// scripts that should run in dependencies
exports.DEFAULT_DEP_SCRIPTS = ["preinstall", "install", "postinstall"];

// stage: 依赖包上次停在的阶段, 从该脚本继续并逐个推进阶段标记; 根包不传, 不写标记
// source: 不传时按 originPkg 的声明推导来源, 本地包按根包执行; 传 { identity } 时只执行依赖脚本并按该身份审核, identity 为 null 不审核
// 返回可选依赖第一个失败的脚本名, 其余失败直接抛出
exports.runLifecycleScripts = async function runLifecycleScripts(
	pkg,
	root,
	originPkg,
	displayName,
	globalOptions,
	stage,
	source
) {
	const scripts = pkg.scripts || {};

	// https://docs.npmjs.com/misc/scripts#default-values
	// "install": "node-gyp rebuild"
	// If there is a binding.gyp file in the root of your package,
	// npm will default the install command to compile using node-gyp.
	if (!scripts.install && (await utils.exists(path.join(root, "binding.gyp")))) {
		globalOptions.console.info(
			'[np:runscript] %s found binding.gyp file, auto run "node-gyp rebuild", root: %j',
			displayName,
			root
		);
		scripts.install = "node-gyp rebuild";
	}

	let scriptList = exports.DEFAULT_DEP_SCRIPTS;
	let runInForeground = !!globalOptions.foregroundScripts;
	const isRoot = root === globalOptions.root && !globalOptions.global;
	const originType = isRoot || source ? null : typeOf(originPkg);
	if (isRoot || LOCAL_TYPES.includes(originType)) {
		scriptList = exports.DEFAULT_ROOT_SCRIPTS;
		runInForeground = true;
	} else {
		const pending = scriptList.filter(script => scripts[script]);
		const identity = source
			? source.identity
			: allowScripts.identityOf(originType, pkg, originPkg.version);
		if (
			pending.length > 0 &&
			!allowScripts.allow(globalOptions, identity, {
				displayName,
				name: pkg.name,
				scripts: pending,
			})
		) {
			return undefined;
		}
	}

	// 依赖的安装脚本会自行下载二进制, 失败时切换二进制镜像与官方地址重试
	const mirrorState = scriptList === exports.DEFAULT_DEP_SCRIPTS && globalOptions.mirror;
	const binarySource = { current: mirrorState && mirrorState.binaryOrder[0] };

	// 可选依赖的脚本失败后继续执行后续脚本, 但阶段停在第一个失败的脚本, 下次运行重试
	let failedScript;
	for (const script of scriptList.slice(Math.max(scriptList.indexOf(stage), 0))) {
		const cmd = scripts[script];
		if (!cmd) {
			continue;
		}

		if (stage) await utils.setInstallStage(root, script);
		if (runInForeground)
			console.info("> %s %s %s %s> %s", displayName, script, root, os.EOL, cmd);
		const startTime = Date.now();
		try {
			await runScriptWithMirrors(
				root,
				cmd,
				displayName,
				script,
				binarySource,
				globalOptions,
				runInForeground
			);
		} catch (error) {
			globalOptions.console.warn(
				"[np:runscript:error] %s run %s %s error: %s",
				chalk.red(displayName),
				script,
				cmd,
				error
			);
			if (originPkg.optional) {
				globalOptions.console.warn(
					chalk.red("%s optional error: %s"),
					displayName,
					error.stack
				);
				failedScript = failedScript || script;
				continue;
			}
			error.message = `run ${script} error\n${error.message}`;
			throw error;
		} finally {
			const ts = Date.now() - startTime;
			if (runInForeground)
				console.info("> %s %s, finished in %s", displayName, script, ms(ts));
			globalOptions.runscriptCount += 1;
			globalOptions.runscriptTime += ts;
		}
	}
	return failedScript;
};

// 依赖的生命周期脚本延后到整棵树链接完成后统一运行, 与 npm(arborist reify 的 _build)一致: 运行时兄弟依赖与 peer 依赖都已就位.
// 同一个 store 目录只运行一次; task: { pkg, dir, origin, displayName, failureName, stage, skip, source, deps }
exports.queueDependencyScripts = (options, task) => {
	if (!options.scriptTasks.has(task.dir)) options.scriptTasks.set(task.dir, task);
};

const SCRIPT_CONCURRENCY = 10;

// 子依赖的脚本先于依赖它的包运行, 互不依赖的包并发运行; 依赖成环时按入队顺序先运行一个解开
exports.runDependencyScripts = async options => {
	const tasks = [...options.scriptTasks.values()];
	options.scriptTasks.clear();
	if (tasks.length === 0) return;
	const byDir = new Map(tasks.map(task => [task.dir, task]));
	const waiting = new Map();
	const dependents = new Map();
	for (const task of tasks) {
		const deps = new Set(task.deps.filter(dir => dir !== task.dir && byDir.has(dir)));
		waiting.set(task, deps.size);
		for (const dir of deps) {
			if (!dependents.has(dir)) dependents.set(dir, []);
			dependents.get(dir).push(task);
		}
	}
	const ready = tasks.filter(task => waiting.get(task) === 0);
	const started = new Set();
	const skippedOptionals = new Set(options.skippedOptionalDirs);
	let running = 0;
	let cursor = 0;

	await new Promise((resolve, reject) => {
		const start = task => {
			started.add(task);
			running++;
			runDependencyScript(task, options, skippedOptionals).then(() => {
				running--;
				for (const dependent of dependents.get(task.dir) || []) {
					waiting.set(dependent, waiting.get(dependent) - 1);
					if (waiting.get(dependent) === 0) ready.push(dependent);
				}
				next();
			}, reject);
		};
		const next = () => {
			while (running < SCRIPT_CONCURRENCY && ready.length > 0) {
				const task = ready.shift();
				if (!started.has(task)) start(task);
			}
			if (running > 0) return;
			while (cursor < tasks.length && started.has(tasks[cursor])) cursor++;
			if (cursor < tasks.length) start(tasks[cursor]);
			else resolve();
		};
		next();
	});
};

// 按普通依赖需要, 或所在的可选依赖本身在别处按普通依赖需要时, 脚本失败不能当作可选依赖失败跳过
function requiredDir(options, dir, seen = new Set()) {
	if (seen.has(dir)) return false;
	seen.add(dir);
	const need = options.scriptNeeds.get(dir);
	if (!need || need.required) return true;
	for (const root of need.roots.keys()) {
		if (root !== dir && requiredDir(options, root, seen)) return true;
	}
	return false;
}

// 回退目录, public-hoist-pattern 提升到根目录与 workspace 根目录的链接按包名统一创建, 只撤掉指向被跳过目录的那些
async function removeHoistedLinks(name, dir, options) {
	const nodeModulesDirs = [path.join(options.storeDir, ".store/node_modules"), options.storeDir];
	if (options.enableWorkspace && options.isWorkspacePackage) {
		nodeModulesDirs.push(path.join(options.workspaceRoot, "node_modules"));
	}
	const realDir = await fs.realpath(dir).catch(() => dir);
	for (const nodeModulesDir of nodeModulesDirs) {
		const linkDir = path.join(nodeModulesDir, name);
		if (!(await utils.isStoreLink(linkDir))) continue;
		if ((await fs.realpath(linkDir).catch(() => null)) === realDir) await utils.rimraf(linkDir);
	}
}

async function runDependencyScript(task, options, skippedOptionals) {
	// 不执行脚本(--ignore-scripts, 上次已完成自身步骤)的包只为保持依赖顺序而排队
	if (task.skip) {
		await utils.setInstallStage(task.dir, utils.FINISH_INSTALL_STAGE);
		options.stagedDirs.add(task.dir);
		return;
	}
	const required = requiredDir(options, task.dir);
	const roots = required ? [] : [...options.scriptNeeds.get(task.dir).roots];
	// 需要它的可选依赖都已因其中某个包的脚本失败被跳过
	if (roots.length > 0 && roots.every(([dir]) => skippedOptionals.has(dir))) return;
	// 包自身是可选依赖时脚本失败只记下失败的脚本, 包保留, 可用 np-x rebuild 重跑
	const origin = {
		...task.origin,
		optional: !required && roots.some(([dir]) => dir === task.dir),
	};
	let failedScript;
	try {
		failedScript = await exports.runLifecycleScripts(
			task.pkg,
			task.dir,
			origin,
			task.displayName,
			options,
			task.stage,
			task.source
		);
	} catch (err) {
		if (!required) {
			// 与 npm 一样整体跳过所在的可选依赖: 撤掉它的链接与 bin, 阶段标记保留, 下次运行重试
			for (const [dir, { name, displayName }] of roots) {
				if (skippedOptionals.has(dir)) continue;
				skippedOptionals.add(dir);
				options.console.error(
					chalk.yellow(`[${displayName}] optional install error: ${err.stack}`)
				);
				options.optionalFailures.push({ displayName, error: err });
				for (const { linkDir, binDir } of options.optionalLinks.get(dir) || []) {
					await utils.removeStaleBins(linkDir, {}, binDir);
					await utils.rimraf(linkDir);
				}
				await removeHoistedLinks(name, dir, options);
			}
			return;
		}
		// 不中止其余脚本: 阶段停在失败的脚本, 安装结束时汇总并以失败退出
		options.failures.push({ displayName: task.failureName, error: err });
		options.console.error(
			chalk.red("[np:install:error] %s: %s"),
			task.failureName,
			err.message
		);
		return;
	}
	// 可选依赖的脚本失败时阶段停在失败的脚本, 不随本次运行清除, 下次运行重试
	await utils.setInstallStage(task.dir, failedScript || utils.FINISH_INSTALL_STAGE);
	if (failedScript) {
		options.optionalFailures.push({
			displayName: task.failureName,
			error: new Error(`run ${failedScript} error`),
			name: task.pkg.name,
		});
	} else {
		options.stagedDirs.add(task.dir);
	}
}

// 全局安装的包自身作为根传入, 没有依赖声明, 按 registry 包处理;
// 命令行直接安装本地目录时 name 为空, 拼成 `@../dir` 会被当作 tag 而按依赖处理
function typeOf(originPkg) {
	if (!originPkg.version) return "version";
	return npa(originPkg.name ? `${originPkg.name}@${originPkg.version}` : originPkg.version).type;
}

async function runScriptWithMirrors(
	root,
	cmd,
	displayName,
	script,
	binarySource,
	globalOptions,
	runInForeground
) {
	const mirrorState = binarySource.current && globalOptions.mirror;
	if (!mirrorState) {
		return await utils.runScript(root, cmd, globalOptions, runInForeground);
	}
	for (let attempt = 1; ; attempt++) {
		const env = { ...globalOptions.env };
		for (const key in mirrorState.binaryEnvs) delete env[key];
		if (binarySource.current === "mirror") Object.assign(env, mirrorState.binaryEnvs);
		try {
			return await utils.runScript(root, cmd, { ...globalOptions, env }, runInForeground);
		} catch (err) {
			if (attempt >= BINARY_ATTEMPTS) throw err;
			binarySource.current = mirrorState.binaryOrder.find(
				name => name !== binarySource.current
			);
			globalOptions.console.warn(
				chalk.yellow(
					"[np:runscript] %s %s failed, retry with %s binary source (%s/%s): %s"
				),
				displayName,
				script,
				binarySource.current,
				attempt + 1,
				BINARY_ATTEMPTS,
				err.message
			);
			await useBinarySource(root, binarySource.current, globalOptions);
		}
	}
}
