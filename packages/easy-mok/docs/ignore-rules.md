# Keep noise out of the request log

**English** · [简体中文](../zh/docs/ignore-rules.md)

By the end of this page, you can keep browser probes, dev server traffic, and your own noisy paths out of the request log and the terminal. Ignored requests are still matched and answered by mocks as usual; only logging is skipped.

## Write an ignore rule

A rule is `[METHOD ]path`:

- `*` matches any characters within one segment, and `**` spans segments; `/a/**` also matches `/a` itself.
- The method is optional and can list several, such as `GET|POST`.
- Matching is case-insensitive and runs against the full path without the query string, including the mount prefix when easy-mok is mounted under a sub-path.

## Add rules

- On the admin page, open **Logs → Ignore rules** (`日志 → 忽略规则`) to edit custom rules. They are validated as you type and saved in the state file.
- In a log entry's detail panel, **Ignore this path** (`忽略此路径`) creates an exact rule from its method and path.
- In code, pass `ignore: ["/health", "GET /static/**"]` to add rules; for the [standalone server](standalone.md), use `--ignore` or `MOCK_IGNORE`.

## Turn built-in rules on or off

Built-in rules cover browser probes and dev server internals. You can turn them all off or disable single rules on the admin page, or turn them all off with `ignoreDefaults: false`.

- Browser probes: `/.well-known/**` (for example `/.well-known/appspecific/com.chrome.devtools.json`, requested when Chrome DevTools is open), `/favicon.ico`, `/apple-touch-icon*.png`, `/robots.txt`, `/browserconfig.xml`, `/crossdomain.xml`, `/sitemap.xml`.
- Dev server internals: `/__webpack_hmr`, `/sockjs-node/**`, `/ws`, `/@vite/**`, `/@fs/**`, `/@id/**`, `/@react-refresh`, `/node_modules/.vite/**`, `**/*.hot-update.json`, `**/*.hot-update.js`, `/__mock/**`.

Paths that may be your own app's resources, such as `/manifest.json` and `/sw.js`, are not ignored by default.
