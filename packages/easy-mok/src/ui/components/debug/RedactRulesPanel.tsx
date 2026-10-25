import { useEffect, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import { useRedactRules, useSaveRedactRules } from "@/api/debug-queries";
import { Button } from "../ui/button";
import { Textarea } from "../ui/input";

/** 快照字段脱敏规则: 一行一条; 名字匹配任意层级的同名字段, $. 开头是从根开始的路径, * 匹配任意字段或下标 */
export const RedactRulesPanel = () => {
	const rules = useRedactRules();
	const save = useSaveRedactRules();
	const [text, setText] = useState("");
	useEffect(() => {
		if (rules.data) setText(rules.data.fields.join("\n"));
	}, [rules.data]);
	const fields = text.split("\n").map(s => s.trim()).filter(Boolean);
	return (
		<div className="space-y-1">
			<Textarea aria-label="快照脱敏规则" rows={6} value={text} onChange={e => setText(e.target.value)} />
			<p className="text-xs text-zinc-500">
				一行一条: <code>phone</code> 匹配任意层级的同名字段(不区分大小写), <code>$.data.*.idCard</code> 从根开始匹配, <code>*</code> 匹配任意字段或下标. 命中的值写成 <code>***</code>. 只作用于另存的快照, 历史保留原文.
				{rules.data && !rules.data.custom && " 当前是默认的凭据字段规则, 保存后写入 __debug__/redact.json."}
			</p>
			<Button
				size="sm"
				disabled={save.isPending || !rules.data || fields.join("\n") === rules.data.fields.join("\n")}
				onClick={() => save.mutate(fields, { onSuccess: () => toast.success("脱敏规则已保存"), onError: err => toast.error(errorMessage(err)) })}
			>
				保存规则
			</Button>
		</div>
	);
};
