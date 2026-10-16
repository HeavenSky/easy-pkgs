# 从失败的安装中恢复

[English](../../docs/resume.md) · **简体中文**

安装失败或被中断后不用删除 `node_modules`：再运行一次 `npd` 就会接着装。这适用于全部安装命令，包括一次装多个包的 `npd -g`。

## 从中断处继续

1. 运行 `npd`。预期：有包失败（下载、子依赖或脚本）时其余包照常安装，结束时输出 `<n> package(s) failed, run npd again to continue from where they stopped:`，随后列出失败的包，退出码为 1。
2. 按每个包后面给出的原因处理，例如网络问题或缺少编译工具。
3. 再次运行 `npd`。预期：各包从停下的阶段继续；不重新解压，已成功的脚本不再执行。

- 有依赖失败时跳过根包自身的生命周期脚本，等下次安装成功后再执行。
- 可选依赖或它的子依赖失败时，与 npm 一样只跳过它，不计入失败；npd 会列出它们，并给出重跑脚本的 `npd-x rebuild <pkg>` 命令。
- 按 Ctrl-C（SIGINT）或收到 SIGTERM 时，结束正在运行的 git 进程（先 SIGTERM，1 秒后强制结束），以 130 / 143 退出；下次运行同样接着装。

## 了解进度如何记录

每个包所处的阶段记录在 `node_modules/.npd-state.json`（全局安装为 `.<name>_npd/.npd-state.json`）；不修改依赖包自己的 `package.json`。

- 阶段依次为 `preinstall`、`deps`、`install`、`postinstall` 与 `finish`。
- install / postinstall 在全部依赖安装完后才统一执行。
- 本次运行装过的包，要等全部脚本成功后才统一清除阶段记录。
- 重新解压或复制一个包之前先把它标为未完成，只解压了一半的目录不会被当作已安装。
- npminstall 装出的 `node_modules` 被视为未完成；第一次用 npd 安装前先删除它，见[从 npminstall 迁移](migrate-from-npminstall.md)。
- 切换 Node.js 版本后运行 `npd-x rebuild` 重新编译原生模块；普通的失败不需要它。
