# 选项与环境变量

[English](../../docs/options.md) · **简体中文**

本页列出 `createMock()` / `mockVitePlugin()` 每个选项的含义、默认值，以及省略该选项时读取的环境变量。选项类型由 [src/server/index.ts](../../src/server/index.ts) 中的 `MockOptions` 定义；`npx easy-mok` 的参数见[独立运行 mock 服务](standalone.md#从命令行启动)。

| 选项 | 环境变量 | 默认值 | 说明 |
|---|---|---|---|
| `cwd` | | `process.cwd()` | 解析 `folder`、`stateFile` 等相对路径的基准目录；jiti 转译缓存放在其下的 `node_modules/.cache/easy-mok/jiti` |
| `folder` | | `src/mocks` | mock 目录，相对 `cwd` |
| `ui` | `MOCK_UI=0` 关闭 | 开启 | 管理页与管理接口 `/__mock/` |
| `float` | `MOCK_FLOAT=0` 关闭 | 开启 | 悬浮条入口 `/__mock/float.js`；`ui` 关闭时恒为关闭（悬浮条依赖管理接口），此时 `floatScript` 为 `null` |
| `lan` | `MOCK_LAN=1` | 关闭 | 允许私有网段访问管理接口 |
| `hosts` | `MOCK_HOSTS=a.test,b.test` | 无（Vite 插件沿用 `server.allowedHosts`） | 额外信任的主机名，以 `.` 开头时同时匹配子域名。用于管理接口与 mock 路由的 Host 校验，以及 mock 响应的跨域放行。写 `*` 时 mock 路由不校验 Host，管理接口仍校验。见[放行其他主机、局域网与跨域页面](security.md) |
| `builtin` | | 无 | 先于 mock 文件加载的内置路由 |
| `ignore` | | 无 | 追加的请求忽略规则（字符串数组），见[给请求日志降噪](ignore-rules.md) |
| `ignoreDefaults` | | `true` | 为 `false` 时关闭内置忽略规则 |
| `logSize` | | 500 | 请求日志保留条数；另有全部条目请求体与响应体合计 32 MB 的上限，超出时淘汰最旧的条目 |
| `stateFile` | | `node_modules/.cache/easy-mok/state.json` | 运行状态文件，相对 `cwd`，见[提交管理页写入的文件](files.md) |
| `watch` | | `true` | 为 `false` 时不监听 mock 文件与依赖的变化，不自动重载，适合测试与一次性脚本 |

显式传入的选项总是优先于对应的环境变量。
