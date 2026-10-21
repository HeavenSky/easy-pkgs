# 更新日志

[English](../CHANGELOG.md) · **简体中文**

easy-comb 基于 [csscomb/csscomb.js](https://github.com/csscomb/csscomb.js) 4.3.0（提交 `ce7ad83`），更早的上游版本见 [csscomb CHANGELOG](https://github.com/csscomb/csscomb.js/blob/master/CHANGELOG.md)。

0.0.1 列出相对 csscomb 4.3.0 的全部变化，之后的版本只列出相对上一版的变化。

## 0.0.4 (2026-10-21)

### 变更

- 对 easy-gonz 的依赖范围从 `^0.0.2` 改为 `~0.0.2`，easy-gonz 发布补丁版本后不必等 easy-comb 发新版就能装上。

### 修复

- `~0.0.2` 会装上 easy-gonz 0.0.3，它修复了缩进 Sass 的两个问题：用制表符缩进的多行注释保持完整，后续行不再被拆出去挪走；含 `?` 的无引号 `url()`（如 `@import url(//fonts.googleapis.com/css?family=Open+Sans)`）能正常格式化，不再解析失败（#242）。
- `vendor-prefix-align` 不再缩进与带前缀属性同名的 Sass / Less 变量（`$x`、`@x`）和自定义属性（`--x`）；`---webkit-y` 这样的自定义属性也不会再让后面的 `y` 被当成它的无前缀形式。

## 0.0.3 (2026-10-16)

### 变更

- CSS 解析器改用作为依赖安装的 [easy-gonz](https://www.npmjs.com/package/easy-gonz) 包，不再使用 `vendor/` 下内置的副本；解析结果不变，今后解析器的修复随 easy-gonz 的更新到达。

### 修复

- `processString(text, {context})` 按指定的节点类型解析文本（例如用 `declaration` 解析没有选择器的声明列表），不再忽略 `context`、一律当作样式表解析。

## 0.0.2 (2026-10-16)

### 破坏性变更

- 命令行遇到未知参数时打印错误和帮助文本，并以 `2` 退出，不处理任何文件，不再忽略该参数：删除或改正这个参数，`csscomb --help` 列出了全部参数（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-comb/zh/docs/command-line.md#看懂退出码)）。

### 新增

- `--version`（`-V`）打印 easy-comb 的版本号（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-comb/zh/docs/command-line.md#查阅命令行参数)）。
- TypeScript 配置文件加载失败时（Node.js 不支持类型剥离、用了无法擦除的语法、CommonJS 项目里写了 ESM 语法），会说明原因，并建议改用 `.mts`、`.mjs` 或 `.json`（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-comb/zh/docs/configuration.md#修复加载失败的-typescript-配置)）。
- `--syntax <name>` 把标准输入按 `scss`、`less` 或 `sass` 解析，不再固定按 CSS 解析，例如 `cat main.scss | csscomb --syntax scss -`；文件仍按扩展名决定语法，取值不合法时以 `2` 退出（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-comb/zh/docs/command-line.md#格式化标准输入)）。

### 变更

- 标准输入是终端时不带路径运行 `csscomb`，会打印帮助并以 `1` 退出，不再什么都不做。
- 配置文件（自动找到的或用 `--config` 传入的）里的 `exclude` 改为相对配置文件所在目录，不再相对当前目录，所以从子目录或编辑器里运行 `csscomb` 时也能生效；内置配置和传给 `configure()` 的配置仍相对当前目录。迁移方法：原先相对运行 `csscomb` 时所在目录写的 glob，改成相对配置文件所在目录（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-comb/zh/docs/configuration.md#选项之外的配置项)）。
- 配置文件里的 `template` 和 `exclude` 一样，改为相对配置文件所在目录，不再相对当前目录。迁移方法：原先相对运行 `csscomb` 时所在目录写的 `template` 路径，改成相对配置文件所在目录（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-comb/zh/docs/detect-config.md#用-template-补齐未设置的选项)）。

### 修复

- `csscomb -` 和 `--detect` 的输出通过管道传出时，不再在管道缓冲区大小处被截断（macOS 上为 64 到 128 KB）。
- `.a{color:#FFF;&:hover{z-index:1}}` 这类嵌套规则不再报错 `Syntax "undefined" is not supported yet, sorry`。
- `color-case`、`element-case` 和 `quotes` 遇到 `lowercase`、`xupper` 这类取值时给出警告并拒绝，不再照单全收。
- 在 Windows 上查找配置文件同样止于用户主目录。
- 传给命令行或 `--detect` 的路径不存在时，在处理任何文件之前打印易读的错误（不带堆栈），并以 `1` 退出。

## 0.0.1 (2026-10-16)

首个版本。逐步迁移说明见[从 CSScomb 4.3.0 迁移](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-comb/zh/docs/migrate-from-csscomb.md)。

### 破坏性变更

- 包名改为 `easy-comb`，版本号从 0.0.1 起算：运行 `npm uninstall csscomb && npm install easy-comb --save-dev`；`csscomb` 命令、配置文件名和内置配置名 `'csscomb'` 都不变。
- 全局安装会和原 `csscomb` 包的命令冲突：先运行 `npm uninstall csscomb -g`，或者加 `--force` 安装。
- 包改为 ES 模块：用 `import Comb from 'easy-comb'` 引入，在 CommonJS 中写 `const { default: Comb } = await import('easy-comb')`（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-comb/zh/docs/node-api.md#引入包)）。
- 需要 Node.js `^16.17.0 || >=18.3.0`：安装前先升级 Node.js。
- `Comb.getCustomConfig()` 改为返回 Promise：写成 `await Comb.getCustomConfig()`。
- 移除 `zen` 和 `yandex` 预设，只保留 `csscomb`：把预设里的选项复制进自己的配置文件。
- 内置配置排出的顺序变了，现在沿用 stylelint-config-recess-order，并用 mdn-data 补齐全部标准属性：运行一次 `npx csscomb` 并提交结果。
- 内置的 `csscomb` 配置现在会在文件末尾加换行、规则集之间空一行、组合符两侧加空格（`a > b`），并删除空规则集和零值的单位：运行一次 `npx csscomb` 并提交结果，或者添加配置文件，配置文件里没写的选项保持关闭。
- 命令行只在没有路径参数或参数是 `-` 时读取标准输入，不再在标准输入不是终端时忽略文件参数：用管道输入时显式传 `-`。
- `--config` 指定的文件不存在或解析失败时，命令行报错退出：修正路径或文件，或者去掉 `--config`。

### 新增

- 配置文件可以是 `.csscomb.{json,js,cjs,mjs,ts,cts,mts}` 或 `csscomb.config.{json,js,cjs,mjs,ts,cts,mts}`，并提供 `defineConfig` 和 `Config` 类型，用于补全和类型检查（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-comb/zh/docs/configuration.md#编写带类型的配置)）。
- 自定义属性（`--foo`）可以参与排序，csscomb/csscomb.js#636（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-comb/zh/docs/sort-order.md#指定自定义属性的位置)）。
- `lines-between-rulesets`、`space-between-declarations` 和 `tab-size` 可以从样式表中检测出来，csscomb/csscomb.js#518、csscomb/csscomb.js#519、csscomb/csscomb.js#520（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-comb/zh/docs/detect-config.md)）。
- 借助内置的 [easy-gonz](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-gonz/zh/README.md) 解析器，属性名和类名中的 Less 插值（`padding-@{side}`、`.btn-@{size}`）、Less mixin guard，以及字符串内 SCSS 插值里的引号都能解析（详见它的更新日志）。
- `lintString`、`lintFile` 和 `lintPath` 报告所有选项的错误，选项名放在新增的 `option` 字段里；`always-semicolon` 的错误格式不变（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-comb/zh/docs/node-api.md#读取-lint-错误)）。
- 包里自带 TypeScript 类型声明。
- 配置值不合法或选项未知时，用 `console.warn` 打印警告并忽略它们。

### 变更

- `sort-order` 中没有列出的带厂商前缀属性排在对应标准属性的紧前面，不再排到末尾（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-comb/zh/docs/sort-order.md#带厂商前缀的属性放在哪)）。
- 字符串里含有未转义的目标引号时，`quotes` 保留原来的引号，不再转义：在 `quotes: double` 下 `'say "hi"'` 保持原样，csscomb/csscomb.js#645。
- `unitless-zero` 保留 `0%`（在 `flex`、`text-size-adjust`、Sass 颜色函数等场合它与 `0` 并不等价），也保留自定义属性、`flex` 简写、预处理器变量、map 以及 `0px + 1pt` 这类算术操作数里的单位。
- 安装 easy-comb 只会带入一个运行时依赖 tinyglobby，取代原来的 gonzales-pe、minimist、minimatch、vow、vow-fs 和 @babel/polyfill。

### 修复

- 排序后不再留下多余的分号，csscomb/csscomb.js#622。
- `color-shorthand` 不再改坏 `rgba()` 里的颜色，csscomb/csscomb.js#612。
- `quotes` 转换引号时不再破坏 `content` 里的转义序列，csscomb/csscomb.js#352。
- `lines-between-rulesets` 不再多加缩进（csscomb/csscomb.js#610），不再在 `@import` 之间插空行（csscomb/csscomb.js#560、csscomb/csscomb.js#619），前一条规则的注释也留在原处（csscomb/csscomb.js#577）。
- `sort-order` 中的 `...` 与 `sort-order-fallback: "abc"` 一起使用时，分组排序能正常工作，csscomb/csscomb.js#497。
- `remove-empty-rulesets` 也会删除媒体查询里的空规则，csscomb/csscomb.js#570。
- Sass 函数不再被当成属性排序，csscomb/csscomb.js#555。
- Sass mixin 在 Windows 上或遇到 CRLF 换行时不再报错：`processString` 内部统一按 LF 处理，再还原原来的换行符，csscomb/csscomb.js#593。
- 传入绝对路径时 `exclude` 同样生效，csscomb/csscomb.js#174。
- 能正确处理 SCSS 属性名里的 camelCase 插值，csscomb/csscomb.js#455。
- 排序拆开空白后，`strip-spaces` 不再留下行尾空格。
- `processFile` 返回 Promise，csscomb/csscomb.js#643。
- 内置配置的 `space-before-opening-brace` 改用 `" "`，并补上缺失的 `space-between-declarations`，csscomb/csscomb.js#667。
- 包的主页和文档链接改指 GitHub 仓库，不再指向 csscomb.com（该域名已过期，被第三方接手），csscomb/csscomb.js#661。
- `sort-order` 匹配属性名时不区分大小写，`Z-INDEX`、`Color` 不再落进末尾的分组；输出保留原来的大小写。
- `sort-order` 不再让 `{` 后的空白跟着第一条声明一起移动（csscomb/csscomb.js#350），也不再删掉 `{` 后的空行（csscomb/csscomb.js#459）。
- `sort-order` 不再在 `font: { family: x; }` 这类 SCSS 嵌套属性后面多加一个 `;`。
- 紧凑写法的输入里，嵌套规则、Less mixin 调用和 `@include` 移到单独一行，不再留在上一条声明所在的行。
- `vendor-prefix-align` 不再缩进写在带前缀写法之前的无前缀属性，也不再对齐互不相邻的属性，csscomb/csscomb.js#628。
- 命令行帮助显示 `-c, --config <path>` 和 `-d, --detect <file>`；选项缺少取值时打印易读的错误，不再输出堆栈。
- `remove-empty-rulesets` 遇到没有块的缩进 Sass 规则不再崩溃；仍有作用的空规则集（Less `:extend()` 选择器、Sass `%placeholder`、`@extend` 和 Less mixin 调用的目标）会保留；没有删除任何内容时不改动空白，所以再运行一次不会产生改动。
- 末尾空白属于最后一条语句（未闭合的 @ 规则、没有分号的语句、缩进 Sass 块）或位于最后一个 token 内部时，`eof-newline` 不再每运行一次就多加一个换行。
- `lines-between-rulesets` 第二次运行的结果与第一次相同，缩进 Sass、被上一条语句吞掉的空行，以及与另一条规则写在同一行的规则也是如此；独占一行的注释跟随下一条规则，行尾注释跟随上一条规则。
- `space-after-combinator` 不再每次运行都在结束选择器的组合符（`a > {}`、`:is(a +)`）后面加空格，也不再把缩进 Sass 的 mixin 引入 `+name` 改成选择器 `+ name`。
- `leading-zero` 不再给紧贴前一个 token 的数字补零：`3e-2.1`（两个数字）过去会变成 `3e-20.1`。
