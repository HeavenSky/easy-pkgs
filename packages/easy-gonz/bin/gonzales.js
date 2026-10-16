#!/usr/bin/env node

'use strict';

var gonzales = require('..');
var fs = require('fs');
var path = require('path');

var SYNTAXES = ['css', 'less', 'sass', 'scss'];

// 只设置 exitCode 让进程自然退出: 写管道是异步的, 立即 process.exit 会截断大输出.
// 下游提前关闭管道(例: `| head`)时静默结束, 不抛 EPIPE.
process.stdout.on('error', function(e) {
  if (e.code !== 'EPIPE') throw e;
});

var options = getOptions();

if (options.help) {
  displayHelp();
} else if (options.version) {
  console.log(require('../package.json').version);
} else if (isSTDIN()) {
  if (!hasSyntax() || checkSyntax(options.syntax, '--syntax')) processSTDIN();
} else {
  processFile(options._[0]);
}

function getOptions() {
  var aliases = {h: 'help', s: 'syntax', c: 'context', v: 'version'};
  var flags = {help: true, silent: true, simple: true, version: true};
  var args = process.argv.slice(2);
  var result = {_: []};

  for (var i = 0; i < args.length; i++) {
    var arg = args[i];
    if (arg === '--') {
      result._ = result._.concat(args.slice(i + 1));
      break;
    }

    var match = /^--?([^-=][^=]*)(?:=([\s\S]*))?$/.exec(arg);
    if (!match) {
      result._.push(arg);
      continue;
    }

    var name = aliases[match[1]] || match[1];
    // 与原先的 minimist 一致: `--no-silent`, `--silent=false`, `--silent false` 关闭开关.
    if (name.startsWith('no-') && arg.startsWith('--') && match[2] === undefined) {
      result[name.slice(3)] = false;
    } else if (flags[name]) {
      if (match[2] !== undefined) result[name] = match[2] !== 'false';
      else if (args[i + 1] === 'true' || args[i + 1] === 'false')
        result[name] = args[++i] === 'true';
      else result[name] = true;
    } else {
      result[name] = match[2] !== undefined ? match[2] : args[++i];
    }
  }

  return result;
}

function isSTDIN() {
  return options._.indexOf('-') !== -1;
}

function processSTDIN() {
  var input = '';
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', data => {
    input += data;
  });
  process.stdin.on('end', () => {
    processInputData(input);
  });
}

function processFile(file) {
  if (!file) {
    // 与 4.3.0 一致: 没有文件也没有 `-` 时什么都不做; 但 `-s` 后漏写取值要报错.
    if (hasSyntax()) checkSyntax(options.syntax, '--syntax');
    return;
  }
  if (hasSyntax()) {
    if (!checkSyntax(options.syntax, '--syntax')) return;
  } else {
    // 扩展名不区分大小写: a.SCSS 按 scss 解析.
    options.syntax = path.extname(file).substring(1).toLowerCase();
    if (!checkSyntax(options.syntax, 'the extension of ' + file)) return;
  }
  // 不 trim, 保留首尾空白以便 toString() 无损往返.
  var css;
  try {
    css = fs.readFileSync(file, 'utf-8');
  } catch (e) {
    return fail('Cannot read ' + file + ': ' + e.message);
  }
  processInputData(css);
}

// 写了 -s/--syntax 即算指定, 漏写取值(值为 undefined)也算; 空串沿用 4.3.0 的"未指定"语义.
function hasSyntax() {
  return 'syntax' in options && options.syntax !== '';
}

// syntax 不在支持列表时报错并返回 false; `-s a.css` 这类把文件名当取值的误用也走这里.
function checkSyntax(syntax, source) {
  if (SYNTAXES.indexOf(syntax) !== -1) return true;
  var expected = '; expected one of ' + SYNTAXES.join(', ') + '.';
  if (syntax === undefined || syntax === true) fail('Missing value for ' + source + expected);
  else fail('Unsupported syntax "' + syntax + '" from ' + source + expected);
  return false;
}

function fail(message) {
  if (!options.silent) process.stderr.write(message + '\n');
  process.exitCode = 1;
}

function processInputData(input) {
  try {
    var ast = gonzales.parse(input, {
      syntax: options.syntax,
      context: options.context
    });
    printTree(ast);
    process.exitCode = 0;
  } catch (e) {
    if (!options.silent) process.stderr.write(e.toString());
    process.exitCode = 1;
  }
}

function printTree(ast) {
  if (!options.simple) {
    var tree = ast.toJson();
    process.stdout.write(tree);
  } else {
    var lastLevel = 1;

    ast.traverse(function(node, i, parent, level) {
      lastLevel = level;
      var type = node.type;
      var spaces = ' |'.repeat(level - 1);
      if (typeof node.content === 'string') {
        var content = JSON.stringify(node.content);
        console.log(spaces, '->', type);
        console.log(spaces, '  ', content);
      } else {
        console.log(spaces, '->', type);
      }
    });

    // 结尾横线与最后访问节点的深度对齐.
    console.log(' -'.repeat(lastLevel - 1));
  }
}

function displayHelp() {
  var help = [
      'NAME',
      '    gonzales — Parse a CSS, Less, SCSS or Sass file and print its parse tree in JSON',
      '',
      'SYNOPSIS',
      '    gonzales [options] file.css',
      '    cat file.scss | gonzales [options] -',
      '',
      'OPTIONS',
      '    -s, --syntax',
      '        Syntax name: css, less, sass or scss. Defaults to the file',
      '        extension, or css when reading stdin.',
      '    -c, --context',
      '        Context of code part. See docs on node types for more info.',
      '    --simple',
      '        Print a simplified parse tree structure instead of JSON.',
      '    --silent',
      '        Don\'t print any error messages.',
      '    -v, --version',
      '        Print the version number.',
      '    -h, --help',
      '        Print this help.'
  ];
  console.log(help.join('\n'));
}
