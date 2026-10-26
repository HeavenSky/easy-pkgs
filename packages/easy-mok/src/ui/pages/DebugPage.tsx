import { Camera, History, Send, ShieldAlert, Square } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link, useLocation, useParams } from "wouter";
import { ApiError, errorMessage } from "@/api/client";
import { encodeId, type TreeNode } from "@/api/debug-contract";
import {
	historyRawUrl,
	useDebugTree,
	useDeleteNode,
	useDiff,
	useEnvs,
	useHistoryEntry,
	useSend,
} from "@/api/debug-queries";
import { DiffView } from "@/components/debug/DiffView";
import { HistoryList } from "@/components/debug/HistoryList";
import { ExportDialog } from "@/components/debug/ExportDialog";
import { ImportDialog } from "@/components/debug/ImportDialog";
import { SaveSnapshotDialog } from "@/components/debug/SaveSnapshotDialog";
import { SnapshotPanel } from "@/components/debug/SnapshotPanel";
import { ResponseViewer } from "@/components/debug/ResponseViewer";
import { Button } from "@/components/ui/button";
import { DebugTree } from "@/components/debug/DebugTree";
import { NodeConfigPanel } from "@/components/debug/NodeConfigPanel";
import {
	ActiveEnvSelect,
	EnvPanel,
	PanelSection,
	PromptSecretDialog,
} from "@/components/debug/EnvPanel";
import { RedactRulesPanel } from "@/components/debug/RedactRulesPanel";
import { NodeDialog, type NodeDialogState } from "@/components/debug/NodeDialog";
import { MOD_KEY, RequestEditor, definitionOf, type Draft } from "@/components/debug/RequestEditor";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, Notice, Spinner } from "@/components/ui/state";

const decodeId = (raw: string) => {
	try {
		const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
		return new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
	} catch {
		return null;
	}
};

export const requestPath = (id: string) => `/debug/req/${encodeId(id)}`;
export const groupPath = (id: string) => `/debug/group/${encodeId(id)}`;
export const COLLECTION_PATH = "/debug/collection";

const findNode = (nodes: TreeNode[], id: string): TreeNode | null => {
	for (const n of nodes) {
		if (n.id === id) return n;
		const hit = findNode(n.children || [], id);
		if (hit) return hit;
	}
	return null;
};
export const snapshotPath = (sid: string) => {
	const i = sid.lastIndexOf("#");
	return `${requestPath(sid.slice(0, i))}/snap/${encodeId(sid.slice(i + 1))}`;
};

