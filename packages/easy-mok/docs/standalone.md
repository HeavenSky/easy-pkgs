# Run a standalone mock server

**English** · [简体中文](../zh/docs/standalone.md)

By the end of this page, you can serve your mock folder and the admin page from their own process, without changing any dev server config. Install easy-mok first as in [Add easy-mok to your dev server](connect.md#install); the standalone server is `node:http` plus `createMock` under the hood.

## Start it from the command line

```bash
npx easy-mok                                   # src/mocks on http://127.0.0.1:4100/
npx easy-mok --folder mock --port 0            # 0 picks a random port
npx easy-mok --lan                             # also reachable from the LAN, admin page included
npx easy-mok --builtin ./builtin.ts --no-float # built-in routes resolved from the current directory; ts / esm supported
npx easy-mok --help
```

On start it prints the mock URL and the admin page URL. `Ctrl+C` (SIGINT) or SIGTERM closes the server and file watching, then exits. If the mock folder does not exist, easy-mok warns once; see [Create the mock folder](connect.md#create-the-mock-folder).

| Flag                                               | Environment variable                                       | Default                           | Meaning                                                                                                                                                    |
| -------------------------------------------------- | ---------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--folder <dir>`                                   | `MOCK_FOLDER`                                              | `src/mocks`                       | Mock folder, relative to the current directory                                                                                                             |
| `--debug-dir <dir>`                                | `MOCK_DEBUG_DIR`                                           | `<mock folder>/__debug__`         | Storage folder of the debug page, relative to the current directory; keep it outside the mock folder to use one debug collection with several mock folders |
| `--port <port>`                                    | `MOCK_PORT`                                                | 4100                              | 0 picks a random port; if the port is taken, easy-mok asks you to pick another and exits with code 1                                                       |
| `--host <address>`                                 | `MOCK_HOST`                                                | `127.0.0.1`                       | With `0.0.0.0`, LAN addresses are printed too                                                                                                              |
| `--builtin <file>`                                 | `MOCK_BUILTIN`                                             | none                              | Built-in routes loaded before the mock files, through jiti                                                                                                 |
| `--ignore <a,b>`                                   | `MOCK_IGNORE`                                              | none                              | Extra request-ignore rules, see [Keep noise out of the request log](ignore-rules.md)                                                                       |
| `--no-ui` / `--no-float` / `--lan` / `--hosts a,b` | `MOCK_UI=0` / `MOCK_FLOAT=0` / `MOCK_LAN=1` / `MOCK_HOSTS` | Same as the [options](options.md) |                                                                                                                                                            |
| `-h, --help` / `-v, --version`                     |                                                            |                                   |                                                                                                                                                            |

Command-line flags take precedence over environment variables.

## Pass values to flags

A flag that takes a value reads the next argument, unless that argument starts with `-`:

```bash
npx easy-mok --folder -v     # error: --folder is missing a value; exits with code 1
npx easy-mok --folder=-v     # uses the folder "-v"
```

A bare `--` is ignored, so `pnpm run mock -- --port 4000` passes `--port 4000` through even when the package manager keeps the `--`. easy-mok takes no positional arguments; any other bare word is reported as an error. If the `--builtin` file does not exist, easy-mok reports the resolved path and exits with code 1; relative paths resolve from the current directory.

## Start it from code

`startMock()` starts the same server from a script, for example in E2E setup.

```js
const { startMock } = require("easy-mok");

const { url, port, server, mock, close } = await startMock({ folder: "src/mocks", port: 0 }); // also accepts host and every createMock option
// ...
await close(); // closes the HTTP server, file watching, and SSE connections
```

## Call it from your frontend

A request that matches no mock gets a 404 JSON response: `{ mock: false, message: "未命中 mock 路由", ... }` (the message reads "no mock route matched"). Your frontend can reach the server in two ways:

- Request the mock URL cross-origin. The cross-origin rules are the same as in mounted mode, see [Allow other hosts, the LAN, and cross-origin pages](security.md#let-pages-on-other-origins-read-mock-responses): only `localhost` and `*.localhost`, loopback and private-network IPs, pages on the same Host, and origins in `hosts` can read the response, including unmatched 404s and preflights. If your frontend runs on a custom domain, add it with `--hosts` or `MOCK_HOSTS`.
- Proxy from your frontend dev server to the mock server, which keeps requests same-origin, for example Vite's `server.proxy: { "/api": "http://127.0.0.1:4100" }`. If the proxy keeps the original Host header, add custom domains to `hosts` here too, or enable the proxy's `changeOrigin`.
