# easy-mok guide

**English** · [简体中文](../zh/docs/README.md)

Find the page for what you want to do; each page covers one task. For what easy-mok is and the shortest path to a running mock, start with the [README](../README.md).

| You want to | Read |
|---|---|
| Serve mocks from Vite, webpack-dev-server, Express, Connect, `node:http`, or Fastify | [Add easy-mok to your dev server](connect.md) |
| Run mocks without touching any dev server config | [Run a standalone mock server](standalone.md) |
| Write mock files, scenes, handler functions, and proxies | [Write mock files](writing-mocks.md) |
| Pick the scene a request gets, set delays and status codes, or pass a route through | [Switch scenes and response behavior](scenes.md) |
| See which requests were mocked and turn real responses into mocks | [Inspect requests and save them as mocks](request-log.md) |
| Stop browser probes and dev server traffic from cluttering the log | [Keep noise out of the request log](ignore-rules.md) |
| Decide which generated files to commit | [Commit what the admin page writes](files.md) |
| Look up an option or environment variable | [Options and environment variables](options.md) |
| Open mocks from a custom domain, the LAN, or another origin | [Allow other hosts, the LAN, and cross-origin pages](security.md) |
| Build and test easy-mok itself | [Build and test from source](development.md) |

The admin page and the floating bar display Chinese text. These pages give the English meaning of each label followed by the label as it appears, for example **Enable for this browser only** (`仅本浏览器启用`).

Release notes are in the [changelog](../CHANGELOG.md).
