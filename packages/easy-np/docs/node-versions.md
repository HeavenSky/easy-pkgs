# Run on older Node.js and build native modules

**English** · [简体中文](../zh/docs/node-versions.md)

easy-np runs on Node.js >= 14.19.3 and installs a compatible node-gyp the first time a native module is built; for native modules you also need Python 3 and a C/C++ toolchain.

## Install on Node.js 14 and 16

Installing easy-np on Node.js 14 or 16 prints engine warnings that do not affect how easy-np runs: `npm WARN EBADENGINE` with npm 7 and later, `npm WARN notsup` with npm 6. They come from tar 7 and its dependencies (`@isaacs/fs-minipass`, `minizlib`, `chownr`, `yallist`), which declare Node >= 18, and from `type-fest` 4 (used by urllib), which declares Node >= 16.

- The warnings are expected: easy-np works on Node 14.19.3 and 16 in testing; below 16.6, [`lib/runtime.js`](../lib/runtime.js) adds the built-in methods tar 7 needs. The package ships an `npm-shrinkwrap.json`, so npm installs the whole dependency tree at the versions tested on these Node.js versions; pnpm and Yarn ignore that file and may resolve newer minor versions. easy-np and easy-npd do not read the `npm-shrinkwrap.json` inside dependency packages either, so `np -g easy-np` resolves the declared ranges again.
- With `engine-strict` enabled in npm, the install fails instead (`npm ERR! code EBADENGINE`, or `npm ERR! code ENOTSUP` with npm 6). Turn it off for this install, for example `npm i -g easy-np --engine-strict=false`, or use Node.js 18 or later.

## Read the downgrade warning

On older Node.js, easy-np switches a feature to a compatible older implementation and prints one line per run that names the feature and the Node.js version that restores it.

| Node.js                          | Line printed                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 20.17 ~ 20.x, >= 22.9            | none                                                                                                          |
| 14.19 ~ 20.16, 21.x, 22.0 ~ 22.8 | `np WARN Node vX: node-gyp < 12 (Visual Studio 2026 is unsupported), upgrade to Node >= <version> to restore` |

- node-gyp is currently the only feature that is reduced.
- Set `np_node_warning=false` to turn the line off.

## Get node-gyp

node-gyp is not installed with easy-np. The first time a native module is compiled, easy-np installs a node-gyp version compatible with the current Node.js into `<cache directory>/np-node-gyp` and reuses it afterwards.

- Each Node.js version gets its own install, separate from easy-npd's; old install directories that are no longer referenced and older than 1 hour are deleted on the next install.
- When `npm_config_node_gyp` points to an existing `node-gyp.js`, easy-np uses it directly.
- Without network access:
    1. Install node-gyp globally: `npm i -g node-gyp`.
    2. Point easy-np at it: `export npm_config_node_gyp="$(npm root -g)/node-gyp/bin/node-gyp.js"`. On Windows, the error message that asks for this prints the PowerShell and cmd.exe forms.

| Node.js                                       | node-gyp (installed on demand for dependency install scripts and `binding.gyp` builds)                          | Known risks                                                                                                                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 20.17 ~ 20.x, >= 22.9                         | the newest `node-gyp` whose `engines.node` matches the current Node.js (>= 12)                                  | none                                                                                                                                      |
| 16.14 ~ 16.x, 18.x ~ 20.16, 21.x, 22.0 ~ 22.8 | same rule, which gives 10 or 11: Visual Studio 2026 is not recognized                                           | with 10 (16.14 ~ 16.x, 18.0 ~ 18.16), node-gyp also pulls in tar 6 through make-fetch-happen / cacache, see the next row                  |
| 14.19 ~ 16.13, 17.x                           | `@electron/node-gyp` 10.2 (the node-gyp 10 branch maintained by Electron): Visual Studio 2026 is not recognized | the tar 6 it pulls in through make-fetch-happen / cacache has unfixed advisories; it is used only when node-gyp downloads Node.js headers |

## Weigh the shared security advisories

These advisories apply on every Node.js version:

- urllib: [GHSA-hq3h-g68c-hp78](https://github.com/advisories/GHSA-hq3h-g68c-hp78) lists urllib >= 3.0.0 <= 4.9.0 as affected, because urllib keeps credential headers on cross-origin redirects. In urllib 3.27.3, which easy-np uses, undici 5's `RedirectHandler` follows redirects and drops `authorization`, `cookie` and `proxy-authorization` when the origin changes; [`test/registry/get.test.js`](../test/registry/get.test.js) covers it.
- undici 5, used by urllib 3: the advisories concern WebSocket, fetch, cookies, multipart and the retry interceptor, which easy-np does not use; request smuggling needs a malicious registry or proxy.
- braces / micromatch, used by globby: deeply nested patterns can exhaust the call stack; easy-np uses them only to match the workspaces patterns in `package.json`.
