import { Camera, Cookie, Globe, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";
import { errorMessage } from "@/api/client";
import { NAME_RE } from "@/api/contract";
import { useDeleteGroup, useGroups, usePatchState, usePutGroup, useRenameGroup, useRoutes, useSnapshotGroup } from "@/api/queries";
import { MethodBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/state";
import { useUnsaved } from "@/lib/unsaved";
import { cn } from "@/lib/utils";

const COOKIE = "__mock_group";

export const readBrowserGroup = () => {
	const hit = document.cookie.split(";").map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`));
	return hit ? decodeURIComponent(hit.slice(COOKIE.length + 1)) : null;
};

export const writeBrowserGroup = (name: string | null) => {
	document.cookie = name
		? `${COOKIE}=${encodeURIComponent(name)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
		: `${COOKIE}=; path=/; max-age=0`;
};

type NameDialog = { type: "new" | "snapshot" | "rename"; from?: string } | null;

export const GroupsPage = () => {
	const { name: selected } = useParams<{ name?: string }>();
	const [, navigate] = useLocation();
	const groups = useGroups();
	const routes = useRoutes();
	const put = usePutGroup();
	const rename = useRenameGroup();
	const del = useDeleteGroup();
	const snapshot = useSnapshotGroup();
	const patchState = usePatchState();
	const [browserGroup, setBrowserGroup] = useState(readBrowserGroup);
	const [dialog, setDialog] = useState<NameDialog>(null);
	const [nameInput, setNameInput] = useState("");
	const [deleting, setDeleting] = useState<string | null>(null);
	const current = selected ? decodeURIComponent(selected) : null;
	const saved = current ? groups.data?.groups[current] : undefined;
	const [draft, setDraft] = useState<Record<string, string>>({});
	useEffect(() => { setDraft(saved || {}); }, [saved]);
	const dirty = !!saved && JSON.stringify(draft) !== JSON.stringify(saved);
	useUnsaved(dirty);

	const names = Object.keys(groups.data?.groups || {});
	const multiScene = useMemo(() => (routes.data || []).filter(r => r.scenes.length > 1 || draft[r.id]), [routes.data, draft]);
	const fail = (err: unknown) => toast.error(errorMessage(err));
	const nameError = !nameInput ? "" : !NAME_RE.test(nameInput) ? "只能包含字母, 数字, 下划线与连字符" : names.includes(nameInput) && dialog?.from !== nameInput ? "已存在同名场景组" : "";

	const submitName = () => {
		if (!dialog || !nameInput || nameError) { return; }
		const done = () => { setDialog(null); navigate(`/groups/${encodeURIComponent(nameInput)}`); };
		if (dialog.type === "new") { put.mutate({ name: nameInput, map: {} }, { onSuccess: () => { toast.success("已新建场景组"); done(); }, onError: fail }); }
		if (dialog.type === "snapshot") { snapshot.mutate({ name: nameInput }, { onSuccess: () => { toast.success("已按当前选择生成场景组"); done(); }, onError: fail }); }
		if (dialog.type === "rename" && dialog.from) {
			rename.mutate({ name: dialog.from, to: nameInput }, {
				onSuccess: () => {
					if (browserGroup === dialog.from) { writeBrowserGroup(nameInput); setBrowserGroup(nameInput); }
					toast.success("已重命名"); done();
				},
				onError: fail,
			});
		}
	};

	if (groups.isPending || routes.isPending) { return <Skeleton />; }
	if (groups.isError) { return <ErrorState error={groups.error} onRetry={() => groups.refetch()} />; }

	return (
		<div className="flex h-full min-h-0">
			<aside className="flex w-72 shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
				<div className="flex gap-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
					<Button size="sm" variant="default" onClick={() => { setNameInput(""); setDialog({ type: "new" }); }}><Plus size={14} />新建</Button>
					<Button size="sm" title="把各路由当前生效的非 default 场景保存为一个组" onClick={() => { setNameInput(""); setDialog({ type: "snapshot" }); }}><Camera size={14} />由当前选择生成</Button>
				</div>
				{!names.length && <EmptyState title="还没有场景组">场景组把多个路由的场景打包, 一次切换, 例如「未登录」, 「VIP 用户」.</EmptyState>}
				<ul aria-label="场景组" className="min-h-0 flex-1 overflow-auto">
					{names.map(n => (
						<li key={n}>
							<button
								type="button"
								aria-current={current === n ? "true" : undefined}
								onClick={() => { if (n !== current && (!dirty || window.confirm("放弃未保存的修改?"))) { navigate(`/groups/${encodeURIComponent(n)}`); } }}
								className={cn("flex w-full items-center gap-2 border-b border-zinc-100 px-3 py-2 text-left text-sm dark:border-zinc-800/60", current === n ? "bg-sky-50 dark:bg-sky-950/40" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/40")}
							>
								<span className="flex-1 truncate">{n}</span>
								{groups.data.active === n && <span title="全局场景组"><Globe size={14} className="text-emerald-600" /></span>}
								{browserGroup === n && <span title="本浏览器场景组"><Cookie size={14} className="text-sky-600" /></span>}
								<span className="text-xs text-zinc-500">{Object.keys(groups.data.groups[n]).length}</span>
							</button>
						</li>
					))}
				</ul>
				<p className="border-t border-zinc-200 p-3 text-xs text-zinc-500 dark:border-zinc-800">优先级: 请求指定 &gt; 本浏览器场景组 &gt; 路由手动选择 &gt; 全局场景组 &gt; default</p>
			</aside>
			<section className="min-w-0 flex-1 overflow-auto p-5">
				{!current && <EmptyState title="选择或新建一个场景组" />}
				{current && !saved && <EmptyState title={`场景组「${current}」不存在`} />}
				{current && saved && (
					<div className="mx-auto max-w-4xl space-y-4">
						<div className="flex flex-wrap items-center gap-2">
							<h1 className="text-base font-semibold">{current}</h1>
							<Button size="icon" variant="ghost" aria-label="重命名" onClick={() => { setNameInput(current); setDialog({ type: "rename", from: current }); }}><Pencil size={14} /></Button>
							<div className="ml-auto flex flex-wrap gap-2">
								<Button size="sm" variant={groups.data.active === current ? "default" : "outline"} disabled={patchState.isPending} onClick={() => patchState.mutate({ group: groups.data.active === current ? null : current }, {
									onSuccess: () => toast.success(groups.data.active === current ? "已取消全局场景组" : "已设为全局场景组"), onError: fail,
								})}><Globe size={14} />{groups.data.active === current ? "取消全局" : "设为全局"}</Button>
								<Button size="sm" variant={browserGroup === current ? "default" : "outline"} title="写入 cookie, 只影响当前浏览器, 刷新业务页面后生效" onClick={() => {
									const next = browserGroup === current ? null : current;
									writeBrowserGroup(next); setBrowserGroup(next);
									toast.success(next ? "本浏览器已启用该场景组, 刷新业务页面后生效" : "本浏览器已停用场景组");
								}}><Cookie size={14} />{browserGroup === current ? "本浏览器停用" : "仅本浏览器启用"}</Button>
								<Button size="sm" variant="ghost" className="text-rose-600" onClick={() => setDeleting(current)}><Trash2 size={14} />删除</Button>
							</div>
						</div>
						<table className="w-full text-sm">
							<thead><tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800"><th className="py-1.5">路由</th><th className="w-56 py-1.5">场景</th></tr></thead>
							<tbody>
								{multiScene.map(r => (
									<tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-800/60">
										<td className="py-1.5"><span className="mr-1.5 inline-flex gap-1">{r.methods.map(m => <MethodBadge key={m} method={m} />)}</span><span className="font-mono text-xs">{r.path}</span></td>
										<td className="py-1.5">
											<Select aria-label={`${r.key} 的场景`} className="w-full" value={draft[r.id] || ""} onChange={e => setDraft(prev => {
												const next = { ...prev };
												e.target.value ? (next[r.id] = e.target.value) : delete next[r.id];
												return next;
											})}>
												<option value="">不指定</option>
												{r.scenes.map(s => <option key={s} value={s}>{s}</option>)}
												{draft[r.id] && !r.scenes.includes(draft[r.id]) && <option value={draft[r.id]}>{draft[r.id]}(已不存在)</option>}
											</Select>
										</td>
									</tr>
								))}
							</tbody>
						</table>
						{!multiScene.length && <EmptyState title="没有包含多个场景的路由">用 scenes() 声明多场景, 或在路由页新建 JSON 场景后再来配置.</EmptyState>}
						<div className="flex justify-end gap-2">
							<Button disabled={!dirty} onClick={() => setDraft(saved)}>重置</Button>
							<Button variant="default" disabled={!dirty || put.isPending} onClick={() => put.mutate({ name: current, map: draft }, { onSuccess: () => toast.success("场景组已保存"), onError: fail })}>保存</Button>
						</div>
					</div>
				)}
			</section>
			<Dialog
				open={!!dialog}
				onClose={() => setDialog(null)}
				title={dialog?.type === "rename" ? "重命名场景组" : dialog?.type === "snapshot" ? "由当前选择生成场景组" : "新建场景组"}
				className="w-[min(420px,92vw)]"
				footer={<>
					<Button onClick={() => setDialog(null)}>取消</Button>
					<Button variant="default" type="submit" form="group-name" disabled={!nameInput || !!nameError}>确定</Button>
				</>}
			>
				<form id="group-name" onSubmit={e => { e.preventDefault(); submitName(); }}>
					<Label>名称
						<Input autoFocus value={nameInput} aria-invalid={!!nameError} onChange={e => setNameInput(e.target.value)} placeholder="例如 未登录" />
						<FieldError>{nameError}</FieldError>
					</Label>
				</form>
			</Dialog>
			<ConfirmDialog
				open={!!deleting}
				title="删除场景组"
				danger
				confirmText="删除"
				message={`确定删除场景组「${deleting}」?`}
				onClose={() => setDeleting(null)}
				onConfirm={() => deleting && del.mutate(deleting, {
					onSuccess: () => {
						if (browserGroup === deleting) { writeBrowserGroup(null); setBrowserGroup(null); }
						toast.success("已删除"); navigate("/groups");
					},
					onError: fail,
				})}
			/>
		</div>
	);
};
