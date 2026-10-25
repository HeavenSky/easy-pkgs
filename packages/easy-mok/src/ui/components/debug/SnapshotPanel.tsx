import { Send, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import { DEBUG_NAME_RE } from "@/api/debug-contract";
import {
	snapshotRawUrl,
	useDeleteSnapshot,
	useRefreshSnapshot,
	useSaveSnapshot,
	useSnapshot,
	useSnapshotRefs,
	useUpdateSnapshot,
} from "@/api/debug-queries";
import { DiffView } from "./DiffView";
import { RefreshCw } from "lucide-react";
import { encodeId } from "@/api/debug-contract";
import { Link } from "wouter";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/dialog";
import { Input, Label } from "../ui/input";
import { ErrorState, Spinner } from "../ui/state";
import { VarsEditor, varsToRecord } from "./KeyValueEditor";
import { ResponseViewer } from "./ResponseViewer";

/** 快照详情: 元数据, 快照变量, 回放设置, 原文预览, 删除与按快照重新发送 */
export const SnapshotPanel = ({
	sid,
	onRenamed,
	onDeleted,
	onResend,
	extra,
}: {
	sid: string;
	onRenamed: (sid: string) => void;
	onDeleted: () => void;
	onResend: (sid: string) => void;
	extra?: ReactNode;
}) => {
	const snap = useSnapshot(sid);
	const refs = useSnapshotRefs(sid);
	const refresh = useRefreshSnapshot();
	const overwrite = useSaveSnapshot();
	const usedBy = refs.data || [];
	const update = useUpdateSnapshot();
	const remove = useDeleteSnapshot();
	const [name, setName] = useState("");
	const [title, setTitle] = useState("");
	const [weight, setWeight] = useState("0");
	const [vars, setVars] = useState<Array<[string, string]>>([]);
	const [deleting, setDeleting] = useState(false);
	useEffect(() => {
		if (!snap.data) return;
		setName(snap.data.name);
		setTitle(snap.data.meta.name || "");
		setWeight(String(snap.data.meta.weight || 0));
		setVars(Object.entries(snap.data.meta.vars || {}));
	}, [snap.data]);
	if (snap.isPending) return <Spinner label="加载快照" />;
	if (snap.isError) return <ErrorState error={snap.error} onRetry={() => snap.refetch()} />;
	const data = snap.data;
	const fail = (err: unknown) => toast.error(errorMessage(err));
	const save = () =>
		update.mutate(
			{
				sid,
				patch: {
					...(name !== data.name ? { name } : {}),
					title: title || null,
					weight: Number(weight),
					vars: varsToRecord(vars),
				},
			},
			{
				onSuccess: out => {
					toast.success("快照已保存");
					if (out.id !== sid) onRenamed(out.id);
				},
				onError: fail,
			}
		);
	return (
		<div className="space-y-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
			<div className="flex items-center gap-2 text-sm font-medium">
				快照「{data.meta.name || data.name}」
				<span className="font-mono text-xs text-zinc-400">{data.id}</span>
				<span className="ml-auto flex gap-1">
					{extra}
					<Button size="sm" disabled={refresh.isPending} onClick={() => refresh.mutate(sid, { onError: fail })}>
						<RefreshCw size={14} />
						{refresh.isPending ? "刷新中" : "刷新"}
					</Button>
					<Button size="sm" onClick={() => onResend(sid)}>
						<Send size={14} />
						按此快照重新发送
					</Button>
					<Button size="icon" variant="ghost" aria-label="删除快照" onClick={() => setDeleting(true)}>
						<Trash2 size={14} />
					</Button>
				</span>
			</div>
			{refresh.data && (
				<div className="space-y-2 rounded-md border border-amber-300 bg-amber-50/50 p-2 dark:border-amber-800 dark:bg-amber-950/30">
					<div className="flex items-center gap-2 text-sm font-medium">
						刷新结果与当前快照的差异
						<span className="ml-auto flex gap-1">
							<Button size="sm" onClick={() => refresh.reset()}>
								放弃
							</Button>
							<Button
								size="sm"
								variant="default"
								disabled={overwrite.isPending || !!refresh.data.history.meta.error}
								onClick={() =>
									overwrite.mutate(
										{ hid: refresh.data!.history.id, body: { request: data.request, name: data.name, overwrite: true } },
										{
											onSuccess: () => {
												toast.success("快照已更新");
												refresh.reset();
											},
											onError: fail,
										}
									)
								}
							>
								用新结果覆盖快照
							</Button>
						</span>
					</div>
					{refresh.data.history.meta.error ? (
						<p className="text-sm text-rose-600">
							刷新失败: {refresh.data.history.meta.error.code} {refresh.data.history.meta.error.message}
						</p>
					) : (
						<DiffView diff={refresh.data.diff} labels={["当前快照", "刷新结果"]} />
					)}
				</div>
			)}
			<div className="flex flex-wrap gap-2">
				<Label className="w-40">
					快照名
					<Input className="font-mono" value={name} onChange={e => setName(e.target.value)} />
				</Label>
				<Label className="flex-1">
					展示名
					<Input value={title} onChange={e => setTitle(e.target.value)} />
				</Label>
				<Label className="w-24">
					权重
					<Input value={weight} onChange={e => setWeight(e.target.value)} />
				</Label>
			</div>
			<div className="space-y-1">
				<div className="text-xs font-medium text-zinc-500">快照变量(按此快照重新发送或刷新时覆盖其他层)</div>
				<VarsEditor label="快照变量" vars={vars} onChange={setVars} />
			</div>
			<div className="flex flex-wrap items-center gap-3">
				<label className="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						checked={data.meta.replay.setCookie}
						onChange={e => update.mutate({ sid, patch: { replay: { setCookie: e.target.checked } } }, { onError: fail })}
					/>
					被场景引用回放时带上 set-cookie
				</label>
				<Button
					size="sm"
					variant="default"
					className="ml-auto"
					disabled={update.isPending || !DEBUG_NAME_RE.test(name.normalize("NFC")) || !Number.isSafeInteger(Number(weight))}
					onClick={save}
				>
					保存快照设置
				</Button>
			</div>
			<div className="text-xs">
				<span className="text-zinc-500">被场景引用: </span>
				{usedBy.length ? (
					usedBy.map(u => (
						<Link key={`${u.route}-${u.scene}`} href={`/routes/${encodeId(u.route)}`} className="mr-2 font-mono text-sky-700 hover:underline">
							{u.route} · {u.scene}
						</Link>
					))
				) : (
					<span className="text-zinc-400">无; 在路由的场景面板中点「从调试快照建」即可引用</span>
				)}
			</div>
			<ResponseViewer meta={data.meta} rawUrl={snapshotRawUrl(sid)} />
			<ConfirmDialog
				open={deleting}
				title="删除快照"
				danger
				confirmText="删除"
				message={
					<>
						确定删除快照「{data.meta.name || data.name}」?
						{usedBy.length > 0 && <> 有 {usedBy.length} 个场景引用它, 删除后这些场景会降级到下一级场景: {usedBy.map(u => `${u.route} · ${u.scene}`).join(", ")}</>}
					</>
				}
				onClose={() => setDeleting(false)}
				onConfirm={() => remove.mutate({ sid, force: usedBy.length > 0 }, { onSuccess: onDeleted, onError: fail })}
			/>
		</div>
	);
};
