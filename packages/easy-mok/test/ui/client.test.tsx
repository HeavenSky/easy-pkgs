import { afterEach, describe, expect, it, vi } from "vitest";
import { mockBaseOf } from "@/api/client";

// MOCK_BASE / API_BASE 在模块加载时按 location.pathname 求值, 改 pathname 后重载模块取新值
const loadBases = async (pathname: string) => {
	history.pushState(null, "", pathname);
	vi.resetModules();
	const mod = await import("@/api/client");
	return { mockBase: mod.MOCK_BASE, apiBase: mod.API_BASE };
};

afterEach(() => {
	history.pushState(null, "", "/");
	vi.resetModules();
});

describe("mockBaseOf 与路由基座", () => {
	it("生产页面 URL(无 /ui): 基座与挂载前缀相同, 带宿主前缀", async () => {
		expect(mockBaseOf("/x/__mock/logs")).toBe("/x/__mock");
		expect(await loadBases("/x/__mock/logs")).toEqual({
			mockBase: "/x/__mock",
			apiBase: "/x/__mock/api",
		});
	});

	it("dev 页面 URL(/__mock/ui/<页面>): mockBaseOf 仍为挂载前缀, wouter 基座多吞 /ui, API_BASE 不带 /ui", async () => {
		expect(mockBaseOf("/__mock/ui/logs")).toBe("/__mock");
		expect(await loadBases("/__mock/ui/logs")).toEqual({
			mockBase: "/__mock/ui",
			apiBase: "/__mock/api",
		});
	});

	it("生产入口(/ui/ 结尾)与 /__mock/ui 本身不吞 /ui", async () => {
		expect(mockBaseOf("/x/__mock/ui/logs")).toBe("/x/__mock");
		expect(await loadBases("/x/__mock/ui/")).toEqual({
			mockBase: "/x/__mock",
			apiBase: "/x/__mock/api",
		});
		expect(await loadBases("/__mock/ui")).toEqual({ mockBase: "/__mock", apiBase: "/__mock/api" });
	});

	it("无 __mock 时兜底 /__mock", async () => {
		expect(mockBaseOf("/logs")).toBe("/__mock");
		expect(await loadBases("/logs")).toEqual({ mockBase: "/__mock", apiBase: "/__mock/api" });
	});
});
