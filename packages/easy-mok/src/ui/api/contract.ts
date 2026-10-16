// 管理接口 /__mock/api 的响应契约; 服务端测试用同一份 schema 断言, 防止前后端漂移
import { z } from "zod";

export const SceneLevel = z.enum(["request", "browser", "route", "group", "default"]);
export type SceneLevel = z.infer<typeof SceneLevel>;

export const RouteSummary = z.object({
	id: z.string(),
	key: z.string(),
	methods: z.array(z.string()),
	path: z.string(),
	weight: z.number(),
	source: z.object({
		type: z.enum(["code", "gui", "builtin"]),
		file: z.string().nullable(),
		line: z.number().nullable(),
	}),
	scenes: z.array(z.string()),
	active: z.object({ name: z.string(), level: SceneLevel, fallback: z.boolean() }),
	mode: z.enum(["mock", "pass"]),
	delay: z.number().nullable(),
	status: z.number().nullable(),
	hits: z.number(),
	lastHit: z.number().nullable(),
});
export type RouteSummary = z.infer<typeof RouteSummary>;

export const Envelope = z.object({
	status: z.number().int().min(100).max(599).optional(),
	headers: z.record(z.string(), z.string()).optional(),
	body: z.unknown(),
	delay: z.number().min(0).max(60000).optional(),
});
export type Envelope = z.infer<typeof Envelope>;

export const SceneDetail = z.object({
	name: z.string(),
	source: z.enum(["code", "json"]),
	kind: z.enum(["data", "function", "proxy", "envelope", "nullary"]),
	editable: z.boolean(),
	overrides: z.boolean(),
	content: z.unknown(),
	etag: z.string().nullable(),
});
export type SceneDetail = z.infer<typeof SceneDetail>;

export const RouteDetail = z.object({ route: RouteSummary, scenes: z.array(SceneDetail) });
export type RouteDetail = z.infer<typeof RouteDetail>;

export const Diagnostic = z.object({
	type: z.string(),
	message: z.string(),
	file: z.string().optional(),
	line: z.number().nullable().optional(),
	key: z.string().optional(),
	routeId: z.string().optional(),
});
export type Diagnostic = z.infer<typeof Diagnostic>;

export const LogLevel = z.enum(["silent", "hit", "all"]);

export const Meta = z.object({
	name: z.literal("easy-mok"),
	version: z.string(),
	bootId: z.string(),
	folder: z.string(),
	stateFile: z.string(),
	enabled: z.object({ code: z.boolean(), state: z.boolean(), effective: z.boolean() }),
	group: z.string().nullable(),
	logLevel: LogLevel,
	readOnly: z.boolean(),
	float: z.boolean(),
	counts: z.object({ routes: z.number(), files: z.number() }),
	diagnostics: z.array(Diagnostic),
	env: z.object({ node: z.string(), platform: z.string() }),
});
export type Meta = z.infer<typeof Meta>;

export const LogKind = z.enum(["mock", "proxy", "pass", "miss", "error"]);
export type LogKind = z.infer<typeof LogKind>;

export const LogSummary = z.object({
	id: z.string(),
	time: z.number(),
	method: z.string(),
	url: z.string(),
	kind: LogKind,
	routeId: z.string().nullable(),
	routeKey: z.string().nullable(),
	scene: z.string().nullable(),
	sceneLevel: z.string().nullable(),
	sceneFallback: z.boolean(),
	status: z.number(),
	durationMs: z.number(),
});
export type LogSummary = z.infer<typeof LogSummary>;

export const LogPart = z.object({
	headers: z.record(z.string(), z.string()),
	body: z.unknown(),
	bodyEncoding: z.enum(["utf8", "base64", "json", "none"]),
	truncated: z.boolean(),
});

export const LogDetail = LogSummary.extend({ request: LogPart, response: LogPart });
export type LogDetail = z.infer<typeof LogDetail>;

export const Groups = z.object({
	groups: z.record(z.string(), z.record(z.string(), z.string())),
	active: z.string().nullable(),
});
export type Groups = z.infer<typeof Groups>;

export const ApiErrorBody = z.object({
	error: z.object({
		code: z.string(),
		message: z.string(),
		details: z.record(z.string(), z.unknown()).optional(),
	}),
});

export const IgnoreConfig = z.object({
	defaults: z.object({
		enabled: z.boolean(),
		forcedOff: z.boolean(),
		rules: z.array(z.object({ pattern: z.string(), reason: z.string(), enabled: z.boolean() })),
	}),
	options: z.array(z.string()),
	custom: z.array(z.string()),
});
export type IgnoreConfig = z.infer<typeof IgnoreConfig>;

export const IgnoreValidation = z.object({
	errors: z.array(z.object({ index: z.number(), pattern: z.string(), error: z.string() })),
});
export type IgnoreValidation = z.infer<typeof IgnoreValidation>;

export const SaveSceneResult = z.object({ route: RouteSummary, scene: SceneDetail });
export const Removed = z.object({ removed: z.number() });

export const NAME_RE = /^[\p{L}\p{N}_-]{1,64}$/u;
