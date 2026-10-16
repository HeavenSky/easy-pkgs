# 排查常见报错

[English](../../docs/troubleshooting.md) · **简体中文**

下面每一条都以 npd 输出的原文开头，随后是原因与解决办法；在本页搜索你看到的报错原文即可。

## 看懂 npd 的报错

npd 报错时先输出错误信息，再输出 npd 版本与命令行；用法与配置错误不打印调用栈。

```text
<message>
npd version: <version>
npd argv: <node> <path to npd> <arguments>
```

反馈问题时把这三行一起贴上。

## 安装 easy-npd 时 npm 报 EEXIST

```text
npm error code EEXIST
```

- 原因：另一个全局包已占用 `npd` 命令，通常是 npm 包 `npd`。
- 解决：运行 `npm i -g easy-npd --force`，见[安装 npd 并选择入口](install.md#安装命令)。

## 安装 easy-npd 时 npm 报 EBADENGINE 警告

```text
npm WARN EBADENGINE Unsupported engine
```

- 原因：在 Node.js 14 或 16 上，tar 7 及其依赖声明需要 Node 18 及以上，`type-fest` 4 声明需要 Node 16 及以上；npm 6 打印的是 `npm WARN notsup`。
- 解决：无需处理；该警告属预期，不影响 npd 运行，见[在旧版 Node.js 上运行与编译原生模块](node-versions.md#了解旧版-nodejs-上的变化)。

## 安装 easy-npd 时 npm 因 EBADENGINE 中止

```text
npm ERR! code EBADENGINE
```

- 原因：npm 开启了 `engine-strict`，上面的 engine 警告变成错误并中止安装；npm 6 打印的是 `npm ERR! code ENOTSUP`。
- 解决：运行 `npm i -g easy-npd --engine-strict=false`，或改用 Node.js 18 及以上版本。

## npd 拒绝未知参数

```text
unknown option --frozen-lockfle (did you mean --frozen-lockfile?), run npd -h to list the options
unknown option --workspaces, run npd -h to list the options
```

- 原因：参数拼错了，或者它属于其他包管理器、npd 不支持（如 `--workspaces`、`--shamefully-hoist`）。
- 解决：改用提示的参数，或者去掉它；见[只传 npd 认识的参数](install-packages.md#只传-npd-认识的参数)。

## npd 找不到 package.json

```text
no package.json in <folder>, run npd-x inside a project folder or name the packages to install
no package.json in <folder>, run npd inside a project folder or name the packages to install
```

- 原因：当前目录不是项目目录，也没有指定要安装的包。
- 解决：`cd` 进项目目录，或者写明要装的包，如 `npd lodash`。

## 部分包安装失败

```text
<n> package(s) failed, run npd again to continue from where they stopped:
```

- 原因：下载、子依赖或脚本失败；其余包已经装好。
- 解决：按每个包下面列出的原因处理，再运行一次 `npd`，见[从失败的安装中恢复](resume.md)。

## 后台安装脚本失败

```text
script output: <cache>/np-script-logs/<time>-<name>@<version>-<random>.log
```

- 原因：依赖的安装脚本在后台执行时失败，输出没有显示出来。
- 解决：打开日志文件查看命令与完整输出，或加 `--foreground-scripts` 重新运行。

## 安装脚本被跳过

```text
<n> package(s) have install scripts that are not in allowScripts and were skipped:
```

- 原因：用 `npd-x install` 时，依赖的安装脚本要放行后才执行。
- 解决：运行列表下方给出的 `npd-x approve-scripts <names> && npd-x rebuild <names>`，见[放行依赖的安装脚本](allow-scripts.md#放行被跳过的包)。

## 因脚本未审核而安装失败

```text
install scripts of <n> package(s) are not reviewed in allowScripts
```

- 原因：开启了 `--strict-allow-scripts`（或 pnpm 设置中的 `strictDepBuilds`），有依赖脚本既未放行也未拒绝；错误码为 `EALLOWSCRIPTS`。
- 解决：用 `npd-x approve-scripts` 或 `npd-x deny-scripts` 逐个处理列出的包。

## approve-scripts 找不到可放行的版本

```text
<name> has no installed version with install scripts
```

- 原因：这个包没有装在当前项目中，或者它已安装的版本都没有安装脚本。
- 解决：先安装项目，再对照跳过列表核对包名。

## 对全局安装使用 approve-scripts

```text
global installs have no project package.json, use npd-x install -g --allow-scripts=<pkg> instead
```

- 原因：全局安装没有可写入 `allowScripts` 的 `package.json`。
- 解决：带 `--allow-scripts` 重新安装，见[全局安装时放行脚本](allow-scripts.md#全局安装时放行脚本)。

## tarball 自称是另一个包

```text
manifest mismatch <name>@<version> tarball contains package.json of <other>@<version>
```

- 原因：tarball 里的 `package.json` 写的包名或版本与源上的不一致。
- 解决：无需处理；npd 链接与审核 `allowScripts` 时都用源上的名称与版本。确认这个源提供的是你预期的包。

## np-lock.json 中缺少某个包

```text
<n> package(s) failed, run npd-x install to update np-lock.json:
  - <pkg>: [<pkg>] <pkg> is not in np-lock.json, run npd-x install to update it
```

- 原因：开启了 `--frozen-lockfile`，而 `package.json` 声明了锁文件里没有的依赖。
- 解决：不带 `--frozen-lockfile` 运行 `npd-x install`，提交更新后的 `np-lock.json`，见[用 np-lock.json 锁定版本](lockfile.md)。

## --frozen-lockfile 找不到锁文件

```text
--frozen-lockfile requires np-lock.json in <folder>
```

- 原因：项目里没有 `np-lock.json`。
- 解决：运行一次 `npd-x install`，提交生成的 `np-lock.json`。

## --frozen-lockfile 与包名同用

```text
--frozen-lockfile can not be used with package arguments, they would change np-lock.json
```

- 原因：添加包会改动锁文件。
- 解决：不带 `--frozen-lockfile` 添加包，再提交锁文件。

## 离线安装找不到包

```text
Can't find package <name> manifests in offline mode
Can't find tarball <name>@<version> in the disk cache in offline mode
Can't install <spec> in offline mode: remote packages are always fetched from the network
```

- 原因：包不在磁盘缓存中，或者它是 git 或 tarball url 依赖。
- 解决：联网安装一次，见[离线安装与管理缓存](offline-and-cache.md#离线安装)。

## --offline 与 --no-cache 同用

```text
npd ERROR --offline needs the disk cache, it can not be used with --no-cache
```

- 原因：离线安装只读磁盘缓存。
- 解决：去掉其中一个参数。

## 参数已移除

```text
--<flag> has been removed, <hint>
```

- 原因：这个参数来自 npminstall 或旧版 npd，已不存在。
- 解决：按提示改写；完整列表见[从 npminstall 迁移](migrate-from-npminstall.md#替换已移除的命令参数与特性)。

## 无法安装 node-gyp

```text
npd ERROR install <spec> for node-gyp failed: <reason>
npd ERROR install it manually and point npm_config_node_gyp at it, e.g.:
```

- 原因：npd 下载不到 node-gyp，例如没有网络。
- 解决：运行报错中给出的命令，见[使用自己安装的 node-gyp](node-versions.md#使用自己安装的-node-gyp)。

## npd 告警 Node.js 版本

```text
npd WARN Node vX: <what is degraded>, upgrade to Node >= <version> to restore
```

- 原因：当前 Node.js 缺少 npd 用到的能力，npd 改用了旧实现。
- 解决：把 Node.js 升级到告警中建议的版本，或设置 `np_node_warning=false` 隐藏这一行，见[在旧版 Node.js 上运行与编译原生模块](node-versions.md)。

## npd 告警不支持 workspaces

```text
npd WARN workspaces are not supported, only dependencies of <project>/package.json are installed
```

- 原因：npd 不支持 npm workspaces。
- 解决：这个项目改用 [easy-np](../../../easy-np/zh/README.md)。

## 在代理后或使用自定义 CA 时请求失败

- 原因：npd 或它启动的进程缺少代理或 CA 设置。
- 解决：传 `--proxy` / `--https-proxy` 与 `--cafile`，或写进 `~/.nprc`；npd 会把它们传给安装脚本、node-gyp 与 git，见[选择源与网络设置](registry.md#使用代理或自定义-ca)。
