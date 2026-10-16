# easy-comb

[English](../README.md) · **简体中文**（npm 包页只显示英文版 README。）

给 CSS、Less、SCSS 和 Sass 文件排好属性顺序、统一代码风格，命令和配置文件沿用你熟悉的 csscomb。

[![npm version](https://img.shields.io/npm/v/easy-comb.svg)](https://www.npmjs.com/package/easy-comb)
[![npm downloads](https://img.shields.io/npm/dm/easy-comb.svg)](https://www.npmjs.com/package/easy-comb)
[![license](https://img.shields.io/npm/l/easy-comb.svg)](../LICENSE)

easy-comb 是 [CSScomb](https://github.com/csscomb/csscomb.js) 4.3.0 的一个仍在维护的 fork，原项目已经不再修 bug。
命令仍是 `csscomb`，`.csscomb.json` 和选项名都不变，换过来只要一次 `npm install`。
它修掉了 CSScomb 的老问题，比如排序后多出分号、`rgba()` 颜色被改坏。CSScomb 解析不了的写法（如 Less 的 `padding-@{side}`）也能正常处理。

## 看它把样式表改成什么样

不写配置文件、用内置配置运行 `npx csscomb card.css`，下面这段：

```css
.card{color:#FFFFFF;z-index:2;padding:0 .5em;display:flex;position:relative;
  -webkit-transition:opacity .3s;transition:opacity .3s;background:url('bg.png') #FF0000}
A:hover, LI > SPAN{font-weight:bold;color:#AABBCC;}
```

会变成：

```css
.card {
  position: relative;
  z-index: 2;

  display: flex;

  padding: 0 0.5em;

  color: #fff;

  background: url("bg.png") #f00;

  -webkit-transition: opacity 0.3s;
          transition: opacity 0.3s;
}

a:hover, li > span {
  font-weight: bold;
  color: #abc;
}
```

属性按作用分组，颜色缩写并转小写，引号和小数前导零统一，厂商前缀对齐。

## 跑通第一次格式化

```bash
npm install easy-comb --save-dev
npx csscomb src/styles
npx csscomb --lint src/styles
```

第二条命令就地修复 `src/styles` 下的所有样式表；第三条只检查不改，有文件需要改动时以 `1` 退出。
需要 Node.js `^16.17.0 || >=18.3.0`；全局安装和版本细节见[安装 easy-comb](docs/install.md)。

## 你能得到什么

- 原有的 CSScomb 配置继续可用：命令仍是 `csscomb`，`.csscomb.json` 和所有选项名不变，少数破坏性变更都列在[从 CSScomb 4.3.0 迁移](docs/migrate-from-csscomb.md)。
- **完整的属性顺序，不用自己维护**：内置顺序沿用 [stylelint-config-recess-order](https://github.com/stormwarning/stylelint-config-recess-order)，其余标准属性按 [mdn-data](https://github.com/mdn/data) 补齐；没列出的带厂商前缀属性自动排在对应标准属性前面，自定义属性（`--color`）也能参与排序。见[属性排序](docs/sort-order.md)。
- 真实项目里的样式表能放心格式化：WPT、css-parsing-tests、sass-spec、less.js 四套官方测试集的 18,461 条合法用例全部格式化成功，不崩溃，编译产物不变（[复现方法](docs/contributing.md#运行官方测试集)）。
- 配置文件格式随你选：JSON、JavaScript 或配合 `defineConfig` 的 TypeScript 都行，也可以从你满意的样式表[直接生成](docs/detect-config.md)（[配置 easy-comb](docs/configuration.md)）。
- CI 里检查，提交时修复：`--lint` 遇到未格式化的文件就让构建失败，同一条命令也能由 lint-staged 或任何能在保存时运行命令的编辑器调用（[接入示例](docs/integrations.md)）；[Node.js API](docs/node-api.md) 自带 TypeScript 类型声明。

## 什么时候该换别的工具

easy-comb 只调整属性顺序和各选项控制的细节，不会重新排版整个文件，也不会折行。
想让每一行都按统一版式重新输出，用 [Prettier](https://prettier.io)；已经在用 stylelint、只想在那里检查和修正属性顺序，用 [stylelint-order](https://github.com/hudochenkov/stylelint-order) 插件。

## 继续阅读

- [使用指南](docs/README.md)：按你要做的事找到对应页面，从命令行用法到选项的完整规则
- [从 CSScomb 4.3.0 迁移](docs/migrate-from-csscomb.md)，含逐项对比
- [CHANGELOG](../CHANGELOG.md)（英文）
- [easy-gonz](../../easy-gonz/README.md)：easy-comb 使用的解析器

## 许可证

[MIT](../LICENSE)；fork 自 [@mishanga](https://github.com/mishanga) 与 [@tonyganch](https://github.com/tonyganch) 编写的 CSScomb，见[致谢](docs/contributing.md#致谢)。
