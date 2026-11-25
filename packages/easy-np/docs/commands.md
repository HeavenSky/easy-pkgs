# Manage packages with np-x commands

**English** · [简体中文](../zh/docs/commands.md)

Every task besides installing has its own `np-x` command, listed below with its options; install easy-np first ([Install and choose an entry point](install.md)).

## Find the command

| Command                | Aliases         | What it does                                                                                                |
| ---------------------- | --------------- | ----------------------------------------------------------------------------------------------------------- |
| `np` / `np-x install`  | `i`, `add`      | Installs dependencies; options are in [Choose what gets installed](install-options.md)                      |
| `np-x uninstall`       | `remove`, `rm`  | Removes packages, the hoisted links nothing uses any more, and package versions nothing references          |
| `np-x update`          | `up`, `upgrade` | Deletes `node_modules` and reinstalls, ignoring the versions locked in `np-lock.json`                       |
| `np-x link`            | `ln`            | Links local folders; without arguments installs the current package and links it globally                   |
| `np-x fetch`           | none            | Only downloads and extracts the given packages: no dependencies, no scripts; git packages are not supported |
| `np-x rebuild`         | none            | Reruns `preinstall`, `install` and `postinstall` of installed dependencies, dependencies first              |
| `np-x approve-scripts` | `approve`       | Adds dependencies to `allowScripts` in `package.json` so their install scripts run                          |
| `np-x deny-scripts`    | `deny`          | Adds deny entries to `allowScripts` and removes allow entries of the same package                           |
| `np-x prune`           | none            | Reclaims unused versions and can prune to selected dependency fields                                        |
| `np-x help <command>`  | none            | Shows the help of a command, same as `np-x <command> -h`                                                    |

- Every command accepts `-v, --version` and `-h, --help`; `np -v` prints `np v<version>`, `np-x -v` and `np-x <command> -v` print `np-x v<version>`, and `np-x -h` lists all commands.
- In a workspace directory, `np`, `np-x uninstall` and `np-x update` use the project above it as the root and handle only that workspace, as npm 7+ does.
- In a workspace directory, `np-x approve-scripts`, `np-x deny-scripts` and `np-x prune` act on the whole project.

## Pass options to the other commands

| Command                                | Options                                                                                                                                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `np-x uninstall <pkg>[@<version>] ...` | `-g, --global`; `--prefix=<dir>`; `--ws, --workspaces`; `--write=<type>`: also remove from `<type>Dependencies`; the package is always removed from the four standard dependency fields |
| `np-x update`                          | `--clean-only`: only delete `node_modules`, do not reinstall; other install options are passed to the reinstall                                                                         |
| `np-x link [<folder> ...]`             | `--prefix=<dir>`; install options written as `--name` or `--name=value` are passed to the install it runs                                                                               |
| `np-x fetch <pkg> ...`                 | `-r, --registry`, proxy and certificate options, `--offline`, `--prefer-offline`, `--refresh-cache`, `--no-cache`                                                                       |
| `np-x rebuild [<pkg>[@<range>] ...]`   | install options such as `--registry`, `--offline` and `--ignore-scripts` apply as well                                                                                                  |
| `np-x approve-scripts <pkg> ...`       | `--all`: approve every unreviewed package; `--pending`: only list them; `--no-pin`: write only the name or the address without a commit                                                 |
| `np-x deny-scripts <pkg> ...`          | `--all`: deny every unreviewed package                                                                                                                                                  |
| `np-x prune`                           | `--only=<type>[,...]`, `--prod`, `--dry-run`                                                                                                                                            |

## Prune to selected dependency fields

After editing `package.json`, run `np-x prune --prod --dry-run` to preview the links, bin entries and package versions that would be removed. Run `np-x prune --prod` to apply the cleanup across the project and all its workspaces.

`--prod` is shorthand for `--only=prod`, which selects `dependencies`. Use `--only=prod,optional` to also select `optionalDependencies`. Packages still needed by the selected dependency tree keep their installed versions. Top-level package directories on disk are kept. To reinstall and resolve newer versions within the declared ranges, use `np-x update --prod`.
