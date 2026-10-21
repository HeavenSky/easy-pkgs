var assert = require("assert");
var path = require("path");
var spawnSync = require("child_process").spawnSync;
var describe = require("node:test").describe;
var it = require("node:test").it;

var bin = path.join(__dirname, "..", "bin", "gonzales.js");
var fixture = path.join(__dirname, "cli", "a.scss");

function run(args, input) {
	return spawnSync(process.execPath, [bin].concat(args), {
		input: input || "",
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
}

// 每条规则约 64B; 20 条的 JSON 输出约 400KB, 120 条的 --simple 输出约 210KB, 都远超管道缓冲区(macOS 64KB).
function bigCss(rules) {
	var css = "";
	for (var i = 0; i < rules; i++)
		css += ".a" + i + ' > b:hover, c[d="e"] { color: red; margin: 0 1px 2px 3px; }\n';
	return css;
}

describe("bin/gonzales", function () {
	it("reads stdin with -s", function () {
		var r = run(["-s", "css", "-"], "a{b:c}");
		assert.strictEqual(r.status, 0);
		assert.strictEqual(JSON.parse(r.stdout).syntax, "css");
	});

	it("accepts --syntax=value and -c", function () {
		var r = run(["--syntax=scss", "-c", "value", "-"], "$a");
		assert.strictEqual(r.status, 0);
		var ast = JSON.parse(r.stdout);
		assert.strictEqual(ast.type, "value");
		assert.strictEqual(ast.syntax, "scss");
	});

	it("takes syntax from file extension", function () {
		var r = run([fixture]);
		assert.strictEqual(r.status, 0);
		assert.strictEqual(JSON.parse(r.stdout).syntax, "scss");
	});

	it("prints simplified tree with --simple", function () {
		var r = run(["--simple", "-s", "css", "-"], "a{b:c}");
		assert.strictEqual(r.status, 0);
		assert.ok(r.stdout.indexOf("-> ruleset") !== -1);
		// 结尾横线按最后一个节点(深度 6 的 ident)对齐.
		assert.strictEqual(r.stdout.replace(/\n+$/, "").split("\n").pop(), " - - - - -");
	});

	it("keeps leading and trailing whitespace of a file", function () {
		var r = run([fixture]);
		assert.strictEqual(r.status, 0);
		var content = JSON.parse(r.stdout).content;
		assert.deepStrictEqual(content[content.length - 1].content, "\n");
	});

	it("prints the command name in help", function () {
		var r = run(["-h"]);
		assert.ok(r.stdout.indexOf("gonzales [options]") !== -1);
		assert.strictEqual(r.stdout.indexOf("gonzales-pe"), -1);
	});

	it("prints help with -h", function () {
		var r = run(["-h"]);
		assert.strictEqual(r.status, 0);
		assert.ok(r.stdout.indexOf("SYNOPSIS") !== -1);
	});

	it("exits 1 on parse error and --silent hides the message", function () {
		var loud = run(["-s", "scss", "-"], "a{");
		assert.strictEqual(loud.status, 1);
		assert.ok(loud.stderr.indexOf("Parsing error") !== -1);
		var quiet = run(["--silent", "-s", "scss", "-"], "a{");
		assert.strictEqual(quiet.status, 1);
		assert.strictEqual(quiet.stderr, "");
	});

	it("turns flags off with --no-silent, --silent=false and --silent false", function () {
		[["--no-silent"], ["--silent=false"], ["--silent", "false"]].forEach(function (flag) {
			var r = run(flag.concat(["-s", "scss", "-"]), "a{");
			assert.strictEqual(r.status, 1, flag.join(" "));
			assert.ok(r.stderr.indexOf("Parsing error") !== -1, flag.join(" "));
		});
		var quiet = run(["--silent", "true", "-s", "scss", "-"], "a{");
		assert.strictEqual(quiet.stderr, "");
	});

	it("treats arguments after -- as files", function () {
		var r = run(["--", fixture]);
		assert.strictEqual(r.status, 0);
	});

	it("writes large JSON output to a pipe in full", function () {
		var r = run(["-s", "css", "-"], bigCss(20));
		assert.strictEqual(r.status, 0);
		assert.ok(r.stdout.length > 200 * 1024, String(r.stdout.length));
		assert.strictEqual(JSON.parse(r.stdout).type, "stylesheet");
	});

	it("writes large --simple output to a pipe in full", function () {
		var r = run(["--simple", "-s", "css", "-"], bigCss(120));
		assert.strictEqual(r.status, 0);
		assert.ok(r.stdout.length > 200 * 1024, String(r.stdout.length));
		assert.ok(/\n( -)+\n$/.test(r.stdout));
	});

	it("rejects an unsupported --syntax with a readable error", function () {
		var r = run(["--syntax", "foo", fixture]);
		assert.strictEqual(r.status, 1);
		assert.strictEqual(r.stdout, "");
		assert.ok(r.stderr.indexOf('Unsupported syntax "foo"') !== -1, r.stderr);
		assert.strictEqual(r.stderr.indexOf("TypeError"), -1);
		var stdin = run(["-s", "foo", "-"], "a{}");
		assert.strictEqual(stdin.status, 1);
		assert.ok(stdin.stderr.indexOf('Unsupported syntax "foo"') !== -1, stdin.stderr);
	});

	it("rejects -s followed by a file name instead of a syntax", function () {
		var r = run(["-s", fixture]);
		assert.strictEqual(r.status, 1);
		assert.ok(r.stderr.indexOf("Unsupported syntax") !== -1, r.stderr);
		assert.ok(r.stderr.indexOf("css, less, sass, scss") !== -1, r.stderr);
	});

	it("rejects -s without a value", function () {
		var r = run([fixture, "-s"]);
		assert.strictEqual(r.status, 1);
		assert.ok(r.stderr.indexOf("Missing value for --syntax") !== -1, r.stderr);
	});

	it("rejects a file extension that is not a syntax", function () {
		var file = path.join(__dirname, "cli", "plain.txt");
		var r = run([file]);
		assert.strictEqual(r.status, 1);
		assert.ok(r.stderr.indexOf('Unsupported syntax "txt"') !== -1, r.stderr);
		assert.strictEqual(run(["-s", "css", file]).status, 0);
	});

	it("hides syntax errors with --silent", function () {
		var r = run(["--silent", "-s", "foo", fixture]);
		assert.strictEqual(r.status, 1);
		assert.strictEqual(r.stderr, "");
	});

	it("reports an unreadable file without a stack trace", function () {
		var r = run([path.join(__dirname, "cli", "missing.css")]);
		assert.strictEqual(r.status, 1);
		assert.ok(r.stderr.indexOf("Cannot read") !== -1, r.stderr);
		assert.strictEqual(r.stderr.indexOf("    at "), -1);
	});

	it("keeps an empty --syntax= meaning css on stdin", function () {
		var r = run(["--syntax=", "-"], "a{}");
		assert.strictEqual(r.status, 0);
		assert.strictEqual(JSON.parse(r.stdout).syntax, "css");
	});

	it("prints the version with --version and -v", function () {
		var version = require("../package.json").version;
		["--version", "-v"].forEach(function (flag) {
			var r = run([flag]);
			assert.strictEqual(r.status, 0, flag);
			assert.strictEqual(r.stdout, version + "\n", flag);
		});
	});

	it("reads upper-case file extensions as lower-case syntaxes", function () {
		var files = { "upper.SCSS": "scss", "upper.CSS": "css", "upper.Sass": "sass" };
		Object.keys(files).forEach(function (name) {
			var r = run([path.join(__dirname, "cli", name)]);
			assert.strictEqual(r.status, 0, name + ": " + r.stderr);
			assert.strictEqual(JSON.parse(r.stdout).syntax, files[name], name);
		});
	});
});
