# Approve dependency install scripts

**English** · [简体中文](../zh/docs/allow-scripts.md)

With `npd-x install`, a dependency's install scripts run only after you approve it; plain `npd` runs every script unless you pass `--no-dangerously-allow-all-scripts`.

## Approve a skipped package

**As in npm 12, a dependency's install scripts run only after the root `package.json` allows it in `allowScripts`.**

1. Run `npd-x install`. Expected: at the end npd prints `<n> package(s) have install scripts that are not in allowScripts and were skipped:`, the packages, and the command to approve them.
2. Run `npd-x approve-scripts esbuild`. Expected: `allowScripts` in `package.json` gains `"esbuild@<installed version>": true`.
3. Run `npd-x rebuild esbuild`. Expected: its install scripts run.

To approve every pending package at once, run `npd-x approve-scripts --all`.

## Know what is gated

- Gated: preinstall / install / postinstall of dependencies, the implicit `node-gyp rebuild` of a dependency that has `binding.gyp`, and the build of git dependencies.
- Not gated: the scripts of the root project and of the local folder dependencies it declares.
- Approved dependency scripts run after the whole dependency tree is linked, as in npm, so a script can load its siblings and peer dependencies; a package's scripts run after those of its own dependencies, and packages that do not depend on each other run in parallel. The root project's scripts run last.
- A `file:` dependency declared by a registry, git or tarball url package follows the approval of its declarer and runs only preinstall / install / postinstall; the skipped list shows it as `<name>@<spec> (declared by <declarer>)`.
- A git dependency needs a build when it declares prepare, build, install or similar scripts, or workspaces; npd reviews it by repository address before the build.
- The build installs the git dependency's own dependencies (including devDependencies) with npd itself, runs no dependency scripts, does not build nested git dependencies, ignores the cloned repository's `allowScripts` and `~/.nprc`, and does not read or write `np-lock.json`.
- A git dependency is built only when it is fetched: after approving one, delete its package folder as the approve output says and run `npd` again.
- npd reviews registry packages by the `name@version` on the registry; when the tarball's `package.json` claims another package, npd warns `manifest mismatch` and does not use the approval of the claimed package.
- `--ignore-scripts` runs no install scripts at all and also skips git dependency builds and the root project's `binding.gyp` build.

## Write allowScripts by hand

Each key in `allowScripts` names packages; `true` allows their install scripts and `false` denies them.

```json
{ "allowScripts": { "esbuild": true, "sharp@0.33.5": true, "core-js": false } }
```

- A key is a package name (all versions), `<name>@<exact version>`, several exact versions joined by `||`, a git address or a tarball url.
- npd ignores ranges and dist-tags with a warning.
- `false` denies; when an allow and a deny entry both match, deny wins.

## Know which policy wins

npd uses only the first source that has a policy, in this order:

1. `--allow-scripts` on the command line
2. `allowScripts` in the root `package.json`
3. pnpm build settings: `onlyBuiltDependencies` allows, `ignoredBuiltDependencies` and `neverBuiltDependencies` deny, `allowBuilds` follows its boolean values; with only `neverBuiltDependencies`, every other dependency is allowed
4. `allow-scripts` in `~/.nprc`

## Set the script flags

These flags override `allowScripts` for one run, or show what the scripts print.

| Flag                              | Effect                                                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--ignore-scripts`                | Run no install scripts, see above                                                                                                                                   |
| `--allow-scripts=<pkg>[,<pkg>]`   | Allow these dependencies, replacing `allowScripts`; mainly for `-g`; can be repeated                                                                                |
| `--strict-allow-scripts`          | Exit non-zero when dependency scripts are not reviewed                                                                                                              |
| `--dangerously-allow-all-scripts` | Ignore `allowScripts` and run every dependency script; off by default, `npd` always adds it, `--no-dangerously-allow-all-scripts` turns it off                      |
| `--foreground-scripts`            | Show the output of dependency install scripts, which run in the background by default; scripts of the root project and local folder dependencies always show output |

For `--strict-allow-scripts` and `--dangerously-allow-all-scripts` the first source that has a setting decides: command line (including what `npd` adds), `npm_config_*`, `~/.nprc`, `.npmrc`, pnpm `strictDepBuilds` / `dangerouslyAllowAllBuilds`, then off. `--ignore-scripts` overrides all of them.

When a background script fails, npd saves its command and full output to a log file; the error message ends with its path, see [Install offline and manage the cache](offline-and-cache.md#find-the-cache).

## Approve or deny with commands

| Command                           | Options                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npd-x approve-scripts <pkg> ...` | `--all`: approve every pending package; `--pending`: only list them; `--no-pin`: write only the name, or the address without a commit |
| `npd-x deny-scripts <pkg> ...`    | `--all`: deny every pending package                                                                                                   |

- `approve-scripts` writes `<pkg>@<installed version>`; for a git dependency it writes the address and commit, for a tarball url dependency the url, both without credentials.
- `approve-scripts` also lists and approves git dependencies that were skipped only because of build scripts such as prepare.
- `approve-scripts` does not approve a package you already denied with `false`; remove the `false` entry by hand first.
- `deny-scripts` writes a `false` entry without a version, as npm does.
- The first write to `allowScripts` merges in the pnpm build settings.
- npd ignores credentials in addresses when it compares entries, so older entries that contain credentials still match.

## Approve scripts for global installs

`npd-x approve-scripts` and `npd-x rebuild` do not support `-g`; pass approvals on the install command instead.

- The globally installed package's own scripts run as usual.
- Its local `file:` dependencies run scripts only when the installed package is allowed with `--allow-scripts=<pkg>` or in `~/.nprc`. npd matches a registry package by name and version.
- When scripts were skipped, npd prints `review them, then reinstall with: npd-x install -g --allow-scripts=<keys> <pkg>`. That command keeps the entries already allowed.
