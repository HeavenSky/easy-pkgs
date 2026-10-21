import type { HTMLAttributes } from "react";
import { cn, methodColor } from "@/lib/utils";

export const Badge = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
	<span
		className={cn(
			"inline-flex items-center rounded px-1.5 py-0.5 text-[11px] leading-none font-medium whitespace-nowrap",
			className
		)}
		{...props}
	/>
);

export const MethodBadge = ({ method }: { method: string }) => (
	<Badge className={cn("font-mono", methodColor(method))}>{method}</Badge>
);

export const StatusBadge = ({ status }: { status: number }) => {
	const color = !status
		? "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
		: status >= 500
			? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
			: status >= 400
				? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
				: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
	return <Badge className={cn("font-mono", color)}>{status || "—"}</Badge>;
};
