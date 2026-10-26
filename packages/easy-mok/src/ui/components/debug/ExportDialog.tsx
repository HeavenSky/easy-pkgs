import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import { useExportCurl, useExportOpenApi } from "@/api/debug-queries";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Hint, Select, Textarea } from "../ui/input";

/** 导出: 请求导出为 cURL(可替换变量), 分组导出为 OpenAPI 文档并下载 */
export const ExportDialog = ({
	target,
	onClose,
}: {
	target:
		| { kind: "curl"; source: string }
		| { kind: "openapi"; node: string | null; title: string };
	onClose: () => void;
}) => {
	const curl = useExportCurl();
	const openapi = useExportOpenApi();
	const [resolve, setResolve] = useState(false);
	const [format, setFormat] = useState<"yaml" | "json">("yaml");
	const fail = (err: unknown) => toast.error(errorMessage(err));
	if (target.kind === "curl") {
		return (
			<Dialog open onClose={onClose} title="导出 cURL" className="w-[min(760px,94vw)]">
				<div className="grid gap-2">
					<div className="flex flex-wrap items-center gap-2">
						<label className="mr-auto flex items-center gap-1.5 text-sm">
							<input
								type="checkbox"
								checked={resolve}
								onChange={e => setResolve(e.target.checked)}
							/>
							按当前环境替换变量(含敏感值)
						</label>
						<Button
							variant="default"
							disabled={curl.isPending}
							onClick={() =>
								curl.mutate({ source: target.source, resolve }, { onError: fail })
							}
						>
							生成
						</Button>
						{curl.data && (
							<Button
								onClick={() =>
									navigator.clipboard
										.writeText(curl.data.text)
										.then(() => toast.success("已复制"), fail)
								}
							>
								复制
							</Button>
						)}
					</div>
					{curl.data && (
						<Textarea aria-label="cURL 命令" readOnly rows={8} value={curl.data.text} />
					)}
				</div>
			</Dialog>
		);
	}
	const download = () =>
		openapi.mutate(
			{ node: target.node, format },
			{
				onSuccess: out => {
					const url = URL.createObjectURL(
						new Blob([out.text], {
							type: format === "json" ? "application/json" : "application/yaml",
						})
					);
					const a = document.createElement("a");
					a.href = url;
					a.download = out.filename;
					a.click();
					URL.revokeObjectURL(url);
					toast.success(`已导出 ${out.filename}`);
				},
				onError: fail,
			}
		);
	return (
		<Dialog
			open
			onClose={onClose}
			title={`导出「${target.title}」为 OpenAPI`}
			className="w-[min(480px,92vw)]"
		>
			<div className="grid gap-2">
				<Hint>
					每个请求成为一个 operation, 命名快照写成响应的 examples; 二进制快照不导出.
				</Hint>
				<div className="flex items-center gap-2">
					<Select
						aria-label="格式"
						className="w-28"
						value={format}
						onChange={e => setFormat(e.target.value as "yaml" | "json")}
					>
						<option value="yaml">YAML</option>
						<option value="json">JSON</option>
					</Select>
					<Button variant="default" disabled={openapi.isPending} onClick={download}>
						下载
					</Button>
				</div>
				{openapi.data && openapi.data.warnings.length > 0 && (
					<ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-700 dark:text-amber-400">
						{openapi.data.warnings.map((w, i) => (
							<li key={i}>{w}</li>
						))}
					</ul>
				)}
			</div>
		</Dialog>
	);
};
