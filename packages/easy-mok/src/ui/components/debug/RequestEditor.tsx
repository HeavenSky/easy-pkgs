import { Plus, Save } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ApiError, errorMessage } from "@/api/client";
import type { Definition, Row } from "@/api/debug-contract";
import { useDebugRequest, useResolve, useRouteMatch, useSaveRequest } from "@/api/debug-queries";
import { NewRouteDialog } from "../NewRouteDialog";
import { pretty } from "@/lib/utils";
import { JsonEditor, parseJson } from "../JsonEditor";
import { Button } from "../ui/button";
import { ErrorState, Spinner } from "../ui/state";
import { Hint, Input, Label, Select, Textarea } from "../ui/input";
import { KV_ROW, KvList } from "../ui/kv";
import { Panel, Section } from "../ui/panel";
import { Tabs } from "../ui/tabs";
import {
	AuthEditor,
	InheritedHeaders,
	SettingsEditor,
	inheritFromLayers,
	type Inherited,
} from "./ConfigEditors";
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
	jsonText:
		def.body.type === "json" ? pretty((def.body as { content?: unknown }).content ?? {}) : "{}",
});

/** 合成定义; JSON 请求体解析失败时返回错误 */
export const definitionOf = (
	draft: Draft
): { ok: true; def: Definition } | { ok: false; error: string } => {
	const def = draft.def;
	if (def.body.type !== "json") return { ok: true, def };
	const parsed = parseJson(draft.jsonText);
	return parsed.ok
		? { ok: true, def: { ...def, body: { ...def.body, content: parsed.value } } }
		: { ok: false, error: `JSON 请求体语法错误: ${parsed.error}` };
};

/** 关联路由的推荐: 已保存请求按解析后的路径匹配 mock 路由, 没有匹配时可新建 */
const RouteSuggest = ({
	requestId,
	method,
	onPick,
}: {
	requestId: string;
	method: string;
	onPick: (key: string) => void;
}) => {
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
						<Button
							key={c.routeId}
							size="sm"
							variant="ghost"
							className="font-mono"
							onClick={() => onPick(c.key)}
						>
							{c.key}
						</Button>
					))}
				</>
			) : (
				<>
					<span className="text-zinc-500">
						没有匹配 {pathname || "该 URL"} 的 mock 路由.
					</span>
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
						onPick(
							new TextDecoder().decode(
								Uint8Array.from(atob(id.replace(/-/g, "+").replace(/_/g, "/")), c =>
									c.charCodeAt(0)
								)
							)
						);
					}}
				/>
			)}
		</div>
	);
};

