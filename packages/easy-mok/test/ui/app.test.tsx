import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { request } from "@/api/client";
import { Meta } from "@/api/contract";
import { App } from "@/App";
import { renderUi } from "./render";
import { FakeEventSource, server } from "./setup";

const meta = {
	name: "easy-mok", version: "0.0.1", bootId: "b1", folder: "/p/src/mocks", stateFile: "/p/state.json",
	enabled: { code: true, state: true, effective: true }, group: null, logLevel: "hit", readOnly: false, float: true,
	counts: { routes: 0, files: 0 }, diagnostics: [{ type: "load-error", message: "boom" }], env: { node: "v26", platform: "darwin" },
};

const log = (id: string, url: string) => ({
	id, time: 1, method: "GET", url, kind: "mock", routeId: null, routeKey: "GET /a", scene: "default", sceneLevel: "default", sceneFallback: false, status: 200, durationMs: 1,
});

const base = () => [
	http.get("*/__mock/api/meta", () => HttpResponse.json(meta)),
	http.get("*/__mock/api/groups", () => HttpResponse.json({ groups: {}, active: null })),
	http.get("*/__mock/api/routes", () => HttpResponse.json([])),
];

describe("应用框架", () => {
	it("空路由时给出引导, 诊断数量显示在导航上, 连接中断显示横幅", async () => {
		server.use(...base());
		renderUi(<App />);
		expect(await screen.findByText("还没有 mock 路由")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /诊断\s*1/ })).toBeInTheDocument();
		act(() => FakeEventSource.last?.onerror?.());
		expect(await screen.findByText(/连接已中断/)).toBeInTheDocument();
		act(() => FakeEventSource.last?.onopen?.());
		await waitFor(() => expect(screen.queryByText(/连接已中断/)).toBeNull());
	});

	it("日志页: SSE 实时追加, 暂停期间不刷新列表并计数", async () => {
		server.use(...base(), http.get("*/__mock/api/logs", () => HttpResponse.json([log("1", "/first")])));
		renderUi(<App />, "/logs");
		expect(await screen.findByText("/first")).toBeInTheDocument();
		act(() => FakeEventSource.last?.emit("log", log("2", "/second")));
		expect(await screen.findByText("/second")).toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: "暂停" }));
		act(() => FakeEventSource.last?.emit("log", log("3", "/third")));
		expect(await screen.findByRole("button", { name: /继续 \(新增 1\)/ })).toBeInTheDocument();
		expect(screen.queryByText("/third")).toBeNull();
		await userEvent.click(screen.getByRole("button", { name: /继续/ }));
		expect(await screen.findByText("/third")).toBeInTheDocument();
	});

	it("接口返回不符合契约时报 CONTRACT 错误", async () => {
		server.use(http.get("*/__mock/api/meta", () => HttpResponse.json({ name: "other" })));
		await expect(request(Meta, "/meta")).rejects.toMatchObject({ code: "CONTRACT" });
	});
});
