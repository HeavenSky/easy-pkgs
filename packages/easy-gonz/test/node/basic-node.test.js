var assert = require('assert');
var describe = require('node:test').describe;
var it = require('node:test').it;
var gonzales = require('../../');

describe('Node#contains()', function() {
    it('should return true for existing child node', function() {
        var ast = gonzales.parse('a{}');
        assert.equal(ast.contains('ruleset'), true);
    });

    it('should return false for nonexisting child node', function() {
        var ast = gonzales.parse('a{}');
        assert.equal(ast.contains('nani'), false);
    });
});

describe('Node#last()', function() {
  it('should return null if no node is found', function() {
      var ast = gonzales.parse('a{}');
      assert.equal(ast.last('declaration'), null);
  });

  it('should return the node if one is found', function() {
      var ast = gonzales.parse('a{}');
      assert.equal(ast.last('ruleset'), ast.content[0]);
  });
});

describe('Node.prototype', function() {
  it('should keep methods enumerable like gonzales-pe 4.3.0', function() {
      var ast = gonzales.parse('a{}');
      var keys = [];
      for (var key in ast) keys.push(key);
      assert.deepEqual(Object.keys(ast), ['type', 'content', 'syntax', 'start', 'end']);
      ['contains', 'first', 'forEach', 'toString', 'traverse'].forEach(function(name) {
        assert.ok(keys.indexOf(name) !== -1, name);
      });
      assert.equal(keys.indexOf('length'), -1);
      assert.equal(keys.indexOf('constructor'), -1);
  });
});
