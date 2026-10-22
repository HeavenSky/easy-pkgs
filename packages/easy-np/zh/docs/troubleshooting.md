# 故障排查

[English](../../docs/troubleshooting.md) · **简体中文**

用你看到的报错文字搜索本页即可找到解决办法。报错按打印的原文引用，路径与名称写成 `<…>`，保持英文以便搜索。用法或配置错误只打印报错信息，随后是 `np version: <version>` 与 `np argv: <command line>` 两行，退出码为 1。

## 安装 easy-np 时的报错

### `npm error code EEXIST`

- 原因：执行 `npm i -g easy-np` 时，全局已装 sindresorhus 的 [`np`](https://www.npmjs.com/package/np)，`np` 命令被它占用；npm 10 之前的版本打印 `npm ERR! code EEXIST`。
- 解决：卸载两者之一，或加 `--force` 覆盖该命令；见[避免 np 命令重名](install.md#避免-np-命令重名)。

### `npm WARN EBADENGINE Unsupported engine`

- 原因：在 Node.js 14 或 16 上，tar 7 及其依赖声明需要 Node >= 18，`type-fest` 4 声明需要 Node >= 16；npm 6 打印的是 `npm WARN notsup`。该警告属预期，不影响 easy-np 运行。
- 解决：无需处理；见[在 Node.js 14 与 16 上安装](node-versions.md#在-nodejs-14-与-16-上安装)。

### `npm ERR! code EBADENGINE`

- 原因：npm 开启了 `engine-strict`，上面的 engine 警告变成错误并中止安装；npm 6 打印的是 `npm ERR! code ENOTSUP`。
- 解决：运行 `npm i -g easy-np --engine-strict=false`，或改用 Node.js 18 及以上版本。

## 参数相关的报错

### `unknown option --prodd (did you mean --prod?), run np -h to list the options`

- 原因：参数拼错或不存在；报错会给出最接近的已知参数。`--key=value` 写法与 `--` 之后的参数不做这项检查，原样传递。
- 解决：改用提示的参数，或用 `np -h` 列出全部参数（其他子命令用 `np-x <command> -h`）。

### `no package.json in <dir>, run np-x inside a project folder or name the packages to install`

- 原因：在没有 `package.json` 的目录中运行了不带包名的 `np-x install`；不会写入任何文件。
- 解决：到项目目录中运行，或写明要装的包，例如 `np-x install esbuild`。

### `-D has been removed, use --write=dev`

- 原因：该参数来自 npminstall 或旧版 easy-np，已移除；所有已移除的参数都按 `has been removed, <replacement>` 的格式报错。
- 解决：改用报错中的替代写法；完整列表见[替换已移除的命令与参数](migrate-from-npminstall.md#替换已移除的命令与参数)。

### `--write only accepts the --write=<type> form, e.g. --write=dev`

- 原因：`--write dev` 会把下一个包名当作类型吞掉。
- 解决：写成 `--write=dev`。

### `no clientDependencies in package.json for type "client"`

- 原因：`--only`、`--include` 或 `--omit` 指定的自定义类型，在根项目与各 workspace 的 `package.json` 中都没有对应字段。
- 解决：改正类型名，或补上 `<type>Dependencies` 字段；见[选择依赖类型](install-options.md#选择依赖类型)。

## 没有执行的安装脚本

### `1 package(s) have install scripts that are not in allowScripts and were skipped:`

- 原因：`np-x install` 只在放行后才执行依赖脚本。
- 解决：审核该包，再执行下一行打印的命令，例如 `np-x approve-scripts esbuild && np-x rebuild esbuild`；见[放行依赖的安装脚本](allow-scripts.md)。

### `install scripts of <n> package(s) are not reviewed in allowScripts`

- 原因：开启了 `--strict-allow-scripts`（或 pnpm 的 `strictDepBuilds`），而有依赖既未放行也未拒绝；错误码为 `EALLOWSCRIPTS`。
- 解决：用 `np-x approve-scripts <pkg>` 放行或 `np-x deny-scripts <pkg>` 拒绝列出的包。

### `manifest mismatch <name>@<version>: package.json in the tarball declares <other>@<version>, using the registry name and version`

- 原因：tarball 自带的 `package.json` 自称是另一个包。
- 解决：确认这是不是你要的包；放行与链接都以源上的名字为准，它也无法沿用被冒充包的放行。

## 安装失败

### `✖ Install finished with <n> failed package(s)`

- 原因：部分包下载、安装子依赖或执行脚本失败，其余包已装好。
- 解决：排除汇总上方给出的原因，再运行同一条命令；见[从失败的安装继续](resume.md)。

### `script output: <cache directory>/np-script-logs/<file>.log`

- 原因：后台执行的依赖脚本失败，命令与完整输出在该日志文件中。
- 解决：查看日志，或加 `--foreground-scripts` 重跑以实时查看输出。

### `Running 1 script: frida@17.23.2 12s, downloading 6.03MB/36.45MB (16%)` 长时间不结束

- 原因：依赖的安装脚本正在下载或编译，例如下载预编译二进制。spinner 显示每个运行中脚本的耗时，以及它经 Node.js http / https 已下载的字节数；用 `fetch` 或 curl 等工具下载时只显示耗时。
- 解决：等它完成，或加 `--foreground-scripts` 重跑以查看脚本自身的输出；使用 `--detail` 或不在终端中运行时，每 10 秒为仍在运行的脚本各打印一行 `scripts.running`。

### `was compiled against a different Node.js version using NODE_MODULE_VERSION`

- 原因：原生模块是为另一个 Node.js 版本编译的。
- 解决：切换 Node.js 版本后运行 `np-x rebuild`。

## 锁文件报错

### `--frozen-lockfile requires np-lock.json in <dir>`

- 原因：项目还没有 `np-lock.json`。
- 解决：运行一次 `np-x install` 并提交 `np-lock.json`；见[在 CI 中锁定项目](lockfile.md#在-ci-中锁定项目)。

### `<pkg> is not in np-lock.json, run np-x install to update it`

- 原因：`package.json` 声明了 `np-lock.json` 没有记录的依赖。
- 解决：不带 `--frozen-lockfile` 运行 `np-x install`，提交更新后的 `np-lock.json`；失败那次运行的末尾也会这样提示：`<n> package(s) failed, run np-x install to update np-lock.json:`。

### `integrity mismatch for <url>: np-lock.json has <sha512> but got <sha512>, remove the entry from np-lock.json to accept the new content`

- 原因：tarball URL 背后的内容在锁定之后变了。
- 解决：确认新内容符合预期后，从 `np-lock.json` 删除该条目再安装。

## 离线与缓存报错

### `np ERROR --offline needs the disk cache, it can not be used with --no-cache`

- 原因：`--offline` 只读磁盘缓存，而 `--no-cache` 关闭了它。
- 解决：去掉两个参数之一。

### `Can't find package <name> manifests in offline mode`

- 原因：该包从未进入缓存；`Can't find tarball <name>@<version> in the disk cache in offline mode` 也是同样原因。
- 解决：联网安装一次，或改用 `--prefer-offline`，只有缓存中没有的包才联网。

### `Can't install <url> in offline mode: git packages are always fetched from the network`

- 原因：git 包与 tarball URL 依赖（报错为 `remote packages are always fetched from the network`）不能离线安装。
- 解决：去掉 `--offline` 后重新安装。

## node-gyp 与 Node.js 提示

### `np ERROR install it manually and point npm_config_node_gyp at it, e.g.:`

- 原因：easy-np 无法按需安装 node-gyp，通常是因为无法联网。
- 解决：执行报错打印的 `npm i -g` 命令，再按提示设置 `npm_config_node_gyp`；见[获取 node-gyp](node-versions.md#获取-node-gyp)。

### `np WARN Node v18.20.8: node-gyp < 12 (Visual Studio 2026 is unsupported), upgrade to Node >= 20.17.0 to restore`

- 原因：在这个 Node.js 版本上，easy-np 对提示中的功能使用兼容的旧实现。
- 解决：把 Node.js 升级到提示中的版本，或设 `np_node_warning=false` 隐藏这行；见[在老版本 Node.js 上运行与编译原生模块](node-versions.md)。
