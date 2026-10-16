# 属性排序

[English](../../docs/sort-order.md) · **简体中文**

这页讲怎样用 `sort-order` 把属性、预处理器变量和 mixin 排成你想要的顺序；前提是已经有一份[配置文件](configuration.md)，或者直接用[内置顺序](#使用内置顺序)。

## 定义顺序

`sort-order` 是属性名列表，或由若干分组组成的列表；easy-comb 在组与组之间空一行。

```json
{ "sort-order": [["position", "top"], ["margin", "padding"]] }
```

```css
/* 排序前 */
p {
    padding: 0;
    top: 0;
    margin: 0;
    position: absolute;
}

/* 排序后 */
p {
    position: absolute;
    top: 0;

    margin: 0;
    padding: 0;
}
```

属性名匹配不区分大小写（`Z-INDEX` 与 `z-index` 排在同一位置），输出保留原来的大小写。

## 带厂商前缀的属性放在哪

带前缀的属性不用列出：`-webkit-transition` 自动排在 `transition` 紧前面。
同一属性有多个前缀时，按 `-webkit-`、`-khtml-`、`-moz-`、`-ms-`、`-o-` 的顺序排列。
显式列出的带前缀属性则按它自己在列表中的位置排。

## 指定自定义属性的位置

自定义属性按全名匹配：列出 `--color` 才能决定它的位置。`--color` 永远不会匹配 `color`。
关键字 `$custom-property` 代表所有没有按名字列出的自定义属性。

## 没列出的属性放在哪

不在列表里的属性会放进末尾新开的一组，按源码中的顺序排列；设置 `"sort-order-fallback": "abc"` 后改为按字母顺序。
想把它们放到别处，就在列表里对应位置写 `"..."`：

```json
{ "sort-order": [["$variable"], ["position"], ["...", "border"], ["font"]] }
```

## 排列预处理器声明

在 Less、Sass 和 SCSS 中，下面这些关键字可以像属性名一样写进列表：

| 关键字 | 代表 |
| --- | --- |
| `$variable` | 变量声明 |
| `$include` | 所有没有按名字列出的 mixin 引入 |
| `$include mixin-name` | 引入该 mixin 的语句 |
| `$extend` | 继承（extend） |
| `$import` | `@import` |

```json
{ "sort-order": [["$variable"], ["$include"], ["top", "padding"], ["$include media"]] }
```

```scss
/* 排序前 */
p {
    padding: 0;
    @include media("desktop") {
        color: black;
    }
    $color: tomato;
    top: 0;
    @include mixin($color);
}

/* 排序后 */
p {
    $color: tomato;

    @include mixin($color);

    top: 0;
    padding: 0;

    @include media("desktop") {
        color: black;
    }
}
```

`@function` 的函数体永远不参与排序。

## 使用内置顺序

内置顺序沿用 [stylelint-config-recess-order](https://github.com/stormwarning/stylelint-config-recess-order)，分为定位、布局、盒模型、文字排版、交互、视觉、动效、分片（fragmentation，分页与分栏断行）几组。
recess-order 没有收录的属性按 [mdn-data](https://github.com/mdn/data) 补齐，放在最相近的属性旁边；`-webkit-font-smoothing` 这类只有带前缀写法的属性单独列出。
这份列表自动生成到 [src/config/sort-order.ts](../../src/config/sort-order.ts)，不要手改；要修改它，见[重新生成内置属性顺序](contributing.md#重新生成内置属性顺序)。
想在它的基础上定制，就从该文件复制到自己的配置里。
