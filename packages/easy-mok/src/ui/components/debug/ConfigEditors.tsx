import { useRef } from "react";
import type { Auth, DebugRequest, NodeConfig, SettingKey, Settings } from "@/api/debug-contract";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Hint, Input, Label, Select } from "../ui/input";
import { KvList } from "../ui/kv";

/** 继承来的配置与各项来源, 与服务端 inheritedOf 同形 */
export type Inherited = DebugRequest["inherited"];

/** 来源标识转成界面文字: default 默认值, collection 集合, group:<标识> 分组 */
export const fromLabel = (from: string) =>
	from === "default"
		? "默认"
		: from === "collection"
			? "集合"
			: from.startsWith("group:")
				? `分组 ${from.slice(6)}`
				: from;

export const DEFAULT_SETTINGS: Required<Pick<Settings, SettingKey>> = {
	timeoutMs: 30000,
	followRedirects: true,
	insecureTLS: false,
	proxy: null,
	skipCookieJar: false,
};

/** 由外到内的配置层算出继承结果; 用于分组与集合面板, 算法与服务端 inheritedOf 一致 */
export const inheritFromLayers = (
	layers: Array<{ from: string; config: NodeConfig | undefined }>
): Inherited => {
	const settings: Inherited["settings"] = {};
	(Object.keys(DEFAULT_SETTINGS) as SettingKey[]).forEach(
		k => (settings[k] = { value: DEFAULT_SETTINGS[k], from: "default" })
	);
	const headers = new Map<string, Inherited["headers"][number]>();
	let auth: Inherited["auth"] = { value: { type: "none" }, from: "default" };
	layers.forEach(({ from, config }) => {
		if (!config) return;
		Object.entries(config.settings).forEach(([k, v]) => {
			if (k in DEFAULT_SETTINGS) settings[k] = { value: v, from };
		});
		config.headers.forEach(([name, value, enabled]) => {
			if (!name) return;
			headers.delete(name.toLowerCase());
			if (enabled) headers.set(name.toLowerCase(), { name, value, from });
		});
		if (config.auth) auth = { value: config.auth, from };
	});
	return { settings, headers: [...headers.values()], auth };
};

const FIELDS: Array<{ key: SettingKey; label: string; kind: "number" | "bool" | "proxy" }> = [
	{ key: "timeoutMs", label: "超时(毫秒, 1-600000)", kind: "number" },
	{ key: "followRedirects", label: "跟随重定向", kind: "bool" },
	{ key: "insecureTLS", label: "不校验 HTTPS 证书(自签证书)", kind: "bool" },
	{ key: "skipCookieJar", label: "不使用环境组的 Cookie jar", kind: "bool" },
	{ key: "proxy", label: "HTTP 代理(如 http://user:pass@127.0.0.1:8888)", kind: "proxy" },
];

const showValue = (kind: string, v: unknown) =>
	kind === "bool" ? (v ? "是" : "否") : kind === "proxy" ? (v ? String(v) : "不使用") : `${v} ms`;

/**
 * 发送设置: 每个字段可以「继承」外层或在本层「覆盖」. value 只含覆盖的字段;
 * readOnly 时只显示生效值与来源.
 */
export const SettingsEditor = ({
	value,
	onChange,
	inherited,
	readOnly,
	layer,
}: {
	value: Settings;
	onChange?: (next: Settings) => void;
	inherited: Inherited["settings"];
	readOnly?: boolean;
	/** 本层的名字, 用于显示「本层设置」 */
	layer: string;
}) => {
	// 连续几次修改可能落在同一次渲染之前, 以最近一次提交的值为基础, 不丢前面的修改
	const latest = useRef(value);
	latest.current = value;
	const commit = (next: Settings) => {
		latest.current = next;
		onChange?.(next);
	};
	const set = (key: SettingKey, v: unknown) => commit({ ...latest.current, [key]: v });
	const reset = (key: SettingKey) => {
		const next = { ...latest.current };
		delete next[key];
		commit(next);
	};
	return (
		<div
			className="divide-y divide-zinc-100 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800"
			role="group"
			aria-label="发送设置"
		>
			{FIELDS.map(f => {
				const own = value[f.key] !== undefined;
				const effective = own ? value[f.key] : inherited[f.key]?.value;
				const source = own ? layer : fromLabel(inherited[f.key]?.from || "default");
				return (
					<div
						key={f.key}
						className="grid min-h-9 grid-cols-[minmax(8rem,14rem)_minmax(0,1fr)_auto] items-center gap-2 px-3 py-1"
					>
						<span className="text-xs text-zinc-600 dark:text-zinc-400">{f.label}</span>
						{own && !readOnly ? (
							f.kind === "bool" ? (
								<label className="flex items-center gap-1.5">
									<input
										type="checkbox"
										aria-label={f.label}
										checked={effective === true}
										onChange={e => set(f.key, e.target.checked)}
									/>
									<span className="text-xs">{effective ? "是" : "否"}</span>
								</label>
							) : f.kind === "number" ? (
								<Input
									aria-label={f.label}
									type="number"
									className="w-32"
									value={String(effective ?? "")}
									onChange={e =>
										set(
											f.key,
											e.target.value === ""
												? undefined
												: Number(e.target.value)
										)
									}
								/>
							) : (
								<Input
									aria-label={f.label}
									className="font-mono text-xs"
									placeholder="留空表示不使用代理"
									value={String(effective ?? "")}
									onChange={e => set(f.key, e.target.value || null)}
								/>
							)
						) : (
							<span
								className={cn("min-w-0 truncate text-sm", !own && "text-zinc-500")}
							>
								{showValue(f.kind, effective)}
								<span className="ml-1.5 text-2xs text-zinc-400">
									{own ? `${source}设置` : `继承自${source}`}
								</span>
							</span>
						)}
						{!readOnly && (
							<Button
								size="sm"
								variant="ghost"
								aria-label={own ? `${f.label} 恢复继承` : `${f.label} 在本层覆盖`}
								onClick={() =>
									own
										? reset(f.key)
										: set(
												f.key,
												inherited[f.key]?.value ?? DEFAULT_SETTINGS[f.key]
											)
								}
							>
								{own ? "恢复继承" : "覆盖"}
							</Button>
						)}
					</div>
				);
			})}
		</div>
	);
};

