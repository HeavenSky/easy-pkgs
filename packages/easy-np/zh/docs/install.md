# 安装与选择入口

[English](../../docs/install.md) · **简体中文**

全局安装一次就同时得到 `np` 与 `np-x`；需要 Node.js >= 14.19.3 与 npm。最短路径见 README 的[开始使用](../README.md#开始使用)。

## 安装本包

1. 全局安装：`npm i -g easy-np`。应看到：`np -v` 打印 `np v<version>`。
2. 需要编译原生模块时，另外安装 Python 3 与 C/C++ 编译工具链。node-gyp 不随包安装，见[在老版本 Node.js 上运行与编译原生模块](node-versions.md)。

安装尚未发布的代码：

1. 克隆仓库：`git clone https://github.com/HeavenSky/easy-pkgs.git`。
2. 在 `packages/easy-np` 下执行 `npm pack`。应看到：该目录下生成 `easy-np-<version>.tgz`。
3. 全局安装它：`npm i -g ./easy-np-<version>.tgz`。

## 避免 np 命令重名

全局命令 `np` 与 npm 包 [`np`](https://www.npmjs.com/package/np)（sindresorhus 的发布工具）同名。全局已装其中一个时再装另一个会报 `EEXIST`，加 `--force` 才覆盖已有命令；作为项目依赖时两者互不影响。

## 选择 np 还是 np-x install

`np` 就是 `np-x install` 加上 `--no-lockfile --dangerously-allow-all-scripts`，其余行为完全相同。

| 默认行为       | `np`     | `np-x install`                                       |
| -------------- | -------- | ---------------------------------------------------- |
| `np-lock.json` | 不读写   | 读写                                                 |
| 依赖的安装脚本 | 全部执行 | 只执行在 [`allowScripts`](allow-scripts.md) 中放行的 |

- 补上的两个参数视同命令行参数：环境变量与配置文件（`np_lockfile`、`config.np.lockfile`、`npm_config_*`、`~/.nprc`、`.npmrc`、pnpm 设置）都改变不了它们。
- 要覆盖它们，在命令行传 `--lockfile` 或 `--frozen-lockfile`，或者 `--no-dangerously-allow-all-scripts`。
- 在 `np-x` 执行的安装脚本里再调用 `np`（含经 `npm_execpath` 调用）时，按 `np-x install` 处理，不补上这两个参数。
