// 调试接口 /__mock/api/debug 的响应契约; 服务端测试用同一份 schema 断言, 防止前后端漂移
import { z } from "zod";

// 与 src/server/debug/names.ts 的 DEBUG_NAME_RE 必须逐字相同, 契约测试比对两者源码
export const DEBUG_NAME_RE = /^(?![._-])[A-Za-z0-9._\-\p{Script=Han}]{1,64}(?<![._-])$/u;

export const Problem = z.object({
	type: z.string(),
	message: z.string(),
	file: z.string().optional(),
});

export const SnapshotItem = z.object({ name: z.string(), title: z.string(), weight: z.number() });
export type SnapshotItem = z.infer<typeof SnapshotItem>;

export type TreeNode = {
	id: string;
	kind: "group" | "request";
	name: string;
	title: string;
	weight: number;
	vars: Record<string, string>;
	method?: string;
	url?: string;
	snapshots?: SnapshotItem[];
	children?: TreeNode[];
};
export const TreeNode: z.ZodType<TreeNode> = z.lazy(() =>
	z.object({
		id: z.string(),
		kind: z.enum(["group", "request"]),
		name: z.string(),
		title: z.string(),
		weight: z.number(),
		vars: z.record(z.string(), z.string()),
		method: z.string().optional(),
		url: z.string().optional(),
		snapshots: z.array(SnapshotItem).optional(),
		children: z.array(TreeNode).optional(),
	})
);

export const DebugTree = z.object({ nodes: z.array(TreeNode), problems: z.array(Problem) });
export type DebugTree = z.infer<typeof DebugTree>;

const Row = z.tuple([z.string(), z.string(), z.boolean()]);
export type Row = z.infer<typeof Row>;

export const Definition = z
	.object({
		version: z.number(),
		method: z.string(),
		url: z.string(),
		params: z.object({ path: z.record(z.string(), z.string()), query: z.array(Row) }).loose(),
		headers: z.array(Row),
		auth: z.object({ type: z.enum(["none", "bearer", "basic"]) }).loose(),
		body: z.object({ type: z.enum(["none", "json", "text", "form", "multipart", "binary"]) }).loose(),
		settings: z
			.object({
				timeoutMs: z.number(),
				followRedirects: z.boolean(),
				insecureTLS: z.boolean(),
				proxy: z.string().nullable(),
			})
			.loose(),
		route: z.string().nullable(),
	})
	.loose();
export type Definition = z.infer<typeof Definition>;

export const Vars = z.record(z.string(), z.string());

export const DebugRequest = z.object({
	id: z.string(),
	definition: Definition,
	meta: z.object({ title: z.string().nullable(), weight: z.number(), vars: Vars }),
	etag: z.string(),
	metaEtag: z.string(),
});
export type DebugRequest = z.infer<typeof DebugRequest>;

export const EnvGroup = z.object({
	name: z.string(),
	title: z.string(),
	weight: z.number(),
	vars: Vars,
	etag: z.string(),
});
export type EnvGroup = z.infer<typeof EnvGroup>;

export const EnvList = z.object({
	active: z.string().nullable(),
	groups: z.array(EnvGroup),
	problems: z.array(Problem),
});
export type EnvList = z.infer<typeof EnvList>;

export const SecretItem = z.object({
	id: z.string(),
	from: z.enum(["value", "env"]).nullable(),
	configured: z.boolean(),
	envName: z.string().optional(),
});
export type SecretItem = z.infer<typeof SecretItem>;

export const ResolvedValue = z.object({ value: z.string(), from: z.string() });

export const Resolved = z.object({
	method: z.string(),
	url: z.string(),
	urlError: z.string().nullable(),
	headers: z.array(z.tuple([z.string(), z.string()])),
	values: z.record(z.string(), ResolvedValue),
	unresolved: z.array(z.string()),
	env: z.string().nullable(),
});
export type Resolved = z.infer<typeof Resolved>;

/** URL 中的调试标识用 base64url 编码 */
export const encodeId = (id: string) =>
	btoa(String.fromCharCode(...new TextEncoder().encode(id)))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
