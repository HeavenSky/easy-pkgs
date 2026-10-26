import { AlertTriangle, Wifi } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import type { LanInfo } from "@/api/contract";
import { useSetLan } from "@/api/queries";
import { Notice } from "./ui/state";
import { Switch } from "./ui/switch";

const UNREACHABLE =
	"宿主只监听本机地址, 局域网设备连不上; 请让 dev server 监听局域网地址(如 vite --host), standalone 模式会自动额外监听";

/** 页头的局域网访问开关; 只有本机打开的管理页可以切换 */
export const LanControl = ({ lan }: { lan: LanInfo }) => {
	const set = useSetLan();
	return (
		<div className="flex items-center gap-1.5">
			<span className="text-xs text-zinc-500">局域网</span>
			<Switch
				label="允许局域网访问"
				checked={lan.access}
				disabled={set.isPending || !lan.canToggle}
				onChange={access =>
					set.mutate(
						{ access },
						{
							onSuccess: () =>
								toast.success(access ? "已允许局域网访问" : "已关闭局域网访问"),
							onError: err => toast.error(errorMessage(err)),
						}
					)
				}
			/>
			{lan.access && (
				<>
					<span className="ml-1 text-xs text-zinc-500">代发</span>
					<Switch
						label="允许局域网代发"
						checked={lan.send}
						disabled={set.isPending || !lan.canToggle}
						onChange={send =>
							set.mutate(
								{ send },
								{
									onSuccess: () =>
										toast.success(
											send ? "已允许局域网代发" : "已关闭局域网代发"
										),
									onError: err => toast.error(errorMessage(err)),
								}
							)
						}
					/>
				</>
			)}
			{!lan.canToggle && (
				<span
					className="text-xs text-zinc-400"
					title="局域网开关只能在本机打开的管理页中切换"
				>
					仅本机可切换
				</span>
			)}
			{lan.access && lan.reachable === "no" && (
				<span
					title={UNREACHABLE}
					className="flex items-center gap-1 text-xs text-amber-700"
				>
					<AlertTriangle size={12} />
					局域网不可达
				</span>
			)}
		</div>
	);
};

/** 局域网访问打开期间的常驻提示 */
export const LanBanner = ({ lan }: { lan: LanInfo }) =>
	lan.access ? (
		<Notice tone="info" icon={<Wifi size={12} className="shrink-0" />} className="flex-wrap">
			已允许局域网访问: 同一局域网的设备可以打开管理页并跨域读取 mock 响应.
			{lan.send && (
				<span className="font-medium">已允许局域网代发: 局域网设备可以借本机发出请求.</span>
			)}
			{lan.listening.length > 0 && <span>局域网地址: {lan.listening.join(", ")}</span>}
			{lan.reachable === "no" && <span className="text-amber-700">{UNREACHABLE}</span>}
			{lan.errors.length > 0 && (
				<span className="text-amber-700">部分地址监听失败: {lan.errors.join("; ")}</span>
			)}
		</Notice>
	) : null;
