# Debug real APIs from the admin page

**English** · [简体中文](../zh/docs/debug.md)

By the end of this page, you can keep a collection of real API requests on the **Debug** (`调试`) page of the admin page, fill them from environment variables, and know which of the files it writes to commit. The page lives at `/__mock/debug`.

## Organize requests in groups

The left column lists groups and requests. Use **Request** (`请求`) and **Group** (`分组`) to create them at the top level, or the buttons next to a group to create them inside it; the pencil edits a node and the bin deletes it.

- A name may contain letters, digits, Chinese characters, `.`, `_`, and `-`, up to 64 characters, and cannot start or end with `.`, `_`, or `-`. Names are compared case-insensitively, so `User` and `user` cannot sit in the same group.
- A node can have a display name and a weight; higher weights come first, and equal weights sort by name.
- Editing a node also moves it to another group and sets its own variables.

## Write a request

Pick a request to edit its method, URL, query and path parameters, headers, authentication, body, and settings, then click **Save** (`保存`).

```text
{{baseUrl}}/api/user/:id
```

- `{{name}}` is replaced by a variable; `:id` in the URL gets its value from the path parameter of the same name.
- **Bearer Token** and **Basic** authentication add an `authorization` header unless you wrote one yourself.
- Bodies can be JSON, text, URL-encoded form fields, multipart fields, or a file; files are paths relative to the mock folder.
- **Settings** (`设置`) hold the timeout, whether to follow redirects, whether to skip HTTPS certificate checks, an HTTP proxy, and the mock route this request belongs to.
- **Resolved preview** (`解析预览`) shows the final URL, the headers, where each variable came from, and any variable that could not be resolved.

If someone else saved the same request first, saving fails and offers to reload it.

## Send a request and read the response

Click **Send** (`发送`) to send the request as it is in the editor, saved or not; **Cancel** (`取消`) stops it. easy-mok sends it from the mock server, so there are no CORS limits and real `cookie` and `authorization` headers go out.

- A variable that cannot be resolved blocks the request; fix it in the environment or the request first.
- Compressed responses (gzip, deflate, br, and zstd where Node supports it) are stored decoded. Bodies stop at 50 MB and are marked as truncated.
- The result shows the status, time, size, response headers, the headers actually sent, and the body: JSON is formatted, HTML is shown in a sandbox without scripts, CSV as a table, images inline, and anything else can be downloaded.
- Timeouts, refused connections, and cancelled requests are recorded too, with the error code.

Only the local machine can send requests by default. To let LAN devices send through this machine, turn on **Allow LAN access** and then **Send** (`代发`) in the header; see [Allow other hosts, the LAN, and cross-origin pages](security.md#open-the-admin-page-from-another-machine).

## Keep and clear the history

Every send is kept as a history entry, listed under the request and on **All history** (`全部历史`). Entries are grouped by day; once a day passes 50 MB, its later entries go into hourly folders.

History is never deleted automatically. When it reaches 1 GB, every admin page shows a reminder; open **All history** to see the size of each day and delete whole days.

## Save results as named snapshots

A history entry you want to keep becomes a named snapshot of its request: click **Save as snapshot** (`另存为快照`) next to a result, give it a name such as `ok` or `empty`, and it appears under the request in the left column. Snapshots are what mock scenes use later, so pick names that describe the case.

- Saving under an existing name (compared case-insensitively) asks before it overwrites; the overwritten snapshot keeps its display name, weight, and snapshot variables.
- A snapshot can have its own variables, which win over the request, group, and environment variables. **Resend with this snapshot** (`按此快照重新发送`) sends the saved request with them, for example to capture the same call with another id.
- Each snapshot is a folder with `__meta__.json` and the response body as `raw.<ext>`, where the extension follows the `content-type`, so you can open `raw.csv` or `raw.html` directly.

## Compare and refresh snapshots

**Refresh** (`刷新`) on a snapshot sends its request again with the snapshot's variables and shows what changed before anything is saved: the status, the headers that differ, and a line diff of the body. JSON bodies are compared after sorting object keys, so a different key order does not count as a change; array order does. Click **Overwrite with the new result** (`用新结果覆盖快照`) to keep it, or **Discard** (`放弃`).

To compare two sends, tick two entries in a request's history. Binary bodies, and bodies over 2 MB, are compared by size and checksum only.

## Use snapshots as mock scenes

Snapshots become mock data from a route's **Scenes** tab: **Create from debug snapshot** (`从调试快照建`) either references a snapshot or copies it, see [Switch scenes and response behavior](scenes.md#answer-with-a-debug-snapshot). The snapshot panel lists the scenes that use it.

- Renaming or moving a request, a group, or a snapshot rewrites the scenes that reference it.
- Deleting a snapshot, request, or group that scenes reference asks for confirmation first and lists those scenes; after you confirm, they fall back to their next scene.
- **Settings** (`设置`) of a request suggests the mock routes that match its resolved URL, or creates one.

## Import and export cURL or OpenAPI

The buttons at the top of the request list and next to each node import and export:

- **cURL**: paste a command, such as Chrome's **Copy as cURL (bash)**, to create a request. Single and double quotes, `$'...'`, line continuations, `-X`, `-H`, `-d` and its `--data-*` variants, `-F`, `-u`, `-b`, `--compressed`, `-k`, `-L`, and `--url` are understood; anything else is listed as a warning. Exporting a request gives a command either with its `{{variables}}` or with the current environment filled in, secrets included.
- **OpenAPI 3.0 and 3.1** (YAML or JSON): every operation becomes a request, grouped by its first tag, with the path, query, and header parameters and the JSON request body example. Response examples can become snapshots, and `servers[0]` can be written into an environment's `baseUrl`. Exporting a group writes one operation per request and its snapshots as response `examples`; binary snapshots are skipped. Swagger 2.0 is not supported.

## Fill requests from environments

The right column manages environment groups such as `dev` or `test`. Select one under **Active environment** (`激活的环境组`) to use its variables.

Variables are looked up from the outside in, and the inner value wins: the active environment, then the variables of each enclosing group, then the request's own variables.

Keep tokens out of the environment file by writing a placeholder instead of the value:

```json
{ "vars": { "baseUrl": "https://dev.example.com", "token": "<secret:dev_token>" } }
```

Then configure the source `dev_token` under **Secret sources** (`敏感值来源`) as either a plain value or the name of an environment variable of the mock server process. The admin page never shows secret values, the preview keeps the placeholder, and secret sources can only be changed from an admin page opened on the local machine.

## Commit what the debug page writes

Everything lives under `__debug__/` in the mock folder, which mock loading and hot reload ignore.

| Path | Contents | Commit it? |
| --- | --- | --- |
| `__debug__/requests/` | Groups and requests: `req.json` holds the request, `__meta__.json` holds the display name, weight, and variables; snapshots are in `res/<name>/` under each request | Yes |
| `__debug__/environments/<group>.json` | Environment variables, with `<secret:id>` placeholders for secrets | Yes |
| `__debug__/environments/secret/` | Secret sources, including plain values | No; add it to `.gitignore` |
| `__debug__/history/` | Every send: the request actually sent, the response headers, and the body as its own file | No; add it to `.gitignore` |

Secret sources and history are stored as plain text for now, including the real `authorization` headers that were sent, so keep `environments/secret/` and `history/` out of version control.
