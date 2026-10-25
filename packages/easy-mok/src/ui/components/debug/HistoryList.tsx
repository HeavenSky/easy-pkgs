import type { ReactNode } from "react";
import type { HistoryLine } from "@/api/debug-contract";
import { useHistory } from "@/api/debug-queries";
import { cn } from "@/lib/utils";
import { MethodBadge, StatusBadge } from "../ui/badge";
import { Button } from "../ui/button";
import { ErrorState, Spinner } from "../ui/state";
import { formatBytes } from "./ResponseViewer";

const timeText = (t: number) => new Date(t).toLocaleString("zh-CN", { hour12: false });

/** 历史列表; requestId 为 undefined 时列出全部 */
export const HistoryList = ({
	requestId,
	selected,
	onSelect,
	extra,
}: {
	requestId: string | undefined;
	selected: string | null;
	onSelect: (line: HistoryLine) => void;
	extra?: (line: HistoryLine) => ReactNode;
}) => {
	const history = useHistory(requestId);
	if (history.isPending) return <Spinner label="加载历史" />;
	if (history.isError) return <ErrorState error={history.error} onRetry={() => history.refetch()} />;
	const items = history.data.pages.flatMap(p => p.items);
	if (!items.length) return <p className="text-xs text-zinc-500">还没有发送记录.</p>;
	return (
		<div className="space-y-1">
			<ul aria-label="发送历史" className="divide-y divide-zinc-100 text-xs dark:divide-zinc-800">
				{items.map(line => (
					<li key={line.id} className={cn("flex items-center gap-2 px-1 py-1", selected === line.id && "bg-sky-50 dark:bg-sky-950")}>
						<button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onSelect(line)}>
							<span className="shrink-0 text-zinc-500">{timeText(line.time)}</span>
							<MethodBadge method={line.method} />
							{line.status !== null ? <StatusBadge status={line.status} /> : <span className="text-rose-600">{line.error}</span>}
							<span className="truncate font-mono" title={line.url}>
								{line.url}
							</span>
							<span className="ml-auto shrink-0 text-zinc-400">
								{line.durationMs} ms · {formatBytes(line.size)}
							</span>
						</button>
						{extra?.(line)}
					</li>
				))}
			</ul>
			{history.hasNextPage && (
				<Button size="sm" variant="ghost" disabled={history.isFetchingNextPage} onClick={() => history.fetchNextPage()}>
					加载更多
				</Button>
			)}
		</div>
	);
};
