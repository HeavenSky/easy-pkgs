# 编写 mock 文件

[English](../../docs/writing-mocks.md) · **简体中文**

读完本页，你能在 mock 文件里声明路由、场景、处理函数和代理，并清楚 easy-mok 怎样加载和匹配它们。mock 文件放在 mock 目录下，默认是 `src/mocks`；还没接入宿主的话，先看[接入现有 dev server](connect.md)。

## 声明路由与场景

mock 文件导出一个对象，把路由映射到响应。

```js
// src/mocks/user.js
const { scenes } = require("easy-mok");

module.exports = {
	"GET /api/user/:id": scenes({
		default: { id: 1, name: "Alice" },             // 对象 / 数组 / 字符串直接返回
		empty: null,
		error: (req, res) => res.status(500).json({}), // 带参函数：自行处理，也可调用 next() 交给宿主；形参要显式写出
		byId: req => ({ id: req.params.id }),          // 既没响应也没调用 next() 时，返回值即响应体
		now: () => ({ time: Date.now() }),              // 无参函数：每次请求调用，返回值即响应体
		real: () => ({ target: "http://test.example.com", changeOrigin: true }), // 返回含 target / router 的对象：代理配置
	}),
	"GET|POST:1 /api/list": [],                         // 多个方法；:1 为权重，高者优先
	"ALL /api/legacy/*": () => ({ target: "http://old.example.com" }),
	MOCK: true,                                         // 写 false 时全局停用 mock
};
```

每个 key 的格式是 `方法[|方法][:权重] 路径`，值是单个响应或一组场景。只有在代码里声明多个场景时才需要 `scenes()`；直接写值就是 `default` 场景，其他场景之后可以在管理页新建或录制：

```js
module.exports = { "GET|POST /api/list": [] };
```

## 用 JS、TS、ESM 或 JSON 写

mock 文件可以是 `.js`、`.cjs`、`.mjs`、`.ts`、`.cts`、`.mts` 或 `.json`，`.d.ts` 不加载。文件经 [jiti](https://github.com/unjs/jiti) 加载，CommonJS 和 ESM（`export default {...}`、`import { scenes } from "easy-mok"`）都能用，`enum` 这类 TS 写法也无需额外配置。默认导入 CommonJS 模块同样可用。

入口必须用 `module.exports = {...}` 或 `export default {...}` 导出路由对象。不支持只有命名导出、导出 Promise 和顶层 await；顶层 await 的报错会附带提示。

## 在 mock 之间共享方法与数据

这些文件不会当作入口加载：`package.json`，`tsconfig*.json` 与 `jsconfig*.json`，`node_modules` 里的文件，以及路径中任一段以 `.` 或 `_` 开头的文件（如 `_lib/util.ts`、`_data/list.json`、`_draft.js`）。公共方法和数据放在 `_` 开头的目录里，被入口引用后，改动它们照样触发重载。管理页写入的 `__gui__.json` 例外，仍作为入口加载；`__scenes__/` 由 easy-mok 单独读取。

## 保存即重载，出错看诊断

mock 文件以及它按相对路径引用的文件变化后自动重载，被引用的 JSON、mock 目录外的文件、宿主已经加载过的模块都算在内。按包名或路径别名引用的模块不触发重载。

**某个文件改坏时，整个文件继续沿用上次成功加载的路由**，请求不会回落到真实服务。导入失败、有无法解析的 key、有无法编译的路径都算改坏。`__scenes__/` 下的场景文件损坏时，同样沿用上次能解析的内容。

![诊断页：列出无法编译的路由路径与所在文件行号](../../docs/images/diagnostics.png)

加载失败、重复声明、无法解析的 key 和无法编译的路径都会列在管理页的诊断里，同时打印到终端。同一问题只打印一次，内容变化时再打印，修好后清除。

## 区分数据、处理函数与代理

easy-mok 只看函数的 `length` 判断值的类型，不解析函数源码：

- 不是函数：数据，直接返回。
- `length > 0`：自行处理请求的函数。既没响应也没调用 `next()` 时，返回值即响应体。
- `length === 0`：无参函数。返回含 `target` 或 `router` 的对象时是代理配置，否则返回值即响应体。不解析请求体。

返回值可以是 Promise。管理页按同样的规则标注场景类型：无参函数在首次被请求前标为「无参函数」，之后按实际返回值标为「函数」或「代理」。

**不要用 `(...args) =>` 这类剩余参数定义路由函数，首个参数也不要带默认值。** 它们的 `length` 为 0，easy-mok 会把它们当作无参函数，返回值按代理配置或响应体处理，也不解析请求体。自行处理请求时，把形参显式写成 `(req, res, next) =>`。用 `bind` 绑定了全部参数的函数同理。

## 代理到真实后端

场景也可以不自己作答，而是把请求转发给真实服务。

```js
"ALL /api/legacy/*": () => ({ target: "http://old.example.com", changeOrigin: true }),
```

无参函数返回含 `target` 的对象，就是代理场景。代理配置使用 http-proxy-middleware 3 的选项，旧写法 `onProxyReq`、`onProxyRes`、`onError` 仍然有效。

设置 `ws: true` 时同时转发 WebSocket。easy-mok 在每个 server 上只挂一个 upgrade 监听器，按当前路由表、全局开关、放行模式和场景把升级请求交给对应的代理。没命中路由的升级请求（如 dev server 的热更新连接）不处理。文件重载后旧代理停用，`close()` 时全部销毁。

## 书写路由路径

路由语法与匹配结果同 express 4：编译器内联自 path-to-regexp@0.1.13，也就是 express 4.22 使用的版本。支持 `:id`、`:id?`、`:id+`、`:id*`、`:id(\\d+)`、`*`、内联正则，以及 `/:from-:to` 这类同段多参数。匹配不区分大小写，末尾斜杠可有可无。

参数按 express 4 的规则解码，解码失败返回 400。0.1.13 无法编译的写法（如命名分组 `(?<n>...)`）会在诊断中报「路由路径无法编译」。express 5 项目也照此书写，因为 mock 路由不注册到宿主的路由器上。

mock 按中间件挂载后收到的 `req.url` 匹配：`app.use("/api", mock)` 时，`"GET /user"` 对应 `/api/user`。

## 判断哪个路由生效

权重高者优先。权重相同时，同一路径先声明的优先，具体方法优先于 `ALL`。与 express 相同，没有声明 `HEAD` 时回落到 `GET` 路由。

预检请求按 `access-control-request-method` 匹配，直接返回 204；路径上显式声明了 `OPTIONS` 时由该路由处理。

## 在处理函数里读取请求

处理函数里可用 `req.params`、`req.query`、`req.body`、`req.files`、`req.cookies`。请求体解析失败（如不是合法 JSON）时返回 400，超过限制时返回 413，两种情况下处理函数都不执行。

限制：JSON、表单与文本请求体 5 MB；上传单个文件 20 MB，最多 10 个文件；整个请求 50 MB（按 `content-length`）。
