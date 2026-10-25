// 响应体文件的扩展名与 content-type 互查; 场景 bodyFile 与调试快照的 raw 文件共用这一份映射
import path from "path";

const TYPES: Array<{ ext: string; type: string; text: boolean }> = [
	{ ext: "json", type: "application/json", text: true },
	{ ext: "html", type: "text/html", text: true },
	{ ext: "csv", type: "text/csv", text: true },
	{ ext: "txt", type: "text/plain", text: true },
	{ ext: "xml", type: "application/xml", text: true },
	{ ext: "js", type: "text/javascript", text: true },
	{ ext: "css", type: "text/css", text: true },
	{ ext: "svg", type: "image/svg+xml", text: true },
	{ ext: "png", type: "image/png", text: false },
	{ ext: "jpg", type: "image/jpeg", text: false },
	{ ext: "gif", type: "image/gif", text: false },
	{ ext: "webp", type: "image/webp", text: false },
	{ ext: "pdf", type: "application/pdf", text: false },
	{ ext: "bin", type: "application/octet-stream", text: false },
];

const ALIASES: Record<string, string> = {
	"text/xml": "xml",
	"application/javascript": "js",
	"application/x-javascript": "js",
	"image/jpg": "jpg",
	jpeg: "jpg",
	htm: "html",
	mjs: "js",
};

/** content-type 的主类型(小写, 去掉参数) */
export const baseType = (contentType: string | undefined | null) =>
	String(contentType || "")
		.split(";")[0]
		.trim()
		.toLowerCase();

/** content-type → 扩展名; +json 与 +xml 后缀归入 json 与 xml, 无法识别时为 bin */
export const extOfType = (contentType: string | undefined | null) => {
	const type = baseType(contentType);
	if (type.endsWith("+json")) return "json";
	if (type.endsWith("+xml")) return "xml";
	if (ALIASES[type]) return ALIASES[type];
	return TYPES.find(t => t.type === type)?.ext || "bin";
};

/** 文件路径的扩展名(小写, 不带点), 别名归一 */
export const extOfFile = (file: string) => {
	const ext = path.extname(file).slice(1).toLowerCase();
	return ALIASES[ext] || ext;
};

/** 扩展名 → content-type; 文本类型带 charset=utf-8, 未知扩展名为 application/octet-stream */
export const typeOfExt = (ext: string) => {
	const hit = TYPES.find(t => t.ext === ext);
	if (!hit) return "application/octet-stream";
	return hit.text ? `${hit.type}; charset=utf-8` : hit.type;
};

export const isTextExt = (ext: string) => !!TYPES.find(t => t.ext === ext && t.text);
