# Run on older Node.js and build native modules

**English** · [简体中文](../zh/docs/node-versions.md)

npd runs on Node.js 14.19.3 and later, falls back to older implementations on older versions, and installs node-gyp only when a native module needs it; building native modules needs Python 3 and a C/C++ toolchain.

## Know what changes on older Node.js

On older Node.js, npd switches to compatible older implementations and prints one line per run: `npd WARN Node vX: <what is degraded>, upgrade to Node >= <version> to restore`.

- `np_node_warning=false` hides the line.
- The version ranges are defined in `CAPABILITIES` in [`lib/runtime.js`](../lib/runtime.js).
- npd computes the suggested version from those ranges; for example, on Node 21.x the warning suggests 22.9.0. A prerelease Node.js is treated as its release version.

| Node.js                                          | node-gyp used by install scripts and `binding.gyp` builds                         | Known risk                                                                                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 20.17 to 20.x, 22.9 and later                    | `node-gyp` 12 or later (latest version whose `engines.node` matches)              | none                                                                                                                                  |
| 16.14 to 16.x, 18.0 to 20.16, 21.x, 22.0 to 22.8 | `node-gyp` 10 / 11 (chosen by `engines.node`); does not detect Visual Studio 2026 | tar 6, used by node-gyp 10, has unfixed advisories; it is used only when node-gyp downloads Node.js headers                           |
| 14.19 to 16.13, 17.x                             | `@electron/node-gyp` 10.2; does not detect Visual Studio 2026                     | tar 6, pulled in through make-fetch-happen / cacache, has unfixed advisories; it is used only when node-gyp downloads Node.js headers |

npd's own tar 7 and its dependencies declare Node 18 or later, and `type-fest` 4 (used by urllib) declares Node 16 or later, but they work on Node 14.19.3 and 16; below Node 16.6, `lib/runtime.js` adds the built-in methods they need (`String.prototype.replaceAll`, `Array.prototype.at`). The package ships an `npm-shrinkwrap.json`, so npm installs the whole dependency tree at the versions tested on these Node.js versions; pnpm and Yarn ignore that file and may resolve newer minor versions. easy-np and easy-npd do not read the `npm-shrinkwrap.json` inside dependency packages either, so `npd -g easy-npd` resolves the declared ranges again.
On Node 14 and 16, `npm i -g easy-npd` therefore prints `EBADENGINE` warnings (`notsup` with npm 6); they are expected and do not affect how npd runs. With npm's `engine-strict` turned on the install fails; run `npm i -g easy-npd --engine-strict=false`, or use Node.js 18 or later.

## Let npd install node-gyp when it is needed

npd does not depend on node-gyp: the first time an install script or a `binding.gyp` build calls `node-gyp`, npd installs the version from the table above into `npd-node-gyp/` in the cache folder (`~/.np_tarball` by default, moved by `np_cache` / `npm_config_cache`) and reuses it for the same Node.js version.

- The install uses the current registry and proxy, times out after 10 minutes and logs only to stderr.
- After each node-gyp install, npd deletes folders in `npd-node-gyp/` that are older than 1 hour and not used by any Node.js version, such as leftovers of interrupted installs.
- When `npm_config_node_gyp` is set and the file exists, npd always uses it.

## Use your own node-gyp

When npd cannot install node-gyp (no network, or the install fails), it exits with code 1 and prints the commands below for your platform.

1. Install node-gyp globally: `npm i -g node-gyp`; on Node 14.19 to 16.13 and 17.x use `npm i -g @electron/node-gyp@^10.2.0-electron.2`.
2. Point npd at it: `export npm_config_node_gyp="$(npm root -g)/node-gyp/bin/node-gyp.js"`; the error message gives the PowerShell and cmd.exe forms on Windows.
3. Run the install again. Expected: npd uses that node-gyp and does not try to install one.

## Know which dependency advisories do not affect npd

npd does not use the undici 5 code paths that its advisories concern: WebSocket, fetch, cookies, multipart and the retry interceptor (undici 5 comes with urllib 3).

- Request smuggling advisories need a malicious registry or proxy to be exploited.
- [GHSA-hq3h-g68c-hp78](https://github.com/advisories/GHSA-hq3h-g68c-hp78) reports that urllib keeps credential headers on cross-origin redirects. In urllib 3.27.3, which npd uses, undici's `RedirectHandler` follows redirects and drops `authorization`, `cookie` and `proxy-authorization` when the origin changes; [`test/registry/get.test.js`](../test/registry/get.test.js) covers this.
