# 更新日志

[English](../CHANGELOG.md) · **简体中文**

easy-np 起步于 [cnpm/npminstall](https://github.com/cnpm/npminstall) 8.0.1，上游的历史见 [npminstall CHANGELOG](https://github.com/cnpm/npminstall/blob/master/CHANGELOG.md)。

0.0.0 列出相对 npminstall 8.0.1 的全部改动，之后每个版本列出相对上一版的改动。

## Unreleased

### 变更

- `np-x rebuild <pkg> ...` 按依赖顺序重跑列出的包，与列出的顺序无关。

### 修复

- 续装时，一个包的脚本会等待经由「上次已完成的包」间接依赖的包的脚本跑完再运行。

## 0.0.6 (2026-10-21)

### 变更

- 项目里有 `npm-shrinkwrap.json` 或 `package-lock.json`，但没有读取 `np-lock.json`（文件不存在，或锁文件处于关闭状态，`np` 默认就是关闭的）时，`np` 与 `np-x install` 会给出警告，因为 npm 锁文件里的版本不会被采用；要按它安装，传 `--from-package-lock=<file>`。
- `np-lock.json` 与其他包管理器的锁文件同时存在时，`np-x install` 会给出警告，因为两者分别更新，锁定的版本可能不同。
- 依赖的生命周期脚本改为与 npm 一样，在整棵依赖树链接完成后再执行，而不是每个包装完立即执行；`postinstall` 加载兄弟依赖或 peer 依赖时，不会再因为那个包还在安装中而失败。一个包的脚本仍在它的依赖的脚本之后执行，互不依赖的包并行执行（最多同时 10 个）。
- `--from-package-lock` 遇到 lockfileVersion 为 1 的文件时，提示用 npm 7 或更高版本重新生成；帮助与文档写明也接受 `npm-shrinkwrap.json`。

## 0.0.5 (2026-10-16)

### 破坏性变更

- 未知参数现在会以退出码 1 失败，并提示最接近的已知参数，例如 `unknown option --prodd (did you mean --prod?)`；`--key=value` 形式与 `--` 之后的参数仍原样传递。请修正或删掉脚本里传入的这类参数（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/zh/docs/troubleshooting.md#参数相关的报错)）。

### 变更

- 用法错误与配置错误只打印错误信息，后面跟 `np version` 与 `np argv`，不再输出调用栈。
- 没有 `package.json` 也没有指定包名时，`np-x install` 与 npm 一样直接失败，不写入任何文件。
- 文档改为英文并附中文翻译，使用手册拆成每个任务一页，见[手册目录](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/zh/docs/README.md)。
- easy-np 现在要求 Node.js 14.19.3 或更高版本（原为 14.18.0），这是 urllib 3.27.3 声明的最低版本；在 Node.js 14.18 上请先升级 Node.js。
- 包里现在带 `npm-shrinkwrap.json`，并把 tar 与 urllib 固定在测试过的版本（7.5.22 与 3.27.3），用 npm 安装时整棵依赖树都按测试过的版本解析，后续的小版本不会引入 Node.js 14 与 16 缺少的 API。在 Node.js 14 与 16 上安装时出现 `EBADENGINE` 警告属正常现象，没有影响；开启了 `engine-strict` 时，用 `--engine-strict=false` 安装，或改用 Node.js 18 及以上版本（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/zh/docs/node-versions.md#在-nodejs-14-与-16-上安装)）。

### 修复

- 生命周期脚本保留命令里引号内的空白，在 Node 24+ 上不再触发 DEP0190。
- `.bin` 入口会执行 postinstall 脚本替换进来的文件（例如 esbuild 的原生二进制），不再报 `SyntaxError` 失败（Unix）；已有的安装运行 `np-x rebuild` 或重新安装即可修复。
- 缓存为空时使用 `--offline`，不再打印 `Get /binary-mirror-config/latest ... error: undefined`。
- 在 Node 26 上拼接源地址与 tarball 地址时，不再打印 DEP0169 的 `url.parse()` 警告。
- 没有下载任何内容时，安装摘要显示 `speed 0B/s`，不再是 `speed null/s`。
- `np-x --version` 与 `np-x install -v` 打印 `np-x v<version>`。
- `--frozen-lockfile` 失败时提示运行 `np-x install` 更新 `np-lock.json`。

## 0.0.4 (2026-10-10)

### 破坏性变更

- `np` 现在等同于 `np-x install` 加上 `--no-lockfile --dangerously-allow-all-scripts`，与 `np-x install` 一样读取 `.npmrc` 与 pnpm 配置，任何配置文件都改不了这两个参数；想用锁文件或经过审核的脚本，传 `--lockfile` 或 `--no-dangerously-allow-all-scripts`，或者改用 `np-x install`。
- 已移除的安装参数现在会报错退出，并指出替代写法；按[替换已移除的命令与参数](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/zh/docs/migrate-from-npminstall.md#替换已移除的命令与参数)中的对照表替换。
- 移除 `-S/--save`、`-D/--save-dev`、`-O/--save-optional` 与 `-E/--save-exact`，改用 `--write=<type>` 与 `--write-exact`。
- 移除 `--no-optional`、`--legacy-peer-deps`、`--client`、`--save-client` 等 cnpm 参数，改用 `--omit=optional`、`--omit=peer`、`--only` 与 `--include`。
- `clientDependencies` 等非标准字段默认不再安装（完整安装时会给出警告），已安装的包里的同名字段一律不装；要安装它们，传 `--include=<type>`。
- 移除 `--root`、`-w` 与 `--workspace`；与 npm 7+ 一样，在某个 workspace 目录里运行只处理这一个 workspace。请改为在 workspace 目录里运行命令。
- `--dedup` 改名为 `--shamefully-hoist`，`--lockfile-path` 改名为 `--from-package-lock`，`-d` 被移除；改用新名字与 `--detail`。
- 移除 `--flatten`、`--fix-bug-versions`、`--tarball-url-mapping`、`--dependencies-tree`、`--save-dependencies-tree`、`--cache-strict`，以及安装参数 `--fetch-only` 与 `--rebuild`；改用 `np-lock.json`、`np-x fetch` 与 `np-x rebuild`。
- `--production` 不再关闭磁盘缓存，也不再强制输出详细日志；依赖这一行为的，改传 `--no-cache` 或 `--detail`。
- `np-x uninstall` 只保留别名 `rm` 与 `remove`，`np-x rebuild` 去掉别名 `rb`；请使用完整的命令名。
- `np-x uninstall --ignore-scripts` 现在会报错；删掉这个参数即可，卸载本来就不执行生命周期脚本。
- 源的凭据（`.npmrc` 的 `_authToken`，以及 `~/.nprc` 的用户名与密码）只发给该源所在主机的请求，`always-auth` 也不会再把它们发到别处；请为用到的每个源主机分别配置凭据。
- `~/.nprc` 里的 `registry` 现在决定安装用的源（`--registry` > `npm_registry` > `~/.nprc` > `.npmrc` / `npm_config_registry`），以前它只用于匹配凭据对应的主机；不想从它安装的，把它从 `~/.nprc` 里删掉。
- npminstall 的 `-c` / `--china`、`--custom-china-mirror-url`、`--prune`、`--force-link-latest` 与 `--disable-fallback-store` 现在会报错退出，不再把后面的包名吞作自己的值；请从命令里删掉它们。
- 环境变量 `np_lockfile` 现在优先于 `config.np.lockfile`，以前两者任一设为 false 就会关闭锁文件；需要从环境里关闭时，设置 `np_lockfile=false`。

### 新增

- 在后台执行失败的依赖脚本，会把命令与完整输出写进缓存目录 `np-script-logs/` 下的日志，日志文件名列在错误信息末尾（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/zh/docs/registry.md#缓存放在哪里)）。
- 两个入口都读取 npm 与 pnpm 的配置：构建设置、`lockfile`、提升规则，以及 `pnpm-workspace.yaml` 或 `pnpm` 字段里的 `packages`，还有 `.npmrc` 里的对应键（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/zh/docs/configuration.md#easy-np-读取哪些文件)）。
- 只配置了 pnpm 的 `neverBuiltDependencies` 时，其余依赖的脚本全部放行。
- `--no-write` 与 `--no-save` 效果相同。
- `--lockfile` 显式开启 `np-lock.json`，`--frozen-lockfile` 也视为开启。
- `--prefer-offline` 直接使用缓存的 manifest，不再重新校验（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/zh/docs/registry.md#使用缓存参数)）。
- `--ws` 是 `--workspaces` 的别名。
- `np-x approve` 与 `np-x deny` 是 `approve-scripts` 与 `deny-scripts` 的别名，每个命令都接受 `-v`。
- `np-x uninstall --write=<type>` 会同时从 `<type>Dependencies` 里删除该包；四个标准字段始终会清理。

### 变更

- 公共源从 npmmirror 与 npmjs 两个扩展为 npm、yarn、alibaba（npmmirror）、tencent 与 huawei：选用最快的三个，manifest 或 tgz 失败时按顺序在它们之间重试，最多 6 次（原为 4 次）；升级后第一次运行会重新测速（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/zh/docs/registry.md#让-easy-np-切换公共源)）。
- 全局安装跳过了依赖脚本时，重新安装的提示改为 `np-x install -g --allow-scripts=...`。

### 修复

- 设置了 `np_cache` 时，`--no-cache` 重新生效。

## 0.0.3 (2026-10-06)

### 破坏性变更

- 与 npm 12 一样，依赖的安装脚本默认不再执行：依赖的 `preinstall` / `install` / `postinstall`、隐式的 `binding.gyp` 构建以及 git 依赖的 `prepare`，只有在根 `package.json` 的 `allowScripts` 里放行后才会执行；用 `np-x approve-scripts` 放行，或者传 `--dangerously-allow-all-scripts` 保留旧行为。0.0.3 之前装出的 `node_modules` 里的脚本未经审核就执行过，请重新安装（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/zh/docs/allow-scripts.md)）。
- git 依赖现在一律用 git 命令行拉取，托管在代码平台上的仓库也一样，不再下载 codeload 的 tarball；需要安装 git 依赖的机器请装好 git。
- 不再内置 node-gyp，第一次编译原生模块时按需安装到 `<cache directory>/np-node-gyp`；无法联网的机器请用 `npm i -g` 安装 node-gyp，并设置 `npm_config_node_gyp`（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/zh/docs/node-versions.md#获取-node-gyp)）。

### 新增

- 已安装版本与 `np-lock.json` 不一致时，替换成锁定的版本；`np <pkg>` 记录写进 `package.json` 的声明，命令行上的 tag 或 `*` 会重新解析。
- `np-lock.json` 记录每条依赖声明解析到的版本，下次安装时复用；它与 easy-npd 共用（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/zh/docs/lockfile.md)）。
- `--frozen-lockfile` 只按 `np-lock.json` 安装，缺少条目时失败。
- `np-lock.json` 锁定 git 依赖的提交与 tarball 地址依赖的 sha512 完整性校验值，tarball 内容变化时失败。
- `np-x approve-scripts`、`np-x deny-scripts`、`--allow-scripts`（可重复传入，取值合并）、`--strict-allow-scripts` 与 `--dangerously-allow-all-scripts` 控制依赖的安装脚本；后两个是布尔开关，不会把后面的包名当作自己的值，未传时回退到 `npm_config_*` 与 `~/.nprc`。
- 支持 npm 的 `overrides`，优先级高于 `resolutions`（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/zh/docs/install-options.md#用-overrides-强制版本)）。
- 与 npm 7+ 一样，自动安装缺少的 peerDependencies，安装失败时像可选依赖一样跳过并给出警告；`--legacy-peer-deps` 恢复为只警告。
- 公共源测速结果缓存在 `~/.np_tarball/np-probe.json`，有效期 5 分钟；用 `--probe-cache=<minutes>` 或 `np_probe_cache` 修改。
- `--proxy`、`--https-proxy` 与 `--noproxy` 设置代理，并一并传给安装脚本、node-gyp 与 git（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/zh/docs/registry.md#使用源与网络参数)）。
- `--cafile` 设置 CA 证书，`--no-strict-ssl` 关闭证书校验，两者都会传给安装脚本与 git；命令行上的 `--strict-ssl` / `--no-strict-ssl` 优先于 `npm_config_strict_ssl` 与 `~/.nprc`。
- `--lockfile-path` 支持 workspaces：每个 workspace 都按 npm 锁文件里的版本安装，同一声明在锁文件里锁定了不同版本时给出警告，并采用最靠近根目录的那个。
- `np-x prune` 删除没有任何链接引用的包版本（`node_modules` 是符号链接时也一样），并清理它们在 `.np-state.json` 里的记录；`--dry-run` 只列出不删除（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/zh/docs/workspaces.md#回收旧版本)）。
- 支持 Node.js 14.18：`engines` 从 16.14 降到 14.18。
- 在较老的 Node.js 上，每次运行打印一行 `np WARN Node vX: ...`，指出受影响的功能，以及恢复该功能所需的 Node.js 版本；`np_node_warning=false` 可关闭这条提示。

