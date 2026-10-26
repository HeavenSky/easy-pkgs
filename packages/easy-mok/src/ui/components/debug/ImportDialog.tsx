import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import type { TreeNode } from "@/api/debug-contract";
import { useEnvs, useImportCurl, useImportOpenApi } from "@/api/debug-queries";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Input, Label, Select, Textarea } from "../ui/input";
import { Tabs } from "../ui/tabs";
import { groupOptions } from "./NodeDialog";

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
	const [picked, setParent] = useState<string | null>(initialParent);
	const groups = groupOptions(tree);
	// cURL 导入的是单个请求, 只能放进分组: 未选择分组时默认第一个分组
	const parent = kind === "curl" && !picked ? (groups[0]?.id ?? null) : picked;
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
			<div className="grid gap-2">
				<Tabs
					label="导入格式"
					items={[
						{ id: "curl", label: "cURL 命令" },
						{ id: "openapi", label: "OpenAPI 3.0 / 3.1" },
					]}
					value={kind}
					onChange={k => {
						setKind(k);
						setWarnings(null);
					}}
				/>
				<Label>
					{kind === "curl"
						? "粘贴 cURL 命令(如浏览器的 Copy as cURL (bash))"
						: "粘贴 YAML 或 JSON, 或选择文件"}
					<Textarea
						aria-label="导入内容"
						rows={10}
						value={text}
						onChange={e => setText(e.target.value)}
					/>
				</Label>
				{kind === "openapi" && (
					<input
						type="file"
						accept=".yaml,.yml,.json"
						aria-label="选择 OpenAPI 文件"
						className="text-xs text-zinc-600 file:mr-2 file:h-7 file:rounded-md file:border file:border-zinc-300 file:bg-white file:px-2.5 file:text-sm file:font-medium file:text-zinc-800 hover:file:bg-zinc-50 dark:text-zinc-400 dark:file:border-zinc-700 dark:file:bg-zinc-900 dark:file:text-zinc-200"
						onChange={async e => {
							const file = e.target.files?.[0];
							if (file) setText(await file.text());
						}}
					/>
				)}
				<div className="flex flex-wrap gap-2">
					<Label className="min-w-48 flex-1">
						导入到分组
						<Select
							value={parent || ""}
							onChange={e => setParent(e.target.value || null)}
						>
							{/* cURL 导入的是单个请求, 只能放进分组; 没有分组时才允许放在根下 */}
							{(kind !== "curl" || !groups.length) && <option value="">(根)</option>}
							{groups.map(g => (
								<option key={g.id} value={g.id}>
									{g.label}
								</option>
							))}
						</Select>
					</Label>
					{kind === "curl" ? (
						<Label className="w-48">
							请求名(可选)
							<Input
								className="font-mono text-xs"
								value={name}
								onChange={e => setName(e.target.value)}
							/>
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
					<label className="flex items-center gap-1.5 text-sm">
						<input
							type="checkbox"
							checked={snapshots}
							onChange={e => setSnapshots(e.target.checked)}
						/>
						把响应示例生成为快照
					</label>
				)}
				{warnings && warnings.length > 0 && (
					<ul
						className="list-disc space-y-0.5 pl-5 text-xs text-amber-700 dark:text-amber-400"
						aria-label="导入提示"
					>
						{warnings.map((w, i) => (
							<li key={i}>{w}</li>
						))}
					</ul>
				)}
			</div>
		</Dialog>
	);
};
