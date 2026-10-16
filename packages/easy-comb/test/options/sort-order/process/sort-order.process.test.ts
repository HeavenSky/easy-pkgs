import assert from 'node:assert/strict';
import Test from '../../../helpers/option-test.ts';

describe('Option `sort-order`, process', function() {
  describe('css', function() {
    it('Should place vendor-prefixed properties before their standard name', async function() {
      let test = new Test(this, {'sort-order': [['position', 'top'], ['transition', 'color']]});
      let actual = await test.comb.processString(
          'a{color:red;transition:x;-webkit-transition:x;top:0;-o-transition:z;' +
          '-moz-transition:y;position:a;-webkit-font-smoothing:a}');
      assert.equal(actual,
          'a{position:a;top:0;-webkit-transition:x;-moz-transition:y;' +
          '-o-transition:z;transition:x;color:red;-webkit-font-smoothing:a}');
    });

    it('Should prefer an explicitly listed prefixed property', async function() {
      let test = new Test(this, {'sort-order': ['-webkit-box-shadow', 'color', 'box-shadow']});
      let actual = await test.comb.processString(
          'a{box-shadow:x;color:red;-webkit-box-shadow:x}');
      assert.equal(actual, 'a{-webkit-box-shadow:x;color:red;box-shadow:x;}');
    });

    it('Should be in expected order in case properties are not grouped', function() {
      let test = new Test(this, {'sort-order': ['position', 'z-index']});
      return test.shouldBeEqual('single-group.css', 'single-group.expected.css');
    });

    it('Should be in expected order in case of 1 group', function() {
      let test = new Test(this, {'sort-order': [['position', 'z-index']]});
      return test.shouldBeEqual('single-group.css', 'single-group.expected.css');
    });

    it('Shuld be in expected order in case of multiple groups', function() {
      let test = new Test(this, {
        'sort-order': [
          ['position', 'z-index'],
          ['width', 'height']
        ]
      });
      return test.shouldBeEqual('multiple-groups.css', 'multiple-groups.expected.css');
    });

    it('Should work correctly with comments in case of 1 group', function() {
      let test = new Test(this, {
        'sort-order': [
          ['border-bottom', 'font-style'],
        ]
      });
      return test.shouldBeEqual('single-group-comments.css', 'single-group-comments.expected.css');
    });

    it('Should work correctly with comments in case of multiple groups', function() {
      let test = new Test(this, {
        'sort-order': [
          ['margin'], ['padding']
        ]
      });
      return test.shouldBeEqual('multiple-groups-comments.css', 'multiple-groups-comments.expected.css');
    });

    it('Should parse semicolons inside data uri correctly', function() {
      let test = new Test(this, {
        'sort-order': [
          ['position', 'background', 'color']
        ]
      });
      return test.shouldBeEqual('data-uri.css', 'data-uri.expected.css');
    });

    it('Should not add more than 1 line between groups', function() {
      let test = new Test(this, {
        'sort-order': [
          ['top'], ['color']
        ]
      });
      let input = test.readFile('multiple-groups-2.css');
      let expected = test.readFile('multiple-groups-2.expected.css');

      const processStringAgain = (processed: string) => {
        return test.comb.processString(processed);
      };

      return test.comb.processString(input)
          .then(processStringAgain)
          .then(processStringAgain)
          .then(processStringAgain)
          .then(processStringAgain)
          .then(processStringAgain)
          .then(function(actual) {
            assert.equal(actual, expected);
          });
    });

    it('Issue 94. Test 1', function() {
      let test = new Test(this);
      test.useConfig('csscomb');
      return test.shouldBeEqual('issue-94-1.css', 'issue-94-1.expected.css');
    });

    it('Issue 94. Test 2', function() {
      let test = new Test(this);
      test.useConfig('csscomb');
      return test.shouldBeEqual('issue-94-2.css', 'issue-94-2.expected.css');
    });

    it('Issue 94. Test 3', function() {
      let test = new Test(this);
      test.useConfig('csscomb');
      return test.shouldBeEqual('issue-94-3.css', 'issue-94-3.expected.css');
    });

    it('Should place the leftovers in the end', function() {
      let test = new Test(this);
      test.useConfig('csscomb');
      return test.shouldBeEqual('leftovers-1.css', 'leftovers-1.expected.css');
    });

    it('Should place the leftovers in the beginning', function() {
      let test = new Test(this);
      let config = test.legacyConfig();
      config['sort-order'][0].unshift(['...']);
      test.comb.configure(config);

      return test.shouldBeEqual('leftovers-2.css', 'leftovers-2.expected.css')
          .then(function() {
            config['sort-order'][0].shift();
          });
    });

    it('Should place the leftovers in the beginning of its group', function() {
      let test = new Test(this);
      let config = test.legacyConfig();
      config['sort-order'][1].unshift('...');
      test.comb.configure(config);
      return test.shouldBeEqual('leftovers-3.css', 'leftovers-3.expected.css')
          .then(function() {
            config['sort-order'][1].shift();
          });
    });

    it('Should place the leftovers in the middle of its group', function() {
      let test = new Test(this);
      let config = test.legacyConfig();
      config['sort-order'][1].splice(1, 0, '...');
      test.comb.configure(config);
      return test.shouldBeEqual('leftovers-4.css', 'leftovers-4.expected.css')
          .then(function() {
            config['sort-order'][1].splice(1, 1);
          });
    });

    it('Should add declaration delimiters if they are missing', function() {
      let test = new Test(this, {'sort-order': ['position', 'z-index']});
      return test.shouldBeEqual('missing-delimiter.css', 'missing-delimiter.expected.css');
    });

    it('Should not duplicate semicolon added by always-semicolon (#622)', function() {
      let test = new Test(this, {
        'always-semicolon': true,
        'sort-order': ['text-align', 'text-transform']
      });
      return test.shouldBeEqual('semicolon-inside-value.css', 'semicolon-inside-value.expected.css');
    });

    it('Should sort custom properties by full name and `$custom-property` (#636)', function() {
      let test = new Test(this, {
        'sort-order': [
          ['$custom-property'],
          ['--gutter', 'margin', 'color']
        ]
      });
      return test.shouldBeEqual('custom-property.css', 'custom-property.expected.css');
    });
  });

  describe('less', function() {
    it('Should sort properties inside rules', function() {
      let test = new Test(this, {
        'sort-order': [['top', 'color']]
      });
      return test.shouldBeEqual('rule.less', 'rule.expected.less');
    });

    it('Should sort properties inside nested rules', function() {
      let test = new Test(this, {
        'sort-order': [['top', 'color']]
      });
      return test.shouldBeEqual('nested-rule-1.less', 'nested-rule-1.expected.less');
    });

    it('Should sort properties divided by nested rules', function() {
      let test = new Test(this, {
        'sort-order': [['top', 'left', 'color']]
      });
      return test.shouldBeEqual('nested-rule-2.less', 'nested-rule-2.expected.less');
    });

    it('Should group declarations with proper comments and spaces (single line)', function() {
      let test = new Test(this, {
        'sort-order': [['top', 'color']]
      });
      return test.shouldBeEqual('comments-1.less', 'comments-1.expected.less');
    });

    it('Should group declarations with proper comments and spaces (multiple lines). Test 1', function() {
      let test = new Test(this, {
        'sort-order': [['top', 'color']]
      });
      return test.shouldBeEqual('comments-2.less', 'comments-2.expected.less');
    });

    it('Should group declarations with proper comments and spaces (multiple lines). Test 2', function() {
      let test = new Test(this, {
        'sort-order': [['$variable', 'color']]
      });
      return test.shouldBeEqual('comments-3.less', 'comments-3.expected.less');
    });

    it('Should group declarations with proper comments and spaces (multiple lines). Test 3', function() {
      let test = new Test(this, {
        'sort-order': [['$variable', 'color']]
      });
      return test.shouldBeEqual('comments-4.less', 'comments-4.expected.less');
    });

    it('Should divide properties from different groups with an empty line', function() {
      let test = new Test(this, {
        'sort-order': [['top'], ['color']]
      });
      return test.shouldBeEqual('different-groups.less', 'different-groups.expected.less');
    });

    it('Should sort variables', function() {
      let test = new Test(this, {
        'sort-order': [['$variable', 'color']]
      });
      return test.shouldBeEqual('variable.less', 'variable.expected.less');
    });

    it('Should sort imports', function() {
      let test = new Test(this, {
        'sort-order': [['$import', 'color']]
      });
      return test.shouldBeEqual('import.less', 'import.expected.less');
    });

    it('Should sort included mixins. Test 1', function() {
      let test = new Test(this, {
        'sort-order': [['$include', 'color', 'border-top', 'border-bottom']]
      });
      return test.shouldBeEqual('mixin-1.less', 'mixin-1.expected.less');
    });

    it('Should sort included mixins. Test 2', function() {
      let test = new Test(this, {
        'sort-order': [['$include', 'top', 'color']]
      });
      return test.shouldBeEqual('mixin-2.less', 'mixin-2.expected.less');
    });

    it('Should sort included mixins. Test 3', function() {
      let test = new Test(this, {
        'sort-order': [['$include', 'border', 'color']]
      });
      return test.shouldBeEqual('mixin-3.less', 'mixin-3.expected.less');
    });

    it('Should sort included mixins with specified name. Test 4', function() {
      let test = new Test(this, {
        'sort-order': [['$include'], ['color'], ['$include media']]
      });
      return test.shouldBeEqual('mixin-4.less', 'mixin-4.expected.less');
    });

    it('Should sort @extend-s', function() {
      let test = new Test(this, {
        'sort-order': [['$extend', 'color']]
      });
      return test.shouldBeEqual('extend.less', 'extend.expected.less');
    });
  });

  describe('sass', function() {
    it('Should sort properties inside rules', function() {
      let test = new Test(this, {
        'sort-order': [['top', 'color']]
      });
      return test.shouldBeEqual('rule.sass', 'rule.expected.sass');
    });

    it('Should sort properties inside nested rules', function() {
      let test = new Test(this, {
        'sort-order': [['top', 'color']]
      });
      return test.shouldBeEqual('nested-rule-1.sass', 'nested-rule-1.expected.sass');
    });

    it('Should sort properties divided by nested rules', function() {
      let test = new Test(this, {
        'sort-order': [['top', 'left', 'color']]
      });
      return test.shouldBeEqual('nested-rule-2.sass', 'nested-rule-2.expected.sass');
    });

    it('Should group declarations with proper comments and spaces (multiple lines)', function() {
      let test = new Test(this, {
        'sort-order': [['top', 'color']]
      });
      return test.shouldBeEqual('comments.sass', 'comments.expected.sass');
    });

    it('Should divide properties from different groups with an empty line', function() {
      let test = new Test(this, {
        'sort-order': [['top'], ['color']]
      });
      return test.shouldBeEqual('different-groups.sass', 'different-groups.expected.sass');
    });

    it('Should sort variables', function() {
      let test = new Test(this, {
        'sort-order': [['$variable', 'color']]
      });
      return test.shouldBeEqual('variable.sass', 'variable.expected.sass');
    });

    it('Should sort imports', function() {
      let test = new Test(this, {
        'sort-order': [['$import', 'color']]
      });
      return test.shouldBeEqual('import.sass', 'import.expected.sass');
    });

    it('Should sort @include-s', function() {
      let test = new Test(this, {
        'sort-order': [['$include', 'color']]
      });
      return test.shouldBeEqual('include.sass', 'include.expected.sass');
    });

    it('Should sort @extend-s', function() {
      let test = new Test(this, {
        'sort-order': [['$extend', 'color']]
      });
      return test.shouldBeEqual('extend.sass', 'extend.expected.sass');
    });

    it('Should sort @include-s with specified name. Test 1', function() {
      let test = new Test(this, {
        'sort-order': [['$include'], ['color'], ['$include media']]
      });
      return test.shouldBeEqual('include-specified-1.sass', 'include-specified-1.expected.sass');
    });

    it('Should sort @include-s with specified name. Test 2', function() {
      let test = new Test(this, {
        'sort-order': [['$include'], ['color'], ['$include media']]
      });
      return test.shouldBeEqual('include-specified-2.sass', 'include-specified-2.expected.sass');
    });

    it('Should sort properties inside blocks passed to mixins', function() {
      let test = new Test(this, {
        'sort-order': [['top', 'color']]
      });
      return test.shouldBeEqual('mixin.sass', 'mixin.expected.sass');
    });

    it('Should handle properties preceeding rulesets', function() {
      let test = new Test(this, {
        'sort-order': [['top', 'left', 'color']]
      });
      return test.shouldBeEqual('ruleset.sass', 'ruleset.expected.sass');
    });

    it('Should handle properties preceeding conditions', function() {
      let test = new Test(this, {
        'sort-order': [['font-size', 'display', 'top', 'color']]
      });
      return test.shouldBeEqual('condition.sass', 'condition.expected.sass');
    });

    it('Issue 332', function() {
      let test = new Test(this, {
        'sort-order': [['color'], ['$include']]
      });
      return test.shouldBeEqual('issue-332.sass', 'issue-332.expected.sass');
    });

    it('Issue 332, test 2', function() {
      let test = new Test(this, {
        'sort-order': [['...']],
        'sort-order-fallback': 'abc'
      });
      return test.shouldBeEqual('issue-332-2.sass', 'issue-332-2.expected.sass');
    });
  });

  describe('scss', function() {
    it('Should sort properties inside rules (single line)', function() {
      let test = new Test(this, {
        'sort-order': [['top', 'color']]
      });
      return test.shouldBeEqual('rule.scss', 'rule.expected.scss');
    });

    it('Should sort properties inside rules (multiple lines)', function() {
      let test = new Test(this, {
        'sort-order': [['top', 'color']]
      });
      return test.shouldBeEqual('rule-multiline.scss', 'rule-multiline.expected.scss');
    });

    it('Should sort properties inside nested rules', function() {
      let test = new Test(this, {
        'sort-order': [['top', 'color']]
      });
      return test.shouldBeEqual('nested-rule-1.scss', 'nested-rule-1.expected.scss');
    });

    it('Should sort properties divided by nested rules', function() {
      let test = new Test(this, {
        'sort-order': [['top', 'left', 'color']]
      });
      return test.shouldBeEqual('nested-rule-2.scss', 'nested-rule-2.expected.scss');
    });

    it('Should group declarations with proper comments and spaces (multiple lines)', function() {
      let test = new Test(this, {
        'sort-order': [['top', 'color']]
      });
      return test.shouldBeEqual('comments-1.scss', 'comments-1.expected.scss');
    });

    it('Should group declarations with proper comments and spaces (single line)', function() {
      let test = new Test(this, {
        'sort-order': [['top', 'color']]
      });
      return test.shouldBeEqual('comments-2.scss', 'comments-2.expected.scss');
    });

    it('Should divide properties from different groups with an empty line', function() {
      let test = new Test(this, {
        'sort-order': [['top'], ['color']]
      });
      return test.shouldBeEqual('different-groups.scss', 'different-groups.expected.scss');
    });

    it('Should sort variables', function() {
      let test = new Test(this, {
        'sort-order': [['$variable', 'color']]
      });
      return test.shouldBeEqual('variable.scss', 'variable.expected.scss');
    });

    it('Should sort imports', function() {
      let test = new Test(this, {
        'sort-order': [['$import', 'color']]
      });
      return test.shouldBeEqual('import.scss', 'import.expected.scss');
    });

    it('Should sort @include-s', function() {
      let test = new Test(this, {
        'sort-order': [['$include', 'color']]
      });
      return test.shouldBeEqual('include.scss', 'include.expected.scss');
    });

    it('Should sort @include-s with specified name', function() {
      let test = new Test(this, {
        'sort-order': [['$include'], ['color'], ['$include media']]
      });
      return test.shouldBeEqual('include-specified.scss', 'include-specified.expected.scss');
    });

    it('Should sort @extend-s', function() {
      let test = new Test(this, {
        'sort-order': [['$extend', 'color']]
      });
      return test.shouldBeEqual('extend.scss', 'extend.expected.scss');
    });

    it('Should sort properties inside blocks passed to mixins', function() {
      let test = new Test(this, {
        'sort-order': [['top', 'color']]
      });
      return test.shouldBeEqual('mixin.scss', 'mixin.expected.scss');
    });

    it('Should handle properties preceeding rulesets', function() {
      let test = new Test(this, {
        'sort-order': [['top', 'left', 'color']]
      });
      return test.shouldBeEqual('ruleset.scss', 'ruleset.expected.scss');
    });

    it('Should handle properties preceeding conditions', function() {
      let test = new Test(this, {
        'sort-order': [['font-size', 'display', 'top', 'color']]
      });
      return test.shouldBeEqual('condition.scss', 'condition.expected.scss');
    });

    it('Should sort complex case with leftovers', function() {
      let test = new Test(this, {
        'sort-order': [
          ['$variable'],
          ['position'],
          ['...', 'border'],
          ['$include'],
          ['font']
        ]
      });
      return test.shouldBeEqual('leftovers.scss', 'leftovers.expected.scss');
    });

    it('Issue 317', function() {
      let test = new Test(this, {'sort-order': ['...']});
      return test.shouldBeEqual('issue-317.scss');
    });

    it('Issue 333', function() {
      let test = new Test(this, {'sort-order': ['...']});
      return test.shouldBeEqual('issue-333.scss');
    });

    it('Issue 399', function() {
      let test = new Test(this, {'sort-order': [['$extend', 'color']]});
      return test.shouldBeEqual('issue-399.scss', 'issue-399.expected.scss');
    });

    it('Should not sort statements inside @function (#555)', function() {
      let test = new Test(this, {'sort-order': ['top', 'color']});
      return test.shouldBeEqual('function.scss', 'function.expected.scss');
    });

    it('Should keep CRLF line breaks between sorted nodes (#593)', function() {
      let test = new Test(this, {'sort-order': ['padding']});
      return test.shouldBeEqual('crlf.scss', 'crlf.expected.scss');
    });
  });

  describe('leftovers and namespaced mixins', function() {
    it('Should not throw on less `&:extend` among leftovers', function() {
      let test = new Test(this, {'sort-order': [['color']]});
      return test.comb.processString('.c { &:extend(.d); top: 0; color: red; }', {syntax: 'less'})
          .then(function(actual) {
            // 只断言顺序; 空白随节点移动是已知问题 #350 / #459
            assert.match(actual, /color: red;\s*&:extend\(\.d\);\s*top: 0;/);
          });
    });

    it('Should sort `@include ns.foo` by `$include ns.foo`', function() {
      let test = new Test(this, {'sort-order': [['$include ns.foo', 'color'], ['$include']]});
      return test.comb.processString('a{@include bar;color:red;@include ns.foo;}', {syntax: 'scss'})
          .then(function(actual) {
            assert.equal(actual, 'a{@include ns.foo;color:red;@include bar;}');
          });
    });
  });

  describe('declaration moved to the top of a multi-line block', function() {
    it('Should take the line break of the old first node', function() {
      let test = new Test(this, {'sort-order': [['e', 'z']], 'space-after-opening-brace': '\n  '});
      return test.comb.processString('a{z:x;a b{c:d}e:f}').then(function(actual) {
        assert.equal(actual, 'a{\n  e:f;\n  z:x;a b{\n  c:d}}');
      });
    });
  });

  describe('scss / sass evaluation order', function() {
    it('Should not move a variable declaration after its use', async function() {
      let test = new Test(this, {'sort-order': [['color', '$variable']]});
      let actual = await test.comb.processString('a{$c:red;color:$c;}', {syntax: 'scss'});
      assert.equal(actual, 'a{$c:red;color:$c;}');
    });
    it('Should still sort a variable declaration that is not used', async function() {
      let test = new Test(this, {'sort-order': [['color', '$variable']]});
      let actual = await test.comb.processString('a{$c:red;color:blue;}', {syntax: 'scss'});
      assert.equal(actual, 'a{color:blue;$c:red;}');
    });
    it('Should not move a variable declaration before an `@include` that reads the outer value', async function() {
      // dart-sass: 原顺序传入外层的 $color, 把声明提前会改为传入 tomato; 顺序不变, 组间也不加空行
      let test = new Test(this, {'sort-order': [['$variable'], ['$include'], ['color']]});
      let input = 'p {\n    @include mixin($color);\n    $color: tomato;\n}\n';
      assert.equal(await test.comb.processString(input, {syntax: 'scss'}), input);
    });
    it('Should move a variable declaration before an `@include` that does not use it', async function() {
      let test = new Test(this, {'sort-order': [['$variable'], ['$include'], ['color']]});
      let actual = await test.comb.processString('p {\n    @include mixin($x);\n    $color: tomato;\n}\n', {syntax: 'scss'});
      assert.equal(actual, 'p {\n    $color: tomato;\n\n    @include mixin($x);\n}\n');
    });
    it('Should keep a flow control assignment before function calls', async function() {
      let test = new Test(this, {'sort-order': [['a', '$variable']]});
      let actual = await test.comb.processString('@if true{$x:1 !global;a:f();}', {syntax: 'scss'});
      assert.equal(actual, '@if true{$x:1 !global;a:f();}');
    });
    it('Should not move `@include` before the mixin definition', async function() {
      let test = new Test(this, {'sort-order': [['$include']]});
      let actual = await test.comb.processString('a{@mixin m{b:c}@include m;}', {syntax: 'scss'});
      assert.equal(actual, 'a{@mixin m{b:c}@include m;}');
    });
    it('Should not move a function call before the `@function` definition', async function() {
      let test = new Test(this, {'sort-order': [['b']]});
      let actual = await test.comb.processString('a{@function f(){@return 1}b:f();}', {syntax: 'scss'});
      assert.equal(actual, 'a{@function f(){@return 1}b:f();}');
    });
    it('Should keep the order of a variable and `variable-exists()`', async function() {
      let test = new Test(this, {'sort-order': [['b', '$variable']]});
      let actual = await test.comb.processString('a{$v:1;b:variable-exists(v);}', {syntax: 'scss'});
      assert.equal(actual, 'a{$v:1;b:variable-exists(v);}');
    });
    it('Should not move a declaration across `@include` that reassigns its variable', async function() {
      let test = new Test(this, {'sort-order': [['w', '$include']]});
      let actual = await test.comb.processString('a{$z:1;@include m{$z:2;}w:$z;}', {syntax: 'scss'});
      assert.equal(actual, 'a{$z:1;@include m{$z:2;}w:$z;}');
    });
    it('Should not move a declaration across `@include` of a mixin with `!global`', async function() {
      let test = new Test(this, {'sort-order': [['w', '$include']]});
      let actual = await test.comb.processString('@mixin m{$z:2 !global;}a{@include m;w:$z;}', {syntax: 'scss'});
      assert.equal(actual, '@mixin m{$z:2 !global;}a{@include m;w:$z;}');
    });
    it('Should not move a declaration across a block setting the same property', async function() {
      let test = new Test(this, {'sort-order': [['color']]});
      let actual = await test.comb.processString('a{@media x{color:red}color:blue;}', {syntax: 'scss'});
      assert.equal(actual, 'a{@media x{color:red}color:blue;}');
    });
    it('Should still move a declaration across a block setting other properties', async function() {
      let test = new Test(this, {'sort-order': [['color']]});
      let actual = await test.comb.processString('a{@media x{top:0}color:blue;}', {syntax: 'scss'});
      assert.equal(actual, 'a{color:blue;@media x{top:0}}');
    });
    it('Should keep the semicolon of `@content` with it', async function() {
      let test = new Test(this, {'sort-order': [['c', 'a']]});
      let actual = await test.comb.processString('@mixin m{a:b;@content;c:d;}', {syntax: 'scss'});
      assert.equal(actual, '@mixin m{a:b;@content;c:d;}');
    });
    it('Should take the line break of the block for a node moved to the top', async function() {
      let test = new Test(this, {'sort-order': [['g']]});
      let actual = await test.comb.processString('c {\n  @font-face { e: f } g: h;\n}', {syntax: 'scss'});
      assert.equal(actual, 'c {\n  g: h;\n  @font-face { e: f }\n}');
    });
    it('Should take the line break of the block for a node with a comment moved to the top', async function() {
      let test = new Test(this, {'sort-order': [['g']]});
      let actual = await test.comb.processString('c {\n  @font-face { e: f } /* x */\n  g: h;\n}', {syntax: 'scss'});
      assert.equal(actual, 'c {\n  /* x */\n  g: h;\n  @font-face { e: f }\n}');
    });
    it('Should keep sorting less variables as before', async function() {
      let test = new Test(this, {'sort-order': [['color', '$variable']]});
      let actual = await test.comb.processString('a{@c:red;color:@c;}', {syntax: 'less'});
      assert.equal(actual, 'a{color:@c;@c:red;}');
    });
  });

  describe('sass line ends and less evaluation order', function() {
    it('Should move the line break ending `@extend` with it', async function() {
      let test = new Test(this, {'sort-order': [['b'], ['$extend']]});
      let actual = await test.comb.processString('.s\n  @extend .e\n  b: c\n.x\n  y: z\n', {syntax: 'sass'});
      assert.equal(actual, '.s\n  b: c\n\n  @extend .e\n.x\n  y: z\n');
    });
    it('Should move the line break after `;` with the statement', async function() {
      let test = new Test(this, {'sort-order': [['d', 'b']]});
      let actual = await test.comb.processString('a\n  b: c; \n  d: e;\n', {syntax: 'sass'});
      assert.equal(actual, 'a\n  d: e;\n  b: c; \n');
    });
    it('Should keep the `\\r` line breaks of the file', async function() {
      let test = new Test(this, {'sort-order': [['d'], ['b']]});
      let actual = await test.comb.processString('a\r  b: c\r  d: e\r', {syntax: 'sass'});
      assert.equal(actual, 'a\r  d: e\r\r  b: c\r');
    });
    it('Should not throw on an empty custom property name', async function() {
      let test = new Test(this, {'sort-order': [['color']]});
      let actual = await test.comb.processString('a {--: b; color: red}', {syntax: 'scss'});
      assert.equal(actual, 'a {color: red;--: b; }');
    });
    it('Should keep the order of less mixin calls at the same position', async function() {
      let test = new Test(this, {'sort-order': [['color']], 'sort-order-fallback': 'abc'});
      let actual = await test.comb.processString('.t{.s();.m(1);}', {syntax: 'less'});
      assert.equal(actual, '.t{.s();.m(1);}');
    });
    it('Should not move a declaration across a less mixin call setting the same property', async function() {
      let test = new Test(this, {'sort-order': [['color']]});
      let actual = await test.comb.processString('.m(){color:yellow}.t{.m();color:blue;}', {syntax: 'less'});
      assert.equal(actual, '.m(){color:yellow}.t{.m();color:blue;}');
    });
    it('Should not sort a less map', async function() {
      let test = new Test(this, {'sort-order': [['a', 'b']]});
      let actual = await test.comb.processString('@m: {b: 1; a: 2;};', {syntax: 'less'});
      assert.equal(actual, '@m: {b: 1; a: 2;};');
    });
    it('Should not throw on a less raw statement', async function() {
      let test = new Test(this, {'sort-order': [['color']]});
      let actual = await test.comb.processString('.c{basically anything;color:red;}', {syntax: 'less'});
      assert.equal(actual, '.c{color:red;basically anything;}');
    });
  });

  describe('sass block holding a single statement', function() {
    it('Should keep the line break that ends the block', function() {
      let test = new Test(this, {'sort-order': [['e']]});
      return test.comb.processString('d\n  @extend\n    a\nb\n  e: f\n', {syntax: 'sass'}).then(function(actual) {
        assert.equal(actual, 'd\n  @extend\n    a\nb\n  e: f\n');
      });
    });
  });

  describe('uppercase property names', function() {
    it('Should match property names case-insensitively and keep their case', async function() {
      let test = new Test(this, {'sort-order': [['position', 'z-index'], ['transition', 'color']]});
      let actual = await test.comb.processString(
          'a{Color:red;Z-INDEX:1;-WEBKIT-Transition:x;Position:absolute}', {syntax: 'css'});
      assert.equal(actual, 'a{Position:absolute;Z-INDEX:1;-WEBKIT-Transition:x;Color:red;}');
    });

    it('Should sort uppercase leftovers alphabetically ignoring case', async function() {
      let test = new Test(this, {'sort-order': ['position', '...'], 'sort-order-fallback': 'abc'});
      let actual = await test.comb.processString('a{Z-INDEX:1;color:red;Position:absolute}', {syntax: 'css'});
      assert.equal(actual, 'a{Position:absolute;color:red;Z-INDEX:1;}');
    });
  });

  describe('space after the opening brace', function() {
    it('Should keep the space after `{` in place (#350)', async function() {
      let test = new Test(this, {
        'sort-order': ['$variable', '$include'],
        'sort-order-fallback': 'abc',
        'space-after-opening-brace': 1
      });
      let actual = await test.comb.processString(
          '.a { .b & { display: inline-block; color: @grey; } }', {syntax: 'less'});
      assert.equal(actual, '.a { .b & { color: @grey; display: inline-block; } }');
    });

    it('Should keep the space after `{` when the first declaration had none', async function() {
      let test = new Test(this, {'sort-order': ['top', 'color']});
      let actual = await test.comb.processString('a{ color:red;top:0}', {syntax: 'css'});
      assert.equal(actual, 'a{ top:0;color:red;}');
    });

    it('Should keep empty lines after `{` (#459)', async function() {
      let test = new Test(this, {
        'sort-order': ['...'],
        'sort-order-fallback': 'abc',
        'space-after-opening-brace': '\n\n',
        'space-before-closing-brace': '\n\n',
        'block-indent': 2
      });
      let actual = await test.comb.processString(
          '.a {\n  height: 1px;\n  &.b {\n    color: white;\n    background: red;\n  }\n}\n', {syntax: 'scss'});
      assert.equal(actual,
          '.a {\n\n  height: 1px;\n  &.b {\n\n    background: red;\n    color: white;\n\n  }\n\n}\n');
    });
  });

  describe('scss nested properties', function() {
    it('Should not add `;` after a nested property block (#622)', async function() {
      let test = new Test(this, {'sort-order': ['font', 'color']});
      let actual = await test.comb.processString(
          'a {\n  color: red;\n  font: {\n    family: x;\n    size: y;\n  }\n}\n', {syntax: 'scss'});
      assert.equal(actual, 'a {\n  font: {\n    family: x;\n    size: y;\n  }\n  color: red;\n}\n');
    });

    it('Should not add `;` after a nested property block with a value', async function() {
      let test = new Test(this, {'sort-order': ['font', 'color']});
      let actual = await test.comb.processString('a { color: red; font: 12px { family: x; } }', {syntax: 'scss'});
      assert.equal(actual, 'a { font: 12px { family: x; } color: red; }');
    });
  });
});
