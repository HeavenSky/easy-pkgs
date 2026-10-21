import assert from 'node:assert/strict';
import Test from '../../../helpers/option-test.ts';

describe('Option `vendor-prefix-align`, process', function() {
  describe('css', function() {
    it('Should correctly work when there is comment before property name', function() {
      let test = new Test(this, {'vendor-prefix-align': true});
      return test.shouldBeEqual('with-comment-property.css', 'with-comment-property.expected.css');
    });

    it('Should correctly work when there is comment before property name. Test 2', function() {
      let test = new Test(this, {'vendor-prefix-align': true});
      return test.shouldBeEqual('with-comment-property-2.css', 'with-comment-property-2.expected.css');
    });

    it('Should correctly work when there is comment before property name. Test 3', function() {
      let test = new Test(this, {'vendor-prefix-align': true});
      return test.shouldBeEqual('multiline-comments.css', 'multiline-comments.expected.css');
    });

    it('Should correctly align prefixes in properties', function() {
      let test = new Test(this, {'vendor-prefix-align': true});
      return test.shouldBeEqual('property-align.css', 'property-align.expected.css');
    });

    it('Should correctly align prefixes in values', function() {
      let test = new Test(this, {'vendor-prefix-align': true});
      return test.shouldBeEqual('value-align.css', 'value-align.expected.css');
    });

    it('Should not touch already align prefixes', function() {
      let test = new Test(this, {'vendor-prefix-align': true});
      return test.shouldBeEqual('already-aligned.css', 'already-aligned.expected.css');
    });

    it('Should correctly align prefixes in properties and values at the same time', function() {
      let test = new Test(this, {'vendor-prefix-align': true});
      return test.shouldBeEqual('both.css', 'both.expected.css');
    });

    it('Should correctly work when value and property names are the same', function() {
      let test = new Test(this, {'vendor-prefix-align': true});
      return test.shouldBeEqual('same-name.css', 'same-name.expected.css');
    });

    it('Should correctly work when there is no whitespace after colon', function() {
      let test = new Test(this, {'vendor-prefix-align': true});
      return test.shouldBeEqual('without-space.css', 'without-space.expected.css');
    });

    it('Issue 628: should align only consecutive properties with prefixed ones first', function() {
      let test = new Test(this, {'vendor-prefix-align': true});
      return test.shouldBeEqual('issue-628.css', 'issue-628.expected.css');
    });

    it('Should correctly work when there is comment after colon', function() {
      let test = new Test(this, {'vendor-prefix-align': true});
      return test.shouldBeEqual('with-comment.css', 'with-comment.expected.css');
    });

    it('Should not do anything with oneliners', function() {
      let test = new Test(this, {'vendor-prefix-align': true});
      return test.shouldBeEqual('one-line.css', 'one-line.expected.css');
    });

    it('Should not do anything with oneliners. Test 2', function() {
      let test = new Test(this, {'vendor-prefix-align': true});
      return test.shouldBeEqual('one-line-2.css', 'one-line-2.expected.css');
    });

    it('Should always correctly align prefixes', function() {
      let test = new Test(this, {'vendor-prefix-align': true});
      return test.shouldBeEqual('complex.css', 'complex.expected.css');
    });

    it('Issue 193: should handle declarations without preceding spaces', function() {
      let test = new Test(this, {'vendor-prefix-align': true});
      return test.shouldBeEqual('issue-193.css', 'issue-193.expected.css');
    });

    it('Issue 241: should not break tabs', function() {
      let test = new Test(this, {
        'block-indent': '\t',
        'vendor-prefix-align': true
      });
      return test.shouldBeEqual('issue-241.css', 'issue-241.expected.css');
    });
  });

  describe('sass', function() {
    it('Should align prexied values', function() {
      let test = new Test(this, {'vendor-prefix-align': true});
      return test.shouldBeEqual('value.sass', 'value.expected.sass');
    });

    it('Should not align prefixed property names', function() {
      let test = new Test(this, {'vendor-prefix-align': true});
      return test.shouldBeEqual('property.sass');
    });
  });

  describe('empty value', function() {
    it('Should not throw', function() {
      let test = new Test(this, {'vendor-prefix-align': true});
      return test.comb.processString('a{\n  -webkit-foo:;\n  foo:\n}').then(function(actual) {
        assert.equal(actual, 'a{\n  -webkit-foo:;\n          foo:\n}');
      });
    });
  });

  describe('empty custom property name', function() {
    it('Should not throw on `--: b`', async function() {
      let test = new Test(this, {'vendor-prefix-align': true});
      let actual = await test.comb.processString('a {--: b}', {syntax: 'scss'});
      assert.equal(actual, 'a {--: b}');
    });
  });

  describe('variables and custom properties', function() {
    for (const [syntax, v] of [['scss', '$'], ['less', '@'], ['css', '--']]) {
      it(`Should not align \`${v}x\` with \`-webkit-x\` (${syntax})`, async function() {
        let test = new Test(this, {'vendor-prefix-align': true});
        let input = `a {\n    -webkit-x: 1px;\n    ${v}x: 1px;\n    ${v}-webkit-y: 1px;\n    y: 1px;\n}\n`;
        assert.equal(await test.comb.processString(input, {syntax}), input);
      });
    }
  });
});
