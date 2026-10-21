# easy-mok 使用手册

[English](../../docs/README.md) · **简体中文**

按想做的事找到对应页面，每页只讲一件事。easy-mok 是什么、怎样最快跑起来，先看 [README](../README.md)。

| 想做的事                                                                        | 阅读                                          |
| ------------------------------------------------------------------------------- | --------------------------------------------- |
| 让 Vite、webpack-dev-server、Express、Connect、`node:http` 或 Fastify 提供 mock | [接入现有 dev server](connect.md)             |
| 不动任何 dev server 配置就跑起 mock                                             | [独立运行 mock 服务](standalone.md)           |
| 编写 mock 文件、场景、处理函数与代理                                            | [编写 mock 文件](writing-mocks.md)            |
| 决定请求拿到哪个场景，用脚本写场景，设置延迟和状态码，或放行某个路由            | [切换场景与响应方式](scenes.md)               |
| 查看哪些请求走了 mock，把真实响应变成 mock                                      | [查看请求并存为 mock](request-log.md)         |
| 不让浏览器探测和 dev server 内部请求刷屏                                        | [给请求日志降噪](ignore-rules.md)             |
| 判断哪些生成的文件该提交                                                        | [提交管理页写入的文件](files.md)              |
| 查某个选项或环境变量                                                            | [选项与环境变量](options.md)                  |
| 从自定义域名、局域网或其他来源访问 mock                                         | [放行其他主机、局域网与跨域页面](security.md) |
| 构建和测试 easy-mok 本身                                                        | [从源码构建与测试](development.md)            |

版本变化见[更新日志](../CHANGELOG.md)。
