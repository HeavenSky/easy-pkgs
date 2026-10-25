import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import type { RouteSummary, SceneDetail } from "@/api/contract";
import { sceneBodyUrl, useSaveSceneBody, useSceneBody } from "@/api/queries";
import { Button } from "./ui/button";
import { Textarea } from "./ui/input";

const formatSize = (n: number) =>
	n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

/** bodyFile 场景: 显示文件信息与预览; 管理页场景的文本文件可在线编辑, 二进制只读 */
export const BodyFilePanel = ({
	route,
	scene,
	onClose,
}: {
	route: RouteSummary;
	scene: SceneDetail;
	onClose: () => void;
}) => {
	const info = scene.bodyFile!;
	const editable = scene.editable && info.text && info.exists;
	const body = useSceneBody(route.id, scene.name, scene.etag, info.text && info.exists);
	const save = useSaveSceneBody();
	const [text, setText] = useState("");
	useEffect(() => {
		if (body.data !== undefined) setText(body.data);
	}, [body.data]);
	const url = sceneBodyUrl(route.id, scene.name);
	const isImage = info.contentType.startsWith("image/") && !info.contentType.includes("svg");

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between text-sm font-medium">
				场景「{scene.name}」的响应体文件
				<Button size="sm" variant="ghost" onClick={onClose}>
					收起
				</Button>
			</div>
			<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
				<dt className="text-zinc-500">路径</dt>
				<dd className="font-mono break-all">__scenes__/{info.path}</dd>
				<dt className="text-zinc-500">类型</dt>
				<dd>{info.contentType}</dd>
				<dt className="text-zinc-500">大小</dt>
				<dd>{info.exists ? formatSize(info.size) : <span className="text-rose-600">文件不存在</span>}</dd>
			</dl>
			{info.exists && !info.text && (
				<div className="space-y-2">
					{isImage && <img src={url} alt={info.path} className="max-h-72 rounded border" />}
					<a href={url} download className="inline-flex items-center gap-1 text-sm text-sky-700 hover:underline">
						<Download size={14} />
						下载文件
					</a>
				</div>
			)}
			{info.exists && info.text && (
				<>
					{body.isError && <p className="text-sm text-rose-600">{errorMessage(body.error)}</p>}
					<Textarea
						aria-label={`场景 ${scene.name} 文件内容`}
						rows={14}
						className="font-mono text-xs"
						value={text}
						readOnly={!editable}
						onChange={e => setText(e.target.value)}
					/>
					{editable && (
						<Button
							variant="default"
							size="sm"
							disabled={save.isPending || body.data === undefined || text === body.data}
							onClick={() =>
								save.mutate(
									{ id: route.id, name: scene.name, text, etag: scene.etag },
									{
										onSuccess: () => toast.success("文件已保存"),
										onError: err => toast.error(errorMessage(err)),
									}
								)
							}
						>
							保存文件
						</Button>
					)}
				</>
			)}
		</div>
	);
};
