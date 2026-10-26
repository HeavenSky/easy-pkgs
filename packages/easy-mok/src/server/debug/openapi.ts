// OpenAPI 3.0 / 3.1 的导入导出: 按 paths 生成分组与请求, 响应示例可生成快照; 导出时命名快照写成响应 examples
import crypto from "crypto";
import fs from "fs";
import path from "path";
import YAML from "yaml";
import { MockError, isPlainObject, localIso, writeJsonAtomic } from "../util";
import { extOfType } from "../mime";
import type { EnvStore } from "./env";
import { DEBUG_NAME_RE, META_FILE, SNAPSHOTS_DIR, nameKey } from "./names";
import type { DebugStore, TreeNode } from "./store";
import { defaultDefinition, readJson } from "./store";

const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

/** 把任意文本清洗成合规的名字; 清洗后为空时用 fallback */
export const sanitizeName = (raw: string, fallback: string) => {
	let s = String(raw || "")
		.normalize("NFC")
		.replace(/[^A-Za-z0-9._\-\p{Script=Han}]+/gu, "-")
		.replace(/-{2,}/g, "-")
		.replace(/^[._-]+|[._-]+$/g, "")
		.slice(0, 64)
		.replace(/[._-]+$/g, "");
	if (!s || !DEBUG_NAME_RE.test(s)) s = fallback;
	return s;
};

/** 在目录下取一个不冲突的名字: name, name-2, name-3 ... */
const uniqueName = (dir: string, name: string) => {
	const taken = new Set<string>();
	try {
		fs.readdirSync(dir).forEach(n => taken.add(nameKey(n)));
	} catch {
		/* 目录还不存在 */
	}
	if (!taken.has(nameKey(name))) return name;
	for (let i = 2; ; i++) {
		const candidate = `${name.slice(0, 60)}-${i}`;
		if (!taken.has(nameKey(candidate))) return candidate;
	}
};

/** 解析本文档内的 $ref(#/...), 有环时停止 */
const resolverOf = (doc: Record<string, any>) => {
	const resolve = (node: any, seen = new Set<string>()): any => {
		if (!isPlainObject(node) || typeof node.$ref !== "string") return node;
		const ref = node.$ref as string;
		if (!ref.startsWith("#/") || seen.has(ref)) return {};
		seen.add(ref);
		let cur: any = doc;
		for (const seg of ref.slice(2).split("/")) {
			cur = cur && cur[seg.replace(/~1/g, "/").replace(/~0/g, "~")];
		}
		return resolve(cur, seen);
	};
	return resolve;
};

const exampleOf = (p: Record<string, any>, resolve: (n: any) => any) => {
	if (p.example !== undefined) return p.example;
	if (isPlainObject(p.examples)) {
		const first = Object.values(p.examples)[0];
		const ex = resolve(first);
		if (isPlainObject(ex) && ex.value !== undefined) return ex.value;
	}
	const schema = resolve(p.schema);
	if (isPlainObject(schema)) {
		if (schema.example !== undefined) return schema.example;
		if (schema.default !== undefined) return schema.default;
	}
	return undefined;
};

const asText = (v: unknown) =>
	v === undefined || v === null ? "" : typeof v === "string" ? v : JSON.stringify(v);

