import { ChevronRight, KeyRound, Plus, Trash2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
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
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ConfirmDialog, Dialog } from "../ui/dialog";
import { Hint, Input, Label, Select } from "../ui/input";
import { KvList } from "../ui/kv";
import { EditActions, Section } from "../ui/panel";
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

/** 设置栏内的只读列表: 内层用 rounded-md 细边框, 行之间用浅分隔线 */
const LIST =
	"divide-y divide-zinc-100 rounded-md border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900";
const ROW = "flex min-h-8 items-center gap-1.5 py-1 pr-1 pl-2";

/** prompt 来源的输入框; 值只发到本机服务端内存 */
export const PromptSecretDialog = ({
	env,
	srcId,
	onClose,
	onDone,
}: {
	env: string;
	srcId: string;
	onClose: () => void;
	onDone?: () => void;
}) => {
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
			className="w-[min(480px,92vw)]"
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
				<Input
					type="password"
					autoFocus
					value={value}
					onChange={e => setValue(e.target.value)}
					onKeyDown={e => e.key === "Enter" && submit()}
				/>
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
			? a
				? { from, value: a }
				: null
			: from === "env"
				? a
					? { from, name: a }
					: null
				: from === "keychain"
					? a
						? { from, service: a, account: b }
						: null
					: from === "command"
						? splitArgs(a).length
							? { from, argv: splitArgs(a) }
							: null
						: { from: "prompt" };
	const source = sourceOf();
	const valid = /^[A-Za-z0-9_]{1,64}$/.test(id) && !!source;
	return (
		<>
			<Hint className="flex items-center gap-1">
				<KeyRound size={12} />
				值不会显示, 只能在本机配置
			</Hint>
			{!!secrets.data?.length && (
				<ul className={LIST}>
					{secrets.data.map(s => (
						<li key={s.id} className={ROW}>
							<code className="shrink-0 font-mono text-xs font-medium">{s.id}</code>
							<span
								className={cn(
									"min-w-0 flex-1 truncate text-xs",
									s.configured
										? "text-emerald-700 dark:text-emerald-400"
										: "text-amber-700 dark:text-amber-400"
								)}
								title={describe(s)}
							>
								{describe(s)}
							</span>
							{s.from === "prompt" && (
								<Button
									size="sm"
									variant="ghost"
									onClick={() => setPrompting(s.id)}
								>
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
								<Button
									size="icon-sm"
									variant="ghost"
									aria-label={`删除来源 ${s.id}`}
									title={`删除来源 ${s.id}`}
									onClick={() =>
										remove.mutate({ env, id: s.id }, { onError: fail })
									}
								>
									<Trash2 size={12} />
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
				<Input
					ref={idRef}
					aria-label="来源 id"
					className="font-mono text-xs"
					placeholder="来源 id"
					value={id}
					onChange={e => setId(e.target.value)}
				/>
				<Select
					aria-label="来源类型"
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
						placeholder={
							{
								value: "值",
								env: "环境变量名",
								keychain: "service",
								command: "如 op read op://dev/api/token",
								prompt: "",
							}[from]
						}
						value={a}
						onChange={e => setA(e.target.value)}
					/>
				)}
				{from === "keychain" && (
					<Input
						aria-label="钥匙串 account"
						className="font-mono text-xs"
						placeholder="account"
						value={b}
						onChange={e => setB(e.target.value)}
					/>
				)}
				<Button
					type="submit"
					className="col-span-2 justify-self-start"
					disabled={!valid || save.isPending}
				>
					<Plus size={14} />
					保存来源
				</Button>
			</form>
			<details className="text-xs text-zinc-500 dark:text-zinc-400">
				<summary className="cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-200">
					怎么引用
				</summary>
				<p className="mt-1">
					在变量值里写 <code className="font-mono">{"<secret:来源id>"}</code> 引用来源.
					推荐用钥匙串(macOS 的 security, Linux 的 secret-tool), 命令输出或发送时输入,
					不把明文写进文件; 命令不经 shell 执行, 超时 15 秒, 结果在内存中缓存 10 分钟.
				</p>
			</details>
			{prompting && (
				<PromptSecretDialog
					env={env}
					srcId={prompting}
					onClose={() => setPrompting(null)}
				/>
			)}
		</>
	);
};

const CookieList = ({ env }: { env: string }) => {
	const cookies = useCookies(env);
	const clear = useClearCookies();
	const list = cookies.data || [];
	return (
		<>
			<div className="flex min-h-6 items-center gap-2">
				<Hint>发送时自动保存与携带, 不显示值</Hint>
				{list.length > 0 && (
					<Button
						size="sm"
						variant="ghost"
						className="ml-auto"
						onClick={() => clear.mutate({ env }, { onError: fail })}
					>
						全部清除
					</Button>
				)}
			</div>
			{list.length ? (
				<ul className={LIST}>
					{list.map(c => (
						<li key={`${c.domain}${c.path}${c.name}`} className={ROW}>
							<code className="shrink-0 font-mono text-xs font-medium">{c.name}</code>
							<span className="min-w-0 flex-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
								{c.domain}
								{c.path}
								{c.secure ? " · Secure" : ""}
								{c.expires
									? ` · 到期 ${new Date(c.expires).toLocaleString("zh-CN", { hour12: false })}`
									: " · 会话"}
							</span>
							<Button
								size="icon-sm"
								variant="ghost"
								aria-label={`删除 cookie ${c.name}`}
								title={`删除 cookie ${c.name}`}
								onClick={() =>
									clear.mutate(
										{ env, name: c.name, domain: c.domain, path: c.path },
										{ onError: fail }
									)
								}
							>
								<Trash2 size={12} />
							</Button>
						</li>
					))}
				</ul>
			) : (
				<p className="text-xs text-zinc-400">暂无</p>
			)}
		</>
	);
};

/** 环境组详情: 默认只读, 点「编辑」切到输入框; 保存时先存展示名, 权重与变量, 组名变了再走改名接口 */
const GroupEditor = ({
	group,
	active,
	onDelete,
}: {
	group: EnvGroup;
	active: boolean;
	onDelete: () => void;
}) => {
	const save = useSaveEnv();
	const rename = useRenameEnv();
	const [editing, setEditing] = useState(false);
	const [title, setTitle] = useState("");
	const [weight, setWeight] = useState("");
	const [vars, setVars] = useState<Array<[string, string]>>([]);
	const [name, setName] = useState("");
	const start = () => {
		setTitle(group.title === group.name ? "" : group.title);
		setWeight(String(group.weight));
		setVars(Object.entries(group.vars));
		setName(group.name);
		setEditing(true);
	};
	const body = { title: title || null, weight: Number(weight), vars: varsToRecord(vars) };
	const dirty =
		(body.title ?? group.name) !== group.title ||
		body.weight !== group.weight ||
		JSON.stringify(body.vars) !== JSON.stringify(group.vars);
	const renamed = name !== group.name;
	const valid = Number.isSafeInteger(Number(weight)) && (!renamed || DEBUG_NAME_RE.test(name));
	const doRename = () =>
		rename.mutate(
			{ name: group.name, to: name },
			{
				onSuccess: () => {
					toast.success("已改名");
					setEditing(false);
				},
				onError: fail,
			}
		);
	const submit = () => {
		if (!dirty) return renamed ? doRename() : setEditing(false);
		save.mutate(
			{ name: group.name, body, etag: group.etag },
			{
				onSuccess: () => {
					toast.success("环境组已保存");
					if (renamed) doRename();
					else setEditing(false);
				},
				onError: fail,
			}
		);
	};
	const varItems = Object.entries(group.vars).map(([k, v]) => [k, v] as const);
	return (
		<div className="space-y-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
			<div className="flex min-h-6 items-center gap-1.5">
				<span className="min-w-0 truncate text-sm font-medium">{group.title}</span>
				{active && (
					<Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
						已激活
					</Badge>
				)}
				<span className="ml-auto flex shrink-0 items-center gap-1">
					<EditActions
						editing={editing}
						onEdit={start}
						onCancel={() => setEditing(false)}
						onSave={submit}
						canSave={(dirty || renamed) && valid}
						saving={save.isPending || rename.isPending}
						editLabel="编辑环境组"
						saveLabel="保存环境组"
					/>
					{!editing && (
						<Button
							size="icon-sm"
							variant="ghost"
							aria-label={`删除环境组 ${group.name}`}
							title={`删除环境组 ${group.name}`}
							onClick={onDelete}
						>
							<Trash2 size={12} />
						</Button>
					)}
				</span>
			</div>
			{editing ? (
				<>
					<div className="grid gap-2">
						<Label>
							组名
							<Input
								value={name}
								aria-invalid={renamed && !DEBUG_NAME_RE.test(name)}
								onChange={e => setName(e.target.value)}
								className="font-mono text-xs"
							/>
						</Label>
						<div className="flex gap-2">
							<Label className="flex-1">
								展示名
								<Input
									value={title}
									placeholder={group.name}
									onChange={e => setTitle(e.target.value)}
								/>
							</Label>
							<Label className="w-20">
								权重
								<Input
									value={weight}
									inputMode="numeric"
									aria-invalid={!Number.isSafeInteger(Number(weight))}
									onChange={e => setWeight(e.target.value)}
								/>
							</Label>
						</div>
					</div>
					<Section title="环境变量">
						<VarsEditor label="环境变量" vars={vars} onChange={setVars} />
					</Section>
				</>
			) : (
				<>
					<KvList
						items={[
							["组名", <code className="font-mono text-xs">{group.name}</code>],
							["展示名", group.title === group.name ? "—" : group.title],
							["权重", group.weight],
						]}
					/>
					<Section title="环境变量">
						<KvList mono items={varItems} empty="暂无变量" />
					</Section>
				</>
			)}
		</div>
	);
};

/** 调试页右侧设置栏的可折叠分区: 全宽分区头, 底部分隔线 */
export const PanelSection = ({
	title,
	defaultOpen = true,
	children,
}: {
	title: ReactNode;
	defaultOpen?: boolean;
	children: ReactNode;
}) => (
	<details
		open={defaultOpen}
		className="group/section border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
	>
		<summary className="flex min-h-9 cursor-pointer list-none items-center gap-1 px-3 text-xs font-medium text-zinc-900 select-none hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-zinc-800/60 [&::-webkit-details-marker]:hidden">
			<ChevronRight
				size={12}
				className="shrink-0 text-zinc-400 transition-transform group-open/section:rotate-90"
			/>
			<span className="min-w-0 truncate">{title}</span>
		</summary>
		<div className="space-y-3 px-3 pt-1 pb-3">{children}</div>
	</details>
);

/** 发送时使用的环境组; 请求栏与右侧面板共用 */
export const ActiveEnvSelect = ({
	label = "激活的环境组",
	className,
}: {
	label?: string;
	className?: string;
}) => {
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
					<ActiveEnvSelect className="w-full" />
				</Label>
				{problems.map((p, i) => (
					<p key={i} className="text-xs text-amber-700 dark:text-amber-400">
						{p.message}
					</p>
				))}
				<Section title="查看与编辑">
					{groups.length > 0 && (
						<div
							className="flex flex-wrap items-center gap-1"
							role="group"
							aria-label="选择要编辑的环境组"
						>
							{groups.map(g => (
								<Button
									key={g.name}
									size="sm"
									aria-pressed={current?.name === g.name}
									variant={current?.name === g.name ? "default" : "outline"}
									title={g.name === active ? "已激活" : undefined}
									onClick={() => setSelected(g.name)}
								>
									{g.name === active && (
										<span
											aria-hidden
											className="size-1.5 rounded-full bg-emerald-500"
										/>
									)}
									{g.title}
								</Button>
							))}
						</div>
					)}
					<form
						className="flex gap-1.5"
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
						<Input
							aria-label="新环境组名"
							className="font-mono text-xs"
							placeholder="新环境组名, 如 dev"
							value={creating}
							onChange={e => setCreating(e.target.value)}
						/>
						<Button type="submit" disabled={!DEBUG_NAME_RE.test(creating)}>
							<Plus size={14} />
							新建
						</Button>
					</form>
				</Section>
				{current && (
					<GroupEditor
						key={current.name}
						group={current}
						active={current.name === active}
						onDelete={() => setDeleting(current.name)}
					/>
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
				onConfirm={() =>
					deleting &&
					remove.mutate(deleting, { onSuccess: () => setSelected(null), onError: fail })
				}
			/>
		</>
	);
};
