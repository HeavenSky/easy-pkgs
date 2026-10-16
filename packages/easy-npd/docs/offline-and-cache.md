# Install offline and manage the cache

**English** · [简体中文](../zh/docs/offline-and-cache.md)

`--offline` installs from the disk cache without a single request, as long as the packages were installed online once; other flags control how npd uses the cache.

## Install offline

1. While online, install the project once with `npd` or `npd-x install`. Expected: the manifests and tarballs are now in the disk cache.
2. Offline, run `npd --offline`. Expected: npd reads only the disk cache and sends no request, not even the registry probe.

- If a manifest or tarball is missing from the cache, the install fails at once without retrying.
- Git packages and tarball url dependencies always fail offline.
- The list of binary mirror settings that npd passes to install scripts (the `binary-mirror-config` package) normally comes from the registry; offline, npd uses the copy installed with it.
- `--offline` cannot be combined with `--no-cache`.

## Choose how the cache is used

npd uses the disk cache by default and revalidates cached manifests online; these flags change that.

| Flag               | Effect                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| `--offline`        | Read only the disk cache, send no request; see above                                               |
| `--prefer-offline` | Use cached manifests without revalidating them; go online only for packages missing from the cache |
| `--refresh-cache`  | Ignore the cached manifests and tarballs, download again and overwrite them                        |
| `--no-cache`       | Use neither the disk cache nor the probe cache                                                     |

- `--production` uses the disk cache like any other install.
- npd deletes a corrupt tarball in the cache and downloads it again.

## Find the cache

The cache folder is `~/.np_tarball` by default; `np_cache` or `npm_config_cache` moves it, and `np_cache` wins when both are set.

- easy-np uses the same `~/.nprc` and the same cache folder.
- Manifests of the public registries are cached under the npm registry address, so they are shared across registries.
- `np-probe.json` holds the registry probe result, see [Choose registries and network settings](registry.md#let-npd-switch-public-registries).
- `npd-node-gyp/` holds node-gyp installs, see [Run on older Node.js and build native modules](node-versions.md).
- `np-script-logs/<time>-<name>@<version>-<random>.log` holds the command and full output of each failed background install script; the error message ends with `script output: <path>`.
- With `--no-cache`, script logs still go to the folder from `np_cache`, `npm_config_cache` or `~/.np_tarball`.
- Script logs older than 7 days are deleted the next time a log is written.
