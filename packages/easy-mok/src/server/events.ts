// 管理页的 SSE 推送: 请求日志与数据变更通知
import type { IncomingMessage, ServerResponse } from "http";

const MAX_CLIENTS = 20;
const HEARTBEAT_MS = 15000;

export type EventName = "log" | "changed";
export type Res = ServerResponse;

export const createEvents = () => {
	const clients = new Set<Res>();
	const timer = setInterval(() => {
		clients.forEach(res => res.write(": ping\n\n"));
	}, HEARTBEAT_MS);
	timer.unref();

	const emit = (event: EventName, data: unknown) => {
		if (!clients.size) { return; }
		const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
		clients.forEach(res => res.write(payload));
	};

	const connect = (req: IncomingMessage, res: Res) => {
		if (clients.size >= MAX_CLIENTS) {
			const oldest = clients.values().next().value;
			if (oldest) { clients.delete(oldest); oldest.end(); }
		}
		// no-transform 让 compression 中间件跳过本响应, 否则事件被缓冲直到连接结束
		res.writeHead(200, {
			"content-type": "text/event-stream; charset=utf-8",
			"cache-control": "no-cache, no-transform",
			connection: "keep-alive",
			"x-accel-buffering": "no",
		});
		res.write("retry: 3000\n\n");
		clients.add(res);
		req.on("close", () => clients.delete(res));
	};

	const close = () => {
		clearInterval(timer);
		clients.forEach(res => res.end());
		clients.clear();
	};

	return { emit, connect, close, get size() { return clients.size; } };
};