### 变更

- 源上的包按源上的 `name@version` 识别：tarball 里的 `package.json` 声称是另一个包时，给出 `manifest mismatch` 警告；放行规则、跳过列表、`np-x approve-scripts`、`np-x rebuild` 与链接名都使用源上的包名。
- 源上的包、git 包与 tarball 地址包声明的 `file:` 本地依赖，改为相对声明它的包解析，不再相对项目根目录；它们只执行 `preinstall` / `install` / `postinstall`，放行与否跟随声明它的包。
- git 依赖的构建一律先经审核，只声明了 `build`、`prepack` 或 workspaces 的仓库也一样；构建时的子安装不再读取克隆下来的仓库里的 `allowScripts` 与 `~/.nprc`，嵌套的 git 依赖不会被构建。
- `--ignore-scripts` 也会跳过 git 依赖的构建，直接按仓库原样打包。
- `np -g <pkg>`：被安装包的 `file:` 本地依赖只有在该包被放行时才执行脚本，它的 `overrides` 也不再让这些依赖变成可信；跳过列表末尾给出带 `--allow-scripts` 的 `np -g` 命令，因为 `np-x approve-scripts` 与 `np-x rebuild` 不支持 `-g`。
- `.store` 里 git 包、tarball 地址包与本地包的目录名在版本号后加上来源标记（`+git.<commit>`、`+url.<...>`、`+file.<...>`），版本号不变而内容更新时也会重新安装；升级后第一次安装会重新拉取这些依赖，`np-x prune` 会删掉旧目录。
- 不带来源标记、存放 git、地址或本地内容的旧 `.store` 目录，不再被同名同版本的源依赖复用；依赖声明从 git、地址或本地路径改回源上的版本时，会安装源上的包。
- 本地目录依赖与 tarball 文件依赖只在内容摘要一致时复用，版本与路径不变但内容变了时会重新安装。
- 不指定版本或指定范围时，与 npm 一样优先选择 `engines.node` 与当前 Node.js 匹配的版本；例如在 Node 18 上 `np -g npm` 会安装 npm 10。
- 不指定版本或指定范围时，与 npm 一样避开已废弃的版本，优先级为：未废弃 > `engines.node` 匹配 > 版本更高；范围内只有已废弃版本时仍会选一个并给出警告。
- 不可信的本地目录依赖，以及使用 `--ignore-scripts` 的安装，按 `files` 与 `.npmignore` 规则复制文件，不调用 `npm pack`，也不执行脚本；可信目录在 npm >= 7.18 时仍用 `npm pack`，更老的 npm（Node 14 自带的 npm 6）改为按同样的规则复制，不再报 `npm ERR! ENOLOCAL` 失败。
- `npm pack` 失败时按同样的规则复制文件，不再复制整个目录，警告里显示 stderr 的末尾部分。
- 需要构建的 git 依赖，由 np 自己安装它的依赖（包括 devDependencies），不执行依赖的安装脚本，然后运行 `prepare` 并按 `files` 与 `.npmignore` 规则打包，不再调用 `npm install`。
- 单值参数重复传入时与 npm 一样取最后一个值，不再报错；`--allow-scripts` 与 `-w` / `--workspace` 仍合并所有取值。
- 安装进度记录在 `node_modules/.store/.np-state.json`，不再写进已安装包自己的 `package.json`；旧版本写入的标记仍能识别，无需重新安装。
- 包在解压或复制之前先标记为未完成，安装中断时不会把它算作已完成。

