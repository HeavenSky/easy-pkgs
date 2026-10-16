# 从 npminstall 迁移

[English](../../docs/migrate-from-npminstall.md) · **简体中文**

四步就能把项目从 [cnpm/npminstall](https://github.com/cnpm/npminstall) 切换到 easy-np（代码派生自 npminstall 8.0.1）；先安装 easy-np（[安装与选择入口](install.md)）。

## 切换一个项目

1. 删除 npminstall 装出的 `node_modules`：easy-np 把它视为未完成的安装。
2. 把 `~/.cnpmrc` 中的设置复制到 `~/.nprc`，并把 `package.json` 中的 `config.npminstall` 改名为 `config.np`。
3. 按下面的表格替换脚本中的命令与参数；传入已移除的命令行参数时，easy-np 报错退出并给出替代写法。
4. 安装：`np`。应看到：默认行为与 npminstall 相同，不写锁文件，执行全部依赖脚本；想要锁文件和脚本审核时改用 `np-x install`（[选择 np 还是 np-x install](install.md#选择-np-还是-np-x-install)）。

## 改名的命令、文件与配置

| 项                  | npminstall                                                                   | easy-np                                                           |
| ------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 包名与命令          | 包名 `npminstall`；命令 `npminstall`、`npmlink`、`npmuninstall`、`npmupdate` | 包名 `easy-np`；命令 `np` 与 `np-x`                               |
| 用户配置文件        | `~/.cnpmrc`                                                                  | `~/.nprc`，与 easy-npd 共用                                       |
| 缓存目录            | `~/.npminstall_tarball`，环境变量 `npminstall_cache`                         | `~/.np_tarball`，环境变量 `np_cache`；两边都认 `npm_config_cache` |
| `package.json` 配置 | `config.npminstall`                                                          | `config.np`                                                       |
| 安装完成标记        | 包内 `package.json` 的 `__npminstall_done`                                   | `node_modules/.store/.np-state.json`                              |
| User-Agent          | `npminstall/<version>`                                                       | `easy-np/<version>`                                               |

## 预期这些行为差异

npminstall 已有的功能中，行为不同且对使用有影响的项：

| 项                             | npminstall                                                       | easy-np                                                                                                                                                                           |
| ------------------------------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 安装失败                       | 停在第一个错误                                                   | 继续安装其余包，再次运行从断点继续（[从失败的安装继续](resume.md)）                                                                                                               |
| 提升到根目录的包               | 固定提升名称匹配 eslint、prettier、babel 的包                    | 默认不提升（[决定提升哪些包](workspaces.md#决定提升哪些包)）                                                                                                                      |
| 提升链接的版本                 | 已有链接时保留                                                   | 始终取本次依赖树中的最高版本；根 `package.json` 声明的依赖保持声明版本                                                                                                            |
| 缺失的 peerDependencies        | 只告警                                                           | 与 npm 7+ 一致自动安装，失败时按可选依赖跳过                                                                                                                                      |
| 版本选择                       | 不看 `engines`                                                   | 与 npm 一致优先选 `engines.node` 兼容的版本                                                                                                                                       |
| tarball 完整性校验             | 只校验 sha1                                                      | 按 `dist.integrity` 中最强的算法校验                                                                                                                                              |
| 源的凭据                       | `.nprc` 用户名密码按子串匹配附加，`always-auth` 时附加到所有请求 | `.npmrc` 的 `_authToken` 与 `.nprc` 的用户名密码都只附加到与该源同 host 的请求，`always-auth` 不生效                                                                              |
| `np-x uninstall`               | 保留提升链接；可能在写回 `package.json` 前返回                   | 移除不再被使用的提升链接；写回完成后返回                                                                                                                                          |
| git 依赖                       | 经 pacote 获取，构建时调用 `npm install`                         | 直接调用 git CLI（本机需要 git），用 np 自身安装构建依赖                                                                                                                          |
| 本地目录依赖                   | `npm pack`，失败时复制整个目录                                   | 受信目录（由根项目或 workspace 声明，见[哪些脚本需要放行](allow-scripts.md#哪些脚本需要放行)）在 npm >= 7.18 时用 `npm pack`；其余按 `files` 与 `.npmignore` 规则复制，不执行脚本 |
| 缓存中损坏的 tgz               | 每次重试都读到同一个坏文件                                       | 删除后重新下载                                                                                                                                                                    |
| 重复传入的单值参数             | 部分取第一个，部分变成数组后报错                                 | 与 npm 一致取最后一个；`--allow-scripts`、`--only`、`--include`、`--omit` 合并全部取值                                                                                            |
| `--from-package-lock` 加载失败 | 告警后改为联网解析                                               | 报错退出                                                                                                                                                                          |
| `--offline`                    | 缓存中没有时仍会联网                                             | 只读磁盘缓存，不发任何请求                                                                                                                                                        |
| `--proxy`、`--strict-ssl`      | 不生效                                                           | 生效，并传给安装脚本、node-gyp 与 git                                                                                                                                             |

## 替换已移除的命令与参数

传入已移除的命令行参数时报错并给出替代写法；已移除的环境变量与 `package.json` 配置（如 `npm_china`、`config.npminstall.*`）不再读取，也不报错。

| 项                                                                         | 原含义                              | 现状与替代                                                                  |
| -------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| `npminstall`、`npmuninstall`、`npmupdate`、`npmlink` 命令                  | 各子功能的独立命令                  | 改为 `np` 与 `np-x <command>`                                               |
| `-S/--save`                                                                | 保存到 `dependencies`               | 移除，默认就保存到 `dependencies`                                           |
| `-D/--save-dev`、`-O/--save-optional`                                      | 保存到对应字段                      | `--write=dev`、`--write=optional`；`np-x uninstall` 同样改用 `--write`      |
| `-E/--save-exact`                                                          | 保存精确版本                        | `--write-exact`                                                             |
| `--client`、`--save-client`、`--save-build`、`--save-isomorphic`           | 安装或保存 cnpm 的三类依赖字段      | `--only`、`--include`、`--write=<type>`；默认不安装这三类字段               |
| `--no-optional`、`--legacy-peer-deps`                                      | 跳过可选依赖，不自动安装 peer       | `--omit=optional`、`--omit=peer`                                            |
| `--production` 关闭磁盘缓存、`--cache-strict`                              | 生产模式默认不用缓存                | 移除，`--production` 照常使用缓存；不用缓存时传 `--no-cache`                |
| `--root`、`-w`、`--workspace`                                              | 指定项目目录或 workspace            | 移除，在对应目录中运行                                                      |
| `--dedup`                                                                  | 扁平提升（easy-np 早期参数）        | 改名 `--shamefully-hoist`                                                   |
| `--lockfile-path`                                                          | 按 package-lock.json 安装           | 改名 `--from-package-lock`                                                  |
| `-d`                                                                       | `--detail` 的简写                   | 移除，用 `--detail`                                                         |
| `--fetch-only`、`--rebuild`                                                | 安装参数形式的 fetch 与 rebuild     | 移除，用 `np-x fetch`、`np-x rebuild`                                       |
| `--dependencies-tree`、`--save-dependencies-tree`                          | 按依赖树文件安装，或保存依赖树      | 移除，由 `np-lock.json` 取代                                                |
| `--flatten`、`--fix-bug-versions`、`--tarball-url-mapping`                 | 依赖版本修正与 tarball 地址改写     | 移除                                                                        |
| `-c`、`--china`、`npm_china`                                               | 切换到 npmmirror 与二进制镜像       | 移除，由[自动切换](registry.md#让-easy-np-切换公共源)取代                   |
| `--custom-china-mirror-url`                                                | 替换二进制镜像地址                  | 移除                                                                        |
| `--prune`、`config.npminstall.prune`、`env:production` / `env:development` | 解压时按固定名单跳过文件            | 移除：名单含 `tsconfig.json`、`LICENSE` 等，会静默破坏 `@tsconfig/*` 这类包 |
| `--force-link-latest`                                                      | 用更高版本覆盖已有的提升链接        | 移除，始终链接最高版本                                                      |
| `--disable-fallback-store`                                                 | 关闭 `.store/node_modules` 回退链接 | 移除，回退链接始终建立                                                      |
| `np-x uninstall --ignore-scripts`                                          | 声明但无作用                        | 移除，传入时报错；卸载不执行任何生命周期脚本                                |
| `.npmrc` 的 `np-public-hoist-pattern`                                      | 在 `.npmrc` 中写提升规则            | 移除，用 `public-hoist-pattern` 或 `config.np.publicHoistPattern`           |
