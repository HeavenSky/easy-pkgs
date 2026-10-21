"use strict";

// 读写 test/corpus/<syntax>/<context>.txt 与 test/corpus/shared/<context>.txt 语料并逐条判定; 直接运行即全量冒烟, 加 --update 用当前解析结果重写期望.
// 只用 Node 6 支持的语法, 兼容 job 在旧版 Node 上直接运行本文件.

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var gonzales = require("..");
var SYNTAXES = require("../src/syntaxes");

var ROOT = path.join(__dirname, "corpus");
var SHARED = "shared";
var HEADER = /^=== (.+?)( \[skip\])?$/;
var SHARED_HEADER = /^=== (.+?) \[([a-z]+(?: [a-z]+)*)\]( \[skip\])?$/;
var ROOT_SYNTAX = /^(\S+ \S+) \{([^}]*)\}/;
var PLACEHOLDER = "*";
var SEPARATOR = "---";
var NODE_KEYS = { type: true, content: true, syntax: true, start: true, end: true };

function position(p) {
	return p.line + ":" + p.column;
}

// 每节点一行: 缩进 type 起-止 [{syntax}] ["content"]; syntax 只在与父节点不同时写出, 缺失写 {-}.
function serialize(node) {
	var lines = [];

	(function write(n, depth, parentSyntax) {
		Object.keys(n).forEach(function (key) {
			if (!NODE_KEYS[key]) throw new Error("语料格式无法表示的字段: " + key);
		});
		if (!n.start || !n.end) throw new Error("节点缺少 start/end: " + n.type);

		var line =
			Array.from({ length: depth + 1 }).join("  ") +
			n.type +
			" " +
			position(n.start) +
			"-" +
			position(n.end);
		if (depth === 0 || n.syntax !== parentSyntax)
			line += " {" + (n.syntax === undefined ? "-" : n.syntax) + "}";

		if (typeof n.content === "string") {
			lines.push(line + " " + JSON.stringify(n.content));
		} else if (Array.isArray(n.content)) {
			lines.push(line);
			n.content.forEach(function (child) {
				write(child, depth + 1, n.syntax);
			});
		} else {
			throw new Error("content 既不是字符串也不是数组: " + n.type);
		}
	})(node, 0, undefined);

	return lines.join("\n");
}

// 根节点行的 {from} 换成 {to}, 其余行原样; 共享用例的期望以 {*} 存根节点 syntax.
function replaceRootSyntax(tree, from, to) {
	var m = ROOT_SYNTAX.exec(tree);
	if (!m || m[2] !== from) return tree;
	return m[1] + " {" + to + "}" + tree.slice(m[0].length);
}

function expandTree(tree, syntax) {
	return replaceRootSyntax(tree, PLACEHOLDER, syntax);
}

function shareTree(tree, syntax) {
	return replaceRootSyntax(tree, syntax, PLACEHOLDER);
}

function sharedHeader(line, file, i) {
	var m = SHARED_HEADER.exec(line);
	var where = file + ":" + (i + 1);
	if (!m) throw new Error(where + " 共享用例头缺少适用语法: " + line);
	var syntaxes = m[2].split(" ");
	syntaxes.forEach(function (s, k) {
		if (!SYNTAXES[s]) throw new Error(where + " 未知语法: " + s);
		if (k && syntaxes[k - 1] >= s)
			throw new Error(where + " 适用语法须按字母序且不重复: " + m[2]);
	});
	return { name: m[1], syntaxes: syntaxes, skip: !!m[3] };
}

function parse(text, file, shared) {
	var lines = text.split("\n");
	var cases = [];
	var current = null;
	var inTree = false;

	lines.forEach(function (line, i) {
		var header = HEADER.exec(line);
		if (header) {
			current = shared ? sharedHeader(line, file, i) : { name: header[1], skip: !!header[2] };
			current.input = [];
			current.tree = [];
			cases.push(current);
			inTree = false;
		} else if (!current) {
			if (line !== "") throw new Error(file + ":" + (i + 1) + " 第一条用例之前有内容");
		} else if (!inTree && line === SEPARATOR) {
			inTree = true;
		} else {
			(inTree ? current.tree : current.input).push(line);
		}
	});

	return cases.map(function (c) {
		while (c.tree.length && c.tree[c.tree.length - 1] === "") c.tree.pop();
		var result = {
			name: c.name,
			skip: c.skip,
			input: c.input.join("\n"),
			tree: c.tree.join("\n"),
		};
		if (c.syntaxes) result.syntaxes = c.syntaxes;
		return result;
	});
}