### 修复

- 用过未发布的 0.0.3 构建的，请删掉 `np-lock.json` 后安装一次：那些构建可能漏掉已安装包的子依赖，或记录下 `foo@*` 这类命令行写法。
- 从网络下载的 tarball 按 `dist.integrity` 里最强的算法（通常是 sha512）校验，不再只校验 sha1。
- `--save-dependencies-tree` 保存的依赖树包含 `cpu`、`libc`、`bin`、`peerDependenciesMeta` 与 `bundleDependencies`，在其他平台上还原时不再选错可选依赖。
- git 依赖的 `prepare` 失败时显示脚本 stderr 的末尾部分，超时会结束整个进程树；`npm pack` 的输出不再有大小限制，超时同样会结束整个进程树。
- 一次安装里，每个 git 仓库只执行一次 `git ls-remote`。
- Ctrl+C 或 SIGTERM 会结束整个 git 与 git 构建的进程树（1 秒后强制结束），并以 130 / 143 退出；大量 git 进程并发时不再打印 `MaxListenersExceededWarning`。
- 别名依赖（`"x": "npm:foo@^1"`）与根依赖 `foo` 并存时，下次安装不再删掉 `node_modules/foo`。
- `np <pkg>` 写进 `package.json` 的是依赖名与源上的版本，而不是 tarball 声称的名字与版本。
- `np-lock.json` 与 `--save-dependencies-tree` 保留每个包原本的 peerDependencies。
- `np-x approve-scripts <name>` 能放行只因 `prepare`、`build` 等脚本被跳过的 git 依赖，不再报 `has no installed version with install scripts`，放行后会提示删掉它的 `.store` 目录。
- `np-lock.json` 不再保存地址里的凭据；按锁文件安装时使用 `package.json` 里的地址加上锁定的提交或完整性校验值，带凭据的旧条目会在下次写入时被改写。
- 命令行上不带版本的别名（`np x@npm:foo`）锁定为 `foo@latest`，与 `package.json` 里 `"x": "npm:foo"` 的键相同。
- 错误、警告、`np-debug.log` 与 `NODE_DEBUG` 输出会遮盖地址里的密码，`_authToken` / `_auth` / `_password` 的值，以及 `token`、`access_token`、`auth`、`_authToken`、`password` 查询参数。
- `np-x approve-scripts` / `np-x deny-scripts` 会去掉 git 与 tarball 地址键里的凭据，已有的带凭据条目仍能匹配。
- 相对路径的 `--cafile` 先解析为绝对路径再传给子进程，git 克隆与 git 依赖构建能找到证书。
- 显式传入 `--strict-ssl` 时，为 node-gyp、git 等子进程设置 `npm_config_strict_ssl=true` 并清除 `GIT_SSL_NO_VERIFY`。
- 查询 `npm config get save-prefix` 超过 30 秒即超时，回退为 `^`。
- git 依赖构建时的子安装不再生成 `np-lock.json`，以免它被打进没有 `files` 字段的 git 依赖里。

