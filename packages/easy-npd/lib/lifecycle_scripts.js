"use strict";

const path = require("path");
const fs = require("fs/promises");
const chalk = require("chalk");
const ms = require("ms");
const utils = require("./utils");
const mirror = require("./mirror");

// @see https://docs.npmjs.com/misc/scripts
exports.DEPENDENCY_SCRIPTS = ["preinstall", "install", "postinstall"];

// 从 stage 起依次执行包的 preinstall / install / postinstall, 每个脚本执行前把阶段标记推进到它; 根包不传 stage, 不写标记
// optional 为真时脚本失败只告警并继续执行后续脚本, 返回第一个失败的脚本名; 否则失败直接抛出
exports.runPackageScripts = async (pkg, root, displayName, options, stage, optional) => {
	const scripts = { ...pkg.scripts };

	// https://docs.npmjs.com/misc/scripts#default-values
	// "install": "node-gyp rebuild"
	// If there is a binding.gyp file in the root of your package,
	// npm will default the install command to compile using node-gyp.
	if (!scripts.install && (await utils.exists(path.join(root, "binding.gyp")))) {
		options.console.warn(
			'[npd:runscript] %s found binding.gyp file, auto run "node-gyp rebuild", root: %j',
			chalk.gray(displayName),
			root
		);
		scripts.install = "node-gyp rebuild";
	}

	const scriptList = exports.DEPENDENCY_SCRIPTS;
	let failedScript;
	for (const script of scriptList.slice(Math.max(scriptList.indexOf(stage), 0))) {
		const cmd = scripts[script];
		if (!cmd) continue;

		if (stage) await utils.setInstallStage(root, script);
		options.console.warn(
			"%s %s run %j, root: %j",
			chalk.yellow(`scripts.${script}`),
			chalk.gray(displayName),
			cmd,
			root
		);
		const start = Date.now();
		try {
			await mirror.runScript(root, cmd, options);
		} catch (err) {
			options.console.warn(
				"[npd:runscript:error] %s scripts.%s run %j error: %s",
				chalk.red(displayName),
				script,
				cmd,
				err
			);
			if (optional) {
				options.console.warn(chalk.red("%s optional error: %s"), displayName, err.stack);
				failedScript = failedScript || script;
				continue;
			}
			err.message = `run ${script} error\n${err.message}`;
			throw err;
		} finally {
			options.runscriptCount++;
		}
		options.console.warn(
			"%s %s finished in %s",
			chalk.yellow(`scripts.${script}`),
			chalk.gray(displayName),
			ms(Date.now() - start)
		);
	}
	return failedScript;
};

// 依赖的生命周期脚本延后到整棵树链接完成后统一运行, 与 npm(arborist reify 的 _build)及 easy-np 一致: 运行时兄弟依赖与 peer 依赖都已就位.
// 同一个包目录只运行一次; task: { pkg, dir, displayName, failureName, stage, skip, deps }
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

// 根目录下按包名统一创建的最高版本链接(lib/local_install.js linkAllLatestVersion), 只撤掉指向被跳过目录的那个
async function removeLatestLink(name, dir, options) {
	const linkDir = path.join(options.storeDir, name);
	const realDir = await fs.realpath(dir).catch(() => dir);
	try {
		if (!(await fs.lstat(linkDir)).isSymbolicLink()) return;
	} catch {
		return;
	}
	if ((await fs.realpath(linkDir).catch(() => null)) === realDir) await utils.rimraf(linkDir);
}

async function runDependencyScript(task, options, skippedOptionals) {
	// 不执行脚本(--ignore-scripts, 未放行, 上次已完成自身步骤)的包只为保持依赖顺序而排队
	if (task.skip) {
		await utils.setInstallStage(task.dir, utils.FINISH_INSTALL_STAGE);
		options.stagedDirs.add(task.dir);
		return;
	}
	const required = requiredDir(options, task.dir);
	const roots = required ? [] : [...options.scriptNeeds.get(task.dir).roots];
	// 需要它的可选依赖都已因其中某个包的脚本失败被跳过
	if (roots.length > 0 && roots.every(([dir]) => skippedOptionals.has(dir))) return;
	// 包自身是可选依赖时脚本失败只记下失败的脚本, 包保留, 可用 npd-x rebuild 重跑
	const optional = !required && roots.some(([dir]) => dir === task.dir);
	let failedScript;
	try {
		failedScript = await exports.runPackageScripts(
			task.pkg,
			task.dir,
			task.displayName,
			options,
			task.stage,
			optional
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
				await removeLatestLink(name, dir, options);
			}
			return;
		}
		// 不中止其余脚本: 阶段停在失败的脚本, 安装结束时汇总并以失败退出
		options.failures.push({ displayName: task.failureName, error: err });
		options.console.error(
			chalk.red("[npd:install:error] %s: %s"),
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
