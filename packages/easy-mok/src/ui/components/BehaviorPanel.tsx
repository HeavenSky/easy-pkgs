import { useEffect, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import type { RouteSummary } from "@/api/contract";
import { usePatchRouteState } from "@/api/queries";
import { useUnsaved } from "@/lib/unsaved";
import { Button } from "./ui/button";
import { FieldError, Input, Label } from "./ui/input";

const parseOptional = (text: string, min: number, max: number) => {
	if (!text.trim()) { return { ok: true as const, value: null }; }
	const n = Number(text);
	return Number.isInteger(n) && n >= min && n <= max ? { ok: true as const, value: n } : { ok: false as const };
};

export const BehaviorPanel = ({ route }: { route: RouteSummary }) => {
	const patch = usePatchRouteState();
	const [mode, setMode] = useState(route.mode);
	const [delay, setDelay] = useState(route.delay?.toString() || "");
	const [status, setStatus] = useState(route.status?.toString() || "");
	useEffect(() => {
		setMode(route.mode);
		setDelay(route.delay?.toString() || "");
		setStatus(route.status?.toString() || "");
	}, [route.mode, route.delay, route.status]);
	const d = parseOptional(delay, 0, 60000);
	const s = parseOptional(status, 100, 599);
	const dirty = mode !== route.mode || delay !== (route.delay?.toString() || "") || status !== (route.status?.toString() || "");
	useUnsaved(dirty);
	const save = (body: Parameters<typeof patch.mutate>[0]["patch"], ok: string) => patch.mutate({ id: route.id, patch: body }, {
		onSuccess: () => toast.success(ok),
		onError: err => toast.error(errorMessage(err)),
	});
	return (
		<form
			className="max-w-xl space-y-4"
			onSubmit={e => {
				e.preventDefault();
				if (!d.ok || !s.ok) { return; }
				save({ mode, delay: d.value, status: s.value }, "已保存");
			}}
		>
			<fieldset className="space-y-2">
				<legend className="mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">处理方式</legend>
				{([["mock", "返回 mock 场景"], ["pass", "放行到真实后端(交给 dev server 的代理或后续中间件)"]] as const).map(([value, text]) => (
					<label key={value} className="flex items-center gap-2 text-sm">
						<input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} />{text}
					</label>
				))}
			</fieldset>
			<div className="grid grid-cols-2 gap-3">
				<Label>
					延迟(毫秒, 0-60000, 留空不延迟)
					<Input inputMode="numeric" value={delay} aria-invalid={!d.ok} onChange={e => setDelay(e.target.value)} placeholder="例如 1500" />
					<FieldError>{!d.ok && "请输入 0-60000 的整数"}</FieldError>
				</Label>
				<Label>
					状态码覆盖(100-599, 留空不覆盖)
					<Input inputMode="numeric" value={status} aria-invalid={!s.ok} onChange={e => setStatus(e.target.value)} placeholder="例如 503" />
					<FieldError>{!s.ok && "请输入 100-599 的整数"}</FieldError>
				</Label>
			</div>
			<p className="text-xs text-zinc-500">状态码覆盖对数据, 函数与代理场景都生效; 场景自带的延迟会被这里的设置覆盖.</p>
			<div className="flex gap-2">
				<Button type="submit" variant="default" disabled={!dirty || !d.ok || !s.ok || patch.isPending}>保存</Button>
				<Button disabled={patch.isPending || (route.mode === "mock" && route.delay === null && route.status === null)} onClick={() => save({ mode: null, delay: null, status: null }, "已恢复默认")}>恢复默认</Button>
			</div>
		</form>
	);
};
