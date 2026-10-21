import { AlertTriangle, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ApiError, errorMessage } from "@/api/client";
import { NAME_RE, SceneDetail, type Envelope, type RouteSummary } from "@/api/contract";
import { useSaveScene } from "@/api/queries";
import { useUnsaved } from "@/lib/unsaved";
import { pretty } from "@/lib/utils";
import { JsonEditor, parseJson } from "./JsonEditor";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { FieldError, Input, Label } from "./ui/input";

interface Form {
	name: string;
	status: string;
	delay: string;
	headers: Array<{ k: string; v: string }>;
	mode: "json" | "script";
	body: string;
	script: string;
}

const SCRIPT_TEMPLATE = `// 写法同 mock 文件中的场景函数: 可用 req.params / req.query / req.body, 返回值即响应体;
// 也可以自行调用 res.status(...).json(...), 或调用 next() 交给真实服务. require 按 mock 目录解析.
(req, res, next) => {
  return { id: req.params.id, query: req.query };
}
`;

const toForm = (name: string, env: Envelope | undefined): Form => ({
	name,
	status: env?.status ? String(env.status) : "200",
	delay: env?.delay ? String(env.delay) : "",
	headers: Object.entries(env?.headers || {}).map(([k, v]) => ({ k, v })),
	mode: typeof env?.script === "string" ? "script" : "json",
	body: env && typeof env.script !== "string" ? pretty(env.body ?? null) : "{\n  \n}",
	script: typeof env?.script === "string" ? env.script : SCRIPT_TEMPLATE,
});

const HEADER_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

interface Props {
	route: RouteSummary;
	scenes: SceneDetail[];
	scene?: SceneDetail;
	initial?: Envelope;
	initialName?: string;
	onDone: () => void;
}

