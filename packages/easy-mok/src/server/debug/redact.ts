// 调试数据的隔离与脱敏: 不提交的目录写入自忽略的 .gitignore; 敏感值回填为占位符, 敏感头写成 ***, set-cookie 默认脱敏, 按字段规则脱敏 JSON
import fs from "fs";
import path from "path";
import { SECRET_HEADERS } from "../journal";
import { MockError, isPlainObject, writeJsonAtomic } from "../util";
import { readJson } from "./store";

/** 短于这个长度的敏感值不回填, 免得把 "1", "true" 之类的常见片段误替换 */
export const SECRET_MIN_LENGTH = 6;
export const MASK = "***";
export const REDACT_FILE = "redact.json";
/** 没有 redact.json 时使用的字段规则: 常见的凭据字段 */
export const DEFAULT_FIELD_RULES = [
	"password",
	"passwd",
	"token",
	"accessToken",
	"access_token",
	"refreshToken",
	"refresh_token",
	"secret",
	"apiKey",
	"api_key",
];

/** 目录内放内容为 * 的 .gitignore, 让该目录(含 .gitignore 自身)都不进版本库, 不改用户的根 .gitignore */
export const ensureIgnoredDir = (dir: string) => {
	const file = path.join(dir, ".gitignore");
	try {
		fs.mkdirSync(dir, { recursive: true });
		if (!fs.existsSync(file)) fs.writeFileSync(file, "*\n");
	} catch (err) {
		console.warn("[easy-mok] 写入 .gitignore 失败:", file, (err as Error).message || err);
	}
};

export type SecretHit = { id: string; value: string };

/** 解析结果中来自敏感值来源的变量; 按长度降序, 先替换长的 */
export const secretHitsOf = (
	values: Record<string, { value: string; from: string }>
): SecretHit[] => {
	const hits = new Map<string, string>();
	Object.values(values).forEach(v => {
		if (
			v.from.startsWith("secret:") &&
			v.value.length >= SECRET_MIN_LENGTH &&
			!v.value.startsWith("<secret:")
		) {
			hits.set(v.value, v.from.slice(7));
		}
	});
	return [...hits.entries()]
		.map(([value, id]) => ({ id, value }))
		.sort((a, b) => b.value.length - a.value.length);
};

export const replaceSecrets = (text: string, hits: SecretHit[]) =>
	hits.reduce((s, h) => s.split(h.value).join(`<secret:${h.id}>`), text);

/** 实际发出的请求: 敏感值回填占位符; 敏感头没有占位符时写成 *** */
export const redactRequest = <
	T extends { url: string; headers: Array<[string, string]>; body: Record<string, any> },
>(
	req: T,
	hits: SecretHit[]
): T => {
	const headers = req.headers.map(([k, v]) => {
		const replaced = replaceSecrets(v, hits);
		return [k, SECRET_HEADERS.has(k) && !replaced.includes("<secret:") ? MASK : replaced] as [
			string,
			string,
		];
	});
	const body =
		req.body && req.body.type === "text"
			? { ...req.body, text: replaceSecrets(String(req.body.text), hits) }
			: req.body;
	return { ...req, url: replaceSecrets(req.url, hits), headers, body };
};

/** 模板中的变量取值: 敏感值写成占位符 */
export const redactValues = (values: Record<string, { value: string; from: string }>) =>
	Object.fromEntries(
		Object.entries(values).map(([k, v]) => [
			k,
			v.from.startsWith("secret:") ? { ...v, value: `<secret:${v.from.slice(7)}>` } : v,
		])
	);

export const maskSetCookie = (headers: Array<[string, string]>) =>
	headers.map(([k, v]) => [k, k === "set-cookie" ? MASK : v] as [string, string]);

/** 字段规则: 不带 $ 的名字匹配任意层级的同名 key(不区分大小写); $. 开头的是从根开始的路径, * 匹配任意 key 或数组下标 */
export const parseRules = (rules: string[]) =>
	rules
		.map(r => r.trim())
		.filter(Boolean)
		.map(r =>
			r.startsWith("$.")
				? {
						kind: "path" as const,
						segs: r
							.slice(2)
							.split(".")
							.map(s => s.toLowerCase()),
					}
				: { kind: "name" as const, name: r.toLowerCase() }
		);

/** 按规则脱敏 JSON 值, 返回新值与命中数 */
export const redactFields = (value: unknown, rules: string[]) => {
	const parsed = parseRules(rules);
	let count = 0;
	const walk = (v: unknown, trail: string[]): unknown => {
		if (Array.isArray(v)) return v.map((x, i) => walk(x, [...trail, String(i)]));
		if (!isPlainObject(v)) return v;
		const out: Record<string, unknown> = {};
		Object.entries(v).forEach(([k, x]) => {
			const t = [...trail, k.toLowerCase()];
			const hit = parsed.some(r =>
				r.kind === "name"
					? r.name === k.toLowerCase()
					: r.segs.length === t.length && r.segs.every((s, i) => s === "*" || s === t[i])
			);
			if (hit && x !== null && x !== undefined) {
				count++;
				out[k] = MASK;
			} else out[k] = walk(x, t);
		});
		return out;
	};
	return { value: walk(value, []), count };
};

/** 按规则脱敏 JSON 文本; 不是 JSON 或没有命中时原样返回(保留原字节) */
export const redactJsonText = (text: string, rules: string[]) => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return { text, count: 0 };
	}
	const { value, count } = redactFields(parsed, rules);
	if (!count) return { text, count: 0 };
	return {
		text: text.includes("\n") ? `${JSON.stringify(value, null, 2)}\n` : JSON.stringify(value),
		count,
	};
};

/** 字段规则存于 __debug__/redact.json(提交到仓库); 不存在时用默认规则 */
export const createRedactRules = (debugRoot: string) => {
	const file = path.join(debugRoot, REDACT_FILE);
	const get = () => {
		const { ok, value, text } = readJson(file);
		if (text === null) return { fields: DEFAULT_FIELD_RULES, custom: false };
		if (!ok || !isPlainObject(value) || !Array.isArray(value.fields)) {
			throw new MockError(
				"META_FILE_INVALID",
				409,
				`${file} 不是合法的 { fields: [] } JSON, 请修复或删除`,
				{ file }
			);
		}
		return {
			fields: value.fields.filter((f): f is string => typeof f === "string" && !!f.trim()),
			custom: true,
		};
	};
	const put = (fields: unknown) => {
		if (!Array.isArray(fields) || !fields.every(f => typeof f === "string")) {
			throw new MockError("BAD_REQUEST", 400, "fields 必须是字符串数组", { field: "fields" });
		}
		const clean = [...new Set(fields.map(f => f.trim()).filter(Boolean))];
		const bad = clean.find(f => f.startsWith("$") && !/^\$(\.[^.]+)+$/.test(f));
		if (bad)
			throw new MockError(
				"BAD_REQUEST",
				400,
				`路径规则必须形如 $.a.b 或 $.list.*.phone: ${bad}`,
				{ field: "fields" }
			);
		writeJsonAtomic(file, { version: 1, fields: clean });
		return get();
	};
	return { file, get, put };
};
