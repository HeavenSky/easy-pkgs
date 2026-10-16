# easy-gonz

[English](../README.md) · **简体中文**

npm 包页只显示英文版 README。

把 CSS、Less、SCSS 和缩进 Sass 解析成同一种可编辑的语法树，改完原样输出，没动过的字节一个不差。

[![npm version](https://img.shields.io/npm/v/easy-gonz.svg)](https://www.npmjs.com/package/easy-gonz)
[![npm downloads](https://img.shields.io/npm/dm/easy-gonz.svg)](https://www.npmjs.com/package/easy-gonz)
[![license](https://img.shields.io/npm/l/easy-gonz.svg)](../MIT-LICENSE.txt)

easy-gonz 面向读取或改写样式表的工具：格式化、lint、codemod 和依赖扫描。
它是 gonzales-pe 4.3.0 的维护版 fork，API、节点类型和 `gonzales` 命令都不变，还能解析 4.3.0 报错的写法，例如 Sass 模块、CSS 嵌套和 Less guard。
和 postcss 不同，easy-gonz 用一个解析器覆盖全部四种语法，并把选择器和值拆成节点，而不是字符串。

## 改一个变量名，其余原样保留

下面的脚本在一个用了 Sass 模块的 SCSS 文件里把 `$w` 改名为 `$width`：

```js
const gonzales = require('easy-gonz');

const ast = gonzales.parse(`@use 'sass:math';
.card {
  width: math.div($w, 2); // half width
  @include theme.shadow;
}`, { syntax: 'scss' });

// 把所有 $w 改名为 $width
ast.traverseByType('variable', (node) => {
  const name = node.first('ident');
  if (name.content === 'w') name.content = 'width';
});

console.log(ast.toString());
```

输出：

```scss
@use 'sass:math';
.card {
  width: math.div($width, 2); // half width
  @include theme.shadow;
}
```

**只有改名的变量变了**，注释、空白和排版都和原文一模一样。
同样的输入交给 gonzales-pe 4.3.0 会直接报错（`Please check validity of the block starting from line #4`）。

## 开始使用

1. 安装：

   ```bash
   npm install easy-gonz
   ```

2. 以缩进大纲打印一条规则的语法树，第一行是 `-> stylesheet`：

   ```bash
   printf 'a { color: red }' | npx gonzales -s css --simple -
   ```

3. 在代码里验证往返结果，输出 `true`：

   ```bash
   node -e "const g = require('easy-gonz'); const src = '.a { &:hover { color: red } }'; console.log(g.parse(src).toString() === src)"
   ```

从 gonzales-pe 迁移只需改一行；如果代码按节点类型匹配，再读[从 gonzales-pe 迁移](docs/migrate-from-gonzales-pe.md)：

```diff
- const gonzales = require('gonzales-pe');
+ const gonzales = require('easy-gonz');
```

## 在逐字保留的语法树上构建工具

- 改写不带副作用：下文官方测试集的每条有效用例都满足 `parse(src).toString() === src`，注释、空白和缩进 Sass 的行尾（`;`、`\r\n`、`\r`、`\f`）都算在内。
- 一套遍历代码处理四种语法，细到选择器和值：`syntax: 'css' | 'less' | 'scss' | 'sass'` 产出的是同一套[节点类型](docs/node-types.md)，选择器、值、函数参数和插值也都是节点。
- 解析当下常见的样式表写法：Sass 模块、CSS 嵌套、`:has(> a)`、`:nth-child(… of S)`、媒体查询范围语法、Less guard、mixin、`@{}` / `${}` 插值和 `$prop`，以及缩进 Sass 的语法改进。
- CSS 和 Less 写错了也能继续解析：非法语句变成 `raw` 节点，不会报错，做法与 postcss 相同。
- 从 gonzales-pe 切换只改一行：`parse`、`createNode`、`Node` 的 API 和 `gonzales` 的选项都不变，没有运行时依赖，支持 Node.js 6+。

每条有效用例都要能解析、逐字节原样输出，并且结构与参考解析器（postcss 系工具链；缩进 Sass 没有参考解析器）一致。
判定脚本是 [gonz.mjs](../../_official_style_suites/gonz.mjs)，由 `npm run test:official` 运行，测试集版本钉在 [suites.json](../../_official_style_suites/suites.json) 里；准备步骤见[运行官方测试集](docs/development.md#运行官方测试集)。

| 测试集 | 语法 | 有效用例 | easy-gonz | postcss 系工具链 |
| --- | --- | --: | --: | --: |
| [WPT](https://github.com/web-platform-tests/wpt) 解析测试 | CSS | 4,414 | 100% | 99.9% |
| WPT `<style>` 块 | CSS | 715 | 100% | 98.0% |
| [css-parsing-tests](https://github.com/SimonSapin/css-parsing-tests) | CSS | 1,243 | 100% | 98.1% |
| [sass-spec](https://github.com/sass/sass-spec) | SCSS | 11,456 | 100% | 99.5% |
| sass-spec | 缩进 Sass | 348 | 100% | 不支持 |
| [less.js test-data](https://github.com/less/less.js/tree/master/packages/test-data) | Less | 285 | 100% | 87.4% |

postcss 系工具链指 postcss、postcss-scss 和 postcss-less，选择器和值再交给 postcss-selector-parser 与 postcss-value-parser 解析。
它通过的用例，easy-gonz 全部通过。

## 判断何时该换用其他解析器

需要 postcss 的插件生态、又用不到缩进 Sass 时，选 postcss 加 postcss-scss 或 postcss-less。
只解析 CSS、并且要严格按 CSS Syntax 规范得到 component value 时，选 @csstools/css-parser-algorithms。
解析 SCSS 和缩进 Sass 时，多数非法输入仍会报错，所以这两种语法下 easy-gonz 不是容错解析器。

| 解析器 | 语法 | 选择器和值 | 运行时依赖 | Node.js |
| --- | --- | --- | --- | --- |
| easy-gonz | CSS、Less、SCSS、Sass | 节点 | 无 | >=6 |
| gonzales-pe 4.3.0 | CSS、Less、SCSS、Sass | 节点 | minimist | >=0.6（声明值） |
| postcss 8 + postcss-scss / postcss-less | CSS、SCSS、Less | 字符串，需要另接解析器 | 3 个 | >=12 |
| postcss-sass 0.5.0 | Sass，由 gonzales-pe 4.3.0 的语法树转换而来 | 字符串（postcss AST） | gonzales-pe 4.3.0、postcss | ^10、^12、>=14 |
| sugarss 5 | SugarSS，另一种缩进语法 | 字符串（postcss AST） | postcss（peer） | >=18 |
| sass-parser 0.4（Sass 团队） | CSS、SCSS、Sass | 本文未评估 | postcss、sass | >=18 |
| @csstools/css-parser-algorithms 4 | 仅 CSS | 通用 component value | @csstools/css-tokenizer（peer） | >=20.19 |

上表中只有 easy-gonz 和 gonzales-pe 4.3.0 用一套 API 读取全部四种语法，并把选择器和值拆成独立节点。

## 延伸阅读

- [文档索引](docs/README.md)：按任务列出全部文档。
- [API 参考](docs/api.md)：`parse` 选项、节点方法、解析错误和 `gonzales` 命令。
- [节点类型](docs/node-types.md)：每种语法产出哪些节点，节点之间怎样嵌套。
- [从 gonzales-pe 迁移](docs/migrate-from-gonzales-pe.md)：哪些保持不变，哪些语法树有变化。
- [开发与测试 easy-gonz](docs/development.md)：语料格式、`npm test` 和官方测试集。
- [CHANGELOG](../CHANGELOG.md)：各版本的变化（仅英文）。
- [easy-comb](../../easy-comb/zh/README.md) 是 CSScomb 的维护版 fork，基于 easy-gonz 构建。
- 问题和建议请提交到 [issues](https://github.com/HeavenSky/easy-pkgs/issues)。

## 许可证

[MIT](../MIT-LICENSE.txt)；fork 自 Tony Ganch 的 [Gonzales PE](https://github.com/tonyganch/gonzales-pe)，它的 [playground](https://tonyganch.io/gonzales-pe/) 运行的是原版解析器。
