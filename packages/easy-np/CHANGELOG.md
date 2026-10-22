# Changelog

**English** · [简体中文](./zh/CHANGELOG.md)

easy-np started from [cnpm/npminstall](https://github.com/cnpm/npminstall) 8.0.1; for upstream history see the [npminstall CHANGELOG](https://github.com/cnpm/npminstall/blob/master/CHANGELOG.md).

0.0.0 lists every change relative to npminstall 8.0.1; later versions list the changes relative to the previous version.

## Unreleased

### Fixed

- When an install resumes, a package's scripts again wait for the scripts of dependencies it reaches through a package that finished in an earlier run.

## 0.0.6 (2026-10-21)

### Changed

- `np` and `np-x install` warn when the project has an `npm-shrinkwrap.json` or `package-lock.json` but `np-lock.json` is not read (it is missing, or the lockfile is off, as it is by default for `np`), because the versions in the npm lockfile are not used; pass `--from-package-lock=<file>` to install them.
- `np-x install` warns when `np-lock.json` and another package manager's lockfile both exist, because they are updated separately and may lock different versions.
- Dependency lifecycle scripts now run after the whole dependency tree is linked, as in npm, instead of right after each package; a `postinstall` that loads a sibling or peer dependency no longer fails when that package is still being installed. A package's scripts still run after those of its dependencies, and independent packages run in parallel (up to 10 at a time).
- `--from-package-lock` with a lockfileVersion 1 file now says to regenerate it with npm 7 or later; the help and docs state that `npm-shrinkwrap.json` is accepted too.

## 0.0.5 (2026-10-16)

### Breaking changes

- Unknown options now fail with exit code 1 and suggest the closest known option, for example `unknown option --prodd (did you mean --prod?)`; `--key=value` forms and arguments after `--` still pass through. Fix or remove the options your scripts pass ([details](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/docs/troubleshooting.md#errors-about-options)).

### Changed

- Usage and config errors print only the message, followed by `np version` and `np argv`, without a stack trace.
- `np-x install` without `package.json` and without package names fails and writes nothing, like npm.
- The documentation is now in English with a Chinese translation, and the guide is split into one page per task: see the [guide index](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/docs/README.md).
- easy-np now requires Node.js 14.19.3 or later (up from 14.18.0), the minimum urllib 3.27.3 declares; on Node.js 14.18 upgrade Node.js first.
- The package now ships an `npm-shrinkwrap.json`, and tar and urllib are pinned to the tested versions (7.5.22 and 3.27.3), so installing with npm resolves the whole dependency tree at tested versions and a later minor release cannot pull in APIs that Node.js 14 and 16 lack. On Node.js 14 and 16, `EBADENGINE` warnings during install are expected and harmless; with `engine-strict` on, install with `--engine-strict=false` or use Node.js 18 or later ([details](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/docs/node-versions.md#install-on-nodejs-14-and-16)).

### Fixed

- Lifecycle scripts keep quoted whitespace in their commands and no longer trigger DEP0190 on Node 24+.
- `.bin` entries run the file a postinstall script swapped in, such as esbuild's native binary, instead of failing with `SyntaxError` (Unix); run `np-x rebuild` or reinstall to fix existing installs.
- `--offline` with an empty cache no longer prints `Get /binary-mirror-config/latest ... error: undefined`.
- Building registry and tarball URLs no longer prints DEP0169 `url.parse()` warnings on Node 26.
- The install summary shows `speed 0B/s` instead of `speed null/s` when nothing was downloaded.
- `np-x --version` and `np-x install -v` print `np-x v<version>`.
- `--frozen-lockfile` failures now say to run `np-x install` to update `np-lock.json`.

## 0.0.4 (2026-10-10)

### Breaking changes

- `np` is now `np-x install` plus `--no-lockfile --dangerously-allow-all-scripts`, reading `.npmrc` and pnpm config like `np-x install`, and no config file can change those two options; to get the lockfile or reviewed scripts, pass `--lockfile` or `--no-dangerously-allow-all-scripts`, or run `np-x install`.
- Removed install options now exit with an error that names the replacement; replace them as listed in [Replace removed commands and options](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/docs/migrate-from-npminstall.md#replace-removed-commands-and-options).
- `-S/--save`, `-D/--save-dev`, `-O/--save-optional` and `-E/--save-exact` are removed; use `--write=<type>` and `--write-exact`.
- `--no-optional`, `--legacy-peer-deps`, `--client`, `--save-client` and the other cnpm options are removed; use `--omit=optional`, `--omit=peer`, `--only` and `--include`.
- `clientDependencies` and other non-standard fields are no longer installed by default (a full install warns), and the same fields of installed packages are never installed; pass `--include=<type>` to install them.
- `--root`, `-w` and `--workspace` are removed, and running inside a workspace directory handles only that workspace, as in npm 7+; run the command in the workspace directory instead.
- `--dedup` is renamed `--shamefully-hoist`, `--lockfile-path` is renamed `--from-package-lock`, and `-d` is removed; use the new names and `--detail`.
- `--flatten`, `--fix-bug-versions`, `--tarball-url-mapping`, `--dependencies-tree`, `--save-dependencies-tree`, `--cache-strict` and the install options `--fetch-only` and `--rebuild` are removed; use `np-lock.json`, `np-x fetch` and `np-x rebuild`.
- `--production` no longer disables the disk cache or forces detailed logs; pass `--no-cache` or `--detail` if you relied on that.
- `np-x uninstall` keeps only the aliases `rm` and `remove`, and `np-x rebuild` loses the alias `rb`; use the full command names.
- `np-x uninstall --ignore-scripts` is now an error; drop the option, uninstall runs no lifecycle scripts.
- Registry credentials, the `.npmrc` `_authToken` and the `~/.nprc` username and password, go only to requests on the registry's host, and `always-auth` no longer sends them elsewhere; configure credentials for each registry host you use.
- `registry` in `~/.nprc` now decides the install registry (`--registry` > `npm_registry` > `~/.nprc` > `.npmrc` / `npm_config_registry`), where it used to only match credential hosts; remove it from `~/.nprc` if you do not want to install from it.
- npminstall's `-c` / `--china`, `--custom-china-mirror-url`, `--prune`, `--force-link-latest` and `--disable-fallback-store` now exit with an error instead of swallowing the next package name as their value; remove them from your commands.
- The `np_lockfile` environment variable now wins over `config.np.lockfile`, where either one set to false used to turn the lockfile off; set `np_lockfile=false` when you need to turn it off from the environment.

### Added

- Failed background dependency scripts now leave their command and full output in a log under `np-script-logs/` in the cache directory, named at the end of the error ([details](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/docs/registry.md#where-the-cache-lives)).
- Both entry points read npm and pnpm config: build settings, `lockfile`, hoisting and `packages` from `pnpm-workspace.yaml` or the `pnpm` field, and the matching keys from `.npmrc` ([details](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/docs/configuration.md#which-files-easy-np-reads)).
- With only pnpm's `neverBuiltDependencies` configured, the scripts of every other dependency are allowed.
- `--no-write` works the same as `--no-save`.
- `--lockfile` turns `np-lock.json` on explicitly, and `--frozen-lockfile` counts as on.
- `--prefer-offline` uses cached manifests without revalidating them ([details](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/docs/registry.md#use-the-cache-options)).
- `--ws` is an alias of `--workspaces`.
- `np-x approve` and `np-x deny` are aliases of `approve-scripts` and `deny-scripts`, and every command accepts `-v`.
- `np-x uninstall --write=<type>` also removes the package from `<type>Dependencies`; the four standard fields are always cleaned.

### Changed

- Public registries grow from npmmirror and npmjs to npm, yarn, alibaba (npmmirror), tencent and huawei: the fastest three are used, and a failed manifest or tgz is retried on them in order, at most 6 attempts instead of 4; the first run after upgrading probes again ([details](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/docs/registry.md#let-easy-np-switch-public-registries)).
- When a global install skips dependency scripts, the hint to reinstall is now `np-x install -g --allow-scripts=...`.

### Fixed

- `--no-cache` works again when `np_cache` is set.

## 0.0.3 (2026-10-06)

### Breaking changes

- Dependency install scripts no longer run by default, as in npm 12: dependencies' `preinstall` / `install` / `postinstall`, implicit `binding.gyp` builds and git dependency `prepare` run only when approved in `allowScripts` of the root `package.json`; approve them with `np-x approve-scripts`, or pass `--dangerously-allow-all-scripts` to keep the old behavior, and reinstall `node_modules` installed before 0.0.3, whose scripts ran unreviewed ([details](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/docs/allow-scripts.md)).
- Git dependencies are now fetched with the git CLI, also for hosted repositories, instead of codeload tarballs; install git on machines that install git dependencies.
- node-gyp is no longer bundled and is installed on demand into `<cache directory>/np-node-gyp` the first time a native module is built; on machines without network access, install node-gyp with `npm i -g` and set `npm_config_node_gyp` ([details](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/docs/node-versions.md#get-node-gyp)).

### Added

- Installed versions that differ from `np-lock.json` are replaced with the locked ones; `np <pkg>` records the declaration saved into `package.json`, and a tag or `*` on the command line is resolved again.
- `np-lock.json` records the version each dependency declaration resolved to and reuses it on the next install; it is shared with easy-npd ([details](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/docs/lockfile.md)).
- `--frozen-lockfile` installs only from `np-lock.json` and fails on a missing entry.
- `np-lock.json` locks the commit of git dependencies and the sha512 integrity of tarball URL dependencies, and fails when tarball content changes.
- `np-x approve-scripts`, `np-x deny-scripts`, `--allow-scripts` (repeatable, values merged), `--strict-allow-scripts` and `--dangerously-allow-all-scripts` control dependency install scripts; the last two are boolean flags that never take the next package name as a value, and fall back to `npm_config_*` and `~/.nprc`.
- npm `overrides` are supported, and win over `resolutions` ([details](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/docs/install-options.md#force-versions-with-overrides)).
- Missing peerDependencies are installed automatically, as in npm 7+, and skipped like optional dependencies with a warning when they fail; `--legacy-peer-deps` restores warning only.
- The public registry probe is cached in `~/.np_tarball/np-probe.json` for 5 minutes; change it with `--probe-cache=<minutes>` or `np_probe_cache`.
- `--proxy`, `--https-proxy` and `--noproxy` set a proxy that is also passed to install scripts, node-gyp and git ([details](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/docs/registry.md#use-the-registry-and-network-options)).
- `--cafile` sets a CA certificate and `--no-strict-ssl` turns off certificate checks, both also passed to install scripts and git; `--strict-ssl` / `--no-strict-ssl` on the command line win over `npm_config_strict_ssl` and `~/.nprc`.
- `--lockfile-path` works with workspaces: each workspace gets the versions from npm's lockfile, and a declaration locked to different versions warns and uses the one closest to the root.
- `np-x prune` deletes package versions no link references, also through a symlinked `node_modules`, and cleans their `.np-state.json` records; `--dry-run` only lists them ([details](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/docs/workspaces.md#reclaim-old-versions)).
- Node.js 14.18 is supported: `engines` drops from 16.14 to 14.18.
- On older Node.js, one `np WARN Node vX: ...` line per run names the reduced feature and the Node.js version that restores it; `np_node_warning=false` turns it off.

### Changed

- Registry packages are identified by `name@version` on the registry: a tarball whose `package.json` claims another package gets a `manifest mismatch` warning, and approval, the skipped list, `np-x approve-scripts`, `np-x rebuild` and link names all use the registry name.
- `file:` local dependencies declared by registry, git and tarball URL packages resolve relative to the declaring package instead of the project root, run only `preinstall` / `install` / `postinstall`, and follow the declarer's approval.
- Git dependency builds are always reviewed first, also for repositories that only declare `build`, `prepack` or workspaces; the build's sub-install no longer reads the cloned repository's `allowScripts` and `~/.nprc`, and nested git dependencies are not built.
- `--ignore-scripts` also skips building git dependencies and packs the repository as it is.
- `np -g <pkg>`: `file:` local dependencies of the installed package run their scripts only when that package is approved, and its `overrides` no longer make them trusted; the skipped list ends with an `np -g` command with `--allow-scripts`, because `np-x approve-scripts` and `np-x rebuild` do not support `-g`.
- Git, tarball URL and local packages get a source tag after the version in `.store` (`+git.<commit>`, `+url.<...>`, `+file.<...>`), so updated content with the same version is installed; the first install after upgrading fetches these dependencies again, and `np-x prune` removes the old directories.
- Old untagged `.store` directories holding git, URL or local content are no longer reused for a registry dependency with the same name and version, and a declaration changed back from git, URL or a local path to a registry version installs the registry package.
- Local folder and tarball file dependencies are reused only when their content digest matches, so changed content with the same version and path is reinstalled.
- Without a version or with a range, the version whose `engines.node` matches the current Node.js is preferred, as in npm; for example `np -g npm` on Node 18 installs npm 10.
- Without a version or with a range, deprecated versions are avoided, as in npm: not deprecated > `engines.node` match > higher version; a range with only deprecated versions still picks one and warns.
- Untrusted local folder dependencies and installs with `--ignore-scripts` copy files by the `files` and `.npmignore` rules without calling `npm pack` or running scripts; trusted folders still use `npm pack` with npm >= 7.18, and older npm (npm 6 on Node 14) copies by the same rules instead of failing with `npm ERR! ENOLOCAL`.
- When `npm pack` fails, files are copied by the same rules instead of copying the whole folder, and the warning shows the end of stderr.
- Git dependencies that need a build get their dependencies, including devDependencies, from np itself without running dependency install scripts, then run `prepare` and are packed by the `files` and `.npmignore` rules, instead of calling `npm install`.
- A repeated single-value option takes its last value, as in npm, instead of failing; `--allow-scripts` and `-w` / `--workspace` still merge all values.
- Install progress is recorded in `node_modules/.store/.np-state.json` instead of the installed packages' own `package.json`; markers written by earlier versions are still recognized, so no reinstall is needed.
- A package is marked unfinished before it is extracted or copied, so an interrupted install never counts it as done.

### Fixed

- If you used an unreleased 0.0.3 build, delete `np-lock.json` and install once: those builds could miss sub-dependencies of installed packages or record command-line forms such as `foo@*`.
- Tarballs downloaded from the network are checked with the strongest algorithm in `dist.integrity` (usually sha512) instead of sha1 only.
- The dependency tree saved by `--save-dependencies-tree` includes `cpu`, `libc`, `bin`, `peerDependenciesMeta` and `bundleDependencies`, so restoring it no longer picks wrong optional dependencies on other platforms.
- A failed git dependency `prepare` shows the end of the script's stderr, and a timeout ends the whole process tree; `npm pack` output has no size limit and its timeout ends the whole process tree too.
- One install runs `git ls-remote` only once per git repository.
- Ctrl+C or SIGTERM ends the whole git and git-build process tree (forcing it after 1 second) and exits with 130 / 143; many concurrent git processes no longer print `MaxListenersExceededWarning`.
- An alias dependency (`"x": "npm:foo@^1"`) next to a root dependency `foo` no longer deletes `node_modules/foo` on the next install.
- `np <pkg>` saves the dependency name and the registry version into `package.json`, not the name and version the tarball claims.
- `np-lock.json` and `--save-dependencies-tree` keep the original peerDependencies of each package.
- `np-x approve-scripts <name>` can approve a git dependency skipped only for `prepare`, `build` or similar scripts, instead of reporting `has no installed version with install scripts`, and then tells you to delete its `.store` directory.
- `np-lock.json` no longer stores credentials from URLs; locked installs use the address from `package.json` with the locked commit or integrity, and old entries with credentials are rewritten on the next write.
- A command-line alias without a version (`np x@npm:foo`) is locked as `foo@latest`, the same key as `"x": "npm:foo"` in `package.json`.
- Errors, warnings, `np-debug.log` and `NODE_DEBUG` output mask passwords in URLs, `_authToken` / `_auth` / `_password` values and `token`, `access_token`, `auth`, `_authToken`, `password` query parameters.
- `np-x approve-scripts` / `np-x deny-scripts` strip credentials from git and tarball URL keys; existing entries with credentials still match.
- A relative `--cafile` is resolved to an absolute path before it is passed to child processes, so git clones and git dependency builds find the certificate.
- An explicit `--strict-ssl` sets `npm_config_strict_ssl=true` and clears `GIT_SSL_NO_VERIFY` for child processes such as node-gyp and git.
- Querying `npm config get save-prefix` times out after 30 seconds and falls back to `^`.
- The sub-install of a git dependency build no longer creates an `np-lock.json` that ends up in git dependencies without a `files` field.

## 0.0.2 (2026-10-03)

### Breaking changes

- All commands except `np` are merged into `np-x <command>`: `np-fetch`, `np-link`, `np-uninstall` and `np-update` are removed; use `np-x fetch`, `np-x link`, `np-x uninstall` and `np-x update`.
- The entry file `bin/install.js` is renamed `bin/i.js`, and `bin` keeps only `i.js` (`np`) and `x.js` (`np-x`); call `np` / `np-x` instead of the old file path.

### Added

- One failed package (download, sub-dependency or script) no longer stops the install: the rest are installed, failures are listed and the exit code is 1; running `np` again resumes from where each package stopped ([details](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/docs/resume.md)).
- `np-x rebuild` / `np --rebuild` reruns `preinstall` / `install` / `postinstall` of all dependencies, or of the listed `<pkg>[@<range>]`, preferring the disk cache.
- The end of an install lists optional dependencies skipped after a failure, with the `np-x rebuild <pkg>` command to rerun them.
- `np-x -h` lists the commands `install` (`i`, `add`), `uninstall` (`un`, `remove`, `rm`, `r`), `update` (`up`, `upgrade`), `link` (`ln`), `fetch` and `rebuild` (`rb`), and `np-x <command> -h` and `np-x help <command>` show their options.

### Fixed

- Packages that were extracted but whose sub-dependencies or scripts had not finished are no longer marked done when an install fails or is interrupted, so their scripts run on the next install.
- After a sub-dependency fails, the next run no longer extracts its whole chain of parent packages again.
- Resuming or `np-x rebuild` can restore files rewritten by the binary mirror when an install script retries on another registry, using `.np-binary-snapshot.json` in the package directory.
- During `np-x update`, `np <pkg>` run by a dependency script is no longer treated as an install without package names.
- A failed root package script no longer writes `__np_done` into the project's own `package.json`.

## 0.0.1 (2026-10-02)

### Fixed

- Installs on non-Windows platforms no longer create extra `.cmd` and `.ps1` launchers for every command.
- `np-uninstall` also deletes the `.cmd` and `.ps1` launchers, including ones left on macOS / Linux by earlier versions, and no longer deletes wrong paths when `bin` is a string.
- Reinstalling or upgrading a global package with `np -g`, or overwriting one with `np-link`, deletes every launcher of the old version, so commands the new version dropped do not remain.
- When a local dependency changes version, commands only the old version declared are removed from `node_modules/.bin`; same-named commands of other packages are kept.

## 0.0.0 (2026-09-29)

First release.

### Breaking changes

- The package is `easy-np`, with the commands `np`, `np-fetch`, `np-link`, `np-uninstall` and `np-update` and the User-Agent `easy-np/<version>`; replace the npminstall commands in your scripts.
- The user config file is `~/.nprc` instead of `~/.cnpmrc`; copy your settings over.
- The default cache is `~/.np_tarball` with the variable `np_cache`, the `package.json` key is `config.np`, and `node_modules` installed by npminstall must be deleted and reinstalled.
- Nothing is hoisted to the root by default, where npminstall hoisted packages named like eslint, prettier and babel; set `--public-hoist-pattern=<regexp>` or `config.np.publicHoistPattern` to hoist them.
- `-c`, `--china` and `npm_china` are removed in favor of automatic registry switching; drop them.
- `--custom-china-mirror-url`, `--force-link-latest`, `--disable-fallback-store` and `np-uninstall --ignore-scripts` are removed; drop them.
- `--prune` and `config.np.prune` are removed because their fixed list deleted runtime files such as `tsconfig.json`; drop them.
- `--proxy`, `npm_proxy`, `npm_config_proxy` and npm's `strict-ssl` are removed because they never took effect; drop them.
- `config.npminstall.env:production` / `env:development` and the `.npmrc` key `np-public-hoist-pattern` are removed; use `config.np.publicHoistPattern`.
- Node.js >= 16.14.0 is required; upgrade Node.js first.

### Added

- Registries switch automatically between npmmirror and npmjs: each run probes first, and failed manifests, tgz files and dependency install scripts switch registry, at most 4 attempts; a version missing on the mirror comes from the official registry, and private registries and scope registries never switch.
- `--refresh-cache` ignores and overwrites cached manifests and tgz files.
- `np-fetch` / `np --fetch-only` only download and extract the listed packages, without installing dependencies, running scripts, linking bins or changing `package.json`.
- `--dedup` links the highest version of every package into the root `node_modules`, the flat result of npminstall@6.
- `workspace:*`, `workspace:^`, `workspace:~` and `workspace:<range>` are supported.
- `~/.nprc` and the disk cache `~/.np_tarball` are shared with easy-npd.

### Changed

- Hoisted packages always use the highest version across the whole install, whatever the workspace order; dependencies declared in `package.json` keep their declared version, and partial installs only upgrade.
- `config.np` is read for `np <pkg>` as well, where npminstall read it only without package names.
- All public registries share one manifest cache, so switching registries does not download again.
- `--tarball-url-mapping` rewrites only the first request address and no longer claims to rewrite redirects.

### Fixed

- `--offline` reads only the disk cache: a missing tgz fails at once, git and tarball URL dependencies fail, and combining it with `--no-cache` is an error.
- A damaged tgz in the cache is deleted and downloaded again instead of being read on every retry.
- A 4xx / 5xx response on a streamed request no longer throws an uncaught abort error.
- A root package left unfinished by `np-fetch` or a failed install is no longer skipped because its version matches; a full install completes it.
- Registry tokens go only to requests on the registry's host, no longer to fallback registries and tarball CDNs.
- Workspaces are installed and run their lifecycle scripts in topological order.
- `np -g` inside a workspaces repository no longer deletes local `node_modules` directories named like a workspace.
- `np-update -w <name>` cleans only that workspace and no longer breaks the shared `.store`.
- peerDependencies provided by the root package of a workspaces project are no longer reported as missing.
- `np-uninstall` removes hoisted links and `.store/node_modules` fallback links nothing uses any more.
- A workspace whose version does not satisfy the declared range warns, and the log shows the real directory of a dependency that points to a local workspace.
- `--lockfile-path` exits with an error when loading fails instead of silently resolving from the network; in workspaces projects it is not supported yet and exits with an error.
- Installing a git dependency that needs `prepare` under `npm run` / `npx` is no longer rejected by npm 12 with `EALLOWSCRIPTS`, and a failed git dependency shows the child process stderr.
- `np-uninstall` returns after `package.json` is written.