const authText = (a: Auth) =>
	a.type === "bearer"
		? "Bearer Token"
		: a.type === "basic"
			? `Basic(${String((a as { username?: string }).username || "")})`
			: "无";

/**
 * 认证: 请求可选「继承」(allowInherit), 分组与集合用 null 表示本层不设置.
 * readOnly 时只显示生效的认证与来源.
 */
export const AuthEditor = ({
	value,
	onChange,
	inherited,
	allowInherit,
	readOnly,
	layer,
}: {
	value: Auth | null;
	onChange?: (next: Auth | null) => void;
	inherited: Inherited["auth"];
	allowInherit: boolean;
	readOnly?: boolean;
	layer: string;
}) => {
	const inheriting = !value || value.type === "inherit";
	const effective = inheriting ? inherited.value : value;
	const field = (key: string) => String((value as Record<string, unknown> | null)?.[key] ?? "");
	if (readOnly) {
		return (
			<KvList
				items={[
					["认证方式", authText(effective)],
					["来源", inheriting ? `继承自${fromLabel(inherited.from)}` : `${layer}设置`],
				]}
			/>
		);
	}
	return (
		<div className="space-y-2">
			<Label className="max-w-xs">
				认证方式
				<Select
					value={inheriting ? "inherit" : value!.type}
					onChange={e => {
						const t = e.target.value;
						onChange?.(
							t === "inherit"
								? allowInherit
									? { type: "inherit" }
									: null
								: { type: t as Auth["type"] }
						);
					}}
				>
					<option value="inherit">{allowInherit ? "继承" : "不设置(继承外层)"}</option>
					<option value="none">无</option>
					<option value="bearer">Bearer Token</option>
					<option value="basic">Basic</option>
				</Select>
			</Label>
			{inheriting && (
				<Hint>
					当前生效: {authText(inherited.value)}, 来自{fromLabel(inherited.from)}
				</Hint>
			)}
			{value?.type === "bearer" && (
				<Label className="max-w-xl">
					Token(可写 {"{{token}}"})
					<Input
						className="font-mono text-xs"
						value={field("token")}
						onChange={e => onChange?.({ ...value, token: e.target.value })}
					/>
				</Label>
			)}
			{value?.type === "basic" && (
				<div className="flex max-w-xl gap-2">
					<Label className="flex-1">
						用户名
						<Input
							value={field("username")}
							onChange={e => onChange?.({ ...value, username: e.target.value })}
						/>
					</Label>
					<Label className="flex-1">
						密码
						<Input
							value={field("password")}
							onChange={e => onChange?.({ ...value, password: e.target.value })}
						/>
					</Label>
				</div>
			)}
			<Hint>请求头中手写了 authorization 时以手写的为准.</Hint>
		</div>
	);
};

/** 外层继承来的请求头, 只读; 本层写同名头覆盖, 写同名头并取消勾选可屏蔽 */
export const InheritedHeaders = ({ items }: { items: Inherited["headers"] }) =>
	items.length ? (
		<div className="space-y-1">
			<div className="text-xs text-zinc-500">
				继承的请求头(写同名头可覆盖, 写同名头并取消勾选可屏蔽)
			</div>
			<KvList
				mono
				items={items.map(h => [
					h.name,
					<>
						{h.value}
						<span className="ml-1.5 font-sans text-2xs text-zinc-400">
							{fromLabel(h.from)}
						</span>
					</>,
				])}
			/>
		</div>
	) : null;
