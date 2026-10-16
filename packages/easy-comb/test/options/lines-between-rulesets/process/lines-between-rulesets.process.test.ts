import assert from 'node:assert/strict';
import Test from '../../../helpers/option-test.ts';

describe('Option `lines-between-rulesets`, process', function() {
  describe('css', function() {
    it('Numeric value => should insert 1 newline between rulesets', function() {
      let test = new Test(this, { 'lines-between-rulesets': 1 });
      return test.shouldBeEqual('lines-between-rulesets.css', 'lines-between-rulesets.expected.css');
    });

    it('Numeric value => should insert multiple newlines between rulesets', function() {
      let test = new Test(this, { 'lines-between-rulesets': 2 });
      return test.shouldBeEqual('lines-between-rulesets.css', '2-lines-between-rulesets.expected.css');
    });

    it('Invalid string value => should should not change anything', function() {
      let test = new Test(this, { 'lines-between-rulesets': '\n' }, {warns: true});
      return test.shouldBeEqual('lines-between-rulesets.css');
    });

    it('Float number value => should be rounded', function() {
      let test = new Test(this, { 'lines-between-rulesets': 0.5 });
      return test.shouldBeEqual('lines-between-rulesets.css', 'lines-between-rulesets.expected.css');
    });

    it('Should not indent ruleset that followed `}` on the same line (#610)', function() {
      let test = new Test(this, {
        'block-indent': '    ',
        'space-before-closing-brace': '\n',
        'lines-between-rulesets': 1
      });
      return test.shouldBeEqual('missing-newline.css', 'missing-newline.expected.css');
    });
  });

  describe('less', function() {
    it('Numeric value => should insert 1 newline between rulesets', function() {
      let test = new Test(this, { 'lines-between-rulesets': 1 });
      return test.shouldBeEqual('lines-between-rulesets.less', 'lines-between-rulesets.expected.less');
    });

    it('Numeric value => should insert multiple newlines between rulesets', function() {
      let test = new Test(this, { 'lines-between-rulesets': 2 });
      return test.shouldBeEqual('lines-between-rulesets.less', '2-lines-between-rulesets.expected.less');
    });

    it('Invalid string value => should should not change anything', function() {
      let test = new Test(this, { 'lines-between-rulesets': '\n' }, {warns: true});
      return test.shouldBeEqual('lines-between-rulesets.less');
    });

    it('Float number value => should be rounded', function() {
      let test = new Test(this, { 'lines-between-rulesets': 0.5 });
      return test.shouldBeEqual('lines-between-rulesets.less', 'lines-between-rulesets.expected.less');
    });
  });

  describe('scss', function() {
    it('Numeric value => should insert 1 newline between rulesets', function() {
      let test = new Test(this, { 'lines-between-rulesets': 1 });
      return test.shouldBeEqual('lines-between-rulesets.scss', 'lines-between-rulesets.expected.scss');
    });

    it('Numeric value => should insert multiple newlines between rulesets', function() {
      let test = new Test(this, { 'lines-between-rulesets': 2 });
      return test.shouldBeEqual('lines-between-rulesets.scss', '2-lines-between-rulesets.expected.scss');
    });

    it('Invalid string value => should should not change anything', function() {
      let test = new Test(this, { 'lines-between-rulesets': '\n' }, {warns: true});
      return test.shouldBeEqual('lines-between-rulesets.scss');
    });

    it('Float number value => should be rounded', function() {
      let test = new Test(this, { 'lines-between-rulesets': 0.5 });
      return test.shouldBeEqual('lines-between-rulesets.scss', 'lines-between-rulesets.expected.scss');
    });

    it('Should not insert newlines between consecutive imports (#560)', function() {
      let test = new Test(this, {'lines-between-rulesets': 1});
      return test.shouldBeEqual('imports.scss', 'imports.expected.scss');
    });

    it('Should keep trailing comment on its declaration line (#577)', function() {
      let test = new Test(this, {'lines-between-rulesets': 1});
      return test.shouldBeEqual('trailing-comment.scss', 'trailing-comment.expected.scss');
    });
  });

  describe('sass', function() {
    it('Numeric value => should insert 1 newline between rulesets', function() {
      let test = new Test(this, { 'lines-between-rulesets': 1 });
      return test.shouldBeEqual('lines-between-rulesets.sass', 'lines-between-rulesets.expected.sass');
    });

    it('Numeric value => should insert multiple newlines between rulesets', function() {
      let test = new Test(this, { 'lines-between-rulesets': 2 });
      return test.shouldBeEqual('lines-between-rulesets.sass', '2-lines-between-rulesets.expected.sass');
    });

    it('Invalid string value => should should not change anything', function() {
      let test = new Test(this, { 'lines-between-rulesets': '\n' }, {warns: true});
      return test.shouldBeEqual('lines-between-rulesets.sass');
    });

    it('Float number value => should be rounded', function() {
      let test = new Test(this, { 'lines-between-rulesets': 0.5 });
      return test.shouldBeEqual('lines-between-rulesets.sass', 'lines-between-rulesets.expected.sass');
    });
  });

  describe('sass line comments', function() {
    it('Should keep the line break ending a `//` comment at the start', async function() {
      let test = new Test(this, {'lines-between-rulesets': 0});
      let actual = await test.comb.processString('// c\na\n  b: c\n', {syntax: 'sass'});
      assert.equal(actual, '// c\na\n  b: c\n');
    });
    it('Should keep the line break ending a `//` comment between rulesets', async function() {
      let test = new Test(this, {'lines-between-rulesets': 0});
      let actual = await test.comb.processString('a\n  b: c\n// c\nd\n  e: f\n', {syntax: 'sass'});
      assert.equal(actual, 'a\n  b: c\n// c\nd\n  e: f\n');
    });
    it('Should keep the line break after a statement ending with `;`', async function() {
      let test = new Test(this, {'lines-between-rulesets': 0});
      let actual = await test.comb.processString('$a: b;\nc\n  d: $a\n', {syntax: 'sass'});
      assert.equal(actual, '$a: b;\nc\n  d: $a\n');
    });
    it('Should keep the line break after a rule without a block', async function() {
      let test = new Test(this, {'lines-between-rulesets': 0});
      let actual = await test.comb.processString('a \n> b\n  c: d\n', {syntax: 'sass'});
      assert.equal(actual, 'a \n> b\n  c: d\n');
    });
  });

  describe('idempotence', function() {
    // 格式化两次结果相同
    async function twice(test: Test, input: string, syntax: string): Promise<string> {
      let once = await test.comb.processString(input, {syntax});
      assert.equal(await test.comb.processString(once, {syntax}), once);
      return once;
    }

    it('Merges the blank line and the indentation parsed as separate spaces', async function() {
      let test = new Test(this, {'lines-between-rulesets': 1});
      assert.equal(await twice(test, 'foo\n  bar: baz\n  &:hover\n    baz: bam\n', 'sass'),
          'foo\n  bar: baz\n\n  &:hover\n    baz: bam\n');
    });

    it('Counts blank lines swallowed by the end of the previous statement', async function() {
      let test = new Test(this, {'lines-between-rulesets': 1});
      assert.equal(await twice(test, 'a\n  b: c\nd\n  @extend\n    a\nb\n  e: f\n', 'sass'),
          'a\n  b: c\n\nd\n  @extend\n    a\n\nb\n  e: f\n');
      assert.equal(await twice(test, '=a\n  * html\n    @content\n.b\n  #logo\n    c: d\n', 'sass'),
          '=a\n  * html\n    @content\n\n.b\n  #logo\n    c: d\n');
      // `+b` 带子块是 mixin include 而不是规则集, 前面不补空行
      assert.equal(await twice(test, '=a\n  * html\n    @content\n+b\n  #logo\n    c: d\n', 'sass'),
          '=a\n  * html\n    @content\n+b\n  #logo\n    c: d\n');
    });

    it('Runs after sort-order moves nested rules below declarations', async function() {
      let test = new Test(this, {
        'lines-between-rulesets': 1,
        'sort-order': [['a']],
        'block-indent': 2,
        'space-before-closing-brace': '\n'
      });
      assert.equal(await twice(test, 'foo {\n  bar {\n    c: d;\n  }\n  a: b;\n}\n', 'scss'),
          'foo {\n  a: b;\n\n  bar {\n    c: d;\n  }\n}\n');
    });

    it('Indents a rule that followed another one on the same line', async function() {
      let test = new Test(this, {'lines-between-rulesets': 1, 'block-indent': 2, 'space-before-closing-brace': '\n'});
      assert.equal(await twice(test, 'a {\n  .b {} .c {}\n}\n.d {} .e {}\n', 'scss'),
          'a {\n  .b {\n  }\n\n  .c {\n  }\n}\n\n.d {\n}\n\n.e {\n}\n');
    });

    it('Keeps own-line comments with the next rule and trailing comments with the previous one', async function() {
      let test = new Test(this, {'lines-between-rulesets': 1});
      assert.equal(await twice(test, '// x\n// y\na // c,\nb\n  x: y\n', 'sass'),
          '// x\n// y\na // c,\n\nb\n  x: y\n');
    });
  });
});
