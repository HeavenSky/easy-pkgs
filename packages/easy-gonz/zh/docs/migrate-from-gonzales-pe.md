# 从 gonzales-pe 迁移

[English](../../docs/migrate-from-gonzales-pe.md) · **简体中文**

按本页把项目从 gonzales-pe 4.3.0 换成 easy-gonz，并找出代码可能察觉到差异的地方；前提是 Node.js 6 或更高版本。
gonzales-pe 4.3.0 能解析的输入 easy-gonz 都能解析，所以多数项目只需换个包名。
各版本的完整变化另见 [CHANGELOG](../../CHANGELOG.md)。

## 换掉依赖包

1. 替换依赖：

   ```bash
   npm uninstall gonzales-pe && npm install easy-gonz
   ```

2. 修改引用；`easy-gonz/lib/gonzales` 这类深层路径同样可用：

   ```diff
   - const gonzales = require('gonzales-pe');
   + const gonzales = require('easy-gonz');
   ```

3. 运行测试。有失败时按下面各节排查，先看[检查按节点类型遍历语法树的代码](#检查按节点类型遍历语法树的代码)。

## 沿用原有 API

API 保持不变：下面这些在 easy-gonz 中的行为与 gonzales-pe 4.3.0 完全一样。

- `require('easy-gonz')` 导出 `parse` 和 `createNode`；`easy-gonz/lib/gonzales` 是同一个模块。
- `parse` 接受同样的 `syntax`、`context` 和 `tabSize` 选项，默认值相同，另外新增了 `recover` 选项；4.3.0 的所有 `context` 取值都仍然支持。
- `Node` 的自有属性（`type`、`content`、`syntax`、`start`、`end`）相同，原型方法相同且同样可枚举，返回值也相同：`removeChild()` 返回数组，`first()` 和 `last()` 返回 `null` 或 `undefined`，回调返回 `null` 时 `forEach()` 和 `eachFor()` 返回 `null`。
- 解析错误的字段相同，仍然不是 `Error` 实例。
- `gonzales` 命令的选项和默认值不变，`--no-silent` 和 `--silent=false` 也照常可用；输入合法或遇到解析错误时，退出码与过去相同。

我们用脚本逐项对比了 easy-gonz 与已发布的 gonzales-pe 4.3.0：模块导出、`parse` 的选项与错误、`Node` 的全部方法和属性、`createNode`、`gonzales` 命令，以及 `test/corpus/` 下的语料加上官方测试集全部有效用例的语法树。
两者都能解析的输入中，多数得到完全相同的语法树，连位置字段也一样。
不同的语法树几乎都来自 sass-spec 的 SCSS 用例，主要原因是新增的 `module` 节点；其余来自下文列出的修正。

## 检查按节点类型遍历语法树的代码

下列输入 gonzales-pe 4.3.0 返回的语法树是错的，easy-gonz 返回修正后的结果。
按节点类型或子节点位置做匹配的代码可能需要调整。

- SCSS 和缩进 Sass 的模块成员：两种语法下 4.3.0 都把 `math.div(10px, 3)` 读成 `ident` `math`、`class` `.div` 和 `parentheses`；SCSS 的 `@include ns.mixin` 在 `ns` 之后就截断了，缩进 Sass 遇到其他模块成员则直接报错。**easy-gonz 返回一个 `module` 节点（内含 `ident` `math`），后面跟 `function`、`variable` 或 `ident`**，因此命名空间不再是 `value`、`include` 或 `atrule` 的直接 `ident` 子节点。用了 `@use` 的 SCSS 和缩进 Sass 代码大多会遇到这一变化。
- 带引号插值的 SCSS 字符串（`"#{"a"}"`）过去在内层引号处被截断，剩余部分成了单独的节点；现在是一个完整的 `string`。
- 科学计数法：`1e3px` 过去是 `number` `1` 加单位 `e3px`，`1.5E-2` 过去是 `number` `1.5` 加 `ident` `E-2`；现在分别是 `dimension` `1e3px` 和 `number` `1.5E-2`。指数之后数字即结束：`3e-2.1` 是 `number` `3e-2` 后跟 `number` `.1`。
- SCSS 和缩进 Sass 自定义属性的值如果不是普通值（如 `--x: {a: b}`），整个值是一个 `raw` 节点，与 Sass 和 postcss-scss 一致；CSS 和 Less 仍会把这样的值拆成 `block` 等子节点。对 SCSS，4.3.0 会把花括号解析成 `block` 和 `declaration` 节点；对缩进 Sass，4.3.0 直接报错。
- 缩进 Sass：
  - `declarationDelimiter` 保留原文写法（`;`、`\r\n`），不再一律是 `\n`。
  - 选择器在换行处结束：`a⏎b` 是两条规则，与 dart-sass 一致。
  - 嵌套块之后的顶层 `//` 注释留在顶层。
  - 以运算符、`,` 或 `not` 这类关键字结尾的行，会延续到下一行。
  - 括号跨行的选择器（`a:b(c⏎  )`）后面跟嵌套块时是 `ruleset`，不再被当成声明。
  - 顶层的 `+name` 带嵌套块时是包含该块的 `include`，与嵌套时的行为一致，不再是以 `+` 组合符开头的 `ruleset`。
- Less：
  - `@page :first {}` 是 `atrule`，不再是 `declaration`。
  - `.@{x}-class {}` 是 `ruleset`，不再是 `mixin`。
  - 反引号包裹的 JavaScript 是一个 `ident`。
  - `value` 不再吞掉后面的块：用 `context: 'value'` 解析 `a {b: c}` 时，在块之前停止。
- 以下参数过去会被截短或丢字，现在都是完整节点：含 `//` 的 `url-prefix()` / `domain()` 参数、字符串后还有其他文本的 `url()`，以及 `:has(> a)` 这类参数。
- `:nth-child(2n + 1 of .a)` 和 `:nth-last-child(… of …)` 中的 An+B 部分按 `:nth-child(2n + 1)` 的方式读取（`+` 是 `operator`），后面是 `ident` `of` 和 `selector` 列表。
- 输入末尾未闭合的注释（`/* x`）过去的结束位置超出最后一个字符；现在 `end` 就是最后一个字符。

## 继续校验 CSS 和 Less

要继续用 `parse()` 校验 CSS 或 Less，传 `recover: false`：非法输入会像 4.3.0 一样抛出解析错误，见 [gonzales.parse](api.md#gonzalesparsecss-options)。
不传时，easy-gonz 遇到非法的 CSS 和 Less 不再抛错，而是像 postcss 那样把无法识别的文本放进 `raw` 节点。
解析 SCSS 和缩进 Sass 时，easy-gonz 遇到多数非法输入仍会抛错，但能接受的合法写法比 4.3.0 多得多，例如 Sass 模块、`@include … using` 和跨行语句。

## 检查其他细小差异

- 空输入：根节点的 `syntax` 是传入的语法，不再是 `undefined`，所以 `toString()` 返回 `''`，不再打印 `Syntax "undefined" is not supported` 并返回 `undefined`。
- 解析错误的 `version`，以及其 `toString()` 中的 `Gonzales PE version:` 一行，给出的是 easy-gonz 的版本号。
- `gonzales` 命令解析文件前不再去掉首尾空白，所以位置与文件一致，结尾的换行会成为最后一个 `space` 节点；stdin 本来就不做裁剪。`--simple` 的末行是一串与最后一个节点深度对齐的短横线，不再是空行。
- `gonzales` 命令新增 `-v` / `--version`，能读取 `.SCSS` 这类大写扩展名；`--syntax` 不受支持或没有给值、文件扩展名不受支持、文件无法读取时，打印提示并以 `1` 退出，见[运行 gonzales 命令](api.md#运行-gonzales-命令)。
- 不再提供 webpack 打包的 UMD 文件，也没有浏览器全局变量 `gonzales`；要在浏览器里用，请自行打包。
- detective-sass 和 detective-scss（precinct 与 madge 依赖它们）找到的 import 不变，还能在 4.3.0 解析不了的文件里找到 import，也不再把 `math` 这类模块命名空间报告为依赖。
