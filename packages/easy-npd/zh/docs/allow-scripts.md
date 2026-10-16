# 放行依赖的安装脚本

[English](../../docs/allow-scripts.md) · **简体中文**

用 `npd-x install` 时，依赖的安装脚本要经你放行才执行；不带额外参数的 `npd` 会执行全部脚本，除非传 `--no-dangerously-allow-all-scripts`。

## 放行被跳过的包

**与 npm 12 一致，依赖的安装脚本要在根 `package.json` 的 `allowScripts` 中放行后才执行。**

1. 运行 `npd-x install`。预期：结束时输出 `<n> package(s) have install scripts that are not in allowScripts and were skipped:`，随后是包列表与放行命令。
2. 运行 `npd-x approve-scripts esbuild`。预期：`package.json` 的 `allowScripts` 多出 `"esbuild@<installed version>": true`。
3. 运行 `npd-x rebuild esbuild`。预期：它的安装脚本开始执行。

要一次放行全部待审核的包，运行 `npd-x approve-scripts --all`。

## 了解哪些脚本受管控

- 受管控：依赖的 preinstall / install / postinstall，带 `binding.gyp` 的依赖隐式执行的 `node-gyp rebuild`，以及 git 依赖的构建。
- 不受管控：根项目及其声明的本地目录依赖的脚本。
- 来自源、git 或 tarball url 的包可以声明 `file:` 依赖；这类依赖随声明者一起放行，只执行 preinstall / install / postinstall，在跳过列表中显示为 `<name>@<spec> (declared by <declarer>)`。
- git 依赖声明了 prepare、build、install 等脚本或 workspaces 时需要构建，构建前按仓库地址审核。
- 构建时用 npd 自身安装这个 git 依赖的依赖（含 devDependencies），不执行任何依赖脚本，不构建嵌套的 git 依赖，不读取克隆仓库自带的 `allowScripts` 与 `~/.nprc`，也不读写 `np-lock.json`。
- git 依赖只在获取时构建：放行后按 approve 的提示删除它的包目录，再运行 `npd`。
- 来自源的包按源上的 `name@version` 审核；tarball 内的 `package.json` 自称其他包时，告警 `manifest mismatch`，不借用被冒充包的放行。
- `--ignore-scripts` 不执行任何安装脚本，同时跳过 git 依赖的构建与根项目的 `binding.gyp` 构建。

## 手写 allowScripts

`allowScripts` 的每个键指定一批包；`true` 放行它们的安装脚本，`false` 拒绝。

```json
{
  "allowScripts": {
    "esbuild": true,
    "sharp@0.33.5": true,
    "core-js": false
  }
}
```

- 键可以写包名（全部版本）、`<name>@<exact version>`、用 `||` 连接的多个精确版本、git 地址或 tarball url。
- 范围与 dist-tag 告警后忽略。
- `false` 表示拒绝；放行与拒绝条目同时命中时，拒绝优先。

## 确定哪个策略生效

npd 只用下面第一个有策略的来源：

1. 命令行的 `--allow-scripts`
2. 根 `package.json` 的 `allowScripts`
3. pnpm 构建设置：`onlyBuiltDependencies` 视为放行，`ignoredBuiltDependencies` 与 `neverBuiltDependencies` 视为拒绝，`allowBuilds` 按其布尔值；只配置了 `neverBuiltDependencies` 时放行其余全部依赖
4. `~/.nprc` 的 `allow-scripts`

## 设置脚本相关参数

这些参数在单次运行中覆盖 `allowScripts`，或显示脚本的输出。

| 参数                              | 作用                                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `--ignore-scripts`                | 不执行任何安装脚本，见上文                                                                                 |
| `--allow-scripts=<pkg>[,<pkg>]`   | 放行这些依赖，取代 `allowScripts`；主要用于 `-g`；可重复传入                                               |
| `--strict-allow-scripts`          | 有未审核的依赖脚本时以非 0 退出                                                                            |
| `--dangerously-allow-all-scripts` | 忽略 `allowScripts`，执行全部依赖脚本；默认关闭，`npd` 固定补上，`--no-dangerously-allow-all-scripts` 关闭 |
| `--foreground-scripts`            | 显示依赖安装脚本的输出，默认在后台执行；根项目与本地目录依赖的脚本总是显示输出                             |

`--strict-allow-scripts` 与 `--dangerously-allow-all-scripts` 取第一个有设置的来源：命令行（含 `npd` 补上的参数）、`npm_config_*`、`~/.nprc`、`.npmrc`、pnpm 的 `strictDepBuilds` / `dangerouslyAllowAllBuilds`，都没有则关闭。`--ignore-scripts` 优先于以上全部。

后台脚本失败时，npd 把命令与完整输出保存到日志文件，报错末尾给出路径，见[离线安装与管理缓存](offline-and-cache.md#找到缓存位置)。

## 用命令放行或拒绝

| 命令                              | 参数                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| `npd-x approve-scripts <pkg> ...` | `--all`：放行全部待审核的包；`--pending`：只列出；`--no-pin`：只写包名，或不带 commit 的地址 |
| `npd-x deny-scripts <pkg> ...`    | `--all`：拒绝全部待审核的包                                                                  |

- `approve-scripts` 写入 `<pkg>@<installed version>`；git 依赖写地址与 commit，tarball url 依赖写 url，都去掉凭据。
- `approve-scripts` 也会列出并放行只因 prepare 等构建脚本被跳过的 git 依赖。
- `approve-scripts` 不会放行已用 `false` 拒绝的包；要放行，先手动删掉 `false` 条目。
- `deny-scripts` 与 npm 一致，写入不带版本的 `false` 条目。
- 第一次写入 `allowScripts` 时会先并入 pnpm 的构建设置。
- npd 比对条目时忽略地址中的凭据，之前写入的带凭据条目仍然生效。

## 全局安装时放行脚本

`npd-x approve-scripts` 与 `npd-x rebuild` 不支持 `-g`；改为在安装命令上传入放行项。

- 被全局安装的包自身的脚本照常执行。
- 它声明的本地 `file:` 依赖要执行脚本，被装的包必须经 `--allow-scripts=<pkg>` 或 `~/.nprc` 放行。来自源的包按名称与版本匹配。
- 有脚本被跳过时，npd 输出 `review them, then reinstall with: npd-x install -g --allow-scripts=<keys> <pkg>`。这条命令保留了已放行的条目。
