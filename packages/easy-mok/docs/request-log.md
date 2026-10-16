# Inspect requests and save them as mocks

**English** · [简体中文](../zh/docs/request-log.md)

By the end of this page, you can tell whether a request was mocked, passed through, or unmatched, and turn any captured response into a mock. The request log lives on the admin page at `/__mock/`, and the floating bar shows the latest mocked requests.

## Read the request log

![Request log with the detail panel of one request](images/logs.png)

The log records mocked requests, passed-through requests, and unmatched browser fetch/XHR requests, with full request and response details. Response bodies compressed with gzip, deflate, br, or zstd are decoded for display. Sensitive headers such as `authorization` and `cookie` are masked.

Unmatched requests are recorded only when they come from fetch or XHR, meaning they carry `sec-fetch-dest: empty` or `x-requested-with: XMLHttpRequest`. Chrome DevTools probes also carry `sec-fetch-dest: empty`, so ignore rules filter them out; see [Keep noise out of the request log](ignore-rules.md).

## Turn a response into a mock

1. Open a request in the log to see its detail panel.
2. For a request that hit a route, click **Save as a scene of this route** (`存为该路由的场景`); the scene is written to `__scenes__/` in your mock folder.
3. For an unmatched request, click **Create a mock for this request** (`为此请求新建 mock`) to start a new route from it.

Only responses that were captured in full, without truncation, can be saved as scenes.

## Know what the log keeps

Each entry captures at most 256 KB of response body and 64 KB of request body, which covers typical JSON APIs. The log keeps the latest 500 entries by default (option `logSize`), and the request and response bodies of all entries together are capped at 32 MB; beyond that the oldest entries are dropped. Without the cap, 500 entries could take about 160 MB of memory in the worst case.
