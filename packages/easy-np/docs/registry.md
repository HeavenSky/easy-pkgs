# Choose registries, proxies and the cache

**English** · [简体中文](../zh/docs/registry.md)

Without any registry setting, easy-np switches among five public registries by speed; a private registry, a proxy, a CA certificate or the offline cache is one option away, for both entry points.

## Use the registry and network options

| Option                                       | Meaning                                                                                                                                                                                                                     |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-r, --registry=<url>`                       | Registry to install from; without it, `npm_registry`, `~/.nprc` and `.npmrc` / `npm_config_registry` are tried in this order; the five public registries still switch automatically, any other registry turns switching off |
| `--probe-cache=<minutes>`                    | How long to reuse the last speed probe, default 5; `0` probes every time                                                                                                                                                    |
| `--proxy=<url>`, `--https-proxy=<url>`       | http / https proxy, also passed to install scripts, node-gyp and git                                                                                                                                                        |
| `--noproxy=<host>[,<host>]`                  | Hosts that bypass the proxy                                                                                                                                                                                                 |
| `--cafile=<file>`                            | CA certificate for https requests; a relative path is resolved against the current directory                                                                                                                                |
| `--strict-ssl`, `--no-strict-ssl`            | Verify certificates or not, verified by default; `--strict-ssl` overrides an inherited `npm_config_strict_ssl=false`                                                                                                        |
| `--registry-only`                            | Fail when any package comes from git or a remote URL                                                                                                                                                                        |
| `--forbidden-licenses=<license>[,<license>]` | Fail when any package uses one of these licenses                                                                                                                                                                            |

Without proxy options, easy-np reads `npm_config_*`, then `~/.nprc`, then `HTTP_PROXY` and similar variables (lowercase too); see [Configure easy-np](configuration.md).

## Use the cache options

| Option             | Meaning                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `--offline`        | Read only the disk cache and send no request at all, not even a speed probe; git packages and tarball URL dependencies are not supported |
| `--prefer-offline` | Use cached manifests without revalidating them; only packages missing from the cache go to the network                                   |
| `--refresh-cache`  | Ignore the cached manifests and tgz files, download again and overwrite them                                                             |
| `--no-cache`       | Use neither the disk cache nor the probe cache; cannot be combined with `--offline`                                                      |

## Let easy-np switch public registries

Without a private registry, easy-np chooses among five public registries: npm (`registry.npmjs.org`), yarn (`registry.yarnpkg.com`), alibaba (`registry.npmmirror.com`), tencent (`mirrors.tencent.com/npm`) and huawei (`mirrors.huaweicloud.com/repository/npm`).

- You name a registry with `--registry`, `npm_registry`, `~/.nprc` or `.npmrc` / `npm_config_registry`; for example, when the project `.npmrc` sets a private registry, both entry points install from it.
- Naming one of the five public registries puts it first; the other two still come from the probe.
- Naming a private registry turns switching off completely; a registry set for one scope turns switching off only for that scope.
- Choosing: at the start of each run easy-np requests the same small file from every registry and remembers the first three that answer, in order; if fewer than three answer, the list above fills the gap. The result is saved in `~/.np_tarball/np-probe.json` (shared with easy-npd) and reused for 5 minutes by default.
- Retrying: a failed manifest or tgz request is retried on these three registries in order, for at most 2 rounds, so at most 6 attempts including the first.
- Binary downloads: easy-np chooses only between the npmmirror binary mirror and the official addresses, ordered by the same probe. When an install script fails to download a binary or Node.js headers, the two are tried in turn, at most 4 attempts including the first. When no probe runs because you named a public registry or work offline, binaries follow the first registry: npm and yarn use the official addresses, the others use the mirror.
- Mirror lag: when a mirror's manifest lacks the version to install, easy-np fetches it from the official npm registry.

## Where the cache lives

- easy-np shares `~/.nprc` and the disk cache `~/.np_tarball` with easy-npd; all public registries share one cache, so switching registries does not download again.
- When a dependency script running in the background fails, its command and full output are written to `np-script-logs/<time>-<name>@<version>-<random>.log` in the cache directory, and the error ends with that path.
- With `--no-cache`, these logs go to `np_cache`, `npm_config_cache` or `~/.np_tarball`, in that order.
- Logs older than 7 days are deleted the next time a log is written.
- A damaged tgz in the cache is deleted and downloaded again.
