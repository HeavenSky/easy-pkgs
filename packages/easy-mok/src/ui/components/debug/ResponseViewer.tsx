import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { ResultMeta } from "@/api/debug-contract";
import { cn, pretty } from "@/lib/utils";
import { JsonEditor } from "../JsonEditor";
import { Badge, StatusBadge } from "../ui/badge";
import { Button } from "../ui/button";
import { KvList } from "../ui/kv";
import { Panel } from "../ui/panel";

export const formatBytes = (n: number) =>
	n < 1024
		? `${n} B`
		: n < 1024 * 1024
			? `${(n / 1024).toFixed(1)} KB`
			: n < 1024 ** 3
				? `${(n / 1024 / 1024).toFixed(1)} MB`
				: `${(n / 1024 ** 3).toFixed(2)} GB`;

const TEXT_PREVIEW_LIMIT = 2 * 1024 * 1024;
const isText = (type: string | null) =>
	!!type &&
	(type.startsWith("text/") || /json|xml|javascript/.test(type) || type === "image/svg+xml");

/** 简单 CSV 解析: 支持双引号转义, 只取前 limit 行 */
const parseCsv = (text: string, limit = 200) => {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = "";
	let quoted = false;
	for (let i = 0; i < text.length && rows.length < limit; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"' && text[i + 1] === '"') {
				cell += '"';
				i++;
			} else if (c === '"') quoted = false;
			else cell += c;
		} else if (c === '"') quoted = true;
		else if (c === ",") {
			row.push(cell);
			cell = "";
		} else if (c === "\n" || c === "\r") {
			if (c === "\r" && text[i + 1] === "\n") i++;
			row.push(cell);
			rows.push(row);
			row = [];
			cell = "";
		} else cell += c;
	}
	if ((cell || row.length) && rows.length < limit) rows.push([...row, cell]);
	return rows;
};

