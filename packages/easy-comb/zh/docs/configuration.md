# 配置 easy-comb

[English](../../docs/configuration.md) · **简体中文**

这页讲怎样写配置文件，以及 easy-comb 怎样找到它；前提是已经[装好 easy-comb](install.md)。
每个选项的作用见[选项取值](options.md)。

## 从内置配置开始

**一旦找到配置文件，内置配置就完全不用了：文件里没写的选项都不生效。**
没有配置文件时，easy-comb 用内置配置：选项在 [src/config/default.ts](../../src/config/default.ts)，[属性顺序](sort-order.md#使用内置顺序)在自动生成的 [src/config/sort-order.ts](../../src/config/sort-order.ts)。
可以把这两个文件复制一份，作为自己配置的起点。

## easy-comb 去哪里找配置

easy-comb 从当前目录开始逐级向上查找，到用户主目录或文件系统根目录为止；每个目录里取第一个存在的文件。

- 先查 `.csscomb.<ext>`，再查 `csscomb.config.<ext>`。
- 每个文件名按这个顺序尝试扩展名：`json`、`js`、`cjs`、`mjs`、`ts`、`cts`、`mts`。

完整列表是 [src/config.ts](../../src/config.ts) 里的 `CONFIG_FILES`。
`csscomb --config <path>` 会跳过查找；此时文件不存在或加载失败都会报错，见[查阅命令行参数](command-line.md#查阅命令行参数)。

## 编写带类型的配置

```ts
// csscomb.config.ts
import { defineConfig } from "easy-comb";

export default defineConfig({
	exclude: ["node_modules/**"],
	"always-semicolon": true,
	"color-case": "lower",
	quotes: "single",
	"sort-order": [
		["position", "top"],
		["display", "width", "height"],
	],
});
```

有了 `defineConfig` 和 `Config` 类型，编辑器会据此补全选项名，并在取值非法时报错。
JavaScript 和 TypeScript 配置用默认导出或 `module.exports` 导出配置对象，由 `import()` 加载。
TypeScript 配置依赖 Node 的类型剥离，因此需要 Node.js 22.18+，而且只能用可擦除的语法（不能用 `enum` 或 `namespace`）。
在 CommonJS 项目里，`.ts` 文件按 CommonJS 加载，所以用了 `export` 的配置要命名为 `.mts`；Node.js 版本更低时改用 `.mjs` 或 `.json`。

同一份配置写成 JSON：

```json
{
	"exclude": ["node_modules/**"],
	"always-semicolon": true,
	"color-case": "lower",
	"quotes": "single",
	"sort-order": [
		["position", "top"],
		["display", "width", "height"]
	]
}
```

## 选项之外的配置项

除了[选项](options.md)，配置里还可以写这些键：

| 键         | 作用                                                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exclude`  | 相对配置文件所在目录的 glob；匹配的文件和目录会被跳过，例如 `["node_modules/**"]`。内置配置和传给 [`configure()`](node-api.md) 的配置里，`exclude` 相对当前目录。 |
| `syntax`   | 额外的扩展名及其解析语法，例如 `{".wxss": "css"}`。                                                                                                               |
| `template` | 一份样式表，从中检测到的风格用来补齐本配置没设置的选项，见[用 template 补齐未设置的选项](detect-config.md#用-template-补齐未设置的选项)。                         |
| `lint`     | 等同于 `--lint`。                                                                                                                                                 |
| `verbose`  | 等同于 `--verbose`。                                                                                                                                              |

## 修复加载失败的 TypeScript 配置

```text
Error parsing configuration file <path>/csscomb.config.ts.
Cannot load TypeScript config <path>/csscomb.config.ts: Unexpected token 'export'
TypeScript config files are loaded with the native type stripping of Node.js 22.18+ (erasable syntax only; running v26.11.1).
In a CommonJS project a .ts file is loaded as CommonJS, so ESM syntax needs .mts. Otherwise use a .mjs or .json config file.
```

- 原因：Node.js 低于 22.18，无法剥离类型；配置用了 `enum` 这类无法擦除的语法；或者 CommonJS 项目里的 `.ts` 文件用了 `export`。
- 解决：升级 Node.js，去掉无法擦除的语法，或者把文件改名为 `.mts`；都做不到时，把配置写成 `.mjs` 或 `.json`。
