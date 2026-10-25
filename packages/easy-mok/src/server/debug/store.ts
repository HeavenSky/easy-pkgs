// 调试请求集合的磁盘存储: __debug__/requests 下的分组, 请求, __meta__.json 与 req.json
import fs from "fs";
import path from "path";
import { MockError, isPlainObject, sha1, writeJsonAtomic } from "../util";
import {
	DEBUG_DIR,
	META_FILE,
	REQ_FILE,
	SNAPSHOTS_DIR,
	VAR_NAME_RE,
	assertDebugName,
	isDebugName,
	nameKey,
	splitNodeId,
} from "./names";

export type NodeMeta = { version: number; name?: string; weight?: number; vars?: Record<string, string> };
export type Problem = { type: string; message: string; file?: string };
export type TreeNode = {
	id: string;
	kind: "group" | "request";
	name: string;
	title: string;
	weight: number;
	vars: Record<string, string>;
	method?: string;
	url?: string;
	snapshots?: Array<{ name: string; title: string; weight: number }>;
	children?: TreeNode[];
};

export const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const BODY_TYPES = ["none", "json", "text", "form", "multipart", "binary"];
const AUTH_TYPES = ["none", "bearer", "basic"];
export const DEFAULT_SETTINGS = {
	timeoutMs: 30000,
	followRedirects: true,
	insecureTLS: false,
	proxy: null as string | null,
	skipCookieJar: false,
};

/** weight 只认安全整数, 其余一律当作 0 */
export const weightOf = (v: unknown) => (Number.isSafeInteger(v) ? (v as number) : 0);

/** 按 weight 降序, 再按展示名中文排序 */
export const byWeight = <T extends { weight: number; title: string }>(a: T, b: T) =>
	b.weight - a.weight || a.title.localeCompare(b.title, "zh");

const bad = (message: string, field?: string) =>
	new MockError("BAD_REQUEST", 400, message, field ? { field } : undefined);

/** 变量表只保留合法名字的字符串值 */
export const normalizeVars = (raw: unknown, strict: boolean) => {
	const out: Record<string, string> = {};
	if (raw === undefined || raw === null) return out;
	if (!isPlainObject(raw)) {
		if (strict) throw bad("vars 必须是对象", "vars");
		return out;
	}
	Object.entries(raw).forEach(([k, v]) => {
		if (!VAR_NAME_RE.test(k) || typeof v !== "string") {
			if (strict) throw bad(`变量 ${k} 的名字不合法或值不是字符串`, "vars");
			return;
		}
		out[k] = v;
	});
	return out;
};

const isRow = (row: unknown, size: number) =>
	Array.isArray(row) && row.length >= size && row.slice(0, size).every(x => typeof x === "string");

