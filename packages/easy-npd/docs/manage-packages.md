# Manage installed packages

**English** · [简体中文](../zh/docs/manage-packages.md)

The `npd-x` subcommands below uninstall, update, link, fetch, rebuild and prune packages in a project installed with npd; each package version lives in its own folder, so old versions stay until you reclaim them.

## Read the node_modules layout

Every package version lives in its own folder, and the root links to the highest version of each package.

- Package contents are in `node_modules/.npd/_<name>@<version>@<name>`; each package's dependencies are links in its own `node_modules`.
- The highest version of every package is also linked to the root `node_modules/<name>`; packages declared in the root `package.json` keep the version they declare.
- A full install replaces the previous root links with the highest versions in the current tree, which can mean a downgrade.
- Git, tarball url and local packages get a source suffix after the version, such as `_foo@1.0.0+git.1a2b3c4d@foo`, `+url.<integrity digest>` or `+file.<source path digest>`, so they never share a folder with the registry package of the same name and version.
- A git dependency on a new commit, or a tarball whose content changed under the same version, is installed into a new folder.
- Install progress is recorded in `node_modules/.npd/.npd-state.json`; the packages' own `package.json` files are not modified.

## Uninstall packages

Run `npd-x uninstall <pkg>[@<version>] ...`; it removes the packages from `package.json` and `node_modules`.

| Option           | Effect                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `-g, --global`   | Uninstall global packages                                                                       |
| `--prefix=<dir>` | Global prefix                                                                                   |
| `--write=<type>` | Also remove the packages from `<type>Dependencies`; the four standard fields are always cleaned |

- npd removes root links that nothing uses anymore, so you can no longer require the uninstalled package's dependencies.
- npd reclaims version folders that nothing links to and keeps versions that other packages still use.
- The command returns after `package.json` has been written.
- preuninstall / uninstall / postuninstall of the removed packages do not run, as in npm 7+.
- Command entries in `node_modules/.bin`, including `.cmd` and `.ps1` files, are removed with the package.
- Passing `--ignore-scripts` is an error.

## Update all dependencies

Run `npd-x update`; it removes `node_modules` and reinstalls, resolving every range again instead of using the versions in `np-lock.json`, and writes the result back.

- `--clean-only` only removes `node_modules`, without reinstalling.
- Other install flags are passed to the reinstall.

## Link local folders

Run `npd-x link [<folder> ...]` to link local folders into the current project; without arguments it installs the current package and links it globally.

- `--prefix=<dir>` sets the global prefix.
- Install flags written as `--name` or `--name=value` are passed to the install it runs.
- When a linked or reinstalled global package replaces an older version, every command entry of the old version is removed first, so commands the new version dropped do not linger.

## Download packages without installing them

Run `npd-x fetch <pkg> ...` to download and extract packages only: no dependencies, no scripts, no bin links, no change to `package.json`.

- Git packages are not supported.
- Accepted options: `-r, --registry`, the proxy and certificate flags from [Choose registries and network settings](registry.md), and the cache flags from [Install offline and manage the cache](offline-and-cache.md).
- A package extracted by `fetch` is treated as unfinished, so the next full install completes it and its dependencies.

## Rerun install scripts

Run `npd-x rebuild` to rerun preinstall / install / postinstall of all installed dependencies in dependency order.

- `npd-x rebuild <pkg>[@<range>] ...` reruns only the listed packages, a package after the listed packages it depends on.
- It uses the disk cache first and downloads only missing packages.
- Install flags such as `--registry`, `--offline` and `--ignore-scripts` apply.
- After switching Node.js versions, run it to recompile native modules; after an ordinary failure or interruption, run `npd` instead, see [Resume a failed install](resume.md).
- It does not support `-g`.

## Reclaim old version folders

Run `npd-x prune` to delete the folders in `node_modules/.npd` that no link refers to; installs never delete them on their own.

1. Run `npd-x prune --dry-run`. Expected: the folders that would be deleted are listed, nothing is removed.
2. Run `npd-x prune`. Expected: those folders and their records in `.npd-state.json` are gone.

Prune works when `node_modules` or the project path goes through a symlink.