// 带 syntaxes 的用例写成共享用例头 `=== name [css less] [skip]`.
function format(cases, file) {
	return cases
		.map(function (c) {
			c.input.split("\n").forEach(function (line) {
				if (HEADER.test(line) || line === SEPARATOR)
					throw new Error(file + " 用例 " + c.name + " 的输入含有分隔行: " + line);
			});
			var header =
				"=== " +
				c.name +
				(c.syntaxes ? " [" + c.syntaxes.join(" ") + "]" : "") +
				(c.skip ? " [skip]" : "");
			var parsed = (c.syntaxes ? SHARED_HEADER : HEADER).exec(header);
			if (!parsed || parsed[1] !== c.name)
				throw new Error(file + " 用例名无法无歧义地写入用例头: " + c.name);
			return (
				header + "\n" + c.input + "\n" + SEPARATOR + "\n" + (c.tree ? c.tree + "\n" : "")
			);
		})
		.join("\n");
}

function readFile(file, shared) {
	return parse(fs.readFileSync(file, "utf8"), file, shared);
}

function writeFile(file, cases) {
	fs.writeFileSync(file, format(cases, file));
}

// 逐个语料文件读出原样内容; 共享文件的 syntax 为 null.
function loadFiles() {
	var files = [];
	fs.readdirSync(ROOT)
		.sort()
		.forEach(function (dir) {
			fs.readdirSync(path.join(ROOT, dir))
				.sort()
				.forEach(function (name) {
					if (path.extname(name) !== ".txt") return;
					var file = path.join(ROOT, dir, name);
					files.push({
						syntax: dir === SHARED ? null : dir,
						context: path.basename(name, ".txt"),
						file: file,
						cases: readFile(file, dir === SHARED),
					});
				});
		});
	return files;
}

// 把共享用例展开到各适用语法, 按 syntax 与文件名排序成 {syntax, context, cases} 分组.
function expandFiles(files) {
	var groups = {};
	function add(syntax, context, c) {
		var key = syntax + "/" + context;
		var group = groups[key] || (groups[key] = { syntax: syntax, context: context, cases: [] });
		group.cases.forEach(function (other) {
			if (other.name === c.name) throw new Error(key + " 用例重名: " + c.name);
		});
		group.cases.push(c);
	}

	files.forEach(function (f) {
		f.cases.forEach(function (c) {
			if (!c.syntaxes) return add(f.syntax, f.context, c);
			c.syntaxes.forEach(function (syntax) {
				add(syntax, f.context, {
					name: c.name,
					skip: c.skip,
					input: c.input,
					tree: expandTree(c.tree, syntax),
				});
			});
		});
	});

	return Object.keys(groups)
		.map(function (key) {
			return groups[key];
		})
		.sort(function (a, b) {
			if (a.syntax !== b.syntax) return a.syntax < b.syntax ? -1 : 1;
			var x = a.context + ".txt";
			var y = b.context + ".txt";
			return x < y ? -1 : x > y ? 1 : 0;
		});
}

function load() {
	return expandFiles(loadFiles());
}

// trees 给出共享用例在各适用语法下的新期望; 多数一致的语法留在共享用例里, 其余拆成单语法用例.
function reshare(c, trees) {
	var buckets = [];
	c.syntaxes.forEach(function (syntax) {
		var tree = shareTree(trees[syntax], syntax);
		var bucket = buckets.filter(function (b) {
			return b.tree === tree;
		})[0];
		if (!bucket) buckets.push((bucket = { tree: tree, syntaxes: [], order: buckets.length }));
		bucket.syntaxes.push(syntax);
	});
	buckets.sort(function (a, b) {
		return (
			b.syntaxes.length - a.syntaxes.length ||
			(b.tree === c.tree) - (a.tree === c.tree) ||
			a.order - b.order
		);
	});

	var kept = null;
	var split = [];
	buckets.forEach(function (b, i) {
		if (i === 0 && b.syntaxes.length > 1) {
			kept = {
				name: c.name,
				syntaxes: b.syntaxes,
				skip: c.skip,
				input: c.input,
				tree: b.tree,
			};
			return;
		}
		b.syntaxes.forEach(function (syntax) {
			split.push({
				syntax: syntax,
				entry: {
					name: c.name,
					skip: c.skip,
					input: c.input,
					tree: expandTree(b.tree, syntax),
				},
			});
		});
	});
	return { kept: kept, split: split };
}

