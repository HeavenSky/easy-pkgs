# Use easy-comb from Node.js

**English** · [简体中文](../zh/docs/node-api.md)

This page shows how to format and lint files and strings from your own scripts; it assumes easy-comb is [installed](install.md) in the project.
The package is an ES module with TypeScript declarations; the full signatures are in [src/core.ts](../src/core.ts) and [src/csscomb.ts](../src/csscomb.ts).

## Import the package

```js
import Comb from "easy-comb";
```

From CommonJS, load it with `const { default: Comb } = await import('easy-comb')`.
On Node.js 20.19+ and 22.12+, `require('easy-comb')` also works; the class is then on `.default`.

## Format files and strings

```js
import Comb from "easy-comb";

const comb = new Comb(await Comb.getCustomConfig()); // nearest config file
await comb.processPath("assets/css");

const css = await new Comb("csscomb").processString("a{color:#FFF}");
```

`new Comb(config?)` creates an instance with all built-in options registered.
`config` is a config object, or `'csscomb'` for the built-in config; without it, every option stays off.

## Instance methods

All instance methods return promises, except `configure` and `use`, which return the instance.

| Method                                                                                            | Result                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `processPath(path)`, `processDirectory(path)`, `processFile(path)`                                | Fix files in place. `processFile` resolves with `1` if the file changed, `0` if not, or `undefined` if the file is skipped (unsupported extension or `exclude`); `processDirectory` resolves with an array of `1`/`0`, one per file; `processPath` resolves like `processFile` for a file and like `processDirectory` for a directory. |
| `processString(text, {syntax, filename})`                                                         | Resolve with the fixed string. `syntax` is `css`, `less`, `sass` or `scss` and defaults to `css`.                                                                                                                                                                                                                                      |
| `lintPath(path)`, `lintDirectory(path)`, `lintFile(path)`, `lintString(text, {syntax, filename})` | Resolve with an array of errors; `lintDirectory`, and `lintPath` on a directory, resolve with one such array per file. See [Read lint errors](#read-lint-errors).                                                                                                                                                                      |
| `configure(config)`                                                                               | Apply a config. Invalid values and unknown options are reported with `console.warn` and ignored. `exclude` globs are relative to the current directory.                                                                                                                                                                                |
| `use(option)`                                                                                     | Register a custom option, see [`OptionDefinition`](../src/option.ts).                                                                                                                                                                                                                                                                  |

## Static methods

| Method                                                                     | Result                                                                                                                                                                           |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Comb.getConfig(name?)`                                                    | A copy of the built-in config; `name` can only be `'csscomb'`.                                                                                                                   |
| `Comb.getCustomConfig(path?)`                                              | A promise of the config loaded from `path`, or from the [nearest config file](configuration.md#where-easy-comb-looks-for-a-config); `null` if none is found or it fails to load. |
| `Comb.getCustomConfigPath(path?)`                                          | The path of the config file `getCustomConfig()` would load, or `null`.                                                                                                           |
| `Comb.detectInFile(path, options?)`, `Comb.detectInString(text, options?)` | The options detected in a stylesheet; `options` is a list of option names that limits which ones are detected.                                                                   |

`getCustomConfig()` ignores `template`; only the `csscomb` command fills options in from a [template stylesheet](detect-config.md#fill-unset-options-from-a-template-stylesheet).

## Read lint errors

Each error is `{message, line, column, context, option?}`; `line` and `column` start at 1, and `context` shows the surrounding lines.

- `always-semicolon` reports every missing semicolon, without `option`.
- easy-comb checks every other option by running it alone. If that would change the code, it reports one error with `option` set to the option name, at the position of its first change.
- An option is only reported when the full config would also change the code there, so options that work together raise no false alarms. For example, when `space-after-opening-brace` resets the whitespace and `block-indent` re-indents it, neither is reported unless the final output differs.

The command-line `--lint` flag does not use these errors: it reports every file that `processPath` would change.
