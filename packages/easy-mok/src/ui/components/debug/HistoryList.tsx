import type { ReactNode } from "react";
import type { HistoryLine } from "@/api/debug-contract";
import { useHistory } from "@/api/debug-queries";
import { cn } from "@/lib/utils";
import { MethodBadge, StatusBadge } from "../ui/badge";
import { Button } from "../ui/button";
import { ErrorState, Spinner } from "../ui/state";
import { formatBytes } from "./ResponseViewer";

const timeText = (t: number) => new Date(t).toLocaleString("zh-CN", { hour12: false });

/** 时间列布局: inline 与方法同行(默认), below 换到条目第二行, hidden 不展示 */
export type HistoryTimeLayout = "inline" | "below" | "hidden";

/** 历史列表; requestId 为 undefined 时列出全部 */
export const HistoryList = ({
	requestId,
	selected,
	onSelect,
	extra,
	time = "inline",
}: {
	requestId: string | undefined;
	selected: string | null;
	onSelect: (line: HistoryLine) => void;
	extra?: (line: HistoryLine) => ReactNode;
	time?: HistoryTimeLayout;
}) => {
	const history = useHistory(requestId);
	if (history.isPending) return <Spinner label="加载历史" />;
	if (history.isError)
		return <ErrorState error={history.error} onRetry={() => history.refetch()} />;
	const items = history.data.pages.flatMap(p => p.items);
	if (!items.length) return <p className="px-3 py-2 text-xs text-zinc-400">还没有发送记录.</p>;
	return (
		<div>
			<ul aria-label="发送历史" className="divide-y divide-zinc-100 dark:divide-zinc-800">
				{items.map(line => (
					<li
						key={line.id}
						className={cn(
							"px-3",
							time === "below" ? "" : "flex h-8 items-center gap-2",
							selected === line.id
								? "bg-zinc-100 dark:bg-zinc-800"
								: "hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
						)}
					>
						<button
							type="button"
							className={cn(
								"min-w-0 text-left",
								time === "below"
									? "flex w-full flex-col gap-0.5 py-1.5"
									: "flex h-full flex-1 items-center gap-1.5"
							)}
							onClick={() => onSelect(line)}
						>
							{time === "inline" && (
								<span className="shrink-0 text-xs text-zinc-400 tabular-nums">
									{timeText(line.time)}
								</span>
							)}
							<span
								className={cn(
									"flex min-w-0 items-center gap-1.5",
									time === "below" && "w-full"
								)}
							>
								<MethodBadge method={line.method} />
								{line.status !== null ? (
									<StatusBadge status={line.status} />
								) : (
									<span className="shrink-0 text-xs text-rose-600">{line.error}</span>
								)}
								<span
									className={cn(
										"min-w-0 truncate font-mono text-xs",
										selected === line.id && "font-medium"
									)}
									title={line.url}
								>
									{line.url}
								</span>
								<span className="ml-auto shrink-0 text-xs text-zinc-400 tabular-nums">
									{line.durationMs} ms · {formatBytes(line.size)}
								</span>
							</span>
							{time === "below" && (
								<span className="shrink-0 text-xs text-zinc-400 tabular-nums">
									{timeText(line.time)}
								</span>
							)}
						</button>
						{extra?.(line)}
					</li>
				))}
			</ul>
			{history.hasNextPage && (
				<div className="border-t border-zinc-100 px-3 py-1 dark:border-zinc-800">
					<Button
						size="sm"
						variant="ghost"
						disabled={history.isFetchingNextPage}
						onClick={() => history.fetchNextPage()}
					>
						加载更多
					</Button>
				</div>
			)}
		</div>
	);
};