const BodyPreview = ({
	meta,
	rawUrl,
}: {
	meta: NonNullable<ResultMeta["response"]>;
	rawUrl: string;
}) => {
	const body = meta.body;
	const type = body.contentType;
	const [mode, setMode] = useState<"preview" | "source">("preview");
	const text = useQuery({
		queryKey: ["debug", "raw", rawUrl, body.sha256],
		enabled: !!body.file && isText(type) && body.size <= TEXT_PREVIEW_LIMIT,
		queryFn: async ({ signal }) => (await fetch(rawUrl, { signal })).text(),
	});
	if (!body.file) return <p className="text-xs text-zinc-400">(空响应体)</p>;
	const download = (
		<a
			href={rawUrl}
			download
			className="inline-flex items-center gap-1 text-xs text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900 dark:text-zinc-100 dark:decoration-zinc-600"
		>
			<Download size={12} />
			下载原文
		</a>
	);
	if (!body.decoded)
		return (
			<p className="text-xs text-amber-700">
				响应体是 {body.originalEncoding} 压缩且无法解开, 已按原始字节保存. {download}
			</p>
		);
	if (type && type.startsWith("image/") && type !== "image/svg+xml") {
		return (
			<div className="space-y-1.5">
				<img
					src={rawUrl}
					alt="响应图片"
					className="max-h-96 rounded-md border border-zinc-200 dark:border-zinc-800"
				/>
				{download}
			</div>
		);
	}
	if (!isText(type) || body.size > TEXT_PREVIEW_LIMIT) {
		return (
			<p className="text-xs text-zinc-500">
				{body.size > TEXT_PREVIEW_LIMIT ? "响应体较大, 不在页面中预览. " : "二进制响应体. "}
				{download}
			</p>
		);
	}
	if (text.isPending) return <p className="text-xs text-zinc-400">加载响应体</p>;
	if (text.isError) return <p className="text-xs text-rose-600">读取响应体失败</p>;
	const switcher = (labels: [string, string]) => (
		<div className="flex items-center gap-1">
			{(["preview", "source"] as const).map((m, i) => (
				<Button
					key={m}
					size="sm"
					variant="ghost"
					aria-pressed={mode === m}
					className={cn(
						mode === m
							? "bg-zinc-100 text-zinc-950 dark:bg-zinc-800 dark:text-white"
							: "text-zinc-500"
					)}
					onClick={() => setMode(m)}
				>
					{labels[i]}
				</Button>
			))}
			<span className="ml-auto">{download}</span>
		</div>
	);
	let view: ReactNode;
	if (/json/.test(type || "")) {
		let shown = text.data;
		try {
			shown = pretty(JSON.parse(text.data));
		} catch {
			/* 不是合法 JSON 时显示原文 */
		}
		const value = mode === "preview" ? shown : text.data;
		// 短响应按行数收起高度, 不留大片空白; 最高 320px 后滚动
		const lines = value.split("\n").length;
		view = (
			<JsonEditor
				label="响应体"
				readOnly
				value={value}
				height={`${Math.min(320, Math.max(64, lines * 20 + 12))}px`}
			/>
		);
		return (
			<div className="space-y-1.5">
				{switcher(["格式化", "原文"])}
				{view}
			</div>
		);
	}
	if (type === "text/html" && mode === "preview") {
		// 不给 allow-scripts 与 allow-same-origin: 远端页面的脚本不能在管理页的源中执行
		view = (
			<iframe
				title="HTML 预览"
				sandbox=""
				src={rawUrl}
				className="h-96 w-full rounded-md border border-zinc-200 bg-white dark:border-zinc-800"
			/>
		);
	} else if (type === "text/csv" && mode === "preview") {
		const rows = parseCsv(text.data);
		view = (
			<div className="max-h-96 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800">
				<table className="text-xs">
					<tbody>
						{rows.map((r, i) => (
							<tr
								key={i}
								className={
									i === 0 ? "bg-zinc-50 font-medium dark:bg-zinc-800/60" : ""
								}
							>
								{r.map((c, j) => (
									<td
										key={j}
										className="border border-zinc-200 px-1.5 py-0.5 dark:border-zinc-800"
									>
										{c}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
				{rows.length >= 200 && (
					<p className="px-1.5 py-1 text-xs text-zinc-500">只显示前 200 行</p>
				)}
			</div>
		);
	} else {
		view = (
			<pre className="max-h-96 overflow-auto rounded-md border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs whitespace-pre-wrap dark:border-zinc-800 dark:bg-zinc-950">
				{text.data}
			</pre>
		);
	}
	return (
		<div className="space-y-1.5">
			{type === "text/html" || type === "text/csv" ? (
				switcher(["预览", "源码"])
			) : (
				<div className="flex justify-end">{download}</div>
			)}
			{view}
		</div>
	);
};

const HeaderList = ({ title, headers }: { title: string; headers: Array<[string, string]> }) => (
	<details>
		<summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200">
			{title} ({headers.length})
		</summary>
		<KvList mono className="mt-1.5" items={headers} />
	</details>
);

/**
 * 一次发送的结果: 状态, 耗时, 大小, 响应头与按类型预览的响应体.
 * 给出 title 时自成一个 Panel, 摘要放在头部; 否则只渲染内容, 由外层模块提供边界.
 */
export const ResponseViewer = ({
	meta,
	rawUrl,
	actions,
	title,
	label,
}: {
	meta: ResultMeta;
	rawUrl: string;
	actions?: ReactNode;
	title?: ReactNode;
	/** Panel 的可访问名称 */
	label?: string;
}) => {
	const res = meta.response;
	const summary = (
		<div className="flex h-full min-w-0 flex-1 items-center gap-2">
			{res ? (
				<StatusBadge status={res.status} />
			) : (
				<Badge className="bg-rose-100 font-mono text-rose-800 dark:bg-rose-950 dark:text-rose-300">
					{meta.error?.code}
				</Badge>
			)}
			<span className="shrink-0 text-xs text-zinc-500">{meta.timing.durationMs} ms</span>
			{res && (
				<span className="shrink-0 text-xs text-zinc-500">{formatBytes(res.body.size)}</span>
			)}
			{res?.body.truncated && (
				<span className="shrink-0 text-xs text-amber-700">超过 50MB 已截断</span>
			)}
			<span
				className="min-w-0 truncate font-mono text-xs text-zinc-400"
				title={meta.request.url}
			>
				{meta.request.method} {meta.request.url}
			</span>
		</div>
	);
	const body = (
		<>
			{meta.error && <p className="text-sm text-rose-600">{meta.error.message}</p>}
			{res && res.redirects.length > 0 && (
				<p className="text-xs text-zinc-500">
					重定向: {res.redirects.map(r => `${r.status} → ${r.location}`).join(", ")}
				</p>
			)}
			<div className="space-y-1.5">
				{res && <HeaderList title="响应头" headers={res.headers} />}
				<HeaderList title="实际请求头" headers={meta.request.headers} />
			</div>
			{res && <BodyPreview meta={res} rawUrl={rawUrl} />}
		</>
	);
	if (title) {
		return (
			<Panel
				aria-label={label}
				title={title}
				tabs={summary}
				actions={actions}
				bodyClassName="min-w-0"
				aria-live="polite"
			>
				{body}
			</Panel>
		);
	}
	return (
		<div className="space-y-3" aria-live="polite">
			<div className="flex flex-wrap items-center gap-2">
				{summary}
				{actions && <span className="ml-auto flex items-center gap-1">{actions}</span>}
			</div>
			{body}
		</div>
	);
};
