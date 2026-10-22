# 安装 npd 并选择入口

[English](../../docs/install.md) · **简体中文**

全局安装 easy-npd 后得到两个命令：保持 npminstall 习惯的 `npd`，和贴近 npm / pnpm 默认行为的 `npd-x`；需要 Node.js 14.19.3 或更高版本。
最短路径见[快速开始](../README.md#快速开始)，本页讲完整的安装步骤。

## 安装命令

1. 运行 `npm i -g easy-npd`。预期：`npd -v` 输出 `npd v<version>`，`npd-x -v` 输出 `npd-x v<version>`。
2. npm 报 `EEXIST` 停下时，说明另一个全局包已占用 `npd` 命令，通常是 npm 包 [`npd`](https://www.npmjs.com/package/npd)（Node Packages Deployer）。运行 `npm i -g easy-npd --force` 覆盖它。作为项目依赖时两个包互不影响。

编译原生模块还需要 Python 3 与 C/C++ 编译工具链；npd 不自带 node-gyp，见[在旧版 Node.js 上运行与编译原生模块](node-versions.md)。

### 安装未发布的代码

1. 在本仓库的 `packages/easy-npd` 下运行 `npm pack`。预期：生成 `easy-npd-<version>.tgz`。
2. 运行 `npm i -g ./easy-npd-<version>.tgz`。

## 选择 npd 还是 npd-x install

**`npd` 就是 `npd-x install` 加上 `--no-lockfile --dangerously-allow-all-scripts`**，其余行为完全相同，同样读取 `.npmrc` 与 pnpm 设置。

| 默认行为       | `npd`    | `npd-x install`                                        |
| -------------- | -------- | ------------------------------------------------------ |
| `np-lock.json` | 不读写   | 读写，见[用 np-lock.json 锁定版本](lockfile.md)        |
| 依赖的安装脚本 | 全部执行 | 放行后才执行，见[放行依赖的安装脚本](allow-scripts.md) |

- 这两个参数视同命令行参数：环境变量与配置文件（`np_lockfile`、`config.np.lockfile`、`npm_config_*`、`~/.nprc`、`.npmrc`、pnpm 设置）都改不了它们。
- 要覆盖它们，在命令行传 `--lockfile` / `--frozen-lockfile` 或 `--no-dangerously-allow-all-scripts`。
- `npd-x` 执行的安装脚本里再调用 `npd`（含经由 `npm_execpath`）时，这次调用按 `npd-x install` 处理，不补上这两个参数。

## 按任务找命令

| 命令                    | 别名            | 作用                                                         |
| ----------------------- | --------------- | ------------------------------------------------------------ |
| `npd` / `npd-x install` | `i`、`add`      | 安装依赖，见[安装包](install-packages.md)                    |
| `npd-x uninstall`       | `remove`、`rm`  | 卸载包，并清掉没人用的提升链接和没有链接指向的版本目录       |
| `npd-x update`          | `up`、`upgrade` | 删除 `node_modules` 后重装，忽略 `np-lock.json` 锁定的版本   |
| `npd-x link`            | `ln`            | 链接本地目录；不带参数时把当前包安装并链接到全局             |
| `npd-x fetch`           | 无              | 只下载并解压包，不装依赖，不执行脚本；不支持 git 包          |
| `npd-x rebuild`         | 无              | 重跑已安装依赖的 preinstall / install / postinstall          |
| `npd-x approve-scripts` | `approve`       | 把依赖写进 `package.json` 的 `allowScripts`，放行其安装脚本  |
| `npd-x deny-scripts`    | `deny`          | 在 `allowScripts` 中写入拒绝条目，并删除同一包已有的放行条目 |
| `npd-x prune`           | 无              | 删除 `node_modules/.npd` 中没有任何链接指向的目录            |
| `npd-x help <command>`  | 无              | 显示子命令的帮助，同 `npd-x <command> -h`                    |

- 全部命令都支持 `-v, --version` 与 `-h, --help`；`npd-x -h` 列出全部子命令。
- 安装以外各命令的参数见[管理已安装的包](manage-packages.md)。
- npd 不支持 npm workspaces：根 `package.json` 有 `workspaces` 时告警，并只安装根目录的依赖；需要 workspaces 时用 [easy-np](../../../easy-np/zh/README.md)。
