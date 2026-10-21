# 接入现有 dev server

[English](../../docs/connect.md) · **简体中文**

读完本页，现有 dev server 就能响应 mock 路由，并在 `/__mock/` 提供管理页；没命中 mock 的请求照常交给你自己的路由和代理。最短上手路径见 README 的[跑通第一个 mock](../README.md#跑通第一个-mock)；不想接入 dev server，见[独立运行 mock 服务](standalone.md)。

## 安装

```bash
npm i -D easy-mok
```

easy-mok 要求 Node.js 18 或更高版本。它自带 express 5 与 http-proxy-middleware 3，不依赖宿主项目里的版本。类型声明引用的 `@types/express` 作为运行时依赖安装，TypeScript 项目无需另装。

## 创建 mock 目录

easy-mok 从 mock 目录加载 mock，默认是 `src/mocks`；目录不存在时，所有请求都不会命中 mock。此时 `createMock`、Vite 插件、`startMock` 和命令行都会警告一次，给出目录路径和创建方法。

之后创建的目录会自动加载，上级目录一并新建（`mkdir -p`）也一样。`watch` 为 `false` 时，创建目录后需要重启 easy-mok。

## 挂到宿主上

下面的示例都用 `createMock()` 创建中间件，mock 目录默认是 `src/mocks`，传 `{ folder: "..." }` 可以改。全部选项见[选项与环境变量](options.md)。

### Vite

```js
// vite.config.js
import { mockVitePlugin } from "easy-mok";

export default { plugins: [mockVitePlugin({ folder: "src/mocks" })] };
```

插件还会往页面里注入悬浮条。dev server 关闭时插件自动停止文件监听，`middlewareMode` 下调用 `server.close()` 也一样。没有设置 `hosts` 选项和 `MOCK_HOSTS` 时，插件信任 Vite `server.allowedHosts` 里的主机。

### Express 4 / 5

```js
const { createMock } = require("easy-mok");

app.use(createMock({ folder: "src/mocks" }));
```

### webpack-dev-server

```js
const { createMock } = require("easy-mok");

// webpack-dev-server 4+
devServer: { setupMiddlewares: (m, s) => { s.app.use(createMock()); return m; } };
```

webpack-dev-server 1-3 在 `setup` 钩子里写同样的 `app.use(createMock())`。

### Connect 与 node:http

```js
const mock = createMock();
http.createServer((req, res) => mock(req, res, () => origin(req, res)));
```

没有命中 mock 时执行第三个参数，请求回落到已有的处理函数 `origin`。Connect 应用用 `app.use(mock)` 挂载。

### Fastify

```js
const mock = createMock();
fastify.addHook("onRequest", (request, reply, done) => {
	if (!mock.match(request.raw)) { return done(); }
	reply.hijack();
	mock(request.raw, reply.raw, () => { reply.raw.statusCode = 404; reply.raw.end(); });
});
```

只有命中 mock 路由且该路由不处于放行模式时，`mock.match()` 才返回 `true`，其余请求都走 Fastify 自己的路由。

## 挂在子路径下

给 `app.use()` 传一个路径，mock 就只在这个路径下生效。

```js
app.use("/api", createMock()); // "GET /user" 对应 /api/user
```

mock 按挂载后的路径匹配，管理页随之移到 `/api/__mock/`。代理转发给上游的路径不含挂载前缀，普通请求与 WebSocket 升级一致。

## 随宿主一起关闭

宿主停止时关闭中间件，免得文件监听让进程无法退出。

```js
await mock.close();
```

自己管理生命周期时，在宿主关闭前调用 `close()`，它会停止文件监听，并关闭管理页的实时（SSE）连接。Vite 插件会自动处理。

## 显示悬浮条

一个 script 标签就能在任意开发页面上显示悬浮条。

```html
<script src="/__mock/float.js"></script>
```

在开发页面里加上这个标签就有悬浮条，Vite 插件会自动注入。`mock.floatScript` 给出这个路径，悬浮条关闭时为 `null`。挂在子路径下时写成 `<挂载路径>/__mock/float.js`，悬浮条按脚本地址推算接口路径。不支持 `attachShadow` 的浏览器（IE 8-11）中，入口脚本自检后静默退出。

## 兼容旧版本的别名

为旧代码保留了两个导出：`createMockware(folder?, options?)` 等同 `createMock({ ...options, folder })`；`mockVite` 是 `createMockware` 的别名，返回的是中间件而不是 Vite 插件，Vite 项目请用 `mockVitePlugin`。