/** multipart 行: 启用, 字段名(窄), 类型, 值(宽), 删除 */
const MULTIPART_ROW =
	"grid grid-cols-[auto_minmax(6rem,1fr)_5.5rem_minmax(0,2.5fr)_auto] items-center gap-1.5";

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
	urlBar,
	inherited,
}: {
	draft: Draft;
	setDraft: (d: Draft) => void;
	requestId: string | null;
	extraTabs?: ReactNode;
	/** 集合与分组继承来的请求头, 设置与认证; 没有时按默认值显示 */
	inherited?: Inherited;
	/** 放在标签页上方的地址栏; 给出时与标签页合成一个带边框的模块 */
	urlBar?: ReactNode;
}) => {
	const [tab, setTab] = useState<Tab>("params");
	const def = draft.def;
	const set = (patch: Partial<Definition>) => setDraft({ ...draft, def: { ...def, ...patch } });
	const setBody = (patch: Record<string, unknown>) =>
		set({ body: { ...def.body, ...patch } as Definition["body"] });
	const inh = inherited || inheritFromLayers([]);
	const names = pathParamsOf(def.url);
	const resolved = definitionOf(draft);
	const preview = useResolve(
		tab === "preview" && resolved.ok ? { request: requestId, definition: resolved.def } : null
	);
	const parts = ((def.body as { parts?: MultipartPart[] }).parts || []) as MultipartPart[];

	const content = (
		<>
			{tab === "params" && (
				<>
					{names.length > 0 && (
						<Section title="路径参数">
							{names.map(n => (
								<div key={n} className={KV_ROW}>
									<code
										className="truncate text-xs text-zinc-700 dark:text-zinc-300"
										title={`:${n}`}
									>
										:{n}
									</code>
									<Input
										aria-label={`路径参数 ${n}`}
										className="font-mono text-xs"
										value={def.params.path[n] ?? ""}
										onChange={e =>
											set({
												params: {
													...def.params,
													path: {
														...def.params.path,
														[n]: e.target.value,
													},
												},
											})
										}
									/>
									<span aria-hidden className="size-6" />
								</div>
							))}
						</Section>
					)}
					<Section title="查询参数">
						<RowsEditor
							label="查询参数"
							rows={def.params.query}
							onChange={query => set({ params: { ...def.params, query } })}
						/>
					</Section>
				</>
			)}
			{tab === "headers" && (
				<>
					<InheritedHeaders items={inh.headers} />
					<Section title="本请求的请求头">
						<RowsEditor
							label="请求头"
							rows={def.headers}
							onChange={headers => set({ headers })}
						/>
					</Section>
				</>
			)}
			{tab === "auth" && (
				<AuthEditor
					allowInherit
					layer="本请求"
					value={def.auth}
					inherited={inh.auth}
					onChange={auth => set({ auth: auth || { type: "inherit" } })}
				/>
			)}
			{tab === "body" && (
				<div className="grid gap-2">
					<Field label="类型">
						<Select
							className="w-40"
							value={def.body.type}
							onChange={e => setBody({ type: e.target.value })}
						>
							<option value="none">无</option>
							<option value="json">JSON</option>
							<option value="text">文本</option>
							<option value="form">表单(urlencoded)</option>
							<option value="multipart">multipart</option>
							<option value="binary">文件(二进制)</option>
						</Select>
					</Field>
					{def.body.type === "json" && (
						<JsonEditor
							label="JSON 请求体"
							value={draft.jsonText}
							onChange={jsonText => setDraft({ ...draft, jsonText })}
							height="220px"
						/>
					)}
					{!resolved.ok && <p className="text-xs text-rose-600">{resolved.error}</p>}
					{def.body.type === "text" && (
						<Textarea
							aria-label="文本请求体"
							rows={8}
							value={String((def.body as { content?: string }).content || "")}
							onChange={e => setBody({ content: e.target.value })}
						/>
					)}
					{def.body.type === "form" && (
						<RowsEditor
							label="表单字段"
							rows={((def.body as { fields?: Row[] }).fields || []) as Row[]}
							onChange={fields => setBody({ fields })}
						/>
					)}
					{def.body.type === "multipart" && (
						<div className="space-y-1.5">
							{parts.map((p, i) => (
								<div key={i} className={MULTIPART_ROW}>
									<input
										type="checkbox"
										aria-label={`启用第 ${i + 1} 段`}
										checked={p.enabled !== false}
										onChange={e =>
											setBody({
												parts: parts.map((x, j) =>
													j === i
														? { ...x, enabled: e.target.checked }
														: x
												),
											})
										}
									/>
									<Input
										aria-label={`字段名 ${i + 1}`}
										className="font-mono text-xs"
										placeholder="字段名"
										value={p.name}
										onChange={e =>
											setBody({
												parts: parts.map((x, j) =>
													j === i ? { ...x, name: e.target.value } : x
												),
											})
										}
									/>
									<Select
										aria-label={`字段类型 ${i + 1}`}
										className="w-full"
										value={p.file !== undefined ? "file" : "text"}
										onChange={e =>
											setBody({
												parts: parts.map((x, j) =>
													j === i
														? e.target.value === "file"
															? {
																	name: x.name,
																	enabled: x.enabled,
																	file: "",
																}
															: {
																	name: x.name,
																	enabled: x.enabled,
																	value: "",
																}
														: x
												),
											})
										}
									>
										<option value="text">文本</option>
										<option value="file">文件</option>
									</Select>
									<Input
										aria-label={`字段值 ${i + 1}`}
										className="font-mono text-xs"
										placeholder={
											p.file !== undefined ? "相对 mock 目录的文件路径" : "值"
										}
										value={p.file !== undefined ? p.file : p.value || ""}
										onChange={e =>
											setBody({
												parts: parts.map((x, j) =>
													j === i
														? x.file !== undefined
															? { ...x, file: e.target.value }
															: { ...x, value: e.target.value }
														: x
												),
											})
										}
									/>
									<Button
										size="sm"
										variant="ghost"
										onClick={() =>
											setBody({ parts: parts.filter((_, j) => j !== i) })
										}
									>
										删除
									</Button>
								</div>
							))}
							<Button
								size="sm"
								variant="ghost"
								onClick={() =>
									setBody({
										parts: [...parts, { name: "", value: "", enabled: true }],
									})
								}
							>
								<Plus size={12} />
								添加字段
							</Button>
						</div>
					)}
					{def.body.type === "binary" && (
						<Field label="文件路径(相对 mock 目录)">
							<Input
								className="font-mono text-xs"
								value={String((def.body as { file?: string }).file || "")}
								onChange={e => setBody({ file: e.target.value })}
							/>
						</Field>
					)}
				</div>
			)}
			{tab === "settings" && (
				<div className="grid gap-3">
					<SettingsEditor
						layer="本请求"
						value={def.settings}
						inherited={inh.settings}
						onChange={settings => set({ settings })}
					/>
					<Field label="关联的 mock 路由(如 GET /api/user/:id)">
						<Input
							className="font-mono text-xs"
							value={def.route || ""}
							onChange={e => set({ route: e.target.value || null })}
						/>
					</Field>
					{requestId && (
						<RouteSuggest
							requestId={requestId}
							method={def.method}
							onPick={route => set({ route })}
						/>
					)}
				</div>
			)}
			{tab === "preview" &&
				(!resolved.ok ? (
					<p className="text-xs text-rose-600">{resolved.error}</p>
				) : preview.isPending ? (
					<Spinner label="解析中" />
				) : preview.isError ? (
					<ErrorState error={preview.error} />
				) : (
					<>
						<div className="space-y-1">
							<p className="font-mono text-xs break-all">
								<span className="font-medium">{preview.data.method}</span>{" "}
								{preview.data.url}
							</p>
							{preview.data.urlError && (
								<p className="text-xs text-rose-600">{preview.data.urlError}</p>
							)}
							{preview.data.unresolved.length > 0 && (
								<p className="text-xs text-amber-700">
									未解析的变量: {preview.data.unresolved.join(", ")}
									(发送时会被拒绝)
								</p>
							)}
							<Hint>环境组: {preview.data.env || "未激活"}</Hint>
						</div>
						<Section title="变量">
							<KvList
								mono
								empty="没有用到变量"
								items={Object.entries(preview.data.values).map(([k, v]) => [
									k,
									<>
										{v.value}
										<span className="ml-2 font-sans text-zinc-400">
											{v.from}
										</span>
									</>,
								])}
							/>
						</Section>
						<Section title="请求头(已合并集合与分组的默认请求头)">
							<KvList mono empty="没有请求头" items={preview.data.headers} />
						</Section>
						<Section title="发送设置">
							<KvList
								items={[
									["超时", `${preview.data.settings.timeoutMs} ms`],
									[
										"跟随重定向",
										preview.data.settings.followRedirects ? "是" : "否",
									],
									[
										"校验 HTTPS 证书",
										preview.data.settings.insecureTLS ? "否" : "是",
									],
									[
										"Cookie jar",
										preview.data.settings.skipCookieJar ? "不使用" : "使用",
									],
									["HTTP 代理", preview.data.settings.proxy || "不使用"],
								]}
							/>
						</Section>
					</>
				))}
		</>
	);
	const panel = (
		<Panel
			tabs={<Tabs inPanel items={TABS} value={tab} onChange={setTab} extra={extraTabs} />}
			className={
				urlBar ? "rounded-none border-0 bg-transparent dark:bg-transparent" : undefined
			}
		>
			{content}
		</Panel>
	);
	return urlBar ? (
		<section className="min-w-0 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
			<div className="border-b border-zinc-200 p-3 dark:border-zinc-800">{urlBar}</div>
			{panel}
		</section>
	) : (
		panel
	);
};

