# 在老版本 Node.js 上运行与编译原生模块

[English](../../docs/node-versions.md) · **简体中文**

easy-np 可在 Node.js >= 14.19.3 上运行，首次编译原生模块时自动安装兼容的 node-gyp，以免构建半路失败；编译原生模块还需要 Python 3 与 C/C++ 编译工具链。

## 在 Node.js 14 与 16 上安装

在 Node.js 14 或 16 上安装 easy-np 会打印 engine 警告，不影响 easy-np 运行：npm 7 及以上为 `npm WARN EBADENGINE`，npm 6 为 `npm WARN notsup`。警告来自 tar 7 及其依赖（`@isaacs/fs-minipass`、`minizlib`、`chownr`、`yallist`）声明的 Node >= 18，以及 urllib 引入的 `type-fest` 4 声明的 Node >= 16。

- 这些警告属预期：easy-np 在 Node 14.19.3 与 16 上实测可用；低于 16.6 时由 [`lib/runtime.js`](../../lib/runtime.js) 补齐 tar 7 需要的内置方法。包里附带 `npm-shrinkwrap.json`，用 npm 安装时整棵依赖树都按在这些 Node.js 版本上实测过的版本安装；pnpm 与 Yarn 不读这个文件，可能装到更新的小版本。easy-np 与 easy-npd 同样不读依赖包内的 `npm-shrinkwrap.json`，`np -g easy-np` 会按声明的范围重新解析。
- npm 开启了 `engine-strict` 时安装会直接失败（`npm ERR! code EBADENGINE`，npm 6 为 `npm ERR! code ENOTSUP`）。本次安装临时关闭它，例如 `npm i -g easy-np --engine-strict=false`，或改用 Node.js 18 及以上版本。

## 读懂降级提示

在老版本 Node.js 上，easy-np 把某项功能换成兼容的旧实现，每次运行打印一行，写明降级的功能与恢复所需的 Node.js 版本。

| Node.js                          | 打印的提示                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 20.17 ~ 20.x、>= 22.9            | 无                                                                                                            |
| 14.19 ~ 20.16、21.x、22.0 ~ 22.8 | `np WARN Node vX: node-gyp < 12 (Visual Studio 2026 is unsupported), upgrade to Node >= <version> to restore` |

- 目前只有 node-gyp 这一项会降级。
- 设 `np_node_warning=false` 关闭这行提示。

## 获取 node-gyp

node-gyp 不随 easy-np 安装。首次编译原生模块时，easy-np 联网安装兼容当前 Node.js 的 node-gyp 到 `<缓存目录>/np-node-gyp`，之后直接复用。

- 每个 Node.js 版本各装一份，与 easy-npd 互相独立；不再被引用且超过 1 小时的旧安装目录在下次安装时删除。
- `npm_config_node_gyp` 指向已有的 `node-gyp.js` 时直接使用它。
- 无法联网时：
    1. 全局安装 node-gyp：`npm i -g node-gyp`。
    2. 让 easy-np 使用它：`export npm_config_node_gyp="$(npm root -g)/node-gyp/bin/node-gyp.js"`。在 Windows 上，提示这一步的报错会给出 PowerShell 与 cmd.exe 的写法。

| Node.js                                       | node-gyp（依赖的安装脚本与 `binding.gyp` 构建时按需安装）                                | 已知风险                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 20.17 ~ 20.x、>= 22.9                         | `engines.node` 兼容当前 Node.js 的最新 `node-gyp`（>= 12）                               | 无                                                                                                         |
| 16.14 ~ 16.x、18.x ~ 20.16、21.x、22.0 ~ 22.8 | 同上规则，实际为 10 或 11：不识别 Visual Studio 2026                                     | 装到 10 时（16.14 ~ 16.x、18.0 ~ 18.16），node-gyp 还会经 make-fetch-happen / cacache 引入 tar 6，见下一行 |
| 14.19 ~ 16.13、17.x                           | `@electron/node-gyp` 10.2（Electron 维护的 node-gyp 10 分支）：不识别 Visual Studio 2026 | 它经 make-fetch-happen / cacache 引入的 tar 6 有未修复的安全公告，只在 node-gyp 下载 Node.js 头文件时使用  |

## 评估共有的依赖安全公告

以下安全公告在全部 Node.js 版本上都存在：

- urllib：[GHSA-hq3h-g68c-hp78](https://github.com/advisories/GHSA-hq3h-g68c-hp78) 把 urllib >= 3.0.0 <= 4.9.0 列为受影响，原因是 urllib 在跨源重定向时保留凭据请求头。easy-np 使用的 urllib 3.27.3 由 undici 5 的 `RedirectHandler` 跟随重定向，源站变化时去掉 `authorization`、`cookie` 与 `proxy-authorization`；[`test/registry/get.test.js`](../../test/registry/get.test.js) 有用例覆盖。
- urllib 3 依赖的 undici 5：安全公告集中在 WebSocket、fetch、Cookie、multipart 与 retry 拦截器，easy-np 不经过这些路径；请求走私一类需要恶意源或代理配合。
- globby 依赖的 braces / micromatch：深度嵌套的匹配模式会耗尽调用栈，easy-np 只用它匹配 `package.json` 中的 workspaces 模式。
