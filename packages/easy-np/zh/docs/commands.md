# 用 np-x 子命令管理包

[English](../../docs/commands.md) · **简体中文**

安装之外的每项操作都有对应的 `np-x` 子命令，下表连同参数一并列出；先安装 easy-np（[安装与选择入口](install.md)）。

## 找到要用的命令

| 命令                   | 别名            | 作用                                                                |
| ---------------------- | --------------- | ------------------------------------------------------------------- |
| `np` / `np-x install`  | `i`、`add`      | 安装依赖；参数见[选择要安装的内容](install-options.md)              |
| `np-x uninstall`       | `remove`、`rm`  | 卸载包，清理没人用的提升链接，回收没人引用的包版本                  |
| `np-x update`          | `up`、`upgrade` | 删除 `node_modules` 后重装，忽略 `np-lock.json` 的锁定版本          |
| `np-x link`            | `ln`            | 链接本地目录；不带参数时把当前包安装并链接到全局                    |
| `np-x fetch`           | 无              | 只下载并解压指定的包，不安装依赖，不执行脚本；不支持 git 包         |
| `np-x rebuild`         | 无              | 按依赖顺序重跑已安装依赖的 `preinstall`、`install` 与 `postinstall` |
| `np-x approve-scripts` | `approve`       | 把依赖写入 `package.json` 的 `allowScripts`，放行其安装脚本         |
| `np-x deny-scripts`    | `deny`          | 在 `allowScripts` 中写入拒绝条目，并删除同一包已有的放行条目        |
| `np-x prune`           | 无              | 删除 `node_modules/.store` 中不再被任何链接引用的包版本             |
| `np-x help <command>`  | 无              | 显示子命令的帮助，同 `np-x <command> -h`                            |

- 全部命令都支持 `-v, --version` 与 `-h, --help`；`np -v` 打印 `np v<version>`，`np-x -v` 与 `np-x <command> -v` 打印 `np-x v<version>`；`np-x -h` 列出全部子命令。
- 在 workspace 目录中运行 `np`、`np-x uninstall`、`np-x update` 时以上层项目为根，只处理这个 workspace，与 npm 7+ 一致。
- 在 workspace 目录中运行 `np-x approve-scripts`、`np-x deny-scripts`、`np-x prune` 时作用于整个项目。

## 给其他命令传参数

| 命令                                   | 参数                                                                                                                                         |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `np-x uninstall <pkg>[@<version>] ...` | `-g, --global`；`--prefix=<dir>`；`--ws, --workspaces`；`--write=<type>`：另外从 `<type>Dependencies` 删除；总会从四个标准依赖字段中移除该包 |
| `np-x update`                          | `--clean-only`：只删除 `node_modules` 不重装；其余 install 参数传给重装                                                                      |
| `np-x link [<folder> ...]`             | `--prefix=<dir>`；写成 `--name` 或 `--name=value` 的 install 参数传给它执行的安装                                                            |
| `np-x fetch <pkg> ...`                 | `-r, --registry`、代理与证书参数、`--offline`、`--prefer-offline`、`--refresh-cache`、`--no-cache`                                           |
| `np-x rebuild [<pkg>[@<range>] ...]`   | install 参数（如 `--registry`、`--offline`、`--ignore-scripts`）同样生效                                                                     |
| `np-x approve-scripts <pkg> ...`       | `--all`：放行全部未审核的包；`--pending`：只列出；`--no-pin`：只写包名或不带 commit 的地址                                                   |
| `np-x deny-scripts <pkg> ...`          | `--all`：拒绝全部未审核的包                                                                                                                  |
| `np-x prune`                           | `--dry-run`：只列出不删除；不支持 `-g`，全局包没有共享的 `.store`                                                                            |
