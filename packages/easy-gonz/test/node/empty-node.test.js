var assert = require('assert');
var describe = require('node:test').describe;
var it = require('node:test').it;
var gonzales = require('../../');

describe('Empty input', function() {
    it('should return stylesheet type', function() {
        var ast = gonzales.parse('');
        assert.equal(ast.type, 'stylesheet');
    });

    it('should return empty content', function() {
        var ast = gonzales.parse('');
        assert.equal(ast.content.length, 0);
    });

    ['css', 'less', 'sass', 'scss'].forEach(function(syntax) {
        it('should stringify to empty string (' + syntax + ')', function() {
            var ast = gonzales.parse('', {syntax: syntax});
            assert.equal(ast.syntax, syntax);
            assert.strictEqual(ast.toString(), '');
        });
    });

    it('should default to css syntax', function() {
        var ast = gonzales.parse('');
        assert.equal(ast.syntax, 'css');
        assert.strictEqual(ast.toString(), '');
    });
});
