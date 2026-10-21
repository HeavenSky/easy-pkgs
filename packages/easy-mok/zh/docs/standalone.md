# 独立运行 mock 服务

[English](../../docs/standalone.md) · **简体中文**

读完本页，mock 目录和管理页就能由单独的进程提供，不用改任何 dev server 配置。先按[接入现有 dev server](connect.md#安装)安装 easy-mok；独立服务内部就是 `node:http` 加 `createMock`。

## 从命令行启动

```bash
npx easy-mok                                   # 默认 src/mocks，http://127.0.0.1:4100/
npx easy-mok --folder mock --port 0            # 0 为随机端口
npx easy-mok --host 0.0.0.0 --lan              # 局域网可访问，管理页也能从局域网打开
npx easy-mok --builtin ./builtin.ts --no-float # 内置路由文件相对当前目录解析，支持 ts / esm
npx easy-mok --help
```

启动后打印 mock 地址与管理页地址。按 `Ctrl+C`（SIGINT）或收到 SIGTERM 时，先关闭服务与文件监听再退出。mock 目录不存在时 easy-mok 会警告一次，见[创建 mock 目录](connect.md#创建-mock-目录)。

| 参数                                               | 环境变量                                                   | 默认值               | 说明                                                        |
| -------------------------------------------------- | ---------------------------------------------------------- | -------------------- | ----------------------------------------------------------- |
| `--folder <目录>`                                  | `MOCK_FOLDER`                                              | `src/mocks`          | mock 目录，相对当前目录                                     |
| `--port <端口>`                                    | `MOCK_PORT`                                                | 4100                 | 0 为随机端口；端口被占用时提示换一个端口，并以退出码 1 退出 |
| `--host <地址>`                                    | `MOCK_HOST`                                                | `127.0.0.1`          | 设为 `0.0.0.0` 时额外打印局域网地址                         |
| `--builtin <文件>`                                 | `MOCK_BUILTIN`                                             | 无                   | 先于 mock 文件加载的内置路由，经 jiti 加载                  |
| `--ignore <a,b>`                                   | `MOCK_IGNORE`                                              | 无                   | 追加请求忽略规则，见[给请求日志降噪](ignore-rules.md)       |
| `--no-ui` / `--no-float` / `--lan` / `--hosts a,b` | `MOCK_UI=0` / `MOCK_FLOAT=0` / `MOCK_LAN=1` / `MOCK_HOSTS` | 同[选项](options.md) |                                                             |
| `-h, --help` / `-v, --version`                     |                                                            |                      |                                                             |

命令行参数优先于环境变量。

## 给参数传值

需要取值的参数读取下一项作为值，但下一项以 `-` 开头时不算：

```bash
npx easy-mok --folder -v     # 报错：--folder 缺少取值，以退出码 1 退出
npx easy-mok --folder=-v     # 使用名为 "-v" 的目录
```

单独的 `--` 会被忽略，包管理器把 `--` 原样传进来时，`pnpm run mock -- --port 4000` 照样能传入 `--port 4000`。easy-mok 不接受位置参数，其他不带 `-` 的参数一律报错。`--builtin` 指定的文件不存在时，easy-mok 报出解析后的路径并以退出码 1 退出；相对路径按当前目录解析。

## 在代码里启动

`startMock()` 在脚本里启动同样的服务，适合放进 E2E 的准备步骤。

```js
const { startMock } = require("easy-mok");

const { url, port, server, mock, close } = await startMock({ folder: "src/mocks", port: 0 }); // 另可传 host 与 createMock 的全部选项
// ...
await close(); // 关闭 http 服务、文件监听与 SSE 连接
```

## 让前端调用它

没命中 mock 的请求返回 404 JSON：`{ mock: false, message: "未命中 mock 路由", ... }`。前端有两种接法：

- 直接跨域请求 mock 地址。跨域规则与挂载模式相同，见[让其他来源的页面读取 mock 响应](security.md#让其他来源的页面读取-mock-响应)：只有 `localhost` 与 `*.localhost`、回环与私有网段 IP、与请求同 Host 的页面，以及 `hosts` 中的来源能读到响应，未命中的 404 与预检请求也一样。前端页面用自定义域名时，用 `--hosts` 或 `MOCK_HOSTS` 加进去。
- 让前端 dev server 把请求代理到 mock 服务，保持同源，例如 Vite 的 `server.proxy: { "/api": "http://127.0.0.1:4100" }`。代理保留原 Host 头时，自定义域名同样要加进 `hosts`，或者开启代理的 `changeOrigin`。
