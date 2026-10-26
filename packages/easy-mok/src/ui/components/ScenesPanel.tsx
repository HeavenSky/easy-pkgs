import { Camera, Copy, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import type { Envelope, RouteSummary, SceneDetail } from "@/api/contract";
import { encodeId } from "@/api/debug-contract";
import { useDeleteScene, usePatchRouteState } from "@/api/queries";
import { confirmLeave } from "@/lib/unsaved";
import { cn, pretty } from "@/lib/utils";
import { BodyFilePanel } from "./BodyFilePanel";
import { FromSnapshotDialog } from "./FromSnapshotDialog";
import { JsonEditor } from "./JsonEditor";
import { SceneEditor } from "./SceneEditor";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Hint } from "./ui/input";
import { Section } from "./ui/panel";
import { ConfirmDialog } from "./ui/dialog";

const KIND_TEXT: Record<SceneDetail["kind"], string> = {
	data: "数据",
	function: "函数",
	proxy: "代理",
	envelope: "JSON",
	nullary: "无参函数",
	script: "脚本",
	ref: "引用快照",
};
const KIND_TITLE: Partial<Record<SceneDetail["kind"], string>> = {
	nullary:
		"尚未被请求过; 首次请求后按返回值显示为「函数」(返回数据)或「代理」(返回含 target / router 的对象)",
	script: "在管理页编写的处理函数, 写法同 mock 文件中的 (req, res, next) => ...",
	ref: "返回调试快照的最新内容; 快照失效时降级到下一级场景",
};

/** 行内操作: 悬停或聚焦行时显示, 用 opacity 保持键盘可达 */
const ROW_ACTION =
	"opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100";

/** 快照标识 → 调试页地址 */
const snapshotHref = (sid: string) => {
	const i = sid.lastIndexOf("#");
	return `/debug/req/${encodeId(sid.slice(0, i))}/snap/${encodeId(sid.slice(i + 1))}`;
};

type Panel =
	| { type: "view"; name: string }
	| { type: "edit"; name: string }
	| { type: "file"; name: string }
	| { type: "new"; initial?: Envelope; name?: string }
	| { type: "snapshot"; name?: string; snapshot?: string }
	| null;

