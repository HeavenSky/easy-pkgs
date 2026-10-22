# Troubleshooting

**English** · [简体中文](../zh/docs/troubleshooting.md)

Search this page for the error text you see. Messages are quoted as printed, with paths and names shown as `<…>`. A usage or config error prints only its message, followed by `np version: <version>` and `np argv: <command line>`, and exits with code 1.

## Errors when installing easy-np

### `npm error code EEXIST`

- Cause: when you run `npm i -g easy-np`, sindresorhus's [`np`](https://www.npmjs.com/package/np) is installed globally and owns the `np` command; npm before version 10 prints `npm ERR! code EEXIST`.
- Fix: uninstall one of the two, or add `--force` to overwrite the command; see [Avoid the np name clash](install.md#avoid-the-np-name-clash).

### `npm WARN EBADENGINE Unsupported engine`

- Cause: on Node.js 14 or 16, tar 7 and its dependencies declare Node >= 18 and `type-fest` 4 declares Node >= 16; npm 6 prints `npm WARN notsup` instead. The warning is expected and does not affect how easy-np runs.
- Fix: nothing to do; see [Install on Node.js 14 and 16](node-versions.md#install-on-nodejs-14-and-16).

### `npm ERR! code EBADENGINE`

- Cause: npm's `engine-strict` is on, so the engine warnings above stop the install; npm 6 prints `npm ERR! code ENOTSUP`.
- Fix: run `npm i -g easy-np --engine-strict=false`, or use Node.js 18 or later.

## Errors about options

### `unknown option --prodd (did you mean --prod?), run np -h to list the options`

- Cause: the option is misspelled or does not exist; the message suggests the closest known option. `--key=value` forms and arguments after `--` are passed through without this check.
- Fix: use the suggested option, or list all options with `np -h` (`np-x <command> -h` for other commands).

### `no package.json in <dir>, run np-x inside a project folder or name the packages to install`

- Cause: `np-x install` ran without package names in a folder that has no `package.json`; nothing is written.
- Fix: run it in your project folder, or name the packages, for example `np-x install esbuild`.

### `-D has been removed, use --write=dev`

- Cause: the option comes from npminstall or an older easy-np and was removed; the same message form, `has been removed, <replacement>`, appears for every removed option.
- Fix: use the replacement in the message; the full list is in [Replace removed commands and options](migrate-from-npminstall.md#replace-removed-commands-and-options).

### `--write only accepts the --write=<type> form, e.g. --write=dev`

- Cause: `--write dev` would swallow the next package name as the type.
- Fix: write `--write=dev`.

### `no clientDependencies in package.json for type "client"`

- Cause: `--only`, `--include` or `--omit` names a custom type with no matching field in the root or any workspace `package.json`.
- Fix: correct the type name, or add the `<type>Dependencies` field; see [Pick dependency types](install-options.md#pick-dependency-types).

## Install scripts that did not run

### `1 package(s) have install scripts that are not in allowScripts and were skipped:`

- Cause: `np-x install` runs dependency scripts only after approval.
- Fix: review the package, then run the command printed on the next line, for example `np-x approve-scripts esbuild && np-x rebuild esbuild`; see [Approve dependency install scripts](allow-scripts.md).

### `install scripts of <n> package(s) are not reviewed in allowScripts`

- Cause: `--strict-allow-scripts` (or pnpm's `strictDepBuilds`) is on and some dependency is neither approved nor denied; the error code is `EALLOWSCRIPTS`.
- Fix: approve the listed packages with `np-x approve-scripts <pkg>` or deny them with `np-x deny-scripts <pkg>`.

### `manifest mismatch <name>@<version>: package.json in the tarball declares <other>@<version>, using the registry name and version`

- Cause: the tarball's own `package.json` claims to be another package.
- Fix: check whether the package is what you expect; approval and links use the registry name, so it cannot reuse the other package's approval.

## Failed installs

### `✖ Install finished with <n> failed package(s)`

- Cause: some packages failed to download, install sub-dependencies or run scripts; the rest were installed.
- Fix: fix the cause shown above the summary and run the same command again; see [Resume a failed install](resume.md).

### `script output: <cache directory>/np-script-logs/<file>.log`

- Cause: a dependency script running in the background failed; its command and full output are in that log file.
- Fix: read the log, or rerun with `--foreground-scripts` to see the output live.

### `Running 1 script: frida@17.23.2 12s, downloading 6.03MB/36.45MB (16%)` for a long time

- Cause: a dependency's install script is downloading or building something, for example a prebuilt binary. The spinner shows each running script with its elapsed time and the bytes it has downloaded through Node.js http / https; downloads made with `fetch` or with tools such as curl show only the elapsed time.
- Fix: wait for it to finish, or rerun with `--foreground-scripts` to see the script's own output; with `--detail` or without a terminal, a `scripts.running` line is printed every 10 seconds for each script still running.

### `was compiled against a different Node.js version using NODE_MODULE_VERSION`

- Cause: native modules were built for another Node.js version.
- Fix: run `np-x rebuild` after switching Node.js versions.

## Lockfile errors

### `--frozen-lockfile requires np-lock.json in <dir>`

- Cause: the project has no `np-lock.json` yet.
- Fix: run `np-x install` once and commit `np-lock.json`; see [Lock a project in CI](lockfile.md#lock-a-project-in-ci).

### `<pkg> is not in np-lock.json, run np-x install to update it`

- Cause: `package.json` declares a dependency that `np-lock.json` does not record.
- Fix: run `np-x install` without `--frozen-lockfile` and commit the updated `np-lock.json`; the end of the failed run says the same: `<n> package(s) failed, run np-x install to update np-lock.json:`.

### `integrity mismatch for <url>: np-lock.json has <sha512> but got <sha512>, remove the entry from np-lock.json to accept the new content`

- Cause: the content behind a tarball URL changed after it was locked.
- Fix: if the new content is expected, remove that entry from `np-lock.json` and install again.

## Offline and cache errors

### `np ERROR --offline needs the disk cache, it can not be used with --no-cache`

- Cause: `--offline` reads only the disk cache, which `--no-cache` turns off.
- Fix: drop one of the two options.

### `Can't find package <name> manifests in offline mode`

- Cause: the package was never cached; `Can't find tarball <name>@<version> in the disk cache in offline mode` has the same cause.
- Fix: install once with network access, or use `--prefer-offline`, which goes to the network only for packages missing from the cache.

### `Can't install <url> in offline mode: git packages are always fetched from the network`

- Cause: git packages, and tarball URL dependencies (`remote packages are always fetched from the network`), cannot be installed offline.
- Fix: install without `--offline`.

## node-gyp and Node.js warnings

### `np ERROR install it manually and point npm_config_node_gyp at it, e.g.:`

- Cause: easy-np could not install node-gyp on demand, usually because there is no network access.
- Fix: run the `npm i -g` command the message prints, then set `npm_config_node_gyp` as shown; see [Get node-gyp](node-versions.md#get-node-gyp).

### `np WARN Node v18.20.8: node-gyp < 12 (Visual Studio 2026 is unsupported), upgrade to Node >= 20.17.0 to restore`

- Cause: on this Node.js version easy-np uses a compatible older implementation of the named feature.
- Fix: upgrade Node.js to the version in the message, or set `np_node_warning=false` to hide the line; see [Run on older Node.js and build native modules](node-versions.md).
