import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import type { TreeNode } from "@/api/debug-contract";
import { useEnvs, useImportCurl, useImportOpenApi } from "@/api/debug-queries";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Input, Label, Select, Textarea } from "../ui/input";
import { groupIds } from "./NodeDialog";

/** 导入 cURL 命令或 OpenAPI 文档到指定分组 */
export const ImportDialog = ({
	tree,
	parent: initialParent,
	onClose,
	onImported,
}: {
	tree: TreeNode[];
	parent: string | null;
	onClose: () => void;
	onImported?: (node: TreeNode) => void;
}) => {
	const [kind, setKind] = useState<"curl" | "openapi">("curl");
	const [text, setText] = useState("");
	const [parent, setParent] = useState<string | null>(initialParent);
	const [name, setName] = useState("");
	const [env, setEnv] = useState("");
	const [snapshots, setSnapshots] = useState(true);
	const [warnings, setWarnings] = useState<string[] | null>(null);
	const envs = useEnvs();
	const curl = useImportCurl();
	const openapi = useImportOpenApi();
	const pending = curl.isPending || openapi.isPending;
	const fail = (err: unknown) => toast.error(errorMessage(err));
	const submit = () => {
		if (kind === "curl") {
			curl.mutate(
				{ text, parent, name: name || undefined },
				{
					onSuccess: out => {
						toast.success(`已导入请求「${out.node.title}」`);
						setWarnings(out.warnings);
						onImported?.(out.node);
						if (!out.warnings.length) onClose();
					},
					onError: fail,
				}
			);
		} else {
			openapi.mutate(
				{ text, parent, env: env || null, snapshots },
				{
					onSuccess: out => {
						toast.success(`已导入 ${out.created} 个请求`);
						setWarnings(out.warnings);
						if (!out.warnings.length) onClose();
					},
					onError: fail,
				}
			);
		}
	};
	return (
		<Dialog
			open
			onClose={onClose}
			title="导入"
			className="w-[min(760px,94vw)]"
			footer={
				<>
					<Button onClick={onClose}>{warnings ? "关闭" : "取消"}</Button>
					<Button variant="default" disabled={!text.trim() || pending} onClick={submit}>
						导入
					</Button>
				</>
			}
		>
			<div className="space-y-3">
				<div role="tablist" className="flex gap-2">
					{(["curl", "openapi"] as const).map(k => (
						<button
							key={k}
							type="button"
							role="tab"
							aria-selected={kind === k}
							className={cn("rounded px-2 py-1 text-sm", kind === k ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600")}
							onClick={() => {
								setKind(k);
								setWarnings(null);
							}}
						>
							{k === "curl" ? "cURL 命令" : "OpenAPI 3.0 / 3.1"}
						</button>
					))}
				</div>
				<Label>
					{kind === "curl" ? "粘贴 cURL 命令(如浏览器的 Copy as cURL (bash))" : "粘贴 YAML 或 JSON, 或选择文件"}
					<Textarea aria-label="导入内容" rows={10} value={text} onChange={e => setText(e.target.value)} />
				</Label>
				{kind === "openapi" && (
					<input
						type="file"
						accept=".yaml,.yml,.json"
						aria-label="选择 OpenAPI 文件"
						className="text-xs"
						onChange={async e => {
							const file = e.target.files?.[0];
							if (file) setText(await file.text());
						}}
					/>
				)}
				<div className="flex flex-wrap gap-2">
					<Label className="min-w-48 flex-1">
						导入到分组
						<Select value={parent || ""} onChange={e => setParent(e.target.value || null)}>
							<option value="">(根)</option>
							{groupIds(tree).map(id => (
								<option key={id}>{id}</option>
							))}
						</Select>
					</Label>
					{kind === "curl" ? (
						<Label className="w-48">
							请求名(可选)
							<Input className="font-mono" value={name} onChange={e => setName(e.target.value)} />
						</Label>
					) : (
						<Label className="w-48">
							把 servers[0] 写入环境组的 baseUrl
							<Select value={env} onChange={e => setEnv(e.target.value)}>
								<option value="">不写入</option>
								{(envs.data?.groups || []).map(g => (
									<option key={g.name} value={g.name}>
										{g.title}
									</option>
								))}
							</Select>
						</Label>
					)}
				</div>
				{kind === "openapi" && (
					<label className="flex items-center gap-2 text-sm">
						<input type="checkbox" checked={snapshots} onChange={e => setSnapshots(e.target.checked)} />
						把响应示例生成为快照
					</label>
				)}
				{warnings && warnings.length > 0 && (
					<ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-700" aria-label="导入提示">
						{warnings.map((w, i) => (
							<li key={i}>{w}</li>
						))}
					</ul>
				)}
			</div>
		</Dialog>
	);
};
