# 安装 workspaces 并控制布局

[English](../../docs/workspaces.md) · **简体中文**

在根目录运行 `np-x install`，各 workspace 按依赖顺序装好，间接依赖不进根 `node_modules`，除非你提升它们；前提是根 `package.json` 有 `workspaces`，或者有 `pnpm-workspace.yaml`。

## 安装 workspaces 项目

1. 在项目根目录运行 `np-x install`。应看到：根包与各 workspace 按依赖顺序安装。
2. 只安装各 workspace、不装根包自身的依赖：`np-x install --ws`。
3. 只处理一个 workspace：在它的目录中运行 `np-x install`，easy-np 以上层项目为根。

- workspaces 取自 `package.json` 的 `workspaces`；没有时取 `pnpm-workspace.yaml` 的 `packages`（以 `!` 开头的模式排除目录）。
- 各 workspace 按依赖关系拓扑排序后依次安装并执行生命周期脚本；有循环依赖时保持 glob 顺序并告警。
- 依赖名与某个 workspace 同名时总是链接本地 workspace；支持 `workspace:*`、`workspace:^`、`workspace:~` 与 `workspace:<range>`。
- workspace 版本不满足声明范围时告警；依赖指向本地 workspace 时日志给出真实目录。

## 使用 workspace 与提升参数

| 参数                              | 含义                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `--ws, --workspaces`              | 安装全部 workspace，不含根包自身依赖；带 `<pkg>` 时加到每个 workspace           |
| `--shamefully-hoist`              | 把每个包的最高版本链接到 `<root>/node_modules`，优先于 `--public-hoist-pattern` |
| `--public-hoist-pattern=<regexp>` | 把名称匹配的包以最高版本链接到 `<root>/node_modules`                            |

## 决定提升哪些包

默认不提升间接依赖。

- `--shamefully-hoist` 提升全部包的最高版本，即 npminstall@6 的扁平效果。
- `--public-hoist-pattern` 或 `config.np.publicHoistPattern` 按正则提升。
- 两者都未指定时，读取 pnpm 与 `.npmrc` 的 `shamefullyHoist`、`nodeLinker: hoisted` 与 npm 的 `install-strategy=hoisted`（均等同 `--shamefully-hoist`），以及 `publicHoistPattern`（pnpm 的 glob，`!` 开头为排除）。
- 提升链接始终指向本次依赖树中的最高版本，与 workspace 的安装顺序无关；根 `package.json` 声明的依赖保持声明版本。
- 完整安装用本次结果替换上次的提升链接，可能降级；部分安装只升级不降级。

## 理解 node_modules/.store

- 每个包只在 `node_modules/.store/<name>@<version>/node_modules/<name>` 存一份，再从这里链接出去。
- 每个包的最高版本另链接到 `node_modules/.store/node_modules`，供 peer 回退解析。
- 根 `node_modules` 只放直接依赖与被提升的包。
- git、tarball URL 与本地包在版本号后附加来源标识（`+git.<commit>`、`+url.<hash>`、`+file.<hash>`），不占用源上同名同版本包的目录。

## 回收旧版本

1. 查看可以删除的版本：`np-x prune --dry-run`。应看到：以 `would remove` 开头的行。
2. 删除它们：`np-x prune`。

- 升级后旧版本留在 `.store`，直到 `np-x prune` 回收；安装不会删除它们。
- `np-x uninstall` 结束时回收不再被任何链接引用的版本。
