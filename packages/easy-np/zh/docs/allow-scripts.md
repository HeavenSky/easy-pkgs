# 放行依赖的安装脚本

[English](../../docs/allow-scripts.md) · **简体中文**

依赖的安装脚本只有在你把它写进 `allowScripts` 后才会在本机执行；适用于 `np-x install`，以及传了 `--no-dangerously-allow-all-scripts` 的 `np`（[选择 np 还是 np-x install](install.md#选择-np-还是-np-x-install)）。

## 审核一个被跳过的包

1. 照常安装：`np-x install`。应看到：脚本被跳过的包列在 `package(s) have install scripts that are not in allowScripts and were skipped:` 之后。
2. 随时列出仍在等待审核的包：`np-x approve-scripts --pending`。
3. 检查过后放行它：`np-x approve-scripts esbuild`。应看到：输出 `approved esbuild@<version>`，`package.json` 的 `allowScripts` 中多出该版本的条目。
4. 立即执行它的脚本：`np-x rebuild esbuild`。
5. 永久拒绝一个包：`np-x deny-scripts core-js`。应看到：写入 `"core-js": false`；它的脚本不再执行，也不再列为未审核。

## 哪些脚本需要放行

与 npm 12 一致，只有依赖的脚本需要放行；根项目、workspace 以及它们声明的本地目录依赖的脚本照常执行。

- 需要放行的脚本：依赖的 `preinstall`、`install` 与 `postinstall`，依赖带 `binding.gyp` 时的隐式 `node-gyp rebuild`，以及 git 依赖的构建。
- 未放行的包被跳过，安装结束时列出它们和放行后重跑的命令。

## 编写 allowScripts

`allowScripts` 写在根 `package.json`：

```json
{
  "allowScripts": {
    "esbuild": true,
    "sharp@0.33.5": true,
    "core-js": false
  }
}
```

- 键写包名（全部版本）、`<name>@<精确版本>` 或用 `||` 连接的多个精确版本、git 地址、tarball URL；范围与 dist-tag 告警后忽略。
- `false` 表示拒绝；放行与拒绝同时命中时拒绝优先。
- 来源只取第一个有配置的：`--allow-scripts` > 根 `package.json` 的 `allowScripts` > pnpm 的构建设置 > `~/.nprc` 的 `allow-scripts`。
- pnpm 的 `onlyBuiltDependencies` 视为放行，`ignoredBuiltDependencies` 与 `neverBuiltDependencies` 视为拒绝，`allowBuilds` 按各项的布尔值放行或拒绝；只有 `neverBuiltDependencies` 时放行其余全部依赖。
- 首次写入 `allowScripts` 时，easy-np 先把 pnpm 的构建设置并入其中。

## 使用脚本参数

| 参数                              | 含义                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------- |
| `--ignore-scripts`                | 不执行任何安装脚本，也不构建 git 依赖与根项目的 `binding.gyp`                     |
| `--allow-scripts=<pkg>[,<pkg>]`   | 放行这些依赖的安装脚本，覆盖 `allowScripts`；主要用于 `-g`                        |
| `--strict-allow-scripts`          | 有未审核的依赖脚本时以非 0 退出                                                   |
| `--dangerously-allow-all-scripts` | 忽略 `allowScripts`，执行全部依赖脚本；默认关，`np` 固定补上，加 `--no-` 前缀关闭 |
| `--foreground-scripts`            | 显示依赖安装脚本的输出，默认在后台执行；根项目与本地目录依赖的脚本总是显示        |

- `--strict-allow-scripts` 与 `--dangerously-allow-all-scripts` 取第一个有配置的：命令行 > `npm_config_*` > `~/.nprc` > `.npmrc` > pnpm 的 `strictDepBuilds` / `dangerouslyAllowAllBuilds` > 默认关。`np` 补上的 `--dangerously-allow-all-scripts` 属于命令行。
- `--ignore-scripts` 优先于以上全部。

## 放行 git、tarball 与本地依赖

- 来自源的包按源上的 `name@version` 审核。tarball 内的 `package.json` 自称其他包时告警 `manifest mismatch`，也无法沿用被冒充包的放行。
- 源上的包、git 包与 tarball URL 包声明的 `file:` 本地依赖跟随声明者是否放行，只执行 `preinstall`、`install` 与 `postinstall`；在跳过列表中显示为 `<name>@<spec> (declared by <declarer>)`。
- git 依赖声明了 `prepare`、`build`、`install` 等脚本或 workspaces 时，easy-np 必须构建它，因此先按仓库地址审核。
- 这次构建的子安装不执行任何依赖脚本，不构建嵌套的 git 依赖，不读取克隆仓库自带的 `allowScripts` 与 `~/.nprc`，不读写 `np-lock.json`。
- `np-x approve-scripts <pkg>` 写入 `<pkg>@<已安装版本>`；git 依赖写地址与 commit，tarball URL 依赖写 URL，都去掉凭据。
- git 依赖在获取时构建：放行后按提示删除它的 `.store` 目录，再运行 `np`。
- `np-x deny-scripts` 与 npm 一致，写入不带版本的 `false` 条目。

## 为全局安装放行脚本

全局安装时，被装的包自身的脚本照常执行。它声明的本地依赖，脚本要等你用 `--allow-scripts=<pkg>` 或 `~/.nprc` 放行被装的包之后才执行。跳过列表末尾会给出一条用于重装的 `np-x install -g --allow-scripts=...` 命令。
