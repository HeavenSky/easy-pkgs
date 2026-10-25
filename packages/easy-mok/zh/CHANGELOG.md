# 更新日志

[English](../CHANGELOG.md) · **简体中文**

## Unreleased

### 新增

- 在管理页页头用「局域网」开关运行时开关局域网访问；只有本机打开的管理页能切换，开关打开期间页面顶部显示提示条。见[放行其他主机、局域网与跨域页面](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/zh/docs/security.md#从其他机器打开管理页)。

### 变更

- 独立服务以 `--lan`（或 `lan: true`）启动且监听默认的 `127.0.0.1` 时，现在会额外监听本机的私有网段 IPv4 地址，局域网设备才能真正连上；不想让局域网访问时不要加 `--lan`。

## 0.0.5 (2026-10-25)

### 修复

- mock 文件因顶层 `await` 加载失败、而报错信息不含 `await` 时（例如 `export default { "GET /x": await 1 }` 报 `Unexpected number`），加载错误现在会提示文件中有 `await`、顶层 `await` 不受支持。

## 0.0.4 (2026-10-21)

### 破坏性变更

- easy-mok 挂在子路径下时，WebSocket 代理转发的路径现在去掉挂载前缀，与普通代理请求一直以来的做法一致；如果你用 `pathRewrite` 把前缀补了回去，或者上游依赖这个前缀，请去掉这类变通写法。

### 修复

- 写成 IPv4 映射 IPv6 地址的 CORS 来源（如 `http://[::ffff:127.0.0.1]`）现在按它映射的 IPv4 地址判断：回环地址算作本机，私有网段地址按 `lan` 设置处理。

## 0.0.3 (2026-10-16)

### 变更

- 打开管理页时加载的 JavaScript 少了约四分之一（gzip 后从 179 KB 降到 135 KB）：各个页面、路由详情面板和新建路由对话框改为首次打开时才加载。

## 0.0.2 (2026-10-16)

### 破坏性变更

- 私有网段 IP 上的页面（如 `http://192.168.1.9:5173`）在未开启 `lan` 时不再能跨域读取 mock 响应，局域网里的其他机器因此无法带着你的凭证读取它们；与 mock 服务同一 IP 的页面不论端口仍然可以访问。迁移方法：如果局域网里其他机器上的页面要调用你的 mock，用 `--lan` 启动或设置 `MOCK_LAN=1`（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/zh/docs/security.md#让其他来源的页面读取-mock-响应)）。
- mock 文件中值为 `null` 的路由现在返回 JSON `null` 响应体，与 `__gui__.json` 里的 `null` 一致，不再被悄悄跳过。要让某个路由不生效，删掉它或设为 `undefined`（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/zh/docs/writing-mocks.md#声明路由与场景)）。

### 新增

- 可以在管理页用 JavaScript 处理函数写场景：在场景编辑器里选 **JS 脚本**；脚本在保存时检查，并且只接受本机提交（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/zh/docs/scenes.md#在管理页用脚本写场景)）。
- mock 目录不存在时，`createMock`、Vite 插件、`startMock` 和命令行都会给出一次性警告，写明路径和创建方法（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/zh/docs/connect.md#创建-mock-目录)）。
- 命令行中可以用 `--name=-value` 传入以 `-` 开头的值；单独的 `--`（部分包管理器会原样传进来）会被忽略（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/zh/docs/standalone.md#给参数传值)）。

### 修复

- 管理页新建的、响应体为 `null` 的路由现在能正常加载并回放 `null`，不再返回 500，也不再在 `__gui__.json` 里留下无效条目（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/zh/docs/files.md#回放保存的路由与场景)）。
- 把空响应（204、没有响应体的 DELETE）存为场景后，现在回放空响应体，不再创建路由失败（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/zh/docs/files.md#回放保存的路由与场景)）。
- 新建的路由加载失败时，现在会还原 `__gui__.json` 和它的场景文件，管理接口返回 `LOAD_ERROR` 及相关诊断（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/zh/docs/files.md#新建路由加载失败时)）。
- `--folder -v` 这类写法现在报告缺少取值并以退出码 1 退出，不再把 `-v` 当作目录（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/zh/docs/standalone.md#给参数传值)）。
- `--builtin` 指定的文件不存在时，现在报出该文件的路径并以退出码 1 退出（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/zh/docs/standalone.md#给参数传值)）。
- 手改后不再是合法 JSON 对象的 `__gui__.json` 不会再被管理页覆盖；修好或删除该文件之前，修改都会以 `GUI_FILE_INVALID` 失败（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/zh/docs/files.md#修复手改坏的-__gui__json)）。
- 启动后才创建的 mock 目录，即使启动时它的上级目录还不存在，现在也无需重启就能加载（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/zh/docs/connect.md#创建-mock-目录)）。

## 0.0.1 (2026-10-16)

首个版本。

### 新增

- mock 写在代码里：mock 目录中的 `.js`、`.cjs`、`.mjs`、`.ts`、`.cts`、`.mts` 和 `.json` 文件经 jiti 加载，ESM 和 TS 语法都能用（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/zh/docs/writing-mocks.md#用-jstsesm-或-json-写)）。
- mock 文件及其按相对路径引用的文件保存后自动重载；文件或场景文件改坏时沿用上次能用的内容，并在管理页和终端显示诊断（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/zh/docs/writing-mocks.md#保存即重载出错看诊断)）。
- 可以挂到 express 4 / 5、webpack-dev-server 1-6、Vite（`mockVitePlugin`）、Connect、`node:http` 和 Fastify 上（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/zh/docs/connect.md)）。
- 用 `npx easy-mok` 或 `startMock(options)` 独立运行，通过命令行参数或 `MOCK_*` 环境变量配置（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/zh/docs/standalone.md)）。
- 每个路由可以用 `scenes()` 或管理页设置多个场景，依次按请求头或查询参数、仅本浏览器启用的场景组、手动选择的场景、全局场景组、`default` 选取（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/zh/docs/scenes.md#弄清请求拿到哪个场景)）。
- 行为面板可以设置延迟、覆盖状态码、放行到真实后端，另有全局开关（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/zh/docs/scenes.md#设置延迟状态码或放行)）。
- 代理场景支持 WebSocket，也接受旧的 `onProxyReq` / `onProxyRes` / `onError` 选项（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/zh/docs/writing-mocks.md#代理到真实后端)）。
- 请求日志记录被 mock 的请求和未命中的 fetch/XHR，请求体已解码，敏感请求头已打码；任一响应都能存为场景，任一未命中的请求都能直接新建 mock（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/zh/docs/request-log.md)）。
- 忽略规则把浏览器探测请求和 dev server 自身的流量挡在日志之外；内置规则可以整体关闭，也可以逐条关闭（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/zh/docs/ignore-rules.md)）。
- 管理页位于 `/__mock/`，另有可放进自己页面的悬浮条，两者在挂到子路径下时都能用（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/zh/docs/connect.md#显示悬浮条)）。
- 路由路径遵循 express 4（path-to-regexp@0.1.13）：不区分大小写，参数无法解码时返回 400，0.1.13 无法编译的路径报 `invalid-route`（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/zh/docs/writing-mocks.md#书写路由路径)）。
- mock 按挂载后的路径匹配：`app.use("/api", mock)` 时，`"GET /user"` 对应 `/api/user`。
- 值的类型只由 `fn.length` 决定，所以定义路由函数时不要用剩余参数，首个参数也不要带默认值（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/zh/docs/writing-mocks.md#区分数据处理函数与代理)）。
- `package.json`、`tsconfig*.json` / `jsconfig*.json`，以及路径中有一段以 `_` 开头的文件，都不会作为 mock 入口加载（`__gui__.json` 除外），公共方法和数据可以放在这些地方。
- 声明了 `OPTIONS` 的路由会收到预检请求，`HEAD` 回落到 `GET`；请求体不合法时返回 400，过大时返回 413，上传限制文件数、字段数，每个请求最多 50 MB。
- 默认设置偏安全：管理接口只接受本机请求和 JSON 写入；命中的 mock 路由校验 Host 头，防范 DNS rebinding；mock 响应只向本机、私有网段、同 Host 和 `hosts` 中的来源发送跨域头（[详见](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/zh/docs/security.md)）。
- 自带 express 5 和 http-proxy-middleware 3，不使用项目里的版本，并会安装 `@types/express`，TypeScript 项目无需额外配置。
