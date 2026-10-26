import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, EyeOff, Pause, Play, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useSearchParams } from "wouter";
import { errorMessage } from "@/api/client";
import type { LogKind, LogSummary } from "@/api/contract";
import { KIND_LABEL, useClearLogs, useLogs } from "@/api/queries";
import { IgnoreDialog } from "@/components/IgnoreDialog";
import { LogDetailPanel } from "@/components/LogDetailPanel";
import { Badge, MethodBadge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Toolbar } from "@/components/ui/panel";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/state";
import { clockTime, cn } from "@/lib/utils";

export const KIND_COLOR: Record<LogKind, string> = {
	mock: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
	proxy: "bg-white text-zinc-700 ring-1 ring-zinc-300 ring-inset dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-700",
	pass: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
	miss: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
	error: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
};

const ROW = 32;
/** 表头与行共用的列宽 */
const COLS =
	"grid grid-cols-[72px_64px_minmax(0,1fr)_64px_minmax(0,200px)_104px_52px_56px] items-center gap-2 px-3";
const HINT = "只记录命中的请求与未命中的 fetch / XHR 请求, 不含忽略规则命中的请求";

export const LogsPage = () => {
	const logs = useLogs();
	const clear = useClearLogs();
	const [search, setSearch] = useSearchParams();
	const [paused, setPaused] = useState<LogSummary[] | null>(null);
	const [ignoring, setIgnoring] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);
	const stick = useRef(true);
	const q = search.get("q") || "";
	const kind = search.get("kind") || "";
	const selected = search.get("id");

	const setParam = (key: string, value: string | null) =>
		setSearch(
			prev => {
				const next = new URLSearchParams(prev);
				if (value) next.set(key, value);
				else next.delete(key);
				return next;
			},
			{ replace: true }
		);

	const source = useMemo(() => paused || logs.data || [], [paused, logs.data]);
	const rows = useMemo(
		() =>
			source.filter(
				l =>
					(!kind || l.kind === kind) &&
					(!q ||
						`${l.method} ${l.url} ${l.routeKey || ""} ${l.status}`
							.toLowerCase()
							.includes(q.toLowerCase()))
			),
		[source, kind, q]
	);
	const pending =
		paused && logs.data
			? logs.data.filter(l => Number(l.id) > Number(paused.at(-1)?.id || 0)).length
			: 0;

	const virtual = useVirtualizer({
		count: rows.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => ROW,
		overscan: 12,
	});

	useEffect(() => {
		// 停在底部时跟随新日志滚动
		if (stick.current && rows.length) {
			virtual.scrollToIndex(rows.length - 1, { align: "end" });
		}
	}, [rows.length, virtual]);

	return (
		<div className="flex h-full min-h-0">
			<div className="flex min-w-0 flex-1 flex-col">
				<Toolbar>
					<div className="relative w-64">
						<Search
							size={14}
							className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-zinc-400"
						/>
						<Input
							aria-label="搜索日志"
							className="pl-7"
							placeholder="方法, 地址, 路由或状态码"
							value={q}
							onChange={e => setParam("q", e.target.value)}
						/>
					</div>
					<Select
						aria-label="按类型筛选"
						value={kind}
						onChange={e => setParam("kind", e.target.value)}
					>
						<option value="">全部类型</option>
						{(Object.keys(KIND_LABEL) as LogKind[]).map(k => (
							<option key={k} value={k}>
								{KIND_LABEL[k]}
							</option>
						))}
					</Select>
					<Button
						onClick={() => setPaused(paused ? null : [...(logs.data || [])])}
						aria-pressed={!!paused}
					>
						{paused ? (
							<>
								<Play size={14} />
								继续{pending > 0 && ` (新增 ${pending})`}
							</>
						) : (
							<>
								<Pause size={14} />
								暂停
							</>
						)}
					</Button>
					<Button
						variant="ghost"
						disabled={clear.isPending}
						onClick={() =>
							clear.mutate(undefined, {
								onSuccess: () => {
									setPaused(null);
									setParam("id", null);
									toast.success("日志已清空");
								},
								onError: err => toast.error(errorMessage(err)),
							})
						}
					>
						<Trash2 size={14} />
						清空
					</Button>
					<Button variant="ghost" onClick={() => setIgnoring(true)}>
						<EyeOff size={14} />
						忽略规则
					</Button>
					<span
						className="ml-auto min-w-0 truncate text-xs text-zinc-500"
						title={`共 ${rows.length} 条; ${HINT}`}
					>
						共 {rows.length} 条; {HINT}
					</span>
				</Toolbar>
				<div
					className={cn(
						COLS,
						"h-8 shrink-0 border-b border-zinc-200 bg-zinc-50 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900"
					)}
					role="row"
				>
					<span>时间</span>
					<span>方法</span>
					<span>地址</span>
					<span>类型</span>
					<span>路由</span>
					<span>场景</span>
					<span>状态</span>
					<span className="text-right">耗时</span>
				</div>
				{logs.isPending && <Skeleton />}
				{logs.isError && <ErrorState error={logs.error} onRetry={() => logs.refetch()} />}
				{logs.data && !rows.length && (
					<EmptyState title={source.length ? "没有匹配的日志" : "还没有请求"}>
						{!source.length && "在业务页面中操作后, 请求会实时出现在这里."}
					</EmptyState>
				)}
				<div
					ref={scrollRef}
					role="table"
					aria-label="请求日志"
					className="min-h-0 flex-1 overflow-auto bg-white dark:bg-zinc-900"
					onScroll={e => {
						const el = e.currentTarget;
						stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < ROW * 2;
					}}
				>
					<div style={{ height: virtual.getTotalSize(), position: "relative" }}>
						{virtual.getVirtualItems().map(item => {
							const l = rows[item.index];
							return (
								<div
									key={l.id}
									role="row"
									aria-selected={selected === l.id}
									tabIndex={0}
									onClick={() => setParam("id", l.id)}
									onKeyDown={e => {
										if (e.key === "Enter") {
											setParam("id", l.id);
										}
									}}
									style={{
										position: "absolute",
										top: 0,
										left: 0,
										right: 0,
										height: ROW,
										transform: `translateY(${item.start}px)`,
									}}
									className={cn(
										COLS,
										"cursor-pointer border-b border-zinc-100 dark:border-zinc-800/60",
										selected === l.id
											? "bg-zinc-100 dark:bg-zinc-800"
											: "hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
									)}
								>
									<span className="font-mono text-xs text-zinc-400">
										{clockTime(l.time)}
									</span>
									<span className="flex">
										<MethodBadge method={l.method} />
									</span>
									<span className="truncate font-mono text-xs" title={l.url}>
										{l.url}
									</span>
									<span className="flex">
										<Badge className={KIND_COLOR[l.kind]}>
											{KIND_LABEL[l.kind]}
										</Badge>
									</span>
									<span
										className="truncate font-mono text-xs text-zinc-500"
										title={l.routeKey || undefined}
									>
										{l.routeKey || "—"}
									</span>
									<span
										className="flex min-w-0 items-center gap-0.5 text-zinc-700 dark:text-zinc-300"
										title={
											l.sceneFallback ? "指定的场景不存在, 已降级" : undefined
										}
									>
										<span className="truncate">{l.scene || "—"}</span>
										{l.sceneFallback && (
											<AlertTriangle
												size={12}
												aria-label="已降级"
												className="shrink-0 text-amber-600"
											/>
										)}
									</span>
									<span className="flex">
										<StatusBadge status={l.status} />
									</span>
									<span className="text-right font-mono text-xs text-zinc-400">
										{l.durationMs}ms
									</span>
								</div>
							);
						})}
					</div>
				</div>
			</div>
			{selected && (
				<LogDetailPanel key={selected} id={selected} onClose={() => setParam("id", null)} />
			)}
			<IgnoreDialog open={ignoring} onClose={() => setIgnoring(false)} />
		</div>
	);
};
