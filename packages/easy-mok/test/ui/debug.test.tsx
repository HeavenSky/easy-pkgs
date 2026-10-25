import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { Route, Switch } from "wouter";
import { DebugPage } from "@/pages/DebugPage";
import { renderUi } from "./render";
import { server } from "./setup";

const definition = {
	version: 1,
	method: "GET",
	url: "",
	params: { path: {}, query: [] },
	headers: [],
	auth: { type: "none" },
	body: { type: "none" },
	settings: { timeoutMs: 30000, followRedirects: true, insecureTLS: false, proxy: null },
	route: null,
};

const page = (path: string) =>
	renderUi(
		<Switch>
			<Route path="/debug" component={DebugPage} />
			<Route path="/debug/req/:id" component={DebugPage} />
		</Switch>,
		path
	);

describe("调试页", () => {
	it("新建请求后打开编辑器, 修改 URL 后保存带 If-Match", async () => {
		const nodes: unknown[] = [];
		let saved: { body: unknown; ifMatch: string | null } | null = null;
		server.use(
			http.get("*/__mock/api/debug/tree", () => HttpResponse.json({ nodes, problems: [] })),
			http.get("*/__mock/api/debug/envs", () => HttpResponse.json({ active: null, groups: [], problems: [] })),
			http.post("*/__mock/api/debug/nodes", async ({ request }) => {
				const body = (await request.json()) as { name: string };
				const node = { id: body.name, kind: "request", name: body.name, title: body.name, weight: 0, vars: {}, method: "GET", url: "", snapshots: [] };
				nodes.push(node);
				return HttpResponse.json(node, { status: 201 });
			}),
			http.get("*/__mock/api/debug/requests/:id", () =>
				HttpResponse.json({
					id: "ping",
					definition: saved ? (saved.body as { definition: typeof definition }).definition : definition,
					meta: { title: null, weight: 0, vars: {} },
					etag: saved ? "e2" : "e1",
					metaEtag: "",
				})
			),
			http.put("*/__mock/api/debug/requests/:id", async ({ request }) => {
				const body = (await request.json()) as { definition: typeof definition };
				saved = { body, ifMatch: request.headers.get("if-match") };
				return HttpResponse.json({ id: "ping", definition: body.definition, meta: { title: null, weight: 0, vars: {} }, etag: "e2", metaEtag: "" });
			})
		);
		const user = userEvent.setup();
		const { location } = page("/debug");
		expect(await screen.findByText("还没有请求, 先新建一个分组或请求.")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "请求" }));
		await user.type(screen.getByRole("textbox", { name: "目录名(用于标识与引用)" }), "ping");
		await user.click(screen.getByRole("button", { name: "保存" }));
		await waitFor(() => expect(location.history.at(-1)).toBe("/debug/req/cGluZw"));
		const url = await screen.findByRole("textbox", { name: "请求地址" });
		await user.type(url, "http://x/a");
		await user.click(screen.getByRole("button", { name: "保存" }));
		await waitFor(() => expect(saved).not.toBeNull());
		expect(saved!.ifMatch).toBe('"e1"');
		expect((saved!.body as { definition: typeof definition }).definition.url).toBe("http://x/a");
		expect(await screen.findByRole("button", { name: "已保存" })).toBeDisabled();
	});
});
