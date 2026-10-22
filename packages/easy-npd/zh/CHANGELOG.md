# 更新日志

[English](../CHANGELOG.md) · **简体中文**

easy-npd 起步于 [cnpm/npminstall](https://github.com/cnpm/npminstall) 6.8.0，上游的历史见 [npminstall 6.x CHANGELOG](https://github.com/cnpm/npminstall/blob/6.x/CHANGELOG.md) 与更早的 [History.md](https://github.com/cnpm/npminstall/blob/6.x/History.md)。

0.0.0 列出相对 npminstall 6.8.0 的全部改动，之后每个版本列出相对上一版的改动。

## Unreleased

### 新增

- 依赖脚本在后台运行时，spinner 显示每个运行中脚本的耗时，以及它经 Node.js http / https 已下载的字节数（例如预编译二进制），下载耗时较长时不再像卡住。使用 `--detail` 或不在终端中运行时，每 10 秒为仍在运行的脚本各打印一行。
- 安装依赖时，spinner 还显示已解析的包版本数、已下载的 tarball 字节数与平均速度，每秒刷新，下载大包时不再像卡住。

### 变更

- 中断后再次运行 `npd` 时，只打印一行继续安装的包数，不再每个包打印一行 `[npd:resume]`；`--detail` 时仍逐个列出。
- 每个依赖脚本的开始与完成行（`scripts.<name> ... run` 与 `... finished in`）以及 `found binding.gyp` 提示只在 `--detail` 时打印，与 easy-np 一致；失败信息与最后的 `Run <n> scripts` 行照常打印。

## 0.0.7 (2026-10-22)

### 破坏性变更

- 包版本目录从 `node_modules/_<name>@<version>@<name>` 挪到 `node_modules/.npd/` 下，`node_modules` 根目录只留包名链接；安装状态也挪到 `node_modules/.npd/.npd-state.json`。已有项目第一次完整运行 `npd` 时删掉旧目录，并从磁盘缓存重新安装。迁移方法：把配置里匹配 `node_modules/_<name>` 的路径（例如 jest 的 `transformIgnorePatterns`）改成 `node_modules/.npd/_<name>`；靠自身目录（`__dirname` 加 `../..`）推算项目根的脚本改为读取 `INIT_CWD`。
- 根项目的 `preinstall` 改为在依赖安装完成后运行，与它的 `install`、`postinstall` 一起执行，与 npm 7+ 及 easy-np 一致。迁移方法：必须在安装依赖之前执行的步骤（例如生成某个 `file:` 依赖）改成在运行 `npd` 之前单独执行的命令。

### 变更

- 放行的依赖脚本（含 `preinstall` 与隐式的 `node-gyp rebuild`）改为在整棵依赖树链接完成后运行，与 npm 及 easy-np 一致，脚本里可以加载兄弟依赖与 peer 依赖。一个包的脚本在它自己依赖的包的脚本之后运行，互不依赖的包并行运行（最多 10 个），不再逐个执行。
- 可选依赖里某个包的脚本失败时，与 npm 一样撤掉已链接的这个可选依赖；下次运行 `npd` 会重试。
- `npd-x rebuild <pkg> ...` 按依赖顺序重跑列出的包，与列出的顺序无关。
- 续装记录的阶段改为 `deps`、`preinstall`、`install`、`postinstall` 与 `finish`，与 easy-np 一致；旧版本停在 `preinstall` 与 `install` 之间的包会重跑一次 `preinstall`。

## 0.0.6 (2026-10-21)

### 变更

- 项目里有 `npm-shrinkwrap.json` 或 `package-lock.json`，但没有读取 `np-lock.json`（文件不存在，或锁文件处于关闭状态，`npd` 默认就是关闭的）时，`npd` 与 `npd-x install` 会给出警告，因为 npm 锁文件里的版本不会被采用；要按它安装，传 `--from-package-lock=<file>`。
- `np-lock.json` 与其他包管理器的锁文件同时存在时，`npd-x install` 会给出警告，因为两者分别更新，锁定的版本可能不同。
- `--from-package-lock` 遇到 lockfileVersion 为 1 的文件时，提示用 npm 7 或更高版本重新生成；帮助与文档写明也接受 `npm-shrinkwrap.json`。

## 0.0.5 (2026-10-16)

### 破坏性变更

- 未知参数会以退出码 1 失败，并提示最接近的已知参数；npd 从未支持、以前被悄悄忽略的参数也一样，例如 `--workspaces`、`--shamefully-hoist` 与 `--public-hoist-pattern`；`--key=value` 与 `--` 之后的参数仍原样传递。迁移：修正或删掉报错里指出的参数。[只传 npd 认识的参数](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/zh/docs/install-packages.md#只传-npd-认识的参数)

### 变更

- 用法错误与配置错误只打印错误信息、npd 版本与命令行，不再输出调用栈。
- 没有 `package.json` 也没有指定包名时，`npd-x install` 与 npm 一样直接失败，不写入任何文件。
- 文档改为英文，中文翻译放在 `zh/` 下；使用指南拆成[一页一个任务](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/zh/docs/README.md)。
- npd 现在要求 Node.js 14.19.3 或更高版本（原为 14.18.0），这是 urllib 3.27.3 声明的最低版本；在 Node.js 14.18 上请先升级 Node.js。
- 包里现在带 `npm-shrinkwrap.json`，并把 tar 与 urllib 固定在测试过的版本（7.5.22 与 3.27.3），用 npm 安装时整棵依赖树都按测试过的版本解析，后续的小版本不会引入 Node.js 14 与 16 缺少的 API。在 Node.js 14 与 16 上安装时出现 `EBADENGINE` 警告属正常现象，没有影响；开启了 `engine-strict` 时，用 `--engine-strict=false` 安装，或改用 Node.js 18 及以上版本。[在旧版 Node.js 上运行与编译原生模块](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/zh/docs/node-versions.md)

### 修复

- 在 Node 26 上拼接源地址与 tarball 地址时，不再打印 DEP0169 的 `url.parse()` 警告。
- 没有下载任何内容时，安装摘要显示 `speed 0B/s`，不再是 `speed null/s`。
- `npd-x --version` 与 `npd-x install -v` 打印 `npd-x v<version>`。
- `--frozen-lockfile` 失败时提示运行 `npd-x install` 更新 `np-lock.json`。

## 0.0.4 (2026-10-10)

### 破坏性变更

- `npd` 现在等同于 `npd-x install` 加上 `--no-lockfile --dangerously-allow-all-scripts`，环境变量与配置文件都改不了这两个参数；用 `npd` 时想要锁文件或脚本审核，在命令行上传 `--lockfile` / `--frozen-lockfile` 或 `--no-dangerously-allow-all-scripts`。
- 已移除的安装参数现在会失败，并提示替代写法；迁移：按提示或[已移除参数对照表](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/zh/docs/migrate-from-npminstall.md#替换已移除的命令参数与特性)替换。
- 依赖类型用 `--only`、`--include`、`--omit`（同 `--exclude`）与 `--write=<type>` 选择，其中 `prod` 指 `dependencies`，其他类型指 `<type>Dependencies`；`--prod` 即 `--only=prod`，`--production` 即 `NODE_ENV=production`；迁移：按下面几条替换旧参数。
- 移除 `-S/--save`、`-D/--save-dev`、`-O/--save-optional` 与 `-E/--save-exact`，`npd-x uninstall` 也一样；迁移：改用 `--write=<type>` 与 `--write-exact`。
- 移除 `--no-optional` 与 `--legacy-peer-deps`；迁移：改用 `--omit=optional` 与 `--omit=peer`。
- 移除 `--client`、`--save-client` 等 cnpm 参数；`clientDependencies` 等非标准字段默认不再安装（完整安装时会给出警告），依赖里的同类字段也不再安装；迁移：改用 `--include=<type>` 或 `--write=<type>`。
- 移除 `--root`；迁移：到那个目录里运行 npd。
- `--lockfile-path` 改名为 `--from-package-lock`，移除 `-d`；迁移：改用 `--from-package-lock` 与 `--detail`。
- 移除 `--flatten`、`--fix-bug-versions`、`--tarball-url-mapping`、`--high-speed-store`、`--dependencies-tree`、`--save-dependencies-tree` 与 `--cache-strict`；迁移：删掉它们，用 `np-lock.json` 代替依赖树文件。
- 移除安装参数 `--fetch-only` 与 `--rebuild`；迁移：改为运行 `npd-x fetch` 与 `npd-x rebuild`。
- `--production` 不再关闭磁盘缓存，也不再强制输出详细日志；迁移：依赖这一行为的，加上 `--no-cache` 或 `--detail`。
- `npd-x uninstall` 只保留别名 `rm` 与 `remove`，`npd-x rebuild` 去掉别名 `rb`；迁移：改用这两个别名或完整的命令名。
- `npd-x uninstall` 现在会回收没有任何链接指向的版本目录，保留其他包仍在使用的目录，与 npm 7+ 一样不再执行 preuninstall / uninstall / postuninstall，并拒绝 `--ignore-scripts`；迁移：从卸载命令里删掉 `--ignore-scripts`。
- `.npmrc` 的 `_authToken` 与 `~/.nprc` 的用户名 / 密码只发给源自己的主机，`always-auth` 也不会再把它们发到别处；迁移：为用到的每个源主机分别配置凭据。
- 依赖的安装脚本在后台执行，不显示输出；迁移：要看输出，传 `--foreground-scripts`（根项目与本地目录依赖的脚本始终显示输出）。
- `~/.nprc` 里的 `registry` 现在决定安装用的源（顺序：`--registry` > `npm_registry` > `~/.nprc` > `.npmrc` / `npm_config_registry`）；迁移：如果它原本只用于凭据，把它从 `~/.nprc` 里删掉。
- `-c` / `--china`、`--custom-china-mirror-url`、`--prune`、`--force-link-latest` 与 `--disable-dedupe` 现在会失败，不再把后面的包名吞作自己的值；迁移：删掉它们。
- `np_lockfile` 现在优先于 `config.np.lockfile`，不再是两者任一为 `false` 就关闭锁文件；迁移：在 `np_lockfile` 里设成你要的值。

### 新增

- 在后台执行失败的安装脚本，会把命令与完整输出保存到缓存目录下的 `np-script-logs/`，错误信息末尾给出日志路径；超过 7 天的日志会被删除。[找到缓存位置](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/zh/docs/offline-and-cache.md#找到缓存位置)
- 源切换覆盖 npm、yarn、alibaba（npmmirror）、tencent 与 huawei，在最快的三个之间重试，最多 6 次；升级后第一次运行会重新测速。[让 npd 自动切换公共源](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/zh/docs/registry.md#让-npd-自动切换公共源)
- 两个入口都读取 npm 与 pnpm 的设置：从 `pnpm-workspace.yaml` 或 `pnpm` 字段读取 pnpm 的构建设置与 `lockfile`，从 `.npmrc` 读取源、脚本参数与锁文件相关的键。[了解读取哪些文件](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/zh/docs/configuration.md#了解读取哪些文件)
- 只配置了 pnpm 的 `neverBuiltDependencies` 时，其余依赖的脚本全部放行。[确定哪个策略生效](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/zh/docs/allow-scripts.md#确定哪个策略生效)
- 读取 `.npmrc` 里源的 `_authToken`。[凭据只发给对应的源](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/zh/docs/registry.md#凭据只发给对应的源)
- 新增 `--no-write`（同 `--no-save`）、`--lockfile`、`--prefer-offline` 与 `npd-x update --clean-only`。[安装包](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/zh/docs/install-packages.md)
- 新增子命令别名 `npd-x approve` 与 `npd-x deny`，每个子命令都接受 `-v`。[按任务找命令](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/zh/docs/install.md#按任务找命令)

### 变更

- `--frozen-lockfile` 现在隐含 `--lockfile`。
- 错误输出与 easy-np 一致：错误信息、版本与命令行参数。
- 全局安装跳过了脚本时，重新安装的提示改为 `npd-x install -g --allow-scripts=...`。

### 修复

- 设置了 `np_cache` 时，`--no-cache` 也能生效。
- 安装脚本收到的 `npm_config_cafile` 是绝对路径。

## 0.0.3 (2026-10-06)

### 破坏性变更

- 与 npm 12 一样，依赖的安装脚本（preinstall / install / postinstall、隐式的 `binding.gyp` 构建、git 依赖的 prepare）只有在根 `package.json` 的 `allowScripts` 里放行后才会执行；迁移：对每个被跳过的包运行 `npd-x approve-scripts <pkg>`，或传 `--dangerously-allow-all-scripts`。[放行依赖的安装脚本](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/zh/docs/allow-scripts.md)
- 需要构建的 git 依赖（有 prepare、build、install 等脚本，或有 workspaces）要在 `allowScripts` 里审核；构建时不执行依赖的脚本，不构建嵌套的 git 依赖，也不读取克隆下来的仓库里的 `allowScripts` 与 `~/.nprc`；迁移：用 `npd-x approve-scripts` 放行该仓库。
- `--ignore-scripts` 也会跳过 git 依赖的构建，以及根项目与依赖的 `binding.gyp` 构建；迁移：需要这些构建的地方去掉 `--ignore-scripts`。
- 源上的包、git 包或 tarball url 包声明的 `file:` 依赖，改为相对声明它的包所在目录解析，不再相对项目根目录，并且只在声明它的包被放行时执行 preinstall / install / postinstall；迁移：把这些路径改写成相对声明它的包。
- 使用 `npd -g <pkg>` 时，被安装包的 `file:` 依赖要等该包被放行后才执行脚本；迁移：用跳过列表后面打印的 `npd -g --allow-scripts=...` 命令重新安装。
- git 包、tarball url 包与本地包安装到带来源后缀的目录（`_foo@1.0.0+git.1a2b3c4d@foo`、`+url.<integrity digest>`、`+file.<source path digest>`），所以升级后会再拉取一次；迁移：运行 `npd-x prune` 删掉旧目录。
- git 依赖改用 git 命令行克隆，不再下载 codeload 的 tarball，并由 npd 自己构建，不再调用 `npm install`；迁移：在机器上装好 git。
- 同一个参数传入多次时，现在与 npm 一样取最后一个值（`--allow-scripts` 合并所有取值）；迁移：每个参数只传一次。

### 新增

- `np-lock.json` 记录每条依赖声明解析到的版本，下次安装时复用；它与 easy-np 共用。[用 np-lock.json 锁定版本](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/zh/docs/lockfile.md)
- `np-lock.json` 把 git 依赖锁定到某个提交，把 tarball url 依赖锁定到它的 sha512 完整性摘要。[了解 np-lock.json 记录什么](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/zh/docs/lockfile.md#了解-np-lockjson-记录什么)
- 用 0.0.3 的预发布版生成过 `np-lock.json` 的，请删掉它重新安装：那些版本可能漏掉子依赖、改写 peerDependencies，或用 `foo@*` 这类命令行写法作为键。
- 支持 npm 的 `overrides`，优先级高于 `resolutions`。[覆盖嵌套依赖的版本](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/zh/docs/install-packages.md#覆盖嵌套依赖的版本)
- 与 npm 7+ 一样，自动安装缺少的 peerDependencies。[安装包](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/zh/docs/install-packages.md#安装项目依赖或添加包)
- 源测速结果缓存 5 分钟，可用 `--probe-cache=<minutes>` 或 `np_probe_cache` 修改。[让 npd 自动切换公共源](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/zh/docs/registry.md#让-npd-自动切换公共源)
- 新增 `--proxy`、`--https-proxy`、`--noproxy`、`--cafile` 与 `--no-strict-ssl`，并一并传给安装脚本、node-gyp 与 git。[使用代理或自定义 CA](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/zh/docs/registry.md#使用代理或自定义-ca)
- 新增 `npd-x approve-scripts`、`npd-x deny-scripts`、`--allow-scripts`、`--strict-allow-scripts` 与 `--dangerously-allow-all-scripts`。[放行依赖的安装脚本](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/zh/docs/allow-scripts.md)
- `npd-x prune` 删除没有任何链接指向的版本目录。[回收旧版本目录](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/zh/docs/manage-packages.md#回收旧版本目录)
- npd 可在 Node.js 14.18 及以上版本运行（原为 16.14）。[在旧版 Node.js 上运行与编译原生模块](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/zh/docs/node-versions.md)

### 变更

- npd 不再内置 node-gyp：第一次用到时安装适合当前 Node.js 的版本，也可以用 `npm_config_node_gyp` 指向你自己的 node-gyp。[让 npd 按需安装 node-gyp](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/zh/docs/node-versions.md#让-npd-按需安装-node-gyp)
- 在低于 20.17 的 Node.js 上（以及 21.x、22.0 到 22.8），npd 每次运行打印一行 `npd WARN Node vX: ...`；`np_node_warning=false` 可隐藏这条提示。
- 不指定版本或指定范围时，npd 与 npm 一样先选未废弃的版本，再选 `engines.node` 匹配的版本；例如在 Node 18 上 `npd -g npm` 会装到 npm 10。[版本如何选定](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/zh/docs/install-packages.md#版本如何选定)
- 不可信的本地目录依赖，以及 `--ignore-scripts` 下的所有本地目录依赖，按 `files` / `.npmignore` / `.gitignore` 规则复制，不再调用 `npm pack`，因此不会执行任何脚本；根项目声明的本地目录在 npm 7 及以上版本仍用 `npm pack`。
- `npm pack` 的输出不再有 1 MB 的上限，超时会结束整个进程树，失败警告里附上 stderr 的末尾部分。
- 根 `package.json` 里有 `workspaces` 时，npd 会警告不支持 workspaces，只添加 `np-lock.json` 条目。
- 安装进度记录在 `node_modules/.npd-state.json`，不再写进每个包的 `package.json`；已有的安装仍能识别。
- 依赖从 git、url 或本地路径改回源上的版本时，即使版本相同也会替换已安装的包。

### 修复

- tarball 按 `dist.integrity` 里最强的算法（通常是 sha512）校验，不再只用 sha1。
- 源上的包按源上的名字与版本链接、审核与保存，tarball 无法冒用其他包在 `allowScripts` 里的放行，npd 会改为警告 `manifest mismatch`。请删掉 0.0.3 之前安装的 `node_modules` 后重新安装。
- 错误、警告、`npd-debug.log` 与调试输出里，地址中的凭据、`_authToken` / `_auth` / `_password` 的值以及 token 类查询参数都替换为 `***`；安装抛出异常时也会写 `npd-debug.log`。
- `np-lock.json`，以及 `approve-scripts` / `deny-scripts` 写入的 git 与 tarball url 键，不再包含地址里的凭据。
- `npd-x approve-scripts` 能列出并放行只因构建脚本被跳过的 git 依赖，不再报 `has no installed version with install scripts` 失败。
- `--dangerously-allow-all-scripts`、`--strict-allow-scripts`、`--strict-ssl` 与 `--foreground-scripts` 不再吞掉后面的包名。
- 命令行上的 `--strict-ssl` 优先于 `npm_config_strict_ssl=false`，并同样作用于安装脚本与 git。
- 相对路径的 `--cafile` 先按当前目录解析，再传给安装脚本与 git。
- `--save-dependencies-tree` 保存 `cpu`、`libc`、`bin`、`peerDependenciesMeta` 与 `bundleDependencies`，在其他平台上还原时不再选错可选依赖。
- git 准备阶段超时会结束整个进程树，一次安装里每个 git 仓库只执行一次 `git ls-remote`。
- Ctrl-C（SIGINT）与 SIGTERM 会停止正在运行的 git 进程，并以 130 / 143 退出；git 任务并发时不再触发 `MaxListenersExceededWarning`。
- `config.np.lockfile: false` 能关闭 `np-lock.json`，与 easy-np 使用同一个键。
- 路径经过符号链接时 `npd-x prune` 也能正常工作，并清理 `.npd-state.json` 里的记录；`npd-x uninstall` 同样会清理。
- 包在重新解压或复制之前先标记为未完成，中断的解压会重做。
- git 依赖构建时不再在构建出的包里生成 `np-lock.json`。
- 保存到 `package.json` 时，等待 `npm config get save-prefix` 最多 30 秒，超时回退为 `^`。
- Node.js 升级提示按能力范围计算（例如 Node 21.x 会被提示升级到 22.9.0），Node.js 预发布版本按对应的正式版处理。
- 跨域重定向时丢弃 Authorization 请求头（urllib `^3.27.3`）。

## 0.0.2 (2026-10-03)

### 破坏性变更

- 除 `npd` 以外的命令都合并为 `npd-x <command>`：`install`（`i`、`add`）、`uninstall`（`un`、`remove`、`rm`、`r`）、`update`（`up`、`upgrade`）、`link`（`ln`）、`fetch`、`rebuild`（`rb`）；迁移：把 `npd-fetch`、`npd-link`、`npd-uninstall` 与 `npd-update` 换成 `npd-x fetch`、`npd-x link`、`npd-x uninstall` 与 `npd-x update`。
- 入口文件 `bin/install.js` 改名为 `bin/i.js`，`bin` 只保留 `i.js`（`npd`）与 `x.js`（`npd-x`）；迁移：调用 `npd` / `npd-x`，不要再用文件路径。

### 新增

- 单个包失败（下载、子依赖或脚本）不再中止整个安装：其余的包照常装完，所有失败都会列出，退出码为 1；可选依赖失败时与 npm 一样跳过。[从失败的安装中恢复](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/zh/docs/resume.md)
- 失败或中断后再次运行 `npd`，每个包从停下的阶段继续，不重新解压，也不重跑已成功的脚本。[从中断处继续](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/zh/docs/resume.md#从中断处继续)
- `npd-x rebuild [<pkg>[@<range>] ...]` 按依赖顺序重新执行已安装依赖的 preinstall / install / postinstall。[重跑安装脚本](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-npd/zh/docs/manage-packages.md#重跑安装脚本)
- 安装结束时列出被跳过的可选依赖，并给出重跑其脚本的 `npd-x rebuild <pkg>` 命令。
- `npd-x -h` 列出全部子命令，`npd-x <command> -h` 与 `npd-x help <command>` 显示各子命令的参数。

### 修复

- 安装失败或中断时已解压但尚未完成的包，不再被标记为已完成，下次安装时会执行它们的脚本。
- 子依赖的脚本失败后，下次安装能通过它的父包找到并重跑，不再只限于直接依赖。
- 切换源后重试脚本时，借助包目录里的 `.npd-binary-snapshot.json` 恢复被二进制镜像改写过的文件。
- `npd-x update` 期间，依赖脚本里运行的 `npd <pkg>` 不再被当成不带包名的安装。
- 根包的脚本失败时，不再把 `__npd_done` 写进项目的 `package.json`。

## 0.0.1 (2026-10-02)

### 修复

- `npd-uninstall` 也会删除 `.cmd` 与 `.ps1` 命令入口（包括其他工具在 macOS / Linux 上留下的），`bin` 为字符串时也不再删错路径。
- 用 `npd -g` 重装或升级全局包，或者用 `npd-link` 覆盖时，先删除旧版本的全部命令入口。
- 本地安装改变了某个依赖的版本时，从 `node_modules/.bin` 里移除新版本不再声明的命令，其他包的同名命令保留。

## 0.0.0 (2026-09-29)

首个版本。

### 破坏性变更

以下是与 npminstall 6.8.0 的差异。

- 包名为 `easy-npd`，命令为 `npd`、`npd-fetch`、`npd-link`、`npd-uninstall` 与 `npd-update`，User-Agent 为 `easy-npd/<version>`，日志前缀与调试命名空间为 `npd`；迁移：改用新的命令名。
- 用户配置文件是 `~/.nprc`，不再是 `~/.cnpmrc`；迁移：把文件挪过去。
- 缓存目录为 `~/.np_tarball`，对应环境变量 `np_cache`，完成标记为 `__npd_done`，全局 store 目录为 `.<name>_npd`；迁移：删掉 npminstall 装出的 `node_modules` 后重新安装。
- 缓存布局为 `np-manifests/<name>/<hash>.json`、`np-tgz/<name>/` 与 `np-tmp/<YYYYMMDD>/`，以官方源地址作为键，旧布局既不读取也不清理；迁移：不再需要时删掉旧缓存目录。
- 移除 `-c`、`--china` 与 `npm_china`，改为自动切换源；迁移：删掉它们。
- 移除 `--custom-china-mirror-url`；迁移：删掉它。
- 移除 `--prune`、`config.npminstall.prune` 与 `env:production` / `env:development`，因为它们的固定文件清单会删掉 `tsconfig.json` 这类运行时文件；迁移：删掉它们。
- 移除 `--proxy`、`npm_proxy`、`npm_config_proxy` 与 npm 的 `strict-ssl`，因为它们在 urllib 3 下从未生效；迁移：删掉它们。
- 移除 `--force-link-latest`、`--disable-dedupe` 与 `config.npminstall.disableDedupe`；迁移：删掉它们。
- `--tarball-url-mapping` 只改写第一个请求地址，不改写重定向；迁移：如果依赖重定向，改为映射最终地址。
- npd 要求 Node.js 16.14.0 或更高版本；迁移：升级 Node.js。

### 新增

- npd 在 npmmirror 与 npmjs 之间自动切换：启动时对两者测速，manifest、tarball 与脚本失败时轮换（最多 4 次），镜像上缺少的版本从 npmjs 获取，私有源与 scope 源不受影响。
- `--offline` 只从磁盘缓存安装，缺少内容时立即失败。
- `--refresh-cache` 忽略并覆盖缓存的 manifest 与 tarball。
- `npd-fetch` / `npd --fetch-only` 只下载并解压列出的包。
- `~/.nprc` 与磁盘缓存 `~/.np_tarball` 与 easy-np 共用。
- 每个命令的 `--help` 列出全部支持的参数。

### 变更

- 根目录的链接始终指向最高版本，完整安装时随依赖变化而更新，且从不覆盖根 `package.json` 里声明的包。

### 修复

- 缓存里损坏的 tarball 会被删除并重新下载，不再每次重试都失败。
- 流式请求收到 4xx / 5xx 响应时，不再抛出未捕获的中止错误。
- 完成标记为 false 的根包（由 `npd-fetch` 或失败的安装留下），完整安装会重新处理，不再跳过。
- `--lockfile-path` 加载失败时报错退出，不再悄悄改为联网解析。
- 在 `npm run` / `npx` 下能安装需要 prepare 的 git 依赖，不再被 npm 12 以 `EALLOWSCRIPTS` 拒绝，报错里附上子进程的 stderr。
- `npd-uninstall` 在 `package.json` 写回之后才返回。
- `npd-uninstall` 会移除没有任何地方使用的根链接，被删除的包的依赖不能再被 require。
- `.nprc` 中源的用户名 / 密码只发给源自己的主机，使用 `always-auth` 时也一样，不再泄露给回退源、tarball CDN 或二进制镜像。
