import { ChevronRight, ExternalLink, EyeOff, FlaskConical, Plus, Save, X } from "lucide-react";
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
import { pretty } from "@/lib/utils";
import { JsonEditor } from "./JsonEditor";
import { NewRouteDialog } from "./NewRouteDialog";
import { LogToRequestDialog } from "./debug/LogToRequestDialog";
import { StatusBadge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { FieldError, Hint, Input, Label } from "./ui/input";
import { KvList } from "./ui/kv";
import { ErrorState, Spinner } from "./ui/state";

/** 栏位内的分区: 全宽可折叠的分区头, 内容 p-3 */
const Part = ({ title, part }: { title: string; part: LogDetail["request"] }) => {
	const headers = Object.entries(part.headers);
	return (
		<details open className="group border-b border-zinc-200 dark:border-zinc-800">
			<summary className="flex h-8 cursor-pointer list-none items-center gap-1 bg-zinc-50 px-3 text-xs font-medium text-zinc-500 select-none hover:text-zinc-900 dark:bg-zinc-900/60 dark:hover:text-zinc-200 [&::-webkit-details-marker]:hidden">
				<ChevronRight size={12} className="transition-transform group-open:rotate-90" />
				{title}
			</summary>
			<div className="space-y-3 border-t border-zinc-200 p-3 dark:border-zinc-800">
				<details open className="space-y-1.5">
					<summary className="cursor-pointer text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200">
						头部{" "}
						<span className="text-2xs font-normal text-zinc-400">{headers.length}</span>
					</summary>
					<KvList mono items={headers} empty="无头部" />
				</details>
				{part.truncated && (
					<p className="text-xs text-amber-700">内容过大, 只保留了前一部分.</p>
				)}
				{part.bodyEncoding === "none" && <Hint>无内容</Hint>}
				{part.bodyEncoding === "json" && (
					<JsonEditor
						label={`${title}内容`}
						readOnly
						height="220px"
						value={pretty(part.body)}
					/>
				)}
				{part.bodyEncoding === "utf8" && (
					<pre className="max-h-64 overflow-auto rounded-md border border-zinc-200 bg-zinc-50 p-2 font-mono text-xs whitespace-pre-wrap dark:border-zinc-800 dark:bg-zinc-950">
						{String(part.body)}
					</pre>
				)}
				{part.bodyEncoding === "base64" && (
					<Hint>二进制或无法解码的内容(base64, {String(part.body).length} 字符)</Hint>
				)}
			</div>
		</details>
	);
};

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
			<div className="flex min-h-10 shrink-0 items-center gap-2 border-b border-zinc-200 px-3 dark:border-zinc-800">
				<h2 className="text-base font-medium">请求详情</h2>
				<Button
					size="icon-sm"
					variant="ghost"
					className="ml-auto"
					aria-label="关闭详情"
					title="关闭详情"
					onClick={onClose}
				>
					<X size={14} />
				</Button>
			</div>
			{log.isPending && <Spinner />}
			{log.isError && <ErrorState error={log.error} />}
			{entry && (
				<div className="min-h-0 flex-1 overflow-auto">
					<div className="space-y-3 border-b border-zinc-200 p-3 dark:border-zinc-800">
						<div className="flex items-start gap-1.5">
							<StatusBadge status={entry.status} />
							<span className="min-w-0 font-mono text-xs leading-4.5 break-all">
								{entry.method} {entry.url}
							</span>
						</div>
						<KvList
							items={[
								["类型", KIND_LABEL[entry.kind]],
								["耗时", `${entry.durationMs}ms`],
								["时间", new Date(entry.time).toLocaleString()],
								...(entry.routeKey
									? ([
											[
												"路由",
												<code className="text-xs">{entry.routeKey}</code>,
											],
										] as const)
									: []),
								...(entry.scene
									? ([
											[
												"场景",
												`${entry.scene}${entry.sceneFallback ? "(指定的场景不存在, 已降级)" : ""}`,
											],
										] as const)
									: []),
							]}
						/>
						<div className="flex flex-wrap gap-1.5">
							{entry.routeId && (
								<Link
									href={`/routes/${entry.routeId}`}
									className="inline-flex h-6 items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
								>
									<ExternalLink size={12} />
									跳到路由
								</Link>
							)}
							{entry.kind === "miss" && (
								<Button size="sm" onClick={() => setCreating(true)}>
									<Plus size={12} />
									为此请求新建 mock
								</Button>
							)}
							<Button
								size="sm"
								title="生成一个调试请求, 由服务端发往真实后端"
								onClick={() => setConverting(true)}
							>
								<FlaskConical size={12} />
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
												toast.success(
													`已忽略 ${rule}, 之后的同类请求不再记录`
												),
											onError: err => toast.error(errorMessage(err)),
										}
									);
								}}
							>
								<EyeOff size={12} />
								忽略此路径
							</Button>
							<Button
								size="sm"
								disabled={!canSave}
								title={
									canSave ? undefined : "截断, 二进制或未完成的响应不能存为场景"
								}
								onClick={() => {
									setName("");
									setSaving(true);
								}}
							>
								<Save size={12} />
								{entry.routeId ? "存为该路由的场景" : "存为新路由的场景"}
							</Button>
						</div>
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
				<Hint>
					{entry?.routeId
						? "场景写入 mock 目录的 __scenes__/, 可提交到仓库."
						: `将新建路由 ${entry?.method} ${entry ? new URL(entry.url, location.origin).pathname : ""} 并保存该场景.`}
				</Hint>
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
