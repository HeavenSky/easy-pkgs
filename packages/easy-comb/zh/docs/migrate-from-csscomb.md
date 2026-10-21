# 从 CSScomb 4.3.0 迁移

[English](../../docs/migrate-from-csscomb.md) · **简体中文**

这页讲怎样在已有项目里把 CSScomb 4.3.0 换成 easy-comb，以及换完要检查什么；前提是项目已经通过 npm 使用 `csscomb`。
命令、配置文件名和选项名都不变，多数项目只需要第 1 步和第 4 步。

## 替换依赖包

1. 换掉依赖：

    ```bash
    npm uninstall csscomb && npm install easy-comb --save-dev
    ```

    此时 `npx csscomb --help` 打印的是 easy-comb 的帮助。全局安装见[全局安装](install.md#全局安装)。

2. 如果在代码里调用 CSScomb，改用 ES 模块方式引入，并 await `getCustomConfig()`，它现在返回 Promise：

    ```js
    import Comb from "easy-comb";
    const comb = new Comb(await Comb.getCustomConfig());
    ```

    在 CommonJS 中的写法见[引入包](node-api.md#引入包)。

3. 如果配置用了 `zen` 或 `yandex` 预设，把该预设的选项复制进自己的配置文件；内置配置名只剩 `'csscomb'`。
4. 对全部样式表运行一次 `npx csscomb`，检查 diff 后提交。内置属性顺序和部分内置选项变了，所以即使别的都没动，第一次运行也会重排文件。

如果脚本在传路径参数的同时还通过管道向 `csscomb` 输入内容，改成只传 `-`：现在只有没有路径参数，或参数是 `-` 时才读标准输入，见[格式化标准输入](command-line.md#格式化标准输入)。
完整的变更列表见 [更新日志](../CHANGELOG.md)。

## 与 CSScomb 4.3.0 对比

|                                        | CSScomb 4.3.0                                                  | easy-comb                                                               |
| -------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 是否维护                               | 否                                                             | 是                                                                      |
| 解析器                                 | Gonzales PE（已停止维护）                                      | [easy-gonz](../../../easy-gonz/README.md)（仍在维护的 fork）            |
| Less `padding-@{side}`、`.btn-@{size}` | 解析报错                                                       | 支持                                                                    |
| 未列出的带厂商前缀属性                 | 排到末尾                                                       | 排在标准属性前面                                                        |
| `sort-order` 中的自定义属性（`--foo`） | 不支持                                                         | 支持                                                                    |
| 内置属性顺序                           | 手工维护的列表                                                 | 由 recess-order 和 mdn-data 生成                                        |
| 内置配置                               | `csscomb`、`zen`、`yandex`                                     | `csscomb`                                                               |
| 配置文件                               | `.csscomb.json`                                                | json、js、cjs、mjs、ts、cts、mts，支持 `defineConfig`                   |
| 模块格式                               | CommonJS                                                       | ESM，带 TypeScript 类型声明                                             |
| 运行时依赖                             | gonzales-pe、minimist、minimatch、vow、vow-fs、@babel/polyfill | easy-gonz、tinyglobby                                                   |
| CSS、SCSS、Less、Sass 官方测试集       | 未检验                                                         | 18,461 条合法用例全部通过（[复现方法](contributing.md#运行官方测试集)） |
