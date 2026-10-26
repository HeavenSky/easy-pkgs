import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { RouteDetail } from "@/components/RouteDetail";
import { NewRouteDialog } from "@/components/NewRouteDialog";
import { samplePath } from "@/components/TryRequest";
import { vscodeLink } from "@/lib/utils";
import { renderUi, routeSummary, sceneDetail } from "./render";
import { server } from "./setup";

const ID = "R0VUIC9hcGkvdXNlci86aWQ";
/** 管理页维护的可编辑场景 slow */
const slowScene = (content: unknown, etag: string) =>
	sceneDetail({ name: "slow", source: "json", kind: "envelope", editable: true, content, etag });
const detail = (route = routeSummary()) => ({
	route,
	scenes: [
		sceneDetail(),
		sceneDetail({ name: "empty", content: null }),
		slowScene({ status: 200, body: { a: 1 } }, "e1"),
	],
});
const detailStub = (route?: ReturnType<typeof routeSummary>) =>
	http.get(`*/__mock/api/routes/${ID}`, () => HttpResponse.json(detail(route)));
/** 清空路径输入框后填入新值 */
const typePath = async (value: string) => {
	const path = screen.getByLabelText(/^路径/);
	await userEvent.clear(path);
	await userEvent.type(path, value);
};

describe("路由详情", () => {
	it("代码场景只读, 管理页场景可删除; 选中场景即发送 PATCH 并提示", async () => {
		let patched: unknown = null;
		server.use(
			detailStub(),
			http.patch(`*/__mock/api/routes/${ID}/state`, async ({ request }) => {
				patched = await request.json();
				expect(request.headers.get("x-mock-ui")).toBe("1");
				return HttpResponse.json(
					routeSummary({ active: { name: "empty", level: "route", fallback: false } })
				);
			})
		);
		renderUi(<RouteDetail id={ID} />);
		expect(await screen.findByRole("button", { name: "查看场景 default" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "删除场景 default" })).toBeNull();
		expect(screen.getByRole("button", { name: "删除场景 slow" })).toBeInTheDocument();
		await userEvent.click(screen.getByRole("radio", { name: /^empty/ }));
		await waitFor(() => expect(patched).toEqual({ scene: "empty" }));
		expect(await screen.findByText("已切换到场景「empty」")).toBeInTheDocument();
	});

	it("保存冲突时弹出对话框, 选择覆盖后带新 etag 重新提交", async () => {
		const ifMatch: Array<string | null> = [];
		server.use(
			detailStub(),
			http.put(`*/__mock/api/routes/${ID}/scenes/slow`, ({ request }) => {
				ifMatch.push(request.headers.get("if-match"));
				if (ifMatch.length === 1) {
					return HttpResponse.json(
						{
							error: {
								code: "CONFLICT",
								message: "场景已被其他人修改",
								details: { current: slowScene({ body: "别处" }, "e2") },
							},
						},
						{ status: 409 }
					);
				}
				return HttpResponse.json(slowScene({ status: 201, body: { a: 1 } }, "e3"));
			})
		);
		renderUi(<RouteDetail id={ID} />);
		await userEvent.click(await screen.findByRole("button", { name: "编辑场景 slow" }));
		const status = screen.getByLabelText("状态码");
		await userEvent.clear(status);
		await userEvent.type(status, "201");
		await userEvent.click(screen.getByRole("button", { name: "保存" }));
		const dialog = await screen.findByRole("dialog", { name: "保存冲突" });
		await userEvent.click(within(dialog).getByRole("button", { name: "用我的版本覆盖" }));
		await waitFor(() => expect(ifMatch).toEqual(['"e1"', '"e2"']));
	});

	it("接口失败时显示错误与重试", async () => {
		server.use(
			http.get(`*/__mock/api/routes/${ID}`, () =>
				HttpResponse.json(
					{ error: { code: "NOT_FOUND", message: "路由不存在或已被删除" } },
					{ status: 404 }
				)
			)
		);
		renderUi(<RouteDetail id={ID} />);
		expect(await screen.findByRole("alert")).toHaveTextContent("路由不存在或已被删除");
		expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
	});
});

describe("新建路由", () => {
	it("前端校验路径, 服务端字段错误回填到表单", async () => {
		server.use(
			http.post("*/__mock/api/routes", () =>
				HttpResponse.json(
					{
						error: {
							code: "CONFLICT",
							message: "路由已存在: GET /api/x",
							details: { field: "path" },
						},
					},
					{ status: 409 }
				)
			)
		);
		renderUi(<NewRouteDialog open onClose={() => undefined} onCreated={() => undefined} />);
		await typePath("api/x");
		await userEvent.click(screen.getByRole("button", { name: "创建" }));
		expect(await screen.findByText("路径必须以 / 开头且不含空白")).toBeInTheDocument();
		await typePath("/api/x");
		await userEvent.click(screen.getByRole("button", { name: "创建" }));
		expect(await screen.findByText("路由已存在: GET /api/x")).toBeInTheDocument();
	});

	it("响应体填 null 时原样提交并提示创建成功", async () => {
		let posted: unknown = null;
		let createdId = "";
		server.use(
			http.post("*/__mock/api/routes", async ({ request }) => {
				posted = await request.json();
				return HttpResponse.json(
					routeSummary({
						id: "R0VUIC9hcGkvZW1wdHk",
						key: "GET /api/empty",
						path: "/api/empty",
						source: { type: "gui", file: "/p/src/mocks/__gui__.json", line: null },
					}),
					{ status: 201 }
				);
			})
		);
		renderUi(
			<NewRouteDialog
				open
				onClose={() => undefined}
				onCreated={id => {
					createdId = id;
				}}
			/>
		);
		await typePath("/api/empty");
		const body = screen.getByRole("textbox", { name: "响应体" });
		await userEvent.clear(body);
		await userEvent.type(body, "null");
		await userEvent.click(screen.getByRole("button", { name: "创建" }));
		expect(await screen.findByText("已新建 GET /api/empty")).toBeInTheDocument();
		expect(posted).toEqual({
			methods: ["GET"],
			path: "/api/empty",
			weight: 0,
			response: { status: 200, body: null },
		});
		expect(createdId).toBe("R0VUIC9hcGkvZW1wdHk");
	});

	it("示例路径", () => {
		expect(samplePath("/api/user/:id")).toBe("/api/user/1");
		expect(samplePath("/a/:id(\\d+)?/b/*")).toBe("/a/1/b/demo");
	});
});

describe("来源链接", () => {
	it("中文与特殊字符路径: 显示原始路径, 链接按段编码", async () => {
		const file = "/项目/隐患 #1/a?.js";
		server.use(detailStub(routeSummary({ source: { type: "code", file, line: 3 } })));
		renderUi(<RouteDetail id={ID} />);
		const link = await screen.findByRole("link", {
			name: new RegExp(`${file.replace(/[?#.]/g, "\\$&")}:3`),
		});
		expect(link.getAttribute("href")).toBe(
			`vscode://file/${encodeURIComponent("项目")}/${encodeURIComponent("隐患 #1")}/${encodeURIComponent("a?.js")}:3`
		);
		expect(vscodeLink("C:\\work\\m.js", null)).toBe("vscode://file/C:/work/m.js");
		expect(vscodeLink(null)).toBeNull();
	});
});
