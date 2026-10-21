# 节点类型

[English](../../docs/node-types.md) · **简体中文**

按节点类型遍历或修改语法树时查这一页：每种类型写明代表什么、哪些语法会产生它，并给出一段示例输入解析出的子树。
有些类型只出现在特定语法里，例如 `variable` 和 `mixin`。
示例只列出每个节点的 `type` 与 `content`；节点的其余属性和方法见 [API 参考](./api.md)。

- [arguments](#arguments)
- [atkeyword](#atkeyword)
- [atrule](#atrule)
- [attributeFlags](#attributeflags)
- [attributeMatch](#attributematch)
- [attributeName](#attributename)
- [attributeSelector](#attributeselector)
- [attributeValue](#attributevalue)
- [block](#block)
- [brackets](#brackets)
- [class](#class)
- [color](#color)
- [combinator](#combinator)
- [condition](#condition)
- [conditionalStatement](#conditionalstatement)
- [customProperty](#customproperty)
- [declaration](#declaration)
- [declarationDelimiter](#declarationdelimiter)
- [default](#default)
- [delimiter](#delimiter)
- [dimension](#dimension)
- [escapedString](#escapedstring)
- [expression](#expression)
- [extend](#extend)
- [function](#function)
- [functionsList](#functionslist)
- [global](#global)
- [id](#id)
- [ident](#ident)
- [important](#important)
- [include](#include)
- [interpolatedVariable](#interpolatedvariable)
- [interpolation](#interpolation)
- [keyframesSelector](#keyframesselector)
- [loop](#loop)
- [mixin](#mixin)
- [module](#module)
- [multilineComment](#multilinecomment)
- [namePrefix](#nameprefix)
- [namespacePrefix](#namespaceprefix)
- [namespaceSeparator](#namespaceseparator)
- [number](#number)
- [operator](#operator)
- [optional](#optional)
- [parentheses](#parentheses)
- [parentSelector](#parentselector)
- [parentSelectorExtension](#parentselectorextension)
- [percentage](#percentage)
- [placeholder](#placeholder)
- [progid](#progid)
- [property](#property)
- [propertyDelimiter](#propertydelimiter)
- [pseudoClass](#pseudoclass)
- [pseudoElement](#pseudoelement)
- [raw](#raw)
- [ruleset](#ruleset)
- [space](#space)
- [selector](#selector)
- [singlelineComment](#singlelinecomment)
- [string](#string)
- [stylesheet](#stylesheet)
- [typeSelector](#typeselector)
- [unicodeRange](#unicoderange)
- [universalSelector](#universalselector)
- [urange](#urange)
- [uri](#uri)
- [value](#value)
- [variable](#variable)
- [variablesList](#variableslist)

## arguments

### 说明

函数或 mixin 的参数列表，包含两侧的括号。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
()

// 语法树
{
  type: 'arguments',
  content: []
}
```

```js
// 输入
(a)

// 语法树
{
  type: 'arguments',
  content: [{
    type: 'ident',
    content: 'a'
  }]
}
```

## atkeyword

### 说明

以 `@` 开头的单词，通常出现在 @ 规则里。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
@import

// 语法树
{
  type: 'atkeyword',
  content: [{
    type: 'ident',
    content: 'import'
  }]
}
```

### 参考

[CSS 2.1](http://www.w3.org/TR/CSS21/syndata.html#tokenization)

## atrule

### 说明

@ 规则以 at-keyword 开头，即 `@` 后紧跟一个标识符（例如 `@import`、`@page`）。
规则从这里一直延续到下一个分号（`;`）或下一个块，以先出现的为准，并包含它。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
@import "subs.css";

// 语法树
{
  type: 'atrule',
  content: [{
    type: 'atkeyword',
    content: [{
      type: 'ident',
      content: 'import'
    }]
  }, {
    type: 'space',
    content: ' '
  }, {
    type: 'string',
    content: '"subs.css"'
  }]
}
```

### 参考

[CSS 2.1](http://www.w3.org/TR/CSS21/syndata.html#at-rules)

## attributeFlags

### 说明

属性选择器里切换大小写敏感的标识符。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
i

// 语法树
{
  type: 'attributeFlags',
  content: [{
    type: 'ident',
    content: 'i'
  }]
}
```

### 参考

[CSS Selectors Level 4](http://www.w3.org/TR/selectors4/#attribute-case)

## attributeMatch

### 说明

属性选择器里分隔属性名与属性值的字符。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
=

// 语法树
{
  type: 'attributeMatch',
  content: '='
}
```

### 参考

[CSS Selectors Level 4](http://www.w3.org/TR/selectors4/#grammar)

## attributeName

### 说明

属性选择器里的属性名。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
panda

// 语法树
{
  type: 'attributeName',
  content: [{
    type: 'ident',
    content: 'panda'
  }]
}
```

## attributeSelector

### 说明

方括号里的属性选择器：一个 `attributeName`，后面可以依次跟 `attributeMatch`、`attributeValue` 和 `attributeFlags`。方括号本身不是子节点。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
a=b

// 语法树
{
  type: 'attributeSelector',
  content: [{
    type: 'attributeName',
    content: [{
      type: 'ident',
      content: 'a'
    }]
  }, {
    type: 'attributeMatch',
    content: '=',
  }, {
    type: 'attributeValue',
    content: [{
      type: 'ident',
      content: 'b',
    }]
  }]
}
```

## attributeValue

### 说明

属性选择器里 `attributeMatch` 之后用来比较的值，内容是一个 `ident` 或 `string`。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
b

// 语法树
{
  type: 'attributeValue',
  content: [{
    type: 'ident',
    content: 'b',
  }]
}
```

## block

### 说明

规则集、@ 规则、mixin 或控制指令的主体，里面是声明、嵌套规则、空白和分隔符。CSS、Less 和 SCSS 的 `{` 与 `}` 不是子节点；缩进 Sass 的块就是缩进的那几行。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
{}

// 语法树
{
  type: 'block',
  content: []
}
```

```js
// 输入
{ }

// 语法树
{
  type: 'block',
  content: [{
    type: 'space',
    content: ' '
  }]
}
```

## brackets

### 说明

值里的方括号，例如 Sass 的方括号列表或 CSS grid 的网格线名；`content` 是方括号之间的内容。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
[]

// 语法树
{
  type: 'brackets',
  content: []
}
```

```js
// 输入
[1]

// 语法树
{
  type: 'brackets',
  content: [{
    type: 'number',
    content: '1',
  }]
}
```

## class

### 说明

类选择器 `.name`，点号不在 `content` 里。Less 也用它作 mixin 名（`.m()`）。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
.panda

// 语法树
{
  type: 'class',
  content: [{
    type: 'ident',
    content: 'panda'
  }]
}
```

## color

### 说明

十六进制颜色，例如 `#fff`；`content` 是去掉 `#` 的数字部分。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
#fff

// 语法树
{
  type: 'color',
  content: 'fff'
}
```

## combinator

### 说明

两个复合选择器之间的 `>`、`+` 或 `~`。后代组合符只是一个 `space` 节点。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
~(
	// 语法树
	{ type: "combinator", content: "~" }
);
```

## condition

### 说明

条件的头部：Sass 和 SCSS 里是 `@if`、`@else if` 或 `@else` 关键字连同其后的表达式，Less 里是 mixin 的 `when` 守卫。

适用语法：less、sass、scss。

### 示例

```js
// 输入
@if 1 > 2

// 语法树
{
  type: 'condition',
  content: [{
    type: 'atkeyword',
    content: [{
      type: 'ident',
      content: 'if'
    }],
  }, {
    type: 'space',
    content: ' '
  }, {
    type: 'number',
    content: '1'
  }, {
    type: 'space',
    content: ' '
  }, {
    type: 'operator',
    content: '>'
  }, {
    type: 'space',
    content: ' '
  }, {
    type: 'number',
    content: '2'
  }],
}
```

## conditionalStatement

### 说明

一个 `@if`、`@else if` 或 `@else` 分支，由 `condition` 和随后的 `block` 组成。一串分支中的每个分支都是单独的兄弟节点。

适用语法：sass、scss。

### 示例

```js
// 输入
@if 1 > 2 { color: tomato; }

// 语法树
{
  type: 'conditionalStatement',
  content: [{
    type: 'condition',
    content: [{
      type: 'atkeyword',
      content: [{
        type: 'ident',
        content: 'if'
      }]
    }, {
      type: 'space',
      content: ' '
    }, {
      type: 'number',
      content: '1'
    }, {
      type: 'space',
      content: ' '
    }, {
      type: 'operator',
      content: '>'
    }, {
      type: 'space',
      content: ' '
    }, {
      type: 'number',
      content: '2'
    }]
  }, {
    type: 'space',
    content: ' '
  }, {
    type: 'block',
    content: [{
      type: 'space',
      content: ' '
    }, {
      type: 'declaration',
      content: [{
        type: 'property',
        content: [{
          type: 'ident',
          content: 'color'
        }]
      }, {
        type: 'propertyDelimiter',
        content: ':'
      }, {
        type: 'space',
        content: ' '
      }, {
        type: 'value',
        content: [{
          type: 'ident',
          content: 'tomato'
        }]
      }]
    }, {
      type: 'declarationDelimiter',
      content: ';'
    }, {
      type: 'space',
      content: ' '
    }]
  }]
}
```

## customProperty

### 说明

声明中处在属性位置的自定义属性名（`--panda`）。开头的 `--` 不在 `content` 里，把树转回字符串时会补上。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
--panda

// 语法树
{
  type: 'customProperty',
  content: [{
    type: 'ident',
    content: 'panda'
  }]
}
```

### 参考

[CSS Custom Properties](https://www.w3.org/TR/css-variables-1/#defining-variables)

## declaration

### 说明

一组 `property: value`，由 `property`（或 `customProperty`）、`propertyDelimiter` 和 `value` 组成。变量赋值（`$a: 1`、`@a: 1`）和 Sass mixin 调用里的关键字参数也是声明。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
a:b

// 语法树
{
  type: 'declaration',
  content: [{
    type: 'property',
    content: [{
      type: 'ident',
      content: 'a'
    }]
  }, {
    type: 'propertyDelimiter',
    content: ':'
  }, {
    type: 'value',
    content: [{
      type: 'ident',
      content: 'b'
    }]
  }]
}
```

## declarationDelimiter

### 说明

结束一条声明或语句的 `;`；缩进 Sass 里是结束它的换行。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
;

// 语法树
{
  type: 'declarationDelimiter',
  content: ';'
}
```

## default

### 说明

Sass 变量赋值后的 `!default` 标记。

适用语法：sass、scss。

### 示例

```js
// 输入
!default

// 语法树
{
  type: 'default',
  content: '!default'
}
```

## delimiter

### 说明

逗号分隔符：用在规则集的多个选择器之间、`unicodeRange` 的各个范围之间，以及 Sass 和 SCSS 的参数之间。CSS 和 Less 的值与函数参数里的逗号是 `operator` 节点。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
,

// 语法树
{
  type: 'delimiter',
  content: ','
}
```

## dimension

### 说明

带单位的数字：一个 `number` 后跟表示单位的 `ident`。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
10px

// 语法树
{
  type: 'dimension',
  content: [{
    type: 'number',
    content: '10'
  }, {
    type: 'ident',
    content: 'px'
  }]
}
```

## escapedString

### 说明

Less 的转义字符串 `~"..."`；`content` 是去掉 `~` 的带引号字符串。

适用语法：less。

### 示例

```js
// 输入
~"nani"

// 语法树
{
  type: 'escapedString',
  content: '"nani"'
}
```

## expression

### 说明

旧版 Internet Explorer 的 `expression()` 值；`content` 是括号里的全部文本，作为一个字符串。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
expression()

// 语法树
{
  type: 'expression',
  content: ''
}
```

## extend

### 说明

Sass 和 SCSS 写成 `@extend` 规则，被继承的选择器是一个 `selector` 节点；Less 在块内写成 `&:extend()`。

适用语法：less、sass、scss。

### 示例

```js
// 输入
@extend .nani

// 语法树
{
  type: 'extend',
  content: [{
    type: 'atkeyword',
    content: [{
      type: 'ident',
      content: 'extend'
    }]
  }, {
    type: 'space',
    content: ' '
  }, {
    type: 'selector',
    content: [{
      type: 'class',
      content: [{
        type: 'ident',
        content: 'nani'
      }]
    }]
  }]
}
```

```js
// 输入
&:extend(.nani)

// 语法树
{
  type: 'extend',
  content: [{
    type: 'parentSelector',
    content: '&'
  }, {
    type: 'pseudoClass',
    content: [{
      type: 'ident',
      content: 'extend'
    }, {
      type: 'arguments',
      content: [{
        type: 'selector',
        content: [{
          type: 'class',
          content: [{
            type: 'ident',
            content: 'nani'
          }]
        }]
      }]
    }]
  }]
}
```

## function

### 说明

函数调用：名称是一个 `ident`，后跟 `arguments`。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
f(5)

// 语法树
{
  type: 'function',
  content: [{
    type: 'ident',
    content: 'f'
  }, {
    type: 'arguments',
    content: [{
      type: 'number',
      content: '5'
    }]
  }]
}
```

## functionsList

### 说明

后跟 `...` 的函数调用，作为参数传入时把函数返回的列表展开成多个参数。

适用语法：sass、scss。

### 示例

```js
// 输入
f(a)...

// 语法树
{
  type: 'functionsList',
  content: [{
    type: 'function',
    content: [{
      type: 'ident',
      content: 'f'
    }, {
      type: 'arguments',
      content: [{
        type: 'ident',
        content: 'a'
      }]
    }]
  }]
}
```

## global

### 说明

Sass 变量赋值后的 `!global` 标记。

适用语法：sass、scss。

### 示例

```js
// 输入
!global

// 语法树
{
  type: 'global',
  content: '!global'
}
```

## id

### 说明

ID 选择器 `#name`，`#` 不在 `content` 里。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
#id

// 语法树
{
  type: 'id',
  content: [{
    type: 'ident',
    content: 'id'
  }]
}
```

## ident

### 说明

标识符：关键字、属性名、单位，或选择器、变量、函数里的名称。大多数带名称的节点都以它为叶子。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
panda

// 语法树
{
  type: 'ident',
  content: 'panda'
}
```

## important

### 说明

值后面的 `!important` 标记；Less 里也可以跟在 mixin 调用后面。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
!important

// 语法树
{
  type: 'important',
  content: '!important'
}
```

## include

### 说明

mixin 调用：Sass 和 SCSS 写作 `@include name`，缩进 Sass 写作 `+name`，Less 在块内写作 `.name;` 或 `.name();`。

适用语法：less、sass、scss。

### 示例

```js
// 输入
@include nani

// 语法树
{
  type: 'include',
  content: [{
    type: 'atkeyword',
    content: [{
      type: 'ident',
      content: 'include'
    }]
  }, {
    type: 'space',
    content: ' '
  }, {
    type: 'ident',
    content: 'nani'
  }]
}
```

## interpolatedVariable

### 说明

Less 的变量插值 `@{name}`，例如出现在选择器或属性名里。

适用语法：less。

### 示例

```js
// 输入
@{nani}

// 语法树
{
  type: 'interpolatedVariable',
  content: [{
    type: 'ident',
    content: 'nani'
  }]
}
```

## interpolation

### 说明

Sass 插值 `#{...}`；`content` 是花括号里的表达式。

适用语法：sass、scss。

### 示例

```js
// 输入
#{$nani}

// 语法树
{
  type: 'interpolation',
  content: [{
    type: 'variable',
    content: [{
      type: 'ident',
      content: 'nani'
    }]
  }]
}
```

## keyframesSelector

### 说明

keyframes 动画里的选择器，取值是 `from`、`to` 或任意百分比。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
from

// 语法树
{
  type: 'keyframesSelector',
  content: [{
    type: 'ident',
    content: 'from'
  }]
}
```

### 参考

[Keyframes 规范](http://www.w3.org/TR/css3-animations/#keyframes)

## loop

### 说明

Sass 的循环指令 `@for`、`@each` 或 `@while`，连同其表达式与 `block`。

适用语法：sass、scss。

### 示例

```js
// 输入
@while 1 > 2 {a{p:v}}

// 语法树
{
  type: 'loop',
  content: [{
    type: 'atkeyword',
    content: [{
      type: 'ident',
      content: 'while'
    }]
  }, {
    type: 'space',
    content: ' '
  }, {
    type: 'number',
    content: '1'
  }, {
    type: 'space',
    content: ' '
  }, {
    type: 'operator',
    content: '>'
  }, {
    type: 'space',
    content: ' '
  }, {
    type: 'number',
    content: '2'
  }, {
    type: 'space',
    content: ' '
  }, {
    type: 'block',
    content: [{
      type: 'ruleset',
      content: [{
        type: 'selector',
        content: [{
          type: 'typeSelector',
          content: [{
            type: 'ident',
            content: "a"
          }]
        }]
      }, {
        type: 'block',
        content: [{
          type: 'declaration',
          content: [{
            type: 'property',
            content: [{
              type: 'ident',
              content: 'p'
            }]
          }, {
            type: 'propertyDelimiter',
            content: ':'
          }, {
            type: 'value',
            content: [{
              type: 'ident',
              content: 'v'
            }]
          }]
        }]
      }]
    }]
  }]
}
```

## mixin

### 说明

mixin 定义：Sass 和 SCSS 写作 `@mixin name`，缩进 Sass 写作 `=name`，Less 是带 `arguments` 和 `block` 的类或 ID。

适用语法：less、sass、scss。

### 示例

```js
// 输入
@mixin nani {color:tomato}

// 语法树
{
  type: 'mixin',
  content: [{
    type: 'atkeyword',
    content: [{
      type: 'ident',
      content: 'mixin'
    }]
  }, {
    type: 'space',
    content: ' '
  }, {
    type: 'ident',
    content: 'nani'
  }, {
    type: 'space',
    content: ' '
  }, {
    type: 'block',
    content: [{
      type: 'declaration',
      content: [{
        type: 'property',
        content: [{
          type: 'ident',
          content: 'color'
        }]
      }, {
        type: 'propertyDelimiter',
        content: ':'
      }, {
        type: 'value',
        content: [{
          type: 'ident',
          content: 'tomato'
        }]
      }]
    }]
  }]
}
```

## module

### 说明

Sass 模块成员的命名空间，即 `math.div()`、`math.$pi` 或 `@include math.foo` 里的 `math.`。它紧挨在所限定的变量、函数或 mixin 名之前。`content` 里只有那个 `ident`，点号没有对应的子节点，但落在节点的 `start`–`end` 范围内，`toString()` 返回 `math.`。

适用语法：sass、scss。

### 示例

```js
// 输入
math.$pi
// 语法树
[
	({ type: "module", content: [{ type: "ident", content: "math" }] },
	{ type: "variable", content: [{ type: "ident", content: "pi" }] })
];
```

```js
// 输入
+ns.foo

// 语法树
{
  type: 'include',
  content: [{
    type: 'operator',
    content: '+'
  }, {
    type: 'module',
    content: [{
      type: 'ident',
      content: 'ns'
    }]
  }, {
    type: 'ident',
    content: 'foo'
  }]
}
```

## multilineComment

### 说明

`/* ... */` 注释；`content` 是去掉首尾标记的文本。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
/*test*/

// 语法树
{
  type: 'multilineComment',
  content: 'test'
}
```

## namePrefix

### 说明

类型选择器或通配选择器的命名空间前缀（`ns|`），由 `namespacePrefix` 和 `namespaceSeparator` 组成。命名空间为空时（`|a`）只含分隔符。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
panda |
	// 语法树
	{
		type: "namePrefix",
		content: [
			{ type: "namespacePrefix", content: [{ type: "ident", content: "panda" }] },
			{ type: "namespaceSeparator", content: "|" },
		],
	};
```

## namespacePrefix

### 说明

`namePrefix` 里 `|` 之前的命名空间名。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
panda

// 语法树
{
  type: 'namespacePrefix',
  content: [{
    type: 'ident',
    content: 'panda'
  }]
}
```

## namespaceSeparator

### 说明

命名空间与名称之间的 `|`。用 `context: 'namespace'` 解析 `|` 得到的就是这个节点。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
|

// 语法树
{
  type: 'namespaceSeparator',
  content: '|'
}
```

## number

### 说明

不带单位的数字。值里开头的 `-` 是单独的 `operator` 节点。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
10

// 语法树
{
  type: 'number',
  content: '10'
}
```

## operator

### 说明

值或表达式里没有专属类型的符号，例如 `/`、`+`、`-`、`*`、`=`、`>`，CSS 和 Less 值里的逗号，以及媒体查询括号里的 `:`。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
/

// 语法树
{
  type: 'operator',
  content: '/'
}
```

## optional

### 说明

Sass `@extend` 后面的 `!optional` 标记。

适用语法：sass、scss。

### 示例

```js
// 输入
!optional

// 语法树
{
  type: 'optional',
  content: '!optional'
}
```

## parentheses

### 说明

值、表达式或媒体查询里用圆括号括起的部分；`content` 是括号之间的内容。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
(1)

// 语法树
{
  type: 'parentheses',
  content: [{
    type: 'number',
    content: '1'
  }]
}
```

## parentSelector

### 说明

嵌套规则里代表父选择器的 `&`。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
&

// 语法树
{
  type: 'parentSelector',
  content: '&'
}
```

## parentSelectorExtension

### 说明

紧跟在 `&` 之后、编译时不会成为独立选择器的部分，由 `ident` 与 `number` 任意组合而成。

适用语法：less、sass、scss。

### 示例

```js
// 输入
&2-panda

// 语法树
{
  type: 'selector',
  content: [{
    type: 'parentSelector',
    content: '&'
  }, {
    type: 'parentSelectorExtension',
    content: [{
      type: 'number',
      content: '2'
    }, {
      type: 'ident',
      content: '-panda'
    }]
  }]
}
```

## percentage

### 说明

后跟 `%` 的数字，`content` 里是那个 `number`。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
10 %
	// 语法树
	{ type: "percentage", content: [{ type: "number", content: "10" }] };
```

## placeholder

### 说明

Sass 的占位选择器 `%name`，用作规则的选择器或 `@extend` 的目标。

适用语法：sass、scss。

### 示例

```js
// 输入
%nani

// 语法树
{
  type: 'placeholder',
  content: [{
    type: 'ident',
    content: 'nani'
  }]
}
```

## progid

### 说明

以 `progid:DXImageTransform.Microsoft.` 开头的旧版 Internet Explorer 滤镜。整个调用连同参数是一个字符串。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
progid:DXImageTransform.Microsoft.Alpha(Opacity=80)

// 语法树
{
  type: 'progid',
  content: 'progid:DXImageTransform.Microsoft.Alpha(Opacity=80)'
}
```

## property

### 说明

声明里的属性名。变量赋值时，它的内容是那个 `variable`。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
color

// 语法树
{
  type: 'property',
  content: [{
    type: 'ident',
    content: 'color'
  }]
}
```

## propertyDelimiter

### 说明

属性与值之间的 `:`。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
:

// 语法树
{
  type: 'propertyDelimiter',
  content: ':'
}
```

## pseudoClass

### 说明

伪类 `:name`，带参数时后跟 `arguments`；冒号不在 `content` 里。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
:nth-child(2n+1)

// 语法树
{
  type: 'pseudoClass',
  content: [{
    type: 'ident',
    content: 'nth-child'
  }, {
    type: 'arguments',
    content: [{
      type: 'number',
      content: '2'
    }, {
      type: 'ident',
      content: 'n'
    }, {
      type: 'operator',
      content: '+'
    }, {
      type: 'number',
      content: '1'
    }]
  }]
}
```

## pseudoElement

### 说明

用两个冒号写的伪元素 `::name`。单冒号写法（`:before`）解析为 `pseudoClass`。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
::after

// 语法树
{
  type: 'pseudoElement',
  content: [{
    type: 'ident',
    content: 'after'
  }]
}
```

## raw

### 说明

解析器不再细分、按原样保留的源码文本。
`syntax` 为 `'css'` 或 `'less'` 时，无法识别的语句各自成为一个 `raw` 节点，不报解析错误；想拿到错误就传 `recover: false`（见 [API 参考](./api.md)）。在 SCSS 和缩进 Sass 里，自定义属性的值如果不是普通值（如 `--x: {a: b}`），整个值是一个 `raw` 节点；CSS 和 Less 会继续把它解析成子节点。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
}

// 语法树
{
  type: 'raw',
  content: '}'
}
```

## ruleset

### 说明

一条样式规则：一个或多个 `selector`，彼此以 `delimiter` 和 `space` 分隔，最后是一个 `block`。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
a{color:tomato}

// 语法树
{
  type: 'ruleset',
  content: [{
    type: 'selector',
    content: [{
      type: 'typeSelector',
      content: [{
        type: 'ident',
        content: 'a'
      }]
    }]
  }, {
    type: 'block',
    content: [{
      type: 'declaration',
      content: [{
        type: 'property',
        content: [{
          type: 'ident',
          content: 'color'
        }]
      }, {
        type: 'propertyDelimiter',
        content: ':'
      }, {
        type: 'value',
        content: [{
          type: 'ident',
          content: 'tomato'
        }]
      }]
    }]
  }]
}
```

## space

### 说明

一段连续空白（空格、制表符、换行），按原样保留。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入


// 语法树
{
  type: 'space',
  content: '  '
}
```

## selector

### 说明

规则里的一个复杂选择器，由复合选择器、组合符和空白组成。逗号分隔的选择器列表在 `ruleset` 里是多个并列的 `selector`。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
.panda

// 语法树
{
  type: 'selector',
  content: [{
    type: 'class',
    content: [{
      type: 'ident',
      content: 'panda'
    }]
  }]
}
```

## singlelineComment

### 说明

从 `//` 到行尾的注释；`content` 是 `//` 之后的文本。

适用语法：less、sass、scss。

### 示例

```js
// 输入
//panda

// 语法树
{
  type: 'singlelineComment',
  content: 'panda'
}
```

## string

### 说明

带引号的字符串，引号也在 `content` 里。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
"test"

// 语法树
{
  type: 'string',
  content: '"test"',
}
```

## stylesheet

### 说明

用默认的 `stylesheet` context 解析时语法树的根节点，里面是顶层的规则、语句、注释和空白。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
a {color: tomato} div {color: potato}

// 语法树
{
  type: 'stylesheet',
  content: [{
    type: 'ruleset',
    content: [{
      type: 'selector',
      content: [{
        type: 'typeSelector',
        content: [{
          type: 'ident',
          content: 'a'
        }]
      }]
    }, {
      type: 'space',
      content: ' '
    }, {
      type: 'block',
      content: [{
        type: 'declaration',
        content: [{
          type: 'property',
          content: [{
            type: 'ident',
            content: 'color'
          }]
        }, {
          type: 'propertyDelimiter',
          content: ':'
        }, {
          type: 'space',
          content: ' '
        }, {
          type: 'value',
          content: [{
            type: 'ident',
            content: 'tomato'
          }]
        }]
      }]
    }]
  }, {
    type: 'space',
    content: ' '
  }, {
    type: 'ruleset',
    content: [{
      type: 'selector',
      content: [{
        type: 'typeSelector',
        content: [{
          type: 'ident',
          content: 'div'
        }]
      }]
    }, {
      type: 'space',
      content: ' '
    }, {
      type: 'block',
      content: [{
        type: 'declaration',
        content: [{
          type: 'property',
          content: [{
            type: 'ident',
            content: 'color'
          }]
        }, {
          type: 'propertyDelimiter',
          content: ':'
        }, {
          type: 'space',
          content: ' '
        }, {
          type: 'value',
          content: [{
            type: 'ident',
            content: 'potato'
          }]
        }]
      }]
    }]
  }]
}
```

## typeSelector

### 说明

元素（类型）选择器，例如 `div`，前面可以带 `namePrefix`。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
div

// 语法树
{
  type: 'typeSelector',
  content: [{
    type: 'ident',
    content: 'div'
  }]
}
```

## unicodeRange

### 说明

`unicode-range` 描述符的值：一个或多个 `urange`，彼此以 `delimiter` 和 `space` 分隔。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
U+A5, U+4E00-9FFF

// 语法树
{
  type: 'unicodeRange',
  content: [{
    type: 'urange',
    content: 'U+A5',
  },
  {
    type: 'delimiter',
    content: ','
  },
  {
    type: 'space',
    content: ' '
  },
  {
    type: 'urange',
    content: 'U+4E00-9FFF',
  }]
}
```

## universalSelector

### 说明

`*` 选择器，前面可以带命名空间前缀。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
*

// 语法树
{
  type: 'universalSelector',
  content: []
}
```

```js
// 输入
ns|*

// 语法树
{
  type: 'universalSelector',
  content: [{
    type: 'namePrefix',
    content: [{
      type: 'namespacePrefix',
      content: [{
        type: 'ident',
        content: 'ns'
      }]
    }, {
      type: 'namespaceSeparator',
      content: '|'
    }]
  }]
}
```

### 参考

[CSS Selectors Level 3](https://www.w3.org/TR/css3-selectors/#universal-selector)

## urange

### 说明

一个 Unicode 范围，例如 `U+4E00-9FFF`，作为一个字符串。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
U+A5

// 语法树
{
  type: 'urange',
  content: 'U+A5',
}
```

## uri

### 说明

`url()` 值；URL 带引号时 `content` 是一个 `string`，不带引号时是一个 `raw` 节点。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
url("http://test.com")

// 语法树
{
  type: 'uri',
  content: [{
    type: 'string',
    content: '"http://test.com"'
  }]
}
```

## value

### 说明

声明的值：`propertyDelimiter` 及其后空白之后的全部内容。

适用语法：css、less、sass、scss。

### 示例

```js
// 输入
tomato

// 语法树
{
  type: 'value',
  content: [{
    type: 'ident',
    content: 'tomato'
  }]
}
```

## variable

### 说明

变量：Sass 和 SCSS 写作 `$name`，Less 写作 `@name`；`content` 是去掉 `$` 或 `@` 的名称。

适用语法：less、sass、scss。

### 示例

```js
// 输入
$panda

// 语法树
{
  type: 'variable',
  content: [{
    type: 'ident',
    content: 'panda'
  }]
}
```

## variablesList

### 说明

后跟 `...` 的变量，用作剩余参数，或把列表展开成多个参数。Less 写作 `@colors`，Sass 和 SCSS 写作 `$colors`。

适用语法：less、sass、scss。

### 示例

```js
// 输入
$colors...

// 语法树
{
  type: 'variablesList',
  content: [{
    type: 'variable',
    content: [{
      type: 'ident',
      content: 'colors'
    }]
  }]
}
```
