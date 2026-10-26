// 调试环境组与敏感值来源: __debug__/environments/<组>.json 与 secret/<组>.json
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { MockError, isPlainObject, writeJsonAtomic } from "../util";
import { SRC_ID_RE, assertDebugName, isDebugName, nameKey } from "./names";
import { byWeight, etagOfText, normalizeVars, readJson, weightOf } from "./store";
import { ensureIgnoredDir } from "./redact";

export type EnvGroup = {
	name: string;
	title: string;
	weight: number;
	vars: Record<string, string>;
	etag: string;
};
export type SecretSource =
	| { from: "value"; value: string }
	| { from: "env"; name: string }
	| { from: "keychain"; service: string; account: string }
	| { from: "command"; argv: string[] }
	| { from: "prompt" };

export const SECRET_CACHE_MS = 10 * 60 * 1000;
const SOURCE_TIMEOUT_MS = 15000;

/** 校验并规范化一个来源配置; 不合法时为 null */
export const normalizeSource = (raw: unknown): SecretSource | null => {
	if (!isPlainObject(raw)) return null;
	if (raw.from === "value" && typeof raw.value === "string")
		return { from: "value", value: raw.value };
	if (
		raw.from === "env" &&
		typeof raw.name === "string" &&
		/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw.name)
	)
		return { from: "env", name: raw.name };
	if (
		raw.from === "keychain" &&
		typeof raw.service === "string" &&
		raw.service &&
		typeof raw.account === "string"
	) {
		return { from: "keychain", service: raw.service, account: raw.account };
	}
	if (
		raw.from === "command" &&
		Array.isArray(raw.argv) &&
		raw.argv.length &&
		raw.argv.every(a => typeof a === "string") &&
		raw.argv[0]
	) {
		return { from: "command", argv: raw.argv as string[] };
	}
	if (raw.from === "prompt") return { from: "prompt" };
	return null;
};

const exec = (file: string, args: string[]) =>
	new Promise<string>((resolve, reject) => {
		execFile(
			file,
			args,
			{ timeout: SOURCE_TIMEOUT_MS, maxBuffer: 1024 * 1024, windowsHide: true },
			(err, stdout, stderr) => {
				if (err) {
					const code = (err as NodeJS.ErrnoException).code;
					reject(
						new Error(
							code === "ENOENT"
								? `找不到命令 ${file}`
								: String(stderr || err.message)
										.trim()
										.split("\n")[0]
						)
					);
					return;
				}
				const value = String(stdout).replace(/\r?\n$/, "");
				if (!value) reject(new Error("输出为空"));
				else resolve(value);
			}
		);
	});

