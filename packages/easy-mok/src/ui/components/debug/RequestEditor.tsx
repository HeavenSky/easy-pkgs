import { Save } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ApiError, errorMessage } from "@/api/client";
import type { Definition, Row } from "@/api/debug-contract";
import { useDebugRequest, useResolve, useRouteMatch, useSaveRequest } from "@/api/debug-queries";
import { NewRouteDialog } from "../NewRouteDialog";
import { cn, pretty } from "@/lib/utils";
import { JsonEditor, parseJson } from "../JsonEditor";
import { Button } from "../ui/button";
import { ErrorState, Spinner } from "../ui/state";
import { Input, Label, Select, Textarea } from "../ui/input";
import { RowsEditor } from "./KeyValueEditor";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const TABS = [
	{ id: "params", label: "参数" },
	{ id: "headers", label: "请求头" },
	{ id: "auth", label: "认证" },
	{ id: "body", label: "请求体" },
	{ id: "settings", label: "设置" },
	{ id: "preview", label: "解析预览" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/** URL 中的 :name 路径参数(端口号等数字不算) */
export const pathParamsOf = (url: string) =>
	[...url.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)(?=[/?#]|$)/g)].map(m => m[1]);

type MultipartPart = { name: string; value?: string; file?: string; enabled?: boolean };

/** 编辑中的请求: 表单状态与 JSON 请求体文本分开保存, 保存时再合成定义 */
export type Draft = { def: Definition; jsonText: string };

export const draftOf = (def: Definition): Draft => ({
	def,
	jsonText: def.body.type === "json" ? pretty((def.body as { content?: unknown }).content ?? {}) : "{}",
});

/** 合成定义; JSON 请求体解析失败时返回错误 */
export const definitionOf = (draft: Draft): { ok: true; def: Definition } | { ok: false; error: string } => {
	const def = draft.def;
	if (def.body.type !== "json") return { ok: true, def };
	const parsed = parseJson(draft.jsonText);
	return parsed.ok ? { ok: true, def: { ...def, body: { ...def.body, content: parsed.value } } } : { ok: false, error: `JSON 请求体语法错误: ${parsed.error}` };
};

/** 关联路由的推荐: 已保存请求按解析后的路径匹配 mock 路由, 没有匹配时可新建 */
const RouteSuggest = ({ requestId, method, onPick }: { requestId: string; method: string; onPick: (key: string) => void }) => {
	const match = useRouteMatch(requestId, true);
	const [creating, setCreating] = useState(false);
	if (!match.data) return null;
	const { pathname, candidates } = match.data;
	return (
		<div className="flex flex-wrap items-center gap-1 text-xs">
			{candidates.length ? (
				<>
					<span className="text-zinc-500">按已保存的 URL 匹配到:</span>
					{candidates.map(c => (
						<Button key={c.routeId} size="sm" variant="ghost" className="font-mono" onClick={() => onPick(c.key)}>
							{c.key}
						</Button>
					))}
				</>
			) : (
				<>
					<span className="text-zinc-500">没有匹配 {pathname || "该 URL"} 的 mock 路由.</span>
					<Button size="sm" variant="ghost" onClick={() => setCreating(true)}>
						新建路由
					</Button>
				</>
			)}
			{creating && (
				<NewRouteDialog
					open
					defaults={{ methods: [method], path: pathname || "/api/" }}
					onClose={() => setCreating(false)}
					onCreated={id => {
						setCreating(false);
						onPick(new TextDecoder().decode(Uint8Array.from(atob(id.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0))));
					}}
				/>
			)}
		</div>
	);
};

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
	<Label className="max-w-xl">
		{label}
		{children}
	</Label>
);

export const RequestFields = ({
	draft,
	setDraft,
	requestId,
	extraTabs,
}: {
	draft: Draft;
	setDraft: (d: Draft) => void;
	requestId: string | null;
	extraTabs?: ReactNode;
}) => {
	const [tab, setTab] = useState<Tab>("params");
	const def = draft.def;
	const set = (patch: Partial<Definition>) => setDraft({ ...draft, def: { ...def, ...patch } });
	const setBody = (patch: Record<string, unknown>) => set({ body: { ...def.body, ...patch } as Definition["body"] });
	const setAuth = (patch: Record<string, unknown>) => set({ auth: { ...def.auth, ...patch } as Definition["auth"] });
	const setSettings = (patch: Record<string, unknown>) => set({ settings: { ...def.settings, ...patch } as Definition["settings"] });
	const names = pathParamsOf(def.url);
	const resolved = definitionOf(draft);
	const preview = useResolve(tab === "preview" && resolved.ok ? { request: requestId, definition: resolved.def } : null);
	const parts = ((def.body as { parts?: MultipartPart[] }).parts || []) as MultipartPart[];

	return (
		<div className="space-y-3">
			<div role="tablist" className="flex flex-wrap gap-1 border-b border-zinc-200 dark:border-zinc-800">
				{TABS.map(t => (
					<button
						key={t.id}
						type="button"
						role="tab"
						aria-selected={tab === t.id}
						onClick={() => setTab(t.id)}
						className={cn("border-b-2 px-3 py-1.5 text-sm", tab === t.id ? "border-sky-600 text-sky-700" : "border-transparent text-zinc-500")}
					>
						{t.label}
					</button>
				))}
				{extraTabs}
			</div>
			{tab === "params" && (
				<div className="space-y-3">
					{names.length > 0 && (
						<div className="space-y-1">
							<div className="text-xs font-medium text-zinc-500">路径参数</div>
							{names.map(n => (
								<div key={n} className="flex items-center gap-2">
									<code className="w-40 text-xs">:{n}</code>
									<Input
										aria-label={`路径参数 ${n}`}
										className="flex-1 font-mono text-xs"
										value={def.params.path[n] ?? ""}
										onChange={e => set({ params: { ...def.params, path: { ...def.params.path, [n]: e.target.value } } })}
									/>
								</div>
							))}
						</div>
					)}
					<div className="text-xs font-medium text-zinc-500">查询参数</div>
					<RowsEditor label="查询参数" rows={def.params.query} onChange={query => set({ params: { ...def.params, query } })} />
				</div>
			)}
			{tab === "headers" && <RowsEditor label="请求头" rows={def.headers} onChange={headers => set({ headers })} />}
			{tab === "auth" && (
				<div className="space-y-2">
					<Field label="认证方式">
						<Select className="w-40" value={def.auth.type} onChange={e => setAuth({ type: e.target.value })}>
							<option value="none">无</option>
							<option value="bearer">Bearer Token</option>
							<option value="basic">Basic</option>
						</Select>
					</Field>
					{def.auth.type === "bearer" && (
						<Field label="Token(可写 {{token}})">
							<Input className="font-mono" value={String((def.auth as { token?: string }).token || "")} onChange={e => setAuth({ token: e.target.value })} />
						</Field>
					)}
					{def.auth.type === "basic" && (
						<>
							<Field label="用户名">
								<Input value={String((def.auth as { username?: string }).username || "")} onChange={e => setAuth({ username: e.target.value })} />
							</Field>
							<Field label="密码">
								<Input value={String((def.auth as { password?: string }).password || "")} onChange={e => setAuth({ password: e.target.value })} />
							</Field>
						</>
					)}
					<p className="text-xs text-zinc-500">请求头中手写了 authorization 时以手写的为准.</p>
				</div>
			)}
			{tab === "body" && (
				<div className="space-y-2">
					<Field label="类型">
						<Select className="w-40" value={def.body.type} onChange={e => setBody({ type: e.target.value })}>
							<option value="none">无</option>
							<option value="json">JSON</option>
							<option value="text">文本</option>
							<option value="form">表单(urlencoded)</option>
							<option value="multipart">multipart</option>
							<option value="binary">文件(二进制)</option>
						</Select>
					</Field>
					{def.body.type === "json" && (
						<JsonEditor label="JSON 请求体" value={draft.jsonText} onChange={jsonText => setDraft({ ...draft, jsonText })} height="220px" />
					)}
					{!resolved.ok && <p className="text-xs text-rose-600">{resolved.error}</p>}
					{def.body.type === "text" && (
						<Textarea aria-label="文本请求体" rows={8} value={String((def.body as { content?: string }).content || "")} onChange={e => setBody({ content: e.target.value })} />
					)}
					{def.body.type === "form" && (
						<RowsEditor label="表单字段" rows={((def.body as { fields?: Row[] }).fields || []) as Row[]} onChange={fields => setBody({ fields })} />
					)}
					{def.body.type === "multipart" && (
						<div className="space-y-1">
							{parts.map((p, i) => (
								<div key={i} className="flex items-center gap-1.5">
									<input type="checkbox" aria-label={`启用第 ${i + 1} 段`} checked={p.enabled !== false} onChange={e => setBody({ parts: parts.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)) })} />
									<Input aria-label={`字段名 ${i + 1}`} className="w-40 text-xs" placeholder="字段名" value={p.name} onChange={e => setBody({ parts: parts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
									<Select aria-label={`字段类型 ${i + 1}`} className="w-24 text-xs" value={p.file !== undefined ? "file" : "text"} onChange={e => setBody({ parts: parts.map((x, j) => (j === i ? (e.target.value === "file" ? { name: x.name, enabled: x.enabled, file: "" } : { name: x.name, enabled: x.enabled, value: "" }) : x)) })}>
										<option value="text">文本</option>
										<option value="file">文件</option>
									</Select>
									<Input
										aria-label={`字段值 ${i + 1}`}
										className="flex-1 font-mono text-xs"
										placeholder={p.file !== undefined ? "相对 mock 目录的文件路径" : "值"}
										value={p.file !== undefined ? p.file : p.value || ""}
										onChange={e => setBody({ parts: parts.map((x, j) => (j === i ? (x.file !== undefined ? { ...x, file: e.target.value } : { ...x, value: e.target.value }) : x)) })}
									/>
									<Button size="sm" variant="ghost" onClick={() => setBody({ parts: parts.filter((_, j) => j !== i) })}>
										删除
									</Button>
								</div>
							))}
							<Button size="sm" variant="ghost" onClick={() => setBody({ parts: [...parts, { name: "", value: "", enabled: true }] })}>
								添加字段
							</Button>
						</div>
					)}
					{def.body.type === "binary" && (
						<Field label="文件路径(相对 mock 目录)">
							<Input className="font-mono" value={String((def.body as { file?: string }).file || "")} onChange={e => setBody({ file: e.target.value })} />
						</Field>
					)}
				</div>
			)}
			{tab === "settings" && (
				<div className="space-y-2">
					<Field label="超时(毫秒, 1-600000)">
						<Input className="w-40" type="number" value={def.settings.timeoutMs} onChange={e => setSettings({ timeoutMs: Number(e.target.value) })} />
					</Field>
					<label className="flex items-center gap-2 text-sm">
						<input type="checkbox" checked={def.settings.followRedirects} onChange={e => setSettings({ followRedirects: e.target.checked })} />
						跟随重定向
					</label>
					<label className="flex items-center gap-2 text-sm">
						<input type="checkbox" checked={def.settings.insecureTLS} onChange={e => setSettings({ insecureTLS: e.target.checked })} />
						不校验 HTTPS 证书(自签证书)
					</label>
					<label className="flex items-center gap-2 text-sm">
						<input type="checkbox" checked={def.settings.skipCookieJar === true} onChange={e => setSettings({ skipCookieJar: e.target.checked })} />
						不使用环境组的 Cookie jar
					</label>
					<Field label="HTTP 代理(可选, 如 http://user:pass@127.0.0.1:8888)">
						<Input className="font-mono" value={def.settings.proxy || ""} onChange={e => setSettings({ proxy: e.target.value || null })} />
					</Field>
					<Field label="关联的 mock 路由(如 GET /api/user/:id)">
						<Input className="font-mono" value={def.route || ""} onChange={e => set({ route: e.target.value || null })} />
					</Field>
					{requestId && <RouteSuggest requestId={requestId} method={def.method} onPick={route => set({ route })} />}
				</div>
			)}
			{tab === "preview" && (
				<div className="space-y-2 text-xs">
					{!resolved.ok ? (
						<p className="text-rose-600">{resolved.error}</p>
					) : preview.isPending ? (
						<Spinner label="解析中" />
					) : preview.isError ? (
						<ErrorState error={preview.error} />
					) : (
						<>
							<p className="font-mono break-all">
								<b>{preview.data.method}</b> {preview.data.url}
							</p>
							{preview.data.urlError && <p className="text-rose-600">{preview.data.urlError}</p>}
							{preview.data.unresolved.length > 0 && <p className="text-amber-700">未解析的变量: {preview.data.unresolved.join(", ")}(发送时会被拒绝)</p>}
							<p className="text-zinc-500">环境组: {preview.data.env || "未激活"}</p>
							<table className="font-mono">
								<tbody>
									{Object.entries(preview.data.values).map(([k, v]) => (
										<tr key={k}>
											<td className="pr-3 text-zinc-500">{k}</td>
											<td className="pr-3 break-all">{v.value}</td>
											<td className="text-zinc-400">{v.from}</td>
										</tr>
									))}
								</tbody>
							</table>
							<div className="text-zinc-500">请求头</div>
							<table className="font-mono">
								<tbody>
									{preview.data.headers.map(([k, v], i) => (
										<tr key={i}>
											<td className="pr-3 text-zinc-500">{k}</td>
											<td className="break-all">{v}</td>
										</tr>
									))}
								</tbody>
							</table>
						</>
					)}
				</div>
			)}
		</div>
	);
};

/** 快捷键提示里的修饰键 */
export const MOD_KEY = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";

/** 已保存请求的编辑器; 保存带 If-Match, 冲突时提示重新加载; 焦点在编辑器内时 ⌘S 保存, ⌘Enter 调用 onSend */
export const RequestEditor = ({
	id,
	children,
	onSend,
}: {
	id: string;
	children?: (draft: Draft, dirty: boolean) => ReactNode;
	onSend?: (draft: Draft) => void;
}) => {
	const query = useDebugRequest(id);
	const save = useSaveRequest();
	const [draft, setDraft] = useState<Draft | null>(null);
	const [etag, setEtag] = useState<string | null>(null);
	useEffect(() => {
		if (query.data && (etag === null || query.data.etag !== etag) && !draft) {
			setDraft(draftOf(query.data.definition));
			setEtag(query.data.etag);
		}
	}, [query.data, etag, draft]);
	// 换请求时在渲染中重置; 用挂载后的 effect 重置会在请求已缓存时清掉刚载入的草稿, 页面停在加载中
	const [loadedId, setLoadedId] = useState(id);
	if (loadedId !== id) {
		setLoadedId(id);
		setDraft(null);
		setEtag(null);
	}
	const dirty = useMemo(() => {
		if (!draft || !query.data) return false;
		const d = definitionOf(draft);
		return !d.ok || JSON.stringify(d.def) !== JSON.stringify(query.data.definition);
	}, [draft, query.data]);

	if (query.isPending || (!draft && !query.isError)) return <Spinner label="加载请求" />;
	if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
	const current = draft!;
	const doSave = () => {
		const d = definitionOf(current);
		if (!d.ok) {
			toast.error(d.error);
			return;
		}
		save.mutate(
			{ id, definition: d.def, etag },
			{
				onSuccess: out => {
					setEtag(out.etag);
					setDraft(draftOf(out.definition));
					toast.success("请求已保存");
				},
				onError: err => {
					if (err instanceof ApiError && err.code === "CONFLICT") {
						toast.error("请求已被其他人修改, 点击重新加载后再改", {
							action: {
								label: "重新加载",
								onClick: () => {
									setDraft(null);
									setEtag(null);
									query.refetch();
								},
							},
						});
					} else toast.error(errorMessage(err));
				},
			}
		);
	};
	return (
		<div
			className="space-y-3"
			onKeyDown={e => {
				if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
				if (e.key === "s") {
					e.preventDefault();
					if (dirty && !save.isPending) doSave();
				} else if (e.key === "Enter" && onSend) {
					e.preventDefault();
					onSend(current);
				}
			}}
		>
			<form
				className="flex flex-wrap items-center gap-2"
				onSubmit={e => {
					e.preventDefault();
					doSave();
				}}
			>
				<Select aria-label="方法" className="w-28" value={current.def.method} onChange={e => setDraft({ ...current, def: { ...current.def, method: e.target.value } })}>
					{METHODS.map(m => (
						<option key={m}>{m}</option>
					))}
				</Select>
				<Input
					aria-label="请求地址"
					className="min-w-48 flex-1 font-mono"
					placeholder="{{baseUrl}}/api/user/:id"
					value={current.def.url}
					onChange={e => setDraft({ ...current, def: { ...current.def, url: e.target.value } })}
				/>
				{children?.(current, dirty)}
				<Button type="submit" disabled={!dirty || save.isPending} title={`保存 (${MOD_KEY}S)`}>
					<Save size={14} />
					{dirty ? "保存" : "已保存"}
				</Button>
			</form>
			<RequestFields draft={current} setDraft={setDraft} requestId={id} />
		</div>
	);
};
