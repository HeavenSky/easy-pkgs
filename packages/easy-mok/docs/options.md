# Options and environment variables

**English** · [简体中文](../zh/docs/options.md)

This page lists what each `createMock()` / `mockVitePlugin()` option means, its default, and the environment variable that sets it when the option is omitted. The option types are defined by `MockOptions` in [src/server/index.ts](../src/server/index.ts); flags for `npx easy-mok` are in [Run a standalone mock server](standalone.md#start-it-from-the-command-line).

| Option | Environment variable | Default | Meaning |
|---|---|---|---|
| `cwd` | | `process.cwd()` | Base directory for relative paths such as `folder` and `stateFile`; the jiti transpile cache goes to `node_modules/.cache/easy-mok/jiti` under it |
| `folder` | | `src/mocks` | Mock folder, relative to `cwd` |
| `ui` | `MOCK_UI=0` turns it off | on | Admin page and admin API at `/__mock/` |
| `float` | `MOCK_FLOAT=0` turns it off | on | Floating bar script `/__mock/float.js`; always off when `ui` is off, because the bar needs the admin API, and `floatScript` is then `null` |
| `lan` | `MOCK_LAN=1` | off | Allow private-network clients to use the admin API, and pages on private-network IPs to read mock responses cross-origin |
| `hosts` | `MOCK_HOSTS=a.test,b.test` | none (the Vite plugin uses `server.allowedHosts`) | Extra trusted host names; a leading `.` also matches subdomains. Used for the Host check on the admin API and mock routes, and for cross-origin access to mock responses. `*` turns off the Host check for mock routes; the admin API still checks it. See [Allow other hosts, the LAN, and cross-origin pages](security.md) |
| `builtin` | | none | Built-in routes loaded before the mock files |
| `ignore` | | none | Extra request-ignore rules (array of strings), see [Keep noise out of the request log](ignore-rules.md) |
| `ignoreDefaults` | | `true` | `false` turns off the built-in ignore rules |
| `logSize` | | 500 | Number of request log entries to keep; request and response bodies of all entries are also capped at 32 MB in total, and the oldest entries are dropped beyond that |
| `stateFile` | | `node_modules/.cache/easy-mok/state.json` | Runtime state file, relative to `cwd`, see [Commit what the admin page writes](files.md) |
| `watch` | | `true` | `false` stops watching mock files and their imports, so nothing reloads; useful in tests and one-off scripts |

An explicit option always wins over its environment variable.
