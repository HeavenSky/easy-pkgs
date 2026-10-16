import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

export const renderUi = (ui: ReactNode, path = "/") => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	const location = memoryLocation({ path, record: true });
	const utils = render(
		<QueryClientProvider client={client}>
			<Router hook={location.hook} searchHook={location.searchHook}>{ui}</Router>
			<Toaster />
		</QueryClientProvider>,
	);
	return { ...utils, client, location };
};

export const routeSummary = (over: Record<string, unknown> = {}) => ({
	id: "R0VUIC9hcGkvdXNlci86aWQ",
	key: "GET /api/user/:id",
	methods: ["GET"],
	path: "/api/user/:id",
	weight: 0,
	source: { type: "code", file: "/p/src/mocks/user.js", line: 3 },
	scenes: ["default", "empty", "slow"],
	active: { name: "default", level: "default", fallback: false },
	mode: "mock",
	delay: null,
	status: null,
	hits: 2,
	lastHit: null,
	...over,
});

export const sceneDetail = (over: Record<string, unknown> = {}) => ({
	name: "default", source: "code", kind: "data", editable: false, overrides: false, content: { id: 1 }, etag: null, ...over,
});
