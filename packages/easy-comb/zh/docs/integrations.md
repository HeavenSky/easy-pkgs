# 在 CI、提交前和编辑器中运行 easy-comb

[English](../../docs/integrations.md) · **简体中文**

这页把 easy-comb 接进 CI 任务、提交前钩子和编辑器，让未格式化的样式表进不了主分支；前提是项目里已经[装好 easy-comb](install.md)。

## CI 中发现未格式化文件就失败

```bash
npx csscomb --lint --verbose src/styles
```

只要有文件需要改动，命令就以 `1` 退出，CI 步骤随之失败；以 `!` 开头的行列出要修的文件，见[只检查不修改](command-line.md#只检查不修改)。

## 用 lint-staged 修复暂存文件

把下面这段加进 `package.json`，每次提交前由 [lint-staged](https://github.com/lint-staged/lint-staged) 格式化暂存的样式表：

```json
{ "lint-staged": { "*.{css,scss,less,sass}": "csscomb" } }
```

lint-staged 把暂存文件的路径传给 `csscomb`，由它就地修复。

## 在编辑器中保存时格式化

```bash
npx csscomb -t path/to/file.scss
```

任何能在保存文件时运行命令的编辑器或工具，都可以用保存文件的路径运行这条命令。
如果工具通过管道启动 `csscomb`，应传 `-t`（`--tty-mode`），这样 easy-comb 只处理给定路径，不会等待标准输入。
要格式化编辑器里尚未保存的 CSS，就从标准输入传入并加 `-`；标准输入一律按 CSS 解析，见[格式化标准输入](command-line.md#格式化标准输入)。
在自己的 JavaScript 里格式化，用 [Node.js API](node-api.md)。
