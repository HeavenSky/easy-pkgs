# 在旧版 Node.js 上运行与编译原生模块

[English](../../docs/node-versions.md) · **简体中文**

npd 支持 Node.js 14.19.3 及以上版本，在旧版本上改用兼容的旧实现，并且只在原生模块需要时才安装 node-gyp；编译原生模块需要 Python 3 与 C/C++ 编译工具链。

## 了解旧版 Node.js 上的变化

在旧版 Node.js 上，npd 改用兼容的旧实现，每次运行打印一行：`npd WARN Node vX: <what is degraded>, upgrade to Node >= <version> to restore`。

- `np_node_warning=false` 关闭这一行。
- 版本划分定义在 [`lib/runtime.js`](../../lib/runtime.js) 的 `CAPABILITIES` 中。
- 告警中建议的版本按这些范围计算，例如 Node 21.x 上建议升级到 22.9.0；预发布版 Node.js 按其正式版判断。

| Node.js                                       | 安装脚本与 `binding.gyp` 构建使用的 node-gyp                            | 已知风险                                                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 20.17 ~ 20.x、22.9 及以上                     | `node-gyp` 12 及以上（按 `engines.node` 选兼容的最新版本）              | 无                                                                                                      |
| 16.14 ~ 16.x、18.0 ~ 20.16、21.x、22.0 ~ 22.8 | `node-gyp` 10 / 11（按 `engines.node` 选择）；不识别 Visual Studio 2026 | node-gyp 10 依赖的 tar 6 有未修复的安全公告，只在 node-gyp 下载 Node.js 头文件时使用                    |
| 14.19 ~ 16.13、17.x                           | `@electron/node-gyp` 10.2；不识别 Visual Studio 2026                    | 经 make-fetch-happen / cacache 引入的 tar 6 有未修复的安全公告，只在 node-gyp 下载 Node.js 头文件时使用 |

npd 自身用的 tar 7 及其依赖声明需要 Node 18 及以上，urllib 引入的 `type-fest` 4 声明需要 Node 16 及以上，但它们在 Node 14.19.3 与 16 上可用；低于 Node 16.6 时，由 `lib/runtime.js` 补上它们需要的内置方法（`String.prototype.replaceAll`、`Array.prototype.at`）。包里附带 `npm-shrinkwrap.json`，用 npm 安装时整棵依赖树都按在这些 Node.js 版本上实测过的版本安装；pnpm 与 Yarn 不读这个文件，可能装到更新的小版本。
因此在 Node 14 与 16 上，`npm i -g easy-npd` 会打印 `EBADENGINE` 警告（npm 6 为 `notsup`），属预期，不影响 npd 运行。开启了 npm 的 `engine-strict` 时则无法安装；运行 `npm i -g easy-npd --engine-strict=false`，或改用 Node.js 18 及以上版本。

## 让 npd 按需安装 node-gyp

npd 不依赖 node-gyp：安装脚本或 `binding.gyp` 构建第一次调用 `node-gyp` 时，npd 把上表对应的版本安装到缓存目录（默认 `~/.np_tarball`，随 `np_cache` / `npm_config_cache` 改变）下的 `npd-node-gyp/`，之后同一 Node.js 版本直接复用。

- 安装沿用当前的源与代理，10 分钟超时，日志只写 stderr。
- 每次安装 node-gyp 后，npd 删除 `npd-node-gyp/` 中超过 1 小时且没有任何 Node.js 版本使用的目录，例如中断的安装留下的目录。
- 设置了 `npm_config_node_gyp` 且指向的文件存在时，总是使用它。

## 使用自己安装的 node-gyp

npd 无法安装 node-gyp（断网或安装失败）时，以退出码 1 结束，并按当前平台打印下面的命令。

1. 全局安装 node-gyp：`npm i -g node-gyp`；Node 14.19 ~ 16.13 与 17.x 上改为 `npm i -g @electron/node-gyp@^10.2.0-electron.2`。
2. 让 npd 使用它：`export npm_config_node_gyp="$(npm root -g)/node-gyp/bin/node-gyp.js"`；Windows 上报错信息会给出 PowerShell 与 cmd.exe 的写法。
3. 重新安装。预期：npd 使用这个 node-gyp，不再尝试自行安装。

## 了解哪些依赖安全公告不影响 npd

undici 5 的安全公告涉及的代码路径 npd 都不使用：WebSocket、fetch、Cookie、multipart 与 retry 拦截器（undici 5 随 urllib 3 引入）。

- 请求走私一类的安全公告需要恶意的源或代理配合才能利用。
- [GHSA-hq3h-g68c-hp78](https://github.com/advisories/GHSA-hq3h-g68c-hp78) 指出 urllib 在跨源重定向时保留带凭据的请求头。npd 使用的 urllib 3.27.3 由 undici 的 `RedirectHandler` 跟随重定向，源站变化时会去掉 `authorization`、`cookie` 与 `proxy-authorization`；[`test/registry/get.test.js`](../../test/registry/get.test.js) 有用例覆盖。
