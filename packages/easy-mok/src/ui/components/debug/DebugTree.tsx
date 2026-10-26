import {
	Camera,
	ChevronRight,
	FoldVertical,
	Folder,
	FolderOpen,
	FolderPlus,
	Import,
	Library,
	Plus,
	Share,
	SquarePen,
	Trash2,
	UnfoldVertical,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import type { TreeNode } from "@/api/debug-contract";
import { cn } from "@/lib/utils";
import { MethodBadge } from "../ui/badge";
import { Button } from "../ui/button";
import { ActionMenu, type MenuItem } from "../ui/menu";
import { Toolbar, listItemClass } from "../ui/panel";

export type TreeActions = {
	selected: string | null;
	/** 选中的快照, 形如 `请求标识#快照名`; 选中快照时请求行只加粗, 底色与竖条留给快照行 */
	selectedSnapshot?: string | null;
	onSelect: (node: TreeNode) => void;
	onSelectSnapshot?: (sid: string) => void;
	/** 选中分组或集合时打开它的默认配置; 不给时点分组名只展开收起 */
	onSelectGroup?: (node: TreeNode) => void;
	onSelectCollection?: () => void;
	collectionSelected?: boolean;
	onCreate: (kind: "group" | "request", parent: string | null) => void;
	onEdit: (node: TreeNode) => void;
	onDelete: (node: TreeNode) => void;
	/** 导入到分组(null 为根) */
	onImport?: (parent: string | null) => void;
	/** 导出: 分组导出 OpenAPI, 请求导出 cURL; null 为全部 */
	onExport?: (node: TreeNode | null) => void;
};

/** 分组, 请求与快照统一显示为「目录名(展示名)」; 没填展示名时只显示目录名, 展示名用弱化色 */
export const NameTitle = ({ name, title }: { name: string; title: string }) => (
	<>
		{name}
		{title && title !== name && (
			<span className="ml-0.5 font-normal text-zinc-400 dark:text-zinc-500">({title})</span>
		)}
	</>
);

/** 每级缩进与引导线的位置(px); 引导线对齐上一级的折叠箭头中线 */
const INDENT_PX = 16;
const BASE_PX = 8;
const guideLeft = (level: number) => BASE_PX + level * INDENT_PX + 7;

/** 折叠状态存本机, 刷新后保持; 记录的是收起的节点, 新节点默认展开 */
const STORAGE_KEY = "easy-mok:debug-tree-collapsed";
const loadCollapsed = () => {
	try {
		const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
		return new Set<string>(Array.isArray(raw) ? raw.filter(x => typeof x === "string") : []);
	} catch {
		return new Set<string>();
	}
};

/** 行骨架: 整行可选中, 左侧按层级画引导线, 右侧操作按钮悬停或聚焦时浮出(opacity 隐藏, 保持键盘可达) */
const Row = ({
	depth,
	selected,
	ancestor,
	small,
	toggle,
	children,
	actions,
}: {
	depth: number;
	selected: boolean;
	/** 选中的是它的子项: 只加粗 */
	ancestor?: boolean;
	small?: boolean;
	toggle?: { open: boolean; label: string; onToggle: () => void };
	children: ReactNode;
	actions?: ReactNode;
}) => (
	<div
		className={cn(
			"group relative flex items-center gap-1.5 pr-3",
			small ? "h-7" : "h-8",
			listItemClass(selected),
			ancestor && "font-medium text-zinc-950 dark:text-white"
		)}
		style={{ paddingLeft: BASE_PX + depth * INDENT_PX }}
	>
		{Array.from({ length: depth }, (_, i) => (
			<span
				key={i}
				aria-hidden
				className="absolute inset-y-0 border-l border-zinc-200 dark:border-zinc-800"
				style={{ left: guideLeft(i) }}
			/>
		))}
		{toggle ? (
			<button
				type="button"
				className="flex size-3.5 shrink-0 items-center justify-center rounded-sm text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
				aria-label={toggle.label}
				aria-expanded={toggle.open}
				onClick={toggle.onToggle}
			>
				<ChevronRight
					size={12}
					className={cn("transition-transform", toggle.open && "rotate-90")}
				/>
			</button>
		) : (
			<span aria-hidden className="size-3.5 shrink-0" />
		)}
		{children}
		{actions && (
			<span
				className={cn(
					"pointer-events-none absolute inset-y-0 right-0 flex items-center gap-0.5 px-1 opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100",
					selected
						? "bg-zinc-100 dark:bg-zinc-800"
						: "bg-white group-hover:bg-zinc-50 dark:bg-zinc-900 dark:group-hover:bg-zinc-800"
				)}
			>
				{actions}
			</span>
		)}
	</div>
);

const Node = ({
	node,
	depth,
	actions,
	collapsed,
	toggle,
}: {
	node: TreeNode;
	depth: number;
	actions: TreeActions;
	collapsed: Set<string>;
	toggle: (id: string) => void;
}) => {
	const group = node.kind === "group";
	const snapshots = node.snapshots || [];
	const expandable = group ? !!node.children?.length : snapshots.length > 0;
	const active = actions.selected === node.id;
	const childActive = active && !!actions.selectedSnapshot;
	// 选中的快照所在的请求总是展开, 避免选中项被藏起来
	const open = !collapsed.has(node.id) || childActive;
	return (
		<li
			role="treeitem"
			aria-expanded={expandable ? open : undefined}
			aria-selected={active && !childActive}
		>
			<Row
				depth={depth}
				selected={active && !childActive}
				ancestor={childActive}
				toggle={
					expandable
						? {
								open,
								label: open ? `收起 ${node.title}` : `展开 ${node.title}`,
								onToggle: () => toggle(node.id),
							}
						: undefined
				}
				actions={
					<>
						{/* 层级固定为 根 → 分组 → 请求: 分组下只能新建请求, 它是分组最常用的操作, 常驻行内 */}
						{group && (
							<Button
								size="icon-sm"
								variant="ghost"
								aria-label={`在 ${node.title} 下新建请求`}
								title="新建请求"
								onClick={() => actions.onCreate("request", node.id)}
							>
								<Plus size={14} />
							</Button>
						)}
						<ActionMenu
							label={`${node.title} 的更多操作`}
							items={
								[
									...(group && actions.onImport
										? [
												{
													label: "导入到此分组",
													ariaLabel: `导入到 ${node.title}`,
													icon: <Import size={14} />,
													onSelect: () => actions.onImport?.(node.id),
												},
											]
										: []),
									...(actions.onExport
										? [
												{
													label: group ? "导出为 OpenAPI" : "导出为 cURL",
													ariaLabel: group
														? `导出 ${node.title} 为 OpenAPI`
														: `导出 ${node.title} 为 cURL`,
													icon: <Share size={14} />,
													onSelect: () => actions.onExport?.(node),
												},
											]
										: []),
									{
										label: "编辑",
										ariaLabel: `编辑 ${node.title}`,
										icon: <SquarePen size={14} />,
										onSelect: () => actions.onEdit(node),
									},
									{
										label: "删除",
										ariaLabel: `删除 ${node.title}`,
										icon: <Trash2 size={14} />,
										danger: true,
										onSelect: () => actions.onDelete(node),
									},
								] satisfies MenuItem[]
							}
						/>
					</>
				}
			>
				{group ? (
					open && expandable ? (
						<FolderOpen size={14} className="shrink-0 text-zinc-400" />
					) : (
						<Folder size={14} className="shrink-0 text-zinc-400" />
					)
				) : (
					<MethodBadge method={node.method || "GET"} />
				)}
				<button
					type="button"
					className="h-full min-w-0 flex-1 truncate text-left"
					title={node.id}
					onClick={() =>
						group
							? actions.onSelectGroup
								? actions.onSelectGroup(node)
								: toggle(node.id)
							: actions.onSelect(node)
					}
				>
					<NameTitle name={node.name} title={node.title} />
				</button>
				{!group && !open && snapshots.length > 0 && (
					<span
						className="shrink-0 text-2xs text-zinc-400"
						title={`${snapshots.length} 个快照`}
					>
						{snapshots.length}
					</span>
				)}
			</Row>
			{group && open && expandable && (
				<ul role="group">
					{node.children!.map(c => (
						<Node
							key={c.id}
							node={c}
							depth={depth + 1}
							actions={actions}
							collapsed={collapsed}
							toggle={toggle}
						/>
					))}
				</ul>
			)}
			{!group && open && snapshots.length > 0 && (
				<ul role="group" aria-label={`${node.title} 的快照`}>
					{snapshots.map(s => {
						const sid = `${node.id}#${s.name}`;
						const on = actions.selectedSnapshot === sid;
						return (
							<li key={s.name} role="treeitem" aria-selected={on}>
								<Row depth={depth + 1} selected={on} small>
									<Camera size={12} className="shrink-0 text-zinc-400" />
									<button
										type="button"
										title={sid}
										className="h-full min-w-0 flex-1 truncate text-left text-xs"
										onClick={() => actions.onSelectSnapshot?.(sid)}
									>
										<NameTitle name={s.name} title={s.title} />
									</button>
								</Row>
							</li>
						);
					})}
				</ul>
			)}
		</li>
	);
};

/** 树根(集合)在折叠状态里的标识; 不会与节点标识冲突, 节点名不能以 _ 开头 */
const ROOT_ID = "__root__";

/** 可折叠的节点标识: 有子节点的分组与有快照的请求 */
const expandableIds = (nodes: TreeNode[]): string[] =>
	nodes.flatMap(n =>
		n.kind === "group"
			? [...(n.children?.length ? [n.id] : []), ...expandableIds(n.children || [])]
			: n.snapshots?.length
				? [n.id]
				: []
	);

/** 请求集合树: 顶部是栏位工具条, 下方是树; 外层栏位负责滚动 */
export const DebugTree = ({ nodes, actions }: { nodes: TreeNode[]; actions: TreeActions }) => {
	const [collapsed, setCollapsed] = useState(loadCollapsed);
	const save = (next: Set<string>) => {
		setCollapsed(next);
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
		} catch {
			/* 本机存储不可用时只在内存中保持 */
		}
	};
	const toggle = (id: string) => {
		const next = new Set(collapsed);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		save(next);
	};
	// 全部收起时不收树根, 保留分组列表
	const all = expandableIds(nodes);
	const allCollapsed = all.length > 0 && all.every(id => collapsed.has(id));
	return (
		<>
			<Toolbar className="sticky top-0 z-10 gap-0.5 pr-2">
				<h2 className="text-xs font-medium whitespace-nowrap text-zinc-500 dark:text-zinc-400">
					目录
				</h2>
				{/* 根下只能新建分组 */}
				<Button
					size="sm"
					variant="ghost"
					className="ml-auto px-1.5"
					title="新建分组"
					onClick={() => actions.onCreate("group", null)}
				>
					<FolderPlus size={14} />
					分组
				</Button>
				{all.length > 0 && (
					<Button
						size="icon-sm"
						variant="ghost"
						aria-label={allCollapsed ? "全部展开" : "全部收起"}
						title={allCollapsed ? "全部展开" : "全部收起"}
						onClick={() => save(allCollapsed ? new Set() : new Set(all))}
					>
						{allCollapsed ? <UnfoldVertical size={14} /> : <FoldVertical size={14} />}
					</Button>
				)}
				{/* 全部展开/收起常驻; 导入导出按「≤2 个平铺, 更多收进下拉」的规则展示 */}
				<ActionMenu
					label="集合的更多操作"
					items={[
						...(actions.onImport
							? [
									{
										label: "导入 cURL 或 OpenAPI",
										icon: <Import size={14} />,
										onSelect: () => actions.onImport?.(null),
									},
								]
							: []),
						...(actions.onExport
							? [
									{
										label: "全部导出为 OpenAPI",
										icon: <Share size={14} />,
										onSelect: () => actions.onExport?.(null),
									},
								]
							: []),
					]}
				/>
			</Toolbar>
			{/* 树根是集合本身: 点它打开集合默认配置, 分组挂在它下面 */}
			<ul role="tree" aria-label="请求集合" className="py-1">
				<li
					role="treeitem"
					aria-expanded={nodes.length ? !collapsed.has(ROOT_ID) : undefined}
					aria-selected={!!actions.collectionSelected}
				>
					<Row
						depth={0}
						selected={!!actions.collectionSelected}
						toggle={
							nodes.length
								? {
										open: !collapsed.has(ROOT_ID),
										label: collapsed.has(ROOT_ID)
											? "展开 请求集合"
											: "收起 请求集合",
										onToggle: () => toggle(ROOT_ID),
									}
								: undefined
						}
					>
						<Library size={14} className="shrink-0 text-zinc-400" />
						<button
							type="button"
							className="h-full min-w-0 flex-1 truncate text-left"
							title="集合的默认请求头, 认证与发送设置"
							onClick={() =>
								actions.onSelectCollection
									? actions.onSelectCollection()
									: toggle(ROOT_ID)
							}
						>
							请求集合
						</button>
					</Row>
					{!collapsed.has(ROOT_ID) && nodes.length > 0 && (
						<ul role="group">
							{nodes.map(n => (
								<Node
									key={n.id}
									node={n}
									depth={1}
									actions={actions}
									collapsed={collapsed}
									toggle={toggle}
								/>
							))}
						</ul>
					)}
				</li>
			</ul>
			{!nodes.length && (
				<p className="px-3 py-2 text-xs text-zinc-500">
					还没有请求, 先新建一个分组, 再在分组下新建请求.
				</p>
			)}
		</>
	);
};
