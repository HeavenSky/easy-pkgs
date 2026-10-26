import { ArrowLeft, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import { errorMessage } from "@/api/client";
import {
	historyRawUrl,
	useDebugTree,
	useDeleteDay,
	useHistoryDays,
	useHistoryEntry,
} from "@/api/debug-queries";
import { SaveSnapshotDialog } from "@/components/debug/SaveSnapshotDialog";
import { HistoryList } from "@/components/debug/HistoryList";
import { ResponseViewer, formatBytes } from "@/components/debug/ResponseViewer";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Hint } from "@/components/ui/input";
import { Panel, Toolbar } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/state";

const dayText = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;

/** 全局调试历史: 按天统计与删除, 按时间倒序的全部条目 */
export const DebugHistoryPage = () => {
	const days = useHistoryDays();
	const remove = useDeleteDay();
	const [viewing, setViewing] = useState<string | null>(null);
	const [deleting, setDeleting] = useState<string | null>(null);
	const entry = useHistoryEntry(viewing);
	const tree = useDebugTree();
	const [saving, setSaving] = useState(false);
	const total = (days.data || []).reduce((s, d) => s + d.bytes, 0);
	return (
		<div className="flex h-full min-h-0">
			<aside className="w-80 shrink-0 overflow-auto border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
				<Toolbar className="sticky top-0 z-10">
					<Link
						href="/debug"
						className="inline-flex items-center gap-1 text-xs text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900 dark:text-zinc-100 dark:decoration-zinc-600"
					>
						<ArrowLeft size={12} />
						返回调试
					</Link>
					<span className="ml-auto text-xs text-zinc-500">
						历史总量 {formatBytes(total)}
					</span>
				</Toolbar>
				<div className="space-y-1.5 border-b border-zinc-200 p-3 dark:border-zinc-800">
					<Hint>达到 1 GB 时会提醒, 不会自动删除.</Hint>
					<ul aria-label="按天统计">
						{(days.data || []).map(d => (
							<li key={d.day} className="flex h-7 items-center gap-2">
								<span className="font-mono text-xs">{dayText(d.day)}</span>
								<span className="text-xs text-zinc-400">
									{d.count} 条 · {formatBytes(d.bytes)}
								</span>
								<Button
									size="icon-sm"
									variant="ghost"
									className="ml-auto"
									aria-label={`删除 ${dayText(d.day)} 的历史`}
									title="删除这一天的历史"
									onClick={() => setDeleting(d.day)}
								>
									<Trash2 size={12} />
								</Button>
							</li>
						))}
					</ul>
				</div>
				<HistoryList
					requestId={undefined}
					selected={viewing}
					onSelect={line => setViewing(line.id)}
				/>
			</aside>
			<section className="min-h-0 min-w-0 flex-1 overflow-auto bg-zinc-50 p-4 dark:bg-zinc-950">
				{entry.data ? (
					<ResponseViewer
						title="响应"
						label="响应"
						meta={entry.data.meta}
						rawUrl={historyRawUrl(entry.data.id)}
						actions={
							<Button size="sm" onClick={() => setSaving(true)}>
								另存为快照
							</Button>
						}
					/>
				) : (
					<Panel>
						<EmptyState title="选择一条历史查看详情" />
					</Panel>
				)}
			</section>
			{saving && entry.data && (
				<SaveSnapshotDialog
					hid={entry.data.id}
					requestId={
						(entry.data.meta.origin as { request?: string | null } | undefined)
							?.request ?? null
					}
					tree={tree.data?.nodes || []}
					onClose={() => setSaving(false)}
				/>
			)}
			<ConfirmDialog
				open={!!deleting}
				title="删除历史"
				danger
				confirmText="删除"
				message={
					<>
						确定删除 {deleting && dayText(deleting)} 的全部调试历史?
						已另存为快照的结果不受影响.
					</>
				}
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
