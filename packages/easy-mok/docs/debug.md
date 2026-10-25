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
| `__debug__/requests/` | Groups and requests: `req.json` holds the request, `__meta__.json` holds the display name, weight, and variables | Yes |
| `__debug__/environments/<group>.json` | Environment variables, with `<secret:id>` placeholders for secrets | Yes |
| `__debug__/environments/secret/` | Secret sources, including plain values | No; add it to `.gitignore` |

Secret sources are stored as plain text for now, so keep `environments/secret/` out of version control.
