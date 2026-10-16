# Configure easy-comb

**English** · [简体中文](../zh/docs/configuration.md)

This page shows how to write a config file and how easy-comb finds it; it assumes easy-comb is [installed](install.md).
What each option does is on [Choose option values](options.md).

## Start from the built-in config

**Once a config file is found, the built-in config is not used at all: options you leave out of your file stay off.**
Without a config file, easy-comb uses its built-in config: [src/config/default.ts](../src/config/default.ts) for the options, and the generated [src/config/sort-order.ts](../src/config/sort-order.ts) for the [property order](sort-order.md#use-the-built-in-order).
Copy these files as the starting point for your own config.

## Where easy-comb looks for a config

easy-comb starts in the current directory and moves up one directory at a time, stopping at your home directory or the file system root; in each directory it takes the first file that exists.

- `.csscomb.<ext>` is checked before `csscomb.config.<ext>`.
- For each name, the extensions are tried in this order: `json`, `js`, `cjs`, `mjs`, `ts`, `cts`, `mts`.

The exact list is `CONFIG_FILES` in [src/config.ts](../src/config.ts).
`csscomb --config <path>` skips the search; a missing or broken file is then an error, see [Look up command-line options](command-line.md#look-up-command-line-options).

## Write a typed config

```ts
// csscomb.config.ts
import { defineConfig } from 'easy-comb';

export default defineConfig({
  exclude: ['node_modules/**'],
  'always-semicolon': true,
  'color-case': 'lower',
  'quotes': 'single',
  'sort-order': [['position', 'top'], ['display', 'width', 'height']],
});
```

`defineConfig` and the `Config` type let your editor complete option names and flag invalid values. The doc comments on `Config` are written in Chinese.
JavaScript and TypeScript configs export the config object, as a default export or with `module.exports`, and are loaded with `import()`.
TypeScript configs rely on Node's type stripping, so they need Node.js 22.18+ and may only use erasable syntax (no `enum` or `namespace`).
In a CommonJS project, a `.ts` file is loaded as CommonJS, so a config that uses `export` must be named `.mts`; on older Node.js, use `.mjs` or `.json` instead.

The same config as JSON:

```json
{
    "exclude": ["node_modules/**"],
    "always-semicolon": true,
    "color-case": "lower",
    "quotes": "single",
    "sort-order": [["position", "top"], ["display", "width", "height"]]
}
```

## Settings besides options

Besides the [options](options.md), a config may contain these keys:

| Key | Effect |
| --- | --- |
| `exclude` | Globs relative to the current directory; matching files and directories are skipped, e.g. `["node_modules/**"]`. |
| `syntax` | Extra file extensions and the syntax to parse them with, e.g. `{".wxss": "css"}`. |
| `template` | A stylesheet whose detected style fills in the options this config doesn't set, see [Fill unset options from a template stylesheet](detect-config.md#fill-unset-options-from-a-template-stylesheet). |
| `lint` | Same as `--lint`. |
| `verbose` | Same as `--verbose`. |

## Fix a TypeScript config that fails to load

```text
Error parsing configuration file <path>/csscomb.config.ts.
Cannot load TypeScript config <path>/csscomb.config.ts: Unexpected token 'export'
TypeScript config files are loaded with the native type stripping of Node.js 22.18+ (erasable syntax only; running v26.11.1).
In a CommonJS project a .ts file is loaded as CommonJS, so ESM syntax needs .mts. Otherwise use a .mjs or .json config file.
```

- Cause: Node.js is older than 22.18 and can't strip types; the config uses syntax that can't be erased, such as `enum`; or a `.ts` file with `export` sits in a CommonJS project.
- Fix: upgrade Node.js, remove the non-erasable syntax, or rename the file to `.mts`; if none of these is possible, write the config as `.mjs` or `.json`.