export const importOpenApi = (
	deps: { store: DebugStore; envs: EnvStore },
	input: { text?: unknown; parent?: unknown; env?: unknown; snapshots?: unknown }
) => {
	if (typeof input.text !== "string" || !input.text.trim())
		throw new MockError("BAD_REQUEST", 400, "请粘贴或选择 OpenAPI 文档", { field: "text" });
	let doc: Record<string, any>;
	try {
		doc = YAML.parse(input.text);
	} catch (err) {
		throw new MockError("BAD_REQUEST", 400, `文档无法解析: ${(err as Error).message}`, {
			field: "text",
		});
	}
	if (!isPlainObject(doc) || typeof doc.openapi !== "string" || !/^3\.[01]\./.test(doc.openapi)) {
		throw new MockError(
			"BAD_REQUEST",
			400,
			"只支持 OpenAPI 3.0.x 与 3.1.x(Swagger 2.0 请先转换)",
			{ field: "text" }
		);
	}
	const resolve = resolverOf(doc);
	const warnings: string[] = [];
	const { store, envs } = deps;
	const parent =
		input.parent === null || input.parent === undefined || input.parent === ""
			? null
			: String(input.parent);
	const parentSegs = parent ? store.nodeDir(parent, "group").segments : [];
	const groupIds = new Map<string, string | null>();
	const groupFor = (tag: string | undefined) => {
		if (!tag) return parent;
		if (groupIds.has(tag)) return groupIds.get(tag) as string;
		const dir = store.dirOf(parentSegs);
		const name = sanitizeName(tag, "tag");
		const existing = store.siblingOf(dir, name);
		const id = [...parentSegs, existing || name].join("/");
		if (!existing)
			store.createNode({
				parent,
				kind: "group",
				name,
				title: name === tag ? undefined : tag,
			});
		else if (store.isRequestDir(store.dirOf([...parentSegs, existing]))) {
			warnings.push(`tag ${tag} 与已有请求同名, 该 tag 下的操作放在导入目标分组的根下`);
			groupIds.set(tag, parent);
			return parent;
		}
		groupIds.set(tag, id);
		return id;
	};
	let created = 0;
	const snapshotsOn = input.snapshots === true;
	Object.entries(isPlainObject(doc.paths) ? doc.paths : {}).forEach(([rawPath, item]) => {
		const pathItem = resolve(item);
		if (!isPlainObject(pathItem)) return;
		const shared = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
		METHODS.forEach(m => {
			const op = resolve(pathItem[m]);
			if (!isPlainObject(op)) return;
			const groupId = groupFor(
				Array.isArray(op.tags) && typeof op.tags[0] === "string" ? op.tags[0] : undefined
			);
			const groupSegs = groupId ? groupId.split("/") : [];
			const name = uniqueName(
				store.dirOf(groupSegs),
				sanitizeName(String(op.operationId || `${m}-${rawPath}`), `${m}-op`)
			);
			const def = defaultDefinition();
			def.method = m.toUpperCase();
			const paramName = (n: string) =>
				n.replace(/[^A-Za-z0-9_]/g, "_").replace(/^(\d)/, "_$1");
			def.url = `{{baseUrl}}${rawPath.replace(/\{([^}]+)\}/g, (_: string, n: string) => `:${paramName(n)}`)}`;
			const params = [...shared, ...(Array.isArray(op.parameters) ? op.parameters : [])]
				.map(p => resolve(p))
				.filter(isPlainObject);
			params.forEach(p => {
				const value = asText(exampleOf(p, resolve));
				if (p.in === "path") def.params.path[paramName(String(p.name))] = value;
				if (p.in === "query")
					def.params.query.push([
						String(p.name),
						value,
						p.required === true || value !== "",
					]);
				if (
					p.in === "header" &&
					!/^(authorization|content-type|accept)$/i.test(String(p.name))
				)
					def.headers.push([String(p.name).toLowerCase(), value, true]);
			});
			const body = resolve(op.requestBody);
			if (isPlainObject(body) && isPlainObject(body.content)) {
				const json = Object.entries(body.content).find(([ct]) => /json/i.test(ct));
				if (json) {
					const ex = exampleOf(resolve(json[1]) || {}, resolve);
					def.body = { type: "json", content: ex === undefined ? {} : ex };
				} else warnings.push(`${m.toUpperCase()} ${rawPath}: 只导入 JSON 请求体示例`);
			}
			const node = store.createNode({
				parent: groupId,
				kind: "request",
				name,
				title:
					op.summary && op.summary !== name
						? String(op.summary).slice(0, 200)
						: undefined,
			});
			store.putRequest(node.id, def);
			created++;
			if (snapshotsOn) importExamples(store, node.id, def, op, resolve, warnings);
		});
	});
	if (typeof input.env === "string" && input.env) {
		const server =
			Array.isArray(doc.servers) && isPlainObject(doc.servers[0])
				? String(doc.servers[0].url || "")
				: "";
		if (server) {
			let current: Record<string, string> = {};
			try {
				current = envs.get(input.env).vars;
			} catch {
				current = {};
			}
			envs.put(input.env, { vars: { ...current, baseUrl: server.replace(/\/$/, "") } });
		} else warnings.push("文档没有 servers, 未设置 baseUrl");
	}
	return { created, warnings };
};

