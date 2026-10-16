import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import type { IgnoreConfig } from "@/api/contract";
import { useIgnore, useSaveIgnore, validateIgnore } from "@/api/queries";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { FieldError, Label, Textarea } from "./ui/input";
import { ErrorState, Spinner } from "./ui/state";
import { Switch } from "./ui/switch";

const linesOf = (text: string) => text.split("\n").map(s => s.trim()).filter(Boolean);

type Draft = { defaults: boolean, disabled: Set<string>, custom: string };

const draftOf = (c: IgnoreConfig): Draft => ({
	defaults: c.defaults.enabled,
	disabled: new Set(c.defaults.rules.filter(r => !r.enabled).map(r => r.pattern)),
	custom: c.custom.join("\n"),
});

/** 请求忽略规则: 命中的请求不进请求日志, 不影响 mock 匹配与响应 */
export const IgnoreDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
	const config = useIgnore();
	const save = useSaveIgnore();
	const [draft, setDraft] = useState<Draft | null>(null);
	const [errors, setErrors] = useState<Array<{ index: number; pattern: string; error: string }>>([]);

	useEffect(() => { // 打开时取一次快照编辑, 期间的推送刷新不覆盖正在编辑的内容
		if (!open) { setDraft(null); } else if (!draft && config.data) { setDraft(draftOf(config.data)); }
	}, [open, config.data, draft]);

	const custom = useMemo(() => (draft ? linesOf(draft.custom) : []), [draft]);
	useEffect(() => { // 输入停顿后由服务端即时校验
		if (!open || !custom.length) { setErrors([]); return; }
		const ctrl = new AbortController();
		const timer = setTimeout(() => {
			validateIgnore(custom, ctrl.signal).then(res => setErrors(res.errors), () => undefined);
		}, 250);
		return () => { clearTimeout(timer); ctrl.abort(); };
	}, [open, custom]);

	const submit = () => draft && save.mutate({ defaults: draft.defaults, disabled: [...draft.disabled], custom }, {
		onSuccess: () => { toast.success("忽略规则已保存"); onClose(); },
		onError: err => toast.error(errorMessage(err)),
	});

	const forcedOff = !!config.data?.defaults.forcedOff;
	return (
		<Dialog
			open={open}
			onClose={onClose}
			title="请求忽略规则"
			footer={<>
				<Button onClick={onClose}>取消</Button>
				<Button variant="default" disabled={!draft || errors.length > 0 || save.isPending} onClick={submit}>保存</Button>
			</>}
		>
			{config.isPending && <Spinner />}
			{config.isError && <ErrorState error={config.error} onRetry={() => config.refetch()} />}
			{config.data && draft && (
				<div className="space-y-4 text-sm">
					<p className="text-xs text-zinc-500">命中的请求不进请求日志, 也不打印终端日志; mock 匹配与响应不受影响. 规则写法: <code>[方法 ]路径</code>, <code>*</code> 匹配单段, <code>**</code> 跨段, 不区分大小写, 不含查询串.</p>
					<section className="space-y-2">
						<div className="flex items-center gap-2">
							<Switch label="启用内置规则" checked={draft.defaults && !forcedOff} disabled={forcedOff} onChange={v => setDraft({ ...draft, defaults: v })} />
							<span className="font-medium">内置规则</span>
							{forcedOff && <span className="text-xs text-amber-600">已由选项 ignoreDefaults: false 关闭</span>}
						</div>
						<ul aria-label="内置规则" className="divide-y divide-zinc-100 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
							{config.data.defaults.rules.map(r => (
								<li key={r.pattern} className="flex items-center gap-2 px-2 py-1 text-xs">
									<Switch
										label={`内置规则 ${r.pattern}`}
										checked={!draft.disabled.has(r.pattern)}
										disabled={!draft.defaults || forcedOff}
										onChange={v => {
											const next = new Set(draft.disabled);
											v ? next.delete(r.pattern) : next.add(r.pattern);
											setDraft({ ...draft, disabled: next });
										}}
									/>
									<code className="font-mono">{r.pattern}</code>
									<span className="ml-auto text-zinc-500">{r.reason}</span>
								</li>
							))}
						</ul>
					</section>
					{config.data.options.length > 0 && (
						<section className="space-y-1">
							<span className="font-medium">选项 ignore 追加的规则(只读)</span>
							<ul className="font-mono text-xs text-zinc-600 dark:text-zinc-400">{config.data.options.map(p => <li key={p}>{p}</li>)}</ul>
						</section>
					)}
					<Label>自定义规则(每行一条)
						<Textarea
							rows={6}
							aria-invalid={errors.length > 0}
							value={draft.custom}
							placeholder={"/health\nGET /static/**\n**/*.map"}
							onChange={e => setDraft({ ...draft, custom: e.target.value })}
						/>
						<FieldError>{errors.length ? errors.map(e => `第 ${e.index + 1} 条 ${e.pattern}: ${e.error}`).join("; ") : ""}</FieldError>
					</Label>
				</div>
			)}
		</Dialog>
	);
};
