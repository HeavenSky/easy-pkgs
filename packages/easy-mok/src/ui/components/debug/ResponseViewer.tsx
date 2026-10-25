import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { ResultMeta } from "@/api/debug-contract";
import { cn, pretty } from "@/lib/utils";
import { JsonEditor } from "../JsonEditor";
import { StatusBadge } from "../ui/badge";

export const formatBytes = (n: number) =>
	n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : n < 1024 ** 3 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(2)} GB`;

const TEXT_PREVIEW_LIMIT = 2 * 1024 * 1024;
const isText = (type: string | null) =>
	!!type && (/^text\//.test(type) || /json|xml|javascript/.test(type) || type === "image/svg+xml");

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

const BodyPreview = ({ meta, rawUrl }: { meta: NonNullable<ResultMeta["response"]>; rawUrl: string }) => {
	const body = meta.body;
	const type = body.contentType;
	const [mode, setMode] = useState<"preview" | "source">("preview");
	const text = useQuery({
		queryKey: ["debug", "raw", rawUrl, body.sha256],
		enabled: !!body.file && isText(type) && body.size <= TEXT_PREVIEW_LIMIT,
		queryFn: async ({ signal }) => (await fetch(rawUrl, { signal })).text(),
	});
	if (!body.file) return <p className="text-xs text-zinc-500">(空响应体)</p>;
	const download = (
		<a href={rawUrl} download className="inline-flex items-center gap-1 text-xs text-sky-700 hover:underline">
			<Download size={13} />
			下载原文
		</a>
	);
	if (!body.decoded) return <p className="text-xs text-amber-700">响应体是 {body.originalEncoding} 压缩且无法解开, 已按原始字节保存. {download}</p>;
	if (type && type.startsWith("image/") && type !== "image/svg+xml") {
		return (
			<div className="space-y-1">
				<img src={rawUrl} alt="响应图片" className="max-h-96 rounded border" />
				{download}
			</div>
		);
	}
	if (!isText(type) || body.size > TEXT_PREVIEW_LIMIT) {
		return <p className="text-xs text-zinc-500">{body.size > TEXT_PREVIEW_LIMIT ? "响应体较大, 不在页面中预览. " : "二进制响应体. "}{download}</p>;
	}
	if (text.isPending) return <p className="text-xs text-zinc-500">加载响应体</p>;
	if (text.isError) return <p className="text-xs text-rose-600">读取响应体失败</p>;
	const switcher = (labels: [string, string]) => (
		<div className="flex gap-2 text-xs">
			{(["preview", "source"] as const).map((m, i) => (
				<button key={m} type="button" className={cn(mode === m ? "font-semibold text-sky-700" : "text-zinc-500")} onClick={() => setMode(m)}>
					{labels[i]}
				</button>
			))}
			{download}
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
		view = <JsonEditor label="响应体" readOnly value={mode === "preview" ? shown : text.data} height="320px" />;
		return (
			<div className="space-y-1">
				{switcher(["格式化", "原文"])}
				{view}
			</div>
		);
	}
	if (type === "text/html" && mode === "preview") {
		// 不给 allow-scripts 与 allow-same-origin: 远端页面的脚本不能在管理页的源中执行
		view = <iframe title="HTML 预览" sandbox="" src={rawUrl} className="h-96 w-full rounded border bg-white" />;
	} else if (type === "text/csv" && mode === "preview") {
		const rows = parseCsv(text.data);
		view = (
			<div className="max-h-96 overflow-auto">
				<table className="text-xs">
					<tbody>
						{rows.map((r, i) => (
							<tr key={i} className={i === 0 ? "font-semibold" : ""}>
								{r.map((c, j) => (
									<td key={j} className="border px-1.5 py-0.5">
										{c}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
				{rows.length >= 200 && <p className="text-xs text-zinc-500">只显示前 200 行</p>}
			</div>
		);
	} else {
		view = <pre className="max-h-96 overflow-auto rounded-md bg-zinc-100 p-3 font-mono text-xs whitespace-pre-wrap dark:bg-zinc-800">{text.data}</pre>;
	}
	return (
		<div className="space-y-1">
			{type === "text/html" || type === "text/csv" ? switcher(["预览", "源码"]) : download}
			{view}
		</div>
	);
};

/** 一次发送的结果: 状态, 耗时, 大小, 响应头与按类型预览的响应体 */
export const ResponseViewer = ({ meta, rawUrl, actions }: { meta: ResultMeta; rawUrl: string; actions?: ReactNode }) => {
	const res = meta.response;
	return (
		<div className="space-y-2" aria-live="polite">
			<div className="flex flex-wrap items-center gap-2 text-sm">
				{res ? <StatusBadge status={res.status} /> : <span className="rounded bg-rose-100 px-1.5 text-xs text-rose-700">{meta.error?.code}</span>}
				<span className="text-zinc-500">{meta.timing.durationMs} ms</span>
				{res && <span className="text-zinc-500">{formatBytes(res.body.size)}</span>}
				{res?.body.truncated && <span className="text-xs text-amber-700">超过 50MB 已截断</span>}
				<span className="truncate font-mono text-xs text-zinc-400" title={meta.request.url}>
					{meta.request.method} {meta.request.url}
				</span>
				<span className="ml-auto flex items-center gap-1">{actions}</span>
			</div>
			{meta.error && <p className="text-sm text-rose-600">{meta.error.message}</p>}
			{res && res.redirects.length > 0 && (
				<p className="text-xs text-zinc-500">重定向: {res.redirects.map(r => `${r.status} → ${r.location}`).join(", ")}</p>
			)}
			{res && (
				<details className="text-xs">
					<summary className="cursor-pointer text-zinc-500">响应头 ({res.headers.length})</summary>
					<table className="mt-1 font-mono">
						<tbody>
							{res.headers.map(([k, v], i) => (
								<tr key={i}>
									<td className="pr-3 align-top text-zinc-500">{k}</td>
									<td className="break-all">{v}</td>
								</tr>
							))}
						</tbody>
					</table>
				</details>
			)}
			<details className="text-xs">
				<summary className="cursor-pointer text-zinc-500">实际请求头 ({meta.request.headers.length})</summary>
				<table className="mt-1 font-mono">
					<tbody>
						{meta.request.headers.map(([k, v], i) => (
							<tr key={i}>
								<td className="pr-3 align-top text-zinc-500">{k}</td>
								<td className="break-all">{v}</td>
							</tr>
						))}
					</tbody>
				</table>
			</details>
			{res && <BodyPreview meta={res} rawUrl={rawUrl} />}
		</div>
	);
};