/** 响应示例写成快照(origin.kind = import) */
const importExamples = (
	store: DebugStore,
	requestId: string,
	def: Record<string, any>,
	op: Record<string, any>,
	resolve: (n: any) => any,
	warnings: string[]
) => {
	const resDir = path.join(store.nodeDir(requestId, "request").dir, SNAPSHOTS_DIR);
	Object.entries(isPlainObject(op.responses) ? op.responses : {}).forEach(([code, raw]) => {
		const status = Number(code);
		const response = resolve(raw);
		if (
			!Number.isInteger(status) ||
			!isPlainObject(response) ||
			!isPlainObject(response.content)
		)
			return;
		Object.entries(response.content).forEach(([ct, media]) => {
			const m = resolve(media);
			if (!isPlainObject(m)) return;
			const examples: Array<[string, unknown]> = [];
			if (m.example !== undefined) examples.push([String(status), m.example]);
			if (isPlainObject(m.examples)) {
				Object.entries(m.examples).forEach(([exName, ex]) => {
					const e = resolve(ex);
					// 本工具导出的示例名就是快照名(已带状态码前缀), 再导入时不重复加前缀
					const named =
						exName === String(status) || exName.startsWith(`${status}-`)
							? exName
							: `${status}-${exName}`;
					if (isPlainObject(e) && e.value !== undefined) examples.push([named, e.value]);
				});
			}
			examples.forEach(([rawName, value]) => {
				const name = uniqueName(resDir, sanitizeName(rawName, String(status)));
				const dir = path.join(resDir, name);
				const ext = extOfType(ct);
				const text =
					typeof value === "string" && ext !== "json"
						? value
						: JSON.stringify(value, null, 2);
				fs.mkdirSync(dir, { recursive: true });
				fs.writeFileSync(path.join(dir, `raw.${ext}`), text);
				writeJsonAtomic(path.join(dir, META_FILE), {
					version: 1,
					weight: 0,
					vars: {},
					replay: { setCookie: false },
					origin: { kind: "import" },
					capturedAt: localIso(new Date()),
					reqHash: null,
					timing: { durationMs: 0, ttfbMs: null },
					request: {
						method: def.method,
						url: def.url,
						headers: [],
						body: { type: "none" },
					},
					template: { env: null, request: def, values: {} },
					response: {
						status,
						statusText: "",
						httpVersion: "1.1",
						headers: [["content-type", ct]],
						body: {
							file: `raw.${ext}`,
							contentType: ct,
							charset: null,
							size: Buffer.byteLength(text),
							sha256: crypto.createHash("sha256").update(text).digest("hex"),
							originalEncoding: null,
							decoded: true,
							truncated: false,
						},
						redirects: [],
					},
					error: null,
					note: "",
				});
			});
			if (!examples.length && m.schema)
				warnings.push(`${def.method} ${def.url} 的 ${status} 响应没有 example, 未生成快照`);
		});
	});
};

/** 收集节点下全部请求(含自身) */
const requestsUnder = (nodes: TreeNode[], out: TreeNode[] = []) => {
	nodes.forEach(n => (n.kind === "request" ? out.push(n) : requestsUnder(n.children || [], out)));
	return out;
};
const findNode = (nodes: TreeNode[], id: string): TreeNode | null => {
	for (const n of nodes) {
		if (n.id === id) return n;
		const hit = findNode(n.children || [], id);
		if (hit) return hit;
	}
	return null;
};

