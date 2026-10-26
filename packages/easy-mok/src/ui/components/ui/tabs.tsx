import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 下划线式标签页; 放在 Panel 的 tabs 槽里时与头部分隔线重合, 单独使用时自带底边.
 * 标签名就是可访问名称, 测试与 e2e 按名称定位, 改名前先检索.
 */
export const Tabs = <T extends string>({
	items,
	value,
	onChange,
	label,
	inPanel,
	className,
	extra,
}: {
	items: ReadonlyArray<{ id: T; label: ReactNode; count?: number }>;
	value: T;
	onChange: (id: T) => void;
	label?: string;
	/** 放在 Panel 头部时为 true: 不画自己的底边 */
	inPanel?: boolean;
	className?: string;
	/** 标签之后的附加内容(例如额外的标签按钮) */
	extra?: ReactNode;
}) => (
	<div
		role="tablist"
		aria-label={label}
		className={cn(
			"flex h-full min-h-9 items-stretch gap-4 overflow-x-auto",
			!inPanel && "border-b border-zinc-200 dark:border-zinc-800",
			className
		)}
	>
		{items.map(t => (
			<button
				key={t.id}
				type="button"
				role="tab"
				aria-selected={value === t.id}
				onClick={() => onChange(t.id)}
				className={cn(
					"-mb-px flex shrink-0 items-center gap-1 border-b-2 text-sm whitespace-nowrap transition-colors",
					value === t.id
						? "border-zinc-900 font-medium text-zinc-950 dark:border-zinc-100 dark:text-white"
						: "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
				)}
			>
				{t.label}
				{t.count !== undefined && <span className="text-2xs text-zinc-400">{t.count}</span>}
			</button>
		))}
		{extra}
	</div>
);
