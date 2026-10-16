# easy-npd 使用指南

[English](../../docs/README.md) · **简体中文**

下面每页讲一个任务；easy-npd 是什么、最短的上手路径见 [README](../README.md)。

| 你要做的事                                       | 阅读                                                    |
| ------------------------------------------------ | ------------------------------------------------------- |
| 安装 npd、在 `npd` 与 `npd-x install` 之间选择   | [安装 npd 并选择入口](install.md)                       |
| 添加包、选择安装哪些依赖字段、覆盖嵌套依赖的版本 | [安装包](install-packages.md)                           |
| 卸载、更新、链接、下载或重建包，以及回收旧版本   | [管理已安装的包](manage-packages.md)                    |
| 锁定版本、在 CI 中严格按锁文件安装               | [用 np-lock.json 锁定版本](lockfile.md)                 |
| 放行或拒绝依赖的安装脚本                         | [放行依赖的安装脚本](allow-scripts.md)                  |
| 使用私有源、代理或自定义 CA                      | [选择源与网络设置](registry.md)                         |
| 断网安装、控制磁盘缓存                           | [离线安装与管理缓存](offline-and-cache.md)              |
| 安装失败或中断后继续                             | [从失败的安装中恢复](resume.md)                         |
| 查环境变量与配置文件                             | [配置 npd](configuration.md)                            |
| 在旧版 Node.js 上运行、编译原生模块              | [在旧版 Node.js 上运行与编译原生模块](node-versions.md) |
| 把项目从 npminstall 迁过来                       | [从 npminstall 迁移](migrate-from-npminstall.md)        |
| 按报错信息排查问题                               | [排查常见报错](troubleshooting.md)                      |

各版本的变更见 [CHANGELOG](../../CHANGELOG.md)（仅英文）。
