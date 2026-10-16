# Build and test from source

**English** · [简体中文](../zh/docs/development.md)

By the end of this page, you can build easy-mok, run its tests, and work on the admin page with hot reload. Run these commands in `packages/easy-mok` of a repository checkout.

```bash
npm i
npm run build        # compiles the server to dist/server and builds the admin page and floating bar to dist/ui; tests and the demo server run the TS sources through jiti, no build needed
npm test             # server tests (against express 4 and express 5 hosts) and admin page tests
npm run typecheck
npm run lint:check
npm run dev:server   # demo server at http://127.0.0.1:4100/, admin page at /__mock/
npm run dev:ui       # admin page with hot reload, API proxied to the demo server
npm run test:e2e     # requires a build first and a Chrome with remote debugging on 127.0.0.1:9222
```
