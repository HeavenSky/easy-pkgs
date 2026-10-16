# Changelog

## 0.0.2 (2026-10-16)

### Fixed

- Admin-created routes with a `null` response body now load and replay `null`, instead of failing with 500 and leaving a dead entry in `__gui__.json` ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/docs/files.md#replay-saved-routes-and-scenes)).
- Saving an empty response (204, bodiless DELETE) as a scene now replays an empty body, instead of failing to create the route ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/docs/files.md#replay-saved-routes-and-scenes)).
- A route that fails to load after creation now rolls back `__gui__.json` and its scene file, and the admin API returns `LOAD_ERROR` with the related diagnostics ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/docs/files.md#recover-when-a-new-route-fails-to-load)).
- `--folder -v` and similar now report a missing value and exit with code 1, instead of using `-v` as the folder ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/docs/standalone.md#pass-values-to-flags)).
- A missing `--builtin` file now reports its own path and exits with code 1 ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/docs/standalone.md#pass-values-to-flags)).

### Added

- A one-time warning with the path and how to create it when the mock folder does not exist, for `createMock`, the Vite plugin, `startMock`, and the CLI ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/docs/connect.md#create-the-mock-folder)).
- In the CLI, `--` ends option parsing, and `--name=-value` passes values that start with `-` ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/docs/standalone.md#pass-values-to-flags)).

## 0.0.1 (2026-10-16)

First release.

### Added

- Mocks live in code: `.js`, `.cjs`, `.mjs`, `.ts`, `.cts`, `.mts`, and `.json` files in the mock folder load through jiti, so ESM and TS syntax work ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/docs/writing-mocks.md#use-js-ts-esm-or-json)).
- Mock files and the files they import by relative path reload on save; a broken file or scene file keeps its last working content and shows a diagnostic in the admin page and the terminal ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/docs/writing-mocks.md#reload-on-save-and-read-diagnostics)).
- Mount on express 4 / 5, webpack-dev-server 1-6, Vite (`mockVitePlugin`), Connect, `node:http`, and Fastify ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/docs/connect.md)).
- Run standalone with `npx easy-mok` or `startMock(options)`, configured by flags or `MOCK_*` environment variables ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/docs/standalone.md)).
- Multiple scenes per route with `scenes()` or the admin page, chosen by request header or query, browser-only scene group, picked scene, global scene group, then `default` ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/docs/scenes.md#know-which-scene-a-request-gets)).
- Behavior panel for delay, status code override, passthrough to the real backend, and a global on/off switch ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/docs/scenes.md#set-delay-status-code-or-passthrough)).
- Proxy scenes, including WebSocket, that also accept the older `onProxyReq` / `onProxyRes` / `onError` options ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/docs/writing-mocks.md#proxy-to-a-real-backend)).
- Request log of mocked requests and unmatched fetch/XHR, with decoded bodies and masked sensitive headers; any response can be saved as a scene, and any unmatched request can start a new mock ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/docs/request-log.md)).
- Ignore rules keep browser probes and dev server traffic out of the log; built-in rules can be turned off as a whole or one by one ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/docs/ignore-rules.md)).
- Admin page at `/__mock/` and a floating bar for your own pages, both working under a sub-path mount ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/docs/connect.md#show-the-floating-bar)).
- Route paths follow express 4 (path-to-regexp@0.1.13): case-insensitive, 400 on undecodable parameters, `invalid-route` for paths 0.1.13 cannot compile ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/docs/writing-mocks.md#write-route-paths)).
- Mocks match the path after mounting: with `app.use("/api", mock)`, `"GET /user"` matches `/api/user`.
- A value's type is decided by `fn.length` alone, so do not define route functions with rest parameters or a default first parameter ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/docs/writing-mocks.md#choose-between-data-handlers-and-proxies)).
- `package.json`, `tsconfig*.json` / `jsconfig*.json`, and paths with a segment starting with `_` are not loaded as mock entries (except `__gui__.json`), so you can keep shared helpers and data there.
- Declared `OPTIONS` routes receive preflight requests and `HEAD` falls back to `GET`; invalid bodies return 400, oversized ones 413, and uploads are limited in file count, field count, and 50 MB per request.
- Safe defaults: the admin API accepts only local requests and JSON writes; matched mock routes check the Host header against DNS rebinding; mock responses send CORS headers only to local, private-network, same-Host, and `hosts` origins ([guide](https://github.com/HeavenSky/easy-pkgs/blob/main/packages/easy-mok/docs/security.md)).
- Bundles express 5 and http-proxy-middleware 3 instead of using your project's versions, and installs `@types/express` so TypeScript projects need nothing extra.
