# 安装包

[English](../../docs/install-packages.md) · **简体中文**

`npd` 安装 `package.json` 声明的依赖，或添加并保存你指定的包；参数决定安装哪些依赖字段、新包保存到哪里。前提是已按[安装 npd 并选择入口](install.md)装好 npd。

## 安装项目依赖或添加包

运行 `npd [<pkg> ...] [options]`；`npd-x install` 接受同样的参数。

```bash
npd                       # 安装 package.json 中的依赖
npd lodash@4 ./local-lib  # 只安装并保存这两个包
```

- 不带 `<pkg>` 时，安装 `package.json` 中的依赖，并执行根包的生命周期脚本。
- 带 `<pkg>` 时，只安装并保存这些包；不刷新其余依赖，也不执行根包的生命周期脚本。
- 在没有 `package.json` 的目录里不带 `<pkg>` 运行时，与 npm 一样直接失败，不写入任何文件。
- `<pkg>` 可以写 `<name>[@<tag|version|range>]`、`<alias>@npm:<name>`、本地目录、tarball 文件、tarball url、git url 或 `<user>/<repo>`。
- npd 用 git CLI 克隆 git 依赖，本机需要装有 git。
- 缺失的 peerDependencies 与 npm 7+ 一样自动安装；安装失败时按可选依赖跳过并告警。
- 只接受单个值的参数重复传入时，与 npm 一样取最后一个；`--allow-scripts`、`--only`、`--include` 与 `--omit` 合并全部取值。

### 只传 npd 认识的参数

传入未知参数时命令以退出码 1 结束，并给出最接近的已知参数；`--frozen-lockfle` 这类拼写错误因此不会悄悄关掉校验。

- npd 不支持的其他包管理器参数，如 `--workspaces`、`--shamefully-hoist`、`--public-hoist-pattern`，同样报错。
- 写成 `--key=value` 的未知参数会被接受，并与 npm 一样以 `npm_config_<key>` 传给安装脚本，例如二进制镜像地址；除此之外不起作用。
- `--` 之后的参数不检查。
- 报错原文见[排查常见报错](troubleshooting.md#npd-拒绝未知参数)。

### 版本如何选定

写范围或不写版本时，npd 与 npm 一样挑选：先挑未废弃的版本，再优先 `engines.node` 兼容当前 Node.js 的版本，最后取最高版本。

- 例：Node 18 下 `npd -g npm` 装的是 npm 10。
- 范围内只有已废弃的版本时，仍选中其中一个并告警。
- 显式写的 tag 与精确版本按原样使用。
- 不写版本时，日志里显示为 `<name>@*`。
- `--engine-strict` 拒绝 `engines.node` 与当前 Node.js 不兼容的包。

## 选择安装哪些依赖字段

`<type>` 对应根 `package.json` 中的字段：`prod` 是 `dependencies`；`dev`、`optional`、`peer` 是对应的 `*Dependencies`；其他类型是 `<type>Dependencies`（如 cnpm 的 `client`、`build`、`isomorphic`）。下表参数都接受任意类型。

| 参数                                            | 作用                     |
| ----------------------------------------------- | ------------------------ |
| `--only=<type>[,...]`                           | 只安装这些字段           |
| `--include=<type>[,...]`                        | 另外安装这些字段         |
| `--omit=<type>[,...]`、`--exclude=<type>[,...]` | 跳过这些字段             |
| `--prod`                                        | 同 `--only=prod`         |
| `--production`                                  | 同 `NODE_ENV=production` |

- 不传 `--only` 时安装 `prod`、`dev` 与 `optional`；`--production` 或 `NODE_ENV=production` 追加 `--omit=dev`。
- `--omit=optional` 同时跳过整棵依赖树的可选依赖；`--omit=peer` 不再自动安装缺失的 peerDependencies。
- `--only` 只安装列出的字段，其他字段一概不装；依赖树里的包仍会安装自己的可选依赖与缺失的 peer。
- 同时出现在 `--include` 与 `--omit` 中的类型照常安装。
- 自定义类型在 `package.json` 中没有对应字段时报错。
- 不传 `--only` 时，`clientDependencies` 这类非标准字段不安装，并给出告警；依赖包自身的非标准字段从不安装。

## 保存到 package.json

传了 `<pkg>` 时，默认以 `^` 范围保存到 `dependencies`。

| 参数                      | 作用                                               |
| ------------------------- | -------------------------------------------------- |
| `--write=<type>`          | 保存到该字段而不是 `dependencies`；只接受 `=` 写法 |
| `--write-exact`           | 保存精确版本而不是 `^` 范围                        |
| `--no-save`、`--no-write` | 不修改 `package.json`                              |

- 范围前缀取自 `npm config get save-prefix`；npm 30 秒内没有响应时用 `^`。
- 保存的名称与版本取自源，不取 tarball 内 `package.json` 自称的值。

## 全局安装与查看更多输出

`-g` 安装到全局目录；`--detail` 与 `--trace` 显示安装过程的细节。

| 参数             | 作用                                   |
| ---------------- | -------------------------------------- |
| `-g, --global`   | 安装到全局目录                         |
| `--prefix=<dir>` | 全局前缀，默认 `npm config get prefix` |
| `--detail`       | 输出详细日志                           |
| `--trace`        | 输出安装过程的内存与 CPU 占用          |

- `npd -g` 一次装多个包时逐个安装，一个失败不影响其余，见[从失败的安装中恢复](resume.md)。
- 全局安装时哪些安装脚本会执行，见[放行依赖的安装脚本](allow-scripts.md#全局安装时放行脚本)。

## 覆盖嵌套依赖的版本

npd 读取根 `package.json` 中的 npm `overrides`：包名、`name@<range>` 选择器、嵌套对象，以及 `.` 与 `$name` 引用。

```json
{
  "overrides": {
    "foo": "1.0.0",
    "bar@^2": { "baz": "$baz" }
  }
}
```

- `overrides` 不改写根 `package.json` 的直接依赖。
- 同时存在 `resolutions` 时以 `overrides` 为准。
