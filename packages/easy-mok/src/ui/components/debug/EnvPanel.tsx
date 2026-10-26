import { ChevronRight, KeyRound, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import { DEBUG_NAME_RE, type EnvGroup, type SecretItem } from "@/api/debug-contract";
import {
	useClearCookies,
	useCookies,
	useDeleteEnv,
	useEnterSecret,
	type SecretSourceInput,
	useDeleteSecret,
	useEnvs,
	useRenameEnv,
	useSaveEnv,
	useSaveSecret,
	useSecrets,
	useSetActiveEnv,
} from "@/api/debug-queries";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { ConfirmDialog, Dialog } from "../ui/dialog";
import { Input, Label, Select } from "../ui/input";
import { ErrorState, Spinner } from "../ui/state";
import { VarsEditor, varsToRecord } from "./KeyValueEditor";

const fail = (err: unknown) => toast.error(errorMessage(err));

/** 命令行按空白拆分, 支持单双引号; 不做变量展开 */
export const splitArgs = (text: string) => {
	const out: string[] = [];
	const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text))) out.push(m[1] ?? m[2] ?? m[3]);
	return out;
};

const FROM_TEXT: Record<string, string> = {
	value: "明文值",
	env: "环境变量",
	keychain: "系统钥匙串",
	command: "命令输出",
	prompt: "发送时输入",
};

const describe = (s: SecretItem) =>
	!s.configured
		? "未配置"
		: s.from === "env"
			? `环境变量 ${s.envName}`
			: s.from === "keychain"
				? `钥匙串 ${s.service} / ${s.account}`
				: s.from === "command"
					? `命令 ${(s.argv || []).join(" ")}`
					: s.from === "prompt"
						? s.entered
							? "发送时输入(本次运行已输入)"
							: "发送时输入(尚未输入)"
						: "明文值(保存在不提交的 secret/ 中)";

/** prompt 来源的输入框; 值只发到本机服务端内存 */
export const PromptSecretDialog = ({ env, srcId, onClose, onDone }: { env: string; srcId: string; onClose: () => void; onDone?: () => void }) => {
	const enter = useEnterSecret();
	const [value, setValue] = useState("");
	const submit = () =>
		value &&
		!enter.isPending &&
		enter.mutate(
			{ env, id: srcId, value },
			{
				onSuccess: () => {
					onClose();
					onDone?.();
				},
				onError: fail,
			}
		);
	return (
		<Dialog
			open
			onClose={onClose}
			title={`输入敏感值 ${srcId}`}
			footer={
				<>
					<Button onClick={onClose}>取消</Button>
					<Button variant="default" disabled={!value || enter.isPending} onClick={submit}>
						确定
					</Button>
				</>
			}
		>
			<Label>
				环境组 {env} 的来源 {srcId}; 值只保存在 mock 服务的内存中, 重启后需要重新输入
				<Input type="password" autoFocus value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} />
			</Label>
		</Dialog>
	);
};

