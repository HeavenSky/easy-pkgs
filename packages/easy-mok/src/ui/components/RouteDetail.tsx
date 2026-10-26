import { ExternalLink, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { errorMessage } from "@/api/client";
import { useDeleteRoute, useRoute } from "@/api/queries";
import { vscodeLink } from "@/lib/utils";
import { BehaviorPanel } from "./BehaviorPanel";
import { ScenesPanel } from "./ScenesPanel";
import { TryRequest } from "./TryRequest";
import { Badge, MethodBadge } from "./ui/badge";
import { Button } from "./ui/button";
import { ConfirmDialog } from "./ui/dialog";
import { KvList } from "./ui/kv";
import { Panel } from "./ui/panel";
import { ErrorState, Skeleton } from "./ui/state";
import { Tabs } from "./ui/tabs";

const TABS = [
	{ id: "scenes", label: "场景" },
	{ id: "behavior", label: "行为" },
	{ id: "try", label: "试请求" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export const LEVEL_TEXT: Record<string, string> = {
	request: "请求指定",
	browser: "浏览器场景组",
	route: "手动选择",
	group: "全局场景组",
	default: "默认",
};

export const RouteDetail = ({ id }: { id: string }) => {
	const detail = useRoute(id);
	const remove = useDeleteRoute();
	const [, navigate] = useLocation();
	const [tab, setTab] = useState<Tab>("scenes");
	const [confirming, setConfirming] = useState(false);
	if (detail.isPending) {
		return <Skeleton rows={8} />;
	}
	if (detail.isError) {
		return <ErrorState error={detail.error} onRetry={() => detail.refetch()} />;
	}
	const { route, scenes } = detail.data;
	const link = vscodeLink(route.source.file, route.source.line);
	return (
		<div className="space-y-4 p-4">
			<Panel>
				<div className="flex flex-wrap items-center gap-2">
					<span className="flex shrink-0 gap-0.5">
						{route.methods.map(m => (
							<MethodBadge key={m} method={m} />
						))}
					</span>
					<h1 className="min-w-0 font-mono text-lg font-medium break-all">
						{route.path}
					</h1>
					{route.weight !== 0 && <Badge>权重 {route.weight}</Badge>}
					{route.source.type === "gui" && (
						<Button
							size="sm"
							variant="ghost"
							className="ml-auto text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950"
							onClick={() => setConfirming(true)}
						>
							<Trash2 size={12} />
							删除路由
						</Button>
					)}
				</div>
				<KvList
					items={[
						["声明", <span className="font-mono text-xs">{route.key}</span>],
						[
							"来源",
							<>
								{route.source.type === "builtin"
									? "内置路由"
									: route.source.type === "gui"
										? "管理页新建(__gui__.json)"
										: "代码"}
								{link && (
									<a
										href={link}
										className="ml-2 inline-flex items-center gap-1 font-mono text-xs text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900 dark:text-zinc-100 dark:decoration-zinc-600 dark:hover:decoration-zinc-100"
									>
										{route.source.file}
										{route.source.line ? `:${route.source.line}` : ""}
										<ExternalLink size={12} />
									</a>
								)}
							</>,
						],
						[
							"当前生效",
							route.mode === "pass" ? (
								<span className="text-amber-700 dark:text-amber-400">
									放行到真实后端
								</span>
							) : (
								<>
									<b className="font-medium">{route.active.name}</b>
									<span className="ml-1 text-zinc-500">
										({LEVEL_TEXT[route.active.level]})
									</span>
								</>
							),
						],
					]}
				/>
			</Panel>
			<Panel
				tabs={<Tabs inPanel label="路由详情" items={TABS} value={tab} onChange={setTab} />}
			>
				<div role="tabpanel" aria-label={TABS.find(t => t.id === tab)?.label}>
					{tab === "scenes" && <ScenesPanel route={route} scenes={scenes} />}
					{tab === "behavior" && <BehaviorPanel route={route} />}
					{tab === "try" && <TryRequest route={route} />}
				</div>
			</Panel>
			<ConfirmDialog
				open={confirming}
				title="删除路由"
				danger
				confirmText="删除"
				message={
					<>
						确定删除 <code className="font-mono">{route.key}</code> 及其全部 JSON 场景?
						该操作会修改 <code>__gui__.json</code>.
					</>
				}
				onClose={() => setConfirming(false)}
				onConfirm={() =>
					remove.mutate(route.id, {
						onSuccess: () => {
							toast.success("路由已删除");
							navigate("/");
						},
						onError: err => toast.error(errorMessage(err)),
					})
				}
			/>
		</div>
	);
};
