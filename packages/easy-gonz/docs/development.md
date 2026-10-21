# Develop and test easy-gonz

**English** · [简体中文](../zh/docs/development.md)

Change the parser, add test cases and run the same checks as CI; you need Git and Node.js 22 or later (the package itself runs on Node.js 6+).
There is no build step: `src/` is published as is.

## Set up a checkout

1. Clone the repository and go to the package:

    ```bash
    git clone https://github.com/HeavenSky/easy-pkgs.git
    cd easy-pkgs/packages/easy-gonz
    ```

2. Install the dependencies:

    ```bash
    npm ci
    ```

3. Run the tests; every test passes on a clean checkout:

    ```bash
    npm test
    ```

## Write code that runs on Node.js 6

Code under `src/` and `bin/` must only use syntax Node.js 6 supports: no `**`, async functions, object spread or rest, or optional chaining.
Linting and formatting run from the repository root: `npm run lint:check` runs oxlint and `npm run fmt:check` runs oxfmt; `npm run lint` and `npm run fmt` also apply the fixes.

## Add parser test cases

Parser cases live in `test/corpus/<syntax>/<context>.txt`, one file per syntax and root node type:

- Each case is a `=== name` line, the input, a `---` line and the expected tree.
- The tree has one node per line as `type start-end [{syntax}] ["content"]`.
- Add the suffix ` [skip]` to the `===` line to skip a case.

Cases identical in several syntaxes live once in `test/corpus/shared/<context>.txt` as `=== name [css less]` (or `=== name [css less] [skip]`), with `{*}` as the root syntax. This case from `test/corpus/shared/ident.txt` runs in all four syntaxes:

```text
=== 2 [css less sass scss]
-x
---
ident 1:1-1:2 {*} "-x"
```

After an intended parser change, rewrite the expected trees and review the diff:

```bash
npm run test:update
```

When one syntax gives a different tree for a shared case, `test:update` moves that syntax's copy of the case out of `shared/` into the syntax's own file.

## Run the tests

`npm test` runs the parser cases in `test/corpus/`, the node API tests and the CLI tests with `node:test`.
A failing parser case prints the expected and actual trees as a diff.

`npm run test:compat` runs only the parser cases without `node:test`, so it works on every Node.js version the package supports.

To see the tree of one string, pipe it to `bin/gonzales.js`; `-c` picks the context and `--simple` prints an outline instead of JSON:

```bash
printf 'a-23' | node bin/gonzales.js -s css -c ident -
```

## Run the official test suites

`npm run test:official` checks every valid case of the official CSS, Sass and Less test suites and compares the result with the known failures in `test/official-baseline.json`.
Each case must parse, print back byte for byte, and match the structure of the reference parser; the rules are in [gonz.mjs](../../_official_style_suites/gonz.mjs).
It needs Node.js 22.18 or later.

1. From the repository root, install the reference parsers:

    ```bash
    (cd packages/_official_style_suites && npm ci)
    ```

2. From the repository root, download the suites at the commits pinned in [suites.json](../../_official_style_suites/suites.json) into `.cache/official/`:

    ```bash
    node packages/_official_style_suites/fetch.mjs
    ```

3. From `packages/easy-gonz`, run the check; it prints one summary table with a row per suite and fails on any new failure:

    ```bash
    npm run test:official
    ```

When a change makes a known failure pass, remove it from the baseline in the same change with `npm run test:official -- --update`.
`npm run test:official -- --gap <suite>` lists the cases of that suite the postcss stack passes and easy-gonz does not; `<suite>` is a row name of the table, such as `less` or `sass-spec-scss`.

## Report a bug

Open an issue in [HeavenSky/easy-pkgs](https://github.com/HeavenSky/easy-pkgs/issues) with the input, the `syntax` you passed and the output of `gonzales --simple`.
