import { ExternalLink, Wrench } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import type { Diagnostic } from "@/api/contract";
import { useCleanup, useMeta, usePatchState } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/state";
import { vscodeLink } from "@/lib/utils";

const TYPE_TEXT: Record<string, string> = {
	"load-error": "mock 文件加载失败",
	"invalid-key": "无法解析的路由声明",
	"invalid-route": "路由路径无法编译",
	duplicate: "同一路由重复声明",
	"missing-default": "scenes() 缺少 default",
	"orphan-scenes": "孤儿场景文件",
	"broken-scene-file": "损坏的场景文件",
	"script-error": "脚本无法编译",
	state: "运行状态文件",
	"stale-state": "失效的场景选择",
};
const FIXABLE = new Set(["orphan-scenes", "stale-state"]);

export const DiagnosticsPage = () => {
	const meta = useMeta();
	const cleanup = useCleanup();
	const patch = usePatchState();
	if (meta.isPending) {
		return <Spinner />;
	}
	if (meta.isError) {
		return <ErrorState error={meta.error} onRetry={() => meta.refetch()} />;
	}
	const m = meta.data;
	const byType = new Map<string, Diagnostic[]>();
	m.diagnostics.forEach(d => byType.set(d.type, [...(byType.get(d.type) || []), d]));
	const fixable = m.diagnostics.some(d => FIXABLE.has(d.type));

	return (
		<div className="mx-auto max-w-4xl space-y-6 overflow-auto p-5">
			<section className="space-y-3">
				<div className="flex items-center gap-2">
					<h1 className="text-base font-semibold">诊断</h1>
					{fixable && (
						<Button
							size="sm"
							className="ml-auto"
							disabled={cleanup.isPending}
							onClick={() =>
								cleanup.mutate(undefined, {
									onSuccess: n => toast.success(`已清理 ${n} 项`),
									onError: err => toast.error(errorMessage(err)),
								})
							}
						>
							<Wrench size={14} />
							清理失效引用与孤儿场景文件
						</Button>
					)}
				</div>
				{!m.diagnostics.length && (
					<EmptyState title="一切正常">
						mock 文件, 场景文件与运行状态都没有发现问题.
					</EmptyState>
				)}
				{[...byType].map(([type, items]) => (
					<div
						key={type}
						className="rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
					>
						<h2 className="border-b border-zinc-200 px-3 py-2 text-sm font-medium dark:border-zinc-800">
							{TYPE_TEXT[type] || type}{" "}
							<span className="text-zinc-500">({items.length})</span>
						</h2>
						<ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
							{items.map((d, i) => {
								const link = vscodeLink(d.file, d.line);
								return (
									<li key={i} className="space-y-0.5 px-3 py-2 text-sm">
										<div>{d.message}</div>
										{link && (
											<a
												href={link}
												className="inline-flex items-center gap-1 font-mono text-xs text-sky-600 hover:underline"
											>
												{d.file}
												{d.line ? `:${d.line}` : ""}
												<ExternalLink size={12} />
											</a>
										)}
									</li>
								);
							})}
						</ul>
					</div>
				))}
			</section>
			<section className="space-y-2 text-sm">
				<h2 className="font-semibold">设置与环境</h2>
				<label className="flex items-center gap-2">
					<span className="w-28 text-zinc-500">控制台日志</span>
					<Select
						value={m.logLevel}
						disabled={patch.isPending}
						onChange={e =>
							patch.mutate(
								{ logLevel: e.target.value as "silent" | "hit" | "all" },
								{
									onSuccess: () => toast.success("已保存"),
									onError: err => toast.error(errorMessage(err)),
								}
							)
						}
					>
						<option value="silent">不输出</option>
						<option value="hit">只输出命中的请求</option>
						<option value="all">输出全部(含未命中与放行)</option>
					</Select>
				</label>
				<dl className="grid grid-cols-[7rem_1fr] gap-y-1 text-xs">
					<dt className="text-zinc-500">版本</dt>
					<dd>
						easy-mok {m.version} · Node {m.env.node} · {m.env.platform}
					</dd>
					<dt className="text-zinc-500">mock 目录</dt>
					<dd className="font-mono break-all">{m.folder}</dd>
					<dt className="text-zinc-500">状态文件</dt>
					<dd className="font-mono break-all">
						{m.stateFile}
						{m.readOnly && "(只读)"}
					</dd>
					<dt className="text-zinc-500">路由 / 文件</dt>
					<dd>
						{m.counts.routes} / {m.counts.files}
					</dd>
					<dt className="text-zinc-500">页内悬浮条</dt>
					<dd>{m.float ? "已启用(MOCK_FLOAT=0 可关闭)" : "未启用"}</dd>
				</dl>
			</section>
		</div>
	);
};
