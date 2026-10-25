// 命名快照: requests/<请求>/res/<名称>/ 下的 __meta__.json 与 raw 文件; 由历史条目复制生成
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { MockError, isPlainObject, writeJsonAtomic } from "../util";
import type { HistoryStore } from "./history";
import { META_FILE, SNAPSHOTS_DIR, assertDebugName, nameKey, splitSnapshotId } from "./names";
import type { DebugStore } from "./store";
import { normalizeVars, readJson, weightOf } from "./store";
import { MASK, maskSetCookie, redactJsonText } from "./redact";
import { extOfFile } from "../mime";

export type SnapshotSummary = { id: string; request: string; name: string; title: string; weight: number };

export type Redaction = { fields: number; setCookie: "kept" | "masked" | "none"; binaryRequest: boolean };

/** rules 返回当前的字段脱敏规则; 快照会被提交, 写入时按规则脱敏 */
export const createSnapshotStore = (deps: { store: DebugStore; history: HistoryStore; rules?: () => string[] }) => {
	const { store } = deps;

	const resDirOf = (request: string) => path.join(store.nodeDir(request, "request").dir, SNAPSHOTS_DIR);

	/** 已存在的快照目录名(不区分大小写比较) */
	const existing = (resDir: string, name: string) => {
		try {
			return fs.readdirSync(resDir).find(n => nameKey(n) === nameKey(name)) || null;
		} catch {
			return null;
		}
	};

	const locate = (sid: string) => {
		const { request, name } = splitSnapshotId(sid);
		const resDir = resDirOf(request);
		const actual = existing(resDir, name);
		if (!actual) throw new MockError("NOT_FOUND", 404, `快照不存在: ${sid}`);
		return { request, name: actual, dir: path.join(resDir, actual), id: `${request}#${actual}` };
	};

	const readMeta = (dir: string) => {
		const { ok, value } = readJson(path.join(dir, META_FILE));
		if (!ok || !isPlainObject(value)) {
			throw new MockError("META_FILE_INVALID", 409, `${path.join(dir, META_FILE)} 不是合法的 JSON 对象`, { file: path.join(dir, META_FILE) });
		}
		return value as Record<string, any>;
	};

	const summary = (request: string, name: string, meta: Record<string, any>): SnapshotSummary => ({
		id: `${request}#${name}`,
		request,
		name,
		title: typeof meta.name === "string" && meta.name ? meta.name : name,
		weight: weightOf(meta.weight),
	});

	const get = (sid: string) => {
		const loc = locate(sid);
		return { ...loc, meta: readMeta(loc.dir) };
	};

	/** 历史条目另存为快照; 重名时需 overwrite, 先写临时目录再替换, 中途失败不留半个快照 */
	const saveFromHistory = (
		hid: string,
		input: { request?: unknown; name?: unknown; title?: unknown; weight?: unknown; overwrite?: unknown; keepSetCookie?: unknown }
	) => {
		const entry = deps.history.get(hid);
		if (typeof input.request !== "string" || !input.request) {
			throw new MockError("BAD_REQUEST", 400, "请选择快照所属的请求", { field: "request" });
		}
		const request = store.nodeDir(input.request, "request").segments.join("/");
		const name = assertDebugName(input.name, "快照名");
		if (input.weight !== undefined && input.weight !== null && !Number.isSafeInteger(input.weight)) {
			throw new MockError("BAD_REQUEST", 400, "weight 必须是整数", { field: "weight" });
		}
		const resDir = resDirOf(request);
		fs.mkdirSync(resDir, { recursive: true });
		const clash = existing(resDir, name);
		if (clash && input.overwrite !== true) {
			throw new MockError("CONFLICT", 409, `快照已存在: ${clash}`, { name: clash });
		}
		const tmp = path.join(resDir, `.tmp-${crypto.randomBytes(4).toString("hex")}`);
		fs.mkdirSync(tmp);
		let redaction: Redaction;
		try {
			fs.readdirSync(entry.dir).forEach(n => {
				if (n !== META_FILE) fs.copyFileSync(path.join(entry.dir, n), path.join(tmp, n));
			});
			const previous = clash ? readJson(path.join(resDir, clash, META_FILE)).value : null;
			const keep = isPlainObject(previous) ? previous : {};
			const keepCookie =
				typeof input.keepSetCookie === "boolean" ? input.keepSetCookie : isPlainObject(keep.replay) && keep.replay.setCookie === true;
			const rules = deps.rules ? deps.rules() : [];
			let fields = 0;
			let response = entry.meta.response;
			let request = entry.meta.request;
			if (response) {
				const hasCookie = (response.headers || []).some(([k]: [string, string]) => k === "set-cookie");
				response = { ...response, headers: keepCookie ? response.headers : maskSetCookie(response.headers || []) };
				const body = response.body || {};
				// 快照会被提交: JSON 响应体按字段规则脱敏, 没有命中时保留原字节
				if (body.file && body.decoded !== false && extOfFile(body.file) === "json" && rules.length) {
					const file = path.join(tmp, body.file);
					const out = redactJsonText(fs.readFileSync(file, "utf8"), rules);
					if (out.count) {
						fs.writeFileSync(file, out.text);
						fields += out.count;
						response = {
							...response,
							body: { ...body, size: Buffer.byteLength(out.text), sha256: crypto.createHash("sha256").update(out.text).digest("hex"), redacted: true },
						};
					}
				}
				redaction = { fields: 0, setCookie: hasCookie ? (keepCookie ? "kept" : "masked") : "none", binaryRequest: false };
			} else {
				redaction = { fields: 0, setCookie: "none", binaryRequest: false };
			}
			if (request && request.body && request.body.type === "text" && rules.length) {
				const out = redactJsonText(String(request.body.text), rules);
				if (out.count) {
					fields += out.count;
					request = { ...request, body: { ...request.body, text: out.text } };
				}
			}
			redaction.fields = fields;
			redaction.binaryRequest = !!(request && request.body && request.body.type === "binary");
			const meta = {
				...entry.meta,
				request,
				response,
				version: 1,
				name: typeof input.title === "string" && input.title ? input.title : keep.name,
				weight: input.weight ?? keep.weight ?? 0,
				vars: normalizeVars(keep.vars, false),
				replay: { setCookie: keepCookie },
				redaction,
				origin: { ...(entry.meta.origin || {}), kind: "debug", historyId: hid },
			};
			if (!meta.name) delete meta.name;
			writeJsonAtomic(path.join(tmp, META_FILE), meta);
			if (clash) fs.rmSync(path.join(resDir, clash), { recursive: true, force: true });
			fs.renameSync(tmp, path.join(resDir, name));
		} catch (err) {
			fs.rmSync(tmp, { recursive: true, force: true });
			throw err instanceof MockError ? err : new MockError("IO_ERROR", 500, "保存快照失败", undefined, { cause: err });
		}
		return { ...summary(request, name, readMeta(path.join(resDir, name))), redaction };
	};

	/** 改名与元数据; 返回新旧标识 */
	const update = (sid: string, patch: { name?: unknown; title?: unknown; weight?: unknown; vars?: unknown; replay?: unknown }) => {
		const loc = locate(sid);
		let dir = loc.dir;
		let name = loc.name;
		if (patch.name !== undefined && patch.name !== loc.name) {
			name = assertDebugName(patch.name, "快照名");
			const resDir = path.dirname(loc.dir);
			const clash = existing(resDir, name);
			if (clash && nameKey(clash) !== nameKey(loc.name)) throw new MockError("CONFLICT", 409, `快照已存在: ${clash}`);
			dir = path.join(resDir, name);
			fs.renameSync(loc.dir, dir);
		}
		const meta = readMeta(dir);
		if (patch.title !== undefined) {
			if (patch.title === null || patch.title === "") delete meta.name;
			else if (typeof patch.title !== "string") throw new MockError("BAD_REQUEST", 400, "title 必须是字符串", { field: "title" });
			else meta.name = patch.title;
		}
		if (patch.weight !== undefined) {
			if (!Number.isSafeInteger(patch.weight)) throw new MockError("BAD_REQUEST", 400, "weight 必须是整数", { field: "weight" });
			meta.weight = patch.weight;
		}
		if (patch.vars !== undefined) meta.vars = normalizeVars(patch.vars, true);
		if (patch.replay !== undefined) {
			if (!isPlainObject(patch.replay) || typeof patch.replay.setCookie !== "boolean") {
				throw new MockError("BAD_REQUEST", 400, "replay 必须是 { setCookie: boolean }", { field: "replay" });
			}
			const masked = (meta.response?.headers || []).some(([k, v]: [string, string]) => k === "set-cookie" && v === MASK);
			if (patch.replay.setCookie && masked) {
				throw new MockError(
					"CONFLICT",
					409,
					"这个快照的 set-cookie 已脱敏, 不能回放; 请在另存为快照时勾选「保留 set-cookie」",
					{ field: "replay" }
				);
			}
			meta.replay = { setCookie: patch.replay.setCookie };
		}
		writeJsonAtomic(path.join(dir, META_FILE), meta);
		return { snapshot: summary(loc.request, name, meta), from: loc.id, to: `${loc.request}#${name}` };
	};

	const remove = (sid: string) => {
		const loc = locate(sid);
		fs.rmSync(loc.dir, { recursive: true, force: true });
		return loc.id;
	};

	const varsOf = (sid: string) => normalizeVars(get(sid).meta.vars, false);

	return { get, locate, saveFromHistory, update, remove, varsOf, summary };
};

export type SnapshotStore = ReturnType<typeof createSnapshotStore>;
