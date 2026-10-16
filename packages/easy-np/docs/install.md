# Install and choose an entry point

**English** · [简体中文](../zh/docs/install.md)

One global install gives you both `np` and `np-x`; you need Node.js >= 14.18.0 with npm. The shortest path is [Get started](../README.md#get-started) in the README.

## Install the package

1. Install globally: `npm i -g easy-np`. You should see: `np -v` printing `np v<version>`.
2. To build native modules, also install Python 3 and a C/C++ toolchain. node-gyp is not installed with the package; see [Run on older Node.js and build native modules](node-versions.md).

To install code that is not released yet:

1. Clone the repository: `git clone https://github.com/HeavenSky/easy-pkgs.git`.
2. Run `npm pack` in `packages/easy-np`. You should see: an `easy-np-<version>.tgz` file in that directory.
3. Install it globally: `npm i -g ./easy-np-<version>.tgz`.

## Avoid the np name clash

The global command `np` has the same name as the npm package [`np`](https://www.npmjs.com/package/np), the release tool by sindresorhus. If one of them is installed globally, installing the other fails with `EEXIST`; add `--force` to overwrite the existing command. As project dependencies the two do not conflict.

## Choose np or np-x install

`np` is `np-x install` plus `--no-lockfile --dangerously-allow-all-scripts`; everything else behaves the same.

| Default behavior                | `np`                | `np-x install`                                               |
| ------------------------------- | ------------------- | ------------------------------------------------------------ |
| `np-lock.json`                  | not read or written | read and written                                             |
| Install scripts of dependencies | all run             | run only when approved in [`allowScripts`](allow-scripts.md) |

- The two added options count as command-line options: environment variables and config files (`np_lockfile`, `config.np.lockfile`, `npm_config_*`, `~/.nprc`, `.npmrc`, pnpm settings) cannot change them.
- To override them, pass `--lockfile` or `--frozen-lockfile`, or `--no-dangerously-allow-all-scripts`, on the command line.
- When an install script run by `np-x` calls `np` (including through `npm_execpath`), that call behaves as `np-x install` and does not get the two options.
