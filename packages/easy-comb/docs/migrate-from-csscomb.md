# Switch from CSScomb 4.3.0

**English** · [简体中文](../zh/docs/migrate-from-csscomb.md)

This page replaces CSScomb 4.3.0 with easy-comb in an existing project and lists what to check afterwards; it assumes the project already runs `csscomb` with npm.
The command, the config file names and the option names stay the same, so most projects only need step 1 and step 4.

## Replace the package

1. Swap the dependency:

    ```bash
    npm uninstall csscomb && npm install easy-comb --save-dev
    ```

    `npx csscomb --help` now prints easy-comb's help. For a global install, see [Install globally](install.md#install-globally).

2. If you call CSScomb from code, import it as an ES module and await `getCustomConfig()`, which now returns a promise:

    ```js
    import Comb from "easy-comb";
    const comb = new Comb(await Comb.getCustomConfig());
    ```

    From CommonJS, see [Import the package](node-api.md#import-the-package).

3. If your config used the `zen` or `yandex` preset, copy that preset's options into your own config file; only `'csscomb'` remains as a built-in config name.
4. Run `npx csscomb` once on all your stylesheets, review the diff and commit it. The built-in property order and some built-in options changed, so the first run reorders files even if nothing else changed.

If a script pipes files into `csscomb` while also passing paths, pass `-` instead of paths: standard input is now read only when there are no path arguments or the argument is `-`, see [Format standard input](command-line.md#format-standard-input).
The full list of changes is in the [CHANGELOG](../CHANGELOG.md).

## Compare with CSScomb 4.3.0

|                                             | CSScomb 4.3.0                                                  | easy-comb                                                                                      |
| ------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Maintained                                  | No                                                             | Yes                                                                                            |
| Parser                                      | Gonzales PE (no longer maintained)                             | [easy-gonz](../../easy-gonz/README.md) (maintained fork)                                       |
| Less `padding-@{side}`, `.btn-@{size}`      | Parse error                                                    | Supported                                                                                      |
| Unlisted vendor-prefixed properties         | Placed at the end                                              | Placed before the standard property                                                            |
| Custom properties (`--foo`) in `sort-order` | Not supported                                                  | Supported                                                                                      |
| Built-in property order                     | Hand-maintained list                                           | Generated from recess-order and mdn-data                                                       |
| Built-in configs                            | `csscomb`, `zen`, `yandex`                                     | `csscomb`                                                                                      |
| Config files                                | `.csscomb.json`                                                | json, js, cjs, mjs, ts, cts, mts, with `defineConfig`                                          |
| Module format                               | CommonJS                                                       | ESM with TypeScript declarations                                                               |
| Runtime dependencies                        | gonzales-pe, minimist, minimatch, vow, vow-fs, @babel/polyfill | easy-gonz, tinyglobby                                                                          |
| Official CSS, SCSS, Less and Sass suites    | Not checked                                                    | All 18,461 valid cases pass ([how to reproduce](contributing.md#run-the-official-test-suites)) |
