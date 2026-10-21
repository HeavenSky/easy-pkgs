import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { exactIgnoreRule } from "@/api/queries";
import { IgnoreDialog } from "@/components/IgnoreDialog";
import { LogDetailPanel } from "@/components/LogDetailPanel";
import { renderUi } from "./render";
import { server } from "./setup";

const config = (over: Record<string, unknown> = {}) => ({
	defaults: {
		enabled: true,
		forcedOff: false,
		rules: [
			{ pattern: "/.well-known/**", reason: "探测", enabled: true },
			{ pattern: "/favicon.ico", reason: "图标", enabled: true },
		],
	},
	options: [],
	custom: ["/health"],
	...over,
});

describe("忽略规则对话框", () => {
	it("逐条停用内置规则, 自定义规则即时校验, 修正后保存", async () => {
		let saved: unknown = null;
		server.use(
			http.get("*/__mock/api/ignore", () => HttpResponse.json(config())),
			http.post("*/__mock/api/ignore/validate", async ({ request }) => {
				const { rules } = (await request.json()) as { rules: string[] };
				return HttpResponse.json({
					errors: rules.flatMap((p, index) =>
						p.startsWith("/")
							? []
							: [{ index, pattern: p, error: "路径必须以 / 或 ** 开头" }]
					),
				});
			}),
			http.put("*/__mock/api/ignore", async ({ request }) => {
				saved = await request.json();
				return HttpResponse.json(config());
			})
		);
		renderUi(<IgnoreDialog open onClose={() => undefined} />);
		const list = await screen.findByRole("list", { name: "内置规则" });
		await userEvent.click(within(list).getByRole("switch", { name: "内置规则 /favicon.ico" }));
		const box = screen.getByRole("textbox", { name: /自定义规则/ });
		await userEvent.type(box, "\nbad");
		expect(await screen.findByText(/第 2 条 bad: 路径必须以/)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
		await userEvent.type(box, "{Backspace}{Backspace}{Backspace}/x/**");
		await waitFor(() => expect(screen.getByRole("button", { name: "保存" })).toBeEnabled());
		await userEvent.click(screen.getByRole("button", { name: "保存" }));
		await waitFor(() =>
			expect(saved).toEqual({
				defaults: true,
				disabled: ["/favicon.ico"],
				custom: ["/health", "/x/**"],
			})
		);
	});

	it("选项关闭内置规则时开关不可用", async () => {
		server.use(
			http.get("*/__mock/api/ignore", () =>
				HttpResponse.json(config({ defaults: { ...config().defaults, forcedOff: true } }))
			)
		);
		renderUi(<IgnoreDialog open onClose={() => undefined} />);
		expect(await screen.findByText(/ignoreDefaults: false/)).toBeInTheDocument();
		expect(screen.getByRole("switch", { name: "启用内置规则" })).toBeDisabled();
	});
});

describe("日志详情: 忽略此路径", () => {
	it("生成方法 + 不含查询串的精确规则并追加保存", async () => {
		expect(exactIgnoreRule("get", "/a/b?x=1#h")).toBe("GET /a/b");
		let saved: unknown = null;
		const part = { headers: {}, body: null, bodyEncoding: "none", truncated: false };
		server.use(
			http.get("*/__mock/api/logs/1", () =>
				HttpResponse.json({
					id: "1",
					time: 1,
					method: "GET",
					url: "/.well-known/appspecific/com.chrome.devtools.json?v=1",
					kind: "miss",
					routeId: null,
					routeKey: null,
					scene: null,
					sceneLevel: null,
					sceneFallback: false,
					status: 404,
					durationMs: 1,
					request: part,
					response: part,
				})
			),
			http.get("*/__mock/api/ignore", () => HttpResponse.json(config())),
			http.put("*/__mock/api/ignore", async ({ request }) => {
				saved = await request.json();
				return HttpResponse.json(config());
			})
		);
		renderUi(<LogDetailPanel id="1" onClose={() => undefined} />);
		await userEvent.click(await screen.findByRole("button", { name: /忽略此路径/ }));
		await waitFor(() =>
			expect(saved).toEqual({
				custom: ["/health", "GET /.well-known/appspecific/com.chrome.devtools.json"],
			})
		);
		expect(await screen.findByText(/已忽略 GET \/.well-known/)).toBeInTheDocument();
	});
});
