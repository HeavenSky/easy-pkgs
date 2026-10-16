# 配置 easy-np

[English](../../docs/configuration.md) · **简体中文**

把参数写进环境变量或配置文件，一次设好，不必每条命令都写；命令行优先于其他一切。各参数的含义见各自的专页。

## 设置环境变量

| 环境变量                                                                                                    | 作用                                                                            |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `NODE_ENV=production`                                                                                       | 同 `--production`                                                               |
| `np_lockfile=true\|false`                                                                                   | 开关 `np-lock.json`，优先于 `config.np.lockfile`                                |
| `np_cache`、`npm_config_cache`                                                                              | 磁盘缓存目录，默认 `~/.np_tarball`，`np_cache` 优先                             |
| `np_probe_cache`                                                                                            | 同 `--probe-cache`                                                              |
| `np_node_warning=false`                                                                                     | 关闭老版本 Node.js 的降级提示                                                   |
| `npm_registry`                                                                                              | 未传 `--registry` 时使用的源                                                    |
| `npm_config_node_gyp`                                                                                       | 指向已有的 `node-gyp.js`，不再按需安装 node-gyp                                 |
| `npm_config_proxy`、`npm_config_https_proxy`、`npm_config_noproxy`、`HTTP_PROXY`、`HTTPS_PROXY`、`NO_PROXY` | 未传代理参数时依次读取 `npm_config_*`、`~/.nprc`、`HTTP_PROXY` 等（含小写形式） |
| `npm_config_strict_ssl`、`npm_config_cafile`                                                                | 同 `--strict-ssl`、`--cafile`                                                   |
| `npm_config_dangerously_allow_all_scripts`、`npm_config_strict_allow_scripts`                               | 同对应参数                                                                      |

## easy-np 读取哪些文件

| 配置位置                                                  | 读取的键                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `~/.nprc`（与 easy-npd 共用）                             | `registry`、`@scope:registry`、`<registry>:username` / `:_password`、`proxy`、`https-proxy`、`noproxy`、`cafile`、`strict-ssl`、`allow-scripts`、`dangerously-allow-all-scripts`、`strict-allow-scripts`                                                                                                |
| 根 `package.json`                                         | 依赖字段、`allowScripts`、`overrides`、`resolutions`、`workspaces`、`config.np.lockfile`、`config.np.publicHoistPattern`                                                                                                                                                                                |
| `.npmrc` 与 `npm_config_*`                                | `<registry>:_authToken`、`prefix`、经 `npm config get` 读取的 `ignore-scripts` 与 `save-prefix`，以及 `registry`、`@scope:registry`、`dangerously-allow-all-scripts`、`strict-allow-scripts`、`lockfile`、`package-lock`、`shamefully-hoist`、`public-hoist-pattern`、`node-linker`、`install-strategy` |
| `pnpm-workspace.yaml`，其次 `package.json` 的 `pnpm` 字段 | `onlyBuiltDependencies`、`ignoredBuiltDependencies`、`neverBuiltDependencies`、`allowBuilds`、`dangerouslyAllowAllBuilds`、`strictDepBuilds`、`lockfile`、`shamefullyHoist`、`publicHoistPattern`、`nodeLinker`、`packages`（`package.json` 没有 `workspaces` 时作为 workspaces）                       |

`np` 与 `np <pkg>` 都读取 `package.json` 中的 `config.np`。

## 哪个设置优先

命令行与 `~/.nprc` 优先于 `.npmrc` 这一层。

- `.npmrc` 这一层包括从当前目录向上的每个 `.npmrc`、`~/.npmrc` 与 `npm_config_*` 环境变量。
- 安装源取 `--registry`、`npm_registry`、`~/.nprc`、`.npmrc` / `npm_config_registry` 中第一个有配置的。
- scope 源依次取 `~/.nprc`、`.npmrc` 的 `@scope:registry`。
- 源的凭据（`.npmrc` 的 `_authToken` 与 `~/.nprc` 的用户名密码）只附加到与该源同 host 的请求；`always-auth` 不生效。
- easy-np 写入 `package.json` 时用 `npm config get` 读取 `save-prefix`（超时 30 秒），npm 卡住时退回 `^`。
