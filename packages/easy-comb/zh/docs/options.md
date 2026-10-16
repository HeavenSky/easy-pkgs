# 选项取值

[English](../../docs/options.md) · **简体中文**

这页说明选项取值的通用规则，读完就能直接设置任意选项，不用反复试；前提是已经有一份[配置文件](configuration.md)。
每个选项接受哪些值、有什么效果，都写在 [`Config`](../../src/config.ts) 类型的注释里；用 [`defineConfig`](configuration.md#编写带类型的配置) 时，编辑器悬停就能看到这些说明，并在取值非法时报错。

## 一次看全所有选项

```bash
csscomb -d your.css
```

这条命令打印 easy-comb 从 `your.css` 中检测到的每个选项及其取值；见[从样式表生成配置](detect-config.md)。
[src/config/default.ts](../../src/config/default.ts) 里的内置配置设置了全部选项，可以当作每种取值的可用示例。

## 选项取值规则

- **不配置的选项一律不生效。** 没写的选项不会改动任何东西。
- 只接受 `true` 的选项（比如 `strip-spaces`、`unitless-zero`）靠不写来关闭；写 `false` 或其他值会触发警告，该选项被忽略。
- 非法取值或未知选项名会触发 `console.warn` 警告并被忽略，其余选项照常生效。
- 空白类选项（各个 `space-*` 选项和 `block-indent`）接受数字，表示若干个空格；也接受由空格、tab 和换行组成的字符串。换行之后的缩进由 `block-indent` 决定。
- 只涉及花括号或分号的选项对缩进语法的 `.sass` 文件无效；`Config` 的注释里逐个标出了这些选项。
- `sort-order` 和 `sort-order-fallback` 见[属性排序](sort-order.md)。