/** 运行 keychain 或 command 来源: 不经 shell, 带超时; macOS 用 security, Linux 用 secret-tool */
const runSource = (s: SecretSource) => {
	if (s.from === "command") return exec(s.argv[0], s.argv.slice(1));
	if (s.from === "keychain") {
		if (process.platform === "darwin")
			return exec("security", [
				"find-generic-password",
				"-s",
				s.service,
				"-a",
				s.account,
				"-w",
			]);
		if (process.platform === "linux")
			return exec("secret-tool", ["lookup", "service", s.service, "account", s.account]);
		return Promise.reject(new Error(`当前系统(${process.platform})不支持 keychain 来源`));
	}
	return Promise.reject(new Error("不是外部来源"));
};

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
			throw new MockError(
				"META_FILE_INVALID",
				409,
				`${fileOf(name)} 不是合法的 JSON 对象, 为免覆盖已拒绝写入; 请先修复或删除该文件`,
				{ file: fileOf(name) }
			);
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
			names = fs
				.readdirSync(dir)
				.filter(n => n.endsWith(".json"))
				.map(n => n.slice(0, -5));
		} catch {
			return { groups: [] as EnvGroup[], problems };
		}
		const groups: EnvGroup[] = [];
		names.sort().forEach(n => {
			if (!isDebugName(n)) {
				problems.push({
					type: "invalid-name",
					message: `环境组名不合规, 已忽略: ${n}`,
					file: fileOf(n),
				});
				return;
			}
			try {
				const g = read(n);
				if (g) groups.push(g);
			} catch (err) {
				problems.push({
					type: "env-invalid",
					message: (err as Error).message,
					file: fileOf(n),
				});
			}
		});
		return { groups: groups.sort(byWeight), problems };
	};

	const get = (name: string) => {
		const g = read(assertDebugName(name, "环境组名"));
		if (!g) throw new MockError("NOT_FOUND", 404, `环境组不存在: ${name}`);
		return g;
	};

	const put = (
		rawName: unknown,
		patch: { title?: unknown; weight?: unknown; vars?: unknown },
		ifMatch?: string | null
	) => {
		const name = assertDebugName(rawName, "环境组名");
		const clash = existingName(name);
		if (clash && clash !== name)
			throw new MockError("CONFLICT", 409, `已有仅大小写不同的环境组: ${clash}`);
		const file = fileOf(name);
		const current = readJson(file);
		if (!current.ok || (current.text !== null && !isPlainObject(current.value))) {
			throw new MockError(
				"META_FILE_INVALID",
				409,
				`${file} 不是合法的 JSON 对象, 为免覆盖已拒绝写入; 请先修复或删除该文件`,
				{ file }
			);
		}
		if (ifMatch && ifMatch !== etagOfText(current.text)) {
			throw new MockError("CONFLICT", 409, "环境组已被其他人修改");
		}
		const next: Record<string, unknown> = {
			...(isPlainObject(current.value) ? current.value : {}),
			version: 1,
		};
		if (patch.title !== undefined) {
			if (patch.title === null || patch.title === "") delete next.name;
			else if (typeof patch.title !== "string")
				throw new MockError("BAD_REQUEST", 400, "title 必须是字符串", { field: "title" });
			else next.name = patch.title;
		}
		if (patch.weight !== undefined) {
			if (patch.weight !== null && !Number.isSafeInteger(patch.weight))
				throw new MockError("BAD_REQUEST", 400, "weight 必须是整数", { field: "weight" });
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
		if (clash && nameKey(clash) !== nameKey(name))
			throw new MockError("CONFLICT", 409, `环境组已存在: ${clash}`);
		moveIfExists(fileOf(name), fileOf(to));
		moveIfExists(secretFileOf(name), secretFileOf(to));
		moveIfExists(cookiesFileOf(name), cookiesFileOf(to));
		return get(to);
	};

	const remove = (rawName: unknown) => {
		const name = get(String(rawName)).name;
		[fileOf(name), secretFileOf(name), cookiesFileOf(name)].forEach(f =>
			fs.rmSync(f, { force: true })
		);
		return name;
	};

	/** secret/ 下的文件一律不提交: 写入前确保目录内有自忽略的 .gitignore */
	const writeSecretFile = (file: string, data: unknown) => {
		ensureIgnoredDir(secretDir);
		writeJsonAtomic(file, data);
	};

	const readSources = (name: string): Record<string, SecretSource> => {
		const { value } = readJson(secretFileOf(name));
		const sources = isPlainObject(value) && isPlainObject(value.sources) ? value.sources : {};
		const out: Record<string, SecretSource> = {};
		Object.entries(sources).forEach(([id, s]) => {
			if (!SRC_ID_RE.test(id) || !isPlainObject(s)) return;
			const src = normalizeSource(s);
			if (src) out[id] = src;
		});
		return out;
	};

	const describe = (s: SecretSource) =>
		s.from === "env"
			? { envName: s.name }
			: s.from === "keychain"
				? { service: s.service, account: s.account }
				: s.from === "command"
					? { argv: s.argv }
					: {};

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
				...(s ? describe(s) : {}),
				...(s && s.from === "prompt"
					? { entered: prompted.has(`${group.name}#${id}`) }
					: {}),
			};
		});
	};

	const putSecret = (rawName: unknown, id: string, raw: unknown) => {
		const group = get(String(rawName));
		if (!SRC_ID_RE.test(id))
			throw new MockError(
				"INVALID_NAME",
				400,
				"来源 id 只能包含字母, 数字与下划线, 长度 1-64",
				{ id }
			);
		const source = normalizeSource(raw);
		if (!source) {
			throw new MockError(
				"BAD_REQUEST",
				400,
				"来源必须是 value(明文), env(环境变量名), keychain(service 与 account), command(argv 数组) 或 prompt(发送时输入)",
				{ field: "source" }
			);
		}
		const sources = readSources(group.name);
		sources[id] = source;
		writeSecretFile(secretFileOf(group.name), { version: 1, sources });
		forget(group.name, id);
		return listSecrets(group.name).find(s => s.id === id);
	};

	const deleteSecret = (rawName: unknown, id: string) => {
		const group = get(String(rawName));
		const sources = readSources(group.name);
		if (!(id in sources)) throw new MockError("NOT_FOUND", 404, `来源不存在: ${id}`);
		delete sources[id];
		writeSecretFile(secretFileOf(group.name), { version: 1, sources });
		forget(group.name, id);
	};

	// keychain 与 command 的取值缓存在内存中(有效期 SECRET_CACHE_MS); prompt 的值只在内存中, 重启后需重新输入
	const cache = new Map<string, { value: string; at: number }>();
	const prompted = new Map<string, string>();
	const forget = (group: string, id: string) => {
		cache.delete(`${group}#${id}`);
		prompted.delete(`${group}#${id}`);
	};

	const fail = (group: string, id: string, why: string, extra: Record<string, unknown> = {}) =>
		new MockError("SECRET_UNAVAILABLE", 400, `敏感值来源 ${id} 不可用: ${why}`, {
			srcId: id,
			env: group,
			...extra,
		});

	/** 预取需要外部进程的来源(keychain, command), 供随后的同步解析使用 */
	const prefetchSecrets = async (group: string) => {
		const sources = readSources(group);
		await Promise.all(
			Object.entries(sources).map(async ([id, s]) => {
				if (s.from !== "keychain" && s.from !== "command") return;
				const key = `${group}#${id}`;
				const hit = cache.get(key);
				if (hit && Date.now() - hit.at < SECRET_CACHE_MS) return;
				try {
					cache.set(key, { value: await runSource(s), at: Date.now() });
				} catch (err) {
					cache.delete(key);
					throw fail(group, id, (err as Error).message);
				}
			})
		);
	};

	/** 解析敏感值; keychain 与 command 需先 prefetchSecrets, prompt 需先 enterPrompt */
	const resolveSecret = (group: string, id: string) => {
		const source = readSources(group)[id];
		if (!source) throw fail(group, id, "未配置");
		if (source.from === "value") return source.value;
		if (source.from === "env") {
			const value = process.env[source.name];
			if (value === undefined) throw fail(group, id, `环境变量 ${source.name} 未设置`);
			return value;
		}
		if (source.from === "prompt") {
			const value = prompted.get(`${group}#${id}`);
			if (value === undefined) throw fail(group, id, "需要在管理页输入", { prompt: true });
			return value;
		}
		const hit = cache.get(`${group}#${id}`);
		if (!hit) throw fail(group, id, "尚未取值");
		return hit.value;
	};

	const enterPrompt = (rawName: unknown, id: string, value: unknown) => {
		const group = get(String(rawName));
		const source = readSources(group.name)[id];
		if (!source || source.from !== "prompt")
			throw new MockError("BAD_REQUEST", 400, `来源 ${id} 不是发送时输入的来源`);
		if (typeof value !== "string" || !value)
			throw new MockError("BAD_REQUEST", 400, "请输入值", { field: "value" });
		prompted.set(`${group.name}#${id}`, value);
	};

	if (fs.existsSync(secretDir)) ensureIgnoredDir(secretDir);

	return {
		dir,
		secretDir,
		cookiesFileOf: (name: string) => {
			ensureIgnoredDir(secretDir);
			return cookiesFileOf(name);
		},
		list,
		get,
		put,
		rename,
		remove,
		listSecrets,
		putSecret,
		deleteSecret,
		resolveSecret,
		prefetchSecrets,
		enterPrompt,
	};
};

export type EnvStore = ReturnType<typeof createEnvStore>;
