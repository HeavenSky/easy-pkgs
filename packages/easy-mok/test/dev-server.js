// 本地演示服务: 4100 端口挂载 easy-mok 与一个业务演示页, 4102 端口是代理场景的上游; 用于开发管理页与端到端验证
"use strict";
const http = require("http");
const path = require("path");
const express = require("express");
const { createMock } = require("./helpers/src").loadSrc();

const PORT = Number(process.env.PORT || 4100);
const app = express();
const mock = createMock({
	cwd: __dirname,
	folder: "dev/mocks",
	stateFile: path.join(__dirname, ".tmp/dev-state.json"),
});
app.use(mock);
app.get("/", (_req, res) => {
	res.type("html").send(`<!doctype html><meta charset="utf-8"><title>业务演示页</title>
<h1>业务演示页</h1>
<button id="u">GET /api/user/1</button> <button id="m">GET /api/missing</button> <button id="p">GET /api/upstream/hello</button>
<pre id="out"></pre>
<script>
const show = async (url) => { const r = await fetch(url); document.getElementById("out").textContent = r.status + " " + await r.text(); };
document.getElementById("u").onclick = () => show("/api/user/1");
document.getElementById("m").onclick = () => show("/api/missing");
document.getElementById("p").onclick = () => show("/api/upstream/hello");
</script>
${mock.floatScript ? `<script src="${mock.floatScript}"></script>` : ""}`);
});
app.use((req, res) => res.status(404).json({ host: true, message: "宿主 404", url: req.originalUrl }));

http.createServer(app).listen(PORT, "127.0.0.1", () => console.log(`[dev] http://127.0.0.1:${PORT}/  管理页 http://127.0.0.1:${PORT}/__mock/`));
http.createServer((req, res) => {
	res.writeHead(200, { "content-type": "application/json" });
	res.end(JSON.stringify({ upstream: true, path: req.url, at: Date.now() }));
}).listen(PORT + 2, "127.0.0.1");
