# 从 npminstall 迁移

[English](../../docs/migrate-from-npminstall.md) · **简体中文**

把项目从 [cnpm/npminstall](https://github.com/cnpm/npminstall) 6.x 迁到 easy-npd 后，扁平布局不变：主要是删掉旧的 `node_modules`、改配置文件名、替换已移除的参数。easy-npd 的代码起源于 npminstall 6.8.0。

## 切换项目

1. 安装 easy-npd：`npm i -g easy-npd`。
2. 删除 npminstall 装出的 `node_modules`：npd 会把它视为未完成。
3. 有 `~/.cnpmrc` 时把它改名为 `~/.nprc`。
4. 原来运行 `npminstall` 的地方改为 `npd`，原来运行 `npmuninstall`、`npmupdate`、`npmlink` 的地方改为 `npd-x <command>`。预期：得到同样的扁平 `_<name>@<version>@<name>` 目录，集中放在 `node_modules/.npd`。
5. 替换脚本与 CI 中已移除的参数和未知参数；未知参数会报 `unknown option <flag>`，见[只传 npd 认识的参数](install-packages.md#只传-npd-认识的参数)；传入已移除的参数时安装停止并报 `--<flag> has been removed, <hint>`，替代写法见[替换已移除的命令、参数与特性](#替换已移除的命令参数与特性)。

## 查找改了名的包、命令与文件

| 项                                   | npminstall                                                                   | easy-npd                                                                                |
| ------------------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 包名与命令                           | 包名 `npminstall`；命令 `npminstall`、`npmlink`、`npmuninstall`、`npmupdate` | 包名 `easy-npd`；命令 `npd` 与 `npd-x`                                                  |
| 用户配置文件                         | `~/.cnpmrc`                                                                  | `~/.nprc`，与 easy-np 共用                                                              |
| 缓存目录                             | `~/.npminstall_tarball`，环境变量 `npminstall_cache`                         | `~/.np_tarball`，环境变量 `np_cache`；两边都认 `npm_config_cache`；旧布局的缓存不再读取 |
| 包版本目录                           | `node_modules/_<name>@<version>@<name>`                                      | `node_modules/.npd/_<name>@<version>@<name>`；`node_modules` 根目录只留包名链接         |
| 安装完成标记                         | 每个包 `package.json` 中的 `__npminstall_done`                               | `node_modules/.npd/.npd-state.json`；切换前先删除 npminstall 装出的 `node_modules`      |
| User-Agent、日志前缀、debug 命名空间 | `npminstall`                                                                 | User-Agent 为 `easy-npd/<version>`，日志前缀与 debug 命名空间为 `npd`                   |

## 了解行为差异

下表这些功能仍在，但行为变了，迁移时要留意。

| 项                             | npminstall                                                             | easy-npd                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 安装失败                       | 停在第一个错误                                                         | 继续安装其余包；再次运行从各包停下的地方继续                                                                   |
| 根目录提升链接                 | 已存在即跳过，依赖变化后也不更新                                       | 始终链接最高版本；根 `package.json` 声明的包不被覆盖                                                           |
| 缺失的 peerDependencies        | 只告警                                                                 | 与 npm 7+ 一致自动安装，失败时按可选依赖跳过                                                                   |
| 版本选择                       | 不看 `engines`                                                         | 与 npm 一致，优先选 `engines.node` 兼容的版本                                                                  |
| tarball 完整性校验             | 只校验 sha1                                                            | 按 `dist.integrity` 中最强的算法校验                                                                           |
| 源的凭据                       | `.nprc` 的用户名密码按子串匹配附加；`always-auth` 时附加到所有请求     | `.npmrc` 的 `_authToken` 与 `.nprc` 的用户名密码只发给该源自己的 host；`always-auth` 不起作用                  |
| 依赖的安装脚本                 | 全部执行                                                               | `npd` 全部执行；`npd-x install` 只执行 `allowScripts` 中放行的                                                 |
| 安装脚本的执行时机             | 依赖的 preinstall 遍历到就执行；根项目的 preinstall 在安装依赖之前执行 | 依赖的脚本在整棵依赖树链接完成后执行；根项目的 preinstall / install / postinstall 与 npm 7+ 一致在依赖之后执行 |
| `npd-x uninstall`              | 保留提升链接；可能在写回 `package.json` 前返回                         | 移除不再被使用的提升链接；写回 `package.json` 后才返回                                                         |
| git 依赖                       | 经 pacote 获取，构建时调用 `npm install`                               | 直接调用 git CLI（本机需要 git），用 npd 自身安装构建依赖                                                      |
| 缓存中损坏的 tarball           | 每次重试都读到同一个坏文件                                             | 删除后重新下载                                                                                                 |
| 重复传入的单值参数             | 部分取第一个，部分变成数组后报错                                       | 与 npm 一致取最后一个；`--allow-scripts`、`--only`、`--include`、`--omit` 合并全部取值                         |
| `--from-package-lock` 加载失败 | 告警后改为联网解析，退出码 0                                           | 报错退出                                                                                                       |
| `--proxy`、`--strict-ssl`      | 接受但不生效                                                           | 生效，见[选择源与网络设置](registry.md#使用代理或自定义-ca)                                                    |
| `--production`                 | 关闭磁盘缓存并强制输出详细日志                                         | 等同 `NODE_ENV=production`；缓存与日志级别不变                                                                 |
| 锁定版本                       | 经 `--dependencies-tree` 使用依赖树文件                                | `np-lock.json`，同时锁定 git commit 与 tarball 完整性摘要，见[用 np-lock.json 锁定版本](lockfile.md)           |

## 替换已移除的命令、参数与特性

传入已移除的命令行参数时报错并提示替代写法；已移除的环境变量与 `package.json` 配置（如 `npm_china`、`config.npminstall.*`）不再读取，也不会报错。

| 项                                                                         | 原作用                                       | 现状                                                                        |
| -------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------- |
| 命令 `npminstall`、`npmuninstall`、`npmupdate`、`npmlink`                  | 每个任务一个命令                             | `npd` 与 `npd-x <command>`                                                  |
| `-S/--save`                                                                | 保存到 `dependencies`                        | 移除；默认就保存到 `dependencies`                                           |
| `-D/--save-dev`、`-O/--save-optional`                                      | 保存到对应字段                               | `--write=dev`、`--write=optional`；`npd-x uninstall` 同样改用 `--write`     |
| `-E/--save-exact`                                                          | 保存精确版本                                 | `--write-exact`                                                             |
| `--client`、`--save-client`、`--save-build`、`--save-isomorphic`           | 安装或保存 cnpm 的三类额外依赖字段           | `--only`、`--include`、`--write=<type>`；默认不再安装这三类字段             |
| `--no-optional`、`--legacy-peer-deps`                                      | 跳过可选依赖，不安装 peer                    | `--omit=optional`、`--omit=peer`                                            |
| `--production` 关闭磁盘缓存、`--cache-strict`                              | 生产模式不用缓存                             | 移除；`--production` 照常使用缓存，不想用缓存时传 `--no-cache`              |
| `--root`                                                                   | 指定项目目录                                 | 移除；在该目录中运行 npd                                                    |
| `--lockfile-path`                                                          | 按 package-lock.json 安装                    | 改名为 `--from-package-lock`                                                |
| `-d`                                                                       | `--detail` 的简写                            | 移除；用 `--detail`                                                         |
| `--fetch-only`、`--rebuild`                                                | 以安装参数形式提供的 fetch 与 rebuild        | 移除；用 `npd-x fetch`、`npd-x rebuild`                                     |
| `--dependencies-tree`、`--save-dependencies-tree`                          | 按依赖树文件安装，或保存依赖树               | 移除；由 `np-lock.json` 取代                                                |
| `--flatten`、`--fix-bug-versions`、`--tarball-url-mapping`                 | 依赖版本修正与 tarball 地址改写              | 移除                                                                        |
| `--high-speed-store`                                                       | 加载外部脚本作为 tarball 缓存                | 移除                                                                        |
| `-c`、`--china`、`npm_china`                                               | 切换到 npmmirror 与二进制镜像                | 移除；由自动切换源取代                                                      |
| `--custom-china-mirror-url`                                                | 替换二进制镜像地址                           | 移除                                                                        |
| `--prune`、`config.npminstall.prune`、`env:production` / `env:development` | 解压时按固定名单跳过文件                     | 移除：名单含 `tsconfig.json`、`LICENSE` 等，会静默破坏 `@tsconfig/*` 这类包 |
| `--force-link-latest`                                                      | 用更高版本覆盖已有的提升链接                 | 移除；始终链接最高版本                                                      |
| `--disable-dedupe`、`config.npminstall.disableDedupe`                      | 关闭根目录扁平链接                           | 移除                                                                        |
| `npd-x uninstall --ignore-scripts`                                         | 声明了但没有作用                             | 移除；传入时报错                                                            |
| 卸载时执行 preuninstall / uninstall / postuninstall                        | 执行被卸载包的脚本，不受 `allowScripts` 约束 | 移除；与 npm 7+ 一致，卸载不执行生命周期脚本                                |

各版本的变更见 [更新日志](../CHANGELOG.md)；上游历史见 [npminstall 6.x CHANGELOG](https://github.com/cnpm/npminstall/blob/6.x/CHANGELOG.md)。
