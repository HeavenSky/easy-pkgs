var assert = require('assert');
var path = require('path');
var url = require('url');
var spawnSync = require('child_process').spawnSync;
var describe = require('node:test').describe;
var it = require('node:test').it;

var root = path.join(__dirname, '..');
var main = path.join(root, require('../package.json').main);

// 在 ESM 子进程里执行 source, 返回 stdout 解析出的 JSON.
function runEsm(source) {
  var r = spawnSync(process.execPath, ['--input-type=module', '-e', source], {encoding: 'utf8'});
  assert.strictEqual(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

describe('module exports', function() {
  it('keeps the CommonJS shape of gonzales-pe 4.3.0', function() {
    var gonzales = require('..');
    assert.deepStrictEqual(Object.keys(gonzales), ['createNode', 'parse']);
    assert.strictEqual(require('../lib/gonzales'), gonzales);
    assert.strictEqual(gonzales.parse('a{}').type, 'stylesheet');
    assert.strictEqual(gonzales.createNode({type: 'ident', content: 'a', syntax: 'css'}).toString(), 'a');
  });

  it('supports named imports from ESM', function() {
    [main, path.join(root, 'lib', 'gonzales.js')].forEach(function(file) {
      var href = JSON.stringify(url.pathToFileURL(file).href);
      var result = runEsm(
          'import { parse, createNode } from ' + href + ';\n' +
          'import gonzales from ' + href + ';\n' +
          'console.log(JSON.stringify([typeof parse, typeof createNode, ' +
          'parse === gonzales.parse, parse("a{}").type]));');
      assert.deepStrictEqual(result, ['function', 'function', true, 'stylesheet'], file);
    });
  });
});