export const exportOpenApi = (store: DebugStore, input: { node?: unknown; format?: unknown }) => {
	const { nodes } = store.tree();
	const nodeId = typeof input.node === "string" && input.node ? input.node : null;
	const root = nodeId ? findNode(nodes, nodeId) : null;
	if (nodeId && !root) throw new MockError("NOT_FOUND", 404, `节点不存在: ${nodeId}`);
	const list = root ? requestsUnder([root]) : requestsUnder(nodes);
	const warnings: string[] = [];
	const paths: Record<string, Record<string, any>> = {};
	const tagOf = (id: string) => {
		const top = id.split("/")[0];
		const n = findNode(nodes, top);
		return n && n.kind === "group" ? n.title : null;
	};
	list.forEach(node => {
		const { definition: def, meta } = store.getRequest(node.id);
		let p = String(def.url || "")
			.replace(/^\{\{\s*baseUrl\s*\}\}/, "")
			.replace(/^https?:\/\/[^/]+/i, "");
		p = p.split("?")[0] || "/";
		p = p.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, "{$1}");
		const method = String(def.method || "GET").toLowerCase();
		paths[p] ||= {};
		if (paths[p][method]) {
			warnings.push(`${method.toUpperCase()} ${p} 重复, 已跳过 ${node.id}`);
			return;
		}
		const parameters: Array<Record<string, any>> = [];
		Object.entries(def.params?.path || {}).forEach(([name, v]) =>
			parameters.push({
				name,
				in: "path",
				required: true,
				schema: { type: "string" },
				...(v ? { example: v } : {}),
			})
		);
		(def.params?.query || []).forEach((r: [string, string, boolean]) =>
			parameters.push({
				name: r[0],
				in: "query",
				required: false,
				schema: { type: "string" },
				...(r[1] ? { example: r[1] } : {}),
			})
		);
		(def.headers || [])
			.filter(
				(r: [string, string, boolean]) =>
					!/^(authorization|content-type|cookie)$/i.test(r[0])
			)
			.forEach((r: [string, string]) =>
				parameters.push({
					name: r[0],
					in: "header",
					required: false,
					schema: { type: "string" },
					...(r[1] ? { example: r[1] } : {}),
				})
			);
		const op: Record<string, any> = { operationId: node.name };
		if (meta.name) op.summary = meta.name;
		const tag = tagOf(node.id);
		if (tag) op.tags = [tag];
		if (parameters.length) op.parameters = parameters;
		if (def.body?.type === "json")
			op.requestBody = { content: { "application/json": { example: def.body.content } } };
		const responses: Record<string, any> = {};
		(node.snapshots || []).forEach(s => {
			const dir = path.join(store.nodeDir(node.id, "request").dir, SNAPSHOTS_DIR, s.name);
			const { value } = readJson(path.join(dir, META_FILE));
			const snapMeta = isPlainObject(value) ? value : null;
			const res = snapMeta && isPlainObject(snapMeta.response) ? snapMeta.response : null;
			if (!res || snapMeta?.error) return;
			const body = (res.body || {}) as Record<string, any>;
			const ct = String(body.contentType || "application/octet-stream");
			if (!body.file) return;
			const text = fs.readFileSync(path.join(dir, body.file));
			let example: unknown;
			if (/json/.test(ct)) {
				try {
					example = JSON.parse(text.toString("utf8"));
				} catch {
					example = text.toString("utf8");
				}
			} else if (/^text\/|xml|javascript/.test(ct)) example = text.toString("utf8");
			else {
				warnings.push(`${node.id}#${s.name} 是二进制响应, 未导出`);
				return;
			}
			const r = (responses[String(res.status)] ||= {
				description: res.statusText || String(res.status),
				content: {},
			});
			const media = (r.content[ct] ||= { examples: {} });
			media.examples[s.name] = { summary: s.title, value: example };
		});
		op.responses = Object.keys(responses).length
			? responses
			: { default: { description: "没有快照" } };
		paths[p][method] = op;
	});
	const doc = {
		openapi: "3.1.0",
		info: { title: root ? root.title : "easy-mok debug requests", version: "1.0.0" },
		servers: [{ url: "{baseUrl}", variables: { baseUrl: { default: "http://localhost" } } }],
		paths,
	};
	const format = input.format === "json" ? "json" : "yaml";
	const text = format === "json" ? `${JSON.stringify(doc, null, 2)}\n` : YAML.stringify(doc);
	return {
		text,
		filename: `${root ? root.name : "requests"}.openapi.${format === "json" ? "json" : "yaml"}`,
		warnings,
	};
};
