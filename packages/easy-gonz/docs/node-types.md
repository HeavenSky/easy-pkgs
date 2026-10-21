# Node types

**English** · [简体中文](../zh/docs/node-types.md)

Look up a node type here when you walk or modify a parse tree: each entry says
what the node stands for, which syntaxes produce it and what its subtree looks
like for a sample input.
Some types, for example `variable` and `mixin`, appear only in specific syntaxes.
Examples show only each node's `type` and `content`; every node also has the
properties and methods listed in the [API reference](./api.md).

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

### Description

A list of function/mixin arguments, including parentheses.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
()

// Parse tree
{
  type: 'arguments',
  content: []
}
```

```js
// String
(a)

// Parse tree
{
  type: 'arguments',
  content: [{
    type: 'ident',
    content: 'a'
  }]
}
```

## atkeyword

### Description

Word that starts with a `@`, usually used in @-rules.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
@import

// Parse tree
{
  type: 'atkeyword',
  content: [{
    type: 'ident',
    content: 'import'
  }]
}
```

### References

[CSS 2.1](http://www.w3.org/TR/CSS21/syndata.html#tokenization)

## atrule

### Description

At-rules start with an at-keyword, an '@' character followed immediately by an identifier (for example, '@import', '@page').
An at-rule consists of everything up to and including the next semicolon (;) or the next block, whichever comes first.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
@import "subs.css";

// Parse tree
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

### References

[CSS 2.1](http://www.w3.org/TR/CSS21/syndata.html#at-rules)

## attributeFlags

### Description

An identifier used to toggle case-sensitivity in attribute selectors.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
i

// Parse tree
{
  type: 'attributeFlags',
  content: [{
    type: 'ident',
    content: 'i'
  }]
}
```

### References

[CSS Selectors Level 4](http://www.w3.org/TR/selectors4/#attribute-case)

## attributeMatch

### Description

A group of characters separating attribute name and attribute value.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
=

// Parse tree
{
  type: 'attributeMatch',
  content: '='
}
```

### References

[CSS Selectors Level 4](http://www.w3.org/TR/selectors4/#grammar)

## attributeName

### Description

Attribute selector's name.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
panda

// Parse tree
{
  type: 'attributeName',
  content: [{
    type: 'ident',
    content: 'panda'
  }]
}
```

## attributeSelector

### Description

An attribute selector between `[` and `]`: an `attributeName`, optionally
followed by an `attributeMatch`, an `attributeValue` and `attributeFlags`. The
brackets are not child nodes.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
a=b

// Parse tree
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

### Description

The value an attribute selector compares against, after the `attributeMatch`; it
holds an `ident` or a `string`.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
b

// Parse tree
{
  type: 'attributeValue',
  content: [{
    type: 'ident',
    content: 'b',
  }]
}
```

## block

### Description

The body of a ruleset, at-rule, mixin or control directive: declarations, nested
rules, spaces and delimiters. In CSS, Less and SCSS the `{` and `}` are not
child nodes; in indented Sass the block is the indented lines.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
{}

// Parse tree
{
  type: 'block',
  content: []
}
```

```js
// String
{ }

// Parse tree
{
  type: 'block',
  content: [{
    type: 'space',
    content: ' '
  }]
}
```

## brackets

### Description

Square brackets in a value, such as a Sass bracketed list or CSS grid line
names; `content` is what is between them.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
[]

// Parse tree
{
  type: 'brackets',
  content: []
}
```

```js
// String
[1]

// Parse tree
{
  type: 'brackets',
  content: [{
    type: 'number',
    content: '1',
  }]
}
```

## class

### Description

A class selector `.name`; the dot is not part of `content`. Less also uses it as
a mixin name (`.m()`).

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
.panda

// Parse tree
{
  type: 'class',
  content: [{
    type: 'ident',
    content: 'panda'
  }]
}
```

## color

### Description

A hex color such as `#fff`; `content` is the digits without the `#`.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
#fff

// Parse tree
{
  type: 'color',
  content: 'fff'
}
```

## combinator

### Description

A `>`, `+` or `~` between two compound selectors. The descendant combinator is
just a `space` node.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
~(
	// Parse tree
	{ type: "combinator", content: "~" }
);
```

## condition

### Description

The head of a conditional: in Sass and SCSS the `@if`, `@else if` or `@else`
keyword with its expression; in Less the `when` guard of a mixin.

Used in syntaxes: less, sass, scss.

### Examples

```js
// String
@if 1 > 2

// Parse tree
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

### Description

One `@if`, `@else if` or `@else` branch: a `condition` followed by its `block`.
Each branch of a chain is a separate sibling node.

Used in syntaxes: sass, scss.

### Examples

```js
// String
@if 1 > 2 { color: tomato; }

// Parse tree
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

### Description

Name of a custom property (`--panda`) in the property position of a
declaration. The leading `--` is not part of `content`; it is added back when
the tree is turned into a string.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
--panda

// Parse tree
{
  type: 'customProperty',
  content: [{
    type: 'ident',
    content: 'panda'
  }]
}
```

### References

[CSS Custom Properties](https://www.w3.org/TR/css-variables-1/#defining-variables)

## declaration

### Description

A `property: value` pair: a `property` (or `customProperty`), a
`propertyDelimiter` and a `value`. Variable assignments (`$a: 1`, `@a: 1`) and
Sass keyword arguments in a mixin call are declarations too.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
a:b

// Parse tree
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

### Description

The `;` that ends a declaration or statement; in indented Sass, the line break
that ends it.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
;

// Parse tree
{
  type: 'declarationDelimiter',
  content: ';'
}
```

## default

### Description

The `!default` flag of a Sass variable assignment.

Used in syntaxes: sass, scss.

### Examples

```js
// String
!default

// Parse tree
{
  type: 'default',
  content: '!default'
}
```

## delimiter

### Description

A comma that separates the selectors of a ruleset, the ranges of a
`unicodeRange`, and arguments in Sass and SCSS. Commas in CSS and Less values
and function arguments are `operator` nodes.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
,

// Parse tree
{
  type: 'delimiter',
  content: ','
}
```

## dimension

### Description

A number with a unit: a `number` followed by an `ident` holding the unit.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
10px

// Parse tree
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

### Description

A Less escaped string `~"..."`; `content` is the quoted string without the `~`.

Used in syntaxes: less.

### Examples

```js
// String
~"nani"

// Parse tree
{
  type: 'escapedString',
  content: '"nani"'
}
```

## expression

### Description

A legacy Internet Explorer `expression()` value; `content` is the text between
the parentheses as one string.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
expression()

// Parse tree
{
  type: 'expression',
  content: ''
}
```

## extend

### Description

Sass and SCSS write it as an `@extend` rule; the extended selector is a
`selector` node. Less writes it as `&:extend()` inside a block.

Used in syntaxes: less, sass, scss.

### Examples

```js
// String
@extend .nani

// Parse tree
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
// String
&:extend(.nani)

// Parse tree
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

### Description

A function call: the name as an `ident`, followed by `arguments`.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
f(5)

// Parse tree
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

### Description

A function call followed by `...`, passed as an argument to spread the list it
returns into separate arguments.

Used in syntaxes: sass, scss.

### Examples

```js
// String
f(a)...

// Parse tree
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

### Description

The `!global` flag of a Sass variable assignment.

Used in syntaxes: sass, scss.

### Examples

```js
// String
!global

// Parse tree
{
  type: 'global',
  content: '!global'
}
```

## id

### Description

An ID selector `#name`; the `#` is not part of `content`.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
#id

// Parse tree
{
  type: 'id',
  content: [{
    type: 'ident',
    content: 'id'
  }]
}
```

## ident

### Description

An identifier: a keyword, property name, unit or the name inside a selector,
variable or function. It is the leaf of most named nodes.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
panda

// Parse tree
{
  type: 'ident',
  content: 'panda'
}
```

## important

### Description

The `!important` flag after a value; in Less it can also follow a mixin call.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
!important

// Parse tree
{
  type: 'important',
  content: '!important'
}
```

## include

### Description

A mixin call: `@include name` in Sass and SCSS, `+name` in indented Sass,
`.name;` or `.name();` inside a Less block.

Used in syntaxes: less, sass, scss.

### Examples

```js
// String
@include nani

// Parse tree
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

### Description

Less variable interpolation `@{name}`, for example in a selector or property
name.

Used in syntaxes: less.

### Examples

```js
// String
@{nani}

// Parse tree
{
  type: 'interpolatedVariable',
  content: [{
    type: 'ident',
    content: 'nani'
  }]
}
```

## interpolation

### Description

Sass interpolation `#{...}`; `content` is the expression between the braces.

Used in syntaxes: sass, scss.

### Examples

```js
// String
#{$nani}

// Parse tree
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

### Description

Selector used in keyframes animations.
May be one of the following: `from`, `to` or any percentage.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
from

// Parse tree
{
  type: 'keyframesSelector',
  content: [{
    type: 'ident',
    content: 'from'
  }]
}
```

### References

[Keyframes spec](http://www.w3.org/TR/css3-animations/#keyframes)

## loop

### Description

A Sass loop directive, `@for`, `@each` or `@while`, with its expression and
`block`.

Used in syntaxes: sass, scss.

### Examples

```js
// String
@while 1 > 2 {a{p:v}}

// Parse tree
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

### Description

A mixin definition: `@mixin name` in Sass and SCSS, `=name` in indented Sass, a
class or ID with `arguments` and a `block` in Less.

Used in syntaxes: less, sass, scss.

### Examples

```js
// String
@mixin nani {color:tomato}

// Parse tree
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

### Description

Namespace of a Sass module member (`math.` in `math.div()`, `math.$pi` or
`@include math.foo`). It precedes the variable, function or mixin name it
qualifies. `content` holds only the `ident`: the dot has no child node, but it
lies inside the node's `start`–`end` range and `toString()` returns `math.`.

Used in syntaxes: sass, scss.

### Examples

```js
// String
math.$pi
// Parse tree
[
	({ type: "module", content: [{ type: "ident", content: "math" }] },
	{ type: "variable", content: [{ type: "ident", content: "pi" }] })
];
```

```js
// String
+ns.foo

// Parse tree
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

### Description

A `/* ... */` comment; `content` is the text without the delimiters.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
/*test*/

// Parse tree
{
  type: 'multilineComment',
  content: 'test'
}
```

## namePrefix

### Description

The namespace prefix of a type or universal selector (`ns|`): a
`namespacePrefix` followed by a `namespaceSeparator`. With an empty namespace
(`|a`) it holds only the separator.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
panda |
	// Parse tree
	{
		type: "namePrefix",
		content: [
			{ type: "namespacePrefix", content: [{ type: "ident", content: "panda" }] },
			{ type: "namespaceSeparator", content: "|" },
		],
	};
```

## namespacePrefix

### Description

The namespace name before the `|` in a `namePrefix`.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
panda

// Parse tree
{
  type: 'namespacePrefix',
  content: [{
    type: 'ident',
    content: 'panda'
  }]
}
```

## namespaceSeparator

### Description

The `|` between a namespace and a name. Parsing `|` with `context: 'namespace'`
returns this node.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
|

// Parse tree
{
  type: 'namespaceSeparator',
  content: '|'
}
```

## number

### Description

A number without a unit. In a value, a leading `-` is a separate `operator`
node.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
10

// Parse tree
{
  type: 'number',
  content: '10'
}
```

## operator

### Description

Punctuation in a value or expression that has no node type of its own, such as
`/`, `+`, `-`, `*`, `=`, `>`, a comma in CSS and Less values, or `:` inside
media query parentheses.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
/

// Parse tree
{
  type: 'operator',
  content: '/'
}
```

## optional

### Description

The `!optional` flag of a Sass `@extend`.

Used in syntaxes: sass, scss.

### Examples

```js
// String
!optional

// Parse tree
{
  type: 'optional',
  content: '!optional'
}
```

## parentheses

### Description

A parenthesized group in a value, expression or media query; `content` is what
is between the parentheses.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
(1)

// Parse tree
{
  type: 'parentheses',
  content: [{
    type: 'number',
    content: '1'
  }]
}
```

## parentSelector

### Description

The `&` that stands for the parent selector in a nested rule.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
&

// Parse tree
{
  type: 'parentSelector',
  content: '&'
}
```

## parentSelectorExtension

### Description

Part that comes immediately after `&` but does not get compiled to a separate
selector. Consists of any combination of `ident` or `number`.

Used in syntaxes: less, sass, scss.

### Examples

```js
// String
&2-panda

// Parse tree
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

### Description

A number followed by `%`; `content` holds the `number`.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
10 %
	// Parse tree
	{ type: "percentage", content: [{ type: "number", content: "10" }] };
```

## placeholder

### Description

A Sass placeholder selector `%name`, used as a rule selector or as the target of
`@extend`.

Used in syntaxes: sass, scss.

### Examples

```js
// String
%nani

// Parse tree
{
  type: 'placeholder',
  content: [{
    type: 'ident',
    content: 'nani'
  }]
}
```

## progid

### Description

Legacy Internet Explorer filter that starts with
`progid:DXImageTransform.Microsoft.`. The whole call, arguments included, is one
string.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
progid:DXImageTransform.Microsoft.Alpha(Opacity=80)

// Parse tree
{
  type: 'progid',
  content: 'progid:DXImageTransform.Microsoft.Alpha(Opacity=80)'
}
```

## property

### Description

The property name of a declaration. In a variable assignment it holds the
`variable`.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
color

// Parse tree
{
  type: 'property',
  content: [{
    type: 'ident',
    content: 'color'
  }]
}
```

## propertyDelimiter

### Description

The `:` between a property and its value.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
:

// Parse tree
{
  type: 'propertyDelimiter',
  content: ':'
}
```

## pseudoClass

### Description

A pseudo-class `:name`, with `arguments` when it takes any; the colon is not
part of `content`.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
:nth-child(2n+1)

// Parse tree
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

### Description

A pseudo-element written with two colons, `::name`. The single-colon form
(`:before`) is a `pseudoClass`.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
::after

// Parse tree
{
  type: 'pseudoElement',
  content: [{
    type: 'ident',
    content: 'after'
  }]
}
```

## raw

### Description

Source text kept as written because the parser does not break it down.
With `syntax: 'css'` or `'less'`, each statement the parser cannot recognize
becomes a `raw` node instead of a parsing error; pass `recover: false` to get
the error (see the [API reference](./api.md)). In SCSS and indented Sass, when
a custom property value is not a plain value (`--x: {a: b}`), the whole value
is one `raw` node; CSS and Less parse it into nodes.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
}

// Parse tree
{
  type: 'raw',
  content: '}'
}
```

## ruleset

### Description

A style rule: one or more `selector` nodes, separated by `delimiter` and
`space`, followed by a `block`.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
a{color:tomato}

// Parse tree
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

### Description

A run of whitespace (spaces, tabs, line breaks), kept as written.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String


// Parse tree
{
  type: 'space',
  content: '  '
}
```

## selector

### Description

One complex selector of a rule: compound selectors, combinators and spaces. A
comma-separated selector list is several `selector` siblings inside the
`ruleset`.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
.panda

// Parse tree
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

### Description

A `//` comment that runs to the end of the line; `content` is the text after
`//`.

Used in syntaxes: less, sass, scss.

### Examples

```js
// String
//panda

// Parse tree
{
  type: 'singlelineComment',
  content: 'panda'
}
```

## string

### Description

A quoted string; the quotes are part of `content`.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
"test"

// Parse tree
{
  type: 'string',
  content: '"test"',
}
```

## stylesheet

### Description

The root node of the tree when you parse with the default `stylesheet` context;
it holds the top-level rules, statements, comments and spaces.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
a {color: tomato} div {color: potato}

// Parse tree
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

### Description

An element (type) selector such as `div`, optionally with a `namePrefix`.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
div

// Parse tree
{
  type: 'typeSelector',
  content: [{
    type: 'ident',
    content: 'div'
  }]
}
```

## unicodeRange

### Description

The value of a `unicode-range` descriptor: one or more `urange` nodes separated
by `delimiter` and `space`.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
U+A5, U+4E00-9FFF

// Parse tree
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

### Description

The `*` selector, optionally with a namespace prefix.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
*

// Parse tree
{
  type: 'universalSelector',
  content: []
}
```

```js
// String
ns|*

// Parse tree
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

### References

[CSS Selectors Level 3](https://www.w3.org/TR/css3-selectors/#universal-selector)

## urange

### Description

One Unicode range such as `U+4E00-9FFF`, as a single string.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
U+A5

// Parse tree
{
  type: 'urange',
  content: 'U+A5',
}
```

## uri

### Description

A `url()` value; `content` is a `string` when the URL is quoted and a `raw` node
when it is not.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
url("http://test.com")

// Parse tree
{
  type: 'uri',
  content: [{
    type: 'string',
    content: '"http://test.com"'
  }]
}
```

## value

### Description

The value of a declaration: everything after the `propertyDelimiter` and any
space that follows it.

Used in syntaxes: css, less, sass, scss.

### Examples

```js
// String
tomato

// Parse tree
{
  type: 'value',
  content: [{
    type: 'ident',
    content: 'tomato'
  }]
}
```

## variable

### Description

A variable: `$name` in Sass and SCSS, `@name` in Less; `content` is the name
without the `$` or `@`.

Used in syntaxes: less, sass, scss.

### Examples

```js
// String
$panda

// Parse tree
{
  type: 'variable',
  content: [{
    type: 'ident',
    content: 'panda'
  }]
}
```

## variablesList

### Description

A variable followed by `...`, used as a rest parameter or to spread a list
into arguments. Less writes the variable as `@colors`, Sass and SCSS as
`$colors`.

Used in syntaxes: less, sass, scss.

### Examples

```js
// String
$colors...

// Parse tree
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
