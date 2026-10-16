import assert from 'node:assert/strict';
import Test from '../../../helpers/option-test.ts';

describe('Option `quotes`, process', function() {
  describe('css', function() {
    it('Invalid String should not change quotes', function() {
      let test = new Test(this, {quotes: 3}, {warns: true});
      return test.comb.processString(
          'a { content: "" }b { content: \'\' }'
      ).then(function(actual) {
        assert.equal(actual, 'a { content: "" }b { content: \'\' }');
      });
    });

    it('`single` value should set the quotes to single', function() {
      let test = new Test(this, {quotes: 'single'});
      return test.comb.processString(
          'a { content: "" }b { content: \'\' }'
      ).then(function(actual) {
        assert.equal(actual, 'a { content: \'\' }b { content: \'\' }');
      });
    });

    it('`double` value should set the quotes to double', function() {
      let test = new Test(this, {quotes: 'double'});
      return test.comb.processString(
          'a { content: "" }b { content: \'\' }'
      ).then(function(actual) {
        assert.equal(actual, 'a { content: "" }b { content: "" }');
      });
    });

    it('`double` value should set the quotes to double in attrs and urls', function() {
      let test = new Test(this, {quotes: 'double'});
      return test.comb.processString(
          'a[class^=\'foo\'] { background: url(\'foo.png\') }'
      ).then(function(actual) {
        assert.equal(actual, 'a[class^="foo"] { background: url("foo.png") }');
      });
    });

    it('`double` value should keep single quotes around unescaped double quotes (#645)', function() {
      let test = new Test(this, {quotes: 'double'});
      return test.comb.processString(
          'a { content: "\\"" }b { content: \'"\' }'
      ).then(function(actual) {
        assert.equal(actual, 'a { content: "\\"" }b { content: \'"\' }');
      });
    });

    it('`single` value should unescape the escaped double quotes on change', function() {
      let test = new Test(this, {quotes: 'single'});
      return test.comb.processString(
          'a { content: "\\"" }'
      ).then(function(actual) {
        assert.equal(actual, 'a { content: \'"\' }');
      });
    });

    it('`single` value should keep escaped backslashes (#352)', function() {
      let test = new Test(this, {quotes: 'single'});
      return test.comb.processString(
          'a { content: "\\\\" }b { content: "\\"x\\"" }'
      ).then(function(actual) {
        assert.equal(actual, 'a { content: \'\\\\\' }b { content: \'"x"\' }');
      });
    });
  });

  describe('scss interpolation', function() {
    it('Should keep quotes inside `#{}` of a converted string', async function() {
      let test = new Test(this, {quotes: 'double'});
      let actual = await test.comb.processString('a{b:\'#{"x"}\';c:\'"#{"y"}\'}', {syntax: 'scss'});
      assert.equal(actual, 'a{b:"#{"x"}";c:\'"#{"y"}\'}');
    });
  });
});
