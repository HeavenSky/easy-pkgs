import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

export const server = setupServer();

/** jsdom 没有 EventSource; 测试中可通过 FakeEventSource.last 手动派发事件 */
export class FakeEventSource {
	static last: FakeEventSource | null = null;
	onopen: (() => void) | null = null;
	onerror: (() => void) | null = null;
	listeners = new Map<string, Array<(e: MessageEvent) => void>>();
	constructor(public url: string) { FakeEventSource.last = this; }
	addEventListener(name: string, fn: (e: MessageEvent) => void) { this.listeners.set(name, [...(this.listeners.get(name) || []), fn]); }
	emit(name: string, data: unknown) { (this.listeners.get(name) || []).forEach(fn => fn(new MessageEvent(name, { data: JSON.stringify(data) }))); }
	close() { /* 无需处理 */ }
}

vi.stubGlobal("EventSource", FakeEventSource);
// CodeMirror 依赖真实布局, 测试中用 textarea 代替
vi.mock("@/components/JsonEditor", async () => {
	const actual = await vi.importActual<typeof import("@/components/JsonEditor")>("@/components/JsonEditor");
	return {
		...actual,
		JsonEditor: ({ value, onChange, label, readOnly }: { value: string; onChange?: (v: string) => void; label: string; readOnly?: boolean }) =>
			({ type: "textarea", props: { "aria-label": label, value, readOnly, onChange: (e: { target: { value: string } }) => onChange?.(e.target.value) }, key: null, $$typeof: Symbol.for("react.transitional.element") }),
	};
});

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => server.close());

// jsdom 没有布局尺寸, 虚拟列表一行都不渲染; 测试中改为全部渲染
vi.mock("@tanstack/react-virtual", () => ({
	useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
		getTotalSize: () => count * estimateSize(),
		getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * estimateSize(), key: index })),
		scrollToIndex: () => undefined,
	}),
}));