/** 请求编辑器, 发送按钮, 本次结果或选中的快照, 以及该请求的历史 */
const Workbench = ({
	id,
	snapshot,
	tree,
}: {
	id: string;
	snapshot: string | null;
	tree: TreeNode[];
}) => {
	const [, navigate] = useLocation();
	const send = useSend();
	const envs = useEnvs();
	const [viewing, setViewing] = useState<string | null>(null);
	const [saving, setSaving] = useState<string | null>(null);
	const [compare, setCompare] = useState<string[]>([]);
	const diff = useDiff(
		compare.length === 2 ? `history:${compare[0]}` : null,
		compare.length === 2 ? `history:${compare[1]}` : null
	);
	const fromHistory = useHistoryEntry(viewing && viewing !== send.data?.id ? viewing : null);
	const current = viewing && viewing !== send.data?.id ? fromHistory.data : send.data;
	const fail = (err: unknown) => toast.error(errorMessage(err));
	const [prompt, setPrompt] = useState<{ env: string; srcId: string; retry: () => void } | null>(
		null
	);
	const sendWith = (input: Parameters<typeof send.mutate>[0]) =>
		send.mutate(input, {
			onSuccess: e => {
				setViewing(e.id);
				if (snapshot) navigate(requestPath(id));
			},
			onError: err => {
				// prompt 来源尚未输入: 输入后自动重发
				const d =
					err instanceof ApiError
						? (err.details as
								| { prompt?: boolean; srcId?: string; env?: string }
								| undefined)
						: undefined;
				if (
					err instanceof ApiError &&
					err.code === "SECRET_UNAVAILABLE" &&
					d?.prompt &&
					d.srcId &&
					d.env
				) {
					setPrompt({ env: d.env, srcId: d.srcId, retry: () => sendWith(input) });
				} else if (
					err instanceof ApiError &&
					err.code === "UNRESOLVED_VARS" &&
					!envs.data?.active
				) {
					toast.error(`${errorMessage(err)}; 还没有激活环境组, 在发送按钮左侧选择`);
				} else fail(err);
			},
		});
	const sendDraft = (draft: Draft) => {
		if (send.isPending) return;
		const d = definitionOf(draft);
		if (!d.ok) return void toast.error(d.error);
		sendWith({ request: id, definition: d.def });
	};
	const saveButton = (hid: string) => (
		<Button size="sm" onClick={() => setSaving(hid)}>
			<Camera size={12} />
			另存为快照
		</Button>
	);
	return (
		<div className="space-y-4">
			<RequestEditor id={id} onSend={sendDraft}>
				{draft => (
					<>
						<ActiveEnvSelect label="发送使用的环境组" className="w-28" />
						<Button
							variant="default"
							disabled={send.isPending}
							title={`发送 (${MOD_KEY}Enter)`}
							onClick={() => sendDraft(draft)}
						>
							<Send size={14} />
							{send.isPending ? "发送中" : "发送"}
						</Button>
						{send.isPending && (
							<Button onClick={send.cancel}>
								<Square size={14} />
								取消
							</Button>
						)}
					</>
				)}
			</RequestEditor>
			{snapshot ? (
				<SnapshotPanel
					key={snapshot}
					sid={snapshot}
					onRenamed={sid => navigate(snapshotPath(sid))}
					onDeleted={() => navigate(requestPath(id))}
					onResend={sid => sendWith({ request: id, snapshot: sid })}
				/>
			) : (
				current && (
					<ResponseViewer
						title="响应"
						label="响应"
						meta={current.meta}
						rawUrl={historyRawUrl(current.id)}
						actions={saveButton(current.id)}
					/>
				)
			)}
			{!snapshot && !viewing && !send.data && !send.isPending && (
				<Panel title="响应">
					<p className="py-3 text-center text-xs text-zinc-500">
						点击发送或按 {MOD_KEY}Enter 查看响应; 也可以从下方历史中选一条
					</p>
				</Panel>
			)}
			{compare.length === 2 && diff.data && (
				<Panel
					title="对比两条历史(旧 → 新)"
					actions={
						<Button size="sm" variant="ghost" onClick={() => setCompare([])}>
							清除对比
						</Button>
					}
				>
					<DiffView diff={diff.data} />
				</Panel>
			)}
			<Panel
				flush
				title={
					<>
						发送历史
						<span className="ml-2 text-xs font-normal text-zinc-400">
							勾选两条可对比
						</span>
					</>
				}
			>
				<HistoryList
					requestId={id}
					selected={snapshot ? null : current?.id || null}
					onSelect={line => {
						setViewing(line.id);
						if (snapshot) navigate(requestPath(id));
					}}
					extra={line => (
						<input
							type="checkbox"
							aria-label={`对比 ${line.id}`}
							checked={compare.includes(line.id)}
							onChange={e =>
								setCompare(prev =>
									e.target.checked
										? [...prev, line.id]
												.slice(-2)
												.sort((a, b) => (a < b ? -1 : 1))
										: prev.filter(x => x !== line.id)
								)
							}
						/>
					)}
				/>
			</Panel>
			{prompt && (
				<PromptSecretDialog
					env={prompt.env}
					srcId={prompt.srcId}
					onClose={() => setPrompt(null)}
					onDone={prompt.retry}
				/>
			)}
			{saving && (
				<SaveSnapshotDialog
					hid={saving}
					requestId={id}
					tree={tree}
					onClose={() => setSaving(null)}
					onSaved={sid => navigate(snapshotPath(sid))}
				/>
			)}
		</div>
	);
};

