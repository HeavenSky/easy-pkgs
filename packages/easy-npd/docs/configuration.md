# Configure npd

**English** · [简体中文](../zh/docs/configuration.md)

npd reads your existing npm and pnpm configuration, so most projects need no npd-specific setup; the tables below show which variable or file controls what.

## Set environment variables

Environment variables apply to every npd run in that shell; flags on the command line win over them.

| Variable                                                                                                    | Effect                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV=production`                                                                                       | Same as `--production`                                                                                                             |
| `np_lockfile=true\|false`                                                                                   | Turn `np-lock.json` on or off; wins over `config.np.lockfile`                                                                      |
| `np_cache`, `npm_config_cache`                                                                              | Disk cache folder, default `~/.np_tarball`; `np_cache` wins                                                                        |
| `np_probe_cache`                                                                                            | Same as `--probe-cache`                                                                                                            |
| `np_node_warning=false`                                                                                     | Hide the warning printed on older Node.js                                                                                          |
| `npm_registry`                                                                                              | Registry used when `--registry` is not passed                                                                                      |
| `npm_config_node_gyp`                                                                                       | Path to an existing `node-gyp.js`; npd then does not install node-gyp                                                              |
| `npm_config_proxy`, `npm_config_https_proxy`, `npm_config_noproxy`, `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` | Proxy settings when no proxy flag is passed; `npm_config_*` first, then `~/.nprc`, then `HTTP_PROXY` and the rest (lower case too) |
| `npm_config_strict_ssl`, `npm_config_cafile`                                                                | Same as `--strict-ssl`, `--cafile`                                                                                                 |
| `npm_config_dangerously_allow_all_scripts`, `npm_config_strict_allow_scripts`                               | Same as the flags of the same name                                                                                                 |

## Know which files are read

npd reads its own `~/.nprc` plus the files npm and pnpm already use.

| Location                                                       | Keys read                                                                                                                                                                                                |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `~/.nprc` (shared with easy-np)                                | `registry`, `@scope:registry`, `<registry>:username` / `:_password`, `proxy`, `https-proxy`, `noproxy`, `cafile`, `strict-ssl`, `allow-scripts`, `dangerously-allow-all-scripts`, `strict-allow-scripts` |
| Root `package.json`                                            | Dependency fields, `allowScripts`, `overrides`, `resolutions`, `config.np.lockfile` (the same key as easy-np)                                                                                            |
| `.npmrc` and `npm_config_*`                                    | `<registry>:_authToken`; `ignore-scripts` and `save-prefix` through `npm config get`; `registry`, `@scope:registry`, `dangerously-allow-all-scripts`, `strict-allow-scripts`, `lockfile`, `package-lock` |
| `pnpm-workspace.yaml`, then the `pnpm` field of `package.json` | `onlyBuiltDependencies`, `ignoredBuiltDependencies`, `neverBuiltDependencies`, `allowBuilds`, `dangerouslyAllowAllBuilds`, `strictDepBuilds`, `lockfile`                                                 |

- npd looks for `.npmrc` in the current folder and each parent, then reads `~/.npmrc` and the `npm_config_*` variables.
- The command line and `~/.nprc` win over `.npmrc`.
- The order for each setting is on its task page: [registries](registry.md#pick-the-registry), [lockfile](lockfile.md#turn-the-lockfile-on-or-off), [install scripts](allow-scripts.md#know-which-policy-wins).
- The removed npminstall settings `npm_china` and `config.npminstall.*` are no longer read and cause no error.
- Install scripts receive `npm_config_cafile` as an absolute path.
