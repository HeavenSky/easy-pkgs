// np-x prune: 从根目录与各 workspace 的 node_modules 出发沿链接遍历, 删除 .np 中不再被引用的 <name>@<version> 目录
const path = require("node:path");
const fs = require("node:fs/promises");
const utils = require("./utils");
const installState = require("./install_state");
const planManifestPrune = require("./prune_manifest");

// 不属于任何包版本的条目: 最高版本回退链接目录, 状态文件, git / tarball 依赖的临时目录
const RESERVED_ENTRIES = new Set(["node_modules", ".np-state.json", ".tmp"]);

module.exports = async ({ root, dryRun = false, only = [] }) => {
	const { workspaceRoots } = await utils.readWorkspaces(root);
	const projects = [root, ...workspaceRoots.filter(dir => dir !== root)];
	// 链接的 realpath 都是真实路径, root 或 node_modules 经符号链接访问时 storeRoot 不取真实路径会把全部条目判为不可达
	const storePath = path.join(root, "node_modules", utils.STORE_DIR);
	const storeRoot = await fs.realpath(storePath).catch(() => storePath);
	let entries;
	try {
		entries = (await fs.readdir(storeRoot)).filter(entry => !RESERVED_ENTRIES.has(entry));
	} catch (error) {
		if (!only.length) return { removed: [], kept: 0, links: [] };
		if (error.code !== "ENOENT") throw error;
		entries = [];
	}

	const hoistDir = path.join(storeRoot, "node_modules");
	const { reachable, links } = only.length
		? await planManifestPrune({ projects, only, storeRoot, entries, hoistDir })
		: { reachable: await findReachable(projects, storeRoot), links: [] };
	const removed = entries.filter(entry => !reachable.has(entry)).sort();
	if (!dryRun) {
		for (const link of links) {
			await fs.unlink(link).catch(error => {
				if (error.code !== "ENOENT") throw error;
			});
		}
		await installState.removeEntries(
			storeRoot,
			entry => removed.includes(entry) || !entries.includes(entry)
		);
		for (const entry of removed) await utils.rimraf(path.join(storeRoot, entry));
		if (!only.length) await removeDanglingLinks(hoistDir);
	}
	return { removed, kept: entries.length - removed.length, links };
};

async function findReachable(projects, storeRoot) {
	const reachable = new Set();
	const queue = [];
	const visitedDirs = new Set();
	// 扫描一个 node_modules 目录: 链接进 .np 的条目记为可达, 实体目录继续扫描其内部的 node_modules
	const scan = async dir => {
		if (visitedDirs.has(dir)) return;
		visitedDirs.add(dir);
		let names;
		try {
			names = await fs.readdir(dir);
		} catch {
			return;
		}
		for (const name of names) {
			if (name === utils.STORE_DIR || name === ".bin") continue;
			const full = path.join(dir, name);
			if (name.startsWith("@")) {
				await scan(full);
				continue;
			}
			let stat;
			try {
				stat = await fs.lstat(full);
			} catch {
				continue;
			}
			if (stat.isSymbolicLink()) {
				const target = await fs.realpath(full).catch(() => null);
				if (!target) continue;
				const relative = path.relative(storeRoot, target);
				if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
					const entry = relative.split(path.sep)[0];
					if (!reachable.has(entry)) {
						reachable.add(entry);
						queue.push(path.join(storeRoot, entry, "node_modules"));
					}
				} else {
					// 本地目录依赖链接到项目外, 它自己的 node_modules 里同样可能链接进 .np
					await scan(path.join(target, "node_modules"));
				}
			} else if (stat.isDirectory()) {
				await scan(path.join(full, "node_modules"));
			}
		}
	};

	for (const dir of projects) {
		await scan(path.join(dir, "node_modules"));
	}
	while (queue.length > 0) await scan(queue.shift());
	return reachable;
}

// 回退目录里指向已删除版本的链接一并移除, 否则 peerDependencies 回退解析会指向不存在的目录
async function removeDanglingLinks(dir) {
	let names;
	try {
		names = await fs.readdir(dir);
	} catch {
		return;
	}
	for (const name of names) {
		const full = path.join(dir, name);
		if (name.startsWith("@")) {
			await removeDanglingLinks(full);
			continue;
		}
		const stat = await fs.lstat(full).catch(() => null);
		if (stat && stat.isSymbolicLink() && !(await utils.exists(full))) await fs.unlink(full);
	}
}
