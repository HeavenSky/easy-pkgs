# Install packages

**English** · [简体中文](../zh/docs/install-packages.md)

`npd` installs what `package.json` declares, or adds and saves the packages you name; flags choose which dependency fields are installed and where new packages are saved. This page assumes npd is installed as in [Install npd and pick an entry point](install.md).

## Install project dependencies or add packages

Run `npd [<pkg> ...] [options]`; `npd-x install` takes the same arguments.

```bash
npd                       # install the dependencies in package.json
npd lodash@4 ./local-lib  # install and save only these two packages
```

- Without `<pkg>`, npd installs the dependencies in `package.json` and runs the root package's lifecycle scripts.
- With `<pkg>`, npd installs and saves only those packages; it does not refresh the other dependencies or run the root lifecycle scripts.
- Without `<pkg>` in a folder that has no `package.json`, npd fails and writes nothing, as npm does.
- `<pkg>` can be `<name>[@<tag|version|range>]`, `<alias>@npm:<name>`, a local folder, a tarball file, a tarball url, a git url or `<user>/<repo>`.
- npd clones git dependencies with the git CLI, so you need git installed.
- npd installs missing peerDependencies automatically, as npm 7+ does; when that fails, npd skips them like optional dependencies and warns.
- When a flag that takes one value is passed more than once, the last one wins, as in npm; `--allow-scripts`, `--only`, `--include` and `--omit` merge all their values.

### Pass only options npd knows

An unknown option stops the command with exit code 1 and names the closest known option, so a typo such as `--frozen-lockfle` cannot silently turn a check off.

- Options of other package managers that npd does not support, such as `--workspaces`, `--shamefully-hoist` and `--public-hoist-pattern`, fail the same way.
- An unknown option written as `--key=value` is accepted and, as in npm, passed to install scripts as `npm_config_<key>`, for example a binary mirror address; it has no other effect.
- Arguments after `--` are not checked.
- The error text is listed in [Fix common errors](troubleshooting.md#npd-rejects-an-unknown-option).

### How a version is picked

For a range or a missing version, npd picks the way npm does: versions that are not deprecated first, then versions whose `engines.node` matches the current Node.js, then the highest.

- Example: on Node 18, `npd -g npm` installs npm 10.
- If only deprecated versions match the range, npd selects one of them and warns.
- npd uses explicit tags and exact versions as written.
- Without a version, the log shows the package as `<name>@*`.
- `--engine-strict` rejects packages whose `engines.node` does not match the current Node.js.

## Choose which dependency fields are installed

A `<type>` names a field in the root `package.json`: `prod` is `dependencies`; `dev`, `optional` and `peer` are the matching `*Dependencies`; any other type is `<type>Dependencies` (for example cnpm's `client`, `build`, `isomorphic`). Every flag below accepts any type.

| Flag                                            | Effect                        |
| ----------------------------------------------- | ----------------------------- |
| `--only=<type>[,...]`                           | Install only these fields     |
| `--include=<type>[,...]`                        | Also install these fields     |
| `--omit=<type>[,...]`, `--exclude=<type>[,...]` | Skip these fields             |
| `--prod`                                        | Same as `--only=prod`         |
| `--production`                                  | Same as `NODE_ENV=production` |

- Without `--only`, npd installs `prod`, `dev` and `optional`; `--production` or `NODE_ENV=production` adds `--omit=dev`.
- `--omit=optional` also skips optional dependencies across the whole tree; `--omit=peer` stops installing missing peerDependencies.
- `--only` installs exactly the listed fields and nothing else; packages in the tree still get their own optional dependencies and missing peers.
- A type in both `--include` and `--omit` is installed.
- A custom type with no matching field in `package.json` is an error.
- Without `--only`, npd skips non-standard fields such as `clientDependencies` and warns about them; it never installs non-standard fields of dependencies.

## Save packages to package.json

When you pass `<pkg>`, npd saves it to `dependencies` with a `^` range unless you say otherwise.

| Flag                      | Effect                                                                      |
| ------------------------- | --------------------------------------------------------------------------- |
| `--write=<type>`          | Save to that field instead of `dependencies`; only the `=` form is accepted |
| `--write-exact`           | Save the exact version instead of a `^` range                               |
| `--no-save`, `--no-write` | Do not modify `package.json`                                                |

- The range prefix comes from `npm config get save-prefix`; if npm does not answer within 30 seconds, npd uses `^`.
- The saved name and version are the ones on the registry, not the ones the tarball's `package.json` claims.

## Install globally and see more output

`-g` installs into the global folder; `--detail` and `--trace` show what the install is doing.

| Flag             | Effect                                             |
| ---------------- | -------------------------------------------------- |
| `-g, --global`   | Install into the global folder                     |
| `--prefix=<dir>` | Global prefix, defaults to `npm config get prefix` |
| `--detail`       | Print detailed logs                                |
| `--trace`        | Print memory and CPU usage during the install      |

- `npd -g` with several packages installs each of them and keeps going when one fails, see [Resume a failed install](resume.md).
- Which install scripts run for global installs is described in [Approve dependency install scripts](allow-scripts.md#approve-scripts-for-global-installs).

## Override nested dependency versions

npd reads npm `overrides` from the root `package.json`: package names, `name@<range>` selectors, nested objects, and `.` and `$name` references.

```json
{ "overrides": { "foo": "1.0.0", "bar@^2": { "baz": "$baz" } } }
```

- Overrides do not rewrite the direct dependencies of the root `package.json`.
- When `resolutions` is also present, `overrides` wins.
