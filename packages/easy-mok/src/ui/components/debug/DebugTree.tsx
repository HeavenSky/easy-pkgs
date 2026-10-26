import { ChevronDown, ChevronRight, FileDown, FilePlus, FileUp, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { TreeNode } from "@/api/debug-contract";
import { cn } from "@/lib/utils";
import { MethodBadge } from "../ui/badge";
import { Button } from "../ui/button";

export type TreeActions = {
	selected: string | null;
	onSelect: (node: TreeNode) => void;
	onCreate: (kind: "group" | "request", parent: string | null) => void;
	onEdit: (node: TreeNode) => void;
	onDelete: (node: TreeNode) => void;
	/** 导入到分组(null 为根) */
	onImport?: (parent: string | null) => void;
	/** 导出: 分组导出 OpenAPI, 请求导出 cURL; null 为全部 */
	onExport?: (node: TreeNode | null) => void;
	/** 请求节点下方的附加内容(快照列表等) */
	renderExtra?: (node: TreeNode) => ReactNode;
};

const Node = ({ node, depth, actions }: { node: TreeNode; depth: number; actions: TreeActions }) => {
	const [open, setOpen] = useState(true);
	const group = node.kind === "group";
	return (
		<li>
			<div
				className={cn(
					"group relative flex items-center gap-1 rounded px-1 py-0.5 text-sm",
					actions.selected === node.id ? "bg-sky-100 dark:bg-sky-950" : "hover:bg-zinc-100 focus-within:bg-zinc-100 dark:hover:bg-zinc-800 dark:focus-within:bg-zinc-800"
				)}
				style={{ paddingLeft: depth * 12 + 4 }}
			>
				{group ? (
					<button type="button" aria-label={open ? `收起 ${node.title}` : `展开 ${node.title}`} onClick={() => setOpen(!open)}>
						{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
					</button>
				) : (
					<MethodBadge method={node.method || "GET"} />
				)}
				<button
					type="button"
					className="min-w-0 flex-1 truncate text-left"
					title={node.id}
					onClick={() => (group ? setOpen(!open) : actions.onSelect(node))}
				>
					{node.title}
				</button>
				{/* 操作按钮悬停时浮在行右侧, 不常驻占位, 窄侧栏里名称不被截断 */}
				<span className="pointer-events-none absolute inset-y-0 right-0 flex items-center rounded-r bg-inherit pl-1 opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
					{group && (
						<>
							<Button size="icon" variant="ghost" aria-label={`在 ${node.title} 下新建请求`} onClick={() => actions.onCreate("request", node.id)}>
								<FilePlus size={13} />
							</Button>
							<Button size="icon" variant="ghost" aria-label={`在 ${node.title} 下新建分组`} onClick={() => actions.onCreate("group", node.id)}>
								<FolderPlus size={13} />
							</Button>
						</>
					)}
					{group && actions.onImport && (
						<Button size="icon" variant="ghost" aria-label={`导入到 ${node.title}`} onClick={() => actions.onImport?.(node.id)}>
							<FileDown size={13} />
						</Button>
					)}
					{actions.onExport && (
						<Button size="icon" variant="ghost" aria-label={group ? `导出 ${node.title} 为 OpenAPI` : `导出 ${node.title} 为 cURL`} onClick={() => actions.onExport?.(node)}>
							<FileUp size={13} />
						</Button>
					)}
					<Button size="icon" variant="ghost" aria-label={`编辑 ${node.title}`} onClick={() => actions.onEdit(node)}>
						<Pencil size={13} />
					</Button>
					<Button size="icon" variant="ghost" aria-label={`删除 ${node.title}`} onClick={() => actions.onDelete(node)}>
						<Trash2 size={13} />
					</Button>
				</span>
			</div>
			{!group && actions.renderExtra?.(node)}
			{group && open && !!node.children?.length && (
				<ul>
					{node.children.map(c => (
						<Node key={c.id} node={c} depth={depth + 1} actions={actions} />
					))}
				</ul>
			)}
		</li>
	);
};

export const DebugTree = ({ nodes, actions }: { nodes: TreeNode[]; actions: TreeActions }) => (
	<div className="space-y-2">
		<div className="flex items-center gap-0.5">
			<span className="text-xs font-semibold whitespace-nowrap text-zinc-700 dark:text-zinc-300">请求集合</span>
			<Button size="sm" variant="ghost" className="ml-auto px-1.5" onClick={() => actions.onCreate("request", null)}>
				<FilePlus size={14} />
				请求
			</Button>
			<Button size="sm" variant="ghost" className="px-1.5" onClick={() => actions.onCreate("group", null)}>
				<FolderPlus size={14} />
				分组
			</Button>
			{actions.onImport && (
				<Button size="icon" variant="ghost" aria-label="导入 cURL 或 OpenAPI" title="导入 cURL 或 OpenAPI" onClick={() => actions.onImport?.(null)}>
					<FileDown size={14} />
				</Button>
			)}
			{actions.onExport && (
				<Button size="icon" variant="ghost" aria-label="全部导出为 OpenAPI" title="全部导出为 OpenAPI" onClick={() => actions.onExport?.(null)}>
					<FileUp size={14} />
				</Button>
			)}
		</div>
		{nodes.length ? (
			<ul aria-label="请求集合">
				{nodes.map(n => (
					<Node key={n.id} node={n} depth={0} actions={actions} />
				))}
			</ul>
		) : (
			<p className="text-xs text-zinc-500">还没有请求, 先新建一个分组或请求.</p>
		)}
	</div>
);
