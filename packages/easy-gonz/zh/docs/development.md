# 开发与测试 easy-gonz

[English](../../docs/development.md) · **简体中文**

按本页修改解析器、添加测试用例，并在本地跑一遍与 CI 相同的检查；前提是装有 Git 和 Node.js 22 或更高版本（包本身在 Node.js 6+ 上运行）。
没有构建步骤：`src/` 原样发布。

## 准备代码仓库

1. 克隆仓库并进入包目录：

   ```bash
   git clone https://github.com/HeavenSky/easy-pkgs.git
   cd easy-pkgs/packages/easy-gonz
   ```

2. 安装开发依赖（只有 oxlint）：

   ```bash
   npm ci
   ```

3. 运行测试；刚克隆的代码应全部通过：

   ```bash
   npm test
   ```

## 编写能在 Node.js 6 上运行的代码

`src/` 和 `bin/` 下的代码只能用 Node.js 6 支持的语法：不能用 `**`、async 函数、对象展开与剩余属性，也不能用可选链。
`npm run lint:check` 运行 oxlint；`npm run lint` 会同时应用它的自动修复。

## 添加解析器测试用例

解析器用例放在 `test/corpus/<syntax>/<context>.txt`，每种语法、每种根节点类型一个文件：

- 每条用例依次是 `=== name` 行、输入、`---` 行和期望的语法树。
- 语法树每行一个节点，格式为 `type start-end [{syntax}] ["content"]`。
- 在 `===` 行末加 ` [skip]` 可以跳过该用例。

在多种语法下结果相同的用例只在 `test/corpus/shared/<context>.txt` 写一次，写成 `=== name [css less]`（或 `=== name [css less] [skip]`），根节点的语法写 `{*}`。下面这条用例取自 `test/corpus/shared/ident.txt`，在四种语法下都会运行：

```text
=== 2 [css less sass scss]
-x
---
ident 1:1-1:2 {*} "-x"
```

有意修改解析器之后，重写期望的语法树并检查 diff：

```bash
npm run test:update
```

某种语法对共享用例给出不同的语法树时，`test:update` 会把该语法的这条用例从 `shared/` 拆到该语法自己的文件。

## 运行测试

`npm test` 用 `node:test` 运行 `test/corpus/` 中的解析器用例、节点 API 测试和 CLI 测试。
解析器用例失败时，会以 diff 形式打印期望与实际的语法树。

`npm run test:compat` 只运行解析器用例，不依赖 `node:test`，因此在包支持的所有 Node.js 版本上都能跑。

想看某个字符串的语法树，把它通过管道交给 `bin/gonzales.js`；`-c` 指定 `context`，`--simple` 打印大纲而不是 JSON：

```bash
printf 'a-23' | node bin/gonzales.js -s css -c ident -
```

## 运行官方测试集

`npm run test:official` 检查官方 CSS、Sass 和 Less 测试集的每条有效用例，并把结果与 `test/official-baseline.json` 记录的已知失败对比。
每条用例都要能解析、逐字节原样输出，并且结构与参考解析器一致；判定规则见 [gonz.mjs](../../../_official_style_suites/gonz.mjs)。
它需要 Node.js 22.18 或更高版本。

1. 在仓库根目录下安装参考解析器：

   ```bash
   (cd packages/_official_style_suites && npm ci)
   ```

2. 在仓库根目录下，按 [suites.json](../../../_official_style_suites/suites.json) 钉死的提交，把测试集下载到 `.cache/official/`：

   ```bash
   node packages/_official_style_suites/fetch.mjs
   ```

3. 在 `packages/easy-gonz` 下运行检查；它打印一张汇总表，每个测试集一行，出现新的失败即不通过：

   ```bash
   npm run test:official
   ```

某项改动让已知失败的用例通过时，在同一改动里运行 `npm run test:official -- --update`，把它移出基线。
`npm run test:official -- --gap <suite>` 列出该测试集中 postcss 系工具链通过而 easy-gonz 未通过的用例；`<suite>` 取汇总表的行名，例如 `less` 或 `sass-spec-scss`。

## 报告问题

在 [HeavenSky/easy-pkgs](https://github.com/HeavenSky/easy-pkgs/issues) 提交 issue，附上输入、传入的 `syntax`，以及 `gonzales --simple` 的输出。
