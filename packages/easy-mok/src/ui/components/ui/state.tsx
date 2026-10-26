import { AlertTriangle, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { errorMessage } from "@/api/client";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export const Spinner = ({ label = "加载中" }: { label?: string }) => (
	<div role="status" className="flex items-center gap-1.5 p-3 text-xs text-zinc-500">
		<Loader2 size={14} className="animate-spin" />
		{label}
	</div>
);

export const Skeleton = ({ rows = 6 }: { rows?: number }) => (
	<div aria-busy="true" aria-label="加载中" className="space-y-1.5 p-3">
		{Array.from({ length: rows }, (_, i) => (
			<div key={i} className="h-7 animate-pulse rounded-md bg-zinc-200/70 dark:bg-zinc-800" />
		))}
	</div>
);

export const ErrorState = ({ error, onRetry }: { error: unknown; onRetry?: () => void }) => (
	<div
		role="alert"
		className="m-3 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200"
	>
		<AlertTriangle size={14} className="mt-0.5 shrink-0" />
		<div className="min-w-0 flex-1 break-words">{errorMessage(error)}</div>
		{onRetry && (
			<Button size="sm" onClick={onRetry}>
				重试
			</Button>
		)}
	</div>
);

export const EmptyState = ({
	title,
	children,
	className,
}: {
	title: string;
	children?: ReactNode;
	className?: string;
}) => (
	<div
		className={cn(
			"flex flex-col items-center gap-1 px-4 py-8 text-center text-xs text-zinc-500",
			className
		)}
	>
		<div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{title}</div>
		{children}
	</div>
);

/** 页面顶部或面板内的提示条; tone 决定语义色 */
export const Notice = ({
	tone = "warn",
	icon,
	children,
	className,
	role = "status",
}: {
	tone?: "warn" | "info" | "danger";
	icon?: ReactNode;
	children: ReactNode;
	className?: string;
	role?: string;
}) => (
	<div
		role={role}
		className={cn(
			"flex items-center gap-2 border-b px-4 py-1 text-xs",
			tone === "warn" &&
				"border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
			tone === "danger" &&
				"border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200",
			tone === "info" &&
				"border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
			className
		)}
	>
		{icon}
		{children}
	</div>
);
