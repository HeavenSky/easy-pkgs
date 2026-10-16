# Choose registries and network settings

**English** · [简体中文](../zh/docs/registry.md)

Public registries need no setup: npd picks the fastest ones and switches between them; set a registry, a proxy or a CA only for private or restricted networks.

## Pick the registry

The install registry comes from the first of these that is set: `-r, --registry=<url>`, the `npm_registry` environment variable, `registry` in `~/.nprc`, then `registry` in `.npmrc` or `npm_config_registry`.

- A scope registry comes from `@scope:registry` in `~/.nprc`, then in `.npmrc`.
- Both entry points follow this order; for example, a private registry in the project's `.npmrc` is used by `npd` and `npd-x install` alike.
- How `.npmrc` files are found is described in [Configure npd](configuration.md).

## Let npd switch public registries

When you set no private registry, npd chooses among five public registries: npm (`registry.npmjs.org`), yarn (`registry.yarnpkg.com`), alibaba (`registry.npmmirror.com`), tencent (`mirrors.tencent.com/npm`) and huawei (`mirrors.huaweicloud.com/repository/npm`).

- Probing: at start, npd requests the same small file from every registry at the same time and keeps the three that answer first, in answer order; if fewer than three answer, npd fills the gap from the list above.
- npd stores the probe result in `np-probe.json` in the cache folder, which is `~/.np_tarball` by default and shared with easy-np. It reuses the result for 5 minutes by default; `--probe-cache=<minutes>` or `np_probe_cache` changes that, and `0` probes on every run.
- Retries: a failed manifest or tarball request moves to the next of the three registries, for up to two rounds, so at most 6 attempts including the first.
- Mirror lag: when a mirror's manifest lacks the version to install, npd fetches it from npm.
- Setting one of the five public registries puts it first; npd still probes, and the other two places come from the probe.
- Setting any other registry turns switching off; setting a registry for one scope turns it off for that scope only.
- `--offline` and `--prefer-offline` skip the probe: the registry you set, if any, comes first, then the list order above.
- The cache is shared by all public registries, so switching never downloads a package twice.

### Binary downloads

Install scripts that download binaries or Node.js headers use either the npmmirror binary mirror or the official address.

- Without a registry set, npd probes both at the same time as the registries and tries the faster one first.
- On failure the two alternate, up to 4 attempts including the first.
- When you set one of the public registries, or the probe is skipped, binaries follow the first registry: npm and yarn use the official address, the others use the mirror.

## Send credentials only where they belong

npd sends registry credentials only to the host they were configured for.

- `_authToken` for a registry in `.npmrc` and the username / password for a registry in `~/.nprc` go only to requests on the same host as that registry.
- `always-auth` does not send credentials to other hosts.
- Credentials are replaced with `***` in errors, warnings, `npd-debug.log` and debug output, including: credentials in URLs (`user:pass@`), the values of `_authToken`, `_auth` and `_password`, and query parameters such as `token`, `access_token`, `auth`, `_authToken` and `password`.

## Go through a proxy or a custom CA

Pass proxy and certificate settings as flags, or let npd read them from the environment; npd also hands them to the processes it starts.

| Flag                                   | Effect                                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| `--proxy=<url>`, `--https-proxy=<url>` | http / https proxy                                                                        |
| `--noproxy=<host>[,<host>]`            | Hosts that bypass the proxy                                                               |
| `--cafile=<file>`                      | CA certificate for https requests; a relative path is resolved against the current folder |
| `--strict-ssl`, `--no-strict-ssl`      | Verify certificates or not; verified by default                                           |

- Without proxy flags, npd reads `npm_config_*`, then `~/.nprc`, then `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` (lower case too).
- npd passes the same proxy, CA and certificate settings to install scripts, node-gyp and git.
- `--strict-ssl` on the command line overrides an inherited `npm_config_strict_ssl=false` and clears `GIT_SSL_NO_VERIFY` for child processes.

## Restrict where packages come from

Two flags make the install fail instead of accepting packages you do not want.

| Flag                                         | Effect                                             |
| -------------------------------------------- | -------------------------------------------------- |
| `--registry-only`                            | Fail when a package comes from git or a remote url |
| `--forbidden-licenses=<license>[,<license>]` | Fail when a package uses one of these licenses     |

## Know how downloads are verified

npd verifies every tarball from a registry with the strongest algorithm in `dist.integrity`, usually sha512.