/** 校验 req.json(规格 5.3); 未知字段原样保留 */
export const normalizeDefinition = (raw: unknown) => {
	if (!isPlainObject(raw)) throw bad("请求定义必须是对象", "definition");
	const def: Record<string, any> = { ...raw, version: 1 };
	const method = String(def.method || "GET").toUpperCase();
	if (!METHODS.includes(method)) throw bad(`不支持的方法: ${def.method}`, "method");
	def.method = method;
	if (typeof def.url !== "string") def.url = "";
	const params = isPlainObject(def.params) ? def.params : {};
	const pathParams: Record<string, string> = {};
	if (isPlainObject(params.path)) {
		Object.entries(params.path).forEach(([k, v]) => {
			if (typeof v !== "string") throw bad(`路径参数 ${k} 的值必须是字符串`, "params");
			pathParams[k] = v;
		});
	}
	const query = Array.isArray(params.query) ? params.query : [];
	query.forEach(row => {
		if (!isRow(row, 2)) throw bad("query 每项必须是 [名, 值, 是否启用]", "params");
	});
	def.params = { ...params, path: pathParams, query: query.map(r => [r[0], r[1], r[2] !== false]) };
	const headers = Array.isArray(def.headers) ? def.headers : [];
	headers.forEach(row => {
		if (!isRow(row, 2)) throw bad("headers 每项必须是 [名, 值, 是否启用]", "headers");
		if (row[0] && !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(row[0])) throw bad(`非法的请求头名称: ${row[0]}`, "headers");
	});
	def.headers = headers.map(r => [r[0], r[1], r[2] !== false]);
	const auth = isPlainObject(def.auth) ? def.auth : { type: "none" };
	if (!AUTH_TYPES.includes(String(auth.type))) throw bad(`不支持的认证方式: ${auth.type}`, "auth");
	def.auth = auth;
	const body = isPlainObject(def.body) ? def.body : { type: "none" };
	if (!BODY_TYPES.includes(String(body.type))) throw bad(`不支持的请求体类型: ${body.type}`, "body");
	if (body.type === "text" && typeof body.content !== "string") throw bad("text 请求体的 content 必须是字符串", "body");
	if (body.type === "form") {
		const fields = Array.isArray(body.fields) ? body.fields : [];
		fields.forEach(row => {
			if (!isRow(row, 2)) throw bad("form 每项必须是 [名, 值, 是否启用]", "body");
		});
		body.fields = fields.map(r => [r[0], r[1], r[2] !== false]);
	}
	if (body.type === "multipart") {
		const parts = Array.isArray(body.parts) ? body.parts : [];
		parts.forEach(p => {
			if (!isPlainObject(p) || typeof p.name !== "string") throw bad("multipart 每项必须含 name", "body");
			if (p.file !== undefined && typeof p.file !== "string") throw bad("multipart 的 file 必须是路径字符串", "body");
		});
		body.parts = parts;
	}
	if (body.type === "binary" && typeof body.file !== "string") throw bad("binary 请求体需要 file 路径", "body");
	def.body = body;
	const settings = { ...DEFAULT_SETTINGS, ...(isPlainObject(def.settings) ? def.settings : {}) };
	if (!Number.isInteger(settings.timeoutMs) || settings.timeoutMs < 1 || settings.timeoutMs > 600000) {
		throw bad("timeoutMs 必须是 1-600000 的整数", "settings");
	}
	if (settings.proxy !== null && !(typeof settings.proxy === "string" && /^http:\/\/[^/]+\/?$/.test(settings.proxy))) {
		throw bad("proxy 必须是 null 或 http://[user:pass@]host:port", "settings");
	}
	settings.followRedirects = settings.followRedirects !== false;
	settings.insecureTLS = settings.insecureTLS === true;
	settings.skipCookieJar = settings.skipCookieJar === true;
	def.settings = settings;
	if (def.route !== null && def.route !== undefined && typeof def.route !== "string") throw bad("route 必须是字符串或 null", "route");
	def.route = def.route ?? null;
	return def;
};

export const defaultDefinition = () =>
	normalizeDefinition({
		method: "GET",
		url: "",
		params: { path: {}, query: [] },
		headers: [],
		auth: { type: "none" },
		body: { type: "none" },
		settings: { ...DEFAULT_SETTINGS },
		route: null,
	});

/** 读取 JSON 文件; 不存在为 null, 无法解析时 ok 为 false */
export const readJson = (file: string): { ok: boolean; value: unknown; text: string | null } => {
	let text: string;
	try {
		text = fs.readFileSync(file, "utf8");
	} catch {
		return { ok: true, value: null, text: null };
	}
	try {
		return { ok: true, value: JSON.parse(text), text };
	} catch {
		return { ok: false, value: null, text };
	}
};

export const etagOfText = (text: string | null) => (text === null ? "" : sha1(text));

