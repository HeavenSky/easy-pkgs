# 安装 easy-comb

[English](../../docs/install.md) · **简体中文**

这页说明怎样在项目里或全局装好 `easy-comb`，让 `csscomb` 命令可用；需要 npm 和 Node.js `^16.17.0 || >=18.3.0`。
最短的上手路径见 README 的[快速开始](../README.md#跑通第一次格式化)。

## 在项目中安装

```bash
npm install easy-comb --save-dev
npx csscomb --help
```

第二条命令打印帮助，说明 `csscomb` 命令已经指向 easy-comb。

## 全局安装

```bash
npm install easy-comb -g
```

命令名沿用 `csscomb`，所以会和全局安装的原版 `csscomb` 包冲突。

- 症状：`npm install easy-comb -g` 报 `EEXIST`。
- 原因：原版 `csscomb` 包已经占用了全局的 `csscomb` 命令。
- 解决：先运行 `npm uninstall csscomb -g`，或者加 `--force` 覆盖该命令。

## 检查 Node.js 版本

- easy-comb 需要 Node.js 16.17 及以上；不支持 Node.js 18.0 到 18.2。
- TypeScript 配置文件（`.ts`、`.cts`、`.mts`）需要 Node.js 22.18 及以上，因为它们靠 Node 内置的类型剥离加载。
- 在 CommonJS 里 `require('easy-comb')` 需要 Node.js 20.19+ 或 22.12+；更低的版本用 `import()`，见[引入包](node-api.md#引入包)。
