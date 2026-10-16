# Migrate from npminstall

**English** · [简体中文](../zh/docs/migrate-from-npminstall.md)

Moving a project from [cnpm/npminstall](https://github.com/cnpm/npminstall) 6.x keeps the flat layout: you mainly delete the old `node_modules`, rename the config file and replace removed flags. easy-npd's code originates from npminstall 6.8.0.

## Switch a project over

1. Install easy-npd: `npm i -g easy-npd`.
2. Delete the `node_modules` installed by npminstall: npd treats it as unfinished.
3. Move `~/.cnpmrc` to `~/.nprc` if you have one.
4. Run `npd` where you ran `npminstall`, and `npd-x <command>` where you ran `npmuninstall`, `npmupdate` or `npmlink`. Expected: the same flat `_<name>@<version>@<name>` layout.
5. Replace removed and unknown flags in scripts and CI; an unknown flag fails with `unknown option <flag>`, see [Pass only options npd knows](install-packages.md#pass-only-options-npd-knows); a removed flag stops the install with `--<flag> has been removed, <hint>`, and the table in [Replace removed commands, flags and features](#replace-removed-commands-flags-and-features) gives the replacement.

## Find what was renamed

| Item                                    | npminstall                                                                          | easy-npd                                                                                                           |
| --------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Package and commands                    | package `npminstall`; commands `npminstall`, `npmlink`, `npmuninstall`, `npmupdate` | package `easy-npd`; commands `npd` and `npd-x`                                                                     |
| User configuration file                 | `~/.cnpmrc`                                                                         | `~/.nprc`, shared with easy-np                                                                                     |
| Cache folder                            | `~/.npminstall_tarball`, environment variable `npminstall_cache`                    | `~/.np_tarball`, environment variable `np_cache`; both accept `npm_config_cache`; the old cache layout is not read |
| Install-complete marker                 | `__npminstall_done` in each package's `package.json`                                | `node_modules/.npd-state.json`; delete an npminstall `node_modules` before switching                               |
| User-Agent, log prefix, debug namespace | `npminstall`                                                                        | User-Agent `easy-npd/<version>`, log prefix and debug namespace `npd`                                              |

## Know the behavior differences

These npminstall features still exist but behave differently in ways that affect use.

| Item                               | npminstall                                                                                            | easy-npd                                                                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Install failure                    | stops at the first error                                                                              | installs the other packages; rerunning continues where each stopped                                                         |
| Root hoisted links                 | skipped when the link exists, not updated when dependencies change                                    | always the highest version; packages declared in the root `package.json` are not overwritten                                |
| Missing peerDependencies           | warning only                                                                                          | installed automatically as in npm 7+, skipped like optional dependencies on failure                                         |
| Version selection                  | ignores `engines`                                                                                     | prefers versions whose `engines.node` matches, as npm does                                                                  |
| Tarball integrity                  | sha1 only                                                                                             | strongest algorithm in `dist.integrity`                                                                                     |
| Registry credentials               | `.nprc` username / password attached by substring match; `always-auth` attaches them to every request | `.npmrc` `_authToken` and `.nprc` username / password are sent only to the registry's own host; `always-auth` has no effect |
| Dependency install scripts         | all run                                                                                               | all run with `npd`; with `npd-x install` only when approved in `allowScripts`                                               |
| `npd-x uninstall`                  | keeps hoisted links; can return before `package.json` is written                                      | removes hoisted links nothing uses; returns after `package.json` is written                                                 |
| Git dependencies                   | fetched through pacote, built with `npm install`                                                      | git CLI (git must be installed), built with npd itself                                                                      |
| Corrupt tarball in the cache       | every retry reads the same broken file                                                                | deleted and downloaded again                                                                                                |
| Repeated single-value flags        | some keep the first value, some become arrays and fail                                                | the last one wins as in npm; `--allow-scripts`, `--only`, `--include`, `--omit` merge all values                            |
| `--from-package-lock` load failure | warns, resolves online and exits 0                                                                    | fails with an error                                                                                                         |
| `--proxy`, `--strict-ssl`          | accepted but without effect                                                                           | work, see [Choose registries and network settings](registry.md#go-through-a-proxy-or-a-custom-ca)                           |
| `--production`                     | disables the disk cache and forces detailed logs                                                      | same as `NODE_ENV=production`; the cache and log level are unchanged                                                        |
| Lockfile                           | dependency tree file via `--dependencies-tree`                                                        | `np-lock.json`, which also locks git commits and tarball integrity, see [Lock versions with np-lock.json](lockfile.md)      |

## Replace removed commands, flags and features

A removed command-line flag stops the install with a hint; removed environment variables and `package.json` settings such as `npm_china` and `config.npminstall.*` are no longer read and cause no error.

| Item                                                                       | What it did                                               | Now                                                                                                               |
| -------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Commands `npminstall`, `npmuninstall`, `npmupdate`, `npmlink`              | one command per task                                      | `npd` and `npd-x <command>`                                                                                       |
| `-S/--save`                                                                | save to `dependencies`                                    | removed; packages are saved to `dependencies` by default                                                          |
| `-D/--save-dev`, `-O/--save-optional`                                      | save to that field                                        | `--write=dev`, `--write=optional`; `npd-x uninstall` also uses `--write`                                          |
| `-E/--save-exact`                                                          | save the exact version                                    | `--write-exact`                                                                                                   |
| `--client`, `--save-client`, `--save-build`, `--save-isomorphic`           | install or save cnpm's three extra dependency fields      | `--only`, `--include`, `--write=<type>`; these fields are no longer installed by default                          |
| `--no-optional`, `--legacy-peer-deps`                                      | skip optional dependencies, do not install peers          | `--omit=optional`, `--omit=peer`                                                                                  |
| `--production` disabling the disk cache, `--cache-strict`                  | no cache in production mode                               | removed; `--production` uses the cache, pass `--no-cache` to skip it                                              |
| `--root`                                                                   | set the project folder                                    | removed; run npd in that folder                                                                                   |
| `--lockfile-path`                                                          | install from package-lock.json                            | renamed to `--from-package-lock`                                                                                  |
| `-d`                                                                       | short for `--detail`                                      | removed; use `--detail`                                                                                           |
| `--fetch-only`, `--rebuild`                                                | fetch and rebuild as install flags                        | removed; use `npd-x fetch`, `npd-x rebuild`                                                                       |
| `--dependencies-tree`, `--save-dependencies-tree`                          | install from or save a dependency tree file               | removed; replaced by `np-lock.json`                                                                               |
| `--flatten`, `--fix-bug-versions`, `--tarball-url-mapping`                 | version fixes and tarball address rewriting               | removed                                                                                                           |
| `--high-speed-store`                                                       | load an external script as tarball cache                  | removed                                                                                                           |
| `-c`, `--china`, `npm_china`                                               | switch to npmmirror and the binary mirror                 | removed; automatic registry switching replaces them                                                               |
| `--custom-china-mirror-url`                                                | replace the binary mirror address                         | removed                                                                                                           |
| `--prune`, `config.npminstall.prune`, `env:production` / `env:development` | skip files from a fixed list when extracting              | removed: the list includes `tsconfig.json`, `LICENSE` and more, and silently broke packages such as `@tsconfig/*` |
| `--force-link-latest`                                                      | overwrite existing hoisted links with higher versions     | removed; the highest version is always linked                                                                     |
| `--disable-dedupe`, `config.npminstall.disableDedupe`                      | turn off flat root links                                  | removed                                                                                                           |
| `npd-x uninstall --ignore-scripts`                                         | declared without effect                                   | removed; passing it is an error                                                                                   |
| preuninstall / uninstall / postuninstall on uninstall                      | ran the removed package's scripts, outside `allowScripts` | removed; uninstall runs no lifecycle scripts, as in npm 7+                                                        |

Changes per release are in the [CHANGELOG](../CHANGELOG.md); upstream history is in the [npminstall 6.x CHANGELOG](https://github.com/cnpm/npminstall/blob/6.x/CHANGELOG.md).
