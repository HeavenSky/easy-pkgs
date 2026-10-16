# Install npd and pick an entry point

**English** · [简体中文](../zh/docs/install.md)

Installing easy-npd globally gives you two commands: `npd`, which keeps npminstall's habits, and `npd-x`, which follows npm / pnpm defaults; you need Node.js 14.18.0 or later.
The shortest path is the [quick start](../README.md#get-started); this page covers the full install.

## Install the commands

1. Run `npm i -g easy-npd`. Expected: `npd -v` prints `npd v<version>` and `npd-x -v` prints `npd-x v<version>`.
2. If npm stops with `EEXIST`, another global package already owns the `npd` command, usually the npm package [`npd`](https://www.npmjs.com/package/npd) (Node Packages Deployer). Run `npm i -g easy-npd --force` to overwrite it. As project dependencies the two packages do not conflict.

Compiling native modules also needs Python 3 and a C/C++ toolchain; npd does not ship node-gyp, see [Run on older Node.js and build native modules](node-versions.md).

### Install unreleased code

1. In `packages/easy-npd` of this repository, run `npm pack`. Expected: an `easy-npd-<version>.tgz` file appears.
2. Run `npm i -g ./easy-npd-<version>.tgz`.

## Choose npd or npd-x install

**`npd` is `npd-x install` with `--no-lockfile --dangerously-allow-all-scripts` added**; everything else, including reading `.npmrc` and pnpm settings, is the same.

| Default                    | `npd`               | `npd-x install`                                                                    |
| -------------------------- | ------------------- | ---------------------------------------------------------------------------------- |
| `np-lock.json`             | not read or written | read and written, see [Lock versions with np-lock.json](lockfile.md)               |
| Dependency install scripts | all run             | run only when approved, see [Approve dependency install scripts](allow-scripts.md) |

- The two added flags count as command-line flags: environment variables and configuration files (`np_lockfile`, `config.np.lockfile`, `npm_config_*`, `~/.nprc`, `.npmrc`, pnpm settings) cannot change them.
- To override them, pass `--lockfile` / `--frozen-lockfile` or `--no-dangerously-allow-all-scripts` on the command line.
- When an install script run by `npd-x` calls `npd` (including through `npm_execpath`), that call behaves as `npd-x install` and does not get the two flags.

## Find the command for a task

| Command                 | Aliases         | What it does                                                                                        |
| ----------------------- | --------------- | --------------------------------------------------------------------------------------------------- |
| `npd` / `npd-x install` | `i`, `add`      | Install dependencies, see [Install packages](install-packages.md)                                   |
| `npd-x uninstall`       | `remove`, `rm`  | Remove packages, the hoisted links nothing uses and the version folders nothing links to            |
| `npd-x update`          | `up`, `upgrade` | Remove `node_modules` and reinstall, ignoring the versions locked in `np-lock.json`                 |
| `npd-x link`            | `ln`            | Link local folders; without arguments, install the current package and link it globally             |
| `npd-x fetch`           | none            | Only download and extract packages, without dependencies or scripts; git packages are not supported |
| `npd-x rebuild`         | none            | Rerun preinstall / install / postinstall of installed dependencies                                  |
| `npd-x approve-scripts` | `approve`       | Add dependencies to `allowScripts` in `package.json` so their install scripts run                   |
| `npd-x deny-scripts`    | `deny`          | Add deny entries to `allowScripts` and remove existing allow entries of the same package            |
| `npd-x prune`           | none            | Remove `_<name>@<version>@<name>` folders in `node_modules` that nothing links to                   |
| `npd-x help <command>`  | none            | Show the help of a subcommand, same as `npd-x <command> -h`                                         |

- Every command accepts `-v, --version` and `-h, --help`; `npd-x -h` lists all subcommands.
- Options for every command other than install are listed in [Manage installed packages](manage-packages.md).
- npd does not support npm workspaces: with `workspaces` in the root `package.json` it warns and installs only the root dependencies; use [easy-np](../../easy-np/README.md) for workspaces.
