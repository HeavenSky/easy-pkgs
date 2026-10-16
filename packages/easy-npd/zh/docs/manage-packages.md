# 管理已安装的包

[English](../../docs/manage-packages.md) · **简体中文**

下面的 `npd-x` 子命令用于在已用 npd 安装过的项目中卸载、更新、链接、下载、重建和回收包；每个包版本各占一个目录，旧版本会一直留着，直到你回收。

## 看懂 node_modules 布局

每个包版本各占一个目录，根目录链接每个包的最高版本。

- 包内容位于 `node_modules/_<name>@<version>@<name>`；每个包的依赖以链接形式放在它自己的 `node_modules` 下。
- 每个包的最高版本另外链接到根 `node_modules/<name>`；根 `package.json` 声明的包保持它声明的版本。
- 完整安装会把上次的根目录链接换成本次依赖树中的最高版本，可能因此降级。
- git、tarball url 与本地包在版本号后带来源后缀，如 `_foo@1.0.0+git.1a2b3c4d@foo`、`+url.<integrity digest>`、`+file.<source path digest>`，不会与同名同版本的源上的包共用目录。
- git 依赖换了 commit，或 tarball 内容变了而版本号不变时，装进新的目录。
- 安装进度记录在 `node_modules/.npd-state.json`，不修改依赖包自己的 `package.json`。

## 卸载包

运行 `npd-x uninstall <pkg>[@<version>] ...`，从 `package.json` 与 `node_modules` 中移除这些包。

| 参数             | 作用                                                     |
| ---------------- | -------------------------------------------------------- |
| `-g, --global`   | 卸载全局包                                               |
| `--prefix=<dir>` | 全局前缀                                                 |
| `--write=<type>` | 另外从 `<type>Dependencies` 中删除；四个标准字段总会清理 |

- 删掉已没人用的根目录链接，所以已卸载包的依赖再也 require 不到。
- 回收没有链接指向的版本目录，其他包还在用的版本保留。
- 命令在 `package.json` 写回完成后才返回。
- 与 npm 7+ 一致，不执行被卸载包的 preuninstall / uninstall / postuninstall。
- `node_modules/.bin` 中的命令入口（含 `.cmd` 与 `.ps1` 文件）随包一起删除。
- 传入 `--ignore-scripts` 会报错。

## 更新全部依赖

运行 `npd-x update`：删除 `node_modules` 后重装，不用 `np-lock.json` 中的版本而是重新解析每个范围，并把结果写回。

- `--clean-only` 只删除 `node_modules`，不重装。
- 其余安装参数传给重装。

## 链接本地目录

运行 `npd-x link [<folder> ...]`，把本地目录链接进当前项目；不带参数时，把当前包安装并链接到全局。

- `--prefix=<dir>` 指定全局前缀。
- 写成 `--name` 或 `--name=value` 的安装参数，会传给 link 内部执行的那次安装。
- 链接或重装的全局包替换旧版本时，先删除旧版本的全部命令入口，新版本不再提供的命令不会残留。

## 只下载不安装

运行 `npd-x fetch <pkg> ...`，只下载并解压包：不装依赖，不执行脚本，不链接 bin，不修改 `package.json`。

- 不支持 git 包。
- 接受的参数：`-r, --registry`、[选择源与网络设置](registry.md)中的代理与证书参数、[离线安装与管理缓存](offline-and-cache.md)中的缓存参数。
- `fetch` 解压的包视为未完成，下一次完整安装会把它和它的依赖补齐。

## 重跑安装脚本

运行 `npd-x rebuild`，按依赖顺序重跑全部已安装依赖的 preinstall / install / postinstall。

- `npd-x rebuild <pkg>[@<range>] ...` 只重跑列出的包。
- 优先使用磁盘缓存，缺少的包才联网下载。
- `--registry`、`--offline`、`--ignore-scripts` 等安装参数同样生效。
- 切换 Node.js 版本后运行它重新编译原生模块；普通的失败或中断改为运行 `npd`，见[从失败的安装中恢复](resume.md)。
- 不支持 `-g`。

## 回收旧版本目录

运行 `npd-x prune`，删除没有任何链接指向的 `_<name>@<version>@<name>` 目录；安装本身从不自动删除它们。

1. 运行 `npd-x prune --dry-run`。预期：列出将被删除的目录，不删除任何东西。
2. 运行 `npd-x prune`。预期：这些目录及其在 `.npd-state.json` 中的记录被删除。

`node_modules` 或项目路径经过符号链接时，prune 同样正常工作。
