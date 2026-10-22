# easy-np

[English](../README.md) · **简体中文**

npm 包页只显示英文版 README。

npm 依赖安装器：失败后断点续装，自动选用最快的公共源，依赖的安装脚本经你批准才执行。

[![npm version](https://img.shields.io/npm/v/easy-np.svg)](https://www.npmjs.com/package/easy-np)
[![npm downloads](https://img.shields.io/npm/dm/easy-np.svg)](https://www.npmjs.com/package/easy-np)
[![license](https://img.shields.io/npm/l/easy-np.svg)](../LICENSE.txt)

在现有项目里用 easy-np 代替 `npm install` 或 cnpm 的 npminstall：`.npmrc`、`pnpm-workspace.yaml` 与 npm workspaces 原样生效。和 npminstall 8.0.1 相比，一个包失败不再中断整次安装，依赖脚本也不会在你审核之前执行。

## 看安装脚本如何被拦下待审

`np-x install` 照常装好包，跳过它的 `postinstall`，并告诉你怎么放行：

```console
$ np-x install esbuild
np registry: npm > huawei > yarn, binary: official > mirror (cached)
✔ Linked 2 latest versions as fallback to ~/demo/node_modules/.np/node_modules
1 package(s) have install scripts that are not in allowScripts and were skipped:
  - esbuild@* (postinstall)
review them, then run: np-x approve-scripts esbuild && np-x rebuild esbuild
✔ Installed 1 packages on ~/demo
✔ All packages installed (2 packages installed from npm registry, used 3s(network 3s), speed 1.54MB/s, json 27(0B), tarball 4.26MB, manifests cache hit 0, etag hit 0 / miss 0)

dependencies:
+ esbuild ^0.28.2

np np-lock.json updated
$ np-x approve-scripts esbuild && np-x rebuild esbuild
approved esbuild@0.28.2
run np-x rebuild esbuild to run their install scripts now
np registry: npm > yarn > alibaba, binary: official > mirror
> esbuild@0.28.2 postinstall ~/demo/node_modules/.np/esbuild@0.28.2/node_modules/esbuild
> node install.js
> esbuild@0.28.2 postinstall, finished in 563ms
$ npx esbuild --version
0.28.2
```

跑完这些命令后，`package.json` 里多了 `"allowScripts": { "esbuild@0.28.2": true }`，`np-lock.json` 记下了解析出的版本，`npx esbuild --version` 运行的正是 postinstall 下载的原生二进制。两次输出的源顺序不同：安装复用了之前的测速结果（`(cached)`），rebuild 重新测了一次。

## 开始使用

三条命令从零跑到放行脚本；需要 Node.js >= 14.19.3。

1. 安装 `np` 与 `np-x` 两个命令：`npm i -g easy-np`
2. 安装项目依赖：`np-x install`
3. 放行一个被跳过的依赖并执行它的脚本：`np-x approve-scripts esbuild && np-x rebuild esbuild`

全局命令 `np` 与 sindresorhus 的发布工具 [`np`](https://www.npmjs.com/package/np) 同名，全局已装其中一个时再装另一个会报 `EEXIST`，见[避免 np 命令重名](docs/install.md#避免-np-命令重名)。

想沿用 npminstall 的默认行为？`np` 就是 `np-x install --no-lockfile --dangerously-allow-all-scripts`，见[选择 np 还是 np-x install](docs/install.md#选择-np-还是-np-x-install)。

## 你能得到什么

- 一个包失败不会白装一场：其余包照常装完，结束时列出失败项；再跑一次 `np` 从断点继续，不重新下载，也不用删 `node_modules`（[详情](docs/resume.md)）。
- **依赖的安装脚本经你批准才执行**：`np-x install` 只为 `allowScripts` 中的条目执行 `preinstall`、`install` 与 `postinstall`，每个条目可精确到版本、git commit 或 tarball URL；tarball 冒充其他包名时告警 `manifest mismatch`，也无法沿用被冒充包的放行（[详情](docs/allow-scripts.md)）。
- 不用配置就有快的公共源：easy-np 对 npm、yarn、alibaba（npmmirror）、tencent 与 huawei 测速，用最快的 3 个，下载失败换下一个重试，镜像缺刚发布的版本时回 npm 官方源取；配了私有源就只用私有源（[详情](docs/registry.md)）。
- 现有的 npm 与 pnpm 配置照常生效：npm workspaces 与 `workspace:` 协议、`.npmrc`、`pnpm-workspace.yaml`、`onlyBuiltDependencies` 无需改写；`.np` 布局让根 `node_modules` 只放直接依赖与你提升的包（[详情](docs/workspaces.md)）。
- 老版本 Node.js 上也能复现安装：`np-lock.json` 锁定 git commit 与 tarball 的 sha512 integrity，CI 用 `--frozen-lockfile` 在缺条目时失败；本仓库 CI 在 Node.js 14.19.3、16、18 与 22 上跑全量用例（[ci.yml](../../../.github/workflows/ci.yml)）。

## 什么时候换别的工具

想要 npminstall 早期的扁平 `_<name>@<version>@<name>` 布局、又不需要 workspaces，用 [easy-npd](../../easy-npd/zh/README.md)；它与 easy-np 共用 `~/.nprc`、磁盘缓存与 `np-lock.json`，两者可以同时安装。团队需要持续更新 `package-lock.json` 或 `pnpm-lock.yaml` 时继续用 npm 或 pnpm：easy-np 能按 `package-lock.json` 安装，但只写 `np-lock.json`。

## 继续阅读

- [使用手册](docs/README.md)：按任务组织的全部命令、参数与配置文件。
- [从 npminstall 迁移](docs/migrate-from-npminstall.md)：改名的命令、移除的参数与行为差异。
- [故障排查](docs/troubleshooting.md)：报错信息与解决办法。
- [更新日志](CHANGELOG.md)：每个版本改了什么。

## 许可证

[MIT](../LICENSE.txt)；代码派生自 [cnpm/npminstall](https://github.com/cnpm/npminstall) 8.0.1，感谢 cnpm 团队。
