import { ExternalLink, Wrench } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import type { Diagnostic } from "@/api/contract";
import { useCleanup, useMeta, usePatchState } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { KvList } from "@/components/ui/kv";
import { Panel } from "@/components/ui/panel";
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
		<div className="h-full space-y-4 overflow-auto p-4">
			<div className="flex min-h-7 items-center gap-2">
				<h1 className="text-lg font-medium">诊断</h1>
				{fixable && (
					<Button
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
				<Panel>
					<EmptyState title="一切正常">
						mock 文件, 场景文件与运行状态都没有发现问题.
					</EmptyState>
				</Panel>
			)}
			{[...byType].map(([type, items]) => (
				<Panel
					key={type}
					flush
					title={
						<>
							{TYPE_TEXT[type] || type}{" "}
							<span className="text-2xs font-normal text-zinc-400">
								{items.length}
							</span>
						</>
					}
				>
					<ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
						{items.map((d, i) => {
							const link = vscodeLink(d.file, d.line);
							return (
								<li key={i} className="px-3 py-1.5">
									<div className="break-words">{d.message}</div>
									{link && (
										<a
											href={link}
											className="inline-flex items-center gap-1 font-mono text-xs text-zinc-600 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
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
				</Panel>
			))}
			<Panel title="设置与环境">
				<Label className="w-64">
					控制台日志
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
				</Label>
				<KvList
					items={[
						["版本", `easy-mok ${m.version} · Node ${m.env.node} · ${m.env.platform}`],
						["mock 目录", <span className="font-mono text-xs">{m.folder}</span>],
						[
							"状态文件",
							<>
								<span className="font-mono text-xs">{m.stateFile}</span>
								{m.readOnly && "(只读)"}
							</>,
						],
						["路由 / 文件", `${m.counts.routes} / ${m.counts.files}`],
						["页内悬浮条", m.float ? "已启用(MOCK_FLOAT=0 可关闭)" : "未启用"],
					]}
				/>
			</Panel>
		</div>
	);
};
