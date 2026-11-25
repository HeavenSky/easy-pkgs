// npd-x prune: 删除 node_modules 中不再被任何链接引用的包版本目录
"use strict";

const path = require("path");
const chalk = require("chalk");
const parseArgs = require("minimist");
const prune = require("../prune");
const utils = require("../utils");
const help = require("./help");
const { parseDepTypes } = require("../dependency_types");

module.exports = async function pruneCommand(args) {
	try {
		await main(args);
	} catch (err) {
		utils.exitWithError("npd-x prune", err);
	}
};

async function main(args) {
	utils.rejectRemovedArgs(args, { root: "run npd-x prune in that folder instead" });
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
		console.log(`npd-x v${require("../../package.json").version}`);
		return;
	}
	if (argv.help) {
		console.log(help.prune());
		return;
	}
	if (argv.global) {
		throw utils.userError("-g is not supported, global packages are not supported");
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
	const root = process.cwd();
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
		path.join(root, "node_modules"),
		kept
	);
}
