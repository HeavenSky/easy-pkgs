# 选择要安装的内容

[English](../../docs/install-options.md) · **简体中文**

`np` 默认安装 `package.json` 中的全部依赖；包名、依赖类型与 `overrides` 用来缩小或改变这个范围。前提是已清楚[该用哪个入口](install.md#选择-np-还是-np-x-install)。

## 指定要装的包

`np [<pkg> ...] [options]` 与 `np-x install` 接受相同的参数。

- `<pkg>` 可写 `<name>[@<tag|version|range>]`、`<alias>@npm:<name>`、本地目录、tarball 文件、tarball URL、git URL 或 `<user>/<repo>`。
- 不带 `<pkg>` 时安装 `package.json` 的依赖。
- 带 `<pkg>` 时只安装并保存这些包，不刷新其余依赖，不执行根包的生命周期脚本。

其他方面的参数各有专页：[锁文件](lockfile.md#使用锁文件参数)、[安装脚本](allow-scripts.md#使用脚本参数)、[源与网络](registry.md#使用源与网络参数)、[缓存](registry.md#使用缓存参数)、[workspace 与提升](workspaces.md#使用-workspace-与提升参数)。

## 选择依赖类型

`<type>` 对应根 `package.json` 的字段：`prod` 是 `dependencies`；`dev`、`optional`、`peer` 是对应的 `*Dependencies`；其他类型是 `<type>Dependencies`（如 cnpm 的 `client`、`build`、`isomorphic`）。下表参数都接受任意类型。

| 参数                                            | 含义                                                            |
| ----------------------------------------------- | --------------------------------------------------------------- |
| `--only=<type>[,...]`                           | 只安装这些字段                                                  |
| `--include=<type>[,...]`                        | 另外安装这些字段                                                |
| `--omit=<type>[,...]`、`--exclude=<type>[,...]` | 跳过这些字段                                                    |
| `--prod`                                        | 同 `--only=prod`                                                |
| `--production`                                  | 同 `NODE_ENV=production`                                        |
| `--write=<type>`                                | 带 `<pkg>` 时保存到该字段而不是 `dependencies`，只接受 `=` 写法 |
| `--write-exact`                                 | 保存精确版本而不是 `^` 范围                                     |
| `--no-save`、`--no-write`                       | 不修改 `package.json`                                           |
| `--engine-strict`                               | 拒绝 `engines.node` 不兼容当前 Node.js 的包                     |

- 不传 `--only` 时安装 `prod`、`dev`、`optional`；`--production` 或 `NODE_ENV=production` 追加 `--omit=dev`。
- `--omit=optional` 同时跳过整棵树的可选依赖；`--omit=peer` 停止自动安装缺失的 peerDependencies。
- `--only` 只按列出的根字段选依赖；依赖树内的可选依赖与缺失的 peer 照常安装。
- 同时出现在 `--include` 与 `--omit` 中的类型照常安装。
- 自定义类型在根项目与各 workspace 的 `package.json` 中都没有对应字段时报错。
- 不传 `--only` 时，未安装的非标准字段会告警。
- 重复传入的单值参数与 npm 一致取最后一个；`--allow-scripts`、`--only`、`--include`、`--omit` 合并全部取值。

## 用 overrides 强制版本

easy-np 支持根 `package.json` 的 npm `overrides`；workspace 项目只读 workspace 根。

- 支持的写法：包名、`name@<range>` 选择器、嵌套对象，以及 `.` 与 `$name` 引用。
- `overrides` 不改写根 `package.json` 的直接依赖。
- 同时存在 `resolutions` 时 `overrides` 优先。

## 全局安装与控制输出

| 参数             | 含义                                   |
| ---------------- | -------------------------------------- |
| `-g, --global`   | 安装到全局目录                         |
| `--prefix=<dir>` | 全局前缀，默认 `npm config get prefix` |
| `--detail`       | 输出详细日志                           |
| `--trace`        | 输出安装过程的内存与 CPU 占用          |
