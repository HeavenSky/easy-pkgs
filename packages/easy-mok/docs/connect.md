# Add easy-mok to your dev server

**English** · [简体中文](../zh/docs/connect.md)

By the end of this page, your existing dev server answers mocked routes and serves the admin page at `/__mock/`; requests that match no mock continue to your own routes and proxies. The shortest path is in the README [quick start](../README.md#get-your-first-mock-running); to run mocks without a dev server, see [Run a standalone mock server](standalone.md).

## Install

```bash
npm i -D easy-mok
```

easy-mok requires Node.js 18 or later. It ships its own express 5 and http-proxy-middleware 3, so it does not depend on the versions in your project. The type declarations reference `@types/express`, which is installed as a runtime dependency, so TypeScript projects need nothing extra.

## Create the mock folder

easy-mok loads mocks from the mock folder, `src/mocks` by default; when the folder does not exist, no request matches a mock. `createMock`, the Vite plugin, `startMock`, and the CLI then print a one-time warning with the folder path and how to create it.

A folder you create later loads automatically, even when its parent directories are created with it (`mkdir -p`). If `watch` is `false`, restart easy-mok after creating the folder.

## Mount it on your host

Each example creates the middleware with `createMock()` and the default mock folder `src/mocks`; pass `{ folder: "..." }` to change it. All options are listed in [Options and environment variables](options.md).

### Vite

```js
// vite.config.js
import { mockVitePlugin } from "easy-mok";

export default { plugins: [mockVitePlugin({ folder: "src/mocks" })] };
```

The plugin also injects the floating bar into your pages. It stops watching files when the dev server closes, including when you call `server.close()` in `middlewareMode`. When neither the `hosts` option nor `MOCK_HOSTS` is set, it trusts the hosts in Vite's `server.allowedHosts`.

### Express 4 / 5

```js
const { createMock } = require("easy-mok");

app.use(createMock({ folder: "src/mocks" }));
```

### webpack-dev-server

```js
const { createMock } = require("easy-mok");

// webpack-dev-server 4+
devServer: { setupMiddlewares: (m, s) => { s.app.use(createMock()); return m; } };
```

For webpack-dev-server 1-3, register the same `app.use(createMock())` in the `setup` hook.

### Connect and node:http

```js
const mock = createMock();
http.createServer((req, res) => mock(req, res, () => origin(req, res)));
```

The third argument runs when no mock matches, so unmatched requests fall back to your existing handler `origin`. A Connect app takes the middleware with `app.use(mock)`.

### Fastify

```js
const mock = createMock();
fastify.addHook("onRequest", (request, reply, done) => {
	if (!mock.match(request.raw)) { return done(); }
	reply.hijack();
	mock(request.raw, reply.raw, () => { reply.raw.statusCode = 404; reply.raw.end(); });
});
```

`mock.match()` returns `true` only when a mock route matches and the route is not in passthrough mode, so every other request goes through Fastify's own routes.

## Mount under a sub-path

Pass a path to `app.use()` to serve mocks only below it.

```js
app.use("/api", createMock()); // "GET /user" matches /api/user
```

Mocks match the path after the mount point, and the admin page moves to `/api/__mock/`. Proxies forward the path without the mount prefix, for both ordinary requests and WebSocket upgrades.

## Shut it down with your host

Close the middleware when your host stops, so no watcher keeps the process alive.

```js
await mock.close();
```

If you manage the lifecycle yourself, call `close()` before your host shuts down; it stops file watching and closes the admin page's live (SSE) connections. The Vite plugin does this for you.

## Show the floating bar

One script tag puts the floating bar on any development page.

```html
<script src="/__mock/float.js"></script>
```

Add this tag to your development page to get the floating bar; the Vite plugin injects it automatically. `mock.floatScript` holds this path, or `null` when the bar is disabled. Under a sub-path, write `<mount path>/__mock/float.js`; the bar derives its API paths from the script URL. In browsers without `attachShadow` (IE 8-11), the script checks for support and exits silently.

## Legacy aliases

Two exports remain for older code. `createMockware(folder?, options?)` is equivalent to `createMock({ ...options, folder })`. `mockVite` is an alias of `createMockware` and returns middleware, not a Vite plugin; use `mockVitePlugin` in Vite projects.
