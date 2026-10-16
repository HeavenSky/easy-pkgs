import type { Extension } from "@codemirror/state";
import { lazy, Suspense } from "react";
import { Spinner } from "./ui/state";

export type EditorLanguage = "json" | "javascript";

// CodeMirror 体积较大, 只在打开编辑器时加载
const CodeMirror = lazy(async () => {
	const [{ default: Editor }, { json, jsonParseLinter }, { javascript }, { linter, lintGutter }] = await Promise.all([
		import("@uiw/react-codemirror"),
		import("@codemirror/lang-json"),
		import("@codemirror/lang-javascript"),
		import("@codemirror/lint"),
	]);
	const extensions: Record<EditorLanguage, Extension[]> = {
		json: [json(), linter(jsonParseLinter()), lintGutter()],
		javascript: [javascript()],
	};
	const Lazy = (props: { value: string; onChange?: (v: string) => void; readOnly?: boolean; height: string; dark: boolean; language: EditorLanguage }) => (
		<Editor
			value={props.value}
			onChange={props.onChange}
			readOnly={props.readOnly}
			height={props.height}
			theme={props.dark ? "dark" : "light"}
			extensions={extensions[props.language]}
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
	language?: EditorLanguage;
}

export const JsonEditor = ({ value, onChange, readOnly, height = "280px", label, language = "json" }: JsonEditorProps) => {
	const dark = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
	return (
		<div aria-label={label} className="overflow-hidden rounded-md border border-zinc-300 text-xs dark:border-zinc-700">
			<Suspense fallback={<Spinner label="加载编辑器" />}>
				<CodeMirror value={value} onChange={onChange} readOnly={readOnly} height={height} dark={dark} language={language} />
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
