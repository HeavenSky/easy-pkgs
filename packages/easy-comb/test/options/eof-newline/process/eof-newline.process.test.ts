import assert from 'node:assert/strict';
import Test from '../../../helpers/option-test.ts';

describe('Option `eof-newline`, process', function() {
  describe('css', function() {
    it('Invalid value should not change trim trailing brac', function() {
      let test = new Test(this, {'eof-newline': 'foobar'}, {warns: true});
      return test.comb.processString(
          'a { color: red }  \n'
      ).then(function(actual) {
        assert.equal(actual, 'a { color: red }  \n');
      });
    });

    it('Boolean true value should insert line-break at eof', function() {
      let test = new Test(this, {'eof-newline': true});
      return test.comb.processString(
          'a {color:red}  '
      ).then(function(actual) {
        assert.equal(actual, 'a {color:red}  \n');
      });
    });

    it('Boolean false value should remove line-break from eof', function() {
      let test = new Test(this, {'eof-newline': false});
      return test.comb.processString(
          'a {color:red}  \n'
      ).then(function(actual) {
        assert.equal(actual, 'a {color:red}  ');
      });
    });
  });

  describe('idempotence', function() {
    it('Removes all trailing line breaks in one pass', function() {
      let test = new Test(this, {'eof-newline': false});
      return test.comb.processString('a {color:red}  \n\n  \n').then(function(actual) {
        assert.equal(actual, 'a {color:red}  ');
      });
    });

    it('Keeps a single line break when there are several', function() {
      let test = new Test(this, {'eof-newline': true});
      return test.comb.processString('a {color:red}\n\n').then(function(actual) {
        assert.equal(actual, 'a {color:red}\n');
      });
    });

    // 格式化两次结果相同
    async function twice(test: Test, input: string, syntax: string): Promise<string> {
      let once = await test.comb.processString(input, {syntax});
      assert.equal(await test.comb.processString(once, {syntax}), once);
      return once;
    }

    it('Normalizes trailing line breaks swallowed by the last statement', async function() {
      let test = new Test(this, {'eof-newline': true});
      assert.equal(await twice(test, '@foo\n\n', 'css'), '@foo\n');
      assert.equal(await twice(test, '@use "a"\n\n', 'scss'), '@use "a"\n');
      assert.equal(await twice(test, 'a\n  @if $b\n    c: 1\n\n', 'sass'), 'a\n  @if $b\n    c: 1\n');
    });

    it('Treats a line break inside the last token as the final line break', async function() {
      let test = new Test(this, {'eof-newline': true});
      assert.equal(await twice(test, ' /**/ { color: #aaa  ', 'css'), ' /**/ { color: #aaa  \n');
    });

    it('Does not look inside a trailing `{}`', async function() {
      let test = new Test(this, {'eof-newline': true});
      assert.equal(await twice(test, '@a //\n  {}\n', 'scss'), '@a //\n  {}\n');
    });

    it('Copes with nodes created by other options without a syntax', async function() {
      let test = new Test(this, {'eof-newline': true, 'space-before-selector-delimiter': ''});
      assert.equal(await twice(test, '.a\n  +\n    .c, .b\n      margin: 10px', 'sass'),
          '.a\n  +\n    .c, .b\n      margin: 10px\n');
    });
  });
});
