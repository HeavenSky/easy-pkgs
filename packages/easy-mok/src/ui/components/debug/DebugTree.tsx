import { ChevronDown, ChevronRight, FilePlus, FolderPlus, Pencil, Trash2 } from "lucide-react";
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
					"group flex items-center gap-1 rounded px-1 py-0.5 text-sm",
					actions.selected === node.id ? "bg-sky-100 dark:bg-sky-950" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
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
				<span className="flex shrink-0 items-center opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
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
		<div className="flex items-center gap-1">
			<span className="text-xs font-medium text-zinc-500">请求集合</span>
			<Button size="sm" variant="ghost" className="ml-auto" onClick={() => actions.onCreate("request", null)}>
				<FilePlus size={14} />
				请求
			</Button>
			<Button size="sm" variant="ghost" onClick={() => actions.onCreate("group", null)}>
				<FolderPlus size={14} />
				分组
			</Button>
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
