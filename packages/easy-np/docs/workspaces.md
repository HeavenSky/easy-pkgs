# Install workspaces and control the layout

**English** · [简体中文](../zh/docs/workspaces.md)

`np-x install` in the root installs every workspace in dependency order and keeps indirect dependencies out of the root `node_modules` unless you hoist them; you need a root `package.json` with `workspaces` or a `pnpm-workspace.yaml`.

## Install a workspaces project

1. In the project root run `np-x install`. You should see: the root and every workspace installed in dependency order.
2. To install only the workspaces, without the root package's own dependencies, run `np-x install --ws`.
3. To work on one workspace, run `np-x install` inside its directory; only that workspace is handled, with the project above it as the root.

- Workspaces come from `workspaces` in `package.json`; without it, from `packages` in `pnpm-workspace.yaml` (patterns starting with `!` exclude directories).
- Workspaces are installed, and their lifecycle scripts run, in topological order of their dependencies; with a dependency cycle, the glob order is kept and a warning is printed.
- A dependency with the same name as a workspace always links the local workspace; `workspace:*`, `workspace:^`, `workspace:~` and `workspace:<range>` are supported.
- A workspace whose version does not satisfy the declared range produces a warning; when a dependency points to a local workspace, the log shows its real directory.

## Use the workspace and hoisting options

| Option                            | Meaning                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `--ws, --workspaces`              | Install all workspaces, without the root package's own dependencies; with `<pkg>`, add it to every workspace |
| `--shamefully-hoist`              | Link the highest version of every package into `<root>/node_modules`; wins over `--public-hoist-pattern`     |
| `--public-hoist-pattern=<regexp>` | Link packages whose name matches into `<root>/node_modules`, at their highest version                        |

## Decide what is hoisted

Indirect dependencies are not hoisted by default.

- `--shamefully-hoist` hoists the highest version of every package, the flat result of npminstall@6.
- `--public-hoist-pattern` or `config.np.publicHoistPattern` hoists by regular expression.
- When neither is set, easy-np reads `shamefullyHoist`, `nodeLinker: hoisted` and npm's `install-strategy=hoisted` from pnpm and `.npmrc` (each the same as `--shamefully-hoist`), and `publicHoistPattern` (a pnpm glob; a leading `!` excludes).
- A hoisted link always points to the highest version in this install's dependency tree, whatever the workspace order; dependencies declared in the root `package.json` keep their declared version.
- A full install replaces the previous hoisted links with this result, which may downgrade them; a partial install only upgrades.

## Understand node_modules/.store

- Each package lives once in `node_modules/.store/<name>@<version>/node_modules/<name>` and is linked from there.
- The highest version of each package is also linked into `node_modules/.store/node_modules`, so peers can fall back to it.
- The root `node_modules` holds only direct dependencies and hoisted packages.
- Git, tarball URL and local packages get a source tag after the version (`+git.<commit>`, `+url.<hash>`, `+file.<hash>`), so they never take the directory of a registry package with the same name and version.

## Reclaim old versions

1. See what can be removed: `np-x prune --dry-run`. You should see: lines starting with `would remove`.
2. Remove them: `np-x prune`.

- After an upgrade, old versions stay in `.store` until `np-x prune` removes them; an install never deletes them.
- `np-x uninstall` removes versions that no link references any more when it finishes.
