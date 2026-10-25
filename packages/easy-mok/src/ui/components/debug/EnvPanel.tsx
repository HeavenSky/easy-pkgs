import { KeyRound, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import { DEBUG_NAME_RE, type EnvGroup } from "@/api/debug-contract";
import {
	useClearCookies,
	useCookies,
	useDeleteEnv,
	useDeleteSecret,
	useEnvs,
	useRenameEnv,
	useSaveEnv,
	useSaveSecret,
	useSecrets,
	useSetActiveEnv,
} from "@/api/debug-queries";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/dialog";
import { Input, Label, Select } from "../ui/input";
import { ErrorState, Spinner } from "../ui/state";
import { VarsEditor, varsToRecord } from "./KeyValueEditor";

const fail = (err: unknown) => toast.error(errorMessage(err));

const SecretsEditor = ({ env }: { env: string }) => {
	const secrets = useSecrets(env);
	const save = useSaveSecret();
	const remove = useDeleteSecret();
	const [id, setId] = useState("");
	const [from, setFrom] = useState<"value" | "env">("value");
	const [value, setValue] = useState("");
	const submit = (srcId: string) =>
		save.mutate(
			{ env, id: srcId, source: from === "value" ? { from, value } : { from, name: value } },
			{
				onSuccess: () => {
					toast.success(`已配置来源 ${srcId}`);
					setId("");
					setValue("");
				},
				onError: fail,
			}
		);
	return (
		<div className="space-y-2">
			<div className="flex items-center gap-1 text-xs font-medium text-zinc-500">
				<KeyRound size={13} />
				敏感值来源(值不会显示; 只能在本机配置)
			</div>
			{secrets.data?.map(s => (
				<div key={s.id} className="flex items-center gap-2 text-xs">
					<code>{s.id}</code>
					{s.configured ? (
						<span className="text-emerald-700">{s.from === "env" ? `环境变量 ${s.envName}` : "已配置明文值"}</span>
					) : (
						<span className="text-amber-700">未配置</span>
					)}
					<Button size="sm" variant="ghost" onClick={() => setId(s.id)}>
						{s.configured ? "修改" : "配置"}
					</Button>
					{s.configured && (
						<Button size="icon" variant="ghost" aria-label={`删除来源 ${s.id}`} onClick={() => remove.mutate({ env, id: s.id }, { onError: fail })}>
							<Trash2 size={13} />
						</Button>
					)}
				</div>
			))}
			<form
				className="flex flex-wrap items-end gap-1.5"
				onSubmit={e => {
					e.preventDefault();
					if (/^[A-Za-z0-9_]{1,64}$/.test(id)) submit(id);
				}}
			>
				<Input aria-label="来源 id" className="w-28 font-mono text-xs" placeholder="来源 id" value={id} onChange={e => setId(e.target.value)} />
				<Select aria-label="来源类型" className="w-24 text-xs" value={from} onChange={e => setFrom(e.target.value as "value" | "env")}>
					<option value="value">明文值</option>
					<option value="env">环境变量</option>
				</Select>
				<Input
					aria-label="来源取值"
					type={from === "value" ? "password" : "text"}
					className="w-40 font-mono text-xs"
					placeholder={from === "value" ? "值" : "环境变量名"}
					value={value}
					onChange={e => setValue(e.target.value)}
				/>
				<Button size="sm" type="submit" disabled={!/^[A-Za-z0-9_]{1,64}$/.test(id) || save.isPending}>
					保存来源
				</Button>
			</form>
			<p className="text-xs text-zinc-500">
				在变量值里写 <code>{"<secret:来源id>"}</code> 引用来源.
			</p>
		</div>
	);
};

const CookieList = ({ env }: { env: string }) => {
	const cookies = useCookies(env);
	const clear = useClearCookies();
	const list = cookies.data || [];
	return (
		<div className="space-y-1">
			<div className="flex items-center gap-1 text-xs font-medium text-zinc-500">
				Cookie jar(发送时自动保存与携带; 不显示值)
				{list.length > 0 && (
					<Button size="sm" variant="ghost" className="ml-auto" onClick={() => clear.mutate({ env }, { onError: fail })}>
						全部清除
					</Button>
				)}
			</div>
			{list.length ? (
				<ul className="text-xs">
					{list.map(c => (
						<li key={`${c.domain}${c.path}${c.name}`} className="flex items-center gap-2">
							<code>{c.name}</code>
							<span className="text-zinc-500">
								{c.domain}
								{c.path}
								{c.secure ? " · Secure" : ""}
								{c.expires ? ` · 到期 ${new Date(c.expires).toLocaleString("zh-CN", { hour12: false })}` : " · 会话"}
							</span>
							<Button
								size="icon"
								variant="ghost"
								aria-label={`删除 cookie ${c.name}`}
								onClick={() => clear.mutate({ env, name: c.name, domain: c.domain, path: c.path }, { onError: fail })}
							>
								<Trash2 size={12} />
							</Button>
						</li>
					))}
				</ul>
			) : (
				<p className="text-xs text-zinc-400">暂无</p>
			)}
		</div>
	);
};

const GroupEditor = ({ group }: { group: EnvGroup }) => {
	const save = useSaveEnv();
	const rename = useRenameEnv();
	const [title, setTitle] = useState(group.title === group.name ? "" : group.title);
	const [weight, setWeight] = useState(String(group.weight));
	const [vars, setVars] = useState<Array<[string, string]>>(Object.entries(group.vars));
	const [name, setName] = useState(group.name);
	useEffect(() => {
		setTitle(group.title === group.name ? "" : group.title);
		setWeight(String(group.weight));
		setVars(Object.entries(group.vars));
		setName(group.name);
	}, [group]);
	return (
		<div className="space-y-3">
			<div className="flex items-end gap-2">
				<Label className="flex-1">
					组名
					<Input value={name} onChange={e => setName(e.target.value)} className="font-mono" />
				</Label>
				<Button
					size="sm"
					disabled={name === group.name || !DEBUG_NAME_RE.test(name) || rename.isPending}
					onClick={() => rename.mutate({ name: group.name, to: name }, { onSuccess: () => toast.success("已改名"), onError: fail })}
				>
					改名
				</Button>
			</div>
			<div className="flex gap-2">
				<Label className="flex-1">
					展示名
					<Input value={title} onChange={e => setTitle(e.target.value)} />
				</Label>
				<Label className="w-24">
					权重
					<Input value={weight} onChange={e => setWeight(e.target.value)} />
				</Label>
			</div>
			<VarsEditor label="环境变量" vars={vars} onChange={setVars} />
			<Button
				size="sm"
				variant="default"
				disabled={save.isPending || !Number.isSafeInteger(Number(weight))}
				onClick={() =>
					save.mutate(
						{ name: group.name, body: { title: title || null, weight: Number(weight), vars: varsToRecord(vars) }, etag: group.etag },
						{ onSuccess: () => toast.success("环境组已保存"), onError: fail }
					)
				}
			>
				保存环境组
			</Button>
			<SecretsEditor env={group.name} />
			<CookieList env={group.name} />
		</div>
	);
};

/** 环境组管理: 激活组选择, 组的增删改与变量, 敏感值来源 */
export const EnvPanel = () => {
	const envs = useEnvs();
	const setActive = useSetActiveEnv();
	const save = useSaveEnv();
	const remove = useDeleteEnv();
	const [selected, setSelected] = useState<string | null>(null);
	const [creating, setCreating] = useState("");
	const [deleting, setDeleting] = useState<string | null>(null);
	if (envs.isPending) return <Spinner label="加载环境组" />;
	if (envs.isError) return <ErrorState error={envs.error} onRetry={() => envs.refetch()} />;
	const { groups, active, problems } = envs.data;
	const current = groups.find(g => g.name === (selected ?? active)) || groups[0];
	return (
		<div className="space-y-3">
			<Label>
				激活的环境组
				<Select value={active || ""} onChange={e => setActive.mutate(e.target.value || null, { onError: fail })}>
					<option value="">不使用</option>
					{groups.map(g => (
						<option key={g.name} value={g.name}>
							{g.title}
						</option>
					))}
				</Select>
			</Label>
			{problems.map((p, i) => (
				<p key={i} className="text-xs text-amber-700">
					{p.message}
				</p>
			))}
			<div className="flex flex-wrap items-center gap-1">
				{groups.map(g => (
					<Button key={g.name} size="sm" variant={current?.name === g.name ? "default" : "outline"} onClick={() => setSelected(g.name)}>
						{g.title}
					</Button>
				))}
			</div>
			<form
				className="flex gap-1"
				onSubmit={e => {
					e.preventDefault();
					if (!DEBUG_NAME_RE.test(creating)) return;
					save.mutate(
						{ name: creating, body: { vars: {} } },
						{
							onSuccess: g => {
								setSelected(g.name);
								setCreating("");
							},
							onError: fail,
						}
					);
				}}
			>
				<Input aria-label="新环境组名" className="font-mono text-xs" placeholder="新环境组名, 如 dev" value={creating} onChange={e => setCreating(e.target.value)} />
				<Button size="sm" type="submit" disabled={!DEBUG_NAME_RE.test(creating)}>
					<Plus size={14} />
					新建
				</Button>
			</form>
			{current && (
				<div className="space-y-2 rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
					<div className="flex items-center text-sm font-medium">
						{current.title}
						<Button size="icon" variant="ghost" className="ml-auto" aria-label={`删除环境组 ${current.name}`} onClick={() => setDeleting(current.name)}>
							<Trash2 size={14} />
						</Button>
					</div>
					<GroupEditor key={current.name} group={current} />
				</div>
			)}
			<ConfirmDialog
				open={!!deleting}
				title="删除环境组"
				danger
				confirmText="删除"
				message={<>确定删除环境组「{deleting}」? 它的敏感值来源与 cookie 也会删除.</>}
				onClose={() => setDeleting(null)}
				onConfirm={() => deleting && remove.mutate(deleting, { onSuccess: () => setSelected(null), onError: fail })}
			/>
		</div>
	);
};
