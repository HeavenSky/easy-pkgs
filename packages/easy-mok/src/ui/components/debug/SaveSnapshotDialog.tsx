import { useState } from "react";
import { toast } from "sonner";
import { ApiError, errorMessage } from "@/api/client";
import { DEBUG_NAME_RE, type TreeNode } from "@/api/debug-contract";
import { useSaveSnapshot } from "@/api/debug-queries";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { FieldError, Input, Label, Select } from "../ui/input";

const requestIds = (nodes: TreeNode[]): string[] =>
	nodes.flatMap(n => (n.kind === "request" ? [n.id] : requestIds(n.children || [])));

/** 历史条目另存为命名快照; 重名时提示覆盖. requestId 为空(草稿)时需要选择所属请求 */
export const SaveSnapshotDialog = ({
	hid,
	requestId,
	tree,
	onClose,
	onSaved,
}: {
	hid: string;
	requestId: string | null;
	tree: TreeNode[];
	onClose: () => void;
	onSaved?: (sid: string) => void;
}) => {
	const [request, setRequest] = useState(requestId || "");
	const [name, setName] = useState("");
	const [title, setTitle] = useState("");
	const [conflict, setConflict] = useState(false);
	const save = useSaveSnapshot();
	const valid = DEBUG_NAME_RE.test(name.normalize("NFC")) && !!request;
	const submit = (overwrite: boolean) =>
		save.mutate(
			{ hid, body: { request, name, title: title || undefined, overwrite } },
			{
				onSuccess: out => {
					toast.success(`已保存快照「${out.title}」`);
					onSaved?.(out.id);
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
			title="另存为快照"
			footer={
				<>
					<Button onClick={onClose}>取消</Button>
					{conflict ? (
						<Button variant="danger" disabled={save.isPending} onClick={() => submit(true)}>
							覆盖同名快照
						</Button>
					) : (
						<Button variant="default" disabled={!valid || save.isPending} onClick={() => submit(false)}>
							保存
						</Button>
					)}
				</>
			}
		>
			<div className="space-y-3">
				{!requestId && (
					<Label>
						所属请求
						<Select value={request} onChange={e => setRequest(e.target.value)}>
							<option value="">请选择</option>
							{requestIds(tree).map(id => (
								<option key={id}>{id}</option>
							))}
						</Select>
					</Label>
				)}
				<Label>
					快照名(用于场景引用, 如 ok, empty)
					<Input
						className="font-mono"
						value={name}
						onChange={e => {
							setName(e.target.value);
							setConflict(false);
						}}
					/>
					<FieldError>{name && !DEBUG_NAME_RE.test(name.normalize("NFC")) && "只能包含字母, 数字, 中文, 点, 下划线与连字符, 首尾不能是 . _ -"}</FieldError>
				</Label>
				<Label>
					展示名(可选)
					<Input value={title} onChange={e => setTitle(e.target.value)} />
				</Label>
				{conflict && <p className="text-sm text-amber-700">已有同名快照(名字比较不区分大小写); 覆盖后保留它的展示名, 权重与快照变量.</p>}
			</div>
		</Dialog>
	);
};
