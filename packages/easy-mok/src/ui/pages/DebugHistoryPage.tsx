import { ArrowLeft, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import { errorMessage } from "@/api/client";
import { historyRawUrl, useDeleteDay, useHistoryDays, useHistoryEntry } from "@/api/debug-queries";
import { HistoryList } from "@/components/debug/HistoryList";
import { ResponseViewer, formatBytes } from "@/components/debug/ResponseViewer";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";

const dayText = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;

/** 全局调试历史: 按天统计与删除, 按时间倒序的全部条目 */
export const DebugHistoryPage = () => {
	const days = useHistoryDays();
	const remove = useDeleteDay();
	const [viewing, setViewing] = useState<string | null>(null);
	const [deleting, setDeleting] = useState<string | null>(null);
	const entry = useHistoryEntry(viewing);
	const total = (days.data || []).reduce((s, d) => s + d.bytes, 0);
	return (
		<div className="grid h-full min-h-0 grid-cols-[320px_minmax(0,1fr)] divide-x divide-zinc-200 dark:divide-zinc-800">
			<aside className="min-h-0 space-y-3 overflow-auto p-3">
				<Link href="/debug" className="inline-flex items-center gap-1 text-xs text-sky-700 hover:underline">
					<ArrowLeft size={13} />
					返回调试
				</Link>
				<div className="text-xs text-zinc-500">
					历史总量 {formatBytes(total)}; 达到 1 GB 时会提醒, 不会自动删除.
				</div>
				<ul aria-label="按天统计" className="space-y-1 text-sm">
					{(days.data || []).map(d => (
						<li key={d.day} className="flex items-center gap-2">
							<span className="font-mono">{dayText(d.day)}</span>
							<span className="text-xs text-zinc-500">
								{d.count} 条 · {formatBytes(d.bytes)}
							</span>
							<Button size="icon" variant="ghost" className="ml-auto" aria-label={`删除 ${dayText(d.day)} 的历史`} onClick={() => setDeleting(d.day)}>
								<Trash2 size={14} />
							</Button>
						</li>
					))}
				</ul>
				<HistoryList requestId={undefined} selected={viewing} onSelect={line => setViewing(line.id)} />
			</aside>
			<section className="min-h-0 overflow-auto p-4">
				{entry.data ? (
					<ResponseViewer meta={entry.data.meta} rawUrl={historyRawUrl(entry.data.id)} />
				) : (
					<p className="text-sm text-zinc-500">选择一条历史查看详情.</p>
				)}
			</section>
			<ConfirmDialog
				open={!!deleting}
				title="删除历史"
				danger
				confirmText="删除"
				message={<>确定删除 {deleting && dayText(deleting)} 的全部调试历史? 已另存为快照的结果不受影响.</>}
				onClose={() => setDeleting(null)}
				onConfirm={() =>
					deleting &&
					(setViewing(null),
					remove.mutate(deleting, {
						onSuccess: () => toast.success("已删除"),
						onError: err => toast.error(errorMessage(err)),
					}))
				}
			/>
		</div>
	);
};
