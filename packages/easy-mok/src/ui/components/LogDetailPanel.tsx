import { ExternalLink, EyeOff, FlaskConical, Plus, Save, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { errorMessage } from "@/api/client";
import { NAME_RE, type LogDetail } from "@/api/contract";
import {
	exactIgnoreRule,
	KIND_LABEL,
	useIgnore,
	useLog,
	useSaveIgnore,
	useSaveLogAsScene,
} from "@/api/queries";
import { cn, pretty } from "@/lib/utils";
import { JsonEditor } from "./JsonEditor";
import { NewRouteDialog } from "./NewRouteDialog";
import { LogToRequestDialog } from "./debug/LogToRequestDialog";
import { StatusBadge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { FieldError, Input, Label } from "./ui/input";
import { ErrorState, Spinner } from "./ui/state";

const Part = ({ title, part }: { title: string; part: LogDetail["request"] }) => (
	<section className="space-y-2">
		<h3 className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{title}</h3>
		<details open className="text-xs">
			<summary className="cursor-pointer text-zinc-500">
				头部 ({Object.keys(part.headers).length})
			</summary>
			<table className="mt-1 w-full font-mono">
				<tbody>
					{Object.entries(part.headers).map(([k, v]) => (
						<tr key={k} className="align-top">
							<td className="pr-3 whitespace-nowrap text-zinc-500">{k}</td>
							<td className="break-all">{v}</td>
						</tr>
					))}
				</tbody>
			</table>
		</details>
		{part.truncated && <p className="text-xs text-amber-600">内容过大, 只保留了前一部分.</p>}
		{part.bodyEncoding === "none" && <p className="text-xs text-zinc-500">无内容</p>}
		{part.bodyEncoding === "json" && (
			<JsonEditor label={`${title}内容`} readOnly height="220px" value={pretty(part.body)} />
		)}
		{part.bodyEncoding === "utf8" && (
			<pre className="max-h-64 overflow-auto rounded-md bg-zinc-100 p-2 font-mono text-xs whitespace-pre-wrap dark:bg-zinc-800">
				{String(part.body)}
			</pre>
		)}
		{part.bodyEncoding === "base64" && (
			<p className="text-xs text-zinc-500">
				二进制或无法解码的内容(base64, {String(part.body).length} 字符)
			</p>
		)}
	</section>
);

export const LogDetailPanel = ({ id, onClose }: { id: string; onClose: () => void }) => {
	const [converting, setConverting] = useState(false);
	const log = useLog(id);
	const save = useSaveLogAsScene();
	const ignore = useIgnore();
	const saveIgnore = useSaveIgnore();
	const [, navigate] = useLocation();
	const [saving, setSaving] = useState(false);
	const [creating, setCreating] = useState(false);
	const [name, setName] = useState("");
	const entry = log.data;
	const canSave =
		!!entry &&
		!entry.response.truncated &&
		entry.response.bodyEncoding !== "base64" &&
		entry.status > 0;
	const nameOk = NAME_RE.test(name);

	return (
		<aside
			aria-label="日志详情"
			className="flex w-[480px] shrink-0 flex-col border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
		>
			<div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
				<h2 className="text-sm font-semibold">请求详情</h2>
				<Button
					size="icon"
					variant="ghost"
					className="ml-auto"
					aria-label="关闭详情"
					onClick={onClose}
				>
					<X size={14} />
				</Button>
			</div>
			{log.isPending && <Spinner />}
			{log.isError && <ErrorState error={log.error} />}
			{entry && (
				<div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
					<div className="space-y-1 text-xs">
						<div className="flex items-center gap-2">
							<StatusBadge status={entry.status} />
							<span className="font-mono break-all">
								{entry.method} {entry.url}
							</span>
						</div>
						<div className="text-zinc-500">
							{KIND_LABEL[entry.kind]} · {entry.durationMs}ms ·{" "}
							{new Date(entry.time).toLocaleString()}
							{entry.routeKey && (
								<>
									{" "}
									· 路由 <code>{entry.routeKey}</code>
								</>
							)}
							{entry.scene && (
								<>
									{" "}
									· 场景 {entry.scene}
									{entry.sceneFallback && "(指定的场景不存在, 已降级)"}
								</>
							)}
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						{entry.routeId && (
							<Link
								href={`/routes/${entry.routeId}`}
								className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-300 px-2 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
							>
								<ExternalLink size={12} />
								跳到路由
							</Link>
						)}
						{entry.kind === "miss" && (
							<Button size="sm" onClick={() => setCreating(true)}>
								<Plus size={14} />
								为此请求新建 mock
							</Button>
						)}
						<Button size="sm" title="生成一个调试请求, 由服务端发往真实后端" onClick={() => setConverting(true)}>
							<FlaskConical size={14} />
							转为调试请求
						</Button>
						<Button
							size="sm"
							disabled={!ignore.data || saveIgnore.isPending}
							title="以后不再记录同方法同路径的请求, 不影响 mock 响应"
							onClick={() => {
								if (!entry || !ignore.data) {
									return;
								}
								const rule = exactIgnoreRule(entry.method, entry.url);
								if (ignore.data.custom.includes(rule)) {
									toast.info(`已在忽略规则中: ${rule}`);
									return;
								}
								saveIgnore.mutate(
									{ custom: [...ignore.data.custom, rule] },
									{
										onSuccess: () =>
											toast.success(`已忽略 ${rule}, 之后的同类请求不再记录`),
										onError: err => toast.error(errorMessage(err)),
									}
								);
							}}
						>
							<EyeOff size={14} />
							忽略此路径
						</Button>
						<Button
							size="sm"
							disabled={!canSave}
							title={canSave ? undefined : "截断, 二进制或未完成的响应不能存为场景"}
							onClick={() => {
								setName("");
								setSaving(true);
							}}
						>
							<Save size={14} />
							{entry.routeId ? "存为该路由的场景" : "存为新路由的场景"}
						</Button>
					</div>
					<Part title="请求" part={entry.request} />
					<Part title="响应" part={entry.response} />
				</div>
			)}
			<Dialog
				open={saving}
				onClose={() => setSaving(false)}
				title="把这次响应存为场景"
				className="w-[min(440px,92vw)]"
				footer={
					<>
						<Button onClick={() => setSaving(false)}>取消</Button>
						<Button
							variant="default"
							disabled={!nameOk || save.isPending}
							onClick={() =>
								entry &&
								save.mutate(
									{ logId: entry.id, name },
									{
										onSuccess: res => {
											toast.success(
												`已保存为「${res.route.key}」的场景「${res.scene.name}」`
											);
											setSaving(false);
											navigate(`/routes/${res.route.id}`);
										},
										onError: err => toast.error(errorMessage(err)),
									}
								)
							}
						>
							保存
						</Button>
					</>
				}
			>
				<Label>
					场景名
					<Input
						autoFocus
						value={name}
						aria-invalid={!!name && !nameOk}
						onChange={e => setName(e.target.value)}
						placeholder="例如 real-20261014"
					/>
					<FieldError>
						{name && !nameOk ? "只能包含字母, 数字, 下划线与连字符" : ""}
					</FieldError>
				</Label>
				<p className={cn("mt-2 text-xs text-zinc-500")}>
					{entry?.routeId
						? "场景写入 mock 目录的 __scenes__/, 可提交到仓库."
						: `将新建路由 ${entry?.method} ${entry ? new URL(entry.url, location.origin).pathname : ""} 并保存该场景.`}
				</p>
			</Dialog>
			{converting && <LogToRequestDialog logId={id} onClose={() => setConverting(false)} />}
			{entry && (
				<NewRouteDialog
					open={creating}
					onClose={() => setCreating(false)}
					onCreated={routeId => navigate(`/routes/${routeId}`)}
					defaults={{
						methods: [entry.method],
						path: new URL(entry.url, location.origin).pathname,
					}}
				/>
			)}
		</aside>
	);
};
