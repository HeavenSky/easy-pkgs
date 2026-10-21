# easy-gonz API 参考

[English](../../docs/api.md) · **简体中文**

本页说明怎样解析样式表、读取和修改语法树、把树输出回文本，以及怎样运行 `gonzales` 命令；前提是已按[开始使用](../README.md#开始使用)装好 easy-gonz。
节点类型及其嵌套关系见[节点类型](node-types.md)。
与 gonzales-pe 4.3.0 的差异见[从 gonzales-pe 迁移](migrate-from-gonzales-pe.md)。
修改解析器本身见[开发与测试 easy-gonz](development.md)。

除非示例自己解析输入，都从这棵树开始：

```js
const gonzales = require('easy-gonz');
const parseTree = gonzales.parse('a { color: tomato }');
```

包导出 `parse` 和 `createNode`。
在 Node ESM 中，`import { parse, createNode } from 'easy-gonz'` 和默认导入都可用；`require('easy-gonz/lib/gonzales')` 加载的是同一个模块。
TypeScript 类型声明随包发布在 [gonzales.d.ts](../../gonzales.d.ts)，会自动加载。

## 解析样式表

### gonzales.parse(css[, options])

返回字符串 `css` 的语法树根节点。

```js
const css = gonzales.parse('a { color: tomato }');
const less = gonzales.parse('a { @color: tomato }', { syntax: 'less' });
const declaration = gonzales.parse('@color: tomato', { syntax: 'less', context: 'declaration' });
```

| 选项 | 类型 | 默认值 | 含义 |
| --- | --- | --- | --- |
| `syntax` | `'css'`、`'less'`、`'sass'` 或 `'scss'` | `'css'` | 输入的语法。 |
| `context` | string | `'stylesheet'` | 根节点的类型，例如 `declaration` 或 `value`；可用值见[节点类型](node-types.md)。 |
| `tabSize` | number | `1` | 计算 `start` 和 `end` 时一个制表符算几列；不是正整数时按 `1` 计。 |
| `recover` | boolean | `true` | 只对 CSS 和 Less 生效，见下文；SCSS 和 Sass 忽略它。 |

`syntax` 为 `'css'` 或 `'less'` 且使用默认的 `context`（`stylesheet`）时，非法输入不会抛错：无法识别的语句变成 `raw` 节点，做法与 postcss 相同。
例如 `gonzales.parse('a { color: red } }')` 返回的树里，多出来的 `}` 是一个 `raw` 节点。
传 `recover: false` 则改为抛出[解析错误](#解析错误)，其中的 `line` 指向第一处会变成 `raw` 的语句。
输入结束时仍未闭合的块，以及只有 `raw` 兜底规则才能接受的 Less 语句（例如 `--x: () => {…}`），也算作需要恢复，同样会抛错。
不需要恢复的输入，两种设置得到的树完全相同。

其他输入：

- 空字符串返回一个空的 `stylesheet` 节点，`syntax` 为传入的语法，与 `context` 无关；它的 `start` 和 `end` 是数组 `[0, 0]` 而不是对象，`toString()` 返回 `''`。
- `css` 不是字符串时抛出 `Error`，消息为 `Please, pass a string to parse`。
- 传入不支持的 `syntax` 时，`parse` 在控制台打印 `Syntax "<name>" is not supported yet, sorry`，并返回 `undefined`。

### 解析错误

输入无法解析时，`parse` 抛出的是普通对象而不是 `Error` 实例，字段如下：

| 字段 | 值 |
| --- | --- |
| `name` | `'Parsing error'` |
| `line` | 出错块起始的行号（从 1 开始）。 |
| `syntax` | 所解析的语法。 |
| `message` | `Please check validity of the block starting from line #<line>` |
| `context` | `line` 前后的源码行，出错行用 `*` 标出。 |
| `version` | easy-gonz 的版本号。 |

它的 `toString()` 把这些字段拼在一起：

```js
try {
  gonzales.parse('a {\n  color: red;\n  b: {\n}', { syntax: 'scss' });
} catch (e) {
  console.log(String(e));
}
```

```text
Parsing error: Please check validity of the block starting from line #1

1*| a {
2 |   color: red;
3 |   b: {

Syntax: scss
Gonzales PE version: 0.0.3
```

## 读取节点属性

每个节点都有这些属性：

| 属性 | 类型 | 值 |
| --- | --- | --- |
| `type` | string | 节点类型，见[节点类型](node-types.md)。 |
| `content` | string 或 array | 叶子节点的文本，或者子节点组成的 array。 |
| `syntax` | string | 解析时的语法，`toString()` 依据它输出。 |
| `start` | object | 第一个字符的位置：`{ line, column }`，都从 1 开始；空输入返回的空 `stylesheet` 例外，是 `[0, 0]`。 |
| `end` | object | 最后一个字符的位置，结构同 `start`。 |
| `length` | number | 子节点个数；`content` 是字符串时为 `0`。 |

只有解析得到的节点，以及创建时传了 `start` 和 `end` 的节点，才有这两个字段。

## 查找子节点

下面这些方法只看直接子节点；要在整棵树里查找，用 [traverseByType](#parsetreetraversebytypetype-callback)。

### parseTree.contains(type)

节点有类型为 `type` 的直接子节点时返回 `true`，否则返回 `false`。

```js
console.log(parseTree.contains('ruleset')); // true
```

### parseTree.first([type])

返回第一个子节点，或第一个类型为 `type` 的子节点。
没有匹配时返回 `null`；不传 `type` 且节点没有子节点时返回 `undefined`。

```js
const ruleset = parseTree.first('ruleset');
console.log(ruleset.first().type); // selector
```

### parseTree.last([type])

返回最后一个子节点，或最后一个类型为 `type` 的子节点。
没有匹配时返回 `null`；不传 `type` 且节点没有子节点时返回 `undefined`。

```js
const ruleset = parseTree.first('ruleset');
console.log(ruleset.last().type); // block
```

### parseTree.get(index)

返回位置 `index` 上的子节点，没有时返回 `null`。

```js
const ruleset = parseTree.first('ruleset');
console.log(ruleset.get(1).type); // space
```

### parseTree.is(type)

节点本身的类型是 `type` 时返回 `true`，否则返回 `false`。

```js
const node = parseTree.first();
console.log(node.is('ruleset')); // true
```

## 循环处理子节点

### parseTree.forEach([type, ]callback)

从前往后对每个直接子节点调用 `callback(node, index, parent)`，传了 `type` 时只处理该类型的子节点；`parent` 就是 `parseTree`。
回调返回 `null` 时循环停止，`forEach` 也返回 `null`。
在 `content` 为字符串的节点上调用时不做任何事。

```js
const block = parseTree.first('ruleset').first('block');
block.forEach('space', (spaceNode, index) => {
  console.log(index, JSON.stringify(spaceNode.content)); // 依次输出 0 " " 和 2 " "
});
```

### parseTree.eachFor([type, ]callback)

和 [forEach](#parsetreeforeachtype-callback) 一样，只是从最后一个子节点往前走，所以回调里可以放心删除当前子节点。

```js
// 删除所有空白子节点
const block = parseTree.first('ruleset').first('block');
block.eachFor('space', (spaceNode, index) => {
  block.removeChild(index);
});
console.log(parseTree.toString()); // a {color: tomato}
```

## 遍历整棵树

`traverse*` 方法会依次访问子节点、孙节点，一直到最深处。
回调参数是 `(node, index, parent, level)`：`index` 是节点在 `parent` 中的位置，`level` 是从调用方法的节点算起的深度，该节点本身为 `1`。
回调的返回值会被忽略。

### parseTree.traverse(callback)

从 `parseTree` 本身开始，对每个节点调用 `callback`；对 `parseTree` 本身，`index` 是 `undefined`，`parent` 是 `null`。

```js
// 按缩进列出每个节点的类型
parseTree.traverse((node, index, parent, level) => {
  console.log('  '.repeat(level - 1) + node.type);
});
```

### parseTree.traverseByType(type, callback)

对每个类型为 `type` 的节点调用 `callback`；回调里的 `this` 是匹配到的节点。
请在根节点上调用：在子节点上调用更慢。

```js
parseTree.traverseByType('ident', (node) => {
  if (node.content === 'tomato') node.content = 'red';
});
console.log(parseTree.toString()); // a { color: red }
```

### parseTree.traverseByTypes(types, callback)

和 [traverseByType](#parsetreetraversebytypetype-callback) 一样，处理类型在数组 `types` 中的每个节点。

```js
// 删除所有注释和空白
const tree = gonzales.parse('a { /* note */ color: tomato }');
tree.traverseByTypes(['multilineComment', 'space'], (node, index, parent) => {
  parent.removeChild(index);
});
console.log(tree.toString()); // a{color:tomato}
```

## 修改语法树

修改叶子节点就给它的 `content` 赋值；增删节点用下面的方法。

### gonzales.createNode(options)

按 `options` 创建并返回一个新节点：`type`（string）、`content`（string 或节点组成的 array），以及可选的 `syntax`、`start` 和 `end`，结构见[读取节点属性](#读取节点属性)。

```js
const node = gonzales.createNode({ type: 'multilineComment', content: ' note ' });
parseTree.content.push(node);
console.log(parseTree.toString()); // a { color: tomato }/* note */
```

### parseTree.insert(index, node)

把 `node` 插到子节点位置 `index`。
在 `content` 为字符串的节点上调用时不做任何事。

```js
const node = gonzales.createNode({ type: 'multilineComment', content: ' note ' });
parseTree.insert(0, node);
console.log(parseTree.toString()); // /* note */a { color: tomato }
```

### parseTree.removeChild(index)

删除位置 `index` 上的子节点，返回值与 `Array.prototype.splice` 相同：一个装着被删节点的数组，`index` 越界时为空数组。
在 `content` 为字符串的节点上调用时返回 `undefined`。

```js
// 把声明移到所在块的最前面
const block = parseTree.first('ruleset').first('block');
const [declaration] = block.removeChild(1);
block.insert(0, declaration);
console.log(JSON.stringify(parseTree.toString())); // "a {color: tomato  }"
```

## 输出语法树

### parseTree.toString()

按节点的 `syntax` 返回源码文本；没改过的树逐字节还原原始输入。
节点的 `syntax` 不受支持时在控制台打印提示，并返回 `undefined`。

```js
const css = parseTree.toString();
```

### parseTree.toJson()

返回整棵树的 JSON 字符串，缩进 2 个空格。

## 运行 gonzales 命令

`gonzales` 以 JSON 打印一个文件的语法树；参数为 `-` 时读取 stdin：

```bash
printf 'a-23' | npx gonzales -s css -c ident -
```

```json
{
  "type": "ident",
  "content": "a-23",
  "syntax": "css",
  "start": {
    "line": 1,
    "column": 1
  },
  "end": {
    "line": 1,
    "column": 4
  }
}
```

| 选项 | 含义 |
| --- | --- |
| `-s`、`--syntax` | `css`、`less`、`sass` 或 `scss`；默认取文件扩展名，不区分大小写（`.SCSS` 按 `scss` 读取），读 stdin 时为 `css`。 |
| `-c`、`--context` | 根节点类型，同 [parse](#gonzalesparsecss-options) 的 `context` 选项。 |
| `--simple` | 打印缩进大纲而不是 JSON；末行是一串短横线，长度与最后一个节点的深度对齐，见下面的示例。 |
| `--silent` | 不打印错误提示；`--no-silent` 和 `--silent=false` 关闭它。 |
| `-v`、`--version` | 打印 easy-gonz 的版本号。 |
| `-h`、`--help` | 打印用法。 |

加 `--simple` 时，`a{}` 打印出下面的大纲；最后一个节点 `block` 位于第 3 层，所以末行有两个短横线：

```bash
printf 'a{}' | npx gonzales --simple -
```

```text
 -> stylesheet
 | -> ruleset
 | | -> selector
 | | | -> typeSelector
 | | | | -> ident
 | | | |    "a"
 | | -> block
 - -
```

打印出语法树、帮助或版本号，或者没有给文件时，命令以 `0` 退出。
遇到下列任一错误时以 `1` 退出，并把提示写到 stderr；设了 `--silent` 时不写：

| 情形 | 写到 stderr 的提示 |
| --- | --- |
| `--syntax` 不受支持 | `Unsupported syntax "foo" from --syntax; expected one of css, less, sass, scss.` |
| `--syntax` 没有给值 | `Missing value for --syntax; expected one of css, less, sass, scss.` |
| 文件扩展名不受支持 | `Unsupported syntax "txt" from the extension of test/cli/plain.txt; expected one of css, less, sass, scss.` |
| 文件无法读取 | `Cannot read test/cli/missing.scss: ENOENT: no such file or directory, open 'test/cli/missing.scss'` |
| 解析错误 | 解析错误的 `toString()`，见[解析错误](#解析错误)。 |

文件内容按原样解析，所以位置与文件一致，结尾的换行会成为最后一个 `space` 节点。
想不经 `npx` 直接运行 `gonzales`，用 `npm install -g easy-gonz` 全局安装。
