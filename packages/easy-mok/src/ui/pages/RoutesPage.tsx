import { FileCode2, Plus, Search } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useLocation, useParams, useSearchParams } from "wouter";
import type { RouteSummary } from "@/api/contract";
import { useMeta, useRoutes } from "@/api/queries";
import { MethodBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { listItemClass, Toolbar } from "@/components/ui/panel";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/state";
import { confirmLeave } from "@/lib/unsaved";
import { cn, relativeTime } from "@/lib/utils";

// 详情与新建表单(react-hook-form)只在选中路由或点新建时加载
const RouteDetail = lazy(() =>
	import("@/components/RouteDetail").then(m => ({ default: m.RouteDetail }))
);
const NewRouteDialog = lazy(() =>
	import("@/components/NewRouteDialog").then(m => ({ default: m.NewRouteDialog }))
);

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "ALL"];

const fileLabel = (r: RouteSummary, folder: string) => {
	if (r.source.type === "builtin") {
		return "内置路由";
	}
	if (!r.source.file) {
		return "未知来源";
	}
	return r.source.file.startsWith(folder)
		? r.source.file.slice(folder.length + 1)
		: r.source.file;
};

export const RoutesPage = () => {
	const { id } = useParams<{ id?: string }>();
	const [, navigate] = useLocation();
	const [search, setSearch] = useSearchParams();
	const routes = useRoutes();
	const meta = useMeta();
	const [creating, setCreating] = useState(false);
	const listRef = useRef<HTMLUListElement>(null);
	const q = search.get("q") || "";
	const method = search.get("method") || "";
	const grouped = search.get("view") === "file";

	const setParam = (key: string, value: string) =>
		setSearch(
			prev => {
				const next = new URLSearchParams(prev);
				if (value) next.set(key, value);
				else next.delete(key);
				return next;
			},
			{ replace: true }
		);

	const filtered = useMemo(
		() =>
			(routes.data || []).filter(
				r =>
					(!q || r.key.toLowerCase().includes(q.toLowerCase())) &&
					(!method || r.methods.includes(method))
			),
		[routes.data, q, method]
	);

	const folder = meta.data?.folder || "";
	const sections = useMemo(() => {
		if (!grouped) {
			return [{ title: "", items: filtered }];
		}
		const map = new Map<string, RouteSummary[]>();
		filtered.forEach(r => {
			const k = fileLabel(r, folder);
			map.set(k, [...(map.get(k) || []), r]);
		});
		return [...map].map(([title, items]) => ({ title, items }));
	}, [filtered, grouped, folder]);

	const select = (routeId: string) => {
		if (routeId === id || !confirmLeave()) {
			return;
		}
		navigate(`/routes/${routeId}${search.toString() ? `?${search}` : ""}`);
	};

	useEffect(() => {
		// 未指定或已被删除时选中第一条
		if (!routes.data?.length) {
			return;
		}
		if (!id || !routes.data.some(r => r.id === id)) {
			navigate(`/routes/${routes.data[0].id}${search.toString() ? `?${search}` : ""}`, {
				replace: true,
			});
		}
	}, [id, routes.data, navigate, search]);

	const onKeyDown = (e: KeyboardEvent) => {
		if (e.key !== "ArrowDown" && e.key !== "ArrowUp") {
			return;
		}
		e.preventDefault();
		const i = filtered.findIndex(r => r.id === id);
		const next =
			filtered[
				Math.min(Math.max(i + (e.key === "ArrowDown" ? 1 : -1), 0), filtered.length - 1)
			];
		if (next) {
			select(next.id);
			listRef.current
				?.querySelector<HTMLElement>(`[data-id="${next.id}"]`)
				?.scrollIntoView({ block: "nearest" });
		}
	};

	return (
		<div className="flex h-full min-h-0">
			<aside className="flex w-56 shrink-0 flex-col border-r border-zinc-200 bg-white lg:w-64 dark:border-zinc-800 dark:bg-zinc-900">
				<Toolbar>
					<div className="relative w-full">
						<Search
							size={14}
							className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-zinc-400"
						/>
						<Input
							aria-label="搜索路由"
							placeholder="搜索方法或路径"
							className="pl-7"
							value={q}
							onChange={e => setParam("q", e.target.value)}
						/>
					</div>
					<Select
						aria-label="按方法筛选"
						className="flex-1"
						value={method}
						onChange={e => setParam("method", e.target.value)}
					>
						<option value="">全部方法</option>
						{METHODS.map(m => (
							<option key={m} value={m}>
								{m}
							</option>
						))}
					</Select>
					<Button
						size="icon"
						variant={grouped ? "default" : "outline"}
						aria-pressed={grouped}
						aria-label="按文件分组"
						title="按文件分组"
						onClick={() => setParam("view", grouped ? "" : "file")}
					>
						<FileCode2 size={14} />
					</Button>
					<Button variant="default" onClick={() => setCreating(true)}>
						<Plus size={14} />
						新建
					</Button>
				</Toolbar>
				<div className="min-h-0 flex-1 overflow-auto">
					{routes.isPending && <Skeleton />}
					{routes.isError && (
						<ErrorState error={routes.error} onRetry={() => routes.refetch()} />
					)}
					{routes.data && !routes.data.length && (
						<EmptyState title="还没有 mock 路由">
							<p>
								在 <code className="font-mono">{folder}</code> 下新建 js 或 json
								文件, 例如:
							</p>
							<pre className="rounded-md border border-zinc-200 bg-zinc-50 p-2 text-left font-mono text-xs dark:border-zinc-800 dark:bg-zinc-800">{`module.exports = {\n  "GET /api/user/:id": { id: 1 },\n};`}</pre>
							<p>或点击上方「新建」直接创建.</p>
						</EmptyState>
					)}
					{routes.data && routes.data.length > 0 && !filtered.length && (
						<EmptyState title="没有匹配的路由" />
					)}
					<ul
						ref={listRef}
						role="listbox"
						aria-label="路由列表"
						tabIndex={0}
						onKeyDown={onKeyDown}
						className="outline-none"
					>
						{sections.map(section => (
							<li
								key={section.title || "all"}
								role={section.title ? "group" : "presentation"}
								aria-label={section.title || undefined}
							>
								{section.title && (
									<div
										aria-hidden="true"
										title={section.title}
										className="sticky top-0 z-10 flex h-6 items-center truncate border-b border-zinc-200 bg-zinc-50 px-3 font-mono text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800"
									>
										{section.title}
									</div>
								)}
								<ul role="presentation" className="contents">
									{section.items.map(r => (
										<li
											key={r.id}
											data-id={r.id}
											role="option"
											aria-selected={r.id === id}
											onClick={() => select(r.id)}
											className={cn(
												listItemClass(r.id === id),
												"cursor-pointer border-b border-zinc-100 px-3 py-1.5 dark:border-zinc-800/60"
											)}
										>
											<div className="flex min-w-0 items-center gap-1.5">
												<span className="flex shrink-0 gap-0.5">
													{r.methods.map(m => (
														<MethodBadge key={m} method={m} />
													))}
												</span>
												<span
													className="min-w-0 truncate font-mono text-xs"
													title={r.path}
												>
													{r.path}
												</span>
												{r.weight !== 0 && <Badge>权重 {r.weight}</Badge>}
											</div>
											<div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs font-normal text-zinc-500">
												<span className="flex min-w-0 items-center gap-2 truncate">
													{r.mode === "pass" ? (
														<Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
															放行
														</Badge>
													) : (
														<span className="truncate">
															场景{" "}
															<b className="font-medium text-zinc-700 dark:text-zinc-300">
																{r.active.name}
															</b>
														</span>
													)}
													{r.delay ? (
														<span className="shrink-0">
															延迟 {r.delay}ms
														</span>
													) : null}
													{r.status ? (
														<span className="shrink-0">
															状态码 {r.status}
														</span>
													) : null}
												</span>
												<span
													className="ml-auto shrink-0 text-zinc-400"
													title={
														r.lastHit
															? new Date(r.lastHit).toLocaleString()
															: undefined
													}
												>
													{r.hits} 次 · {relativeTime(r.lastHit)}
												</span>
											</div>
										</li>
									))}
								</ul>
							</li>
						))}
					</ul>
				</div>
			</aside>
			<section className="min-w-0 flex-1 overflow-auto bg-zinc-50 dark:bg-zinc-950">
				{id && routes.data?.some(r => r.id === id) ? (
					<Suspense fallback={<Skeleton rows={8} />}>
						<RouteDetail key={id} id={id} />
					</Suspense>
				) : (
					!routes.isPending && <EmptyState title="选择左侧的一个路由" />
				)}
			</section>
			{creating && (
				<Suspense fallback={null}>
					<NewRouteDialog
						open
						onClose={() => setCreating(false)}
						onCreated={routeId => navigate(`/routes/${routeId}`)}
					/>
				</Suspense>
			)}
		</div>
	);
};
