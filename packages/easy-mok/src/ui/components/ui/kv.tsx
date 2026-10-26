import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 键值对的列宽: 键窄值宽. 编辑行用 KV_ROW(可选前置复选框), 只读用 KvList.
 * 键列最小 6rem, 与值列按 1:2.5 分配; 末列放删除按钮.
 */
export const KV_ROW = "grid grid-cols-[minmax(6rem,1fr)_minmax(0,2.5fr)_auto] items-center gap-1.5";
export const KV_ROW_CHECK =
	"grid grid-cols-[auto_minmax(6rem,1fr)_minmax(0,2.5fr)_auto] items-center gap-1.5";

/** 只读键值列表: 键列按内容自适应且不超过 12rem, 值列可换行 */
export const KvList = ({
	items,
	mono,
	empty = "暂无",
	className,
}: {
	items: ReadonlyArray<readonly [ReactNode, ReactNode]>;
	/** 值用等宽字体(URL, 变量值, 请求头) */
	mono?: boolean;
	empty?: ReactNode;
	className?: string;
}) =>
	items.length ? (
		<dl
			className={cn(
				"grid grid-cols-[minmax(4rem,max-content)_minmax(0,1fr)] gap-x-4 gap-y-1",
				className
			)}
		>
			{items.map(([k, v], i) => (
				<div key={i} className="contents">
					<dt className="max-w-48 truncate text-xs leading-5 text-zinc-500 dark:text-zinc-400">
						{k}
					</dt>
					<dd
						className={cn(
							"min-w-0 text-sm break-all",
							mono && "font-mono text-xs leading-5"
						)}
					>
						{v}
					</dd>
				</div>
			))}
		</dl>
	) : (
		<p className="text-xs text-zinc-400">{empty}</p>
	);
