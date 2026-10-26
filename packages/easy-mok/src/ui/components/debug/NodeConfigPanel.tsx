import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import type { Auth, DebugTree, NodeConfig, Row, Settings, TreeNode } from "@/api/debug-contract";
import { useSaveCollection, useUpdateNode } from "@/api/debug-queries";
import { KvList } from "../ui/kv";
import { EditActions, Panel, Section } from "../ui/panel";
import { Hint } from "../ui/input";
import { Tabs } from "../ui/tabs";
import { AuthEditor, InheritedHeaders, SettingsEditor, inheritFromLayers } from "./ConfigEditors";
import { NameTitle } from "./DebugTree";
import { RowsEditor, VarsEditor, varsToRecord } from "./KeyValueEditor";

const TABS = [
	{ id: "vars", label: "变量" },
	{ id: "headers", label: "请求头" },
	{ id: "auth", label: "认证" },
	{ id: "settings", label: "设置" },
] as const;
type Tab = (typeof TABS)[number]["id"];

type Draft = {
	vars: Array<[string, string]>;
	headers: Row[];
	settings: Settings;
	auth: Auth | null;
};

/** 从集合根到 id 的祖先分组(不含自身), 用于计算继承 */
const ancestorsOf = (nodes: TreeNode[], id: string): TreeNode[] => {
	const out: TreeNode[] = [];
	let level = nodes;
	const segments = id.split("/");
	for (let i = 1; i < segments.length; i++) {
		const n = level.find(x => x.id === segments.slice(0, i).join("/"));
		if (!n) break;
		out.push(n);
		level = n.children || [];
	}
	return out;
};

/**
 * 集合或分组的变量与请求默认配置; 下层请求未覆盖的部分沿用这里的值.
 * 默认只读, 点「编辑」切换, 取消丢弃修改.
 */
export const NodeConfigPanel = ({ tree, group }: { tree: DebugTree; group: TreeNode | null }) => {
	const [tab, setTab] = useState<Tab>("headers");
	const [draft, setDraft] = useState<Draft | null>(null);
	const saveCollection = useSaveCollection();
	const update = useUpdateNode();
	const own: { vars: Record<string, string> } & NodeConfig = group
		? { vars: group.vars, ...(group.config || { headers: [], settings: {}, auth: null }) }
		: tree.root;
	const layer = group ? "本分组" : "集合";
	const inherited = group
		? inheritFromLayers([
				{ from: "collection", config: tree.root },
				...ancestorsOf(tree.nodes, group.id).map(n => ({
					from: `group:${n.id}`,
					config: n.config,
				})),
			])
		: inheritFromLayers([]);
	const editing = !!draft;
	const save = () => {
		if (!draft) return;
		const body = {
			vars: varsToRecord(draft.vars),
			headers: draft.headers.filter(r => r[0]),
			settings: draft.settings,
			auth: draft.auth,
		};
		const done = {
			onSuccess: () => (toast.success("已保存默认配置"), setDraft(null)),
			onError: (e: unknown) => toast.error(errorMessage(e)),
		};
		if (group) update.mutate({ id: group.id, patch: body }, done);
		else saveCollection.mutate({ body, etag: tree.root.etag }, done);
	};
	const varItems = Object.entries(own.vars).map(([k, v]) => [k, v] as const);
	return (
		<Panel
			title={
				<span className="flex min-w-0 items-baseline gap-2">
					{group ? (
						<span className="truncate">
							分组 <NameTitle name={group.name} title={group.title} />
						</span>
					) : (
						"请求集合"
					)}
					<span className="truncate text-xs font-normal text-zinc-400">默认配置</span>
				</span>
			}
			tabs={<Tabs inPanel label="默认配置" items={TABS} value={tab} onChange={setTab} />}
			actions={
				<EditActions
					editing={editing}
					editLabel={group ? "编辑分组默认配置" : "编辑集合默认配置"}
					saveLabel="保存默认配置"
					saving={update.isPending || saveCollection.isPending}
					onEdit={() =>
						setDraft({
							vars: Object.entries(own.vars),
							headers: own.headers,
							settings: own.settings,
							auth: own.auth,
						})
					}
					onCancel={() => setDraft(null)}
					onSave={save}
				/>
			}
		>
			<Hint>
				{group ? "分组下的请求" : "全部请求"}没有覆盖的变量, 请求头,
				认证与发送设置都沿用这里的值; 请求与分组里的同名配置优先.
			</Hint>
			{tab === "vars" &&
				(draft ? (
					<VarsEditor
						label={`${layer}变量`}
						vars={draft.vars}
						onChange={vars => setDraft({ ...draft, vars })}
					/>
				) : (
					<KvList mono items={varItems} empty="没有变量" />
				))}
			{tab === "headers" && (
				<>
					<InheritedHeaders items={inherited.headers} />
					<Section title={`${layer}的请求头`}>
						{draft ? (
							<RowsEditor
								label="请求头"
								rows={draft.headers}
								onChange={headers => setDraft({ ...draft, headers })}
							/>
						) : (
							<KvList
								mono
								empty="没有请求头"
								items={own.headers.map(([k, v, on]) => [
									k,
									on ? (
										v
									) : (
										<span className="font-sans text-zinc-400">
											屏蔽外层同名头
										</span>
									),
								])}
							/>
						)}
					</Section>
				</>
			)}
			{tab === "auth" && (
				<AuthEditor
					allowInherit={false}
					layer={layer}
					readOnly={!draft}
					value={draft ? draft.auth : own.auth}
					inherited={inherited.auth}
					onChange={auth => draft && setDraft({ ...draft, auth })}
				/>
			)}
			{tab === "settings" && (
				<SettingsEditor
					layer={layer}
					readOnly={!draft}
					value={draft ? draft.settings : own.settings}
					inherited={inherited.settings}
					onChange={settings => draft && setDraft({ ...draft, settings })}
				/>
			)}
		</Panel>
	);
};
