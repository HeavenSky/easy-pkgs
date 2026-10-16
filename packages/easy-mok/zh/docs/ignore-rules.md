# 给请求日志降噪

[English](../../docs/ignore-rules.md) · **简体中文**

读完本页，你能让浏览器探测、dev server 内部请求和自己不关心的路径不再进入请求日志和终端。被忽略的请求照常由 mock 匹配和响应，只是不记录。

## 书写忽略规则

规则格式是 `[方法 ]路径`：

- `*` 匹配单段内的任意字符，`**` 可以跨段；`/a/**` 也匹配 `/a` 自身。
- 方法可省略，也可以写多个，如 `GET|POST`。
- 匹配不区分大小写，对象是不含查询串的完整路径；挂在子路径下时包含挂载前缀。

## 添加规则

- 在管理页打开「请求日志 → 忽略规则」编辑自定义规则，输入时即时校验，保存在状态文件里。
- 日志详情面板里的「忽略此路径」按该请求的方法和路径生成一条精确规则。
- 在代码里传 `ignore: ["/health", "GET /static/**"]` 追加规则；[独立服务](standalone.md)用 `--ignore` 或 `MOCK_IGNORE`。

## 开关内置规则

内置规则覆盖浏览器探测与 dev server 内部请求。可以在管理页整体关闭或逐条停用，也可以用 `ignoreDefaults: false` 整体关闭。

- 浏览器探测：`/.well-known/**`（如 Chrome DevTools 打开时请求的 `/.well-known/appspecific/com.chrome.devtools.json`）、`/favicon.ico`、`/apple-touch-icon*.png`、`/robots.txt`、`/browserconfig.xml`、`/crossdomain.xml`、`/sitemap.xml`。
- dev server 内部请求：`/__webpack_hmr`、`/sockjs-node/**`、`/ws`、`/@vite/**`、`/@fs/**`、`/@id/**`、`/@react-refresh`、`/node_modules/.vite/**`、`**/*.hot-update.json`、`**/*.hot-update.js`、`/__mock/**`。

`/manifest.json`、`/sw.js` 这类可能是业务资源的路径默认不忽略。
