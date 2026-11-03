// 由 debug-send.test.js 以 NODE_EXTRA_CA_CERTS 指向自签证书启动, 验证经 CONNECT 代理的
// IP 目标在开启证书校验时按目标主机校验证书; 输出一行 JSON: {code, status}
"use strict";
const fs = require("fs");
const http = require("http");
const https = require("https");
const net = require("net");
const os = require("os");
const path = require("path");
const { createJiti } = require("jiti");

const listen = (server, host) =>
	new Promise(resolve => server.listen(0, host, () => resolve(server.address().port)));

(async () => {
	const tlsUp = https.createServer(
		{
			key: fs.readFileSync(process.env._TLS_KEY_),
			cert: fs.readFileSync(process.env._TLS_CERT_),
		},
		(req, res) => res.end("tls-ok")
	);
	await listen(tlsUp, "127.0.0.1");
	const tunnel = http.createServer();
	tunnel.on("connect", (req, client, head) => {
		console.error("TUNNEL_CONNECT");
		const upstream = net.connect(tlsUp.address().port, "127.0.0.1", () => {
			client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
			if (head.length) upstream.write(head);
			client.pipe(upstream);
			upstream.pipe(client);
		});
		client.on("error", () => {});
		upstream.on("error", () => {});
	});
	// 代理与目标分别落在 ::1 与 127.0.0.1: 隧道 socket 的对端是代理, 若按对端地址校验证书
	// 会与目标 IP(127.0.0.1)不符, 以复现缺 host 时的误报
	await listen(tunnel, "::1");
	const { performSend } = createJiti(__filename)(
		path.join(__dirname, "../../src/server/debug/send.ts")
	);
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mok-tls-"));
	const result = await performSend({
		resolved: {
			method: "GET",
			url: `https://127.0.0.1:${tlsUp.address().port}/echo`,
			urlError: null,
			headers: [],
			body: { type: "none" },
			values: {},
			unresolved: [],
			secrets: [],
		},
		settings: {
			timeoutMs: 5000,
			followRedirects: false,
			insecureTLS: false,
			proxy: `http://[::1]:${tunnel.address().port}`,
		},
		folder: __dirname,
		dir,
		signal: new AbortController().signal,
	});
	fs.rmSync(dir, { recursive: true, force: true });
	tlsUp.closeAllConnections();
	tlsUp.close();
	tunnel.close();
	console.log(
		JSON.stringify({
			code: result.error && result.error.code,
			status: result.response && result.response.status,
		})
	);
})().catch(err => {
	console.error(err);
	process.exit(1);
});
