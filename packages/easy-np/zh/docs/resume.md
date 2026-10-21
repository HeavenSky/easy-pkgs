# 从失败的安装继续

[English](../../docs/resume.md) · **简体中文**

再运行一次同一条命令，easy-np 就会把失败或中断的安装接着装完，不必从头再来；两个入口、每个 workspace 以及一次装多个包的 `np -g` 都适用。

## 失败后继续安装

1. 读失败那次运行末尾的汇总。应看到：`✖ Install finished with <n> failed package(s)`、失败包的列表，退出码为 1。
2. 排除原因，例如网络问题或缺少编译工具。
3. 再次运行同一条命令，例如 `np`。应看到：easy-np 从停下的地方继续；不需要删除 `node_modules`。

## 失败时会发生什么

- 一个包失败（下载、子依赖或脚本失败）不中止整次安装：其余包照常安装，结束时列出全部失败的包。
- 有依赖失败时跳过根包自身的生命周期脚本，下次安装成功后再执行。
- 再次运行时不重新下载解压，已成功的脚本不再执行。
- 可选依赖本身或它的子依赖失败时与 npm 一样只跳过这个可选依赖（它的子依赖的脚本失败时，已链接的可选依赖会被撤掉）；结束时列出它们和重跑脚本的 `np-x rebuild <pkg>` 命令。
- 每个包的进度记录在 `node_modules/.store/.np-state.json`，依次经过 `deps`、`preinstall`、`install`、`postinstall`、`finish` 阶段；本次运行没有失败时统一清除。
- easy-np 不修改已安装包自己的 `package.json`。
- 切换 Node.js 版本后用 `np-x rebuild` 重新编译原生模块；普通的失败或中断不需要 rebuild。