## 0.0.2 (2026-10-03)

### 破坏性变更

- 除 `np` 以外的命令都合并为 `np-x <command>`：移除 `np-fetch`、`np-link`、`np-uninstall` 与 `np-update`，改用 `np-x fetch`、`np-x link`、`np-x uninstall` 与 `np-x update`。
- 入口文件 `bin/install.js` 改名为 `bin/i.js`，`bin` 只保留 `i.js`（`np`）与 `x.js`（`np-x`）；请调用 `np` / `np-x`，不要再用旧的文件路径。

### 新增

- 单个包失败（下载、子依赖或脚本）不再中止整个安装：其余的包照常安装，失败的包列在最后，退出码为 1；再次运行 `np` 会从每个包中断的地方继续（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-np/zh/docs/resume.md)）。
- `np-x rebuild` / `np --rebuild` 重新执行全部依赖或列出的 `<pkg>[@<range>]` 的 `preinstall` / `install` / `postinstall`，优先使用磁盘缓存。
- 安装结束时列出失败后被跳过的可选依赖，并给出重新执行它们的 `np-x rebuild <pkg>` 命令。
- `np-x -h` 列出命令 `install`（`i`、`add`）、`uninstall`（`un`、`remove`、`rm`、`r`）、`update`（`up`、`upgrade`）、`link`（`ln`）、`fetch` 与 `rebuild`（`rb`），`np-x <command> -h` 与 `np-x help <command>` 显示各命令的参数。

