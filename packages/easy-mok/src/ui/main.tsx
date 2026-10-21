import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { Router } from "wouter";
import { ApiError, MOCK_BASE } from "./api/client";
import { App } from "./App";
import "./index.css";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			// 4xx 是确定性错误, 重试无意义; 网络错误交给 SSE 重连后统一刷新
			retry: (count, err) => count < 1 && err instanceof ApiError && err.status >= 500,
		},
	},
});

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<Router base={MOCK_BASE}>
				<App />
			</Router>
			<Toaster position="bottom-right" richColors closeButton />
		</QueryClientProvider>
	</StrictMode>
);
