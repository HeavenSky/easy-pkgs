import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

const rtf = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });

export const relativeTime = (time: number | null, now = Date.now()) => {
	if (!time) {
		return "—";
	}
	const sec = Math.round((time - now) / 1000);
	if (Math.abs(sec) < 60) {
		return rtf.format(sec, "second");
	}
	const min = Math.round(sec / 60);
	if (Math.abs(min) < 60) {
		return rtf.format(min, "minute");
	}
	const hour = Math.round(min / 60);
	if (Math.abs(hour) < 24) {
		return rtf.format(hour, "hour");
	}
	return rtf.format(Math.round(hour / 24), "day");
};

export const clockTime = (time: number) =>
	new Date(time).toLocaleTimeString("zh-CN", { hour12: false });

export const METHOD_COLORS: Record<string, string> = {
	GET: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
	POST: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
	PUT: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
	PATCH: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
	DELETE: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
};

export const methodColor = (method: string) =>
	METHOD_COLORS[method] || "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200";

/** 在 VS Code 中打开文件的链接; 按路径段编码, encodeURI 不编码路径里的 # ? 会截断链接. 显示文本由调用方用原始路径 */
export const vscodeLink = (file: string | null | undefined, line?: number | null) => {
	if (!file) {
		return null;
	}
	const encoded = file
		.replace(/\\/g, "/")
		.split("/")
		.map(seg => (/^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg)))
		.join("/");
	return `vscode://file${encoded.startsWith("/") ? "" : "/"}${encoded}${line ? `:${line}` : ""}`;
};

export const pretty = (value: unknown) => {
	if (value === undefined) {
		return "";
	}
	if (typeof value === "string") {
		return value;
	}
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
};
