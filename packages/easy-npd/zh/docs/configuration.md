# 配置 npd

[English](../../docs/configuration.md) · **简体中文**

npd 直接读取现有的 npm 与 pnpm 配置，多数项目不需要专门为 npd 配置；下面两张表列出每个行为由哪个环境变量或文件控制。

## 设置环境变量

环境变量对该 shell 中的每次 npd 运行生效；命令行参数优先于它们。

| 环境变量                                                                                                    | 作用                                                                                          |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `NODE_ENV=production`                                                                                       | 同 `--production`                                                                             |
| `np_lockfile=true\|false`                                                                                   | 开启或关闭 `np-lock.json`，优先于 `config.np.lockfile`                                        |
| `np_cache`、`npm_config_cache`                                                                              | 磁盘缓存目录，默认 `~/.np_tarball`；`np_cache` 优先                                           |
| `np_probe_cache`                                                                                            | 同 `--probe-cache`                                                                            |
| `np_node_warning=false`                                                                                     | 关闭旧版 Node.js 上的告警                                                                     |
| `npm_registry`                                                                                              | 未传 `--registry` 时使用的源                                                                  |
| `npm_config_node_gyp`                                                                                       | 指向已有的 `node-gyp.js`，npd 不再安装 node-gyp                                               |
| `npm_config_proxy`、`npm_config_https_proxy`、`npm_config_noproxy`、`HTTP_PROXY`、`HTTPS_PROXY`、`NO_PROXY` | 未传代理参数时的代理设置；先 `npm_config_*`，再 `~/.nprc`，最后 `HTTP_PROXY` 等（含小写形式） |
| `npm_config_strict_ssl`、`npm_config_cafile`                                                                | 同 `--strict-ssl`、`--cafile`                                                                 |
| `npm_config_dangerously_allow_all_scripts`、`npm_config_strict_allow_scripts`                               | 同对应名称的参数                                                                              |

## 了解读取哪些文件

npd 读取自己的 `~/.nprc`，以及 npm 与 pnpm 已在使用的文件。

| 位置                                                        | 读取的键                                                                                                                                                                                                  |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `~/.nprc`（与 easy-np 共用）                                | `registry`、`@scope:registry`、`<registry>:username` / `:_password`、`proxy`、`https-proxy`、`noproxy`、`cafile`、`strict-ssl`、`allow-scripts`、`dangerously-allow-all-scripts`、`strict-allow-scripts`  |
| 根 `package.json`                                           | 依赖字段、`allowScripts`、`overrides`、`resolutions`、`config.np.lockfile`（与 easy-np 同一个键）                                                                                                         |
| `.npmrc` 与 `npm_config_*`                                  | `<registry>:_authToken`；经 `npm config get` 读取的 `ignore-scripts` 与 `save-prefix`；`registry`、`@scope:registry`、`dangerously-allow-all-scripts`、`strict-allow-scripts`、`lockfile`、`package-lock` |
| `pnpm-workspace.yaml`，其次是 `package.json` 的 `pnpm` 字段 | `onlyBuiltDependencies`、`ignoredBuiltDependencies`、`neverBuiltDependencies`、`allowBuilds`、`dangerouslyAllowAllBuilds`、`strictDepBuilds`、`lockfile`                                                  |

- `.npmrc` 从当前目录向上逐级查找，此外还读取 `~/.npmrc` 与 `npm_config_*` 环境变量。
- 命令行与 `~/.nprc` 优先于 `.npmrc`。
- 各设置的优先顺序写在对应的任务页：[源](registry.md#选择源)、[锁文件](lockfile.md#开启或关闭锁文件)、[安装脚本](allow-scripts.md#确定哪个策略生效)。
- 已移除的 npminstall 设置 `npm_china` 与 `config.npminstall.*` 不再读取，也不会报错。
- 安装脚本收到的 `npm_config_cafile` 是绝对路径。
