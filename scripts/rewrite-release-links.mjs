// 将 Release 正文中的仓库内链接转换为绝对地址, 只读 stdin 并写到 stdout.
//
// Usage:
//   node scripts/rewrite-release-links.mjs <源文档仓库路径> <发布提交>
//   node scripts/rewrite-release-links.mjs -h
//
// 环境变量:
//   GITHUB_REPOSITORY  GitHub 仓库, 格式为 owner/repo
//   GITHUB_SERVER_URL  GitHub 站点地址, 缺省为 https://github.com

import { readFileSync, realpathSync } from "node:fs";

const args = process.argv.slice(2);
if (args.length === 0 || (args.length === 1 && ["-h", "--help"].includes(args[0]))) {
	const source = readFileSync(realpathSync(process.argv[1]), "utf8");
	const header = source.match(/^(?:\/\/[^\n]*\n)+/)[0];
	process.stdout.write(header.replace(/^\/\/ ?/gm, ""));
	process.exit(args.length === 0 ? 2 : 0);
}

const [file, revision] = args;
const { GITHUB_REPOSITORY: repository, GITHUB_SERVER_URL: server = "https://github.com" } =
	process.env;
if (args.length !== 2 || args.some(arg => !arg || arg.startsWith("-")) || !repository) {
	console.error("需要源文档路径、发布提交和 GITHUB_REPOSITORY");
	process.exit(2);
}

const source = new URL(file, "https://repository.invalid/");
const ref = encodeURIComponent(revision);
const blobBase = new URL(`/${repository}/blob/${ref}/`, server);
const rawBase = new URL(`/${repository}/${ref}/`, "https://raw.githubusercontent.com");

const inlineLink =
	/(`+).*?\1(?!`)|(!?\[[^[\]\n]*\]\([ \t]*)(<[^>\n]+>|(?:\\[()]|\([^()\n]*\)|[^\s()\\])+)(?=[ \t)])/g;
const external = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;

function rewriteLink(whole, code, open, target) {
	if (code) return whole;
	const angleBrackets = target.startsWith("<");
	const destination = angleBrackets ? target.slice(1, -1) : target.replace(/\\([()])/g, "$1");
	if (external.test(destination)) return whole;

	const location = new URL(destination, source);
	const base = open.startsWith("!") ? rawBase : blobBase;
	const url = `${base.href}${location.pathname.slice(1)}${location.search}${location.hash}`;
	return open + (angleBrackets ? `<${url}>` : url.replaceAll("(", "%28").replaceAll(")", "%29"));
}

let fence;
const body = readFileSync(0, "utf8")
	.split("\n")
	.map(line => {
		const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
		if (fence) {
			if (marker && marker[1].startsWith(fence) && marker[2].trim() === "") fence = undefined;
			return line;
		}
		if (marker) {
			fence = marker[1];
			return line;
		}
		return line.replace(inlineLink, rewriteLink);
	})
	.join("\n");
process.stdout.write(body);