### 修复

- 已解压但子依赖或脚本还没完成的包，在安装失败或中断时不再被标记为已完成，下次安装时会执行它们的脚本。
- 子依赖失败后，下次运行不再把它的整条父包链重新解压一遍。
- 安装脚本换到另一个源重试时，续装或 `np-x rebuild` 能借助包目录里的 `.np-binary-snapshot.json`，恢复被二进制镜像改写过的文件。
- `np-x update` 期间，依赖脚本里运行的 `np <pkg>` 不再被当成不带包名的安装。
- 根包的脚本失败时，不再把 `__np_done` 写进项目自己的 `package.json`。

## 0.0.1 (2026-10-02)

### 修复

- 在非 Windows 平台上安装时，不再为每个命令额外生成 `.cmd` 与 `.ps1` 启动脚本。
- `np-uninstall` 也会删除 `.cmd` 与 `.ps1` 启动脚本（包括旧版本在 macOS / Linux 上留下的），`bin` 为字符串时也不再删错路径。
- 用 `np -g` 重装或升级全局包，或者用 `np-link` 覆盖时，删除旧版本的全部启动脚本，新版本去掉的命令不会残留。
- 本地依赖版本变化时，从 `node_modules/.bin` 里移除只有旧版本声明的命令，其他包的同名命令保留。

