import { Send } from "lucide-react";
import { useState } from "react";
import type { RouteSummary } from "@/api/contract";
import { pretty } from "@/lib/utils";
import { JsonEditor } from "./JsonEditor";
import { StatusBadge } from "./ui/badge";
import { Button } from "./ui/button";
import { Hint, Input, Label, Select, Textarea } from "./ui/input";
import { KvList } from "./ui/kv";
import { Section } from "./ui/panel";

const ALL_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

/** 把路由路径转成可直接请求的示例: :name 填 1, * 填 demo, 去掉可选与正则修饰 */
export const samplePath = (path: string) =>
	path
		.replace(/:(\w+)(\([^)]*\))?\?/g, "1")
		.replace(/:(\w+)(\([^)]*\))?/g, "1")
		.replace(/\*/g, "demo")
		.replace(/\\(.)/g, "$1");

interface Result {
	status: number;
	ms: number;
	headers: Array<[string, string]>;
	body: string;
	json: boolean;
}

export const TryRequest = ({ route }: { route: RouteSummary }) => {
	const methods = route.methods.includes("ALL") ? ALL_METHODS : route.methods;
	const [method, setMethod] = useState(methods[0]);
	const [url, setUrl] = useState(samplePath(route.path));
	const [scene, setScene] = useState("");
	const [body, setBody] = useState("");
	const [result, setResult] = useState<Result | null>(null);
	const [error, setError] = useState("");
	const [pending, setPending] = useState(false);
	const hasBody = method !== "GET" && method !== "HEAD";

	const send = async () => {
		setPending(true);
		setError("");
		const t0 = performance.now();
		try {
			const res = await fetch(url, {
				method,
				headers: {
					...(scene ? { "x-mock-scene": scene } : {}),
					...(hasBody && body ? { "content-type": "application/json" } : {}),
				},
				body: hasBody && body ? body : undefined,
			});
			const text = await res.text();
			const type = res.headers.get("content-type") || "";
			let shown = text;
			const json = /json/.test(type);
			if (json) {
				try {
					shown = pretty(JSON.parse(text));
				} catch {
					/* 保持原文 */
				}
			}
			setResult({
				status: res.status,
				ms: Math.round(performance.now() - t0),
				headers: [...res.headers.entries()],
				body: shown,
				json,
			});
		} catch (err) {
			setError(`请求失败: ${(err as Error).message}`);
			setResult(null);
		} finally {
			setPending(false);
		}
	};

	return (
		<div className="space-y-3">
			<Hint>
				由浏览器直接请求该地址, 与业务页面发出的请求完全一致; 可临时指定场景(经请求头{" "}
				<code className="font-mono">x-mock-scene</code>, 不影响其他请求).
			</Hint>
			<form
				className="flex flex-wrap items-end gap-2"
				onSubmit={e => {
					e.preventDefault();
					send();
				}}
			>
				<Label>
					方法
					<Select value={method} onChange={e => setMethod(e.target.value)}>
						{methods.map(m => (
							<option key={m}>{m}</option>
						))}
					</Select>
				</Label>
				<Label className="min-w-60 flex-1">
					地址(含查询参数)
					<Input
						value={url}
						onChange={e => setUrl(e.target.value)}
						className="font-mono text-xs"
					/>
				</Label>
				<Label>
					场景
					<Select value={scene} onChange={e => setScene(e.target.value)}>
						<option value="">按当前生效</option>
						{route.scenes.map(s => (
							<option key={s} value={s}>
								{s}
							</option>
						))}
					</Select>
				</Label>
				<Button type="submit" variant="default" disabled={pending || !url.startsWith("/")}>
					<Send size={14} />
					{pending ? "请求中" : "发送"}
				</Button>
			</form>
			{hasBody && (
				<Label>
					请求体(JSON)
					<Textarea
						rows={4}
						value={body}
						onChange={e => setBody(e.target.value)}
						placeholder='{"name": "张三"}'
					/>
				</Label>
			)}
			{error && (
				<p role="alert" className="text-xs text-rose-600">
					{error}
				</p>
			)}
			{result && (
				<div aria-live="polite">
					<Section
						title={
							<span className="flex items-center gap-2">
								响应
								<StatusBadge status={result.status} />
								<span className="font-normal text-zinc-400">{result.ms} ms</span>
							</span>
						}
					>
						<details className="text-xs">
							<summary className="cursor-pointer text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
								响应头 ({result.headers.length})
							</summary>
							<KvList mono className="mt-1.5" items={result.headers} />
						</details>
						{result.json ? (
							<JsonEditor
								label="响应体"
								readOnly
								value={result.body}
								height="260px"
							/>
						) : (
							<pre className="max-h-72 overflow-auto rounded-md border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs whitespace-pre-wrap dark:border-zinc-800 dark:bg-zinc-800">
								{result.body || "(空)"}
							</pre>
						)}
					</Section>
				</div>
			)}
		</div>
	);
};
