# easy-np guide

**English** · [简体中文](../zh/docs/README.md)

Find the page for what you want to do; each page covers one task and starts with what you need before you begin. The shortest path to a first install is [Get started](../README.md#get-started) in the README.

| What you want to do                                                              | Page                                                              |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Install easy-np, avoid the `np` name clash, choose `np` or `np-x install`        | [Install and choose an entry point](install.md)                   |
| Uninstall, update, link, fetch, rebuild or prune packages                        | [Manage packages with np-x commands](commands.md)                 |
| Pick dependency types, save to `package.json`, use `overrides`, install globally | [Choose what gets installed](install-options.md)                  |
| Make installs reproducible, run CI from a lockfile, reuse a `package-lock.json`  | [Lock versions with np-lock.json](lockfile.md)                    |
| Review and approve dependency install scripts                                    | [Approve dependency install scripts](allow-scripts.md)            |
| Use a private registry, a proxy, a CA certificate or the offline cache           | [Choose registries, proxies and the cache](registry.md)           |
| Set options through environment variables, `.nprc`, `.npmrc` or pnpm config      | [Configure easy-np](configuration.md)                             |
| Install npm workspaces, hoist packages, understand `node_modules/.store`         | [Install workspaces and control the layout](workspaces.md)        |
| Continue after a failed or interrupted install                                   | [Resume a failed install](resume.md)                              |
| Run on Node.js 14 to 22 and build native modules with node-gyp                   | [Run on older Node.js and build native modules](node-versions.md) |
| Switch from cnpm/npminstall                                                      | [Migrate from npminstall](migrate-from-npminstall.md)             |
| Fix an error message                                                             | [Troubleshooting](troubleshooting.md)                             |

Version history is in the [CHANGELOG](../CHANGELOG.md).