## 0.0.0 (2026-09-29)

首个版本。

### 破坏性变更

- 包名为 `easy-np`，命令为 `np`、`np-fetch`、`np-link`、`np-uninstall` 与 `np-update`，User-Agent 为 `easy-np/<version>`；请替换脚本里的 npminstall 命令。
- 用户配置文件是 `~/.nprc`，不再是 `~/.cnpmrc`；请把设置复制过去。
- 默认缓存为 `~/.np_tarball`，对应变量 `np_cache`，`package.json` 里的键为 `config.np`；npminstall 装出的 `node_modules` 需要删掉重装。
- 默认不再把任何包提升到根目录，npminstall 会提升名字匹配 eslint、prettier、babel 的包；要提升，设置 `--public-hoist-pattern=<regexp>` 或 `config.np.publicHoistPattern`。
- 移除 `-c`、`--china` 与 `npm_china`，改为自动切换源；删掉它们即可。
- 移除 `--custom-china-mirror-url`、`--force-link-latest`、`--disable-fallback-store` 与 `np-uninstall --ignore-scripts`；删掉它们即可。
- 移除 `--prune` 与 `config.np.prune`，因为它们的固定清单会删掉 `tsconfig.json` 这类运行时文件；删掉它们即可。
- 移除 `--proxy`、`npm_proxy`、`npm_config_proxy` 与 npm 的 `strict-ssl`，因为它们从未生效；删掉它们即可。
- 移除 `config.npminstall.env:production` / `env:development` 与 `.npmrc` 键 `np-public-hoist-pattern`，改用 `config.np.publicHoistPattern`。
- 要求 Node.js >= 16.14.0；请先升级 Node.js。

