# easy-np 使用手册

[English](../../docs/README.md) · **简体中文**

按你要做的事找到对应页面；每页只讲一个任务，开头写明开始前要准备什么。第一次安装的最短路径见 README 的[开始使用](../README.md#开始使用)。

| 你要做的事                                                      | 页面                                                      |
| --------------------------------------------------------------- | --------------------------------------------------------- |
| 安装 easy-np，避开 `np` 命令重名，选择 `np` 还是 `np-x install` | [安装与选择入口](install.md)                              |
| 卸载、更新、链接、下载、重跑脚本或回收包                        | [用 np-x 子命令管理包](commands.md)                       |
| 选择依赖类型，保存到 `package.json`，使用 `overrides`，全局安装 | [选择要安装的内容](install-options.md)                    |
| 让安装可复现，在 CI 中按锁文件安装，复用 `package-lock.json`    | [用 np-lock.json 锁定版本](lockfile.md)                   |
| 审核并放行依赖的安装脚本                                        | [放行依赖的安装脚本](allow-scripts.md)                    |
| 使用私有源、代理、CA 证书或离线缓存                             | [选择源、代理与缓存](registry.md)                         |
| 用环境变量、`.nprc`、`.npmrc` 或 pnpm 配置设置参数              | [配置 easy-np](configuration.md)                          |
| 安装 npm workspaces，提升包，理解 `node_modules/.np`            | [安装 workspaces 并控制布局](workspaces.md)               |
| 安装失败或中断后继续                                            | [从失败的安装继续](resume.md)                             |
| 在 Node.js 14 ~ 22 上运行，用 node-gyp 编译原生模块             | [在老版本 Node.js 上运行与编译原生模块](node-versions.md) |
| 从 cnpm/npminstall 切换过来                                     | [从 npminstall 迁移](migrate-from-npminstall.md)          |
| 解决一条报错                                                    | [故障排查](troubleshooting.md)                            |

版本历史见 [更新日志](../CHANGELOG.md)。
