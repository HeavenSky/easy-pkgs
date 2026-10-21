# 在 Node.js 中使用 easy-comb

[English](../../docs/node-api.md) · **简体中文**

这页讲怎样在自己的脚本里格式化和检查文件与字符串；前提是项目里已经[装好 easy-comb](install.md)。
包是带 TypeScript 类型声明的 ES 模块，完整签名见 [src/core.ts](../../src/core.ts) 和 [src/csscomb.ts](../../src/csscomb.ts)。

## 引入包

```js
import Comb from "easy-comb";
```

在 CommonJS 里用 `const { default: Comb } = await import('easy-comb')` 加载。
Node.js 20.19+ 和 22.12+ 上也可以 `require('easy-comb')`，类在返回值的 `.default` 上。

## 格式化文件和字符串

```js
import Comb from "easy-comb";

const comb = new Comb(await Comb.getCustomConfig()); // 最近的配置文件
await comb.processPath("assets/css");

const css = await new Comb("csscomb").processString("a{color:#FFF}");
```

`new Comb(config?)` 创建一个注册了全部内置选项的实例。
`config` 是配置对象，或者传 `'csscomb'` 使用内置配置；不传时所有选项都不生效。

## 实例方法

除 `configure` 和 `use` 返回实例本身外，实例方法都返回 Promise。

| 方法                                                                                              | 结果                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `processPath(path)`、`processDirectory(path)`、`processFile(path)`                                | 就地修复文件。`processFile` 在文件改动时返回 `1`，未改动返回 `0`，文件被跳过（扩展名不支持或命中 `exclude`）时返回 `undefined`；`processDirectory` 返回由 `1`/`0` 组成的数组，每个文件一项；`processPath` 对文件的返回同 `processFile`，对目录的返回同 `processDirectory`。 |
| `processString(text, {syntax, filename})`                                                         | 返回修复后的字符串。`syntax` 取 `css`、`less`、`sass` 或 `scss`，默认 `css`。                                                                                                                                                                                               |
| `lintPath(path)`、`lintDirectory(path)`、`lintFile(path)`、`lintString(text, {syntax, filename})` | 返回错误数组；`lintDirectory` 以及对目录调用的 `lintPath` 返回每个文件一个这样的数组。见[读取 lint 错误](#读取-lint-错误)。                                                                                                                                                 |
| `configure(config)`                                                                               | 应用一份配置。非法取值和未知选项用 `console.warn` 提示后忽略。`exclude` 相对当前目录。                                                                                                                                                                                      |
| `use(option)`                                                                                     | 注册自定义选项，见 [`OptionDefinition`](../../src/option.ts)。                                                                                                                                                                                                              |

## 静态方法

| 方法                                                                       | 结果                                                                                                                               |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Comb.getConfig(name?)`                                                    | 内置配置的副本；`name` 只能是 `'csscomb'`。                                                                                        |
| `Comb.getCustomConfig(path?)`                                              | 返回 Promise，内容是从 `path` 或[最近的配置文件](configuration.md#easy-comb-去哪里找配置)加载的配置；找不到或加载失败时为 `null`。 |
| `Comb.getCustomConfigPath(path?)`                                          | `getCustomConfig()` 会加载的配置文件路径，或 `null`。                                                                              |
| `Comb.detectInFile(path, options?)`、`Comb.detectInString(text, options?)` | 从样式表中检测到的选项；`options` 是选项名列表，用来限定检测哪些选项。                                                             |

`getCustomConfig()` 不处理 `template`；只有 `csscomb` 命令会用[模板样式表](detect-config.md#用-template-补齐未设置的选项)补齐选项。

## 读取 lint 错误

每个错误形如 `{message, line, column, context, option?}`；`line` 和 `column` 从 1 开始，`context` 展示前后几行代码。

- `always-semicolon` 对每处缺失的分号报一个错误，不带 `option`。
- 其他选项各自单独运行一遍来检查。如果会改动代码，就报一个错误，`option` 为选项名，位置是第一处改动。
- 只有完整配置在同一位置也会改动代码时，才报告该选项，所以相互配合的选项不会误报。比如 `space-after-opening-brace` 重置了空白、`block-indent` 又重新缩进，只要最终输出不变，两者都不报告。

命令行的 `--lint` 不使用这些错误：它报告的是 `processPath` 会改动的所有文件。
