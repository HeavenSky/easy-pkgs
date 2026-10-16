import { ExternalLink, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { errorMessage } from "@/api/client";
import { useDeleteRoute, useRoute } from "@/api/queries";
import { cn, vscodeLink } from "@/lib/utils";
import { BehaviorPanel } from "./BehaviorPanel";
import { ScenesPanel } from "./ScenesPanel";
import { TryRequest } from "./TryRequest";
import { Badge, MethodBadge } from "./ui/badge";
import { Button } from "./ui/button";
import { ConfirmDialog } from "./ui/dialog";
import { ErrorState, Skeleton } from "./ui/state";

const TABS = [
	{ id: "scenes", label: "场景" },
	{ id: "behavior", label: "行为" },
	{ id: "try", label: "试请求" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export const LEVEL_TEXT: Record<string, string> = {
	request: "请求指定", browser: "浏览器场景组", route: "手动选择", group: "全局场景组", default: "默认",
};

export const RouteDetail = ({ id }: { id: string }) => {
	const detail = useRoute(id);
	const remove = useDeleteRoute();
	const [, navigate] = useLocation();
	const [tab, setTab] = useState<Tab>("scenes");
	const [confirming, setConfirming] = useState(false);
	if (detail.isPending) { return <Skeleton rows={8} />; }
	if (detail.isError) { return <ErrorState error={detail.error} onRetry={() => detail.refetch()} />; }
	const { route, scenes } = detail.data;
	const link = vscodeLink(route.source.file, route.source.line);
	return (
		<div className="mx-auto max-w-5xl space-y-4 p-5">
			<div className="space-y-2">
				<div className="flex flex-wrap items-center gap-2">
					{route.methods.map(m => <MethodBadge key={m} method={m} />)}
					<h1 className="font-mono text-base font-semibold break-all">{route.path}</h1>
					{route.weight !== 0 && <Badge className="bg-zinc-100 dark:bg-zinc-800">权重 {route.weight}</Badge>}
					{route.source.type === "gui" && (
						<Button size="sm" variant="ghost" className="ml-auto text-rose-600" onClick={() => setConfirming(true)}><Trash2 size={14} />删除路由</Button>
					)}
				</div>
				<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
					<dt>声明</dt><dd className="font-mono">{route.key}</dd>
					<dt>来源</dt>
					<dd>
						{route.source.type === "builtin" ? "内置路由" : route.source.type === "gui" ? "管理页新建(__gui__.json)" : "代码"}
						{link && <a href={link} className="ml-2 inline-flex items-center gap-1 font-mono text-sky-600 hover:underline">{route.source.file}{route.source.line ? `:${route.source.line}` : ""}<ExternalLink size={12} /></a>}
					</dd>
					<dt>当前生效</dt>
					<dd>
						{route.mode === "pass" ? <span className="text-amber-600">放行到真实后端</span> : (
							<><b className="text-zinc-900 dark:text-zinc-100">{route.active.name}</b><span className="ml-1">({LEVEL_TEXT[route.active.level]})</span></>
						)}
					</dd>
				</dl>
			</div>
			<div role="tablist" aria-label="路由详情" className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
				{TABS.map(t => (
					<button
						key={t.id}
						role="tab"
						aria-selected={tab === t.id}
						onClick={() => setTab(t.id)}
						className={cn("-mb-px border-b-2 px-3 py-1.5 text-sm", tab === t.id ? "border-sky-600 font-medium" : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200")}
					>{t.label}</button>
				))}
			</div>
			<div role="tabpanel">
				{tab === "scenes" && <ScenesPanel route={route} scenes={scenes} />}
				{tab === "behavior" && <BehaviorPanel route={route} />}
				{tab === "try" && <TryRequest route={route} />}
			</div>
			<ConfirmDialog
				open={confirming}
				title="删除路由"
				danger
				confirmText="删除"
				message={<>确定删除 <code className="font-mono">{route.key}</code> 及其全部 JSON 场景? 该操作会修改 <code>__gui__.json</code>.</>}
				onClose={() => setConfirming(false)}
				onConfirm={() => remove.mutate(route.id, {
					onSuccess: () => { toast.success("路由已删除"); navigate("/"); },
					onError: err => toast.error(errorMessage(err)),
				})}
			/>
		</div>
	);
};
