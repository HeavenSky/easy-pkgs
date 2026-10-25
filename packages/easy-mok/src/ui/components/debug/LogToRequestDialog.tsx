import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { errorMessage } from "@/api/client";
import { DEBUG_NAME_RE, encodeId } from "@/api/debug-contract";
import { useDebugTree, useLogToRequest } from "@/api/debug-queries";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Input, Label, Select } from "../ui/input";
import { groupIds } from "./NodeDialog";

/** 请求日志条目转成调试请求; 转换提示(脱敏头, 二进制体)在完成后列出 */
export const LogToRequestDialog = ({ logId, onClose }: { logId: string; onClose: () => void }) => {
	const [, navigate] = useLocation();
	const tree = useDebugTree();
	const convert = useLogToRequest();
	const [parent, setParent] = useState<string | null>(null);
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
							disabled={convert.isPending || (!!name && !DEBUG_NAME_RE.test(name.normalize("NFC")))}
							onClick={() =>
								convert.mutate(
									{ logId, parent, name: name || undefined },
									{
										onSuccess: out => {
											toast.success(`已生成调试请求「${out.node.title}」`);
											if (out.warnings.length) setResult({ id: out.node.id, warnings: out.warnings });
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
				<ul className="list-disc space-y-0.5 pl-5 text-sm text-amber-700" aria-label="转换提示">
					{result.warnings.map((w, i) => (
						<li key={i}>{w}</li>
					))}
				</ul>
			) : (
				<div className="space-y-3">
					<p className="text-xs text-zinc-500">
						URL 写成 <code>{"{{baseUrl}}"}</code> 加原路径, 请在环境组中设置真实后端的 baseUrl.
					</p>
					<Label>
						放到分组
						<Select value={parent || ""} onChange={e => setParent(e.target.value || null)}>
							<option value="">(根)</option>
							{groupIds(tree.data?.nodes || []).map(id => (
								<option key={id}>{id}</option>
							))}
						</Select>
					</Label>
					<Label>
						请求名(可选, 缺省取路径最后一段)
						<Input className="font-mono" value={name} onChange={e => setName(e.target.value)} />
					</Label>
				</div>
			)}
		</Dialog>
	);
};
