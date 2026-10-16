# 用命令行格式化和检查文件

[English](../../docs/command-line.md) · **简体中文**

这页讲怎样用 `csscomb` 命令就地修复样式表、格式化标准输入，以及只检查不修改；前提是已经[装好 easy-comb](install.md)。
在项目里运行时，命令前加 `npx`。

## 就地修复文件

```bash
csscomb src/styles/main.scss src/styles/components
```

文件和目录可以传任意多个，目录会递归处理。
easy-comb 处理扩展名为 `.css`、`.less`、`.sass`、`.scss` 的文件；其他扩展名用 `syntax` 添加，见[配置 easy-comb](configuration.md#选项之外的配置项)。
不传 `--config` 时，选项取自[最近的配置文件](configuration.md#easy-comb-去哪里找配置)，找不到就用内置配置。

## 格式化标准输入

```bash
cat main.css | csscomb -
```

格式化结果输出到标准输出。
标准输入一律按 CSS 解析，没有参数可以指定其他语法；要格式化 Less、SCSS 或 Sass，请改为传文件路径。
以下两种情况 easy-comb 会读标准输入：唯一的参数是 `-`；没有路径参数且标准输入不是终端。
加 `-t`（`--tty-mode`）后永远不读标准输入。编辑器等工具通常通过管道启动 `csscomb`，这时应加 `-t`。

## 只检查不修改

```bash
$ csscomb -lv assets/css
! assets/css/forms.scss
! assets/css/buttons.scss
  assets/css/main.scss
3 files processed
0 files fixed
```

`--lint`（`-l`）不改动任何文件，有文件需要改动时以 `1` 退出，否则以 `0` 退出。
加 `--verbose`（`-v`）会逐个打印处理过的文件：`!` 表示需要改动，`✓` 表示已经修复，留空表示本来就已格式化。

## 查阅命令行参数

| 参数 | 作用 |
| --- | --- |
| `-c, --config <path>` | 用这份配置文件，不再自动查找。可以是任一种[配置文件格式](configuration.md#easy-comb-去哪里找配置)，也可以是 `.css` 文件，此时[检测它的风格作为配置](detect-config.md#把样式表直接当配置)。 |
| `-d, --detect <file>` | 以 JSON 打印从样式表中检测到的选项后退出，见[从样式表生成配置](detect-config.md)。 |
| `-l, --lint` | 报告需要改动的文件，但不修改；有这样的文件时以 `1` 退出。 |
| `-v, --verbose` | 打印每个处理过的文件和汇总。 |
| `-t, --tty-mode` | 永远不读标准输入。 |
| `-h, --help` | 显示帮助后退出。 |
| `-V, --version` | 打印 easy-comb 的版本号后退出。 |

`--config` 指向的文件不存在时报 `Configuration file <path> was not found.` 并停止；文件加载失败时报 `Error parsing configuration file <path>.`，后面跟着原因。两种情况都以 `1` 退出。
`--config` 或 `--detect` 没跟值时打印 `Option --config requires a <path> argument.`（`--detect` 则是 `<file>`），并以 `1` 退出。

## 看懂退出码

- `0`：运行成功；加 `--lint` 时表示没有文件需要改动。
- `1`：加 `--lint` 时表示至少有一个文件需要改动；或者运行因错误中止，比如路径不存在、配置文件不存在或加载失败、参数缺少取值。
- 标准输入是终端时不带路径运行 `csscomb`，也返回 `1`；此时打印帮助，而不是等待输入。
- `2`：遇到未知参数，不处理任何文件。

easy-comb 在处理之前先检查所有路径是否存在，所以不会因为某个路径不存在而只处理了一半文件。

## 排查常见报错

**`Unknown option '--lnt'.`，后面跟着帮助文本**

- 原因：参数拼错了，或者根本没有这个参数；easy-comb 以 `2` 退出，不处理任何文件。
- 解决：改正参数；`csscomb --help` 列出了所有参数。

**`File or directory nope.css was not found.`**（加 `--detect` 时是 `File nope.css was not found.`）

- 原因：命令行传入的路径相对当前目录不存在。
- 解决：改正路径，或者到路径所相对的目录下运行命令。

**`Cannot load TypeScript config <path>: …`**

- 原因：Node 的类型剥离无法加载这份 TypeScript 配置。
- 解决：见[修复加载失败的 TypeScript 配置](configuration.md#修复加载失败的-typescript-配置)。