const SecretsEditor = ({ env }: { env: string }) => {
	const secrets = useSecrets(env);
	const save = useSaveSecret();
	const remove = useDeleteSecret();
	const [id, setId] = useState("");
	const [from, setFrom] = useState<SecretSourceInput["from"]>("keychain");
	const [a, setA] = useState("");
	const [b, setB] = useState("");
	const [prompting, setPrompting] = useState<string | null>(null);
	const idRef = useRef<HTMLInputElement>(null);
	const sourceOf = (): SecretSourceInput | null =>
		from === "value"
			? a ? { from, value: a } : null
			: from === "env"
				? a ? { from, name: a } : null
				: from === "keychain"
					? a ? { from, service: a, account: b } : null
					: from === "command"
						? splitArgs(a).length ? { from, argv: splitArgs(a) } : null
						: { from: "prompt" };
	const source = sourceOf();
	const valid = /^[A-Za-z0-9_]{1,64}$/.test(id) && !!source;
	return (
		<div className="space-y-2">
			<p className="flex items-center gap-1 text-xs text-zinc-500">
				<KeyRound size={13} />
				值不会显示, 只能在本机配置
			</p>
			{!!secrets.data?.length && (
				<ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200 bg-white text-xs dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
					{secrets.data.map(s => (
						<li key={s.id} className="flex items-center gap-1 py-1 pr-1 pl-2">
							<code className="shrink-0 font-semibold">{s.id}</code>
							<span className={cn("min-w-0 flex-1 truncate", s.configured ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700")} title={describe(s)}>
								{describe(s)}
							</span>
							{s.from === "prompt" && (
								<Button size="sm" variant="ghost" onClick={() => setPrompting(s.id)}>
									输入
								</Button>
							)}
							<Button
								size="sm"
								variant="ghost"
								onClick={() => {
									setId(s.id);
									idRef.current?.focus();
								}}
							>
								{s.configured ? "修改" : "配置"}
							</Button>
							{s.configured && (
								<Button size="icon" variant="ghost" aria-label={`删除来源 ${s.id}`} onClick={() => remove.mutate({ env, id: s.id }, { onError: fail })}>
									<Trash2 size={13} />
								</Button>
							)}
						</li>
					))}
				</ul>
			)}
			<form
				className="grid grid-cols-2 gap-1.5"
				onSubmit={e => {
					e.preventDefault();
					if (!valid || !source) return;
					save.mutate(
						{ env, id, source },
						{
							onSuccess: () => {
								toast.success(`已配置来源 ${id}`);
								setId("");
								setA("");
								setB("");
							},
							onError: fail,
						}
					);
				}}
			>
				<Input ref={idRef} aria-label="来源 id" className="font-mono text-xs" placeholder="来源 id" value={id} onChange={e => setId(e.target.value)} />
				<Select
					aria-label="来源类型"
					className="text-xs"
					value={from}
					onChange={e => {
						setFrom(e.target.value as SecretSourceInput["from"]);
						setA("");
						setB("");
					}}
				>
					{Object.entries(FROM_TEXT).map(([k, t]) => (
						<option key={k} value={k}>
							{t}
						</option>
					))}
				</Select>
				{from !== "prompt" && (
					<Input
						aria-label="来源取值"
						type={from === "value" ? "password" : "text"}
						className={cn("font-mono text-xs", from !== "keychain" && "col-span-2")}
						placeholder={{ value: "值", env: "环境变量名", keychain: "service", command: "如 op read op://dev/api/token", prompt: "" }[from]}
						value={a}
						onChange={e => setA(e.target.value)}
					/>
				)}
				{from === "keychain" && (
					<Input aria-label="钥匙串 account" className="font-mono text-xs" placeholder="account" value={b} onChange={e => setB(e.target.value)} />
				)}
				<Button size="sm" type="submit" className="col-span-2 justify-self-start" disabled={!valid || save.isPending}>
					<Plus size={14} />
					保存来源
				</Button>
			</form>
			<details className="text-xs text-zinc-500">
				<summary className="cursor-pointer select-none hover:text-zinc-700 dark:hover:text-zinc-300">怎么引用</summary>
				<p className="mt-1">
					在变量值里写 <code>{"<secret:来源id>"}</code> 引用来源. 推荐用钥匙串(macOS 的 security, Linux 的 secret-tool), 命令输出或发送时输入, 不把明文写进文件; 命令不经 shell 执行, 超时 15 秒, 结果在内存中缓存 10 分钟.
				</p>
			</details>
			{prompting && <PromptSecretDialog env={env} srcId={prompting} onClose={() => setPrompting(null)} />}
		</div>
	);
};

const CookieList = ({ env }: { env: string }) => {
	const cookies = useCookies(env);
	const clear = useClearCookies();
	const list = cookies.data || [];
	return (
		<div className="space-y-1">
			<div className="flex items-center gap-1 text-xs text-zinc-500">
				发送时自动保存与携带, 不显示值
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
							<code className="shrink-0">{c.name}</code>
							<span className="min-w-0 flex-1 truncate text-zinc-500">
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
	const body = { title: title || null, weight: Number(weight), vars: varsToRecord(vars) };
	const dirty =
		(body.title ?? group.name) !== group.title || body.weight !== group.weight || JSON.stringify(body.vars) !== JSON.stringify(group.vars);
	return (
		<div className="space-y-3">
			<div className="flex items-end gap-2">
				<Label className="min-w-0 flex-1">
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
				<Label className="min-w-0 flex-1">
					展示名
					<Input value={title} placeholder={group.name} onChange={e => setTitle(e.target.value)} />
				</Label>
				<Label className="w-20">
					权重
					<Input value={weight} inputMode="numeric" onChange={e => setWeight(e.target.value)} />
				</Label>
			</div>
			<div className="space-y-1">
				<div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">环境变量</div>
				<VarsEditor label="环境变量" vars={vars} onChange={setVars} />
			</div>
			<Button
				size="sm"
				variant={dirty ? "default" : "outline"}
				disabled={!dirty || save.isPending || !Number.isSafeInteger(Number(weight))}
				onClick={() => save.mutate({ name: group.name, body, etag: group.etag }, { onSuccess: () => toast.success("环境组已保存"), onError: fail })}
			>
				<Save size={14} />
				{dirty ? "保存环境组" : "已保存"}
			</Button>
		</div>
	);
};

/** 调试页右侧面板的可折叠分区 */
export const PanelSection = ({ title, defaultOpen = true, children }: { title: ReactNode; defaultOpen?: boolean; children: ReactNode }) => (
	<details open={defaultOpen} className="group/section border-b border-zinc-200 dark:border-zinc-800">
		<summary className="flex cursor-pointer list-none items-center gap-1 px-3 py-2.5 text-xs font-semibold text-zinc-700 select-none hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900 [&::-webkit-details-marker]:hidden">
			<ChevronRight size={14} className="text-zinc-400 transition-transform group-open/section:rotate-90" />
			{title}
		</summary>
		<div className="space-y-3 px-3 pb-3">{children}</div>
	</details>
);

/** 发送时使用的环境组; 请求栏与右侧面板共用 */
export const ActiveEnvSelect = ({ label = "激活的环境组", className }: { label?: string; className?: string }) => {
	const envs = useEnvs();
	const setActive = useSetActiveEnv();
	return (
		<Select
			aria-label={label}
			title={label}
			className={className}
			disabled={!envs.data || setActive.isPending}
			value={envs.data?.active || ""}
			onChange={e => setActive.mutate(e.target.value || null, { onError: fail })}
		>
			<option value="">不使用环境组</option>
			{envs.data?.groups.map(g => (
				<option key={g.name} value={g.name}>
					{g.title}
				</option>
			))}
		</Select>
	);
};

/** 环境组管理: 激活组选择, 组的增删改与变量, 敏感值来源 */
export const EnvPanel = () => {
	const envs = useEnvs();
	const save = useSaveEnv();
	const remove = useDeleteEnv();
	const [selected, setSelected] = useState<string | null>(null);
	const [creating, setCreating] = useState("");
	const [deleting, setDeleting] = useState<string | null>(null);
	if (envs.isPending)
		return (
			<PanelSection title="环境组">
				<Spinner label="加载环境组" />
			</PanelSection>
		);
	if (envs.isError)
		return (
			<PanelSection title="环境组">
				<ErrorState error={envs.error} onRetry={() => envs.refetch()} />
			</PanelSection>
		);
	const { groups, active, problems } = envs.data;
	const current = groups.find(g => g.name === (selected ?? active)) || groups[0];
	return (
		<>
			<PanelSection title="环境组">
				<Label>
					激活的环境组(发送时使用)
					<ActiveEnvSelect />
				</Label>
				{problems.map((p, i) => (
					<p key={i} className="text-xs text-amber-700">
						{p.message}
					</p>
				))}
				<div className="space-y-1.5">
					<div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">编辑</div>
					<div className="flex flex-wrap items-center gap-1" role="group" aria-label="选择要编辑的环境组">
						{groups.map(g => (
							<Button
								key={g.name}
								size="sm"
								aria-pressed={current?.name === g.name}
								variant={current?.name === g.name ? "default" : "outline"}
								title={g.name === active ? "已激活" : undefined}
								onClick={() => setSelected(g.name)}
							>
								{g.name === active && <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />}
								{g.title}
							</Button>
						))}
					</div>
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
					<Input aria-label="新环境组名" className="h-7 font-mono text-xs" placeholder="新环境组名, 如 dev" value={creating} onChange={e => setCreating(e.target.value)} />
					<Button size="sm" type="submit" disabled={!DEBUG_NAME_RE.test(creating)}>
						<Plus size={14} />
						新建
					</Button>
				</form>
				{current && (
					<div className="space-y-3 rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
						<div className="flex items-center gap-1.5 text-sm font-medium">
							{current.title}
							{current.name === active && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">已激活</span>}
							<Button size="icon" variant="ghost" className="ml-auto" aria-label={`删除环境组 ${current.name}`} onClick={() => setDeleting(current.name)}>
								<Trash2 size={14} />
							</Button>
						</div>
						<GroupEditor key={current.name} group={current} />
					</div>
				)}
			</PanelSection>
			{current && (
				<PanelSection title={`敏感值来源 · ${current.title}`}>
					<SecretsEditor key={current.name} env={current.name} />
				</PanelSection>
			)}
			{current && (
				<PanelSection title={`Cookie · ${current.title}`}>
					<CookieList env={current.name} />
				</PanelSection>
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
		</>
	);
};
