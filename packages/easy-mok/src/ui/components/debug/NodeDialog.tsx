import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import { DEBUG_NAME_RE, type TreeNode } from "@/api/debug-contract";
import { useCreateNode, useUpdateNode } from "@/api/debug-queries";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { FieldError, Input, Label, Select } from "../ui/input";
import { Section } from "../ui/panel";
import { VarsEditor, varsToRecord } from "./KeyValueEditor";

export type NodeDialogState =
	| { mode: "create"; kind: "group" | "request"; parent: string | null }
	| { mode: "edit"; node: TreeNode }
	| null;

/** 分组下拉的选项: 值是分组标识, 文本与请求树一致显示为「目录名(展示名)」, 嵌套分组带上级路径 */
export const groupOptions = (
	nodes: TreeNode[],
	prefix = ""
): Array<{ id: string; label: string }> =>
	nodes.flatMap(n =>
		n.kind === "group"
			? [
					{
						id: n.id,
						label: `${prefix}${n.name}${n.title && n.title !== n.name ? `(${n.title})` : ""}`,
					},
					...groupOptions(n.children || [], `${prefix}${n.name}/`),
				]
			: []
	);

const nameError = (name: string) =>
	!name
		? "请填写名字"
		: !DEBUG_NAME_RE.test(name.normalize("NFC"))
			? "只能包含字母, 数字, 中文, 点, 下划线与连字符, 长度 1-64, 首尾不能是 . _ -"
			: "";

export const NodeDialog = ({
	state,
	tree,
	onClose,
	onCreated,
}: {
	state: NodeDialogState;
	tree: TreeNode[];
	onClose: () => void;
	onCreated?: (node: TreeNode) => void;
}) => {
	const editing = state?.mode === "edit" ? state.node : null;
	const kind = state?.mode === "create" ? state.kind : editing?.kind || "group";
	const initialParent =
		state?.mode === "create"
			? state.parent
			: editing
				? editing.id.split("/").slice(0, -1).join("/") || null
				: null;
	const [name, setName] = useState(editing?.name || "");
	const [title, setTitle] = useState(
		editing && editing.title !== editing.name ? editing.title : ""
	);
	const [weight, setWeight] = useState(String(editing?.weight || 0));
	const [parent, setParent] = useState<string | null>(initialParent);
	const [vars, setVars] = useState<Array<[string, string]>>(Object.entries(editing?.vars || {}));
	const create = useCreateNode();
	const update = useUpdateNode();
	const what = kind === "group" ? "分组" : "请求";
	const err = nameError(name);
	const weightNum = Number(weight);
	const weightErr = Number.isSafeInteger(weightNum) ? "" : "权重必须是整数";
	const targets = groupOptions(tree).filter(
		g => !editing || (g.id !== editing.id && !g.id.startsWith(`${editing.id}/`))
	);

	const submit = () => {
		if (err || weightErr) return;
		const done = (msg: string) => () => {
			toast.success(msg);
			onClose();
		};
		const fail = (e: unknown) => toast.error(errorMessage(e));
		if (!editing) {
			create.mutate(
				{
					parent: initialParent,
					kind,
					name,
					title: title || undefined,
					weight: weightNum || undefined,
				},
				{
					onSuccess: node => {
						done(`已新建${what}`)();
						onCreated?.(node);
					},
					onError: fail,
				}
			);
			return;
		}
		update.mutate(
			{
				id: editing.id,
				patch: {
					...(name !== editing.name ? { name } : {}),
					...(parent !== initialParent ? { parent } : {}),
					title: title || null,
					weight: weightNum,
					vars: varsToRecord(vars),
				},
			},
			{ onSuccess: done(`已保存${what}`), onError: fail }
		);
	};

	return (
		<Dialog
			open={!!state}
			onClose={onClose}
			title={editing ? `编辑${what}「${editing.title}」` : `新建${what}`}
			footer={
				<>
					<Button onClick={onClose}>取消</Button>
					<Button
						variant="default"
						disabled={!!err || !!weightErr || create.isPending || update.isPending}
						onClick={submit}
					>
						保存
					</Button>
				</>
			}
		>
			<form
				className="grid gap-2"
				onSubmit={e => {
					e.preventDefault();
					submit();
				}}
			>
				<Label>
					目录名(用于标识与引用)
					<Input
						aria-invalid={!!err}
						value={name}
						onChange={e => setName(e.target.value)}
						className="font-mono text-xs"
					/>
					<FieldError>{name && err}</FieldError>
				</Label>
				<Label>
					展示名(可选)
					<Input value={title} onChange={e => setTitle(e.target.value)} />
				</Label>
				{/* 权重与所在分组并排一行; 层级固定为 根 → 分组 → 请求: 分组留在根下, 请求只能移到分组里, 旧数据里位于根下的请求保留(根)选项 */}
				<div className="flex items-start gap-2">
					<Label className="w-28 shrink-0">
						权重(大的排前面)
						<Input
							aria-invalid={!!weightErr}
							value={weight}
							onChange={e => setWeight(e.target.value)}
						/>
						<FieldError>{weightErr}</FieldError>
					</Label>
					{editing && kind === "request" && (
						<Label className="flex-1">
							所在分组
							<Select
								value={parent || ""}
								onChange={e => setParent(e.target.value || null)}
							>
								{!initialParent && <option value="">(根)</option>}
								{targets.map(g => (
									<option key={g.id} value={g.id}>
										{g.label}
									</option>
								))}
							</Select>
						</Label>
					)}
				</div>
				{editing && (
					<>
						<Section title="本层变量(覆盖外层与环境组的同名变量)" className="pt-1">
							<VarsEditor label={`${what}变量`} vars={vars} onChange={setVars} />
						</Section>
					</>
				)}
				<button type="submit" hidden />
			</form>
		</Dialog>
	);
};
