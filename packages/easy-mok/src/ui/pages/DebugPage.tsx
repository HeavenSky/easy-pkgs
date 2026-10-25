import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";
import { errorMessage } from "@/api/client";
import { encodeId, type TreeNode } from "@/api/debug-contract";
import { useDebugTree, useDeleteNode } from "@/api/debug-queries";
import { DebugTree } from "@/components/debug/DebugTree";
import { EnvPanel } from "@/components/debug/EnvPanel";
import { NodeDialog, type NodeDialogState } from "@/components/debug/NodeDialog";
import { RequestEditor } from "@/components/debug/RequestEditor";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/state";

const decodeId = (raw: string) => {
	try {
		const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
		return new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
	} catch {
		return null;
	}
};

export const requestPath = (id: string) => `/debug/req/${encodeId(id)}`;

export const DebugPage = () => {
	const params = useParams<{ id?: string }>();
	const [, navigate] = useLocation();
	const selected = params.id ? decodeId(params.id) : null;
	const tree = useDebugTree();
	const remove = useDeleteNode();
	const [dialog, setDialog] = useState<NodeDialogState>(null);
	const [deleting, setDeleting] = useState<TreeNode | null>(null);

	const doDelete = (node: TreeNode, recursive: boolean) =>
		remove.mutate(
			{ id: node.id, recursive },
			{
				onSuccess: () => {
					toast.success("已删除");
					if (selected && (selected === node.id || selected.startsWith(`${node.id}/`))) navigate("/debug");
				},
				onError: err => toast.error(errorMessage(err)),
			}
		);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div role="note" className="flex items-center gap-2 bg-amber-50 px-4 py-1.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
				<ShieldAlert size={14} />
				调试数据目前以明文保存在 mock 目录的 <code>__debug__/</code> 下; 不要提交 <code>environments/secret/</code> 与 <code>history/</code>, 快照中的请求头也可能含真实凭据.
			</div>
			<div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)_340px] divide-x divide-zinc-200 dark:divide-zinc-800">
				<aside className="min-h-0 overflow-auto p-3">
					{tree.isPending ? (
						<Spinner label="加载请求集合" />
					) : tree.isError ? (
						<ErrorState error={tree.error} onRetry={() => tree.refetch()} />
					) : (
						<>
							<DebugTree
								nodes={tree.data.nodes}
								actions={{
									selected,
									onSelect: node => navigate(requestPath(node.id)),
									onCreate: (kind, parent) => setDialog({ mode: "create", kind, parent }),
									onEdit: node => setDialog({ mode: "edit", node }),
									onDelete: setDeleting,
								}}
							/>
							{tree.data.problems.map((p, i) => (
								<p key={i} className="mt-2 text-xs text-amber-700" title={p.file}>
									{p.message}
								</p>
							))}
						</>
					)}
				</aside>
				<section className="min-h-0 overflow-auto p-4">
					{selected ? (
						<RequestEditor key={selected} id={selected} />
					) : (
						<EmptyState title="选择或新建一个请求">在左侧请求集合中选择请求, 或新建分组与请求.</EmptyState>
					)}
				</section>
				<aside className="min-h-0 overflow-auto p-3">
					<div className="mb-2 text-xs font-medium text-zinc-500">环境组</div>
					<EnvPanel />
				</aside>
			</div>
			{dialog && (
				<NodeDialog
					key={dialog.mode === "edit" ? `edit-${dialog.node.id}` : `new-${dialog.kind}-${dialog.parent}`}
					state={dialog}
					tree={tree.data?.nodes || []}
					onClose={() => setDialog(null)}
					onCreated={node => node.kind === "request" && navigate(requestPath(node.id))}
				/>
			)}
			<ConfirmDialog
				open={!!deleting}
				title="删除"
				danger
				confirmText="删除"
				message={
					<>
						确定删除{deleting?.kind === "group" ? "分组(含其中全部请求与快照)" : "请求(含其全部快照)"}「{deleting?.title}」?
					</>
				}
				onClose={() => setDeleting(null)}
				onConfirm={() => deleting && doDelete(deleting, deleting.kind === "group")}
			/>
		</div>
	);
};
