import { lazy, Suspense } from "react";
import { Spinner } from "./ui/state";

// CodeMirror 体积较大, 只在打开编辑器时加载
const CodeMirror = lazy(async () => {
	const [{ default: Editor }, { json, jsonParseLinter }, { linter, lintGutter }] = await Promise.all([
		import("@uiw/react-codemirror"),
		import("@codemirror/lang-json"),
		import("@codemirror/lint"),
	]);
	const extensions = [json(), linter(jsonParseLinter()), lintGutter()];
	const Lazy = (props: { value: string; onChange?: (v: string) => void; readOnly?: boolean; height: string; dark: boolean }) => (
		<Editor
			value={props.value}
			onChange={props.onChange}
			readOnly={props.readOnly}
			height={props.height}
			theme={props.dark ? "dark" : "light"}
			extensions={extensions}
			basicSetup={{ foldGutter: true, highlightActiveLine: !props.readOnly }}
		/>
	);
	return { default: Lazy };
});

interface JsonEditorProps {
	value: string;
	onChange?: (value: string) => void;
	readOnly?: boolean;
	height?: string;
	label: string;
}

export const JsonEditor = ({ value, onChange, readOnly, height = "280px", label }: JsonEditorProps) => {
	const dark = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
	return (
		<div aria-label={label} className="overflow-hidden rounded-md border border-zinc-300 text-xs dark:border-zinc-700">
			<Suspense fallback={<Spinner label="加载编辑器" />}>
				<CodeMirror value={value} onChange={onChange} readOnly={readOnly} height={height} dark={dark} />
			</Suspense>
		</div>
	);
};

/** 校验 JSON 文本, 返回解析值或错误信息 */
export const parseJson = (text: string): { ok: true; value: unknown } | { ok: false; error: string } => {
	if (!text.trim()) { return { ok: true, value: null }; }
	try {
		return { ok: true, value: JSON.parse(text) };
	} catch (err) {
		return { ok: false, error: (err as Error).message };
	}
};
