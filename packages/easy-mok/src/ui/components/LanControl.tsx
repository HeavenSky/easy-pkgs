import { AlertTriangle, Wifi } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import type { LanInfo } from "@/api/contract";
import { useSetLan } from "@/api/queries";
import { Switch } from "./ui/switch";

const UNREACHABLE =
	"宿主只监听本机地址, 局域网设备连不上; 请让 dev server 监听局域网地址(如 vite --host), standalone 模式会自动额外监听";

/** 页头的局域网访问开关; 只有本机打开的管理页可以切换 */
export const LanControl = ({ lan }: { lan: LanInfo }) => {
	const set = useSetLan();
	return (
		<div className="flex items-center gap-2">
			<span className="text-zinc-500">局域网</span>
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
			{!lan.canToggle && (
				<span className="text-xs text-zinc-500" title="局域网开关只能在本机打开的管理页中切换">
					仅本机可切换
				</span>
			)}
			{lan.access && lan.reachable === "no" && (
				<span title={UNREACHABLE} className="flex items-center gap-1 text-xs text-amber-600">
					<AlertTriangle size={14} />
					局域网不可达
				</span>
			)}
		</div>
	);
};

/** 局域网访问打开期间的常驻提示 */
export const LanBanner = ({ lan }: { lan: LanInfo }) =>
	lan.access ? (
		<div
			role="status"
			className="flex flex-wrap items-center gap-2 bg-sky-100 px-4 py-1.5 text-xs text-sky-900 dark:bg-sky-950 dark:text-sky-200"
		>
			<Wifi size={14} />
			已允许局域网访问: 同一局域网的设备可以打开管理页并跨域读取 mock 响应.
			{lan.listening.length > 0 && <span>局域网地址: {lan.listening.join(", ")}</span>}
			{lan.reachable === "no" && <span className="text-amber-700">{UNREACHABLE}</span>}
			{lan.errors.length > 0 && (
				<span className="text-amber-700">部分地址监听失败: {lan.errors.join("; ")}</span>
			)}
		</div>
	) : null;