export const createDebugStore = (folder: string) => {
	const root = path.join(folder, DEBUG_DIR);
	const requestsDir = path.join(root, "requests");

	const dirOf = (segments: string[]) => {
		const dir = path.join(requestsDir, ...segments);
		if (dir !== requestsDir && !dir.startsWith(requestsDir + path.sep)) {
			throw new MockError("FORBIDDEN", 403, "调试路径越界");
		}
		return dir;
	};
	const isDir = (p: string) => {
		try {
			return fs.statSync(p).isDirectory();
		} catch {
			return false;
		}
	};
	const isRequestDir = (dir: string) => {
		try {
			return fs.statSync(path.join(dir, REQ_FILE)).isFile();
		} catch {
			return false;
		}
	};

	/** 读 __meta__.json; 无法解析时 invalid 为真, 内容按空处理 */
	const readMeta = (dir: string) => {
		const file = path.join(dir, META_FILE);
		const { ok, value, text } = readJson(file);
		const raw = ok && isPlainObject(value) ? value : {};
		const meta: NodeMeta = { version: 1 };
		if (typeof raw.name === "string" && raw.name.trim()) meta.name = raw.name;
		meta.weight = weightOf(raw.weight);
		meta.vars = normalizeVars(raw.vars, false);
		return { file, meta, raw, invalid: !ok || (value !== null && !isPlainObject(value)), etag: etagOfText(text) };
	};

	const writeMeta = (dir: string, patch: { title?: string | null; weight?: unknown; vars?: unknown }, ifMatch?: string | null) => {
		const current = readMeta(dir);
		if (current.invalid) {
			throw new MockError("META_FILE_INVALID", 409, `${current.file} 不是合法的 JSON 对象, 为免覆盖已拒绝写入; 请先修复或删除该文件`, { file: current.file });
		}
		if (ifMatch && ifMatch !== current.etag) {
			throw new MockError("CONFLICT", 409, "元数据已被其他人修改");
		}
		const next: Record<string, unknown> = { ...current.raw, version: 1 };
		if (patch.title !== undefined) {
			if (patch.title === null || patch.title === "") delete next.name;
			else if (typeof patch.title !== "string") throw bad("title 必须是字符串", "title");
			else next.name = patch.title;
		}
		if (patch.weight !== undefined) {
			if (patch.weight !== null && !Number.isSafeInteger(patch.weight)) throw bad("weight 必须是整数", "weight");
			if (patch.weight === null || patch.weight === 0) delete next.weight;
			else next.weight = patch.weight;
		}
		if (patch.vars !== undefined) {
			const vars = normalizeVars(patch.vars, true);
			if (Object.keys(vars).length) next.vars = vars;
			else delete next.vars;
		}
		writeJsonAtomic(current.file, next);
	};

	/** 同一父目录内按查重键找已存在的子目录名 */
	const siblingOf = (parentDir: string, name: string) => {
		const key = nameKey(name);
		try {
			return fs.readdirSync(parentDir).find(n => isDir(path.join(parentDir, n)) && nameKey(n) === key) || null;
		} catch {
			return null;
		}
	};

	const snapshotsOf = (dir: string) => {
		const resDir = path.join(dir, SNAPSHOTS_DIR);
		let names: string[] = [];
		try {
			names = fs.readdirSync(resDir);
		} catch {
			return [];
		}
		return names
			.filter(n => isDebugName(n) && isDir(path.join(resDir, n)))
			.map(n => {
				const { meta } = readMeta(path.join(resDir, n));
				return { name: n, title: meta.name || n, weight: meta.weight || 0 };
			})
			.sort(byWeight);
	};

	const nodeOf = (segments: string[], problems: Problem[]): TreeNode => {
		const dir = dirOf(segments);
		const id = segments.join("/");
		const name = segments[segments.length - 1];
		const { meta, invalid, file } = readMeta(dir);
		if (invalid) problems.push({ type: "meta-invalid", message: `元数据文件无法解析: ${id}`, file });
		const base = { id, name, title: meta.name || name, weight: meta.weight || 0, vars: meta.vars || {} };
		if (isRequestDir(dir)) {
			const { ok, value } = readJson(path.join(dir, REQ_FILE));
			const def = ok && isPlainObject(value) ? value : {};
			if (!ok) problems.push({ type: "request-invalid", message: `请求定义无法解析: ${id}`, file: path.join(dir, REQ_FILE) });
			fs.readdirSync(dir)
				.filter(n => n !== SNAPSHOTS_DIR && isDir(path.join(dir, n)))
				.forEach(n => problems.push({ type: "unexpected-dir", message: `请求目录中只能有 res/, 已忽略: ${id}/${n}`, file: path.join(dir, n) }));
			return {
				...base,
				kind: "request",
				method: typeof def.method === "string" ? def.method : "GET",
				url: typeof def.url === "string" ? def.url : "",
				snapshots: snapshotsOf(dir),
			};
		}
		return { ...base, kind: "group", children: childrenOf(segments, problems) };
	};

	const childrenOf = (segments: string[], problems: Problem[]): TreeNode[] => {
		const dir = dirOf(segments);
		let names: string[] = [];
		try {
			names = fs.readdirSync(dir);
		} catch {
			return [];
		}
		const seen = new Set<string>();
		const out: TreeNode[] = [];
		names.sort().forEach(n => {
			const full = path.join(dir, n);
			if (!isDir(full) || n.startsWith("_") || n.startsWith(".")) return;
			if (!isDebugName(n) || nameKey(n) === SNAPSHOTS_DIR) {
				problems.push({ type: "invalid-name", message: `名字不合规, 已忽略: ${[...segments, n].join("/")}`, file: full });
				return;
			}
			if (seen.has(nameKey(n))) {
				problems.push({ type: "duplicate-name", message: `同一目录下有仅大小写不同的名字, 已忽略: ${[...segments, n].join("/")}`, file: full });
				return;
			}
			seen.add(nameKey(n));
			out.push(nodeOf([...segments, n.normalize("NFC")], problems));
		});
		return out.sort(byWeight);
	};

	const tree = () => {
		const problems: Problem[] = [];
		const nodes = childrenOf([], problems);
		return { nodes, problems };
	};

	/** 已存在的节点目录; kind 指定时校验类型 */
	const nodeDir = (id: string, kind?: "group" | "request") => {
		const segments = splitNodeId(id);
		const dir = dirOf(segments);
		if (!isDir(dir)) throw new MockError("NOT_FOUND", 404, `节点不存在: ${id}`);
		const actual = isRequestDir(dir) ? "request" : "group";
		if (kind && actual !== kind) {
			throw new MockError("BAD_REQUEST", 400, `${id} 不是${kind === "group" ? "分组" : "请求"}`);
		}
		return { segments, dir, kind: actual as "group" | "request" };
	};

	const parentSegments = (parent: unknown) => {
		if (parent === null || parent === undefined || parent === "") return [];
		const { segments } = nodeDir(String(parent), "group");
		return segments;
	};

	const nodeSummary = (segments: string[]) => nodeOf(segments, []);

	const createNode = (input: { parent?: unknown; kind?: unknown; name?: unknown; title?: unknown; weight?: unknown }) => {
		const kind = input.kind === "request" ? "request" : input.kind === "group" ? "group" : null;
		if (!kind) throw bad("kind 只能是 group 或 request", "kind");
		const name = assertDebugName(input.name, kind === "group" ? "分组名" : "请求名", true);
		const parent = parentSegments(input.parent);
		const parentDir = dirOf(parent);
		const clash = siblingOf(parentDir, name);
		if (clash) throw new MockError("CONFLICT", 409, `同一分组下已有同名节点: ${clash}`);
		const dir = dirOf([...parent, name]);
		fs.mkdirSync(dir, { recursive: true });
		if (input.title !== undefined || input.weight !== undefined) {
			writeMeta(dir, { title: input.title as string | undefined, weight: input.weight });
		}
		if (kind === "request") writeJsonAtomic(path.join(dir, REQ_FILE), defaultDefinition());
		return nodeSummary([...parent, name]);
	};

	/** 改名, 移动与元数据更新; 返回新的节点与旧新标识 */
	const updateNode = (
		id: string,
		patch: { name?: unknown; parent?: unknown; title?: unknown; weight?: unknown; vars?: unknown },
		ifMatch?: string | null
	) => {
		const { segments, dir } = nodeDir(id);
		let target = segments;
		const moving = patch.parent !== undefined;
		const renaming = patch.name !== undefined && patch.name !== segments[segments.length - 1];
		if (moving || renaming) {
			const name = renaming ? assertDebugName(patch.name, "名字", true) : segments[segments.length - 1];
			const parent = moving ? parentSegments(patch.parent) : segments.slice(0, -1);
			if (parent.join("/") === id || parent.join("/").startsWith(`${id}/`)) {
				throw bad("不能移动到自身或其子分组下", "parent");
			}
			const parentDir = dirOf(parent);
			const clash = siblingOf(parentDir, name);
			const sameNode = parent.join("/") === segments.slice(0, -1).join("/") && clash && nameKey(clash) === nameKey(segments[segments.length - 1]);
			if (clash && !sameNode) throw new MockError("CONFLICT", 409, `目标分组下已有同名节点: ${clash}`);
			target = [...parent, name];
			const to = dirOf(target);
			if (to !== dir) {
				try {
					fs.renameSync(dir, to);
				} catch (err) {
					throw new MockError("IO_ERROR", 500, "移动节点失败", undefined, { cause: err });
				}
			}
		}
		if (patch.title !== undefined || patch.weight !== undefined || patch.vars !== undefined) {
			writeMeta(dirOf(target), { title: patch.title as string | null | undefined, weight: patch.weight, vars: patch.vars }, ifMatch);
		}
		return { node: nodeSummary(target), from: id, to: target.join("/") };
	};

	const deleteNode = (id: string, recursive: boolean) => {
		const { dir, kind } = nodeDir(id);
		if (kind === "group" && !recursive) {
			const hasChildren = fs.readdirSync(dir).some(n => isDir(path.join(dir, n)));
			if (hasChildren) throw new MockError("NOT_EMPTY", 409, "分组不为空, 确认后再删除", { id });
		}
		fs.rmSync(dir, { recursive: true, force: true });
	};

	const getRequest = (id: string) => {
		const { dir } = nodeDir(id, "request");
		const { ok, value, text } = readJson(path.join(dir, REQ_FILE));
		if (!ok || !isPlainObject(value)) {
			throw new MockError("META_FILE_INVALID", 409, `${path.join(dir, REQ_FILE)} 不是合法的 JSON 对象`, { file: path.join(dir, REQ_FILE) });
		}
		let definition: Record<string, any>;
		try {
			definition = normalizeDefinition(value);
		} catch {
			definition = { ...defaultDefinition(), ...value };
		}
		const { meta, etag: metaEtag } = readMeta(dir);
		return { id, definition, meta, metaEtag, etag: etagOfText(text) };
	};

	const putRequest = (id: string, raw: unknown, ifMatch?: string | null) => {
		const { dir } = nodeDir(id, "request");
		const file = path.join(dir, REQ_FILE);
		const current = readJson(file);
		if (ifMatch && ifMatch !== etagOfText(current.text)) {
			throw new MockError("CONFLICT", 409, "请求定义已被其他人修改", { current: getRequest(id) });
		}
		writeJsonAtomic(file, normalizeDefinition(raw));
		return getRequest(id);
	};

	/** 由外到内的分组变量层: requests/__meta__.json, 各级分组, 请求本身 */
	const varLayers = (id: string | null) => {
		const layers: Array<{ from: string; vars: Record<string, string> }> = [];
		layers.push({ from: "group:", vars: readMeta(requestsDir).meta.vars || {} });
		if (!id) return layers;
		const segments = splitNodeId(id);
		for (let i = 1; i < segments.length; i++) {
			const groupId = segments.slice(0, i).join("/");
			layers.push({ from: `group:${groupId}`, vars: readMeta(dirOf(segments.slice(0, i))).meta.vars || {} });
		}
		layers.push({ from: "request", vars: readMeta(dirOf(segments)).meta.vars || {} });
		return layers;
	};

	return {
		root,
		requestsDir,
		dirOf,
		isRequestDir,
		readMeta,
		writeMeta,
		tree,
		nodeDir,
		createNode,
		updateNode,
		deleteNode,
		getRequest,
		putRequest,
		varLayers,
		siblingOf,
	};
};

export type DebugStore = ReturnType<typeof createDebugStore>;
