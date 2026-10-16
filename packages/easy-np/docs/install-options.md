# Choose what gets installed

**English** · [简体中文](../zh/docs/install-options.md)

By default `np` installs every dependency in `package.json`; package names, dependency types and `overrides` narrow or change that. Pick your entry point first ([Choose np or np-x install](install.md#choose-np-or-np-x-install)).

## Name the packages

`np [<pkg> ...] [options]` accepts the same options as `np-x install`.

- `<pkg>` can be `<name>[@<tag|version|range>]`, `<alias>@npm:<name>`, a local folder, a tarball file, a tarball URL, a git URL or `<user>/<repo>`.
- Without `<pkg>`, `np` installs the dependencies in `package.json`.
- With `<pkg>`, `np` installs and saves only these packages; it does not refresh the other dependencies and does not run the root package's lifecycle scripts.

Options for other areas are on their own pages: [lockfile](lockfile.md#use-the-lockfile-options), [install scripts](allow-scripts.md#use-the-script-options), [registry and network](registry.md#use-the-registry-and-network-options), [cache](registry.md#use-the-cache-options) and [workspaces and hoisting](workspaces.md#use-the-workspace-and-hoisting-options).

## Pick dependency types

`<type>` names a field of the root `package.json`: `prod` is `dependencies`; `dev`, `optional` and `peer` are the matching `*Dependencies`; any other type is `<type>Dependencies` (for example cnpm's `client`, `build` and `isomorphic`). Every option below accepts any type.

| Option                                          | Meaning                                                                                   |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `--only=<type>[,...]`                           | Install only these fields                                                                 |
| `--include=<type>[,...]`                        | Also install these fields                                                                 |
| `--omit=<type>[,...]`, `--exclude=<type>[,...]` | Skip these fields                                                                         |
| `--prod`                                        | Same as `--only=prod`                                                                     |
| `--production`                                  | Same as `NODE_ENV=production`                                                             |
| `--write=<type>`                                | With `<pkg>`, save to this field instead of `dependencies`; only the `=` form is accepted |
| `--write-exact`                                 | Save the exact version instead of a `^` range                                             |
| `--no-save`, `--no-write`                       | Do not change `package.json`                                                              |
| `--engine-strict`                               | Refuse packages whose `engines.node` does not match the current Node.js                   |

- Without `--only`, `np` installs `prod`, `dev` and `optional`; `--production` or `NODE_ENV=production` adds `--omit=dev`.
- `--omit=optional` also skips optional dependencies across the whole tree; `--omit=peer` stops installing missing peerDependencies automatically.
- `--only` selects exactly the listed root fields; optional dependencies and missing peers inside the tree are still installed.
- A type listed in both `--include` and `--omit` is installed.
- A custom type with no matching field in the root or any workspace `package.json` is an error.
- Without `--only`, non-standard fields that are not installed produce a warning.
- A repeated single-value option takes its last value, as npm does; `--allow-scripts`, `--only`, `--include` and `--omit` merge all values.

## Force versions with overrides

easy-np applies npm `overrides` from the root `package.json`; in a workspace project only the workspace root is read.

- Supported forms: a package name, a `name@<range>` selector, nested objects, and `.` and `$name` references.
- `overrides` does not rewrite the direct dependencies of the root `package.json`.
- When `resolutions` exists as well, `overrides` wins.

## Install globally and control the output

| Option           | Meaning                                            |
| ---------------- | -------------------------------------------------- |
| `-g, --global`   | Install into the global directory                  |
| `--prefix=<dir>` | Global prefix, defaults to `npm config get prefix` |
| `--detail`       | Print detailed logs                                |
| `--trace`        | Print memory and CPU usage during the install      |
