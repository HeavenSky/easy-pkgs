# 更新日志

[English](../CHANGELOG.md) · **简体中文**

easy-gonz 基于 [tonyganch/gonzales-pe](https://github.com/tonyganch/gonzales-pe) 4.3.0（dev 分支上的提交 `ab2e8ae`），更早的上游版本见 [gonzales-pe CHANGELOG](https://github.com/tonyganch/gonzales-pe/blob/dev/CHANGELOG.md)。

0.0.1 列出相对 gonzales-pe 4.3.0 的全部变化，之后的版本只列出相对上一版的变化。

## 0.0.3 (2026-10-21)

### 修复

- 缩进 Sass：用制表符缩进的注释现在会延续到后面缩进更深的行，与用空格缩进时一致；过去它在第一行就结束，后续行被当成代码解析。
- 缩进 Sass：含 `?` 的无引号 `url()`（如 `@import url(//fonts.googleapis.com/css?family=Open+Sans)`）不再解析失败；SCSS 本来就能解析（csscomb #242）。
- 不传节点调用 `stringify` 时，现在报 `stringify expects a node, got <value>`，不再报 `We need tree to translate`。

## 0.0.2 (2026-10-16)

### 破坏性变更

- 缩进 Sass 中原本就能解析的 `math.div(1, 2)` 等模块成员调用，现在与 SCSS 一样是一个 `module` 节点后跟一个 `function`（过去是 `ident` + `class` + `parentheses`）。迁移方法：原来匹配命名空间 `ident` 的地方改为匹配 `module` 节点，见[检查按节点类型遍历语法树的代码](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-gonz/zh/docs/migrate-from-gonzales-pe.md#检查按节点类型遍历语法树的代码)。

### 新增

- `-v` / `--version` 打印包的版本号（[运行 gonzales 命令](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-gonz/zh/docs/api.md#运行-gonzales-命令)）。

### 修复

- 缩进 Sass 中的模块成员，如 `math.$pi`、`ns.$var: 1`、`+ns.foo` 和 `@include ns.foo`，现在与 SCSS 一样解析成 `module` 节点，不再抛错。
- 在 Node ESM 中可以写 `import { parse, createNode } from 'easy-gonz'`；`require('easy-gonz')`、默认导入和 `lib/gonzales.js` 不变。
- `parse(css, { context: 'namespace' })` 在所有语法下都返回 `namespaceSeparator` 节点，不再返回 `type` 为 `undefined` 的节点。
- `gonzales` 命令向管道写出大量内容时不再被截断。
- `--syntax` 的取值不受支持或缺失、文件扩展名不受支持、文件无法读取时，`gonzales` 命令打印易读的提示并以退出码 1 退出，不再抛出 TypeError 或静默退出。
- `gonzales` 命令能读取 `.SCSS`、`.CSS` 这类大写扩展名的文件。

## 0.0.1 (2026-10-16)

首个版本，可直接替换 gonzales-pe 4.3.0，见[从 gonzales-pe 迁移](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-gonz/zh/docs/migrate-from-gonzales-pe.md)。

### 破坏性变更

- 包名改为 `easy-gonz`，版本号从 0.0.1 重新起算；命令仍是 `gonzales`，API 不变。迁移方法：运行 `npm install easy-gonz`，把 `require('gonzales-pe')` 换成 `require('easy-gonz')`（深层路径改为 `easy-gonz/lib/gonzales`）。
- CSS 和 Less 遇到非法输入不再抛错，无法识别的文本变成 `raw` 节点。迁移方法：给 `parse` 传 [`recover: false`](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-gonz/zh/docs/api.md#gonzalesparsecss-options)，恢复原来的抛错行为。
- SCSS 的模块成员变成一个 `module` 节点后跟 `function`、`variable` 或 `ident`：`math.div(1px, 2)` 过去是 `ident` + `class` + `parentheses`，`@include ns.mixin` 过去在 `ns` 之后就被截断。迁移方法：原来匹配命名空间 `ident` 的地方改为匹配 `module` 节点。
- SCSS 自定义属性的值不是普通值时（`--x: {a: b}`），整个值是一个 `raw` 节点，不再拆成 `block` 和 `declaration` 节点。迁移方法：从 `raw` 节点的 `content` 读取值。
- 4.3.0 解析出错误语法树的其他输入，现在得到修正后的语法树，包括科学计数法、SCSS 字符串中带引号的插值、缩进 Sass 的行尾和部分 Less 语句。迁移方法：如果代码按节点类型做匹配，对照[检查按节点类型遍历语法树的代码](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-gonz/zh/docs/migrate-from-gonzales-pe.md#检查按节点类型遍历语法树的代码)中的列表逐项检查。
- 不再提供 webpack 打包的 UMD 文件和浏览器全局变量 `gonzales`；`main` 改为 `src/gonzales.js`。迁移方法：要在浏览器中使用，用自己的打包工具打包 `easy-gonz`。
- 需要 Node.js 6 或更高版本（gonzales-pe 声明的是 `>=0.6.0`）。迁移方法：在 Node.js 6+ 上运行。
- 解析错误的 `version` 字段，以及其 `toString()` 中的 `Gonzales PE version:` 一行，给出的是 easy-gonz 的版本号。迁移方法：不要拿这个值和 gonzales-pe 的版本号比较。
- `gonzales` 命令不再去掉文件输入的首尾空白，所以位置与文件一致，结尾的空白成为最后一个 `space` 节点；`--simple` 的末行是一串短横线，不再是空行。迁移方法：需要原来的位置时，先去掉文件的首尾空白，再用 `-` 通过管道输入。

### 新增

- SCSS 能解析 Sass 模块成员：`math.div()`、`math.$pi`、`@include ns.mixin`、参数中的 `ns.fn()` 和 `ns.$var`，以及 `ns.$var: 1`（#319）；命名空间是新增的 `module` 节点，见[节点类型](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-gonz/zh/docs/node-types.md)。
- CSS 能解析原生嵌套：嵌套规则（`.a { .b {} }`、`.a { > .b {} }`）是 `block` 下的 `ruleset` 节点，`&`（`&:hover`、`.b &`、`@scope (&)`、`@supports selector(&)`）与 SCSS 一样是 `parentSelector`。
- CSS 能解析媒体查询的范围语法（`(width >= 0)`、`(400px <= width <= 700px)`），比较运算符是 `operator` 节点。
- CSS 把相对选择器（`:has(> a)`、`:has(+ a, ~ b)`）解析成 `arguments` 下的 `selector` 节点。
- CSS 把其他选择器参数也解析成节点：`:nth-child(… of S)`、自定义标识符（`:state(--foo)`、`::part(--foo)`）、数字列表（`:heading(1, 2)`）以及其他任意伪类或伪元素参数（`::part(label)`），还有草案中的类名前缀选择器 `.foo-*`。
- CSS 遇到非法输入时按 CSS Syntax 规范恢复，不再抛错：到结尾仍未闭合的块、括号、字符串和转义，多余的 `}`，以及非法的选择器和声明，都按 postcss 的规则变成 `raw` 节点（[`parse`](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-gonz/zh/docs/api.md#gonzalesparsecss-options)）。
- CSS 接受空声明（`a{b:}`、`a{foo:;}`），它们带一个空的 `value` 节点。
- CSS 接受任意大小写的 `!important`，`!` 与 `important` 之间也可以有空白或注释。
- CSS 能解析科学计数法（`12e2`、`1E-3`、`34e+1%`），指数部分在 `number` 节点之内。
- CSS 把值和函数参数中的 `{}` 块（`--x: { a }`、`paint(foo, {})`）解析成 `block` 节点。
- CSS 自定义属性声明优先于形状相同的规则（`--x:hover { }` 是声明），值一直延续到 `;` 或块的结尾，并且可以写在顶层。
- CSS 把值中的 at-keyword（`@rgba()`）解析为 `atkeyword`，把零散的 `!`、`.`、`<`、`>` 和不配对的括号解析为 `operator` 节点。
- CSS 接受顶层的 `<!--` 和 `-->`（`raw` 节点）、没有选择器的规则（`{}`）、不是标识符的 id（`#1`、`#-2`），以及作为类型选择器的 `--foo`。
- CSS 和 SCSS 与 Less 一样接受 IE 属性 hack `*zoom`，`*` 算在属性的 `ident` 里。
- SCSS 能解析剩余参数（`1...`、`[1, 2]...`、`(a b)...`，其中 `...` 是 `operator`）和 `@include … using (…)`。
- SCSS 接受连续的组合符和以组合符开头的选择器（`> > a`、`a ~ > b`）。
- SCSS 也接受上面列出的 CSS 选择器参数、`.foo-*`、`--foo` 类型选择器、任意大小写的 `!important` 和科学计数法。
- SCSS 自定义属性声明优先于形状相同的规则；能按普通值解析的值保持原有结构，其他值（`--x: {a: b}`、空值、`foo!bar`）变成一个 `raw` 节点。
- 特殊函数和 @ 规则括号里的内容不是普通参数时（`-a-calc(@#$)`、`@supports (a !&$;{…})`），SCSS 把它原样保存为一个 `raw` 节点。
- SCSS 能解析纯 CSS 函数 `@function --name()`（其 `result` 中可以是任意 token），以及插值里的 `/* */`。
- Less 能解析块内的 mixin 定义，包括 guard、`...` 和匿名的 `.()`。
- Less 把语句级的函数调用（`each(…);`）解析为 `function` 节点，把 `$prop` 属性访问解析为 `ident` `$prop`。
- Less 能解析 `${x}` 插值（`interpolation`），选择器、@ 规则前导部分和属性名中的 `@{}` 插值，以及 `@{map[key]}` 查找。
- Less 能解析 `--x` 自定义属性（第一个子节点是 `customProperty`，值可以为空或包含块）以及属性合并 `+:` / `+_:`（`operator`）。
- Less 能解析块内的关键帧 `0% {}`、`^` / `^^` 组合符、反引号 JavaScript、`*zoom` 这类属性名 hack，以及以数字开头的类名和变量名。
- 其他语句 Less 都按 postcss 的规则兜底：带块的是 `ruleset` 或 `atrule`（`raw` 加 `block`），带冒号的是 `declaration`（`property` 和 `value` 里各一个 `raw`），其余是 `atrule` 或 `include`（`raw`），所以 Less 遇到非法输入也不再抛错。
- 语句没写完就换行时，缩进 Sass 把下一行接到同一条语句里：在圆括号和方括号内，行尾是逗号、运算符、`:` 或未写完的 @ 规则，以及下一行只能以续行关键字开头时都是如此；这些换行是语句内的 `space` 节点。
- 缩进 Sass 接受以 `;` 结尾的语句，`declarationDelimiter` 保留原文写法（`;`、`\n`、`\r\n`、`\r`、`\f`），不再一律是 `\n`。
- 缩进 Sass 接受值中间的 `/* */`、`@include … using (…)`、剩余参数前的空白（`$b ...`），以及没有主体的 `=a`。
- 缩进 Sass 能解析嵌套属性（`b: c` 下缩进更深的 `d: e`，值里带一个 `block`）、自定义属性值中的花括号（`raw`）以及 `\:nth-child()`。
- 缩进 Sass 把独占一行、没有子块的样式规则（`a`）解析成只含 `selector` 的 `ruleset`。
- `parse` 新增选项 [`recover`](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-gonz/zh/docs/api.md#gonzalesparsecss-options)（默认 `true`）：设为 `false` 时，CSS 和 Less 不做恢复，抛出 gonzales-pe 4.3.0 的解析错误。
- `gonzales.d.ts` 中自带 TypeScript 类型声明（[API 参考](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-gonz/zh/docs/api.md)）。

### 变更

- 包没有运行时依赖：去掉了 minimist，`gonzales` 命令自行解析参数，用法不变。
- 缩进 Sass 的选择器在换行处结束（`a⏎+ b` 和 `@extend .a⏎.c` 都是两条语句），与 dart-sass 一致。
- 选择器行以组合符结尾时（`a >⏎b`），缩进 Sass 在该组合符处结束语句，与 dart-sass 一致；声明值末尾的运算符仍会让声明延续到下一行。

### 修复

- 属性名和类名中的 Less 插值（`padding-@{side}`、`.btn-@{size}`）不再抛错。
- Less 的 `url('a' b)` 保留字符串之后的文本。
- 以数字开头的 Less 变量名（`@2x`）和选择器插值（`@{selector} {}`）不再抛错（#75）。
- Less 格式化函数 `%()` 不再抛错（#141、#142）。
- Less mixin guard 和 CSS guard（`when`）不再抛错（#121、#146）。
- 以 `&` 结尾的 Less 选择器（`input&`、`input[type=button]&`）不再抛错（#124）。
- Sass 无引号的 `@import ../a` 和 `@import ~a` 不再抛错（#204）。
- 带引号插值的 SCSS 和 Sass 字符串（`"a #{"b"}"`）不再被截断（#239）。
- 以 `$--` 开头的 SCSS 和 Sass 变量不再抛错（#296）。
- CSS 和 SCSS 选择器中多余的逗号（`a,, b`）不再让解析器崩溃（#238）。
- 顶层嵌套块之后隔一个空行的顶层 `//` 注释，Sass 会把它留在顶层，不再挪进那个块（#266）。
- 含空行或 `*/` 独占一行的 Sass 多行注释不再抛错（#252）。
- CSS 的 `url()` 里字符串后还有其他内容或含空白时（`url('a' b)`、`url(a b)`），不再让解析器卡死，而是作为普通函数解析。
- 空输入保留其 `syntax`，所以 `toString()` 返回 `''`，不再打印 `Syntax "undefined" is not supported` 并返回 `undefined`。
- CSS、Less 和 SCSS 输入末尾未闭合的注释（`/* x`）原样输出，不再多出 `*/`；缩进 Sass 中单独一个 `/*` 的结束位置也正确了。
- CSS 和 SCSS 中的数字在指数之后结束：`3e-2.1` 是 `number` `3e-2` 后跟 `number` `.1`，不再是一个数字。
- `:nth-child(An+B of S)` 和 `:nth-last-child(An+B of S)` 中的 An+B 按 `:nth-child(2n + 1)` 的方式读取（`+` 是 `operator`，不是 `combinator`），后面是 `ident` `of` 和 `selector` 列表；Less 不再退回 `raw`，缩进 Sass 也不再把它读成声明。
- SCSS 不再把 `url-prefix()`、`domain()` 和大写 `URL()` 里的 `//` 当成注释。
- 伪类括号跨行的选择器（`a:b(c⏎  )`）后面跟嵌套块时，缩进 Sass 把它解析成 `ruleset`，不再当成声明。
- 带嵌套块的顶层 `+name`，缩进 Sass 解析成包含该块的 `include`，与嵌套时一致；`+ a` 和 `+.a` 仍是选择器。
- `gonzales --simple` 输出末行时不再引用未定义的变量，帮助文本里的命令名也拼写正确了。
