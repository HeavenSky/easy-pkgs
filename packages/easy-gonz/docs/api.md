# easy-gonz API reference

**English** · [简体中文](../zh/docs/api.md)

Look up how to parse a stylesheet, read and change its tree, print it back, and run the `gonzales` command; you need easy-gonz installed as in [Get started](../README.md#get-started).
Node types and how they nest are in [Node types](node-types.md).
Differences from gonzales-pe 4.3.0 are in [Migrate from gonzales-pe](migrate-from-gonzales-pe.md).
Working on the parser itself is covered in [Develop and test easy-gonz](development.md).

Unless an example parses its own input, it starts from this tree:

```js
const gonzales = require("easy-gonz");
const parseTree = gonzales.parse("a { color: tomato }");
```

The package exports `parse` and `createNode`.
In Node ESM, both `import { parse, createNode } from 'easy-gonz'` and the default import work; `require('easy-gonz/lib/gonzales')` loads the same module.
TypeScript declarations ship in [gonzales.d.ts](../gonzales.d.ts) and load automatically.

## Parse a stylesheet

### gonzales.parse(css[, options])

Returns the root node of the parse tree for the string `css`.

```js
const css = gonzales.parse("a { color: tomato }");
const less = gonzales.parse("a { @color: tomato }", { syntax: "less" });
const declaration = gonzales.parse("@color: tomato", { syntax: "less", context: "declaration" });
```

| Option    | Type                                    | Default        | Meaning                                                                                                     |
| --------- | --------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------- |
| `syntax`  | `'css'`, `'less'`, `'sass'` or `'scss'` | `'css'`        | Syntax of the input.                                                                                        |
| `context` | string                                  | `'stylesheet'` | Type of the root node, such as `declaration` or `value`; see [Node types](node-types.md) for the values.    |
| `tabSize` | number                                  | `1`            | How many columns a tab counts for in `start` and `end`; values that are not positive integers count as `1`. |
| `recover` | boolean                                 | `true`         | CSS and Less only; see below. SCSS and Sass ignore it.                                                      |

With `syntax: 'css'` or `'less'` and the default `stylesheet` context, invalid input does not throw: unrecognized statements become `raw` nodes, as in postcss.
`gonzales.parse('a { color: red } }')` returns a tree whose stray `}` is a `raw` node.
Pass `recover: false` to throw a [parsing error](#parsing-errors) instead; its `line` is the first statement that would become `raw`.
Blocks left open at the end of input and Less statements that only the `raw` fallback accepts (for example `--x: () => {…}`) count as recovered and throw too.
Input that needs no recovery gives the same tree either way.

Other inputs:

- An empty string returns an empty `stylesheet` node with the requested `syntax`, whatever the `context`; its `start` and `end` are the array `[0, 0]` instead of an object, and `toString()` returns `''`.
- A `css` that is not a string throws an `Error` with the message `Please, pass a string to parse`.
- With an unsupported `syntax`, `parse` prints `Syntax "<name>" is not supported yet, sorry` to the console and returns `undefined`.

### Parsing errors

When the input cannot be parsed, `parse` throws a plain object, not an `Error` instance, with these fields:

| Field     | Value                                                           |
| --------- | --------------------------------------------------------------- |
| `name`    | `'Parsing error'`                                               |
| `line`    | Line where the failing block starts (1-based).                  |
| `syntax`  | Syntax that was parsed.                                         |
| `message` | `Please check validity of the block starting from line #<line>` |
| `context` | Source lines around `line`, the failing line marked with `*`.   |
| `version` | easy-gonz version.                                              |

Its `toString()` combines them:

```js
try {
	gonzales.parse("a {\n  color: red;\n  b: {\n}", { syntax: "scss" });
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

## Read node properties

Every node has these properties:

| Property  | Type            | Value                                                                                                                                    |
| --------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `type`    | string          | Node type; see [Node types](node-types.md).                                                                                              |
| `content` | string or array | The text of a leaf node, or its child nodes.                                                                                             |
| `syntax`  | string          | Syntax of the parsed string, used by `toString()`.                                                                                       |
| `start`   | object          | Position of the first character: `{ line, column }`, both 1-based; the empty `stylesheet` returned for empty input has `[0, 0]` instead. |
| `end`     | object          | Position of the last character, same shape as `start`.                                                                                   |
| `length`  | number          | Number of child nodes; `0` when `content` is a string.                                                                                   |

Only parsed nodes, and nodes you create with `start` and `end`, have these fields.

## Find child nodes

These methods look at direct children only; to search the whole tree, use [traverseByType](#parsetreetraversebytypetype-callback).

### parseTree.contains(type)

Returns `true` if the node has a direct child of type `type`, `false` otherwise.

```js
console.log(parseTree.contains("ruleset")); // true
```

### parseTree.first([type])

Returns the first child, or the first child of type `type`.
Returns `null` when no node matches, and `undefined` when called without `type` on a node with no children.

```js
const ruleset = parseTree.first("ruleset");
console.log(ruleset.first().type); // selector
```

### parseTree.last([type])

Returns the last child, or the last child of type `type`.
Returns `null` when no node matches, and `undefined` when called without `type` on a node with no children.

```js
const ruleset = parseTree.first("ruleset");
console.log(ruleset.last().type); // block
```

### parseTree.get(index)

Returns the child at position `index`, or `null` if there is none.

```js
const ruleset = parseTree.first("ruleset");
console.log(ruleset.get(1).type); // space
```

### parseTree.is(type)

Returns `true` if the node itself has type `type`, `false` otherwise.

```js
const node = parseTree.first();
console.log(node.is("ruleset")); // true
```

## Loop over child nodes

### parseTree.forEach([type, ]callback)

Calls `callback(node, index, parent)` for every direct child from first to last, or only for children of type `type`; `parent` is `parseTree`.
If the callback returns `null`, the loop stops and `forEach` returns `null`.
Does nothing on a node whose `content` is a string.

```js
const block = parseTree.first("ruleset").first("block");
block.forEach("space", (spaceNode, index) => {
	console.log(index, JSON.stringify(spaceNode.content)); // 0 " ", then 2 " "
});
```

### parseTree.eachFor([type, ]callback)

Works like [forEach](#parsetreeforeachtype-callback) but goes from the last child to the first, so the callback can remove the current child safely.

```js
// Remove all child spaces.
const block = parseTree.first("ruleset").first("block");
block.eachFor("space", (spaceNode, index) => {
	block.removeChild(index);
});
console.log(parseTree.toString()); // a {color: tomato}
```

## Walk the whole tree

The `traverse*` methods visit children, grandchildren and so on.
Their callback gets `(node, index, parent, level)`: `index` is the position inside `parent`, and `level` is the depth counted from the node the method is called on, which is level `1`.
The return value of the callback is ignored.

### parseTree.traverse(callback)

Calls `callback` for every node, starting with `parseTree` itself; for `parseTree` the `index` is `undefined` and the `parent` is `null`.

```js
// Print the tree as an indented list of node types.
parseTree.traverse((node, index, parent, level) => {
	console.log("  ".repeat(level - 1) + node.type);
});
```

### parseTree.traverseByType(type, callback)

Calls `callback` for every node of type `type`; inside the callback `this` is the matched node.
Call it on the root node: calling it on a child is slower.

```js
parseTree.traverseByType("ident", node => {
	if (node.content === "tomato") node.content = "red";
});
console.log(parseTree.toString()); // a { color: red }
```

### parseTree.traverseByTypes(types, callback)

Works like [traverseByType](#parsetreetraversebytypetype-callback) for every node whose type is in the array `types`.

```js
// Remove all comments and spaces.
const tree = gonzales.parse("a { /* note */ color: tomato }");
tree.traverseByTypes(["multilineComment", "space"], (node, index, parent) => {
	parent.removeChild(index);
});
console.log(tree.toString()); // a{color:tomato}
```

## Change the tree

Change a leaf by assigning to its `content`; add and remove nodes with the methods below.

### gonzales.createNode(options)

Returns a new node built from `options`: `type` (string), `content` (string or array of nodes), and optional `syntax`, `start` and `end` with the shapes listed in [Read node properties](#read-node-properties).

```js
const node = gonzales.createNode({ type: "multilineComment", content: " note " });
parseTree.content.push(node);
console.log(parseTree.toString()); // a { color: tomato }/* note */
```

### parseTree.insert(index, node)

Inserts `node` as a child at position `index`.
Does nothing on a node whose `content` is a string.

```js
const node = gonzales.createNode({ type: "multilineComment", content: " note " });
parseTree.insert(0, node);
console.log(parseTree.toString()); // /* note */a { color: tomato }
```

### parseTree.removeChild(index)

Removes the child at position `index` and returns what `Array.prototype.splice` returns: an array holding the removed node, empty when `index` is out of range.
Returns `undefined` on a node whose `content` is a string.

```js
// Move the declaration to the front of its block.
const block = parseTree.first("ruleset").first("block");
const [declaration] = block.removeChild(1);
block.insert(0, declaration);
console.log(JSON.stringify(parseTree.toString())); // "a {color: tomato  }"
```

## Print the tree

### parseTree.toString()

Returns the source text of the node in its `syntax`; an unchanged tree gives back the original input byte for byte.
If the node's `syntax` is not supported, prints a message to the console and returns `undefined`.

```js
const css = parseTree.toString();
```

### parseTree.toJson()

Returns the tree as a JSON string indented with 2 spaces.

## Run the gonzales command

`gonzales` prints the parse tree of a file, or of stdin when the argument is `-`, as JSON:

```bash
printf 'a-23' | npx gonzales -s css -c ident -
```

```json
{
	"type": "ident",
	"content": "a-23",
	"syntax": "css",
	"start": { "line": 1, "column": 1 },
	"end": { "line": 1, "column": 4 }
}
```

| Option            | Meaning                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `-s`, `--syntax`  | `css`, `less`, `sass` or `scss`; defaults to the file extension in any case (`.SCSS` reads as `scss`), or `css` for stdin.  |
| `-c`, `--context` | Type of the root node, as the `context` option of [parse](#gonzalesparsecss-options).                                       |
| `--simple`        | Print an indented outline instead of JSON; it ends with a line of dashes as deep as the last node, as in the example below. |
| `--silent`        | Do not print error messages; `--no-silent` and `--silent=false` turn it off.                                                |
| `-v`, `--version` | Print the easy-gonz version.                                                                                                |
| `-h`, `--help`    | Print usage.                                                                                                                |

With `--simple`, `a{}` prints this outline; the last node, `block`, is at depth 3, so the last line has two dashes:

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

The command exits with `0` after printing the tree, the help or the version, or when no file is given.
On any of the errors below it exits with `1` and writes the message to stderr unless `--silent` is set:

| Situation                  | Message on stderr                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Unsupported `--syntax`     | `Unsupported syntax "foo" from --syntax; expected one of css, less, sass, scss.`                            |
| `--syntax` without a value | `Missing value for --syntax; expected one of css, less, sass, scss.`                                        |
| Unsupported file extension | `Unsupported syntax "txt" from the extension of test/cli/plain.txt; expected one of css, less, sass, scss.` |
| Unreadable file            | `Cannot read test/cli/missing.scss: ENOENT: no such file or directory, open 'test/cli/missing.scss'`        |
| Parsing error              | The parsing error's `toString()`, as in [Parsing errors](#parsing-errors).                                  |

File input is parsed as is, so positions match the file and a trailing newline becomes a final `space` node.
To run `gonzales` without `npx`, install it globally with `npm install -g easy-gonz`.