### 新增

- 在 npmmirror 与 npmjs 之间自动切换源：每次运行先测速，manifest、tgz 与依赖安装脚本失败时切换源，最多尝试 4 次；镜像上缺少的版本从官方源获取，私有源与 scope 源从不切换。
- `--refresh-cache` 忽略并覆盖缓存的 manifest 与 tgz。
- `np-fetch` / `np --fetch-only` 只下载并解压列出的包，不安装依赖、不执行脚本、不链接 bin，也不修改 `package.json`。
- `--dedup` 把每个包的最高版本链接到根 `node_modules`，效果与 npminstall@6 的扁平布局相同。
- 支持 `workspace:*`、`workspace:^`、`workspace:~` 与 `workspace:<range>`。
- `~/.nprc` 与磁盘缓存 `~/.np_tarball` 与 easy-npd 共用。

### 变更

- 被提升的包始终使用整个安装中的最高版本，与 workspace 的顺序无关；`package.json` 里声明的依赖保留声明的版本，部分安装只会升级。
- `np <pkg>` 也会读取 `config.np`，npminstall 只在不带包名时才读取。
- 所有公共源共用一份 manifest 缓存，切换源不会重新下载。
- `--tarball-url-mapping` 只改写第一个请求地址，不再声称会改写重定向。

### 修复

- `--offline` 只读磁盘缓存：缺少 tgz 时立即失败，git 依赖与 tarball 地址依赖会失败，与 `--no-cache` 同时使用会报错。
- 缓存里损坏的 tgz 会被删除并重新下载，不再每次重试都读到它。
- 流式请求收到 4xx / 5xx 响应时，不再抛出未捕获的中止错误。
- 被 `np-fetch` 或失败的安装留下、尚未完成的根包，不再因为版本相同而被跳过，完整安装会把它装完。
- 源的 token 只发给该源所在主机的请求，不再发给回退源与 tarball CDN。
- workspaces 按拓扑顺序安装并执行生命周期脚本。
- 在 workspaces 仓库里运行 `np -g`，不再删掉与某个 workspace 同名的本地 `node_modules` 目录。
- `np-update -w <name>` 只清理这一个 workspace，不再破坏共用的 `.store`。
- workspaces 项目里由根包提供的 peerDependencies，不再被报告为缺失。
- `np-uninstall` 会移除不再被任何地方使用的提升链接与 `.store/node_modules` 回退链接。
- workspace 的版本不满足声明的范围时给出警告，日志里显示指向本地 workspace 的依赖的真实目录。
- `--lockfile-path` 加载失败时报错退出，不再悄悄改为从网络解析；workspaces 项目暂不支持，会报错退出。
- 在 `npm run` / `npx` 下安装需要 `prepare` 的 git 依赖，不再被 npm 12 以 `EALLOWSCRIPTS` 拒绝；git 依赖失败时显示子进程的 stderr。
- `np-uninstall` 在 `package.json` 写入完成后才返回。
