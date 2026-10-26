import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import { useRedactRules, useSaveRedactRules } from "@/api/debug-queries";
import { Badge } from "../ui/badge";
import { Hint, Textarea } from "../ui/input";
import { EditActions } from "../ui/panel";
import { ErrorState, Spinner } from "../ui/state";

/** 快照字段脱敏规则: 一行一条; 名字匹配任意层级的同名字段, $. 开头是从根开始的路径, * 匹配任意字段或下标. 默认只读, 点「编辑」切到文本框 */
export const RedactRulesPanel = () => {
	const rules = useRedactRules();
	const save = useSaveRedactRules();
	const [editing, setEditing] = useState(false);
	const [text, setText] = useState("");
	if (rules.isPending) return <Spinner label="加载脱敏规则" />;
	if (rules.isError) return <ErrorState error={rules.error} onRetry={() => rules.refetch()} />;
	const saved = rules.data.fields;
	const fields = text
		.split("\n")
		.map(s => s.trim())
		.filter(Boolean);
	const dirty = fields.join("\n") !== saved.join("\n");
	return (
		<>
			<div className="flex items-start gap-2">
				<Hint className="min-w-0 flex-1">
					命中的值写成 <code className="font-mono">***</code>, 只作用于另存的快照,
					历史保留原文.
					{!rules.data.custom && " 当前是默认的凭据字段规则."}
				</Hint>
				<span className="flex shrink-0 items-center gap-1">
					<EditActions
						editing={editing}
						onEdit={() => {
							setText(saved.join("\n"));
							setEditing(true);
						}}
						onCancel={() => setEditing(false)}
						onSave={() =>
							save.mutate(fields, {
								onSuccess: () => {
									toast.success("脱敏规则已保存");
									setEditing(false);
								},
								onError: err => toast.error(errorMessage(err)),
							})
						}
						canSave={dirty}
						saving={save.isPending}
						editLabel="编辑脱敏规则"
						saveLabel="保存规则"
					/>
				</span>
			</div>
			{editing ? (
				<Textarea
					aria-label="快照脱敏规则"
					rows={6}
					value={text}
					onChange={e => setText(e.target.value)}
				/>
			) : saved.length ? (
				<ul aria-label="快照脱敏规则" className="flex flex-wrap gap-1">
					{saved.map(f => (
						<li key={f}>
							<Badge className="font-mono">{f}</Badge>
						</li>
					))}
				</ul>
			) : (
				<p className="text-xs text-zinc-400">暂无规则</p>
			)}
			<details className="text-xs text-zinc-500 dark:text-zinc-400">
				<summary className="cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-200">
					规则写法
				</summary>
				<p className="mt-1">
					一行一条: <code className="font-mono">phone</code>{" "}
					匹配任意层级的同名字段(不区分大小写),{" "}
					<code className="font-mono">$.data.*.idCard</code> 从根开始匹配,{" "}
					<code className="font-mono">*</code> 匹配任意字段或下标. 保存后写入{" "}
					<code className="font-mono">__debug__/redact.json</code>.
				</p>
			</details>
		</>
	);
};
