# Changelog

easy-gonz is based on [tonyganch/gonzales-pe](https://github.com/tonyganch/gonzales-pe) 4.3.0 (commit `ab2e8ae` on the dev branch). For earlier upstream releases, see the [gonzales-pe CHANGELOG](https://github.com/tonyganch/gonzales-pe/blob/dev/CHANGELOG.md).

0.0.1 lists all changes relative to gonzales-pe 4.3.0; later versions list only the changes since the previous version.

## 0.0.2 (2026-10-16)

### Breaking changes

- Indented Sass `math.div(1, 2)` and other module member calls that already parsed are now a `module` node followed by a `function`, as in SCSS (was `ident` + `class` + `parentheses`). Migrate: match the `module` node where you matched the namespace `ident`; see [Check code that walks the tree by node type](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-gonz/docs/migrate-from-gonzales-pe.md#check-code-that-walks-the-tree-by-node-type).

### Added

- `-v` / `--version` prints the package version ([Run the gonzales command](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-gonz/docs/api.md#run-the-gonzales-command)).

### Fixed

- Indented Sass module members such as `math.$pi`, `ns.$var: 1`, `+ns.foo` and `@include ns.foo` now parse into `module` nodes instead of throwing, matching SCSS.
- `import { parse, createNode } from 'easy-gonz'` now works in Node ESM; `require('easy-gonz')`, the default import and `lib/gonzales.js` are unchanged.
- `parse(css, { context: 'namespace' })` now returns a `namespaceSeparator` node in all syntaxes instead of a node whose `type` is `undefined`.
- The `gonzales` command no longer truncates large output written to a pipe.
- The `gonzales` command reports an unsupported or missing `--syntax` value, an unsupported file extension or an unreadable file with a readable message and exit code 1, instead of a TypeError or a silent exit.
- The `gonzales` command reads upper-case file extensions such as `.SCSS` and `.CSS`.

## 0.0.1 (2026-10-16)

Initial release, a drop-in replacement for gonzales-pe 4.3.0; see [Migrate from gonzales-pe](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-gonz/docs/migrate-from-gonzales-pe.md).

### Breaking changes

- The package is now `easy-gonz`, restarting at 0.0.1; the command is still `gonzales` and the API is unchanged. Migrate: run `npm install easy-gonz` and replace `require('gonzales-pe')` with `require('easy-gonz')` (deep imports become `easy-gonz/lib/gonzales`).
- CSS and Less no longer throw on invalid input; unrecognized text becomes `raw` nodes. Migrate: pass [`recover: false`](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-gonz/docs/api.md#gonzalesparsecss-options) to `parse` to throw as before.
- SCSS module members become a `module` node followed by a `function`, `variable` or `ident`: `math.div(1px, 2)` was `ident` + `class` + `parentheses`, and `@include ns.mixin` was cut after `ns`. Migrate: match the `module` node where you matched the namespace `ident`.
- SCSS custom property values that are not plain values (`--x: {a: b}`) are one `raw` node instead of `block` and `declaration` nodes. Migrate: read the value from the `content` of the `raw` node.
- Other inputs that 4.3.0 parsed into a wrong tree now give the corrected tree, among them scientific notation, quoted interpolation in SCSS strings, indented Sass line endings and some Less statements. Migrate: if you match on node types, check the list in [Check code that walks the tree by node type](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-gonz/docs/migrate-from-gonzales-pe.md#check-code-that-walks-the-tree-by-node-type).
- The webpack UMD bundle and the browser global `gonzales` are gone; `main` is now `src/gonzales.js`. Migrate: bundle `easy-gonz` with your own bundler to use it in a browser.
- Node.js 6 or later is required (gonzales-pe declared `>=0.6.0`). Migrate: run on Node.js 6+.
- The parsing error's `version` and the `Gonzales PE version:` line of its `toString()` report the easy-gonz version. Migrate: do not compare that value with gonzales-pe versions.
- The `gonzales` command no longer trims file input, so positions match the file and trailing whitespace becomes a final `space` node; `--simple` ends with a line of dashes instead of an empty line. Migrate: trim the file and pipe it in with `-` if you need the old positions.

### Added

- SCSS parses Sass module members: `math.div()`, `math.$pi`, `@include ns.mixin`, `ns.fn()` and `ns.$var` in arguments, and `ns.$var: 1` (#319); the namespace is the new `module` node in [Node types](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-gonz/docs/node-types.md).
- CSS parses native nesting: nested rules (`.a { .b {} }`, `.a { > .b {} }`) are `ruleset` nodes under `block`, and `&` (`&:hover`, `.b &`, `@scope (&)`, `@supports selector(&)`) is a `parentSelector`, as in SCSS.
- CSS parses media query range syntax (`(width >= 0)`, `(400px <= width <= 700px)`), with comparison operators as `operator` nodes.
- CSS parses relative selectors (`:has(> a)`, `:has(+ a, ~ b)`) into `selector` nodes under `arguments`.
- CSS parses other selector arguments into nodes: `:nth-child(… of S)`, custom idents (`:state(--foo)`, `::part(--foo)`), number lists (`:heading(1, 2)`) and any other pseudo-class or pseudo-element argument (`::part(label)`), plus the draft class-prefix selector `.foo-*`.
- CSS recovers from invalid input per the CSS Syntax spec instead of throwing: blocks, brackets, strings and escapes left open at the end, unmatched `}`, and invalid selectors and declarations become `raw` nodes following postcss's rules ([`parse`](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-gonz/docs/api.md#gonzalesparsecss-options)).
- CSS accepts empty declarations (`a{b:}`, `a{foo:;}`), which get an empty `value` node.
- CSS accepts `!important` in any case, with whitespace or comments between `!` and `important`.
- CSS parses scientific notation (`12e2`, `1E-3`, `34e+1%`), with the exponent inside the `number` node.
- CSS parses `{}` blocks in values and function arguments (`--x: { a }`, `paint(foo, {})`) into `block` nodes.
- CSS custom property declarations win over rules of the same shape (`--x:hover { }` is a declaration), their value runs to the `;` or the end of the block, and they are allowed at the top level.
- CSS parses at-keywords in values (`@rgba()`) as `atkeyword` and stray `!`, `.`, `<`, `>` or unmatched brackets as `operator` nodes.
- CSS accepts top-level `<!--` and `-->` (`raw` nodes), rules without a selector (`{}`), ids that are not identifiers (`#1`, `#-2`) and `--foo` as a type selector.
- CSS and SCSS accept the IE property hack `*zoom`, with `*` inside the property's `ident`, as Less does.
- SCSS parses rest arguments (`1...`, `[1, 2]...`, `(a b)...`, with `...` as an `operator`) and `@include … using (…)`.
- SCSS accepts consecutive combinators and selectors starting with one (`> > a`, `a ~ > b`).
- SCSS accepts the CSS selector arguments, `.foo-*`, `--foo` type selectors, `!important` in any case and scientific notation listed above.
- SCSS custom property declarations win over rules of the same shape; values that parse as regular values keep their usual structure, and others (`--x: {a: b}`, empty values, `foo!bar`) become one `raw` node.
- SCSS keeps arbitrary content inside special functions and at-rule parentheses (`-a-calc(@#$)`, `@supports (a !&$;{…})`) as a `raw` node when it is not regular arguments.
- SCSS parses plain CSS functions `@function --name()` whose `result` holds arbitrary tokens, and `/* */` inside interpolation.
- Less parses mixin definitions inside blocks, including guards, `...` and anonymous `.()`.
- Less parses statement-level function calls (`each(…);`) as `function` nodes and `$prop` property accessors as `ident` `$prop`.
- Less parses `${x}` interpolation (`interpolation`), `@{}` interpolation in selectors, at-rule preludes and property names, and `@{map[key]}` lookups.
- Less parses `--x` custom properties (first child `customProperty`; the value may be empty or hold a block) and property merging `+:` / `+_:` (`operator`).
- Less parses keyframes `0% {}` inside blocks, `^` / `^^` combinators, backtick JavaScript, property name hacks such as `*zoom`, and class and variable names starting with a digit.
- Less falls back to postcss's rules for any other statement: with a block it is a `ruleset` or `atrule` (`raw` plus `block`), with a colon a `declaration` (one `raw` each in `property` and `value`), otherwise an `atrule` or `include` (`raw`), so Less no longer throws on invalid input.
- Indented Sass continues a statement over a line break where it is not complete: inside parentheses and square brackets, after a trailing comma, operator, `:` or unfinished at-rule, and before a line that can only start with a continuation keyword; these line breaks are `space` nodes inside the statement.
- Indented Sass accepts statements ending with `;`, and `declarationDelimiter` keeps what was written (`;`, `\n`, `\r\n`, `\r`, `\f`) instead of always `\n`.
- Indented Sass accepts `/* */` in the middle of values, `@include … using (…)`, whitespace before rest arguments (`$b ...`) and `=a` without a body.
- Indented Sass parses nested properties (a more deeply indented `d: e` under `b: c`, with a `block` in the value), curly braces in custom property values (`raw`) and `\:nth-child()`.
- Indented Sass parses a style rule alone on its line with no child block (`a`) into a `ruleset` holding only a `selector`.
- New `parse` option [`recover`](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-gonz/docs/api.md#gonzalesparsecss-options) (default `true`): with `false`, CSS and Less throw the gonzales-pe 4.3.0 parsing error instead of recovering.
- TypeScript declarations ship in `gonzales.d.ts` ([API reference](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-gonz/docs/api.md)).

### Changed

- The package has no runtime dependencies: minimist is gone and the `gonzales` command parses its own arguments, with unchanged usage.
- Indented Sass ends a selector at a line break (`a⏎+ b` and `@extend .a⏎.c` are two statements each), matching dart-sass.
- Indented Sass ends the statement at a combinator that ends a selector line (`a >⏎b`), matching dart-sass; an operator at the end of a declaration value still continues it.

### Fixed

- Less interpolation in property and class names (`padding-@{side}`, `.btn-@{size}`) no longer throws.
- Less `url('a' b)` keeps the text after the string.
- Less variable names starting with a digit (`@2x`) and selector interpolation (`@{selector} {}`) no longer throw (#75).
- Less format function `%()` no longer throws (#141, #142).
- Less mixin guards and CSS guards (`when`) no longer throw (#121, #146).
- Less selectors ending in `&` (`input&`, `input[type=button]&`) no longer throw (#124).
- Sass unquoted `@import ../a` and `@import ~a` no longer throw (#204).
- SCSS and Sass strings with quoted interpolation (`"a #{"b"}"`) are no longer truncated (#239).
- SCSS and Sass variables starting with `$--` no longer throw (#296).
- Extra commas in CSS and SCSS selectors (`a,, b`) no longer crash the parser (#238).
- Sass keeps a top-level `//` comment that follows a blank line after a nested block at the top level instead of moving it into that block (#266).
- Sass multi-line comments with blank lines or with `*/` on its own line no longer throw (#252).
- CSS `url()` with a string followed by other content or with whitespace (`url('a' b)`, `url(a b)`) no longer hangs the parser; it is a regular function.
- Empty input keeps its `syntax`, so `toString()` returns `''` instead of printing `Syntax "undefined" is not supported` and returning `undefined`.
- Comments left open at the end of CSS, Less and SCSS input (`/* x`) print back exactly instead of gaining a `*/`; the end position of a lone `/*` in indented Sass is correct.
- CSS and SCSS end a number at its exponent: `3e-2.1` is `number` `3e-2` followed by `number` `.1` instead of one number.
- `:nth-child(An+B of S)` and `:nth-last-child(An+B of S)` read An+B as in `:nth-child(2n + 1)` (`+` is an `operator`, not a `combinator`), followed by `ident` `of` and a `selector` list; Less no longer falls back to `raw` and indented Sass no longer reads it as a declaration.
- SCSS no longer treats `//` inside `url-prefix()`, `domain()` and uppercase `URL()` as a comment.
- Indented Sass parses a selector whose pseudo-class parentheses span lines (`a:b(c⏎  )`) followed by a nested block as a `ruleset` instead of declarations.
- Indented Sass parses a top-level `+name` with a nested block as an `include` holding that block, as it already did when nested; `+ a` and `+.a` remain selectors.
- `gonzales --simple` no longer references an undefined variable for its last line, and the help text spells the command name correctly.
