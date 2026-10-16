# 放行其他主机、局域网与跨域页面

[English](../../docs/security.md) · **简体中文**

读完本页，你能从自定义域名、局域网里的其他设备或其他来源的页面访问 mock 和管理页，并清楚哪些默认设置会挡住这些访问。easy-mok 只为开发服务设计，不要挂到生产环境。

## 从其他机器打开管理页

管理接口能写 mock 目录，所以默认只接受本机访问。写操作还要求请求头 `x-mock-ui: 1`、同源请求，并且内容类型是 `application/json`。

要从局域网使用管理页，设置 `lan: true` 或 `MOCK_LAN=1`；独立服务用 `--host 0.0.0.0 --lan` 启动。

## 使用自定义域名

把域名加进 `hosts`，或设置 `MOCK_HOSTS=a.test,b.test`；以 `.` 开头时（如 `.example.com`）同时匹配子域名。

命中的 mock 路由会校验请求的 Host 头。`localhost`、`*.localhost`、任意 IP（含局域网 IP）与 `hosts` 中的主机名放行，其他 Host 返回 403，并提示如何用 `MOCK_HOSTS` 放行。这能防止攻击者把自己的域名解析到本机（DNS rebinding）后以同源身份读取 mock 与代理响应。未命中的请求不校验，照常交给宿主。

`hosts` 写 `*` 时 mock 路由不校验 Host，管理接口仍然校验。没有设置 `hosts` 和 `MOCK_HOSTS` 时，Vite 插件沿用 Vite 的 `server.allowedHosts`。

## 让其他来源的页面读取 mock 响应

mock 响应的跨域头只发给可信来源：`localhost` 与 `*.localhost`，回环 IP，与请求同 Host 的页面，与请求同一 IP 但端口不同的页面，以及 `hosts` 中的主机名。私有网段 IP 只在开启 `lan`（`MOCK_LAN=1` 或 `--lan`）时才算可信，所以默认情况下局域网里其他机器提供的页面读不到 mock 响应。easy-mok 不会回显任意 `Origin`。

其他网页拿不到 `access-control-allow-origin`，浏览器不允许它们读取响应。这样你随手打开的任意网站都无法带着你的凭证读取 mock 与代理响应。前端用自定义域名访问时，把它加进 `MOCK_HOSTS`。
