import { RefreshCw, Send, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import { errorMessage } from "@/api/client";
import { DEBUG_NAME_RE, encodeId } from "@/api/debug-contract";
import {
	snapshotRawUrl,
	useDeleteSnapshot,
	useRefreshSnapshot,
	useSaveSnapshot,
	useSnapshot,
	useSnapshotRefs,
	useUpdateSnapshot,
} from "@/api/debug-queries";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/dialog";
import { Input, Label } from "../ui/input";
import { KvList } from "../ui/kv";
import { EditActions, Panel, Section } from "../ui/panel";
import { ErrorState, Spinner } from "../ui/state";
import { DiffView } from "./DiffView";
import { VarsEditor, varsToRecord } from "./KeyValueEditor";
import { NameTitle } from "./DebugTree";
import { ResponseViewer } from "./ResponseViewer";

const LINK =
	"font-mono text-xs text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900 dark:text-zinc-100";

/** 快照详情: 元数据, 快照变量, 回放设置, 原文预览, 删除与按快照重新发送. 设置默认只读, 点「编辑」切到输入框 */
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
	const [editing, setEditing] = useState(false);
	const [name, setName] = useState("");
	const [title, setTitle] = useState("");
	const [weight, setWeight] = useState("0");
	const [vars, setVars] = useState<Array<[string, string]>>([]);
	const [setCookie, setSetCookie] = useState(false);
	const [deleting, setDeleting] = useState(false);
	if (snap.isPending) return <Spinner label="加载快照" />;
	if (snap.isError) return <ErrorState error={snap.error} onRetry={() => snap.refetch()} />;
	const data = snap.data;
	const fail = (err: unknown) => toast.error(errorMessage(err));
	const start = () => {
		setName(data.name);
		setTitle(data.meta.name || "");
		setWeight(String(data.meta.weight || 0));
		setVars(Object.entries(data.meta.vars || {}));
		setSetCookie(data.meta.replay.setCookie);
		setEditing(true);
	};
	const save = () =>
		update.mutate(
			{
				sid,
				patch: {
					...(name !== data.name ? { name } : {}),
					title: title || null,
					weight: Number(weight),
					vars: varsToRecord(vars),
					...(setCookie !== data.meta.replay.setCookie ? { replay: { setCookie } } : {}),
				},
			},
			{
				onSuccess: out => {
					toast.success("快照已保存");
					setEditing(false);
					if (out.id !== sid) onRenamed(out.id);
				},
				onError: fail,
			}
		);
	const varItems = Object.entries(data.meta.vars || {}).map(([k, v]) => [k, v] as const);
	return (
		<Panel
			title={
				<span className="flex min-w-0 items-baseline gap-2">
					<span className="truncate">
						快照 <NameTitle name={data.name} title={data.meta.name || ""} />
					</span>
					<span className="truncate font-mono text-xs font-normal text-zinc-400">
						{data.id}
					</span>
				</span>
			}
			actions={
				<>
					{extra}
					<Button
						size="sm"
						variant="ghost"
						disabled={refresh.isPending}
						onClick={() => refresh.mutate(sid, { onError: fail })}
					>
						<RefreshCw size={12} />
						{refresh.isPending ? "刷新中" : "刷新"}
					</Button>
					<Button size="sm" variant="ghost" onClick={() => onResend(sid)}>
						<Send size={12} />
						按此快照重新发送
					</Button>
					<Button
						size="icon-sm"
						variant="ghost"
						aria-label="删除快照"
						title="删除快照"
						onClick={() => setDeleting(true)}
					>
						<Trash2 size={12} />
					</Button>
				</>
			}
		>
			{refresh.data && (
				<div className="space-y-1.5 rounded-md border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
					<div className="flex min-h-6 items-center gap-2">
						<h3 className="text-xs font-medium text-amber-900 dark:text-amber-200">
							刷新结果与当前快照的差异
						</h3>
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
										{
											hid: refresh.data!.history.id,
											body: {
												request: data.request,
												name: data.name,
												overwrite: true,
											},
										},
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
							刷新失败: {refresh.data.history.meta.error.code}{" "}
							{refresh.data.history.meta.error.message}
						</p>
					) : (
						<DiffView diff={refresh.data.diff} labels={["当前快照", "刷新结果"]} />
					)}
				</div>
			)}
			<Section
				title="快照设置"
				actions={
					<EditActions
						editing={editing}
						onEdit={start}
						onCancel={() => setEditing(false)}
						onSave={save}
						canSave={
							DEBUG_NAME_RE.test(name.normalize("NFC")) &&
							Number.isSafeInteger(Number(weight))
						}
						saving={update.isPending}
						editLabel="编辑快照设置"
						saveLabel="保存快照设置"
					/>
				}
			>
				{editing ? (
					<div className="grid gap-2">
						<div className="flex flex-wrap gap-2">
							<Label className="w-48">
								快照名
								<Input
									className="font-mono text-xs"
									aria-invalid={!DEBUG_NAME_RE.test(name.normalize("NFC"))}
									value={name}
									onChange={e => setName(e.target.value)}
								/>
							</Label>
							<Label className="min-w-40 flex-1">
								展示名
								<Input value={title} onChange={e => setTitle(e.target.value)} />
							</Label>
							<Label className="w-20">
								权重
								<Input
									value={weight}
									aria-invalid={!Number.isSafeInteger(Number(weight))}
									onChange={e => setWeight(e.target.value)}
								/>
							</Label>
						</div>
						<label className="flex items-center gap-1.5 text-sm">
							<input
								type="checkbox"
								checked={setCookie}
								onChange={e => setSetCookie(e.target.checked)}
							/>
							被场景引用回放时带上 set-cookie
						</label>
					</div>
				) : (
					<KvList
						items={[
							["快照名", <code className="font-mono text-xs">{data.name}</code>],
							["展示名", data.meta.name || "—"],
							["权重", data.meta.weight || 0],
							[
								"回放 set-cookie",
								data.meta.replay.setCookie ? "被场景引用回放时带上" : "不带",
							],
						]}
					/>
				)}
			</Section>
			<Section title="快照变量(按此快照重新发送或刷新时覆盖其他层)">
				{editing ? (
					<VarsEditor label="快照变量" vars={vars} onChange={setVars} />
				) : (
					<KvList mono items={varItems} empty="暂无变量" />
				)}
			</Section>
			<Section title="被场景引用">
				{usedBy.length ? (
					<div className="flex flex-wrap gap-x-3 gap-y-1">
						{usedBy.map(u => (
							<Link
								key={`${u.route}-${u.scene}`}
								href={`/routes/${encodeId(u.route)}`}
								className={LINK}
							>
								{u.route} · {u.scene}
							</Link>
						))}
					</div>
				) : (
					<p className="text-xs text-zinc-400">
						无; 在路由的场景面板中点「从调试快照建」即可引用
					</p>
				)}
			</Section>
			<Section title="响应">
				<ResponseViewer meta={data.meta} rawUrl={snapshotRawUrl(sid)} />
			</Section>
			<ConfirmDialog
				open={deleting}
				title="删除快照"
				danger
				confirmText="删除"
				message={
					<>
						确定删除快照「{data.meta.name || data.name}」?
						{usedBy.length > 0 && (
							<>
								{" "}
								有 {usedBy.length} 个场景引用它, 删除后这些场景会降级到下一级场景:{" "}
								{usedBy.map(u => `${u.route} · ${u.scene}`).join(", ")}
							</>
						)}
					</>
				}
				onClose={() => setDeleting(false)}
				onConfirm={() =>
					remove.mutate(
						{ sid, force: usedBy.length > 0 },
						{ onSuccess: onDeleted, onError: fail }
					)
				}
			/>
		</Panel>
	);
};
