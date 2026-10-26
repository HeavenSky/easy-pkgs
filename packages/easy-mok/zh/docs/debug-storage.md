# 手写与排查调试页的数据文件

[English](../../docs/debug-storage.md) · **简体中文**

读完本页，你能手写或用脚本生成调试请求、环境组和快照，也能解决这些文件的合并冲突。本页说明「调试」页在 mock 目录的 `__debug__/`（或 `debugDir` 选项、`--debug-dir` 指定的目录）下保存的每个文件；调试页本身怎么用，见[在管理页调试真实接口](debug.md)。

easy-mok 写出的 JSON 文件一律用 tab 缩进，末尾带换行。每个文件都有 `"version": 1`；easy-mok 写入时带上它，读取时不检查。

## 一览完整目录结构

**含 `req.json` 文件的目录是请求，`requests/` 下的其他目录都是分组。**

```text
<mock 目录>/__debug__/
  redact.json                    快照的字段脱敏规则
  requests/
    __meta__.json                集合: 全部请求共用的变量与默认配置(可选)
    __refs__.json                哪些场景引用了哪些快照(自动生成)
    user/                        分组
      __meta__.json              展示名、权重、变量、默认配置(可选)
      get-user/                  请求
        __meta__.json            展示名、权重、变量(可选)
        req.json                 请求定义
        res/
          ok/                    快照 "ok"
            __meta__.json        快照元数据(必需)
            raw.json             响应体
            req.bin              单独保存的请求体
  environments/
    dev.json                     环境组 "dev"
    secret/
      .gitignore                 内容为 "*"
      dev.json                   "dev" 的敏感值来源
      cookies/
        dev.json                 "dev" 的 Cookie jar
  history/
    .gitignore                   内容为 "*"
    20261026/
      index.ndjson               直接放在当天目录下的条目的索引
      001203_a1b2c3/             一次发送
        __meta__.json
        raw.json
      14/                        小时目录，当天超过 50 MB 后启用
        index.ndjson
        140501_c3d4e5/
```

| 路径                                       | 由什么操作写入                              | 重写时未知字段                   |
| ------------------------------------------ | ------------------------------------------- | -------------------------------- |
| `requests/**/req.json`                     | 保存请求                                    | 保留                             |
| `requests/**/__meta__.json`                | 编辑分组或请求                              | 保留                             |
| `requests/**/res/<name>/__meta__.json`     | 保存或编辑快照                              | 编辑时保留；用历史覆盖快照时丢弃 |
| `requests/__refs__.json`                   | 每次路由重载                                | 整份重新生成                     |
| `environments/<group>.json`                | 编辑环境组                                  | 保留                             |
| `environments/secret/<group>.json`         | 编辑敏感值来源                              | 丢弃，不合法的来源也一并丢弃     |
| `environments/secret/cookies/<group>.json` | 每次收到设置 cookie 的响应，以及清除 cookie | 顶层丢弃；每个 cookie 内部保留   |
| `history/**`                               | 每次发送                                    | 从不重写                         |
| `redact.json`                              | 保存脱敏规则                                | 丢弃                             |

mock 加载和热重载都不监听 `__debug__/`。管理页每次请求都重新读取这些文件，所以手改立即生效；但已打开的调试页要刷新页面才能看到。

## 在 `req.json` 中编写请求

**只有 `req.json` 能让一个目录成为请求；文件里的每个字段都可以省略。** 内容为 `{}` 的文件就是一个 URL 为空的合法 `GET` 请求。

```json
{
	"version": 1,
	"method": "POST",
	"url": "{{baseUrl}}/api/user/:id",
	"params": {
		"path": { "id": "{{userId}}" },
		"query": [
			["verbose", "1", true],
			["debug", "1", false]
		]
	},
	"headers": [["accept", "application/json", true]],
	"auth": { "type": "bearer", "token": "{{token}}" },
	"body": { "type": "json", "content": { "name": "Ada" } },
	"settings": { "timeoutMs": 5000 },
	"route": "POST /api/user/:id"
}
```

