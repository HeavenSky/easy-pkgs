import { useState } from "react";
import { toast } from "sonner";
import { ApiError, errorMessage } from "@/api/client";
import { NAME_RE, type RouteSummary } from "@/api/contract";
import type { TreeNode } from "@/api/debug-contract";
import { useDebugTree } from "@/api/debug-queries";
import { useSceneFromSnapshot } from "@/api/queries";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { FieldError, Input, Label, Select } from "./ui/input";

/** 全部快照: 标识与 "请求 / 快照" 展示名 */
const snapshotOptions = (
	nodes: TreeNode[],
	trail: string[] = []
): Array<{ id: string; label: string }> =>
	nodes.flatMap(n =>
		n.kind === "group"
			? snapshotOptions(n.children || [], [...trail, n.title])
			: (n.snapshots || []).map(s => ({
					id: `${n.id}#${s.name}`,
					label: [...trail, n.title, s.title].join(" / "),
				}))
	);

/** 从调试快照建场景: 引用(随快照更新)或拷贝(之后可单独编辑) */
export const FromSnapshotDialog = ({
	route,
	initial,
	onClose,
}: {
	route: RouteSummary;
	initial?: { name?: string; snapshot?: string };
	onClose: () => void;
}) => {
	const tree = useDebugTree();
	const save = useSceneFromSnapshot();
	const options = snapshotOptions(tree.data?.nodes || []);
	const [snapshot, setSnapshot] = useState(initial?.snapshot || "");
	const [name, setName] = useState(initial?.name || "");
	const [mode, setMode] = useState<"ref" | "copy">("ref");
	const [conflict, setConflict] = useState(!!initial?.name);
	const valid = NAME_RE.test(name) && !!snapshot;
	const submit = (overwrite: boolean) =>
		save.mutate(
			{ id: route.id, name, snapshot, mode, overwrite },
			{
				onSuccess: () => {
					toast.success(
						mode === "ref"
							? `场景「${name}」已引用快照`
							: `已把快照拷贝为场景「${name}」`
					);
					onClose();
				},
				onError: err => {
					if (err instanceof ApiError && err.code === "CONFLICT") setConflict(true);
					else toast.error(errorMessage(err));
				},
			}
		);
	return (
		<Dialog
			open
			onClose={onClose}
			title="从调试快照建场景"
			footer={
				<>
					<Button onClick={onClose}>取消</Button>
					<Button
						variant={conflict ? "danger" : "default"}
						disabled={!valid || save.isPending}
						onClick={() => submit(conflict)}
					>
						{conflict ? "覆盖同名场景" : "保存"}
					</Button>
				</>
			}
		>
			<div className="space-y-3">
				{tree.isSuccess && !options.length && (
					<p className="text-xs text-amber-700 dark:text-amber-400">
						还没有快照; 先在「调试」页发送请求并另存为快照.
					</p>
				)}
				<Label>
					快照
					<Select value={snapshot} onChange={e => setSnapshot(e.target.value)}>
						<option value="">请选择</option>
						{options.map(o => (
							<option key={o.id} value={o.id}>
								{o.label}
							</option>
						))}
					</Select>
				</Label>
				<Label>
					场景名
					<Input
						className="font-mono"
						value={name}
						onChange={e => {
							setName(e.target.value);
							setConflict(false);
						}}
					/>
					<FieldError>
						{name &&
							!NAME_RE.test(name) &&
							"只能包含字母, 数字, 下划线与连字符, 长度 1-64"}
					</FieldError>
				</Label>
				<fieldset className="space-y-1.5">
					<label className="flex cursor-pointer items-start gap-1.5">
						<input
							type="radio"
							name="mode"
							className="mt-1 accent-zinc-900 dark:accent-zinc-100"
							checked={mode === "ref"}
							onChange={() => setMode("ref")}
						/>
						<span>
							引用(推荐): 场景始终返回快照的最新内容, 刷新快照后无需改场景;
							快照被删除时降级到下一级场景.
						</span>
					</label>
					<label className="flex cursor-pointer items-start gap-1.5">
						<input
							type="radio"
							name="mode"
							className="mt-1 accent-zinc-900 dark:accent-zinc-100"
							checked={mode === "copy"}
							onChange={() => setMode("copy")}
						/>
						<span>拷贝: 把当前内容拷进场景, 之后与快照无关, 可以单独编辑.</span>
					</label>
				</fieldset>
				{conflict && (
					<p className="text-xs text-amber-700 dark:text-amber-400">
						场景「{name}」已存在, 保存会覆盖它.
					</p>
				)}
			</div>
		</Dialog>
	);
};