export const SceneEditor = ({ route, scenes, scene, initial, initialName, onDone }: Props) => {
	const save = useSaveScene();
	const isNew = !scene;
	const serverEnv = scene ? (scene.content as Envelope) : undefined;
	const [baseEtag, setBaseEtag] = useState(scene?.etag || null);
	const [form, setForm] = useState<Form>(() => toForm(initialName || "", serverEnv || initial));
	const [pristine, setPristine] = useState(form);
	const [conflict, setConflict] = useState<SceneDetail | null>(null);
	const dirty = JSON.stringify(form) !== JSON.stringify(pristine);
	useUnsaved(dirty);

	// 场景在别处被修改: 未改动时直接载入, 有改动时提示
	const externallyChanged = !!scene && !!baseEtag && scene.etag !== baseEtag;
	useEffect(() => {
		if (externallyChanged && !dirty && scene) {
			const next = toForm(scene.name, scene.content as Envelope);
			setForm(next);
			setPristine(next);
			setBaseEtag(scene.etag);
		}
	}, [externallyChanged, dirty, scene]);

	const body = useMemo(() => parseJson(form.body), [form.body]);
	const status = Number(form.status);
	const delay = form.delay.trim() ? Number(form.delay) : 0;
	const existing = scenes.find(s => s.name === form.name.trim());
	const errors = {
		name:
			isNew && !form.name.trim()
				? "required"
				: isNew && !NAME_RE.test(form.name.trim())
					? "只能包含字母, 数字, 下划线与连字符, 1-64 个字符"
					: isNew && existing?.source === "json"
						? "已存在同名的管理页场景"
						: "",
		status:
			Number.isInteger(status) && status >= 100 && status <= 599
				? ""
				: "请输入 100-599 的整数",
		delay:
			Number.isInteger(delay) && delay >= 0 && delay <= 60000 ? "" : "请输入 0-60000 的整数",
		headers: form.headers.some(h => h.k && !HEADER_RE.test(h.k)) ? "响应头名称含非法字符" : "",
		body: form.mode === "script" || body.ok ? "" : `JSON 语法错误: ${body.error}`,
		script: form.mode === "script" && !form.script.trim() ? "请填写脚本" : "",
	};
	const invalid = Object.values(errors).some(Boolean);

	const envelope = (): Envelope => ({
		status,
		headers: Object.fromEntries(
			form.headers.filter(h => h.k.trim()).map(h => [h.k.trim().toLowerCase(), h.v])
		),
		body: form.mode === "json" && body.ok ? body.value : null,
		...(delay ? { delay } : {}),
		...(form.mode === "script" ? { script: form.script } : {}),
	});

	const submit = (etag: string | null) => {
		const name = isNew ? form.name.trim() : (scene as SceneDetail).name;
		save.mutate(
			{ id: route.id, name, envelope: envelope(), etag },
			{
				onSuccess: saved => {
					toast.success(isNew ? `已新建场景「${name}」` : "已保存");
					setPristine(form);
					setBaseEtag(saved.etag);
					onDone();
				},
				onError: err => {
					const current =
						err instanceof ApiError && err.code === "CONFLICT"
							? SceneDetail.safeParse(err.details?.current)
							: null;
					if (current?.success && !isNew) {
						setConflict(current.data);
						return;
					}
					toast.error(errorMessage(err));
				},
			}
		);
	};

	const set = <K extends keyof Form>(key: K, value: Form[K]) =>
		setForm(prev => ({ ...prev, [key]: value }));

	return (
		<form
			aria-label={isNew ? "新建场景" : `编辑场景 ${scene?.name}`}
			className="space-y-3 rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
			onSubmit={e => {
				e.preventDefault();
				if (!invalid) {
					submit(baseEtag);
				}
			}}
		>
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold">
					{isNew ? "新建场景" : `编辑场景「${scene?.name}」`}
				</h3>
				<Button
					size="icon"
					variant="ghost"
					aria-label="关闭编辑器"
					onClick={() => {
						if (!dirty || window.confirm("放弃未保存的修改?")) {
							onDone();
						}
					}}
				>
					<X size={14} />
				</Button>
			</div>
			{externallyChanged && dirty && (
				<div
					role="alert"
					className="flex items-center gap-2 rounded bg-amber-100 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200"
				>
					<AlertTriangle size={14} />
					该场景已在别处被修改(可能是其他标签页或直接改了文件). 保存时会提示冲突.
				</div>
			)}
			<div className="grid grid-cols-3 gap-3">
				{isNew && (
					<Label>
						场景名
						<Input
							value={form.name}
							aria-invalid={!!errors.name && errors.name !== "required"}
							onChange={e => set("name", e.target.value)}
							placeholder="例如 empty"
							autoFocus
							required
						/>
						<FieldError>{errors.name !== "required" && errors.name}</FieldError>
						{!errors.name && existing?.source === "code" && (
							<span className="text-xs text-amber-600">将覆盖代码中的同名场景</span>
						)}
					</Label>
				)}
				<Label>
					状态码
					<Input
						inputMode="numeric"
						value={form.status}
						aria-invalid={!!errors.status}
						onChange={e => set("status", e.target.value)}
					/>
					<FieldError>{errors.status}</FieldError>
				</Label>
				<Label>
					延迟(毫秒)
					<Input
						inputMode="numeric"
						value={form.delay}
						aria-invalid={!!errors.delay}
						onChange={e => set("delay", e.target.value)}
						placeholder="0"
					/>
					<FieldError>{errors.delay}</FieldError>
				</Label>
			</div>
			<fieldset className="space-y-1.5">
				<legend className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
					响应头
				</legend>
				{form.headers.map((h, i) => (
					<div key={i} className="flex gap-2">
						<Input
							aria-label={`响应头 ${i + 1} 名称`}
							value={h.k}
							placeholder="名称"
							onChange={e =>
								set(
									"headers",
									form.headers.map((x, j) =>
										j === i ? { ...x, k: e.target.value } : x
									)
								)
							}
						/>
						<Input
							aria-label={`响应头 ${i + 1} 值`}
							value={h.v}
							placeholder="值"
							onChange={e =>
								set(
									"headers",
									form.headers.map((x, j) =>
										j === i ? { ...x, v: e.target.value } : x
									)
								)
							}
						/>
						<Button
							size="icon"
							variant="ghost"
							aria-label={`删除响应头 ${i + 1}`}
							onClick={() =>
								set(
									"headers",
									form.headers.filter((_, j) => j !== i)
								)
							}
						>
							<X size={14} />
						</Button>
					</div>
				))}
				<Button
					size="sm"
					variant="ghost"
					onClick={() => set("headers", [...form.headers, { k: "", v: "" }])}
				>
					<Plus size={14} />
					添加响应头
				</Button>
				<FieldError>{errors.headers}</FieldError>
			</fieldset>
			<div className="space-y-1">
				<div
					role="radiogroup"
					aria-label="响应方式"
					className="flex items-center gap-3 text-xs font-medium text-zinc-600 dark:text-zinc-400"
				>
					<label className="flex items-center gap-1">
						<input
							type="radio"
							name="mode"
							checked={form.mode === "json"}
							onChange={() => set("mode", "json")}
						/>
						JSON 响应体
					</label>
					<label className="flex items-center gap-1">
						<input
							type="radio"
							name="mode"
							checked={form.mode === "script"}
							onChange={() => set("mode", "script")}
						/>
						JS 脚本
					</label>
				</div>
				{form.mode === "json" ? (
					<>
						<div className="text-xs text-zinc-500">写成字符串 "..." 时按文本返回</div>
						<JsonEditor
							label="响应体"
							value={form.body}
							onChange={v => set("body", v)}
						/>
						<FieldError>{errors.body}</FieldError>
					</>
				) : (
					<>
						<div className="text-xs text-zinc-500">
							一个处理函数, 在 mock 服务进程中执行; 上面的状态码与响应头作为默认值,
							只能在本机保存
						</div>
						<JsonEditor
							label="脚本"
							language="javascript"
							value={form.script}
							onChange={v => set("script", v)}
						/>
						<FieldError>{errors.script}</FieldError>
					</>
				)}
			</div>
			<div className="flex justify-end gap-2">
				<Button disabled={!dirty} onClick={() => setForm(pristine)}>
					重置
				</Button>
				<Button
					type="submit"
					variant="default"
					disabled={invalid || save.isPending || (!isNew && !dirty)}
				>
					{save.isPending ? "保存中" : "保存"}
				</Button>
			</div>
			<Dialog
				open={!!conflict}
				onClose={() => setConflict(null)}
				title="保存冲突"
				footer={
					<>
						<Button
							onClick={() => {
								if (!conflict) {
									return;
								}
								const next = toForm(conflict.name, conflict.content as Envelope);
								setForm(next);
								setPristine(next);
								setBaseEtag(conflict.etag);
								setConflict(null);
							}}
						>
							载入服务端版本(放弃我的修改)
						</Button>
						<Button
							variant="danger"
							onClick={() => {
								const etag = conflict?.etag || null;
								setConflict(null);
								setBaseEtag(etag);
								submit(etag);
							}}
						>
							用我的版本覆盖
						</Button>
					</>
				}
			>
				<p className="mb-2 text-sm">该场景在你编辑期间已被修改. 服务端当前内容:</p>
				<JsonEditor
					label="服务端当前内容"
					readOnly
					height="220px"
					value={pretty(conflict?.content)}
				/>
			</Dialog>
		</form>
	);
};