/** 快捷键提示里的修饰键 */
export const MOD_KEY =
	typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";

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

	if (query.isPending || (!draft && !query.isError))
		return (
			<Panel flush>
				<Spinner label="加载请求" />
			</Panel>
		);
	if (query.isError)
		return (
			<Panel flush>
				<ErrorState error={query.error} onRetry={() => query.refetch()} />
			</Panel>
		);
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
	const urlBar = (
		<form
			className="flex flex-wrap items-center gap-2"
			onSubmit={e => {
				e.preventDefault();
				doSave();
			}}
		>
			<Select
				aria-label="方法"
				className="w-24 font-medium"
				value={current.def.method}
				onChange={e =>
					setDraft({ ...current, def: { ...current.def, method: e.target.value } })
				}
			>
				{METHODS.map(m => (
					<option key={m}>{m}</option>
				))}
			</Select>
			<Input
				aria-label="请求地址"
				className="min-w-48 flex-1 font-mono text-xs"
				placeholder="{{baseUrl}}/api/user/:id"
				value={current.def.url}
				onChange={e =>
					setDraft({ ...current, def: { ...current.def, url: e.target.value } })
				}
			/>
			{children?.(current, dirty)}
			<Button type="submit" disabled={!dirty || save.isPending} title={`保存 (${MOD_KEY}S)`}>
				<Save size={14} />
				{dirty ? "保存" : "已保存"}
			</Button>
		</form>
	);
	return (
		<div
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
			<RequestFields
				draft={current}
				setDraft={setDraft}
				requestId={id}
				urlBar={urlBar}
				inherited={query.data?.inherited}
			/>
		</div>
	);
};