export const DebugPage = () => {
	const params = useParams<{ id?: string; snap?: string; gid?: string }>();
	const [location, navigate] = useLocation();
	const selected = params.id ? decodeId(params.id) : null;
	// 选中分组或集合时, 中间区显示它的默认配置
	const groupId = params.gid ? decodeId(params.gid) : null;
	const collectionSelected = location === COLLECTION_PATH;
	const snapName = params.snap ? decodeId(params.snap) : null;
	const snapshot = selected && snapName ? `${selected}#${snapName}` : null;
	const tree = useDebugTree();
	const remove = useDeleteNode();
	const [dialog, setDialog] = useState<NodeDialogState>(null);
	const [deleting, setDeleting] = useState<TreeNode | null>(null);
	const [importing, setImporting] = useState<{ parent: string | null } | null>(null);
	const [exporting, setExporting] = useState<{ node: TreeNode | null } | null>(null);

	const doDelete = (node: TreeNode, recursive: boolean) =>
		remove.mutate(
			{ id: node.id, recursive },
			{
				onSuccess: () => {
					toast.success("已删除");
					const current = selected || groupId;
					if (current && (current === node.id || current.startsWith(`${node.id}/`)))
						navigate("/debug");
				},
				onError: err => toast.error(errorMessage(err)),
			}
		);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<Notice role="note" icon={<ShieldAlert size={12} className="shrink-0" />}>
				<span
					className="min-w-0 truncate"
					title="environments/secret/ 与 history/ 已用目录内的 .gitignore 排除在版本库外; 请求, 环境组与快照会提交, 敏感值写成 <secret:id>, 另存快照时按脱敏规则处理响应字段."
				>
					敏感值来源, cookie 与发送历史不进版本库(目录内 <code>.gitignore</code>); 请求,
					环境组与快照会提交, 敏感值写成 <code>{"<secret:id>"}</code>, 快照按脱敏规则处理.
				</span>
				<Link
					href="/debug/history"
					className="ml-auto inline-flex shrink-0 items-center gap-1 text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900 dark:text-zinc-100 dark:decoration-zinc-600"
				>
					<History size={12} />
					全部历史
				</Link>
			</Notice>
			<div className="flex min-h-0 flex-1">
				<aside className="w-56 shrink-0 overflow-auto border-r border-zinc-200 bg-white xl:w-64 dark:border-zinc-800 dark:bg-zinc-900">
					{tree.isPending ? (
						<Spinner label="加载请求集合" />
					) : tree.isError ? (
						<ErrorState error={tree.error} onRetry={() => tree.refetch()} />
					) : (
						<>
							<DebugTree
								nodes={tree.data.nodes}
								actions={{
									selected: selected || groupId,
									collectionSelected,
									onSelectCollection: () => navigate(COLLECTION_PATH),
									onSelectGroup: node => navigate(groupPath(node.id)),
									selectedSnapshot: snapshot,
									onSelect: node => navigate(requestPath(node.id)),
									onSelectSnapshot: sid => navigate(snapshotPath(sid)),
									onCreate: (kind, parent) =>
										setDialog({ mode: "create", kind, parent }),
									onEdit: node => setDialog({ mode: "edit", node }),
									onDelete: setDeleting,
									onImport: parent => setImporting({ parent }),
									onExport: node => setExporting({ node }),
								}}
							/>
							{tree.data.problems.length > 0 && (
								<div className="space-y-1.5 border-t border-zinc-200 p-3 dark:border-zinc-800">
									{tree.data.problems.map((p, i) => (
										<p
											key={i}
											className="text-xs text-amber-700"
											title={p.file}
										>
											{p.message}
										</p>
									))}
								</div>
							)}
						</>
					)}
				</aside>
				<section className="min-h-0 min-w-0 flex-1 overflow-auto bg-zinc-50 p-4 dark:bg-zinc-950">
					{selected ? (
						<Workbench
							key={selected}
							id={selected}
							snapshot={snapshot}
							tree={tree.data?.nodes || []}
						/>
					) : (collectionSelected || groupId) && tree.data ? (
						(() => {
							const group = groupId ? findNode(tree.data.nodes, groupId) : null;
							return groupId && !group ? (
								<Panel>
									<EmptyState title="分组不存在">
										它可能已被删除或改名, 在左侧重新选择.
									</EmptyState>
								</Panel>
							) : (
								<NodeConfigPanel
									key={groupId || "collection"}
									tree={tree.data}
									group={group}
								/>
							);
						})()
					) : (
						<Panel>
							<EmptyState title="选择或新建一个请求">
								在左侧请求集合中选择请求, 或新建分组与请求.
							</EmptyState>
						</Panel>
					)}
				</section>
				<aside
					aria-label="环境与脱敏设置"
					className="w-80 shrink-0 overflow-auto border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
				>
					<EnvPanel />
					<PanelSection title="快照脱敏规则" defaultOpen={false}>
						<RedactRulesPanel />
					</PanelSection>
				</aside>
			</div>
			{dialog && (
				<NodeDialog
					key={
						dialog.mode === "edit"
							? `edit-${dialog.node.id}`
							: `new-${dialog.kind}-${dialog.parent}`
					}
					state={dialog}
					tree={tree.data?.nodes || []}
					onClose={() => setDialog(null)}
					onCreated={node => node.kind === "request" && navigate(requestPath(node.id))}
				/>
			)}
			{importing && (
				<ImportDialog
					tree={tree.data?.nodes || []}
					parent={importing.parent}
					onClose={() => setImporting(null)}
					onImported={node => navigate(requestPath(node.id))}
				/>
			)}
			{exporting && (
				<ExportDialog
					target={
						exporting.node && exporting.node.kind === "request"
							? { kind: "curl", source: `request:${exporting.node.id}` }
							: {
									kind: "openapi",
									node: exporting.node ? exporting.node.id : null,
									title: exporting.node ? exporting.node.title : "全部请求",
								}
					}
					onClose={() => setExporting(null)}
				/>
			)}
			<ConfirmDialog
				open={!!deleting}
				title="删除"
				danger
				confirmText="删除"
				message={
					<>
						确定删除
						{deleting?.kind === "group"
							? "分组(含其中全部请求与快照)"
							: "请求(含其全部快照)"}
						「{deleting?.title}」?
					</>
				}
				onClose={() => setDeleting(null)}
				onConfirm={() => deleting && doDelete(deleting, deleting.kind === "group")}
			/>
		</div>
	);
};
