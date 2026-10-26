import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { errorMessage } from "@/api/client";
import { DEBUG_NAME_RE, encodeId } from "@/api/debug-contract";
import { useDebugTree, useLogToRequest } from "@/api/debug-queries";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Hint, Input, Label, Select } from "../ui/input";
import { groupOptions } from "./NodeDialog";

/** 请求日志条目转成调试请求; 转换提示(脱敏头, 二进制体)在完成后列出 */
export const LogToRequestDialog = ({ logId, onClose }: { logId: string; onClose: () => void }) => {
	const [, navigate] = useLocation();
	const tree = useDebugTree();
	const convert = useLogToRequest();
	const [picked, setParent] = useState<string | null>(null);
	const groups = groupOptions(tree.data?.nodes || []);
	// 请求只能放进分组: 未选择时默认第一个分组
	const parent = picked ?? groups[0]?.id ?? null;
	const [name, setName] = useState("");
	const [result, setResult] = useState<{ id: string; warnings: string[] } | null>(null);
	const open = (id: string) => navigate(`/debug/req/${encodeId(id)}`);
	return (
		<Dialog
			open
			onClose={onClose}
			title="转为调试请求"
			footer={
				result ? (
					<>
						<Button onClick={onClose}>关闭</Button>
						<Button variant="default" onClick={() => open(result.id)}>
							打开调试页
						</Button>
					</>
				) : (
					<>
						<Button onClick={onClose}>取消</Button>
						<Button
							variant="default"
							disabled={
								convert.isPending ||
								(!!name && !DEBUG_NAME_RE.test(name.normalize("NFC")))
							}
							onClick={() =>
								convert.mutate(
									{ logId, parent, name: name || undefined },
									{
										onSuccess: out => {
											toast.success(`已生成调试请求「${out.node.title}」`);
											if (out.warnings.length)
												setResult({
													id: out.node.id,
													warnings: out.warnings,
												});
											else open(out.node.id);
										},
										onError: err => toast.error(errorMessage(err)),
									}
								)
							}
						>
							转换
						</Button>
					</>
				)
			}
		>
			{result ? (
				<ul
					className="list-disc space-y-0.5 pl-5 text-xs text-amber-700 dark:text-amber-400"
					aria-label="转换提示"
				>
					{result.warnings.map((w, i) => (
						<li key={i}>{w}</li>
					))}
				</ul>
			) : (
				<div className="grid gap-2">
					<Hint>
						URL 写成 <code className="font-mono">{"{{baseUrl}}"}</code> 加原路径,
						请在环境组中设置真实后端的 baseUrl.
					</Hint>
					<Label>
						放到分组
						<Select
							value={parent || ""}
							onChange={e => setParent(e.target.value || null)}
						>
							{/* 请求只能放进分组; 没有分组时才允许放在根下 */}
							{!groups.length && <option value="">(根)</option>}
							{groups.map(g => (
								<option key={g.id} value={g.id}>
									{g.label}
								</option>
							))}
						</Select>
					</Label>
					<Label>
						请求名(可选, 缺省取路径最后一段)
						<Input
							className="font-mono text-xs"
							aria-invalid={!!name && !DEBUG_NAME_RE.test(name.normalize("NFC"))}
							value={name}
							onChange={e => setName(e.target.value)}
						/>
					</Label>
				</div>
			)}
		</Dialog>
	);
};