export const ScenesPanel = ({ route, scenes }: { route: RouteSummary; scenes: SceneDetail[] }) => {
	const patch = usePatchRouteState();
	const remove = useDeleteScene();
	const [panel, setPanel] = useState<Panel>(null);
	const [deleting, setDeleting] = useState<SceneDetail | null>(null);
	const manual = route.active.level === "route" ? route.active.name : null;
	const open = (next: Panel) => {
		if (confirmLeave()) {
			setPanel(next);
		}
	};
	const choose = (scene: string | null) =>
		patch.mutate(
			{ id: route.id, patch: { scene } },
			{
				onSuccess: () =>
					toast.success(scene ? `已切换到场景「${scene}」` : "已取消手动选择"),
				onError: err => toast.error(errorMessage(err)),
			}
		);
	const current =
		panel && "name" in panel && panel.name
			? scenes.find(s => s.name === panel.name)
			: undefined;

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-2">
				<Hint className="min-w-0 flex-1">
					选中即生效并持久保存; 请求头 <code className="font-mono">x-mock-scene</code>,
					查询参数 <code className="font-mono">__scene</code> 与浏览器场景组的优先级更高.
				</Hint>
				<Button onClick={() => open({ type: "snapshot" })}>
					<Camera size={14} />
					从调试快照建
				</Button>
				<Button variant="default" onClick={() => open({ type: "new" })}>
					<Plus size={14} />
					新建场景
				</Button>
			</div>
			<ul
				role="radiogroup"
				aria-label="场景"
				className="divide-y divide-zinc-100 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800"
			>
				<li className="flex min-h-8 items-center gap-1.5 px-3 py-1">
					<label className="flex flex-1 cursor-pointer items-center gap-1.5">
						<input
							type="radio"
							name="scene"
							className="accent-zinc-900 dark:accent-zinc-100"
							checked={!manual}
							disabled={patch.isPending}
							onChange={() => choose(null)}
						/>
						<span className="text-zinc-500 dark:text-zinc-400">
							不手动选择(跟随场景组, 否则用 default)
						</span>
					</label>
				</li>
				{scenes.map(s => (
					<li
						key={s.name}
						className={cn(
							"group flex min-h-8 items-center gap-1.5 px-3 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800/60",
							route.active.name === s.name &&
								route.mode === "mock" &&
								"bg-emerald-50/60 dark:bg-emerald-950/20"
						)}
					>
						<label className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5">
							<input
								type="radio"
								name="scene"
								className="accent-zinc-900 dark:accent-zinc-100"
								checked={manual === s.name}
								disabled={patch.isPending}
								onChange={() => choose(s.name)}
							/>
							<span className="truncate font-medium">{s.name}</span>
							<span className="flex shrink-0 gap-0.5">
								<Badge title={KIND_TITLE[s.kind]}>{KIND_TEXT[s.kind]}</Badge>
								<Badge
									className={
										s.source === "json"
											? "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200"
											: undefined
									}
								>
									{s.source === "json" ? "管理页" : "代码"}
								</Badge>
							</span>
							{s.ref && (
								<Link
									href={snapshotHref(s.ref.snapshot)}
									className={cn(
										"truncate font-mono text-xs underline-offset-2 hover:underline",
										s.ref.broken
											? "text-rose-600"
											: "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
									)}
									title={
										s.ref.broken
											? "快照不存在或不可用, 请求时会降级到下一级场景"
											: "打开调试页中的快照"
									}
								>
									{s.ref.snapshot}
									{s.ref.broken && " (失效)"}
								</Link>
							)}
							{s.bodyFile && (
								<Badge title={`__scenes__/${s.bodyFile.path}`}>文件</Badge>
							)}
							{s.overrides && (
								<Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
									覆盖代码同名场景
								</Badge>
							)}
							{route.active.name === s.name && route.mode === "mock" && (
								<span className="shrink-0 text-xs text-emerald-700 dark:text-emerald-400">
									当前生效
								</span>
							)}
						</label>
						{s.editable ? (
							<>
								<Button
									size="icon-sm"
									variant="ghost"
									className={ROW_ACTION}
									aria-label={`编辑场景 ${s.name}`}
									title={`编辑场景 ${s.name}`}
									onClick={() =>
										open(
											s.ref
												? {
														type: "snapshot",
														name: s.name,
														snapshot: s.ref.snapshot,
													}
												: {
														type: s.bodyFile ? "file" : "edit",
														name: s.name,
													}
										)
									}
								>
									<Pencil size={12} />
								</Button>
								<Button
									size="icon-sm"
									variant="ghost"
									className={ROW_ACTION}
									aria-label={`删除场景 ${s.name}`}
									title={`删除场景 ${s.name}`}
									onClick={() => setDeleting(s)}
								>
									<Trash2 size={12} />
								</Button>
							</>
						) : (
							<>
								<Button
									size="icon-sm"
									variant="ghost"
									className={ROW_ACTION}
									aria-label={`查看场景 ${s.name}`}
									title={`查看场景 ${s.name}`}
									onClick={() => open({ type: "view", name: s.name })}
								>
									<Eye size={12} />
								</Button>
								{s.kind === "data" && (
									<Button
										size="icon-sm"
										variant="ghost"
										className={ROW_ACTION}
										aria-label={`另存场景 ${s.name} 为 JSON`}
										title="另存为 JSON 场景后可在管理页编辑"
										onClick={() =>
											open({
												type: "new",
												name: s.name,
												initial: { status: 200, body: s.content },
											})
										}
									>
										<Copy size={12} />
									</Button>
								)}
							</>
						)}
					</li>
				))}
			</ul>
			{panel?.type === "view" && current && (
				<Section
					title={`场景「${current.name}」(只读, 在 mock 源文件中修改)`}
					actions={
						<Button size="sm" variant="ghost" onClick={() => setPanel(null)}>
							收起
						</Button>
					}
				>
					{current.kind === "data" ? (
						<JsonEditor
							label={`场景 ${current.name} 内容`}
							value={pretty(current.content)}
							readOnly
							height="240px"
						/>
					) : (
						<pre className="max-h-72 overflow-auto rounded-md border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs dark:border-zinc-800 dark:bg-zinc-800">
							{(current.content as { source?: string })?.source}
						</pre>
					)}
				</Section>
			)}
			{panel?.type === "snapshot" && (
				<FromSnapshotDialog
					route={route}
					initial={
						panel.name ? { name: panel.name, snapshot: panel.snapshot } : undefined
					}
					onClose={() => setPanel(null)}
				/>
			)}
			{panel?.type === "file" && current?.bodyFile && (
				<BodyFilePanel
					key={`file-${current.name}`}
					route={route}
					scene={current}
					onClose={() => setPanel(null)}
				/>
			)}
			{panel?.type === "edit" && current && (
				<SceneEditor
					key={`edit-${current.name}`}
					route={route}
					scene={current}
					scenes={scenes}
					onDone={() => setPanel(null)}
				/>
			)}
			{panel?.type === "new" && (
				<SceneEditor
					key={`new-${panel.name || ""}`}
					route={route}
					scenes={scenes}
					initial={panel.initial}
					initialName={panel.name}
					onDone={() => setPanel(null)}
				/>
			)}
			<ConfirmDialog
				open={!!deleting}
				title="删除场景"
				danger
				confirmText="删除"
				message={
					<>
						确定删除场景「{deleting?.name}」?{" "}
						{deleting?.overrides && "删除后代码中的同名场景重新生效."}
					</>
				}
				onClose={() => setDeleting(null)}
				onConfirm={() =>
					deleting &&
					remove.mutate(
						{ id: route.id, name: deleting.name, etag: deleting.etag },
						{
							onSuccess: () => {
								toast.success("场景已删除");
								if (panel && "name" in panel && panel.name === deleting.name) {
									setPanel(null);
								}
							},
							onError: err => toast.error(errorMessage(err)),
						}
					)
				}
			/>
		</div>
	);
};