| 字段           | 类型             | 默认值                  | 规则                                                                                                                                                                                      |
| -------------- | ---------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `method`       | 字符串           | `"GET"`                 | `GET`、`POST`、`PUT`、`PATCH`、`DELETE`、`HEAD` 或 `OPTIONS`；小写也接受，保存为大写                                                                                                      |
| `url`          | 字符串           | `""`                    | 可以含 `{{var}}` 和 `:name` 路径参数；其他类型按 `""` 处理                                                                                                                                |
| `params.path`  | 值为字符串的对象 | `{}`                    | 填入 URL 中后面紧跟 `/`、`?`、`#` 或结尾的 `:name`；值会做 URL 编码                                                                                                                       |
| `params.query` | 行数组           | `[]`                    | 追加在 URL 原有的查询串之后                                                                                                                                                               |
| `headers`      | 行数组           | `[]`                    | 名字必须是合法的 HTTP 头名或为空；发送时名字转为小写。会与集合、分组的请求头合并，见[为分组或整个集合设置默认配置](#为分组或整个集合设置默认配置)                                         |
| `auth`         | 对象             | `{ "type": "inherit" }` | `type` 为 `inherit`（沿用最近一层分组或集合的认证，都没有则为无）、`none`、`bearer`（带 `token`）或 `basic`（带 `username` 与 `password`）；只在没有启用的 `authorization` 头时才生成该头 |
| `body`         | 对象             | `{ "type": "none" }`    | 见下一张表                                                                                                                                                                                |
| `settings`     | 对象             | `{}`                    | 只写本请求要覆盖的键；没写的键依次继承分组、集合，最后取设置表里的默认值                                                                                                                  |
| `route`        | 字符串或 `null`  | `null`                  | 这个请求所属的 mock 路由，显示在「设置」里；发送时不使用                                                                                                                                  |

一行是 `[名, 值, 是否启用]`。前两项必须是字符串。第三项只有为 `false` 时才停用这一行，缺省视为启用。第三项之后的内容在保存时丢弃。名字为空的行在发送时跳过。

| `body.type` | 其他键                                                    | 发出的字节与默认 `content-type`                                                           |
| ----------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `none`      |                                                           | 没有请求体                                                                                |
| `json`      | `content`：任意 JSON 值                                   | `JSON.stringify(content)`，`application/json`                                             |
| `text`      | `content`：字符串，必填                                   | 该字符串，`text/plain; charset=utf-8`                                                     |
| `form`      | `fields`：行数组                                          | URL 编码的字段，`application/x-www-form-urlencoded`                                       |
| `multipart` | `parts`：`{ "name", "value"?, "file"?, "enabled"? }` 数组 | `multipart/form-data`；`name` 必填，`"enabled": false` 跳过该项，带 `file` 的项发送该文件 |
| `binary`    | `file`：字符串，必填                                      | 该文件，类型按扩展名推断                                                                  |

`file` 路径相对 mock 目录，且必须位于 mock 目录内。只有没有启用的 `content-type` 头时，才补上默认 `content-type`。

| `settings` 的键   | 类型            | 默认值  | 规则                                                        |
| ----------------- | --------------- | ------- | ----------------------------------------------------------- |
| `timeoutMs`       | 整数            | `30000` | 1 到 600000；覆盖整次发送，包括重定向                       |
| `followRedirects` | 布尔            | `true`  | 最多跟随 10 次重定向                                        |
| `insecureTLS`     | 布尔            | `false` | 为 `true` 时跳过证书校验                                    |
| `proxy`           | 字符串或 `null` | `null`  | `http://[user:pass@]host:port`；HTTPS 目标经 `CONNECT` 隧道 |
| `skipCookieJar`   | 布尔            | `false` | 为 `true` 时不使用环境组的 Cookie jar                       |

布尔类的键只能是 `true` 或 `false`，写成其他值时保存会返回 `400`。支持继承之前建的请求把每个键都写全了，所以会一直用自己的值，直到你在「设置」里对每个键点「恢复继承」。

展示名、权重和请求级变量不写在这里，写在请求目录的 `__meta__.json` 里。管理页保存时保留各层级的未知字段。

管理页只在保存时检查这些规则。不合规的 `req.json` 照样能打开，并按文件原样显示；但保存会返回 `400 BAD_REQUEST`，直到你改好报错指出的字段。

## 在 `__meta__.json` 中设置展示名与变量

**分组和请求的 `__meta__.json` 都可以省略；没有它时，节点显示目录名，权重为 0，没有变量。**

```json
{ "version": 1, "name": "用户", "weight": 10, "vars": { "tenant": "t001" } }
```

| 字段     | 类型             | 默认值 | 规则                                                         |
| -------- | ---------------- | ------ | ------------------------------------------------------------ |
| `name`   | 字符串           | 目录名 | 展示名；只含空白时视为缺省                                   |
| `weight` | 整数             | `0`    | 大的排在前面，相同时按展示名排序。不是安全整数的值一律视为 0 |
| `vars`   | 值为字符串的对象 | `{}`   | 本层变量，见[弄清变量值从哪来](#弄清变量值从哪来)            |

- 读取时，`vars` 中名字不合法或值不是字符串的项被忽略，不给提示。从管理页保存这样的项会返回 `400`。
- 管理页在清空展示名时删除 `name`，权重为 0 时删除 `weight`，变量为空时删除 `vars`。其他字段保留。
- `requests/__meta__.json` 就是集合，其中的字段对全部请求生效。管理页在树顶的「请求集合」行编辑它。

## 为分组或整个集合设置默认配置

**`requests/__meta__.json` 和分组的 `__meta__.json` 还可以写下层请求共用的默认 `headers`、`settings` 与 `auth`；请求目录的 `__meta__.json` 不能写，请求自己的值写在 `req.json` 里。**

```json
{
	"version": 1,
	"headers": [
		["accept", "application/json", true],
		["x-trace", "{{traceId}}", true]
	],
	"settings": { "timeoutMs": 10000, "followRedirects": false },
	"auth": { "type": "bearer", "token": "{{token}}" }
}
```

| 字段       | 类型   | 缺省含义         | 规则                                                                                          |
| ---------- | ------ | ---------------- | --------------------------------------------------------------------------------------------- |
| `headers`  | 行数组 | 本层没有请求头   | 从集合到请求逐层按名字合并，不区分大小写：启用的行替换外层同名头，禁用的行去掉外层同名头      |
| `settings` | 对象   | 本层不覆盖任何键 | 键与规则同 `req.json` 的 `settings`；每个键单独继承                                           |
| `auth`     | 对象   | 继承外层         | `none`、`bearer` 或 `basic`，这里不能写 `inherit`；写 `{ "type": "none" }` 可以挡住外层的认证 |

- 发送、解析预览、导出 cURL 和历史都用合并后的结果；历史与快照的 `template.request` 存的就是它。刷新快照时沿用这些存下来的值，只会补上之后在分组或集合里新加的请求头。
- 列表为空时管理页删除 `headers`，没有任何键时删除 `settings`，改回继承时删除 `auth`。

## 在 `environments/<group>.json` 中定义环境组

**文件名去掉 `.json` 就是环境组名；文件里存放环境组的变量，敏感值只写占位符。**

```json
{
	"version": 1,
	"name": "开发环境",
	"weight": 0,
	"vars": { "baseUrl": "https://dev.example.com", "token": "<secret:dev_token>" }
}
```

`name`、`weight` 和 `vars` 的规则与 `__meta__.json` 相同，只是管理页在权重为 0 时仍保留 `weight`，变量为空时仍保留 `vars`。未知字段保留。

- 占位符 `<secret:id>` 必须独占整个值。需要加前缀时写在请求里，例如 `Bearer {{token}}`。
- 当前激活哪个环境组不存在这里，而是存在状态文件的 `debug.env` 字段，状态文件默认是 `node_modules/.cache/easy-mok/state.json`，见[提交管理页写入的文件](files.md)。
- 在管理页改名或删除环境组时，它的敏感值文件和 Cookie jar 会一起改名或删除。手动改名时，三个文件都要改。

## 在 `environments/secret/<group>.json` 中配置敏感值来源

**环境组 `<group>` 中的每个占位符 `<secret:id>`，都从这个文件的 `sources.<id>` 取值。**

```json
{
	"version": 1,
	"sources": {
		"dev_token": { "from": "keychain", "service": "dev-api", "account": "me" },
		"dev_key": { "from": "env", "name": "DEV_API_KEY" }
	}
}
```

来源 id 必须匹配 `^[A-Za-z0-9_]{1,64}$`。

| `from`     | 其他键                                     | 取到的值                                                                                          |
| ---------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `value`    | `value`：字符串                            | 字符串本身，明文存在这个文件里                                                                    |
| `env`      | `name`：匹配 `^[A-Za-z_][A-Za-z0-9_]*$`    | mock 服务进程的同名环境变量                                                                       |
| `keychain` | `service`：非空字符串，`account`：字符串   | macOS 用 `security find-generic-password`，Linux 用 `secret-tool lookup`；其他系统直接失败        |
| `command`  | `argv`：非空字符串数组，`argv[0]` 不能为空 | 标准输出去掉最后一个换行；不经 shell 运行，退出码非零、超过 15 秒、输出超过 1 MB 或输出为空时失败 |
| `prompt`   |                                            | 发送时在管理页输入，只保存在内存中                                                                |

id 或结构不合法的来源被忽略。下一次在管理页修改来源时，文件被重写为 `{ "version", "sources" }`，这些来源和其他字段都会丢弃。

## 读懂 `environments/secret/cookies/<group>.json` 中的 Cookie jar

**环境组激活期间收到第一个 `set-cookie` 时创建 Cookie jar，之后每个设置 cookie 的响应都会重写它。**

```json
{
	"version": 1,
	"cookies": [
		{
			"name": "sid",
			"value": "abc123",
			"domain": "dev.example.com",
			"hostOnly": true,
			"path": "/",
			"expires": null,
			"secure": true,
			"httpOnly": true
		}
	]
}
```

| 字段       | 类型          | 含义                                                  |
| ---------- | ------------- | ----------------------------------------------------- |
| `domain`   | 字符串        | 小写主机名，不带开头的点                              |
| `hostOnly` | 布尔          | `true` 只匹配 `domain` 本身；`false` 还匹配它的子域名 |
| `path`     | 字符串        | 匹配该路径及其下级路径                                |
| `expires`  | 数字或 `null` | 毫秒时间戳；`null` 是会话 cookie，在这里不会过期      |
| `secure`   | 布尔          | `true` 时只经 HTTPS 发送                              |
| `httpOnly` | 布尔          | 只做记录，不影响发送                                  |

读取时丢弃 `name` 不是字符串的项和已过期的项。新 cookie 替换 `name`、`domain`、`path` 都相同的旧 cookie。

## 读懂 `history/` 中的历史

**每次真正发出的请求对应一个目录，只有写进 `index.ndjson` 的条目才会出现在列表里。**

目录按服务端本地时间命名：`history/<YYYYMMDD>/<HHmmss>_<6 位十六进制>/`。某天索引中的体积超过 52428800 字节（50 MB）后，当天之后的条目改写到 `history/<YYYYMMDD>/<HH>/<HHmmss>_<id>/`；已写入的条目不迁移。历史标识是 `history/` 下的目录路径，例如 `20261026/001203_a1b2c3` 或 `20261026/14/140501_c3d4e5`。

条目目录里有：

- `__meta__.json`，格式见[读懂快照的 `__meta__.json`](#读懂快照的-__meta__json)。
- `raw.<ext>`，即响应体；响应体为空时没有这个文件。扩展名由响应的 `content-type` 决定：`json`（含 `+json`）、`html`、`csv`、`txt`、`xml`（含 `+xml`）、`js`、`css`、`svg`、`png`、`jpg`、`gif`、`webp`、`pdf`，其余为 `bin`。
- `req.bin`，即请求体；只在请求体不是文本或超过 64 KB 时出现。

每个日目录和小时目录各有一份只追加的 `index.ndjson`，每行一个 JSON 对象，在条目目录写完后才追加：

```json
{
	"id": "20261026/001203_a1b2c3",
	"request": "user/get-user",
	"env": "dev",
	"method": "GET",
	"url": "https://dev.example.com/api/user/1",
	"status": 200,
	"size": 2048,
	"durationMs": 182,
	"time": 1792944723000,
	"error": null
}
```

| 字段            | 含义                                                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `request`       | 请求标识；未保存的草稿为 `null`                                                                                                        |
| `env`           | 激活的环境组，或 `null`                                                                                                                |
| `method`、`url` | 第一跳实际发出的值，敏感值已换成占位符                                                                                                 |
| `status`        | 最终状态码；发送失败时为 `null`                                                                                                        |
| `size`          | 条目目录内全部文件的字节数                                                                                                             |
| `time`          | 毫秒时间戳                                                                                                                             |
| `error`         | 发送失败时的错误码，例如 `TIMEOUT`、`ABORTED`、`PROXY_FAILED`、`TOO_MANY_REDIRECTS`，或 `ECONNREFUSED` 这类 Node 错误码；否则为 `null` |

- 发出前就被拒绝的请求不写历史：变量未解析、URL 无效、敏感值不可用、请求体文件不存在。
- 不是合法 JSON 的行被跳过，目录已不存在的行也被跳过。没有索引行的目录既不出现在列表里，也不计入总体积。
- 历史不会自动删除，管理页可以按天删除。总体积只从索引行统计一次，之后保存在内存中；手动删除某天的目录后，重启服务才能看到正确的总量。

## 读懂快照的 `__meta__.json`

**快照是历史条目目录在 `requests/<request>/res/<name>/` 下的一份拷贝，`__meta__.json` 里多了几个字段。**

| 字段         | 类型             | 历史中 | 快照中             | 含义                                                                                                               |
| ------------ | ---------------- | ------ | ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `origin`     | 对象             | 有     | 有                 | `{ "kind": "debug", "request": <请求标识或 null> }`；快照另加 `historyId`；导入生成的快照为 `{ "kind": "import" }` |
| `capturedAt` | 字符串           | 有     | 有                 | 带时区偏移的本地时间，例如 `2026-10-26T00:12:03+08:00`；导入生成的快照用 UTC                                       |
| `reqHash`    | 字符串或 `null`  | 有     | 有                 | `sha256:` 加上按 key 排序后的请求定义的 SHA-256                                                                    |
| `timing`     | 对象             | 有     | 有                 | `{ "durationMs", "ttfbMs" }`；没有收到响应时 `ttfbMs` 为 `null`                                                    |
| `request`    | 对象             | 有     | 有                 | 第一跳实际发出的请求                                                                                               |
| `template`   | 对象             | 有     | 有                 | `{ "env", "request", "values" }`：激活的环境组、发送时的请求定义，以及每个变量的来源                               |
| `response`   | 对象或 `null`    | 有     | 有                 | 发送失败时为 `null`                                                                                                |
| `error`      | 对象或 `null`    | 有     | 有                 | 发送失败时为 `{ "code", "message" }`                                                                               |
| `note`       | 字符串           | 有     | 有                 | 写入为 `""`                                                                                                        |
| `name`       | 字符串           |        | 可选               | 展示名；缺省时用目录名                                                                                             |
| `weight`     | 整数             |        | 有                 | 排序权重                                                                                                           |
| `vars`       | 值为字符串的对象 |        | 有                 | 快照级变量，供「按此快照重新发送」和「刷新」使用                                                                   |
| `replay`     | 对象             |        | 有                 | `{ "setCookie": boolean }`：场景回放时是否带上 `set-cookie`                                                        |
| `redaction`  | 对象             |        | 从历史保存的快照有 | `{ "fields", "setCookie", "binaryRequest" }`：保存时做了哪些脱敏；`setCookie` 取 `kept`、`masked` 或 `none`        |

`request` 含 `method`、`url`、`headers` 和 `body`：

- `headers` 是名字小写的 `[名, 值]` 数组，与实际发出的一致，包括 `host`、`content-length`、默认的 `accept-encoding: gzip, deflate, br` 和来自 Cookie jar 的 cookie。
- `body` 为 `{ "type": "none" }`、`{ "type": "text", "text" }` 或 `{ "type": "binary", "file": "req.bin", "size", "sha256" }`。`content-type` 是 `text/*`、JSON、XML、JavaScript 或 URL 编码表单，且请求体不超过 64 KB 时内联为文本。

`response` 含 `status`、`statusText`、`httpVersion`、`headers`、`body` 和 `redirects`：

| `response.body` 的键     | 含义                                                      |
| ------------------------ | --------------------------------------------------------- |
| `file`                   | `raw.<ext>`；响应体为空时为 `null`                        |
| `contentType`、`charset` | 取自响应的 `content-type`；`contentType` 为小写且不带参数 |
| `size`、`sha256`         | 保存下来的文件的大小与摘要                                |
| `originalEncoding`       | 响应的 `content-encoding`，或 `null`                      |
| `decoded`                | 无法解压时为 `false`，此时文件里是压缩后的原始字节        |
| `truncated`              | 响应体超过 50 MB 被截断时为 `true`                        |
| `redacted`               | 只出现在快照中：字段规则改动了文件时为 `true`             |

`template.values` 把每个变量映射为 `{ "value", "from" }`。`from` 取 `env:<group>`、`group:`（来自 `requests/__meta__.json`）、`group:<分组标识>`、`request`、`snapshot`、`path`（路径参数）或 `secret:<id>`；`secret:<id>` 的值总是占位符。

## 手写快照

**`__meta__.json` 里有 `response` 对象且没有 `error` 的快照，都能被场景引用。**

```json
{
	"version": 1,
	"response": {
		"status": 200,
		"headers": [["content-type", "application/json"]],
		"body": { "file": "raw.json" }
	}
}
```

把它和一个 `raw.json` 放进 `requests/user/get-user/res/ok/`，场景里写 `"ref": "user/get-user#ok"` 即可引用，见[切换场景与响应方式](scenes.md#用调试快照作为场景)。请求目录要有 `req.json`，快照才会显示在调试页上。

- 写了 `body.file` 时该文件必须存在，否则引用视为失效。不写 `body.file` 时，场景返回空响应体。
- 回放时去掉传输层与服务器生成的头，例如 `content-length`、`content-encoding`、`date`、`etag` 和 CORS 相关的头，还去掉所有 `x-mock*` 头；`set-cookie` 只在 `replay.setCookie` 为 `true` 时保留。
- 手改 `raw` 文件后，同步更新 `size` 和 `sha256`。二进制响应体和超过 2 MB 的响应体在对比时只看这两个字段，不读文件。
- 没有 `template` 时，「刷新」发送请求当前的 `req.json`。

把历史条目另存到已有快照上时，旧的 `name`、`weight`、`vars` 和 `replay.setCookie` 会保留，除非这次保存给了新值；其余字段都取自新条目。easy-mok 先在临时目录 `res/.tmp-<hex>/` 里写好新快照，再改名替换。

## 用 `redact.json` 控制快照脱敏

**没有 `redact.json` 时，保存快照会脱敏默认的凭据字段；文件一旦存在，只按其中的规则脱敏。**

```json
{ "version": 1, "fields": ["password", "token", "$.data.*.idCard"] }
```

默认规则是 `password`、`passwd`、`token`、`accessToken`、`access_token`、`refreshToken`、`refresh_token`、`secret`、`apiKey` 和 `api_key`。文件里写 `"fields": []` 就关闭字段脱敏。

- 不带 `$` 的名字匹配任意层级的同名 key，不区分大小写。
- 以 `$.` 开头的规则是从根开始、按 `.` 分段的路径，`*` 匹配任意一个 key 或数组下标。含点号的 key 无法用路径匹配。
- 命中且不为 `null` 的值替换为 `"***"`，对象和数组也整体替换。
- 规则在保存快照时生效：作用于扩展名为 `json` 且已解压的响应文件，以及能解析为 JSON 的内联文本请求体。有改动的文件被重写：原文含换行时用 2 空格缩进，否则写成紧凑格式；没有改动的文件保留原字节。
- `template.request` 不做脱敏，所以直接写在 `req.json` 里的敏感值也会出现在快照中。

读取时忽略不是字符串或只含空白的项。在管理页保存时，规则会去掉首尾空白并去重，拒绝不符合 `$.a.b` 形式的 `$` 规则，且文件只写入 `version` 和 `fields`。

## 重建 `requests/__refs__.json`

**`__refs__.json` 是自动生成的「哪些场景引用了哪些快照」清单，easy-mok 自己从不读取它。**

```json
{
	"version": 1,
	"refs": {
		"user/get-user#ok": [
			{
				"route": "GET /api/user/:id",
				"scene": "default",
				"file": "__scenes__/GET_api_user_id.1a2b3c4d.json"
			}
		]
	}
}
```

每次路由重载（包括启动）后，easy-mok 由 `__scenes__/` 全量重建它，内容有变化时才写盘。key 按字典序排列，每个列表先按 `route` 再按 `scene` 排序，`file` 是相对 mock 目录的路径。没有任何引用且文件不存在时不创建。遇到合并冲突时，删掉它再启动服务，或改动任一场景即可重建。

## 选用合法的名字

**分组、请求、快照和环境组共用同一条命名规则，比较名字时不区分大小写。**

```text
^(?![._-])[A-Za-z0-9._\-\p{Script=Han}]{1,64}(?<![._-])$
```

- 名字由 1 到 64 个字母、数字、中文、`.`、`_` 或 `-` 组成，首尾不能是 `.`、`_` 或 `-`。
- 比较前先做 Unicode NFC 规范化再转小写，因为 macOS 可能以 NFD 形式返回中文文件名。同一父目录下的分组和请求共用一个命名空间；快照在各自的 `res/` 内比较；环境组在 `environments/` 内比较。
- 分组和请求不能命名为 `res` 或 `req.json`，不论大小写。

| 标识       | 形式                                     | 示例                     |
| ---------- | ---------------------------------------- | ------------------------ |
| 请求或分组 | 相对 `requests/` 的名字路径，用 `/` 连接 | `user/get-user`          |
| 快照       | `<请求标识>#<快照名>`                    | `user/get-user#ok`       |
| 历史条目   | 相对 `history/` 的路径                   | `20261026/001203_a1b2c3` |
| 变量       | `^[A-Za-z_][A-Za-z0-9_.-]{0,63}$`        | `base.url`               |
| 敏感值来源 | `^[A-Za-z0-9_]{1,64}$`                   | `dev_token`              |

调试页对磁盘上已有目录的处理：

| 磁盘上的情况                                  | 结果                                                          |
| --------------------------------------------- | ------------------------------------------------------------- |
| `requests/` 下以 `_` 或 `.` 开头的目录        | 静默跳过                                                      |
| 名字不合规的目录，或请求之外名为 `res` 的目录 | 跳过，报告为 `invalid-name`                                   |
| 同一分组下只有大小写不同的两个名字            | 保留排序在前的那个（大写在前），另一个报告为 `duplicate-name` |
| 请求目录里 `res/` 以外的目录                  | 跳过，报告为 `unexpected-dir`                                 |
| 名字不合规的环境组文件                        | 跳过，报告为 `invalid-name`                                   |
| 名字不合规的快照目录，例如残留的 `.tmp-*`     | 静默跳过                                                      |
| 分组和请求目录里的其他文件                    | 忽略                                                          |

请求树的问题列在请求列表下方，环境组的问题列在环境组面板里。只有大小写不同的快照和环境组文件不会被报告，请避免。

## 弄清变量值从哪来

**`{{name}}` 取定义了它的最内层的值；下表中越靠后的层优先级越高。**

| 顺序 | 层                                  | `from`             |
| ---- | ----------------------------------- | ------------------ |
| 1    | 激活的环境组                        | `env:<group>`      |
| 2    | `requests/__meta__.json`，即集合    | `group:`           |
| 3    | 各级上层分组，由外到内              | `group:<分组标识>` |
| 4    | 请求的 `__meta__.json`              | `request`          |
| 5    | 快照的 `vars`，只在按快照发送时生效 | `snapshot`         |

- `{{ name }}` 的花括号内可以有空格。变量值原样插入，值里的 `{{...}}` 不会再次展开。
- 替换范围：URL、路径参数的值、查询参数的名与值、请求头的值、`auth` 的 token、用户名和密码，以及 `body` 内的所有字符串，包括表单字段名和文件路径。请求头名、`settings` 和 `route` 不做替换。
- 没有任何层定义的 `{{name}}` 在预览中保持原样，发送时以 `UNRESOLVED_VARS` 拒绝。
- 最终取到的值恰好是 `<secret:id>` 时，不论它来自哪一层，发送时都从激活环境组的敏感值文件的 `sources.<id>` 取值。没有激活的环境组时，发送以 `SECRET_UNAVAILABLE` 失败。

## 让敏感值不进提交

**提交 `requests/`、`environments/<group>.json` 和 `redact.json`；`environments/secret/` 和 `history/` 会自动排除自己。**

easy-mok 第一次往 `environments/secret/` 和 `history/` 写入时，以及服务启动时这两个目录已存在的情况下，会在目录里写一个内容为 `*` 的 `.gitignore`。已有的 `.gitignore` 不会被覆盖，删掉后会在下一次写入或启动时重建。`*` 也匹配 `.gitignore` 自身，所以这两个目录里的任何文件都不会进入 Git，你自己的根 `.gitignore` 也不会被改动。

- 在这些 `.gitignore` 出现之前已提交的文件仍被跟踪，用 `git rm --cached` 把它们移出索引。
- 历史和快照会把 6 个字符及以上的敏感值换成占位符，并把仍含真实值的 `authorization`、`proxy-authorization`、`cookie`、`set-cookie` 和 `x-auth-token` 请求头写成 `***`，见[不把敏感信息提交进仓库](debug.md#不把敏感信息提交进仓库)。
- 直接写进 `req.json`、`__meta__.json` 或环境组文件的敏感值会原样提交。请改用 `<secret:id>` 占位符。

## 在服务运行时编辑

**所有 JSON 文件都先写临时文件再改名替换，读取方不会读到半个文件；但多个写入方之间没有锁。**

有三类保存会检查文件在加载后是否被改过。ETag 是文件文本的 SHA-1，文件不存在时为空字符串；`If-Match` 头可以带引号，也可以是弱 ETag（`W/`）。

| 保存                                                         | 比对的文件                 | 不一致时                                       |
| ------------------------------------------------------------ | -------------------------- | ---------------------------------------------- |
| `PUT /__mock/api/debug/requests/:id`                         | `req.json`                 | `409 CONFLICT`，`details.current` 中带当前请求 |
| 修改展示名、权重或变量的 `PATCH /__mock/api/debug/nodes/:id` | 该节点的 `__meta__.json`   | `409 CONFLICT`                                 |
| `PUT /__mock/api/debug/envs/:name`                           | `environments/<name>.json` | `409 CONFLICT`                                 |

管理页在这三类保存中都带 `If-Match`，所以页面加载文件之后你又手改了它时，页面的下一次保存会失败，而不会覆盖你的修改。不带 `If-Match` 的保存和其他所有写入都直接替换文件。

- 残留的临时文件 `<file>.<pid>.<ms>.tmp` 和 `res/.tmp-<hex>/` 来自中断的写入，可以放心删除。
- 在管理页改名或移动请求、分组、快照时，会改写所有引用它的场景的 `ref`。手动改目录名不会；需要自己改场景，否则这些场景会降级到下一级场景。
- 场景使用的快照元数据按修改时间和大小缓存，所以改过的快照在下一次请求时就会回放新内容。

## 修复损坏的文件

**请求、元数据、环境组和规则文件损坏时，easy-mok 拒绝覆盖，需要你手动修复或删除；敏感值文件和 Cookie jar 则会被直接覆盖。**

| 不是合法 JSON 对象的文件                   | 你看到的现象                                                       | 保存时                                         | 修复方法                 |
| ------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------- | ------------------------ |
| `requests/**/__meta__.json`                | 报告 `meta-invalid`；节点显示目录名，变量失效                      | 返回 `409 META_FILE_INVALID`                   | 修复或删除该文件         |
| `req.json`                                 | 报告 `request-invalid`；打开请求返回 `409 META_FILE_INVALID`       | 不带 `If-Match` 时替换文件，否则失败           | 修复或删除该文件         |
| `environments/<group>.json`                | 报告 `env-invalid`；该环境组不显示，若它是激活的环境组则视为未激活 | 返回 `409 META_FILE_INVALID`；改名和删除也失败 | 修复或删除该文件         |
| `redact.json`，或缺少 `fields` 数组        | 规则面板和保存快照都返回 `409 META_FILE_INVALID`                   | 保存规则时替换文件                             | 修复、删除或重新保存规则 |
| 快照的 `__meta__.json`                     | 快照仍在列表中，但无法打开或编辑；引用它的场景降级到下一级场景     | 用历史条目另存覆盖时替换                       | 修复，或另存覆盖         |
| `environments/secret/<group>.json`         | 视为没有任何来源；需要敏感值的发送以 `SECRET_UNAVAILABLE` 失败     | 下一次修改来源时替换文件                       | 重新配置来源             |
| `environments/secret/cookies/<group>.json` | 视为空的 Cookie jar                                                | 下一个 `set-cookie` 到来时替换文件             | 无需处理                 |
| `index.ndjson` 中的某一行                  | 该条目不出现在列表中                                               | 无；文件只追加                                 | 修复或删除该行           |
| `requests/__refs__.json`                   | 无影响；它从不被读取                                               | 下一次路由重载时重建                           | 删除它                   |

`req.json` 是合法 JSON 但有字段不合规时仍能打开；保存会返回 `400 BAD_REQUEST`，直到改好该字段。
