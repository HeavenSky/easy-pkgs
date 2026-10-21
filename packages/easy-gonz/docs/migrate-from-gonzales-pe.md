# Migrate from gonzales-pe

**English** · [简体中文](../zh/docs/migrate-from-gonzales-pe.md)

Move a project from gonzales-pe 4.3.0 to easy-gonz and find the places where your code may notice a difference; you need Node.js 6 or later.
easy-gonz parses everything gonzales-pe 4.3.0 parses, so most projects only change the package name.
Every change is also listed per version in the [CHANGELOG](../CHANGELOG.md).

## Switch the package

1. Replace the dependency:

    ```bash
    npm uninstall gonzales-pe && npm install easy-gonz
    ```

2. Change the import; deep imports such as `easy-gonz/lib/gonzales` work too:

    ```diff
    - const gonzales = require('gonzales-pe');
    + const gonzales = require('easy-gonz');
    ```

3. Run your tests. If they fail, look for the cause in the sections below, starting with [Check code that walks the tree by node type](#check-code-that-walks-the-tree-by-node-type).

## Keep using the same API

The API stays the same: everything below works in easy-gonz as it does in gonzales-pe 4.3.0.

- `require('easy-gonz')` exports `parse` and `createNode`; `easy-gonz/lib/gonzales` is the same module.
- `parse` takes the same `syntax`, `context` and `tabSize` options with the same defaults, plus the new `recover` option; every `context` value of 4.3.0 is still supported.
- `Node` has the same own properties (`type`, `content`, `syntax`, `start`, `end`) and the same enumerable prototype methods with the same return values: `removeChild()` returns an array, `first()` and `last()` return `null` or `undefined`, and `forEach()` and `eachFor()` return `null` when the callback returns `null`.
- Parsing errors have the same fields and are still not `Error` instances.
- The `gonzales` command keeps its options and defaults, including `--no-silent` and `--silent=false`, and exits as before on valid input and parsing errors.

A script compares easy-gonz with the published gonzales-pe 4.3.0 package: module exports, `parse` options and errors, every `Node` method and property, `createNode`, the `gonzales` command, and the trees of the corpus under `test/corpus/` plus every valid case of the official test suites.
For most inputs that both parse, the trees are identical, position fields included.
Almost all of the trees that differ are sass-spec SCSS cases, mostly because of the new `module` node; the rest come from the corrections below.

## Check code that walks the tree by node type

gonzales-pe 4.3.0 returned a wrong tree for the inputs below, and easy-gonz returns the corrected one.
Code that matches on node types or child positions may need an update.

- SCSS and indented Sass module members: 4.3.0 read `math.div(10px, 3)` as `ident` `math`, `class` `.div` and `parentheses` in both syntaxes, cut `@include ns.mixin` short after `ns` in SCSS, and threw on other module members in indented Sass. **easy-gonz returns a `module` node (holding `ident` `math`) followed by a `function`, `variable` or `ident`**, so the namespace is no longer a direct `ident` child of `value`, `include` or `atrule`. Most SCSS and indented Sass code that uses `@use` sees this change.
- SCSS strings with quoted interpolation (`"#{"a"}"`) were cut at the inner quote, the rest becoming separate nodes; they are now one `string`.
- Scientific notation: `1e3px` was `number` `1` with unit `e3px`, and `1.5E-2` was `number` `1.5` plus `ident` `E-2`; they are now `dimension` `1e3px` and `number` `1.5E-2`. A number ends after its exponent: `3e-2.1` is `number` `3e-2` followed by `number` `.1`.
- If the value of an SCSS or indented Sass custom property is not a plain value (such as `--x: {a: b}`), the whole value is one `raw` node, matching Sass and postcss-scss; CSS and Less still parse such a value into `block` and other child nodes. For SCSS, 4.3.0 parsed the braces into `block` and `declaration` nodes; for indented Sass, it threw.
- Indented Sass:
    - `declarationDelimiter` keeps what was written (`;`, `\r\n`) instead of always `\n`.
    - A selector ends at a line break: `a⏎b` is two rules, as in dart-sass.
    - A top-level `//` comment after a nested block stays at the top level.
    - A line that ends with an operator, `,` or a keyword such as `not` continues on the next line.
    - A selector whose parentheses span lines (`a:b(c⏎  )`) followed by a nested block is a `ruleset`, not declarations.
    - A top-level `+name` with a nested block is an `include` holding that block, as it already was when nested, not a `ruleset` starting with a `+` combinator.
- Less:
    - `@page :first {}` is an `atrule`, not a `declaration`.
    - `.@{x}-class {}` is a `ruleset`, not a `mixin`.
    - Backtick JavaScript is one `ident`.
    - A `value` no longer swallows a following block: `a {b: c}` parsed with `context: 'value'` stops before the block.
- These arguments used to be cut short or lose text and are now complete nodes: `url-prefix()` and `domain()` arguments with `//`, `url()` with a string followed by other text, and `:has(> a)`-style arguments.
- In `:nth-child(2n + 1 of .a)` and `:nth-last-child(… of …)`, the An+B part is read as in `:nth-child(2n + 1)` (`+` is an `operator`), followed by `ident` `of` and the `selector` list.
- An unclosed comment at the end of input (`/* x`) ended past the last character; its `end` is now the last character.

## Keep validating CSS and Less

To keep validating CSS or Less with `parse()`, pass `recover: false`: invalid input then throws the parsing error as in 4.3.0; see [gonzales.parse](api.md#gonzalesparsecss-options).
Without it, easy-gonz no longer throws on invalid CSS and Less: like postcss, it puts unrecognized text in `raw` nodes.
easy-gonz still throws on most invalid SCSS and indented Sass, but accepts much more valid syntax than 4.3.0, such as Sass modules, `@include … using` and multi-line statements.

## Check the smaller differences

- Empty input: the root node has `syntax` set to the requested syntax instead of `undefined`, so `toString()` returns `''` instead of printing `Syntax "undefined" is not supported` and returning `undefined`.
- The parsing error's `version` and the `Gonzales PE version:` line of its `toString()` give the easy-gonz version.
- The `gonzales` command no longer trims a file before parsing it, so positions match the file and a trailing newline shows up as a final `space` node; stdin was never trimmed. `--simple` ends with a line of dashes as deep as the last node instead of an empty line.
- The `gonzales` command adds `-v` / `--version`, reads upper-case extensions such as `.SCSS`, and reports an unsupported or missing `--syntax`, an unsupported file extension or an unreadable file with a message and exit code `1`; see [Run the gonzales command](api.md#run-the-gonzales-command).
- There is no webpack UMD bundle and no browser global `gonzales`; bundle the package yourself to use it in a browser.
- detective-sass and detective-scss (used by precinct and madge) keep finding the same imports, also find imports in files 4.3.0 could not parse, and no longer report module namespaces such as `math` as dependencies.
