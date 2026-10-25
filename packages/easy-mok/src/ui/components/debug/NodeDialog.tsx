import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import { DEBUG_NAME_RE, type TreeNode } from "@/api/debug-contract";
import { useCreateNode, useUpdateNode } from "@/api/debug-queries";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { FieldError, Input, Label, Select } from "../ui/input";
import { VarsEditor, varsToRecord } from "./KeyValueEditor";

export type NodeDialogState =
	| { mode: "create"; kind: "group" | "request"; parent: string | null }
	| { mode: "edit"; node: TreeNode }
	| null;

/** 全部分组的标识, 用于"移动到"下拉 */
export const groupIds = (nodes: TreeNode[]): string[] =>
	nodes.flatMap(n => (n.kind === "group" ? [n.id, ...groupIds(n.children || [])] : []));

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
		state?.mode === "create" ? state.parent : editing ? editing.id.split("/").slice(0, -1).join("/") || null : null;
	const [name, setName] = useState(editing?.name || "");
	const [title, setTitle] = useState(editing && editing.title !== editing.name ? editing.title : "");
	const [weight, setWeight] = useState(String(editing?.weight || 0));
	const [parent, setParent] = useState<string | null>(initialParent);
	const [vars, setVars] = useState<Array<[string, string]>>(Object.entries(editing?.vars || {}));
	const create = useCreateNode();
	const update = useUpdateNode();
	const what = kind === "group" ? "分组" : "请求";
	const err = nameError(name);
	const weightNum = Number(weight);
	const weightErr = Number.isSafeInteger(weightNum) ? "" : "权重必须是整数";
	const targets = groupIds(tree).filter(id => !editing || (id !== editing.id && !id.startsWith(`${editing.id}/`)));

	const submit = () => {
		if (err || weightErr) return;
		const done = (msg: string) => () => {
			toast.success(msg);
			onClose();
		};
		const fail = (e: unknown) => toast.error(errorMessage(e));
		if (!editing) {
			create.mutate(
				{ parent: initialParent, kind, name, title: title || undefined, weight: weightNum || undefined },
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
					<Button variant="default" disabled={!!err || !!weightErr || create.isPending || update.isPending} onClick={submit}>
						保存
					</Button>
				</>
			}
		>
			<form
				className="space-y-3"
				onSubmit={e => {
					e.preventDefault();
					submit();
				}}
			>
				<Label>
					目录名(用于标识与引用)
					<Input aria-invalid={!!err} value={name} onChange={e => setName(e.target.value)} className="font-mono" />
					<FieldError>{name && err}</FieldError>
				</Label>
				<Label>
					展示名(可选)
					<Input value={title} onChange={e => setTitle(e.target.value)} />
				</Label>
				<Label>
					权重(大的排前面)
					<Input aria-invalid={!!weightErr} value={weight} onChange={e => setWeight(e.target.value)} className="w-32" />
					<FieldError>{weightErr}</FieldError>
				</Label>
				{editing && (
					<>
						<Label>
							所在分组
							<Select value={parent || ""} onChange={e => setParent(e.target.value || null)}>
								<option value="">(根)</option>
								{targets.map(id => (
									<option key={id} value={id}>
										{id}
									</option>
								))}
							</Select>
						</Label>
						<div className="space-y-1">
							<div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">本层变量(覆盖外层与环境组的同名变量)</div>
							<VarsEditor label={`${what}变量`} vars={vars} onChange={setVars} />
						</div>
					</>
				)}
				<button type="submit" hidden />
			</form>
		</Dialog>
	);
};
