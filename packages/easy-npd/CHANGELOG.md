# Changelog

**English** · [简体中文](./zh/CHANGELOG.md)

easy-npd starts from [cnpm/npminstall](https://github.com/cnpm/npminstall) 6.8.0; for upstream history see the [npminstall 6.x CHANGELOG](https://github.com/cnpm/npminstall/blob/6.x/CHANGELOG.md) and the older [History.md](https://github.com/cnpm/npminstall/blob/6.x/History.md).

0.0.0 lists every change relative to npminstall 6.8.0; later versions list changes relative to the previous version.

## Unreleased

### Fixed

- On Windows, the registry, token and other settings in `~/.nprc` are read when the file has LF line endings, e.g. when it was written by a script or copied from macOS or Linux.

## 0.0.8 (2026-10-23)

### Added

- While dependency scripts run in the background, the spinner shows each running script with its elapsed time and the bytes its Node.js http / https requests have downloaded (for example a prebuilt binary), so a long download no longer looks like a hang. With `--detail` or without a terminal, a line is printed every 10 seconds for each script still running.
- While packages install, the spinner also shows how many package versions have been resolved and how many tarball bytes have been downloaded, with the average speed, and refreshes every second, so a large download no longer looks like a hang.

### Changed

- After an interrupted install, `npd` prints one line with the number of packages it continues instead of one `[npd:resume]` line per package; `--detail` still lists every package.
- The start and finish line of each dependency script (`scripts.<name> ... run` and `... finished in`) and the `found binding.gyp` notice are printed only with `--detail`, and on stdout instead of stderr, as in easy-np; failures and the final `Run <n> scripts` line are still printed.

## 0.0.7 (2026-10-22)

### Breaking changes

- Package folders move from `node_modules/_<name>@<version>@<name>` into `node_modules/.npd/`, so the root of `node_modules` keeps only the package links, and the install state moves to `node_modules/.npd/.npd-state.json`. The first full `npd` in an existing project removes the old folders and installs them again from the disk cache. To migrate, change configs that match `node_modules/_<name>` paths (for example jest `transformIgnorePatterns`) to `node_modules/.npd/_<name>`, and have scripts that find the project from their own folder (`__dirname` plus `../..`) read `INIT_CWD` instead.
- The root project's `preinstall` now runs after its dependencies are installed, together with its `install` and `postinstall`, as in npm 7+ and easy-np. To migrate, move a step that must run before dependencies are installed (for example one that generates a `file:` dependency) into a command you run before `npd`.

### Changed

- Approved dependency scripts, `preinstall` and the implicit `node-gyp rebuild` included, now run after the whole dependency tree is linked, as in npm and easy-np, so a script can load its siblings and peer dependencies. A package's scripts run after those of its own dependencies, and packages that do not depend on each other run in parallel (up to 10 at a time) instead of one by one.
- When a script of a package inside an optional dependency fails, the already linked optional dependency is removed again, as in npm; the next `npd` retries it.
- `npd-x rebuild <pkg> ...` reruns the listed packages in dependency order, whatever order you list them in.
- The stages recorded for resuming are now `deps`, `preinstall`, `install`, `postinstall` and `finish`, as in easy-np; a package that an older version left between its `preinstall` and `install` reruns its `preinstall` once.

## 0.0.6 (2026-10-21)

### Changed

- `npd` and `npd-x install` warn when the project has an `npm-shrinkwrap.json` or `package-lock.json` but `np-lock.json` is not read (it is missing, or the lockfile is off, as it is by default for `npd`), because the versions in the npm lockfile are not used; pass `--from-package-lock=<file>` to install them.
- `npd-x install` warns when `np-lock.json` and another package manager's lockfile both exist, because they are updated separately and may lock different versions.
- `--from-package-lock` with a lockfileVersion 1 file now says to regenerate it with npm 7 or later; the help and docs state that `npm-shrinkwrap.json` is accepted too.

## 0.0.5 (2026-10-16)

### Breaking changes

- Unknown options fail with exit code 1 and suggest the closest known option, including options npd never supported such as `--workspaces`, `--shamefully-hoist` and `--public-hoist-pattern`, which were silently ignored; `--key=value` and arguments after `--` still pass through. To migrate, fix or drop the option named in the error. [Pass only options npd knows](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/docs/install-packages.md#pass-only-options-npd-knows)

### Changed

- Usage and config errors print only the message, the npd version and the command line, not a stack trace.
- `npd-x install` without `package.json` and without package names fails and writes nothing, like npm.
- Documentation is now in English, with a Chinese translation under `zh/`; the guide is split into [one page per task](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/docs/README.md).
- npd now requires Node.js 14.19.3 or later (up from 14.18.0), the minimum urllib 3.27.3 declares; on Node.js 14.18 upgrade Node.js first.
- The package now ships an `npm-shrinkwrap.json`, and tar and urllib are pinned to the tested versions (7.5.22 and 3.27.3), so installing with npm resolves the whole dependency tree at tested versions and a later minor release cannot pull in APIs that Node.js 14 and 16 lack. On Node.js 14 and 16, `EBADENGINE` warnings during install are expected and harmless; with `engine-strict` on, install with `--engine-strict=false` or use Node.js 18 or later. [Run on older Node.js and build native modules](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/docs/node-versions.md)

### Fixed

- No more DEP0169 `url.parse()` warnings on Node 26 when building registry and tarball URLs.
- The install summary shows `speed 0B/s` instead of `speed null/s` when nothing was downloaded.
- `npd-x --version` and `npd-x install -v` print `npd-x v<version>`.
- `--frozen-lockfile` failures now say to run `npd-x install` to update `np-lock.json`.

## 0.0.4 (2026-10-10)

### Breaking changes

- `npd` is now `npd-x install` plus `--no-lockfile --dangerously-allow-all-scripts`, and environment variables and config files cannot change those two flags; to get the lockfile or script review with `npd`, pass `--lockfile` / `--frozen-lockfile` or `--no-dangerously-allow-all-scripts` on the command line.
- Removed install flags now fail with a hint naming the replacement; to migrate, follow the hint or the [removed flags table](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/docs/migrate-from-npminstall.md#replace-removed-commands-flags-and-features).
- Dependency types are chosen with `--only`, `--include`, `--omit` (same as `--exclude`) and `--write=<type>`, where `prod` means `dependencies` and any other type means `<type>Dependencies`; `--prod` is `--only=prod` and `--production` is `NODE_ENV=production`; to migrate, replace the old flags as listed below.
- `-S/--save`, `-D/--save-dev`, `-O/--save-optional` and `-E/--save-exact` are removed, also on `npd-x uninstall`; to migrate, use `--write=<type>` and `--write-exact`.
- `--no-optional` and `--legacy-peer-deps` are removed; to migrate, use `--omit=optional` and `--omit=peer`.
- `--client`, `--save-client` and the other cnpm flags are removed, and `clientDependencies` and similar non-standard fields are no longer installed by default (a full install warns about them) or from dependencies; to migrate, use `--include=<type>` or `--write=<type>`.
- `--root` is removed; to migrate, run npd in that folder.
- `--lockfile-path` is renamed to `--from-package-lock` and `-d` is removed; to migrate, use `--from-package-lock` and `--detail`.
- `--flatten`, `--fix-bug-versions`, `--tarball-url-mapping`, `--high-speed-store`, `--dependencies-tree`, `--save-dependencies-tree` and `--cache-strict` are removed; to migrate, drop them, and use `np-lock.json` instead of dependency tree files.
- The install flags `--fetch-only` and `--rebuild` are removed; to migrate, run `npd-x fetch` and `npd-x rebuild`.
- `--production` no longer disables the disk cache or forces detailed logs; to migrate, add `--no-cache` or `--detail` if you relied on that.
- `npd-x uninstall` keeps only the aliases `rm` and `remove`, and `npd-x rebuild` loses `rb`; to migrate, use those aliases or the full names.
- `npd-x uninstall` now reclaims version folders nothing links to, keeps folders other packages use, no longer runs preuninstall / uninstall / postuninstall (as in npm 7+), and rejects `--ignore-scripts`; to migrate, drop `--ignore-scripts` from uninstall commands.
- `.npmrc` `_authToken` and `~/.nprc` username / password are sent only to the registry's own host, and `always-auth` no longer sends them elsewhere; to migrate, configure credentials for each registry host you use.
- Dependency install scripts run in the background without output; to migrate, pass `--foreground-scripts` to see it (scripts of the root project and local folder dependencies always show output).
- `registry` in `~/.nprc` now selects the install registry (order: `--registry` > `npm_registry` > `~/.nprc` > `.npmrc` / `npm_config_registry`); to migrate, remove it from `~/.nprc` if it was meant only for credentials.
- `-c` / `--china`, `--custom-china-mirror-url`, `--prune`, `--force-link-latest` and `--disable-dedupe` now fail instead of swallowing the package name after them; to migrate, drop them.
- `np_lockfile` now wins over `config.np.lockfile` instead of either `false` turning the lockfile off; to migrate, set the value you want in `np_lockfile`.

### Added

- Failed background install scripts save their command and full output to `np-script-logs/` in the cache folder, and the error ends with the log path; logs older than 7 days are deleted. [Find the cache](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/docs/offline-and-cache.md#find-the-cache)
- Registry switching covers npm, yarn, alibaba (npmmirror), tencent and huawei and retries across the fastest three, up to 6 attempts; the first run after upgrading probes again. [Let npd switch public registries](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/docs/registry.md#let-npd-switch-public-registries)
- npm and pnpm settings are read by both entry points: pnpm build settings and `lockfile` from `pnpm-workspace.yaml` or the `pnpm` field, and registries, script flags and lockfile keys from `.npmrc`. [Know which files are read](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/docs/configuration.md#know-which-files-are-read)
- With only pnpm `neverBuiltDependencies` configured, scripts of all other dependencies are allowed. [Know which policy wins](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/docs/allow-scripts.md#know-which-policy-wins)
- `.npmrc` registry `_authToken` is read. [Send credentials only where they belong](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/docs/registry.md#send-credentials-only-where-they-belong)
- `--no-write` (same as `--no-save`), `--lockfile`, `--prefer-offline` and `npd-x update --clean-only`. [Install packages](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/docs/install-packages.md)
- Subcommand aliases `npd-x approve` and `npd-x deny`, and `-v` on every subcommand. [Find the command for a task](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/docs/install.md#find-the-command-for-a-task)

### Changed

- `--frozen-lockfile` now implies `--lockfile`.
- Error output matches easy-np: the message, the version and the command-line arguments.
- The reinstall hint after skipped scripts in a global install is now `npd-x install -g --allow-scripts=...`.

### Fixed

- `--no-cache` works when `np_cache` is set.
- Install scripts receive `npm_config_cafile` as an absolute path.

## 0.0.3 (2026-10-06)

### Breaking changes

- Dependency install scripts (preinstall / install / postinstall, implicit `binding.gyp` builds, git dependency prepare) run only when approved in `allowScripts` in the root `package.json`, as in npm 12; to migrate, run `npd-x approve-scripts <pkg>` for each skipped package, or pass `--dangerously-allow-all-scripts`. [Approve dependency install scripts](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/docs/allow-scripts.md)
- Git dependencies that need a build (prepare, build, install or similar scripts, or workspaces) are reviewed in `allowScripts`, and the build runs no dependency scripts, builds no nested git dependencies and ignores the clone's `allowScripts` and `~/.nprc`; to migrate, approve the repository with `npd-x approve-scripts`.
- `--ignore-scripts` also skips git dependency builds and `binding.gyp` builds of the root project and dependencies; to migrate, drop `--ignore-scripts` where you need those builds.
- `file:` dependencies declared by registry, git or tarball url packages resolve against the declaring package's folder instead of the project root, and run only preinstall / install / postinstall when their declarer is approved; to migrate, write those paths relative to the declaring package.
- With `npd -g <pkg>`, the installed package's `file:` dependencies need the installed package approved before their scripts run; to migrate, reinstall with the `npd -g --allow-scripts=...` command printed after the skipped list.
- Git, tarball url and local packages are installed into folders with a source suffix (`_foo@1.0.0+git.1a2b3c4d@foo`, `+url.<integrity digest>`, `+file.<source path digest>`), so they are fetched once more after upgrading; to migrate, run `npd-x prune` to delete the old folders.
- Git dependencies are cloned with the git CLI instead of downloading codeload tarballs, and built with npd itself instead of `npm install`; to migrate, install git on the machine.
- A flag passed more than once now keeps the last value, as in npm (`--allow-scripts` merges all values); to migrate, pass each flag once.

### Added

- `np-lock.json` records the version each dependency declaration resolved to and is reused by the next install; it is shared with easy-np. [Lock versions with np-lock.json](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/docs/lockfile.md)
- `np-lock.json` locks git dependencies to a commit and tarball url dependencies to their sha512 integrity. [Know what np-lock.json records](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/docs/lockfile.md#know-what-np-lockjson-records)
- If you generated `np-lock.json` with a pre-release of 0.0.3, delete it and install again: it may miss sub-dependencies, rewrite peerDependencies or use command-line keys such as `foo@*`.
- npm `overrides` are supported, and win over `resolutions`. [Override nested dependency versions](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/docs/install-packages.md#override-nested-dependency-versions)
- Missing peerDependencies are installed automatically, as in npm 7+. [Install packages](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/docs/install-packages.md#install-project-dependencies-or-add-packages)
- The registry probe result is cached for 5 minutes; `--probe-cache=<minutes>` or `np_probe_cache` changes it. [Let npd switch public registries](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/docs/registry.md#let-npd-switch-public-registries)
- `--proxy`, `--https-proxy`, `--noproxy`, `--cafile` and `--no-strict-ssl`, also passed to install scripts, node-gyp and git. [Go through a proxy or a custom CA](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/docs/registry.md#go-through-a-proxy-or-a-custom-ca)
- `npd-x approve-scripts`, `npd-x deny-scripts`, `--allow-scripts`, `--strict-allow-scripts` and `--dangerously-allow-all-scripts`. [Approve dependency install scripts](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/docs/allow-scripts.md)
- `npd-x prune` deletes version folders nothing links to. [Reclaim old version folders](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/docs/manage-packages.md#reclaim-old-version-folders)
- npd runs on Node.js 14.18 and later (down from 16.14). [Run on older Node.js and build native modules](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/docs/node-versions.md)

### Changed

- npd no longer ships node-gyp: it installs a version that fits the current Node.js on first use, and `npm_config_node_gyp` points it at your own. [Let npd install node-gyp when it is needed](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/docs/node-versions.md#let-npd-install-node-gyp-when-it-is-needed)
- On Node.js older than 20.17 (and 21.x, 22.0 to 22.8) npd prints one `npd WARN Node vX: ...` line per run; `np_node_warning=false` hides it.
- Without a version or with a range, npd prefers non-deprecated versions, then versions whose `engines.node` matches, as npm does; for example Node 18 gets npm 10 from `npd -g npm`. [How a version is picked](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/docs/install-packages.md#how-a-version-is-picked)
- Untrusted local folder dependencies, and all local folder dependencies under `--ignore-scripts`, are copied by `files` / `.npmignore` / `.gitignore` rules instead of `npm pack`, so no scripts run; root-declared local folders still use `npm pack` on npm 7 and later.
- `npm pack` output has no 1 MB limit any more, a timeout kills the whole process tree, and failure warnings include the end of stderr.
- With `workspaces` in the root `package.json`, npd warns that workspaces are not supported and only adds `np-lock.json` entries.
- Install progress is recorded in `node_modules/.npd-state.json` instead of each package's `package.json`; existing installs are still recognized.
- Switching a dependency from git, url or a local path back to a registry version replaces the installed package even when its version matches.

### Fixed

- Tarballs are verified with the strongest algorithm in `dist.integrity` (usually sha512) instead of sha1.
- Registry packages are linked, reviewed and saved by the registry's name and version, so a tarball cannot claim another package's `allowScripts` approval; npd warns `manifest mismatch` instead. Delete `node_modules` installed before 0.0.3 and install again.
- Credentials in URLs, `_authToken` / `_auth` / `_password` values and token query parameters are replaced with `***` in errors, warnings, `npd-debug.log` and debug output; `npd-debug.log` is also written when the install throws.
- `np-lock.json`, and the git and tarball url keys written by `approve-scripts` / `deny-scripts`, no longer contain URL credentials.
- `npd-x approve-scripts` lists and approves git dependencies skipped only for build scripts, instead of failing with `has no installed version with install scripts`.
- `--dangerously-allow-all-scripts`, `--strict-allow-scripts`, `--strict-ssl` and `--foreground-scripts` no longer swallow the package name that follows them.
- `--strict-ssl` on the command line wins over `npm_config_strict_ssl=false` and also applies to install scripts and git.
- A relative `--cafile` is resolved against the current folder before being passed to install scripts and git.
- `--save-dependencies-tree` saves `cpu`, `libc`, `bin`, `peerDependenciesMeta` and `bundleDependencies`, so restoring it no longer picks wrong optional dependencies on other platforms.
- Git preparation timeouts kill the whole process tree, and each git repository is listed with `git ls-remote` only once per install.
- Ctrl-C (SIGINT) and SIGTERM stop running git processes and exit with 130 / 143; concurrent git work no longer triggers `MaxListenersExceededWarning`.
- `config.np.lockfile: false` turns `np-lock.json` off, using the same key as easy-np.
- `npd-x prune` works when paths go through symlinks and cleans `.npd-state.json` records; `npd-x uninstall` cleans them too.
- A package is marked unfinished before it is extracted or copied again, so an interrupted extraction is redone.
- Git dependency builds no longer create `np-lock.json` inside the built package.
- Saving to `package.json` waits at most 30 seconds for `npm config get save-prefix` and falls back to `^`.
- The Node.js upgrade hint is computed from capability ranges (for example Node 21.x is told 22.9.0), and prerelease Node.js versions are treated as their release.
- Authorization headers are dropped on cross-origin redirects (urllib `^3.27.3`).

## 0.0.2 (2026-10-03)

### Breaking changes

- Commands other than `npd` are merged into `npd-x <command>`: `install` (`i`, `add`), `uninstall` (`un`, `remove`, `rm`, `r`), `update` (`up`, `upgrade`), `link` (`ln`), `fetch`, `rebuild` (`rb`); to migrate, replace `npd-fetch`, `npd-link`, `npd-uninstall` and `npd-update` with `npd-x fetch`, `npd-x link`, `npd-x uninstall` and `npd-x update`.
- The entry file `bin/install.js` is renamed to `bin/i.js`, and `bin` holds only `i.js` (`npd`) and `x.js` (`npd-x`); to migrate, call `npd` / `npd-x` instead of the file paths.

### Added

- A failed package (download, sub-dependency or script) no longer stops the install: the others finish, all failures are listed and the exit code is 1; failed optional dependencies are skipped as in npm. [Resume a failed install](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/docs/resume.md)
- Running `npd` again after a failure or interruption continues each package from the stage it stopped at, without extracting again or rerunning succeeded scripts. [Continue where the install stopped](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/docs/resume.md#continue-where-the-install-stopped)
- `npd-x rebuild [<pkg>[@<range>] ...]` reruns preinstall / install / postinstall of installed dependencies in dependency order. [Rerun install scripts](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/docs/manage-packages.md#rerun-install-scripts)
- Skipped optional dependencies are listed at the end with the `npd-x rebuild <pkg>` command to rerun their scripts.
- `npd-x -h` lists subcommands, and `npd-x <command> -h` and `npd-x help <command>` show their options.

### Fixed

- Packages extracted but not finished when an install failed or was interrupted are no longer marked done, so their scripts run on the next install.
- A failed sub-dependency script is found and rerun through its parent package on the next install, not only for direct dependencies.
- Script retries after switching registries restore files rewritten by the binary mirror, using `.npd-binary-snapshot.json` in the package folder.
- `npd <pkg>` inside a dependency script during `npd-x update` is no longer treated as an install without package names.
- A failing root package script no longer writes `__npd_done` into the project's `package.json`.

## 0.0.1 (2026-10-02)

### Fixed

- `npd-uninstall` also removes `.cmd` and `.ps1` command entries, including ones left on macOS / Linux by other tools, and no longer removes wrong paths when `bin` is a string.
- Reinstalling or upgrading a global package with `npd -g`, and overwriting one with `npd-link`, first removes every command entry of the old version.
- When a local install changes a dependency's version, commands the new version no longer declares are removed from `node_modules/.bin`, keeping same-named commands of other packages.

## 0.0.0 (2026-09-29)

First release.

### Breaking changes

These are differences from npminstall 6.8.0.

- The package is `easy-npd` with commands `npd`, `npd-fetch`, `npd-link`, `npd-uninstall` and `npd-update`, User-Agent `easy-npd/<version>` and log prefix / debug namespace `npd`; to migrate, call the new command names.
- The user config file is `~/.nprc` instead of `~/.cnpmrc`; to migrate, move the file.
- The cache folder is `~/.np_tarball` with the environment variable `np_cache`, the done marker is `__npd_done` and the global store folder is `.<name>_npd`; to migrate, delete a `node_modules` installed by npminstall and install again.
- The cache layout is `np-manifests/<name>/<hash>.json`, `np-tgz/<name>/` and `np-tmp/<YYYYMMDD>/`, keyed by the official registry address, and the old layout is not read or cleaned; to migrate, delete the old cache folder when you no longer need it.
- `-c`, `--china` and `npm_china` are removed in favor of automatic registry switching; to migrate, drop them.
- `--custom-china-mirror-url` is removed; to migrate, drop it.
- `--prune`, `config.npminstall.prune` and `env:production` / `env:development` are removed because their fixed file list deleted runtime files such as `tsconfig.json`; to migrate, drop them.
- `--proxy`, `npm_proxy`, `npm_config_proxy` and npm `strict-ssl` are removed because they never worked with urllib 3; to migrate, drop them.
- `--force-link-latest`, `--disable-dedupe` and `config.npminstall.disableDedupe` are removed; to migrate, drop them.
- `--tarball-url-mapping` rewrites only the first request address, not redirects; to migrate, map the final address if you relied on redirects.
- npd needs Node.js 16.14.0 or later; to migrate, upgrade Node.js.

### Added

- npd switches between npmmirror and npmjs automatically: it probes both at start, alternates on manifest, tarball and script failures (up to 4 attempts), fetches versions missing on the mirror from npmjs, and leaves private registries and scope registries alone.
- `--offline` installs from the disk cache only and fails at once when something is missing.
- `--refresh-cache` ignores and overwrites cached manifests and tarballs.
- `npd-fetch` / `npd --fetch-only` only download and extract the listed packages.
- `~/.nprc` and the disk cache `~/.np_tarball` are shared with easy-np.
- `--help` on every command lists all supported flags.

### Changed

- The root links always point to the highest version, are updated when dependencies change on a full install, and never overwrite packages declared in the root `package.json`.

### Fixed

- A corrupt cached tarball is deleted and downloaded again instead of failing every retry.
- 4xx / 5xx responses on streamed requests no longer throw an uncaught abort error.
- Root packages whose done marker is false (left by `npd-fetch` or a failed install) are processed again by a full install instead of being skipped.
- `--lockfile-path` load failures exit with an error instead of silently resolving online.
- Git dependencies that need prepare install under `npm run` / `npx` instead of failing with npm 12's `EALLOWSCRIPTS`, and their errors include the child process stderr.
- `npd-uninstall` returns after `package.json` has been written back.
- `npd-uninstall` removes root links nothing uses, so the removed package's dependencies can no longer be required.
- `.nprc` registry username / password are sent only to the registry's own host, also with `always-auth`, and no longer leak to fallback registries, tarball CDNs or binary mirrors.
