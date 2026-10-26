import { Pencil } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/**
 * 模块边界: 每个独立模块是一个 Panel(白底, 边框, 圆角), 头部一行放标题或 Tabs 与操作按钮, 与内容用分隔线隔开.
 * flush 时内容区不加内边距, 用于内容自带分隔的列表与表格.
 */
export const Panel = ({
	title,
	tabs,
	actions,
	flush,
	className,
	bodyClassName,
	children,
	...props
}: {
	title?: ReactNode;
	tabs?: ReactNode;
	actions?: ReactNode;
	flush?: boolean;
	bodyClassName?: string;
	children?: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, "title">) => (
	<section
		className={cn(
			"min-w-0 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900",
			className
		)}
		{...props}
	>
		{(title || tabs || actions) && (
			<header className="flex min-h-9 items-center gap-2 border-b border-zinc-200 px-3 dark:border-zinc-800">
				{title && <h2 className="min-w-0 truncate text-base font-medium">{title}</h2>}
				{tabs && <div className="min-w-0 self-stretch">{tabs}</div>}
				{actions && (
					<div className="ml-auto flex shrink-0 items-center gap-1">{actions}</div>
				)}
			</header>
		)}
		<div className={cn(!flush && "space-y-3 p-3", bodyClassName)}>{children}</div>
	</section>
);

/** Panel 内的分区: 小标题加内容; 分区之间靠 Panel 的 space-y-3 隔开 */
export const Section = ({
	title,
	actions,
	className,
	children,
}: {
	title: ReactNode;
	actions?: ReactNode;
	className?: string;
	children?: ReactNode;
}) => (
	<div className={cn("space-y-1.5", className)}>
		<div className="flex min-h-6 items-center gap-2">
			<h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{title}</h3>
			{actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
		</div>
		{children}
	</div>
);

/** 页面或栏位顶部的通栏工具条: 搜索, 筛选与页面级操作 */
export const Toolbar = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn(
			"flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-3 py-1.5 dark:border-zinc-800 dark:bg-zinc-900",
			className
		)}
		{...props}
	/>
);

/** 侧栏列表项: 选中项用浅灰底加左侧黑色竖条 */
export const listItemClass = (selected: boolean) =>
	cn(
		"relative w-full text-left transition-colors",
		selected
			? "bg-zinc-100 font-medium text-zinc-950 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-zinc-900 dark:bg-zinc-800 dark:text-white dark:before:bg-zinc-100"
			: "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
	);

/** 只读展示与编辑切换的头部操作: 只读时一个「编辑」, 编辑时「取消」与「保存」 */
export const EditActions = ({
	editing,
	onEdit,
	onCancel,
	onSave,
	canSave = true,
	saving,
	editLabel = "编辑",
	saveLabel = "保存",
}: {
	editing: boolean;
	onEdit: () => void;
	onCancel: () => void;
	onSave: () => void;
	canSave?: boolean;
	saving?: boolean;
	editLabel?: string;
	saveLabel?: string;
}) =>
	editing ? (
		<>
			<Button size="sm" variant="ghost" onClick={onCancel}>
				取消
			</Button>
			<Button size="sm" variant="default" disabled={!canSave || saving} onClick={onSave}>
				{saveLabel}
			</Button>
		</>
	) : (
		<Button size="sm" variant="ghost" aria-label={editLabel} onClick={onEdit}>
			<Pencil size={12} />
			编辑
		</Button>
	);
