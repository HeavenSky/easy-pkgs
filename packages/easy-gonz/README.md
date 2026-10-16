# easy-gonz

**English** · [简体中文](./zh/README.md)

Parse CSS, Less, SCSS and indented Sass into one editable syntax tree that prints back byte for byte.

[![npm version](https://img.shields.io/npm/v/easy-gonz.svg)](https://www.npmjs.com/package/easy-gonz)
[![npm downloads](https://img.shields.io/npm/dm/easy-gonz.svg)](https://www.npmjs.com/package/easy-gonz)
[![license](https://img.shields.io/npm/l/easy-gonz.svg)](./MIT-LICENSE.txt)

easy-gonz is for tools that read or rewrite stylesheets: formatters, linters, codemods and dependency scanners.
It is a maintained fork of gonzales-pe 4.3.0 with the same API, node types and `gonzales` command, and it parses syntax that 4.3.0 rejects, such as Sass modules, CSS nesting and Less guards.
Unlike postcss, easy-gonz covers all four syntaxes with one parser and returns selectors and values as nodes, not strings.

## Rename a variable and keep everything else

This script renames `$w` to `$width` in an SCSS file that uses Sass modules:

```js
const gonzales = require('easy-gonz');

const ast = gonzales.parse(`@use 'sass:math';
.card {
  width: math.div($w, 2); // half width
  @include theme.shadow;
}`, { syntax: 'scss' });

// Rename $w to $width everywhere.
ast.traverseByType('variable', (node) => {
  const name = node.first('ident');
  if (name.content === 'w') name.content = 'width';
});

console.log(ast.toString());
```

It prints:

```scss
@use 'sass:math';
.card {
  width: math.div($width, 2); // half width
  @include theme.shadow;
}
```

**Only the renamed variable changes**: the comment, spacing and layout come back exactly as written.
gonzales-pe 4.3.0 throws on the same input (`Please check validity of the block starting from line #4`).

## Get started

1. Install the package:

   ```bash
   npm install easy-gonz
   ```

2. Print the tree of a rule as an outline; the first line is `-> stylesheet`:

   ```bash
   printf 'a { color: red }' | npx gonzales -s css --simple -
   ```

3. Check the round trip in code; it prints `true`:

   ```bash
   node -e "const g = require('easy-gonz'); const src = '.a { &:hover { color: red } }'; console.log(g.parse(src).toString() === src)"
   ```

Coming from gonzales-pe, change one line, then read [Migrate from gonzales-pe](docs/migrate-from-gonzales-pe.md) if your code matches on node types:

```diff
- const gonzales = require('gonzales-pe');
+ const gonzales = require('easy-gonz');
```

## Build on one tree that keeps every byte

- Rewrite without side effects: `parse(src).toString() === src` holds for every valid case of the official test suites below, comments, whitespace and indented Sass line endings (`;`, `\r\n`, `\r`, `\f`) included.
- Write one tree walker for four syntaxes, down to selectors and values: `syntax: 'css' | 'less' | 'scss' | 'sass'` all produce the same [node types](docs/node-types.md), and selectors, values, function arguments and interpolation are nodes too.
- Parse today's stylesheets: Sass modules, CSS nesting, `:has(> a)`, `:nth-child(… of S)`, media range syntax, Less guards, mixins, `@{}` / `${}` interpolation and `$prop`, and the indented Sass syntax improvements.
- Keep going on broken CSS and Less: invalid statements become `raw` nodes instead of errors, as in postcss.
- Switch from gonzales-pe in one line: same `parse` / `createNode` / `Node` API and `gonzales` options, no runtime dependencies, Node.js 6+.

Each valid case must parse, print back byte for byte, and match the structure of the reference parser (the postcss stack; indented Sass has none).
The check is [gonz.mjs](../_official_style_suites/gonz.mjs), run by `npm run test:official` against the suite versions pinned in [suites.json](../_official_style_suites/suites.json); setup steps are in [Run the official test suites](docs/development.md#run-the-official-test-suites).

| Suite | Syntax | Valid cases | easy-gonz | postcss stack |
| --- | --- | --: | --: | --: |
| [WPT](https://github.com/web-platform-tests/wpt) parsing tests | CSS | 4,414 | 100% | 99.9% |
| WPT `<style>` blocks | CSS | 715 | 100% | 98.0% |
| [css-parsing-tests](https://github.com/SimonSapin/css-parsing-tests) | CSS | 1,243 | 100% | 98.1% |
| [sass-spec](https://github.com/sass/sass-spec) | SCSS | 11,456 | 100% | 99.5% |
| sass-spec | indented Sass | 348 | 100% | not supported |
| [less.js test-data](https://github.com/less/less.js/tree/master/packages/test-data) | Less | 285 | 100% | 87.4% |

The postcss stack is postcss, postcss-scss and postcss-less, with selectors and values re-parsed by postcss-selector-parser and postcss-value-parser.
Every case it passes, easy-gonz passes too.

## Know when another parser fits better

Use postcss with postcss-scss or postcss-less if you need its plugin ecosystem and do not need indented Sass.
Use @csstools/css-parser-algorithms if you parse only CSS and want component values exactly as the CSS Syntax spec defines them.
easy-gonz still throws on most invalid SCSS and indented Sass, so it is not an error-tolerant parser for those two syntaxes.

| Parser | Syntaxes | Selectors and values | Runtime deps | Node.js |
| --- | --- | --- | --- | --- |
| easy-gonz | CSS, Less, SCSS, Sass | Nodes | none | >=6 |
| gonzales-pe 4.3.0 | CSS, Less, SCSS, Sass | Nodes | minimist | >=0.6 (declared) |
| postcss 8 + postcss-scss / postcss-less | CSS, SCSS, Less | Strings; extra parsers needed | 3 | >=12 |
| postcss-sass 0.5.0 | Sass, converted from a gonzales-pe 4.3.0 tree | Strings (postcss AST) | gonzales-pe 4.3.0, postcss | ^10, ^12, >=14 |
| sugarss 5 | SugarSS, a different indented syntax | Strings (postcss AST) | postcss (peer) | >=18 |
| sass-parser 0.4 (Sass team) | CSS, SCSS, Sass | Not assessed here | postcss, sass | >=18 |
| @csstools/css-parser-algorithms 4 | CSS only | Generic component values | @csstools/css-tokenizer (peer) | >=20.19 |

Of these, only easy-gonz and gonzales-pe 4.3.0 read all four syntaxes with one API and give selectors and values their own nodes.

## Read more

- [Documentation index](docs/README.md): every guide by task.
- [API reference](docs/api.md): `parse` options, node methods, parsing errors and the `gonzales` command.
- [Node types](docs/node-types.md): what each syntax produces and how nodes nest.
- [Migrate from gonzales-pe](docs/migrate-from-gonzales-pe.md): what stays the same and which trees change.
- [Develop and test easy-gonz](docs/development.md): corpus format, `npm test` and the official suites.
- [CHANGELOG](./CHANGELOG.md): changes in each version.
- [easy-comb](../easy-comb/README.md), the maintained CSScomb fork, is built on easy-gonz.
- Report bugs and ideas in [issues](https://github.com/HeavenSky/easy-pkgs/issues).

## License

[MIT](./MIT-LICENSE.txt); forked from [Gonzales PE](https://github.com/tonyganch/gonzales-pe) by Tony Ganch, whose [playground](https://tonyganch.io/gonzales-pe/) runs the original parser.
