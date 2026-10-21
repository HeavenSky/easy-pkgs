import assert from 'node:assert/strict';
import Test from '../../../helpers/option-test.ts';

describe('Option `space-before-closing-brace`, process', function() {
  describe('css', function() {
    it('Array value => should not change anything', function() {
      let test = new Test(this, {'space-before-closing-brace': ['', ' ']}, {warns: true});
      return test.shouldBeEqual('test.css');
    });

    it('Invalid string value => should not change anything', function() {
      let test = new Test(this, {'space-before-closing-brace': '  nani  '}, {warns: true});
      return test.shouldBeEqual('test.css');
    });

    it('Float number value => should not change anything', function() {
      let test = new Test(this, {'space-before-closing-brace': 3.5}, {warns: true});
      return test.shouldBeEqual('test.css');
    });

    it('Integer value => should set proper space before }', function() {
      let test = new Test(this, {'space-before-closing-brace': 0});
      return test.shouldBeEqual('test.css', 'test.expected.css');
    });

    it('Valid string value (spaces only) => should set proper space before }', function() {
      let test = new Test(this, {'space-before-closing-brace': '  '});
      return test.shouldBeEqual('test.css', 'test-2.expected.css');
    });

    it('Valid string value (spaces and newlines) => should set proper space before }', function() {
      let test = new Test(this, {'space-before-closing-brace': '\n    '});
      return test.shouldBeEqual('test.css', 'test-3.expected.css');
    });
  });

  describe('empty value', function() {
    it('Should put the space after the colon, not after the empty value', function() {
      let test = new Test(this, {'space-before-closing-brace': '\n'});
      return test.comb.processString('a{foo: }').then(function(actual) {
        assert.equal(actual, 'a{foo:\n}');
      });
    });
  });

  describe('empty block-indent', function() {
    it('Should not indent the closing brace when block-indent is an empty string', async function() {
      let test = new Test(this, {'block-indent': '', 'space-before-closing-brace': '\n'});
      assert.equal(await test.comb.processString('a{b{c:d}}', {syntax: 'scss'}), 'a{b{c:d\n}\n}');
    });
  });
});
