# Hand-edit the files behind the debug page

**English** · [简体中文](../zh/docs/debug-storage.md)

By the end of this page, you can write debug requests, environments, and snapshots by hand or from a script, and resolve merge conflicts in them. It describes every file the **Debug** (`调试`) page keeps under `__debug__/` in the mock folder, or in the folder given by the `debugDir` option or `--debug-dir`; for how to use the page itself, see [Debug real APIs from the admin page](debug.md).

easy-mok writes every JSON file with tab indentation and a trailing newline. Each file has `"version": 1`; easy-mok writes it but does not check it when reading.

## See the whole layout

**A directory that contains a `req.json` file is a request; any other directory under `requests/` is a group.**

```text
<mock folder>/__debug__/
  redact.json                    field rules for snapshots
  requests/
    __meta__.json                the collection: variables and request defaults (optional)
    __refs__.json                which scenes reference which snapshots (generated)
    user/                        group
      __meta__.json              display name, weight, variables, request defaults (optional)
      get-user/                  request
        __meta__.json            display name, weight, variables (optional)
        req.json                 request definition
        res/
          ok/                    snapshot "ok"
            __meta__.json        snapshot metadata (required)
            raw.json             response body
            req.bin              request body, when stored separately
  environments/
    dev.json                     environment group "dev"
    secret/
      .gitignore                 contains "*"
      dev.json                   secret sources of "dev"
      cookies/
        dev.json                 cookie jar of "dev"
  history/
    .gitignore                   contains "*"
    20261026/
      index.ndjson               index of the entries directly in this day
      001203_a1b2c3/             one send
        __meta__.json
        raw.json
      14/                        hour folder, used once the day passes 50 MB
        index.ndjson
        140501_c3d4e5/
```

| Path                                       | Written by                                             | Unknown fields on rewrite                                           |
| ------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------- |
| `requests/**/req.json`                     | Saving a request                                       | Kept                                                                |
| `requests/**/__meta__.json`                | Editing a group or request                             | Kept                                                                |
| `requests/**/res/<name>/__meta__.json`     | Saving or editing a snapshot                           | Kept on edit; dropped when the snapshot is overwritten from history |
| `requests/__refs__.json`                   | Every route reload                                     | Regenerated from scratch                                            |
| `environments/<group>.json`                | Editing an environment                                 | Kept                                                                |
| `environments/secret/<group>.json`         | Editing a secret source                                | Dropped, along with invalid sources                                 |
| `environments/secret/cookies/<group>.json` | Every response that sets cookies, and clearing cookies | Dropped at the top level; kept inside each cookie                   |
| `history/**`                               | Every send                                             | Never rewritten                                                     |
| `redact.json`                              | Saving the redaction rules                             | Dropped                                                             |

Mock loading and hot reload do not watch `__debug__/`. The admin page reads these files again on every request, so a hand edit takes effect at once, but an open debug page shows it only after you reload the page.

## Write a request in `req.json`

**Only `req.json` makes a directory a request; every field in it is optional.** A file containing `{}` is a valid `GET` request with an empty URL.

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

