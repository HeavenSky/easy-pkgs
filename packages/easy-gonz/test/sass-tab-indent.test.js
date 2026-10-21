var assert = require('assert');
var describe = require('node:test').describe;
var it = require('node:test').it;
var gonzales = require('../');

// 缩进 Sass 允许用 tab 缩进; 跨行注释按缩进判断结束, tab 与空格要同样计数
function comments(src) {
  var ast = gonzales.parse(src, {syntax: 'sass'});
  var out = [];
  ast.traverse(function(node) {
    if (node.is('multilineComment') || node.is('singlelineComment')) out.push(node.content);
  });
  assert.equal(ast.toString(), src);
  return out;
}

describe('sass tab indentation', function() {
  it('continues a multiline comment on more deeply tab-indented lines', function() {
    assert.deepEqual(comments('a\n\t/* c\n\t\tmore\n\tb: 1\n'), [' c\n\t\tmore']);
  });

  it('continues a single-line comment on more deeply tab-indented lines', function() {
    assert.deepEqual(comments('a\n\t// c\n\t\tmore\n\tb: 1\n'), [' c\n\t\tmore']);
  });

  it('ends a tab-indented comment when the indentation drops back', function() {
    assert.deepEqual(comments('a\n\t/* c\n\tb: 1\n'), [' c']);
  });

  it('still closes a comment after other content with */', function() {
    assert.deepEqual(comments('a\n\tb: 1 /* x */\n\tc: 2\n'), [' x ']);
  });
});
