// np-x prune: 删除 .np 中不再被任何链接引用的包版本目录
const path = require("node:path");
const chalk = require("chalk");
const parseArgs = require("minimist");
const utils = require("../utils");
const prune = require("../prune");
const help = require("./help");
const { parseDepTypes } = require("../dependency_types");

module.exports = async function pruneCommand(args) {
	try {
		await main(args);
	} catch (err) {
		utils.exitWithError("np-x prune", err);
	}
};

async function main(args) {
	utils.rejectRemovedArgs(args, { root: "run np-x prune in that folder instead" });
	const argv = parseArgs(args, {
		boolean: ["help", "version", "dry-run", "global", "prod"],
		string: ["only"],
		alias: { h: "help", v: "version", g: "global" },
		unknown: arg => {
			if (arg.startsWith("-")) throw utils.userError(`Unknown option: ${arg}`);
			return true;
		},
	});
	if (argv.version) {
		console.log(`np-x v${require("../../package.json").version}`);
		return;
	}
	if (argv.help) {
		console.log(help.prune());
		return;
	}
	if (argv.global) {
		throw utils.userError("-g is not supported, global packages have no shared .np");
	}
	if (argv._.length) throw utils.userError("prune does not take package names");
	if (args.some(arg => /^--prod=(?!true$|false$)/.test(arg))) {
		throw utils.userError("--prod takes true or false");
	}
	const only = parseDepTypes(argv.only, "--only");
	if (argv.only !== undefined && only.length === 0) {
		throw utils.userError("--only needs at least one dependency type, e.g. --only=prod");
	}
	if (argv.prod && !only.includes("prod")) only.push("prod");
	// 在 workspace 目录中运行时回收整个项目的 .np
	const { root } = await utils.resolveProjectRoot();
	const dryRun = argv["dry-run"];
	const { removed, kept, links } = await prune({ root, dryRun, only });
	for (const link of links) {
		console.log(
			"%s %s",
			dryRun ? "would remove" : chalk.gray("removed"),
			path.relative(root, link)
		);
	}
	for (const entry of removed) {
		console.log("%s %s", dryRun ? "would remove" : chalk.gray("removed"), entry);
	}
	console.log(
		"%s %s unreferenced package version(s) in %s, kept %s",
		dryRun ? "Found" : "Removed",
		removed.length,
		path.join(root, "node_modules", utils.STORE_DIR),
		kept
	);
}
