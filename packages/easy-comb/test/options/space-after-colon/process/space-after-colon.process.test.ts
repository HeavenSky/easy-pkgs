import assert from 'node:assert/strict';
import Test from '../../../helpers/option-test.ts';

describe('Option `space-after-colon`, process', function() {
  describe('css', function() {
    it('Array value => should not change anything', function() {
      let test = new Test(this, {'space-after-colon': ['', ' ']}, {warns: true});
      return test.shouldBeEqual('test.css');
    });

    it('Invalid string value => should not change anything', function() {
      let test = new Test(this, {'space-after-colon': '  nani  '}, {warns: true});
      return test.shouldBeEqual('test.css');
    });

    it('Float number value => should not change anything', function() {
      let test = new Test(this, {'space-after-colon': 3.5}, {warns: true});
      return test.shouldBeEqual('test.css');
    });

    it('Integer value => should set proper space after colon', function() {
      let test = new Test(this, {'space-after-colon': 0});
      return test.shouldBeEqual('test.css', 'test.expected.css');
    });

    it('Valid string value (spaces only)=> should set proper space after colon', function() {
      let test = new Test(this, {'space-after-colon': '  '});
      return test.shouldBeEqual('test.css', 'test-2.expected.css');
    });

    it('Valid string value (spacesand newlines)=> should set proper space after colon', function() {
      let test = new Test(this, {'space-after-colon': '\n    '});
      return test.shouldBeEqual('test.css', 'test-3.expected.css');
    });
  });

  describe('sass', function() {
    it('Should set proper space if colon is after property name', function() {
      let test = new Test(this, {'space-after-colon': 2});
      return test.shouldBeEqual('colon-after-property-name.sass', 'colon-after-property-name.expected.sass');
    });

    it('Should not change space after colon which is before property name', function() {
      let test = new Test(this, {'space-after-colon': 1});
      return test.shouldBeEqual('colon-before-property-name.sass', 'colon-before-property-name.expected.sass');
    });
  });

  describe('scss', function() {
    it('Space after colon should not affect pseudo elements', function() {
      let test = new Test(this, {'space-after-colon': 1});
      return test.shouldBeEqual('pseudo-elements.scss', 'pseudo-elements.expected.scss');
    });
  });

  describe('scss / sass edge cases', function() {
    it('Should not split `::` parsed as a declaration', async function() {
      let test = new Test(this, {'space-after-colon': ' '});
      let actual = await test.comb.processString('a::foo(1){\n  @extend %p;\n}', {syntax: 'scss'});
      assert.equal(actual, 'a::foo(1){\n  @extend %p;\n}');
    });
    it('Should not turn a sass selector like `b:c` into a declaration', async function() {
      let test = new Test(this, {'space-after-colon': ' '});
      let actual = await test.comb.processString('a\n  &:hover\n    b:c\n  d:1px\n', {syntax: 'sass'});
      assert.equal(actual, 'a\n  &:hover\n    b:c\n  d: 1px\n');
    });
    it('Should keep the line break before a sass nested property block', async function() {
      let test = new Test(this, {'space-after-colon': ' '});
      let actual = await test.comb.processString('a\n  #{b}:\n    c: d\n', {syntax: 'sass'});
      assert.equal(actual, 'a\n  #{b}:\n    c: d\n');
    });
    it('Should not split a url in `url-prefix(https://...)`', async function() {
      let test = new Test(this, {'space-after-colon': ' '});
      let actual = await test.comb.processString('@-moz-document url-prefix(https://a.com/) {}', {syntax: 'scss'});
      assert.equal(actual, '@-moz-document url-prefix(https://a.com/) {}');
    });
  });
});
