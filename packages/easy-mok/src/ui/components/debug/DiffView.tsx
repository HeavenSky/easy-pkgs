import type { DiffResult } from "@/api/debug-contract";
import { cn } from "@/lib/utils";
import { formatBytes } from "./ResponseViewer";

const CHANGE_TEXT = { same: "相同", added: "新增", removed: "删除", changed: "变化" } as const;
const MODE_TEXT = {
	json: "JSON(已按 key 排序)",
	text: "文本",
	binary: "二进制, 只比较大小与摘要",
	"too-large": "超过 2MB, 只比较大小与摘要",
	empty: "两侧都没有响应体",
} as const;

/** 统一 diff 视图: a 为旧(左), b 为新(右) */
export const DiffView = ({
	diff,
	labels = ["旧", "新"],
}: {
	diff: DiffResult;
	labels?: [string, string];
}) => {
	const changedHeaders = diff.headers.filter(h => h.change !== "same");
	return (
		<div className="space-y-3 text-xs">
			<div className="flex flex-wrap gap-x-4 gap-y-1">
				<span>
					状态码: {diff.status.a ?? "无"} → {diff.status.b ?? "无"}
					{diff.status.a !== diff.status.b && (
						<span className="ml-1 font-medium text-amber-700">变化</span>
					)}
				</span>
				<span>
					响应体: {MODE_TEXT[diff.body.mode]}, {formatBytes(diff.body.a.size)} →{" "}
					{formatBytes(diff.body.b.size)},{" "}
					{diff.body.same ? (
						<span className="font-medium text-emerald-700">相同</span>
					) : (
						<span className="font-medium text-amber-700">不同</span>
					)}
				</span>
			</div>
			{changedHeaders.length > 0 && (
				<div className="space-y-1.5">
					<h3 className="text-xs font-medium text-zinc-500">响应头变化</h3>
					<dl className="grid grid-cols-[minmax(4rem,max-content)_auto_minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-1 font-mono leading-5">
						{changedHeaders.map(h => (
							<div key={h.name} className="contents">
								<dt className="max-w-48 truncate text-zinc-500" title={h.name}>
									{h.name}
								</dt>
								<dd className="font-sans">{CHANGE_TEXT[h.change]}</dd>
								<dd className="min-w-0 break-all text-rose-700">
									{h.a.join(", ")}
								</dd>
								<dd className="min-w-0 break-all text-emerald-700">
									{h.b.join(", ")}
								</dd>
							</div>
						))}
					</dl>
				</div>
			)}
			{diff.body.hunks.length > 0 && (
				<div
					className="max-h-96 overflow-auto rounded-md border border-zinc-200 font-mono dark:border-zinc-800"
					aria-label="响应体差异"
				>
					<div className="flex h-8 items-center gap-4 border-b border-zinc-200 bg-zinc-50 px-2 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
						<span className="text-rose-700">- {labels[0]}</span>
						<span className="text-emerald-700">+ {labels[1]}</span>
					</div>
					{diff.body.hunks.map((h, i) => (
						<div key={i}>
							<div className="bg-zinc-100 px-2 text-zinc-500 dark:bg-zinc-800">
								@@ -{h.aStart},{h.aLines} +{h.bStart},{h.bLines} @@
							</div>
							{h.lines.map((l, j) => (
								<div
									key={j}
									className={cn(
										"px-2 whitespace-pre-wrap",
										l.op === "-" &&
											"bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
										l.op === "+" &&
											"bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
									)}
								>
									{l.op} {l.text}
								</div>
							))}
						</div>
					))}
				</div>
			)}
		</div>
	);
};