function actualTree(input, syntax, context) {
	var ast = gonzales.parse(input, { syntax: syntax, context: context });
	return { ast: ast, tree: serialize(JSON.parse(JSON.stringify(ast))) };
}

function check(group, c) {
	var actual = actualTree(c.input, group.syntax, group.context);
	assert.strictEqual(actual.tree, c.tree, "AST 与期望不符");
	assert.strictEqual(actual.ast.toString(), c.input, "toString 未逐字还原输入");
}

function runAll() {
	var result = { pass: 0, fail: 0, skip: 0, failures: [] };
	load().forEach(function (group) {
		group.cases.forEach(function (c) {
			if (c.skip) return result.skip++;
			try {
				check(group, c);
				result.pass++;
			} catch (e) {
				result.fail++;
				result.failures.push(
					group.syntax + "/" + group.context + "/" + c.name + ": " + e.message
				);
			}
		});
	});
	return result;
}

// 跳过的用例, 不在 filter 内的用例与解析抛错的用例保留原期望, 其余用当前解析结果重写;
// 共享用例在各适用语法下重算, 结果分叉的语法拆回 <syntax>/<context>.txt.
function update(filter) {
	var files = loadFiles();
	expandFiles(files);
	var changed = 0;
	var moved = 0;

	function recompute(c, syntax, context, old) {
		if (c.skip || (filter && (syntax + "/" + context).indexOf(filter) !== 0)) return old;
		try {
			var tree = actualTree(c.input, syntax, context).tree;
			if (tree !== old) changed++;
			return tree;
		} catch (e) {
			console.error(
				syntax + "/" + context + "/" + c.name + " 解析失败, 未更新: " + e.message
			);
			return old;
		}
	}

	var singles = {};
	files.forEach(function (f) {
		if (f.syntax) singles[f.syntax + "/" + f.context] = f;
	});
	files.forEach(function (f) {
		if (!f.syntax) return;
		f.cases.forEach(function (c) {
			c.tree = recompute(c, f.syntax, f.context, c.tree);
		});
	});

	files.forEach(function (f) {
		if (f.syntax) return;
		var kept = [];
		f.cases.forEach(function (c) {
			var trees = {};
			c.syntaxes.forEach(function (syntax) {
				trees[syntax] = recompute(c, syntax, f.context, expandTree(c.tree, syntax));
			});
			var result = reshare(c, trees);
			if (result.kept) kept.push(result.kept);
			result.split.forEach(function (s) {
				var key = s.syntax + "/" + f.context;
				if (!singles[key]) {
					singles[key] = {
						syntax: s.syntax,
						context: f.context,
						file: path.join(ROOT, s.syntax, f.context + ".txt"),
						cases: [],
					};
					files.push(singles[key]);
				}
				singles[key].cases.push(s.entry);
				moved++;
			});
		});
		f.cases = kept;
	});

	files.forEach(function (f) {
		var exists = fs.existsSync(f.file);
		if (!f.cases.length) {
			if (exists) fs.unlinkSync(f.file);
			return;
		}
		var text = format(f.cases, f.file);
		if (exists && fs.readFileSync(f.file, "utf8") === text) return;
		if (!fs.existsSync(path.dirname(f.file))) fs.mkdirSync(path.dirname(f.file));
		fs.writeFileSync(f.file, text);
	});
	console.log(
		"已更新 " + changed + " 条期望" + (moved ? ", 拆回单语法文件 " + moved + " 条" : "")
	);
}

module.exports = {
	serialize: serialize,
	parse: parse,
	format: format,
	readFile: readFile,
	writeFile: writeFile,
	expandTree: expandTree,
	shareTree: shareTree,
	expandFiles: expandFiles,
	reshare: reshare,
	load: load,
	check: check,
};

if (require.main === module) {
	var args = process.argv.slice(2);
	if (args[0] === "--update") {
		update(args[1]);
	} else {
		var result = runAll();
		console.log(
			process.version +
				" pass=" +
				result.pass +
				" fail=" +
				result.fail +
				" skip=" +
				result.skip
		);
		result.failures.slice(0, 20).forEach(function (line) {
			console.log("  " + line);
		});
		if (result.fail) process.exitCode = 1;
	}
}