| Field          | Type              | Default                 | Rules                                                                                                                                                                                                                                 |
| -------------- | ----------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `method`       | string            | `"GET"`                 | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, or `OPTIONS`; lowercase is accepted and saved uppercase                                                                                                                              |
| `url`          | string            | `""`                    | May contain `{{var}}` and `:name` path parameters; any other type becomes `""`                                                                                                                                                        |
| `params.path`  | object of strings | `{}`                    | Fills `:name` in the URL when it is followed by `/`, `?`, `#`, or the end; the value is URL-encoded                                                                                                                                   |
| `params.query` | array of rows     | `[]`                    | Appended to the URL after the query string it already has                                                                                                                                                                             |
| `headers`      | array of rows     | `[]`                    | The name must be a valid HTTP header name or empty; names are sent lowercase. Merged with the collection and group headers, see [Set defaults for a group or the whole collection](#set-defaults-for-a-group-or-the-whole-collection) |
| `auth`         | object            | `{ "type": "inherit" }` | `type` is `inherit` (use the nearest group or collection auth, or none), `none`, `bearer` (with `token`), or `basic` (with `username` and `password`); it adds `authorization` only when no enabled `authorization` header exists     |
| `body`         | object            | `{ "type": "none" }`    | See the next table                                                                                                                                                                                                                    |
| `settings`     | object            | `{}`                    | Only the keys this request overrides; a missing key is inherited from the groups, then the collection, then the defaults in the settings table                                                                                        |
| `route`        | string or `null`  | `null`                  | The mock route this request belongs to, as shown in **Settings**; sending does not use it                                                                                                                                             |

A row is `[name, value, enabled]`. The first two items must be strings. The third disables the row only when it is `false`; a missing third item means enabled. Items after the third are dropped on save. A row with an empty name is skipped when sending.

| `body.type` | Other keys                                                    | Bytes sent and default `content-type`                                                                                |
| ----------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `none`      |                                                               | No body                                                                                                              |
| `json`      | `content`: any JSON value                                     | `JSON.stringify(content)`, `application/json`                                                                        |
| `text`      | `content`: string, required                                   | The string, `text/plain; charset=utf-8`                                                                              |
| `form`      | `fields`: array of rows                                       | URL-encoded fields, `application/x-www-form-urlencoded`                                                              |
| `multipart` | `parts`: array of `{ "name", "value"?, "file"?, "enabled"? }` | `multipart/form-data`; `name` is required, `"enabled": false` skips the part, and a part with `file` sends that file |
| `binary`    | `file`: string, required                                      | The file, with a type taken from its extension                                                                       |

`file` paths are relative to the mock folder and must stay inside it. The default `content-type` is added only when no `content-type` header is enabled.

| `settings` key    | Type             | Default | Rules                                                              |
| ----------------- | ---------------- | ------- | ------------------------------------------------------------------ |
| `timeoutMs`       | integer          | `30000` | 1 to 600000; covers the whole send, redirects included             |
| `followRedirects` | boolean          | `true`  | At most 10 redirects                                               |
| `insecureTLS`     | boolean          | `false` | `true` skips certificate checks                                    |
| `proxy`           | string or `null` | `null`  | `http://[user:pass@]host:port`; HTTPS targets go through `CONNECT` |
| `skipCookieJar`   | boolean          | `false` | `true` turns off the environment's cookie jar                      |

Boolean keys must be `true` or `false`; saving another value fails with `400`. Requests created before inheritance existed have every key written out, so they keep their own values until you choose **Restore inheritance** (`恢复继承`) on each key in **Settings**.

Display name, weight, and request variables do not belong here; they go in the request's `__meta__.json`. Unknown fields, at any level, are kept when the admin page saves the file.

The admin page checks these rules only when you save. It still opens a `req.json` that breaks them and shows the file as written, but saving fails with `400 BAD_REQUEST` until you fix the field the error names.

## Name groups and set variables in `__meta__.json`

**`__meta__.json` is optional in groups and requests; without it, the node shows its directory name, weight 0, and no variables.**

```json
{ "version": 1, "name": "用户", "weight": 10, "vars": { "tenant": "t001" } }
```

| Field    | Type              | Default        | Rules                                                                                           |
| -------- | ----------------- | -------------- | ----------------------------------------------------------------------------------------------- |
| `name`   | string            | Directory name | Display name; a blank string counts as missing                                                  |
| `weight` | integer           | `0`            | Higher comes first; equal weights sort by display name. Anything but a safe integer counts as 0 |
| `vars`   | object of strings | `{}`           | Variables of this level; see [Know where a value comes from](#know-where-a-value-comes-from)    |

- When reading, entries of `vars` with an invalid name or a non-string value are ignored without a warning. Saving them from the admin page fails with `400`.
- The admin page removes `name` when you clear it, `weight` when it is 0, and `vars` when it is empty. Other fields are kept.
- `requests/__meta__.json` is the collection: its fields apply to every request. The admin page edits it from the **请求集合** row at the top of the tree.

## Set defaults for a group or the whole collection

**`requests/__meta__.json` and a group's `__meta__.json` may also hold default `headers`, `settings`, and `auth` for the requests below them; a request's `__meta__.json` may not, its own values live in `req.json`.**

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

| Field      | Type          | Missing means                    | Rules                                                                                                                                                             |
| ---------- | ------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `headers`  | array of rows | No headers at this level         | Merged by name, case-insensitively, from the collection down to the request: an enabled row replaces the outer header of the same name, a disabled row removes it |
| `settings` | object        | Nothing overridden at this level | Same keys and rules as `settings` in `req.json`; each key is inherited on its own                                                                                 |
| `auth`     | object        | Inherit from the outer level     | `none`, `bearer`, or `basic`; `inherit` is not allowed here. `{ "type": "none" }` stops an outer auth from reaching the requests below                            |

- Sending, the preview, cURL export, and history all use the merged result; `template.request` in history and snapshots stores it. Refreshing a snapshot reuses those stored values and only picks up headers added to its groups or the collection since then.
- The admin page removes `headers` when the list is empty, `settings` when no key is set, and `auth` when it is set back to inherit.

## Define environment groups in `environments/<group>.json`

**The file name without `.json` is the group name; the file holds the group's variables and only placeholders for secrets.**

```json
{
	"version": 1,
	"name": "开发环境",
	"weight": 0,
	"vars": { "baseUrl": "https://dev.example.com", "token": "<secret:dev_token>" }
}
```

`name`, `weight`, and `vars` follow the same rules as in `__meta__.json`, except that the admin page keeps `weight` when it is 0 and keeps an empty `vars`. Unknown fields are kept.

- A placeholder `<secret:id>` must be the whole value. To add a prefix, write it in the request instead, as in `Bearer {{token}}`.
- Which group is active is not stored here. It is the `debug.env` field of the state file, `node_modules/.cache/easy-mok/state.json` by default, see [Commit what the admin page writes](files.md).
- Renaming or deleting a group from the admin page renames or deletes its secret file and cookie jar too. When you rename by hand, rename all three.

## Configure secret sources in `environments/secret/<group>.json`

**Each placeholder `<secret:id>` in group `<group>` takes its value from `sources.<id>` in this file.**

```json
{
	"version": 1,
	"sources": {
		"dev_token": { "from": "keychain", "service": "dev-api", "account": "me" },
		"dev_key": { "from": "env", "name": "DEV_API_KEY" }
	}
}
```

A source id matches `^[A-Za-z0-9_]{1,64}$`.

| `from`     | Other keys                                              | Value                                                                                                                                                           |
| ---------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `value`    | `value`: string                                         | The string itself, stored in this file                                                                                                                          |
| `env`      | `name`: matches `^[A-Za-z_][A-Za-z0-9_]*$`              | That environment variable of the mock server process                                                                                                            |
| `keychain` | `service`: non-empty string, `account`: string          | `security find-generic-password` on macOS, `secret-tool lookup` on Linux; other systems fail                                                                    |
| `command`  | `argv`: non-empty array of strings, `argv[0]` non-empty | Standard output without its final line break; runs without a shell, fails on a non-zero exit, after 15 seconds, on more than 1 MB of output, or on empty output |
| `prompt`   |                                                         | Typed on the admin page when sending; kept in memory only                                                                                                       |

A source with an invalid id or shape is ignored. The next change from the admin page rewrites the file as `{ "version", "sources" }` and drops those sources and any other field.

## Read the cookie jar in `environments/secret/cookies/<group>.json`

**easy-mok creates the jar on the first `set-cookie` while the group is active, and rewrites it after every response that sets cookies.**

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

| Field      | Type             | Meaning                                                                          |
| ---------- | ---------------- | -------------------------------------------------------------------------------- |
| `domain`   | string           | Lowercase host, without a leading dot                                            |
| `hostOnly` | boolean          | `true` matches `domain` exactly; `false` also matches its subdomains             |
| `path`     | string           | Matches that path and paths below it                                             |
| `expires`  | number or `null` | Milliseconds since the epoch; `null` is a session cookie that never expires here |
| `secure`   | boolean          | `true` sends the cookie over HTTPS only                                          |
| `httpOnly` | boolean          | Recorded only; it does not affect sending                                        |

Entries without a string `name`, and expired entries, are dropped when the jar is read. A new cookie replaces the one with the same `name`, `domain`, and `path`.

## Read the history in `history/`

**Each send that reaches the network becomes one folder, and only `index.ndjson` makes it show up in lists.**

Folders use the server's local time: `history/<YYYYMMDD>/<HHmmss>_<6 hex digits>/`. Once the sizes indexed for a day exceed 52428800 bytes (50 MB), later entries of that day go to `history/<YYYYMMDD>/<HH>/<HHmmss>_<id>/`; earlier entries stay where they are. A history id is the folder path below `history/`, such as `20261026/001203_a1b2c3` or `20261026/14/140501_c3d4e5`.

An entry folder holds:

- `__meta__.json`, described in [Read a snapshot's `__meta__.json`](#read-a-snapshots-__meta__json).
- `raw.<ext>` with the response body, missing when the body is empty. The extension follows the response `content-type`: `json` (and `+json`), `html`, `csv`, `txt`, `xml` (and `+xml`), `js`, `css`, `svg`, `png`, `jpg`, `gif`, `webp`, `pdf`, otherwise `bin`.
- `req.bin` with the request body, when it is not text or is over 64 KB.

Each day folder and hour folder has an append-only `index.ndjson`, one JSON object per line, written after the entry folder is complete:

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

| Field           | Meaning                                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `request`       | Request id, or `null` for an unsaved draft                                                                                                            |
| `env`           | Active environment group, or `null`                                                                                                                   |
| `method`, `url` | As sent on the first hop, with secrets replaced by placeholders                                                                                       |
| `status`        | Final status, or `null` when the send failed                                                                                                          |
| `size`          | Bytes of all files in the entry folder                                                                                                                |
| `time`          | Milliseconds since the epoch                                                                                                                          |
| `error`         | Error code of a failed send, such as `TIMEOUT`, `ABORTED`, `PROXY_FAILED`, `TOO_MANY_REDIRECTS`, or a Node code like `ECONNREFUSED`; otherwise `null` |

- Requests refused before going out write nothing: unresolved variables, an invalid URL, an unavailable secret, or a missing body file.
- Lines that are not valid JSON are skipped, and so are lines whose folder no longer exists. A folder without an index line never appears in lists or in the total size.
- Nothing is deleted automatically; the admin page deletes whole days. The total size is counted from the index lines once and then kept in memory, so after deleting days by hand, restart the server to see the right total.

## Read a snapshot's `__meta__.json`

**A snapshot is a copy of a history entry folder in `requests/<request>/res/<name>/`, with a few fields added to its `__meta__.json`.**

| Field        | Type              | In history | In snapshots       | Meaning                                                                                                                           |
| ------------ | ----------------- | ---------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `origin`     | object            | Yes        | Yes                | `{ "kind": "debug", "request": <request id or null> }`; snapshots add `historyId`; imported snapshots have `{ "kind": "import" }` |
| `capturedAt` | string            | Yes        | Yes                | Local time with offset, such as `2026-10-26T00:12:03+08:00`; imported snapshots use UTC                                           |
| `reqHash`    | string or `null`  | Yes        | Yes                | `sha256:` plus the SHA-256 of the request definition with sorted keys                                                             |
| `timing`     | object            | Yes        | Yes                | `{ "durationMs", "ttfbMs" }`; `ttfbMs` is `null` when no response arrived                                                         |
| `request`    | object            | Yes        | Yes                | The request actually sent on the first hop                                                                                        |
| `template`   | object            | Yes        | Yes                | `{ "env", "request", "values" }`: the active group, the request definition as sent, and where each variable came from             |
| `response`   | object or `null`  | Yes        | Yes                | `null` when the send failed                                                                                                       |
| `error`      | object or `null`  | Yes        | Yes                | `{ "code", "message" }` when the send failed                                                                                      |
| `note`       | string            | Yes        | Yes                | Written as `""`                                                                                                                   |
| `name`       | string            |            | Optional           | Display name; defaults to the folder name                                                                                         |
| `weight`     | integer           |            | Yes                | Sort weight                                                                                                                       |
| `vars`       | object of strings |            | Yes                | Snapshot variables, used by **Resend with this snapshot** and **Refresh**                                                         |
| `replay`     | object            |            | Yes                | `{ "setCookie": boolean }`: whether scenes replay `set-cookie`                                                                    |
| `redaction`  | object            |            | Saved from history | `{ "fields", "setCookie", "binaryRequest" }`: what saving redacted; `setCookie` is `kept`, `masked`, or `none`                    |

`request` holds `method`, `url`, `headers`, and `body`:

- `headers` are `[name, value]` pairs with lowercase names, as sent, including `host`, `content-length`, the default `accept-encoding: gzip, deflate, br`, and cookies from the jar.
- `body` is `{ "type": "none" }`, `{ "type": "text", "text" }`, or `{ "type": "binary", "file": "req.bin", "size", "sha256" }`. It is text when the `content-type` is `text/*`, JSON, XML, JavaScript, or URL-encoded, and the body is at most 64 KB.

`response` holds `status`, `statusText`, `httpVersion`, `headers`, `body`, and `redirects`:

| `response.body` key      | Meaning                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `file`                   | `raw.<ext>`, or `null` for an empty body                                                  |
| `contentType`, `charset` | From the response `content-type`; `contentType` is lowercase without parameters           |
| `size`, `sha256`         | Of the stored file                                                                        |
| `originalEncoding`       | `content-encoding` of the response, or `null`                                             |
| `decoded`                | `false` when the body could not be decompressed; the file then holds the compressed bytes |
| `truncated`              | `true` when the body passed 50 MB and was cut                                             |
| `redacted`               | Snapshots only: `true` when field rules changed the file                                  |

`template.values` maps each variable to `{ "value", "from" }`. `from` is `env:<group>`, `group:` for `requests/__meta__.json`, `group:<group id>`, `request`, `snapshot`, `path` for a path parameter, or `secret:<id>`, whose value is always the placeholder.

## Write a snapshot by hand

**A scene can reference any snapshot whose `__meta__.json` has a `response` object and no `error`.**

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

Put this next to a `raw.json` in `requests/user/get-user/res/ok/` and reference it from a scene as `"ref": "user/get-user#ok"`, see [Switch scenes and response behavior](scenes.md#answer-with-a-debug-snapshot). The request folder needs its `req.json` for the snapshot to show on the debug page.

- When `body.file` is set, that file must exist, or the reference counts as broken. Without `body.file`, the scene answers with an empty body.
- Replay drops transport and server headers such as `content-length`, `content-encoding`, `date`, `etag`, and the CORS headers, every `x-mock*` header, and `set-cookie` unless `replay.setCookie` is `true`.
- After editing a `raw` file by hand, update `size` and `sha256`. Comparisons of binary bodies and bodies over 2 MB use these two fields instead of reading the file.
- Without `template`, **Refresh** sends the request's current `req.json`.

Saving a history entry over an existing snapshot keeps the old `name`, `weight`, `vars`, and `replay.setCookie` unless the save sets new ones; every other field comes from the new entry. easy-mok writes the new snapshot in a temporary `res/.tmp-<hex>/` folder and renames it into place.

## Control snapshot redaction in `redact.json`

**Without `redact.json`, saving a snapshot redacts the default credential fields; once the file exists, only its rules apply.**

```json
{ "version": 1, "fields": ["password", "token", "$.data.*.idCard"] }
```

The default rules are `password`, `passwd`, `token`, `accessToken`, `access_token`, `refreshToken`, `refresh_token`, `secret`, `apiKey`, and `api_key`. A file with `"fields": []` turns field redaction off.

- A plain name matches that key at any depth, case-insensitively.
- A rule starting with `$.` is a path from the root, split on `.`, with `*` for any one key or array index. Keys that contain a dot cannot be matched by a path.
- A matching value that is not `null` becomes `"***"`, objects and arrays included.
- Rules apply when a snapshot is saved: to the response file when its extension is `json` and it was decoded, and to the inline text request body when it parses as JSON. A changed file is rewritten with 2-space indentation when the original had line breaks, compact otherwise; an unchanged file keeps its original bytes.
- `template.request` is not redacted, so a literal secret in `req.json` also appears in its snapshots.

When reading, entries that are not strings or are blank are ignored. Saving from the admin page trims and deduplicates the rules, rejects a `$` rule that is not `$.a.b`, and writes only `version` and `fields`.

## Rebuild `requests/__refs__.json`

**`__refs__.json` is a generated list of which scenes reference which snapshots; easy-mok never reads it back.**

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

It is rebuilt from `__scenes__/` after every route reload, including startup, and written only when its content changes. Keys are sorted, each list is sorted by `route` and then `scene`, and `file` is relative to the mock folder. With no references and no existing file, it is not created. On a merge conflict, delete it and start the server, or change any scene.

## Pick valid names

**Groups, requests, snapshots, and environment groups share one name rule, and names are compared case-insensitively.**

```text
^(?![._-])[A-Za-z0-9._\-\p{Script=Han}]{1,64}(?<![._-])$
```

- A name has 1 to 64 letters, digits, Chinese characters, `.`, `_`, or `-`, and does not start or end with `.`, `_`, or `-`.
- Names are compared after Unicode NFC normalization and lowercasing, because macOS can return Chinese file names in NFD. Groups and requests in the same parent share one namespace; snapshots are compared within one `res/`; environment groups within `environments/`.
- A group or request cannot be named `res` or `req.json`, in any case.

| Id               | Form                                           | Example                  |
| ---------------- | ---------------------------------------------- | ------------------------ |
| Request or group | Names joined with `/`, relative to `requests/` | `user/get-user`          |
| Snapshot         | `<request id>#<snapshot name>`                 | `user/get-user#ok`       |
| History entry    | Path relative to `history/`                    | `20261026/001203_a1b2c3` |
| Variable         | `^[A-Za-z_][A-Za-z0-9_.-]{0,63}$`              | `base.url`               |
| Secret source    | `^[A-Za-z0-9_]{1,64}$`                         | `dev_token`              |

What the debug page does with directories it finds on disk:

| On disk                                                                | Result                                                                                                   |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| A directory under `requests/` starting with `_` or `.`                 | Skipped silently                                                                                         |
| A directory with an invalid name, or one named `res` outside a request | Skipped; reported as `invalid-name`                                                                      |
| Two names in one group that differ only in case                        | The one that sorts first (uppercase before lowercase) is kept; the other is reported as `duplicate-name` |
| A directory inside a request other than `res/`                         | Skipped; reported as `unexpected-dir`                                                                    |
| An environment file with an invalid name                               | Skipped; reported as `invalid-name`                                                                      |
| A snapshot folder with an invalid name, such as a leftover `.tmp-*`    | Skipped silently                                                                                         |
| Other files in group and request folders                               | Ignored                                                                                                  |

Request-tree problems are listed under the request list, environment problems in the environment panel. Snapshots and environment files that differ only in case are not reported; avoid them.

## Know where a value comes from

**`{{name}}` takes the value from the innermost layer that defines it; layers further down this table win.**

| Order | Layer                                                    | `from`             |
| ----- | -------------------------------------------------------- | ------------------ |
| 1     | The active environment group                             | `env:<group>`      |
| 2     | `requests/__meta__.json`, the collection                 | `group:`           |
| 3     | Each enclosing group, outermost first                    | `group:<group id>` |
| 4     | The request's `__meta__.json`                            | `request`          |
| 5     | The snapshot's `vars`, only when sending with a snapshot | `snapshot`         |

- `{{ name }}` may have spaces inside the braces. A value is inserted as is; `{{...}}` inside a value is not expanded again.
- Variables are replaced in the URL, path parameter values, query names and values, header values, the `auth` token, username, and password, and every string inside `body`, including form field names and file paths. They are not replaced in header names, `settings`, or `route`.
- A `{{name}}` that no layer defines stays as written in the preview, and sending is refused with `UNRESOLVED_VARS`.
- When the winning value is exactly `<secret:id>`, from any layer, sending takes it from `sources.<id>` of the active group's secret file. Without an active group, sending fails with `SECRET_UNAVAILABLE`.

## Keep secrets out of commits

**Commit `requests/`, `environments/<group>.json`, and `redact.json`; `environments/secret/` and `history/` exclude themselves.**

easy-mok writes a `.gitignore` containing `*` into `environments/secret/` and `history/` when it first writes there, and when the server starts while the directory exists. It never overwrites an existing `.gitignore` there, and recreates a deleted one on the next write or start. The `*` also covers the `.gitignore` itself, so nothing in these directories reaches Git, and your root `.gitignore` is not touched.

- Files committed before these `.gitignore` files existed stay tracked; remove them from the index with `git rm --cached`.
- History and snapshots replace secret values of 6 characters or more with placeholders, and write `authorization`, `proxy-authorization`, `cookie`, `set-cookie`, and `x-auth-token` request headers as `***` when they still hold a real value; see [Keep secrets out of what you commit](debug.md#keep-secrets-out-of-what-you-commit).
- A secret typed directly into `req.json`, a `__meta__.json`, or an environment file is committed as written. Use a `<secret:id>` placeholder instead.

## Edit while the server is running

**Every JSON file is written to a temporary file and renamed into place, so a reader never sees half a file; there is no lock between writers.**

Three kinds of save check that the file has not changed since it was loaded. The ETag is the SHA-1 of the file's text, or an empty string for a missing file; the `If-Match` header may be quoted or weak (`W/`).

| Save                                                                                    | Compared with               | On mismatch                                                   |
| --------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------- |
| `PUT /__mock/api/debug/requests/:id`                                                    | `req.json`                  | `409 CONFLICT`, with the current request in `details.current` |
| `PATCH /__mock/api/debug/nodes/:id` that changes the display name, weight, or variables | That node's `__meta__.json` | `409 CONFLICT`                                                |
| `PUT /__mock/api/debug/envs/:name`                                                      | `environments/<name>.json`  | `409 CONFLICT`                                                |

The admin page sends `If-Match` for all three, so a hand edit made after the page loaded the file makes its next save fail instead of overwriting yours. A save without `If-Match`, and every other write, simply replaces the file.

- Leftover temporary files, `<file>.<pid>.<ms>.tmp` and `res/.tmp-<hex>/`, come from an interrupted write and are safe to delete.
- Renaming or moving a request, group, or snapshot from the admin page rewrites the `ref` of every scene that uses it. Renaming folders by hand does not; update the scenes yourself, or they fall back to their next scene.
- Snapshot metadata used by scenes is cached by modification time and size, so an edited snapshot is replayed on the next request.

## Recover from a broken file

**easy-mok refuses to overwrite a broken request, metadata, environment, or rule file, so you fix or delete it by hand; secret files and cookie jars are overwritten instead.**

| File that is not a valid JSON object           | What you see                                                                                               | What saving does                                                   | Fix                                  |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------ |
| `requests/**/__meta__.json`                    | `meta-invalid` problem; the node shows its directory name and loses its variables                          | Fails with `409 META_FILE_INVALID`                                 | Fix or delete the file               |
| `req.json`                                     | `request-invalid` problem; opening the request fails with `409 META_FILE_INVALID`                          | Replaces the file when sent without `If-Match`, otherwise fails    | Fix or delete the file               |
| `environments/<group>.json`                    | `env-invalid` problem; the group is hidden, and if it was active, no group is active                       | Fails with `409 META_FILE_INVALID`; renaming and deleting fail too | Fix or delete the file               |
| `redact.json`, or one without a `fields` array | The rules panel and saving snapshots fail with `409 META_FILE_INVALID`                                     | Saving the rules replaces the file                                 | Fix, delete, or save the rules again |
| A snapshot's `__meta__.json`                   | The snapshot is listed but cannot be opened or edited; scenes referencing it fall back to their next scene | Saving a history entry over it replaces it                         | Fix it, or save over it              |
| `environments/secret/<group>.json`             | Treated as having no sources; sends that need a secret fail with `SECRET_UNAVAILABLE`                      | The next source change replaces the file                           | Re-enter the sources                 |
| `environments/secret/cookies/<group>.json`     | Treated as an empty jar                                                                                    | The next `set-cookie` replaces the file                            | None needed                          |
| A line in `index.ndjson`                       | That entry is missing from lists                                                                           | Nothing; the file is only appended to                              | Fix or delete the line               |
| `requests/__refs__.json`                       | Nothing; it is never read                                                                                  | Rebuilt on the next route reload                                   | Delete it                            |

A `req.json` that is valid JSON but breaks a field rule still opens; saving it fails with `400 BAD_REQUEST` until the field is fixed.
