# 参与开发 easy-comb

[English](../../docs/contributing.md) · **简体中文**

这页讲怎样让开发环境构建通过、测试通过，以及哪些生成内容不能手改；前提是 Node.js 22.18 及以上，因为测试直接运行 TypeScript。
欢迎任何人参与；补丁和新功能必须附带测试才会被接受。

## 搭建环境并运行检查

在 `packages/easy-comb` 下运行：

```bash
npm install
npm test               # mocha
npm run typecheck      # tsc
npm run build          # 编译到 dist/
```

## 运行官方测试集

WPT、css-parsing-tests、sass-spec、less.js 这几套官方测试集用来检验：格式化不崩溃，重复运行结果不变，编译产物不变。

1. 在 `packages/_official_style_suites` 下安装这项检查所需的依赖：

   ```bash
   npm ci
   ```

2. 在 `packages/easy-comb` 下运行检查：

   ```bash
   npm run test:official
   ```

   首次运行会把各测试集按[固定版本](../../../_official_style_suites/suites.json)下载到仓库根目录的 `.cache/official/`。
   结果与 [test/official-baseline.json](../../test/official-baseline.json) 中各测试集的用例数比对，合计 18,461 条合法用例；什么算失败见 [comb.mjs](../../../_official_style_suites/comb.mjs)。

## 重新生成内置属性顺序

内置顺序 [src/config/sort-order.ts](../../src/config/sort-order.ts) 由 [scripts/sort-order.ts](../../scripts/sort-order.ts) 生成，不要手改。

```bash
npm run sort-order                    # 升级数据源后重新生成
node scripts/sort-order.ts --check    # 检查已提交的列表是否最新
```

遇到无法自动安排位置的新属性时，脚本会失败并给出提示；把该属性加进脚本里的 `PLACEMENTS`。

## 更新内置解析器

```bash
npm run vendor
```

这条命令把 `../easy-gonz` 中 [easy-gonz](../../../easy-gonz/README.md) 的源码复制到 `vendor/gonzales-pe`，并记录来源提交；easy-gonz 不需要构建。不要手改 `vendor/gonzales-pe`：先改 easy-gonz，再重新同步。

## 致谢

easy-comb fork 自 [CSScomb](https://github.com/csscomb/csscomb.js)；CSScomb 由 [@mishanga](https://github.com/mishanga) 和 [@tonyganch](https://github.com/tonyganch) 编写，以 [MIT 许可证](https://github.com/csscomb/csscomb.js/blob/master/LICENSE)发布。
CSScomb 的灵感来自 [@miripiruni](https://github.com/miripiruni) 的同名 [PHP 工具](https://github.com/csscomb/csscomb)，解析 CSS 用的是 [@tonyganch](https://github.com/tonyganch) 的 [Gonzales PE](https://github.com/tonyganch/gonzales-pe)。

感谢以下各位对 CSScomb 的帮助与贡献：
[@miripiruni](https://github.com/miripiruni)、
[@anton-rudeshko](https://github.com/anton-rudeshko)、
[@cvrebert](https://github.com/cvrebert)、
[@filtercake](https://github.com/filtercake)、
[@ignovak](https://github.com/ignovak)、
[@kizu](https://github.com/kizu)、
[@lefoy](https://github.com/lefoy)、
[@L0stSoul](https://github.com/L0stSoul)、
[@mishaberezin](https://github.com/mishaberezin)、
[@puzankov](https://github.com/puzankov)、
[@schneyra](https://github.com/schneyra)、
[@thejameskyle](https://github.com/thejameskyle)、
[@vecmezoni](https://github.com/vecmezoni)。

相关项目：[cssbeautify](https://github.com/senchalabs/cssbeautify)、[gonzales](https://github.com/css/gonzales)、[Gonzales PE](https://github.com/tonyganch/gonzales-pe)、[CSSO](https://github.com/css/csso)、[parser-lib](https://github.com/nzakas/parser-lib)。
