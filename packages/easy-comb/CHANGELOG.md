# Changelog

**English** · [简体中文](./zh/CHANGELOG.md)

easy-comb is based on [csscomb/csscomb.js](https://github.com/csscomb/csscomb.js) 4.3.0 (commit `ce7ad83`). For earlier upstream releases, see the [csscomb CHANGELOG](https://github.com/csscomb/csscomb.js/blob/master/CHANGELOG.md).

0.0.1 lists all changes relative to csscomb 4.3.0; later versions list only the changes since the previous version.

## 0.0.4 (2026-10-21)

### Changed

- easy-gonz is now required as `~0.0.2` instead of `^0.0.2`, so easy-gonz patch releases install without a new easy-comb release.

### Fixed

- With easy-gonz 0.0.3, which `~0.0.2` installs, two indented Sass cases are fixed: a multi-line comment indented with tabs stays in one piece instead of having its continuation lines split off and moved, and an unquoted `url()` containing `?`, such as `@import url(//fonts.googleapis.com/css?family=Open+Sans)`, is formatted instead of failing to parse (#242).
- `vendor-prefix-align` no longer indents Sass / Less variables (`$x`, `@x`) or custom properties (`--x`) that share a name with a prefixed property; a custom property such as `---webkit-y` no longer makes the following `y` count as its unprefixed form.

## 0.0.3 (2026-10-16)

### Changed

- The CSS parser is now the [easy-gonz](https://www.npmjs.com/package/easy-gonz) package, installed as a dependency, instead of a copy bundled under `vendor/`; parsing results are unchanged, and parser fixes reach you through easy-gonz updates.

### Fixed

- `processString(text, {context})` parses the text as the given node type (such as `declaration` for a declaration list without a selector), instead of ignoring `context` and parsing it as a stylesheet.

## 0.0.2 (2026-10-16)

### Breaking changes

- Unknown command-line options print an error and the help text and exit with `2` without processing any file, instead of being ignored: remove or correct the option; `csscomb --help` lists them ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-comb/docs/command-line.md#read-the-exit-code)).

### Added

- `--version` (`-V`) prints the version of easy-comb ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-comb/docs/command-line.md#look-up-command-line-options)).
- TypeScript config files that fail to load (no type stripping, non-erasable syntax, ESM syntax in a CommonJS project) explain the cause and suggest `.mts`, `.mjs` or `.json` ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-comb/docs/configuration.md#fix-a-typescript-config-that-fails-to-load)).
- `--syntax <name>` parses standard input as `scss`, `less` or `sass` instead of CSS, e.g. `cat main.scss | csscomb --syntax scss -`; files keep the syntax of their extension, and an invalid value exits with `2` ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-comb/docs/command-line.md#format-standard-input)).

### Changed

- Running `csscomb` without paths while standard input is a terminal prints the help text and exits with `1`, instead of doing nothing.
- `exclude` in a config file, found automatically or passed with `--config`, is relative to the config file's directory instead of the current directory, so it also works when `csscomb` runs from a subdirectory or an editor; the built-in config and configs passed to `configure()` stay relative to the current directory. To migrate, rewrite globs written relative to the directory you ran `csscomb` from so that they are relative to the config file's directory ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-comb/docs/configuration.md#settings-besides-options)).
- `template` in a config file is relative to the config file's directory instead of the current directory, like `exclude`. To migrate, rewrite a `template` path written relative to the directory you ran `csscomb` from so that it is relative to the config file's directory ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-comb/docs/detect-config.md#fill-unset-options-from-a-template-stylesheet)).

### Fixed

- Output piped from `csscomb -` and `--detect` is no longer cut off at the pipe buffer size (64 to 128 KB on macOS).
- Nested rules such as `.a{color:#FFF;&:hover{z-index:1}}` no longer fail with `Syntax "undefined" is not supported yet, sorry`.
- `color-case`, `element-case` and `quotes` reject values such as `lowercase` or `xupper` with a warning instead of accepting them.
- The config file search stops at the user's home directory on Windows too.
- A missing path passed to the command line or to `--detect` prints a readable error without a stack trace and exits with `1` before any file is processed.

## 0.0.1 (2026-10-16)

Initial release. Step-by-step migration: [Switch from CSScomb 4.3.0](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-comb/docs/migrate-from-csscomb.md).

### Breaking changes

- The package is now `easy-comb`, versioned from 0.0.1: run `npm uninstall csscomb && npm install easy-comb --save-dev`; the `csscomb` command, the config file names and the built-in config name `'csscomb'` stay the same.
- A global install conflicts with the original `csscomb` package's command: run `npm uninstall csscomb -g` first, or install with `--force`.
- The package is an ES module: use `import Comb from 'easy-comb'`, or `const { default: Comb } = await import('easy-comb')` from CommonJS ([details](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-comb/docs/node-api.md#import-the-package)).
- Node.js `^16.17.0 || >=18.3.0` is required: upgrade Node.js before installing.
- `Comb.getCustomConfig()` returns a Promise: write `await Comb.getCustomConfig()`.
- The `zen` and `yandex` presets are removed, leaving only `csscomb`: copy the preset's options into your own config file.
- Sorting with the built-in config gives a different order, which now follows stylelint-config-recess-order completed with every standard property from mdn-data: run `npx csscomb` once and commit the result.
- The built-in `csscomb` config now ends files with a newline, puts one blank line between rulesets, surrounds combinators with spaces (`a > b`), and removes empty rulesets and units on zero values: run `npx csscomb` once and commit the result, or add a config file, where options you leave out stay off.
- The CLI reads standard input only when there are no path arguments or the argument is `-`, instead of ignoring file arguments whenever standard input is not a terminal: pass `-` explicitly when you pipe input.
- The CLI exits with an error when the `--config` file is missing or fails to parse: fix the path or the file, or drop `--config`.

### Added

- Config files can be `.csscomb.{json,js,cjs,mjs,ts,cts,mts}` or `csscomb.config.{json,js,cjs,mjs,ts,cts,mts}`, with `defineConfig` and the `Config` type for completion and type checking ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-comb/docs/configuration.md#write-a-typed-config)).
- Custom properties (`--foo`) can be sorted, csscomb/csscomb.js#636 ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-comb/docs/sort-order.md#place-custom-properties)).
- `lines-between-rulesets`, `space-between-declarations` and `tab-size` can be detected from a stylesheet, csscomb/csscomb.js#518, csscomb/csscomb.js#519, csscomb/csscomb.js#520 ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-comb/docs/detect-config.md)).
- Less interpolation in property and class names (`padding-@{side}`, `.btn-@{size}`), Less mixin guards and quotes in SCSS interpolation inside strings now parse, through the bundled [easy-gonz](https://github.com/HeavenSky/easy-pkgs/tree/main/packages/easy-gonz) parser (details in its CHANGELOG).
- `lintString`, `lintFile` and `lintPath` report errors for every option, with the option name in the new `option` field; `always-semicolon` errors keep their format ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-comb/docs/node-api.md#read-lint-errors)).
- TypeScript type declarations ship with the package.
- Invalid config values and unknown options print a `console.warn` warning and are ignored.

### Changed

- Vendor-prefixed properties missing from `sort-order` are placed right before their standard property instead of at the end ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-comb/docs/sort-order.md#place-vendor-prefixed-properties)).
- `quotes` keeps the original quotes when the string contains an unescaped target quote, instead of escaping it: `'say "hi"'` stays as is under `quotes: double`, csscomb/csscomb.js#645.
- `unitless-zero` keeps `0%`, which is not equivalent to `0` in `flex`, `text-size-adjust`, Sass color functions and more, and keeps units in custom properties, the `flex` shorthand, preprocessor variables, maps and arithmetic operands such as `0px + 1pt`.
- Installing easy-comb pulls in one runtime dependency, tinyglobby, instead of gonzales-pe, minimist, minimatch, vow, vow-fs and @babel/polyfill.

### Fixed

- Sorting no longer leaves extra semicolons, csscomb/csscomb.js#622.
- `color-shorthand` no longer breaks colors inside `rgba()`, csscomb/csscomb.js#612.
- `quotes` no longer breaks escape sequences in `content` when converting quotes, csscomb/csscomb.js#352.
- `lines-between-rulesets` no longer adds extra indentation (csscomb/csscomb.js#610), no longer puts blank lines between `@import`s (csscomb/csscomb.js#560, csscomb/csscomb.js#619) and keeps the preceding rule's comment in place (csscomb/csscomb.js#577).
- Group sorting works when `...` in `sort-order` is combined with `sort-order-fallback: "abc"`, csscomb/csscomb.js#497.
- `remove-empty-rulesets` also removes empty rules inside media queries, csscomb/csscomb.js#570.
- Sass functions are no longer sorted as properties, csscomb/csscomb.js#555.
- Sass mixins no longer error on Windows or with CRLF line endings: `processString` works on LF internally and restores the original line endings, csscomb/csscomb.js#593.
- `exclude` applies when absolute paths are passed, csscomb/csscomb.js#174.
- camelCase interpolation in SCSS property names is handled, csscomb/csscomb.js#455.
- `strip-spaces` no longer leaves trailing spaces after sorting split whitespace.
- `processFile` returns a Promise, csscomb/csscomb.js#643.
- The built-in config uses `" "` for `space-before-opening-brace` and sets the missing `space-between-declarations`, csscomb/csscomb.js#667.
- The package homepage and documentation links point to the GitHub repository instead of csscomb.com, which expired and was taken over by a third party, csscomb/csscomb.js#661.
- `sort-order` matches property names case-insensitively, so `Z-INDEX` or `Color` no longer fall into the trailing group; the output keeps the original case.
- `sort-order` no longer moves the whitespace after `{` along with the first declaration (csscomb/csscomb.js#350) or removes a blank line after `{` (csscomb/csscomb.js#459).
- `sort-order` no longer adds a stray `;` after SCSS nested properties such as `font: { family: x; }`.
- In compact input, nested rules, Less mixin calls and `@include` move to their own line instead of staying on the line of the previous declaration.
- `vendor-prefix-align` no longer indents an unprefixed property written before its prefixed variants, and no longer aligns properties that aren't adjacent, csscomb/csscomb.js#628.
- The CLI help shows `-c, --config <path>` and `-d, --detect <file>`, and a missing option value prints a readable error instead of a stack trace.
- `remove-empty-rulesets` no longer crashes on indented Sass rules without a block, keeps empty rulesets that still matter (Less `:extend()` selectors, Sass `%placeholder`s, `@extend` and Less mixin-call targets), and leaves whitespace alone when it removes nothing, so a second run changes nothing.
- `eof-newline` no longer adds another line break on every run when the trailing whitespace belongs to the last statement (unclosed at-rules, statements without a semicolon, indented Sass blocks) or sits inside the last token.
- `lines-between-rulesets` gives the same result on a second run, including for indented Sass, blank lines swallowed by the previous statement and rules that followed another rule on the same line, and keeps own-line comments with the next rule and trailing comments with the previous one.
- `space-after-combinator` no longer adds a space after a combinator that ends a selector (`a > {}`, `:is(a +)`) on every run, and no longer turns an indented Sass mixin include `+name` into the selector `+ name`.
- `leading-zero` no longer adds a zero to a number glued to the previous token: `3e-2.1` (two numbers) used to become `3e-20.1`.
