// 调试环境组与敏感值来源: __debug__/environments/<组>.json 与 secret/<组>.json
import fs from "fs";
import path from "path";
import { MockError, isPlainObject, writeJsonAtomic } from "../util";
import { SRC_ID_RE, assertDebugName, isDebugName, nameKey } from "./names";
import { byWeight, etagOfText, normalizeVars, readJson, weightOf } from "./store";

export type EnvGroup = { name: string; title: string; weight: number; vars: Record<string, string>; etag: string };
export type SecretSource = { from: "value"; value: string } | { from: "env"; name: string };

export const SECRET_RE = /^<secret:([A-Za-z0-9_]{1,64})>$/;

export const createEnvStore = (debugRoot: string) => {
	const dir = path.join(debugRoot, "environments");
	const secretDir = path.join(dir, "secret");
	const cookiesDir = path.join(secretDir, "cookies");
	const fileOf = (name: string) => path.join(dir, `${name}.json`);
	const secretFileOf = (name: string) => path.join(secretDir, `${name}.json`);
	const cookiesFileOf = (name: string) => path.join(cookiesDir, `${name}.json`);

	const existingName = (name: string) => {
		const key = nameKey(name);
		try {
			return (
				fs
					.readdirSync(dir)
					.filter(n => n.endsWith(".json"))
					.map(n => n.slice(0, -5))
					.find(n => nameKey(n) === key) || null
			);
		} catch {
			return null;
		}
	};

	const read = (name: string): EnvGroup | null => {
		const { ok, value, text } = readJson(fileOf(name));
		if (text === null) return null;
		if (!ok || !isPlainObject(value)) {
			throw new MockError("META_FILE_INVALID", 409, `${fileOf(name)} 不是合法的 JSON 对象, 为免覆盖已拒绝写入; 请先修复或删除该文件`, { file: fileOf(name) });
		}
		return {
			name,
			title: typeof value.name === "string" && value.name.trim() ? value.name : name,
			weight: weightOf(value.weight),
			vars: normalizeVars(value.vars, false),
			etag: etagOfText(text),
		};
	};

	const list = () => {
		const problems: Array<{ type: string; message: string; file?: string }> = [];
		let names: string[] = [];
		try {
			names = fs.readdirSync(dir).filter(n => n.endsWith(".json")).map(n => n.slice(0, -5));
		} catch {
			return { groups: [] as EnvGroup[], problems };
		}
		const groups: EnvGroup[] = [];
		names.sort().forEach(n => {
			if (!isDebugName(n)) {
				problems.push({ type: "invalid-name", message: `环境组名不合规, 已忽略: ${n}`, file: fileOf(n) });
				return;
			}
			try {
				const g = read(n);
				if (g) groups.push(g);
			} catch (err) {
				problems.push({ type: "env-invalid", message: (err as Error).message, file: fileOf(n) });
			}
		});
		return { groups: groups.sort(byWeight), problems };
	};

	const get = (name: string) => {
		const g = read(assertDebugName(name, "环境组名"));
		if (!g) throw new MockError("NOT_FOUND", 404, `环境组不存在: ${name}`);
		return g;
	};

	const put = (rawName: unknown, patch: { title?: unknown; weight?: unknown; vars?: unknown }, ifMatch?: string | null) => {
		const name = assertDebugName(rawName, "环境组名");
		const clash = existingName(name);
		if (clash && clash !== name) throw new MockError("CONFLICT", 409, `已有仅大小写不同的环境组: ${clash}`);
		const file = fileOf(name);
		const current = readJson(file);
		if (!current.ok || (current.text !== null && !isPlainObject(current.value))) {
			throw new MockError("META_FILE_INVALID", 409, `${file} 不是合法的 JSON 对象, 为免覆盖已拒绝写入; 请先修复或删除该文件`, { file });
		}
		if (ifMatch && ifMatch !== etagOfText(current.text)) {
			throw new MockError("CONFLICT", 409, "环境组已被其他人修改");
		}
		const next: Record<string, unknown> = { ...(isPlainObject(current.value) ? current.value : {}), version: 1 };
		if (patch.title !== undefined) {
			if (patch.title === null || patch.title === "") delete next.name;
			else if (typeof patch.title !== "string") throw new MockError("BAD_REQUEST", 400, "title 必须是字符串", { field: "title" });
			else next.name = patch.title;
		}
		if (patch.weight !== undefined) {
			if (patch.weight !== null && !Number.isSafeInteger(patch.weight)) throw new MockError("BAD_REQUEST", 400, "weight 必须是整数", { field: "weight" });
			next.weight = patch.weight ?? 0;
		}
		if (patch.vars !== undefined) next.vars = normalizeVars(patch.vars, true);
		writeJsonAtomic(file, next);
		return get(name);
	};

	const moveIfExists = (from: string, to: string) => {
		if (fs.existsSync(from)) {
			fs.mkdirSync(path.dirname(to), { recursive: true });
			fs.renameSync(from, to);
		}
	};

	const rename = (rawName: unknown, rawTo: unknown) => {
		const name = get(String(rawName)).name;
		const to = assertDebugName(rawTo, "环境组名");
		const clash = existingName(to);
		if (clash && nameKey(clash) !== nameKey(name)) throw new MockError("CONFLICT", 409, `环境组已存在: ${clash}`);
		moveIfExists(fileOf(name), fileOf(to));
		moveIfExists(secretFileOf(name), secretFileOf(to));
		moveIfExists(cookiesFileOf(name), cookiesFileOf(to));
		return get(to);
	};

	const remove = (rawName: unknown) => {
		const name = get(String(rawName)).name;
		[fileOf(name), secretFileOf(name), cookiesFileOf(name)].forEach(f => fs.rmSync(f, { force: true }));
		return name;
	};

	const readSources = (name: string): Record<string, SecretSource> => {
		const { value } = readJson(secretFileOf(name));
		const sources = isPlainObject(value) && isPlainObject(value.sources) ? value.sources : {};
		const out: Record<string, SecretSource> = {};
		Object.entries(sources).forEach(([id, s]) => {
			if (!SRC_ID_RE.test(id) || !isPlainObject(s)) return;
			if (s.from === "value" && typeof s.value === "string") out[id] = { from: "value", value: s.value };
			if (s.from === "env" && typeof s.name === "string") out[id] = { from: "env", name: s.name };
		});
		return out;
	};

	/** 已配置的来源与环境组变量中引用到但未配置的来源; 不返回值 */
	const listSecrets = (rawName: unknown) => {
		const group = get(String(rawName));
		const sources = readSources(group.name);
		const ids = new Set(Object.keys(sources));
		Object.values(group.vars).forEach(v => {
			const m = SECRET_RE.exec(v);
			if (m) ids.add(m[1]);
		});
		return [...ids].sort().map(id => {
			const s = sources[id];
			return {
				id,
				from: s ? s.from : null,
				configured: !!s,
				...(s && s.from === "env" ? { envName: s.name } : {}),
			};
		});
	};

	const putSecret = (rawName: unknown, id: string, raw: unknown) => {
		const group = get(String(rawName));
		if (!SRC_ID_RE.test(id)) throw new MockError("INVALID_NAME", 400, "来源 id 只能包含字母, 数字与下划线, 长度 1-64", { id });
		let source: SecretSource;
		if (isPlainObject(raw) && raw.from === "value" && typeof raw.value === "string") {
			source = { from: "value", value: raw.value };
		} else if (isPlainObject(raw) && raw.from === "env" && typeof raw.name === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(raw.name)) {
			source = { from: "env", name: raw.name };
		} else {
			throw new MockError("BAD_REQUEST", 400, "来源必须是 { from: \"value\", value } 或 { from: \"env\", name }", { field: "source" });
		}
		const sources = readSources(group.name);
		sources[id] = source;
		writeJsonAtomic(secretFileOf(group.name), { version: 1, sources });
		return listSecrets(group.name).find(s => s.id === id);
	};

	const deleteSecret = (rawName: unknown, id: string) => {
		const group = get(String(rawName));
		const sources = readSources(group.name);
		if (!(id in sources)) throw new MockError("NOT_FOUND", 404, `来源不存在: ${id}`);
		delete sources[id];
		writeJsonAtomic(secretFileOf(group.name), { version: 1, sources });
	};

	/** 解析敏感值; 来源不存在或环境变量未设置时抛 SECRET_UNAVAILABLE */
	const resolveSecret = (group: string, id: string) => {
		const source = readSources(group)[id];
		const fail = (why: string) =>
			new MockError("SECRET_UNAVAILABLE", 400, `敏感值来源 ${id} 不可用: ${why}`, { srcId: id, env: group });
		if (!source) throw fail("未配置");
		if (source.from === "value") return source.value;
		const value = process.env[source.name];
		if (value === undefined) throw fail(`环境变量 ${source.name} 未设置`);
		return value;
	};

	return { dir, secretDir, cookiesFileOf, list, get, put, rename, remove, listSecrets, putSecret, deleteSecret, resolveSecret };
};

export type EnvStore = ReturnType<typeof createEnvStore>;
