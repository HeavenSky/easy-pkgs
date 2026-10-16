# Configure easy-np

**English** · [简体中文](../zh/docs/configuration.md)

Set an option once in an environment variable or config file instead of on every command; the command line wins over everything else. The meaning of each option is on its own page.

## Set environment variables

| Environment variable                                                                                        | Effect                                                                                                       |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV=production`                                                                                       | Same as `--production`                                                                                       |
| `np_lockfile=true\|false`                                                                                   | Turns `np-lock.json` on or off; wins over `config.np.lockfile`                                               |
| `np_cache`, `npm_config_cache`                                                                              | Disk cache directory, default `~/.np_tarball`; `np_cache` wins                                               |
| `np_probe_cache`                                                                                            | Same as `--probe-cache`                                                                                      |
| `np_node_warning=false`                                                                                     | Turns off the warning about features reduced on older Node.js                                                |
| `npm_registry`                                                                                              | Registry used when `--registry` is not passed                                                                |
| `npm_config_node_gyp`                                                                                       | Points to an existing `node-gyp.js` instead of installing node-gyp on demand                                 |
| `npm_config_proxy`, `npm_config_https_proxy`, `npm_config_noproxy`, `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` | Without proxy options, read in the order `npm_config_*`, `~/.nprc`, `HTTP_PROXY` and similar (lowercase too) |
| `npm_config_strict_ssl`, `npm_config_cafile`                                                                | Same as `--strict-ssl`, `--cafile`                                                                           |
| `npm_config_dangerously_allow_all_scripts`, `npm_config_strict_allow_scripts`                               | Same as the matching options                                                                                 |

## Which files easy-np reads

| Location                                                       | Keys read                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `~/.nprc` (shared with easy-npd)                               | `registry`, `@scope:registry`, `<registry>:username` / `:_password`, `proxy`, `https-proxy`, `noproxy`, `cafile`, `strict-ssl`, `allow-scripts`, `dangerously-allow-all-scripts`, `strict-allow-scripts`                                                                                                    |
| root `package.json`                                            | dependency fields, `allowScripts`, `overrides`, `resolutions`, `workspaces`, `config.np.lockfile`, `config.np.publicHoistPattern`                                                                                                                                                                           |
| `.npmrc` and `npm_config_*`                                    | `<registry>:_authToken`, `prefix`, `ignore-scripts` and `save-prefix` read through `npm config get`, plus `registry`, `@scope:registry`, `dangerously-allow-all-scripts`, `strict-allow-scripts`, `lockfile`, `package-lock`, `shamefully-hoist`, `public-hoist-pattern`, `node-linker`, `install-strategy` |
| `pnpm-workspace.yaml`, then the `pnpm` field of `package.json` | `onlyBuiltDependencies`, `ignoredBuiltDependencies`, `neverBuiltDependencies`, `allowBuilds`, `dangerouslyAllowAllBuilds`, `strictDepBuilds`, `lockfile`, `shamefullyHoist`, `publicHoistPattern`, `nodeLinker`, `packages` (used as workspaces when `package.json` has no `workspaces`)                    |

`config.np` in `package.json` is read both for `np` and for `np <pkg>`.

## Which setting wins

The command line and `~/.nprc` win over the `.npmrc` layer.

- The `.npmrc` layer covers every `.npmrc` from the current directory up, `~/.npmrc`, and `npm_config_*` variables.
- The install registry is the first one set among `--registry`, `npm_registry`, `~/.nprc`, `.npmrc` / `npm_config_registry`.
- A scope registry is the first `@scope:registry` set in `~/.nprc`, then `.npmrc`.
- Registry credentials (`_authToken` from `.npmrc` and the username and password from `~/.nprc`) are sent only to requests on the same host as the registry; `always-auth` has no effect.
- When easy-np writes to `package.json`, it reads `save-prefix` with `npm config get` (30-second timeout) and falls back to `^` if npm hangs.
