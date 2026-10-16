# easy-npd

[English](../README.md) · **简体中文**

npm 包页只显示英文版 README。

装依赖时失败了从断点接着装，公共源自动挑最快的几个轮换重试，依赖的安装脚本经你放行才执行。

[![npm version](https://img.shields.io/npm/v/easy-npd.svg)](https://www.npmjs.com/package/easy-npd)
[![npm downloads](https://img.shields.io/npm/dm/easy-npd.svg)](https://www.npmjs.com/package/easy-npd)
[![license](https://img.shields.io/npm/l/easy-npd.svg)](../LICENSE.txt)

easy-npd 延续自 [cnpm/npminstall](https://github.com/cnpm/npminstall) 6.8.0，适合沿用其扁平 `node_modules/_<name>@<version>@<name>` 布局的项目。
用 npminstall 时，网络抖一下整次安装就作废，镜像没同步新版本只能手动换源；easy-npd 照常装完其余的包，并替你换源。
用 npm 时，各版本按依赖树嵌套在不同位置；easy-npd 把每个版本放进以它命名的目录，再把最高版本链接到根目录。

## 看看装完留下什么

一条命令装上 `debug` 和它的依赖 `ms`，并把两者链接到 `node_modules` 根目录：

```console
$ npd debug@4.3.4
npd registry: npm > huawei > yarn, binary: official > mirror
✔ Installed 1 packages
✔ Linked 2 latest versions
✔ Run 0 scripts
✔ All packages installed (2 packages installed from npm registry, used 688ms(network 686ms), speed 23.16KB/s, json 2(0B), tarball 15.89KB, manifests cache hit 0, etag hit 0 / miss 0)
$ ls node_modules
_debug@4.3.4@debug
_ms@2.1.2@ms
debug
ms
```

`debug` 和 `ms` 是指向旁边带版本号目录的链接。

## 快速开始

需要 Node.js 14.19.3 或更高版本。

1. 安装命令：`npm i -g easy-npd`
2. 进入项目目录：`cd <your-project>`
3. 安装依赖：`npd`

全局命令 `npd` 与 npm 包 [`npd`](https://www.npmjs.com/package/npd) 同名，已全局装了它时第 1 步加 `--force`。
想要 npm / pnpm 的默认行为（写锁文件，只执行已放行的脚本），用 `npd-x install` 代替 `npd`；见[安装 npd 并选择入口](docs/install.md)。

## easy-npd 替你处理的事

- 失败后再跑一次接着装，不用从头来：一个包失败不会中止安装；再运行 `npd`，各包从停下的地方继续，不重新下载，已成功的脚本不再执行。[从失败的安装中恢复](docs/resume.md)
- 不用再手动换源：npd 测速 5 个公共源，请求失败时在最快的 3 个之间轮换重试，镜像缺的版本从 npm 取；配置了私有源就不切换。[选择源与网络设置](docs/registry.md)
- 由你决定哪些依赖脚本能执行：用 `npd-x install` 时，依赖的安装脚本要先写进 `allowScripts` 才执行，冒充其他包的 tarball 借不到它的放行。[放行依赖的安装脚本](docs/allow-scripts.md)
- 沿用现有的 npm 与 pnpm 配置：`.npmrc` 的源与 token、`onlyBuiltDependencies` 等 pnpm 构建设置、npm `overrides` 原样生效。[配置 npd](docs/configuration.md)
- 安装结果可复现，离线也能装：`np-lock.json` 锁定版本、git commit 与 tarball 完整性摘要；`--offline` 只用磁盘缓存，一个请求都不发。[用 np-lock.json 锁定版本](docs/lockfile.md)

## 什么时候该换别的工具

easy-npd 不支持 npm workspaces：有 `workspaces` 字段时只安装根目录的依赖。
需要 workspaces 或 `node_modules/.store` 布局时用 [easy-np](../../easy-np/zh/README.md)；它与 easy-npd 共用 `~/.nprc`、磁盘缓存和 `np-lock.json`，两者可以同时全局安装。

## 进一步阅读

- [使用指南](docs/README.md)：一页一个任务，从安装参数到故障排查
- [从 npminstall 迁移](docs/migrate-from-npminstall.md)：改名的命令、移除的参数与行为差异
- [CHANGELOG](../CHANGELOG.md)（仅英文）

## License

MIT，见 [LICENSE.txt](../LICENSE.txt)；代码起源于 [cnpm/npminstall](https://github.com/cnpm/npminstall) 6.8.0。
