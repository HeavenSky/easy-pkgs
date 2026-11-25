// 按项目声明和已安装链接规划清理, 完整预览后才修改文件
const fs = require("node:fs/promises");
const path = require("node:path");
const { _nodeModulePaths } = require("node:module");
const { TYPE_FIELDS, fieldOf } = require("./dependency_types");
const { findBinsPointingTo, userError } = require("./utils");

const runtimeFields = ["dependencies", "optionalDependencies", "peerDependencies"];
const hasOwn = (pkg, field) => Object.prototype.hasOwnProperty.call(pkg, field);
const packageName = /^(?:@[^./\\][^/\\]*\/)?[^@./\\][^/\\]*$/;

function ignoreMissing(error) {
	if (!["ENOENT", "ENOTDIR"].includes(error.code)) throw error;
}

const realpath = file => fs.realpath(file).catch(ignoreMissing);

async function readManifest(dir, required = false) {
	const file = path.join(dir, "package.json");
	const data = await fs.readFile(file, "utf8").catch(ignoreMissing);
	if (data === undefined && !required) return {};
	try {
		const pkg = JSON.parse(data);
		if (pkg && typeof pkg === "object" && !Array.isArray(pkg)) return pkg;
	} catch {
		// 损坏或缺失的项目声明不能作为空依赖表执行清理
	}
	throw userError(`Cannot read a valid package.json in ${dir}`);
}

async function packageEntries(dir) {
	const entries = (await fs.readdir(dir, { withFileTypes: true }).catch(ignoreMissing)) || [];
	return entries.filter(
		entry => !entry.name.startsWith(".") && (entry.isDirectory() || entry.isSymbolicLink())
	);
}

async function listPackages(dir) {
	const packages = [];
	for (const entry of await packageEntries(dir)) {
		const full = path.join(dir, entry.name);
		if (entry.name.startsWith("@")) {
			for (const child of await packageEntries(full)) {
				packages.push({
					link: path.join(full, child.name),
					removable: entry.isDirectory() && child.isSymbolicLink(),
				});
			}
		} else {
			packages.push({ link: full, removable: entry.isSymbolicLink() });
		}
	}
	return packages;
}

async function resolveDependency(dir, name) {
	if (!packageName.test(name)) return;
	for (const modules of _nodeModulePaths(dir)) {
		const link = path.join(modules, name);
		if (await realpath(link)) return link;
	}
}

function dependencyNames(pkg, fields) {
	return new Set(fields.flatMap(field => Object.keys(pkg[field] || {})));
}

module.exports = async function planManifestPrune({
	projects,
	only,
	storeRoot,
	entries,
	hoistDir,
}) {
	const fields = only.map(fieldOf);
	const manifests = new Map();
	for (const project of projects) {
		const dir = await fs.realpath(project);
		const pkg = await readManifest(dir, true);
		for (const field of fields) {
			if (
				hasOwn(pkg, field) &&
				(!pkg[field] || typeof pkg[field] !== "object" || Array.isArray(pkg[field]))
			) {
				throw userError(`${field} in ${dir}/package.json must be an object`);
			}
		}
		manifests.set(dir, pkg);
	}
	for (const type of only) {
		const field = fieldOf(type);
		if (!TYPE_FIELDS[type] && ![...manifests.values()].some(pkg => hasOwn(pkg, field))) {
			throw userError(`no ${field} in package.json for type "${type}"`);
		}
	}

	const entryNames = new Set(entries);
	const storeEntryOf = target => {
		const entry = path.relative(storeRoot, target).split(path.sep)[0];
		return entryNames.has(entry) ? entry : undefined;
	};
	const reachable = new Set();
	const retainedLinks = new Set();
	const visitedLinks = new Set();
	const visitedPackages = new Set();
	const visitedModuleDirs = new Set();
	const realParents = new Map();
	const projectPackages = new Map();
	const queue = [];
	const scanDirectory = async dir => {
		const physicalDir = await realpath(dir);
		if (!physicalDir || visitedModuleDirs.has(physicalDir)) return;
		visitedModuleDirs.add(physicalDir);
		for (const { link } of await listPackages(physicalDir)) queue.push(link);
	};
	const enqueueDeps = async (dir, names) => {
		for (const name of names) {
			const link = await resolveDependency(dir, name);
			if (link) queue.push(link);
		}
	};

	for (const [dir, pkg] of manifests) {
		const modules = await realpath(path.join(dir, "node_modules"));
		if (modules) {
			visitedModuleDirs.add(modules);
			const installed = await listPackages(modules);
			projectPackages.set(modules, installed);
			for (const { link, removable } of installed) {
				if (!removable) queue.push(link);
			}
		}
		const names = dependencyNames(pkg, fields);
		for (const name of names) {
			if (modules && packageName.test(name)) retainedLinks.add(path.join(modules, name));
		}
		await enqueueDeps(dir, names);
	}

	for (let index = 0; index < queue.length; index++) {
		const link = queue[index];
		const parent = path.dirname(link);
		if (!realParents.has(parent)) realParents.set(parent, await realpath(parent));
		const physicalParent = realParents.get(parent);
		if (!physicalParent) continue;
		const physicalLink = path.join(physicalParent, path.basename(link));
		if (visitedLinks.has(physicalLink)) continue;
		visitedLinks.add(physicalLink);
		retainedLinks.add(physicalLink);
		const target = await realpath(link);
		if (!target) continue;
		if ((await fs.lstat(physicalLink).catch(ignoreMissing))?.isSymbolicLink()) {
			const rawTarget = path.resolve(physicalParent, await fs.readlink(physicalLink));
			// 中间链接也必须保留, 否则最终目标还在时依赖仍会断开
			if (rawTarget !== target) queue.push(rawTarget);
		}
		if (visitedPackages.has(target)) continue;
		visitedPackages.add(target);
		const entry = storeEntryOf(target);
		if (entry) reachable.add(entry);
		if (entry && hoistDir) await scanDirectory(path.join(storeRoot, entry, "node_modules"));
		await scanDirectory(path.join(target, "node_modules"));
		// peer 及提升依赖可能只在上层目录有链接, 仅扫描包内部会漏掉它们
		const pkg = manifests.get(target) || (await readManifest(target));
		await enqueueDeps(target, dependencyNames(pkg, runtimeFields));
	}

	const binLinks = [];
	const packageLinks = [];
	for (const [modules, installed] of projectPackages) {
		const keptTargets = new Set();
		const removedLinks = [];
		for (const { link, removable } of installed) {
			const target = await realpath(link);
			if (!removable || retainedLinks.has(link)) {
				if (target) keptTargets.add(target);
			} else {
				removedLinks.push({ link, target });
			}
		}
		const removedDirs = new Set();
		for (const { link, target } of removedLinks) {
			packageLinks.push(link);
			removedDirs.add(link);
			if (!keptTargets.has(target)) {
				const rawTarget = path.resolve(path.dirname(link), await fs.readlink(link));
				removedDirs.add(rawTarget);
				if (target) removedDirs.add(target);
			}
		}
		binLinks.push(...(await findBinsPointingTo(path.join(modules, ".bin"), [...removedDirs])));
	}
	if (hoistDir) {
		for (const { link, removable } of await listPackages(hoistDir)) {
			if (!removable) continue;
			const target = await realpath(link);
			const entry = target && storeEntryOf(target);
			if (!target || (entry && !reachable.has(entry))) packageLinks.push(link);
		}
	}
	return { reachable, links: [...binLinks.sort(), ...packageLinks.sort()] };
};
