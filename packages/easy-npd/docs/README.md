# easy-npd guides

**English** · [简体中文](../zh/docs/README.md)

Each page below covers one task; what easy-npd is and the shortest path to a first install are in the [README](../README.md).

| You want to                                                                          | Read                                                              |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Install npd and choose between `npd` and `npd-x install`                             | [Install npd and pick an entry point](install.md)                 |
| Add packages, choose which dependency fields are installed, override nested versions | [Install packages](install-packages.md)                           |
| Uninstall, update, link, fetch or rebuild packages, and reclaim old versions         | [Manage installed packages](manage-packages.md)                   |
| Lock versions, install strictly from the lockfile in CI                              | [Lock versions with np-lock.json](lockfile.md)                    |
| Approve or deny dependency install scripts                                           | [Approve dependency install scripts](allow-scripts.md)            |
| Use a private registry, a proxy or a custom CA                                       | [Choose registries and network settings](registry.md)             |
| Install without network, control the disk cache                                      | [Install offline and manage the cache](offline-and-cache.md)      |
| Continue after an install failed or was interrupted                                  | [Resume a failed install](resume.md)                              |
| Look up environment variables and configuration files                                | [Configure npd](configuration.md)                                 |
| Run on older Node.js, build native modules                                           | [Run on older Node.js and build native modules](node-versions.md) |
| Move a project from npminstall                                                       | [Migrate from npminstall](migrate-from-npminstall.md)             |
| Fix an error message                                                                 | [Fix common errors](troubleshooting.md)                           |

Changes per version are in the [CHANGELOG](../CHANGELOG.md).
