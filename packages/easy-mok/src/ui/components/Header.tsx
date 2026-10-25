import { AlertTriangle, Boxes } from "lucide-react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { errorMessage } from "@/api/client";
import type { Meta } from "@/api/contract";
import type { LiveStatus } from "@/api/live";
import { useGroups, usePatchState } from "@/api/queries";
import { cn } from "@/lib/utils";
import { LanControl } from "./LanControl";
import { Select } from "./ui/input";
import { Switch } from "./ui/switch";

const NAV = [
	{ href: "/", label: "路由", match: (p: string) => p === "/" || p.startsWith("/routes") },
	{ href: "/logs", label: "请求日志", match: (p: string) => p.startsWith("/logs") },
	{ href: "/groups", label: "场景组", match: (p: string) => p.startsWith("/groups") },
	{ href: "/diagnostics", label: "诊断", match: (p: string) => p.startsWith("/diagnostics") },
];

const LIVE_TEXT: Record<LiveStatus, string> = {
	connecting: "连接中",
	open: "实时连接正常",
	reconnecting: "连接中断, 重连中",
};

export const Header = ({ meta, live }: { meta: Meta; live: LiveStatus }) => {
	const [location] = useLocation();
	const groups = useGroups();
	const patch = usePatchState();
	const update = (body: Parameters<typeof patch.mutate>[0], ok: string) =>
		patch.mutate(body, {
			onSuccess: () => toast.success(ok),
			onError: err => toast.error(errorMessage(err)),
		});
	const issues = meta.diagnostics.length;
	return (
		<header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
			<div className="flex items-center gap-2 font-semibold">
				<Boxes size={18} className="text-sky-600" />
				easy-mok
				<span className="text-xs font-normal text-zinc-500">v{meta.version}</span>
			</div>
			<nav aria-label="主导航" className="flex gap-1">
				{NAV.map(item => (
					<Link
						key={item.href}
						href={item.href}
						aria-current={item.match(location) ? "page" : undefined}
						className={cn(
							"rounded-md px-2.5 py-1 text-sm",
							item.match(location)
								? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
								: "hover:bg-zinc-100 dark:hover:bg-zinc-800"
						)}
					>
						{item.label}
						{item.href === "/diagnostics" && issues > 0 && (
							<span className="ml-1 rounded-full bg-amber-500 px-1.5 text-[10px] text-white">
								{issues}
							</span>
						)}
					</Link>
				))}
			</nav>
			<div className="ml-auto flex flex-wrap items-center gap-4 text-sm">
				<label className="flex items-center gap-2">
					<span className="text-zinc-500">全局场景组</span>
					<Select
						aria-label="全局场景组"
						value={meta.group || ""}
						disabled={patch.isPending || meta.readOnly}
						onChange={e =>
							update(
								{ group: e.target.value || null },
								e.target.value
									? `已切换到场景组「${e.target.value}」`
									: "已取消全局场景组"
							)
						}
					>
						<option value="">不使用</option>
						{Object.keys(groups.data?.groups || {}).map(name => (
							<option key={name} value={name}>
								{name}
							</option>
						))}
					</Select>
				</label>
				<div className="flex items-center gap-2">
					<span className="text-zinc-500">mock</span>
					<Switch
						label="全局 mock 开关"
						checked={meta.enabled.state}
						disabled={patch.isPending || meta.readOnly}
						onChange={enabled =>
							update(
								{ enabled },
								enabled ? "已开启 mock" : "已关闭 mock, 请求全部放行"
							)
						}
					/>
					{!meta.enabled.code && (
						<span
							title="mock 文件中声明了 MOCK: false"
							className="flex items-center gap-1 text-xs text-amber-600"
						>
							<AlertTriangle size={14} />
							代码中已关闭
						</span>
					)}
				</div>
				<LanControl lan={meta.lan} />
				<span
					title={LIVE_TEXT[live]}
					aria-label={LIVE_TEXT[live]}
					className={cn(
						"h-2.5 w-2.5 rounded-full",
						live === "open"
							? "bg-emerald-500"
							: live === "connecting"
								? "bg-zinc-400"
								: "animate-pulse bg-amber-500"
					)}
				/>
			</div>
			{meta.readOnly && (
				<p className="w-full text-xs text-amber-600">
					状态文件版本高于当前 easy-mok, 已以只读方式运行, 改动不会保存.
				</p>
			)}
		</header>
	);
};
