import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import type { RouteSummary, SceneDetail } from "@/api/contract";
import { sceneBodyUrl, useSaveSceneBody, useSceneBody } from "@/api/queries";
import { Button } from "./ui/button";
import { Textarea } from "./ui/input";
import { KvList } from "./ui/kv";
import { Section } from "./ui/panel";

const formatSize = (n: number) =>
	n < 1024
		? `${n} B`
		: n < 1024 * 1024
			? `${(n / 1024).toFixed(1)} KB`
			: `${(n / 1024 / 1024).toFixed(1)} MB`;

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
		<Section
			title={`场景「${scene.name}」的响应体文件`}
			actions={
				<Button size="sm" variant="ghost" onClick={onClose}>
					收起
				</Button>
			}
		>
			<KvList
				items={[
					["路径", <span className="font-mono text-xs">__scenes__/{info.path}</span>],
					["类型", info.contentType],
					[
						"大小",
						info.exists ? (
							formatSize(info.size)
						) : (
							<span className="text-rose-600">文件不存在</span>
						),
					],
				]}
			/>
			{info.exists && !info.text && (
				<div className="space-y-1.5">
					{isImage && (
						<img
							src={url}
							alt={info.path}
							className="max-h-72 rounded-md border border-zinc-200 dark:border-zinc-800"
						/>
					)}
					<a
						href={url}
						download
						className="inline-flex items-center gap-1 text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900 dark:text-zinc-100 dark:decoration-zinc-600 dark:hover:decoration-zinc-100"
					>
						<Download size={12} />
						下载文件
					</a>
				</div>
			)}
			{info.exists && info.text && (
				<>
					{body.isError && (
						<p className="text-xs text-rose-600">{errorMessage(body.error)}</p>
					)}
					<Textarea
						aria-label={`场景 ${scene.name} 文件内容`}
						rows={14}
						value={text}
						readOnly={!editable}
						onChange={e => setText(e.target.value)}
					/>
					{editable && (
						<Button
							variant="default"
							size="sm"
							disabled={
								save.isPending || body.data === undefined || text === body.data
							}
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
		</Section>
	);
};
