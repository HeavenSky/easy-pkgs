# easy-mok

[English](../README.md) · **简体中文**

npm 包页只显示英文版 README。

mock 只写一次，场景、延迟和状态码在浏览器里切换，真实响应一键存成 mock，不用改代码，也不用重启 dev server。

[![npm version](https://img.shields.io/npm/v/easy-mok.svg)](https://www.npmjs.com/package/easy-mok)
[![npm downloads](https://img.shields.io/npm/dm/easy-mok.svg)](https://www.npmjs.com/package/easy-mok)
[![license](https://img.shields.io/npm/l/easy-mok.svg)](../LICENSE)

easy-mok 面向对接后端接口的前端开发者：接口还没写完、不稳定，或者很难调到某个特定状态时，用它顶上。mock 写在普通的 JS、TS 或 JSON 文件里，同一套文件能挂到 Vite、webpack-dev-server、Express、Fastify、Connect、`node:http`，也能用 `npx easy-mok` 单独起服务。手写 mock 时，想看一次「空列表」或「服务异常」就得改一次代码；用 easy-mok，**在 `/__mock/` 管理页或业务页面的悬浮条上直接切换，不用改代码**。

![easy-mok 管理页：按文件分组的路由列表、一键切换场景与只读预览](../docs/images/hero.png)

## 跑通第一个 mock

需要 Node.js 18 或更高版本。

1. 在项目里安装 easy-mok：

    ```bash
    npm i -D easy-mok
    ```

2. 新建 `src/mocks/user.js`，保存后立即生效：

    ```js
    const { scenes } = require("easy-mok");

    module.exports = {
    	"GET /api/user/:id": scenes({
    		default: { id: 1, name: "Alice" },
    		empty: null,
    		error: (req, res) => res.status(500).json({ message: "Internal error" }),
    	}),
    };
    ```

3. 启动 mock 服务，然后打开 `http://127.0.0.1:4100/__mock/` 切换场景：

    ```bash
    npx easy-mok
    ```

这时 `curl http://127.0.0.1:4100/api/user/1` 返回 `{"id":1,"name":"Alice"}`。想让现有的 Vite dev server 直接提供这些 mock，加上插件即可：

```js
// vite.config.js
import { mockVitePlugin } from "easy-mok";

export default { plugins: [mockVitePlugin()] };
```

webpack-dev-server、Express、Fastify 等其他宿主见[接入现有 dev server](docs/connect.md)。

## 不改代码就能换响应

- **随时看到空数据、报错和慢响应。** 场景用 `scenes()` 声明，也可以在管理页新建；再把多个接口的场景打包成场景组，例如「未登录」「VIP 用户」，一次切过去。场景组可以只对自己的浏览器启用，共用一个 dev server 的同事不受影响；E2E 测试里用请求头 `x-mock-scene` 按请求指定场景。
- **分清哪些请求走了 mock，哪些到了后端。** 请求日志记下命中、放行和未命中的 fetch/XHR 请求，请求与响应细节完整可查。任一次真实响应都能一键存成场景，写进 `__scenes__/`，随仓库提交。

![请求日志与单个请求的详情面板](../docs/images/logs.png)

- **调延迟和状态码，或者把单个接口放行到真实后端。** 延迟（0-60000 ms）与状态码覆盖对数据、函数和代理场景都生效；放行只把这一个路由交给 dev server 的代理，其余接口继续走 mock。

![行为面板：延迟、状态码覆盖与放行](../docs/images/behavior.png)

- **边改 mock 边用。** mock 文件和它引用的文件保存后自动重载。改坏了的文件继续沿用上次能用的路由，管理页给出诊断，请求不会悄悄落到真实服务上。
- **在业务页面里直接切场景。** 悬浮条上能切换场景组、查看最近命中的请求、一键打开管理页，不用离开正在测试的页面；Vite 插件会自动注入它。

![业务页面中的悬浮条](../docs/images/float.png)

## 选 easy-mok 还是同类工具

表中只有 easy-mok 能在运行时切换场景而不改代码；它不生成数据，也不在单元测试里运行。

|                              | easy-mok                            | Mock.js          | vite-plugin-mock | MSW                                     | json-server |
| ---------------------------- | ----------------------------------- | ---------------- | ---------------- | --------------------------------------- | ----------- |
| 运行位置                     | dev server 中间件或独立服务         | 浏览器内拦截 XHR | Vite dev server  | Service Worker / Node                   | 独立服务    |
| 不改代码切场景               | 管理页、悬浮条、请求头              | 否               | 否               | 否，需在代码中用 `.use()` 覆盖 handler  | 否          |
| 图形化管理页                 | 有                                  | 无               | 无               | 无                                      | —           |
| 请求日志与存为 mock          | 有                                  | 无               | 无               | 无                                      | 无          |
| 单个接口放行到真实后端       | 管理页一键切换                      | —                | —                | 在代码的 handler 里返回 `passthrough()` | —           |
| 随机数据生成                 | 无，可在 mock 文件里引入 Mock.js 等 | 有               | 借助 Mock.js     | 无                                      | 无          |
| 按数据文件自动生成 REST CRUD | 无                                  | 无               | 无               | 无                                      | 有          |
| 在单元测试中直接拦截请求     | 无，需要起服务                      | —                | 无               | 有                                      | 无          |

「—」表示该项对这个工具不适用。

## 什么时候用别的工具

easy-mok 是一个服务，拦截不了单元测试里的请求，这种场景用 [MSW](https://mswjs.io/)。只要随机假数据时，[Mock.js](https://github.com/nuysoft/Mock) 就够了；想按 JSON 文件自动生成 REST CRUD 接口，用 [json-server](https://github.com/typicode/json-server)。easy-mok 只为开发环境设计，不要挂到生产服务上。

## 进一步阅读

- [使用手册](docs/README.md)：接入 dev server、独立运行、写 mock、切换场景，以及全部选项。
- [更新日志](../CHANGELOG.md)（英文）

## License

[MIT](../LICENSE)
