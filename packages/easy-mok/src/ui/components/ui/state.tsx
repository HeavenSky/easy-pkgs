import { AlertTriangle, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { errorMessage } from "@/api/client";
import { Button } from "./button";

export const Spinner = ({ label = "加载中" }: { label?: string }) => (
	<div role="status" className="flex items-center gap-2 p-4 text-sm text-zinc-500"><Loader2 size={16} className="animate-spin" />{label}</div>
);

export const Skeleton = ({ rows = 6 }: { rows?: number }) => (
	<div aria-busy="true" aria-label="加载中" className="space-y-2 p-3">
		{Array.from({ length: rows }, (_, i) => <div key={i} className="h-8 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />)}
	</div>
);

export const ErrorState = ({ error, onRetry }: { error: unknown; onRetry?: () => void }) => (
	<div role="alert" className="m-3 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
		<AlertTriangle size={16} className="mt-0.5 shrink-0" />
		<div className="flex-1">{errorMessage(error)}</div>
		{onRetry && <Button size="sm" onClick={onRetry}>重试</Button>}
	</div>
);

export const EmptyState = ({ title, children }: { title: string; children?: ReactNode }) => (
	<div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-zinc-500">
		<div className="font-medium text-zinc-700 dark:text-zinc-300">{title}</div>
		{children}
	</div>
);
