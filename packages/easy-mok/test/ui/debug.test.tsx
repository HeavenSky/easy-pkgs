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

/** 空的集合配置与继承结果; 树与请求接口的必填字段 */
const root = { vars: {}, headers: [], settings: {}, auth: null, etag: "" };
const inherited = {
	settings: { timeoutMs: { value: 30000, from: "default" } },
	headers: [],
	auth: { value: { type: "none" }, from: "default" },
};

type Definition = typeof definition;

const requestNode = (id: string, name: string) => ({
	id,
	kind: "request",
	name,
	title: name,
	weight: 0,
	vars: {},
	method: "GET",
	url: "",
	snapshots: [],
});

/** 请求详情接口的响应体 */
const requestDetail = (id: unknown, def: Definition, etag: string) => ({
	id,
	definition: def,
	meta: { title: null, weight: 0, vars: {} },
	etag,
	metaEtag: "",
	inherited,
});

/** 树与环境接口的桩; 环境为空 */
const treeStubs = (nodes: unknown[]) => [
	http.get("*/__mock/api/debug/tree", () => HttpResponse.json({ nodes, problems: [], root })),
	http.get("*/__mock/api/debug/envs", () =>
		HttpResponse.json({ active: null, groups: [], problems: [], root })
	),
];

const page = (path: string) =>
	renderUi(
		<Switch>
			<Route path="/debug" component={DebugPage} />
			<Route path="/debug/req/:id" component={DebugPage} />
		</Switch>,
		path
	);

describe("调试页", () => {
	it("在分组下新建请求后打开编辑器, 修改 URL 后保存带 If-Match", async () => {
		const children: unknown[] = [];
		const nodes = [
			{ id: "g", kind: "group", name: "g", title: "g", weight: 0, vars: {}, children },
		];
		let saved: { definition: Definition; ifMatch: string | null } | null = null;
		server.use(
			...treeStubs(nodes),
			http.post("*/__mock/api/debug/nodes", async ({ request }) => {
				const body = (await request.json()) as { name: string; parent: string | null };
				const node = requestNode(`${body.parent}/${body.name}`, body.name);
				children.push(node);
				return HttpResponse.json(node, { status: 201 });
			}),
			http.get("*/__mock/api/debug/requests/:id", () =>
				HttpResponse.json(
					requestDetail("ping", saved?.definition ?? definition, saved ? "e2" : "e1")
				)
			),
			http.put("*/__mock/api/debug/requests/:id", async ({ request }) => {
				const body = (await request.json()) as { definition: Definition };
				saved = { definition: body.definition, ifMatch: request.headers.get("if-match") };
				return HttpResponse.json(requestDetail("ping", body.definition, "e2"));
			})
		);
		const user = userEvent.setup();
		const { location } = page("/debug");
		// 根下只能新建分组, 请求只能建在分组下
		await user.click(await screen.findByRole("button", { name: "在 g 下新建请求" }));
		expect(screen.queryByRole("button", { name: "请求" })).toBeNull();
		expect(screen.queryByRole("button", { name: "在 g 下新建分组" })).toBeNull();
		await user.type(screen.getByRole("textbox", { name: "目录名(用于标识与引用)" }), "ping");
		await user.click(screen.getByRole("button", { name: "保存" }));
		await waitFor(() => expect(location.history.at(-1)).toBe("/debug/req/Zy9waW5n"));
		const url = await screen.findByRole("textbox", { name: "请求地址" });
		await user.type(url, "http://x/a");
		await user.click(screen.getByRole("button", { name: "保存" }));
		await waitFor(() => expect(saved).not.toBeNull());
		expect(saved!.ifMatch).toBe('"e1"');
		expect(saved!.definition.url).toBe("http://x/a");
		expect(await screen.findByRole("button", { name: "已保存" })).toBeDisabled();
	});

	it("再次打开已缓存的请求时载入编辑器; 编辑器内 ⌘S 保存", async () => {
		let saved: string | null = null;
		server.use(
			...treeStubs([requestNode("a", "a"), requestNode("b", "b")]),
			http.get("*/__mock/api/debug/requests/:id", ({ params }) =>
				HttpResponse.json(
					requestDetail(
						params.id,
						{ ...definition, url: `http://x/${atob(String(params.id))}` },
						"e1"
					)
				)
			),
			http.put("*/__mock/api/debug/requests/:id", async ({ request, params }) => {
				const body = (await request.json()) as { definition: Definition };
				saved = body.definition.url;
				return HttpResponse.json(requestDetail(params.id, body.definition, "e2"));
			})
		);
		const user = userEvent.setup();
		page("/debug/req/YQ");
		expect(await screen.findByRole("textbox", { name: "请求地址" })).toHaveValue("http://x/a");
		await user.click(screen.getByRole("button", { name: "b" }));
		await waitFor(() =>
			expect(screen.getByRole("textbox", { name: "请求地址" })).toHaveValue("http://x/b")
		);
		await user.click(screen.getByRole("button", { name: "a" }));
		const url = await screen.findByRole("textbox", { name: "请求地址" });
		await waitFor(() => expect(url).toHaveValue("http://x/a"));
		await user.type(url, "1");
		await user.keyboard("{Meta>}s{/Meta}");
		await waitFor(() => expect(saved).toBe("http://x/a1"));
	});
});
