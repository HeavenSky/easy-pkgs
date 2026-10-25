// 场景引用快照: 按标识定位快照目录, 带缓存地读取快照, 回放用的响应头过滤, 反向索引 requests/__refs__.json 的重建与引用改写
import fs from "fs";
import path from "path";
import type { createFileStore } from "../files";
import { DROP_HEADERS } from "../journal";
import { isPlainObject } from "../util";
import { DEBUG_DIR, META_FILE, SNAPSHOTS_DIR, isDebugName, nameKey } from "./names";

export const REFS_FILE = "__refs__.json";
const SNAPSHOT_ID_RE = /^[^#]+#[^#]+$/;

export type RefUsage = { route: string; scene: string; file: string };
export type LoadedSnapshot = {
	dir: string;
	meta: Record<string, any>;
	/** 响应体文件的绝对路径, 空响应体为 null */
	file: string | null;
};

/** 快照标识的形态; 合法时为 null */
export const refProblem = (ref: unknown) => {
	if (typeof ref !== "string" || !SNAPSHOT_ID_RE.test(ref)) return "ref 必须形如 <请求标识>#<快照名>";
	const [request, name] = ref.split("#");
	if (!request.split("/").every(isDebugName) || !isDebugName(name)) return `ref 中有不合规的名字: ${ref}`;
	return null;
};

/** 在 dir 下按不区分大小写找到实际的目录名 */
const childOf = (dir: string, name: string) => {
	const direct = path.join(dir, name);
	if (fs.existsSync(direct)) return direct;
	try {
		const hit = fs.readdirSync(dir).find(n => nameKey(n) === nameKey(name));
		return hit ? path.join(dir, hit) : null;
	} catch {
		return null;
	}
};

/** 快照目录; 不存在时为 null */
export const snapshotDirOf = (folder: string, ref: string) => {
	if (refProblem(ref)) return null;
	const [request, name] = ref.split("#");
	let dir: string | null = path.join(folder, DEBUG_DIR, "requests");
	for (const seg of request.split("/")) {
		dir = childOf(dir, seg);
		if (!dir) return null;
	}
	const res = childOf(dir, SNAPSHOTS_DIR);
	return res ? childOf(res, name) : null;
};

const cache = new Map<string, { mtimeMs: number; size: number; meta: Record<string, any> }>();

/** 读取快照(元数据按 mtime 缓存); 不存在, 无法解析, 发送失败或响应体文件缺失时为 null */
export const loadSnapshot = (folder: string, ref: string): LoadedSnapshot | null => {
	const dir = snapshotDirOf(folder, ref);
	if (!dir) return null;
	const metaFile = path.join(dir, META_FILE);
	let stat: fs.Stats;
	try {
		stat = fs.statSync(metaFile);
	} catch {
		return null;
	}
	let entry = cache.get(metaFile);
	if (!entry || entry.mtimeMs !== stat.mtimeMs || entry.size !== stat.size) {
		try {
			const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
			if (!isPlainObject(meta)) return null;
			entry = { mtimeMs: stat.mtimeMs, size: stat.size, meta };
			cache.set(metaFile, entry);
		} catch {
			return null;
		}
	}
	const meta = entry.meta;
	if (meta.error || !isPlainObject(meta.response)) return null;
	const body = (meta.response as Record<string, any>).body;
	const file = body && typeof body.file === "string" ? path.join(dir, body.file) : null;
	if (file && !fs.existsSync(file)) return null;
	return { dir, meta, file };
};

/** 回放时保留的响应头: 去掉传输层头与 x-mock 头, set-cookie 只在快照允许时保留 */
export const replayHeaders = (meta: Record<string, any>): Array<[string, string]> => {
	const keepCookie = !!(meta.replay && meta.replay.setCookie === true);
	const list = Array.isArray(meta.response?.headers) ? (meta.response.headers as Array<[string, string]>) : [];
	return list.filter(
		([k]) => !DROP_HEADERS.has(k) && !k.startsWith("x-mock") && (keepCookie || k !== "set-cookie")
	);
};

export const createRefs = (opt: {
	folder: string;
	fileStore: ReturnType<typeof createFileStore>;
	/** 改写场景文件后立即重载路由表 */
	reload: () => void;
}) => {
	const { folder, fileStore } = opt;
	const indexFile = path.join(folder, DEBUG_DIR, "requests", REFS_FILE);

	/** 全部引用: 快照标识 → 场景列表 */
	const collect = () => {
		const refs: Record<string, RefUsage[]> = {};
		fileStore.listSceneFiles().forEach(({ file, data }) => {
			if (!data) return;
			Object.entries(data.scenes).forEach(([scene, env]) => {
				if (!env || typeof env.ref !== "string") return;
				(refs[env.ref] ||= []).push({
					route: data.key,
					scene,
					file: path.relative(folder, file).split(path.sep).join("/"),
				});
			});
		});
		const sorted: Record<string, RefUsage[]> = {};
		Object.keys(refs)
			.sort()
			.forEach(k => {
				sorted[k] = refs[k].sort((a, b) => (a.route === b.route ? (a.scene < b.scene ? -1 : 1) : a.route < b.route ? -1 : 1));
			});
		return sorted;
	};

	/** 由场景文件全量重建索引; 内容不变时不写, 没有引用且文件不存在时不创建 */
	const rebuild = () => {
		const refs = collect();
		const text = `${JSON.stringify({ version: 1, refs }, null, "\t")}\n`;
		let current: string | null = null;
		try {
			current = fs.readFileSync(indexFile, "utf8");
		} catch {
			current = null;
		}
		if (current === text || (current === null && !Object.keys(refs).length)) return refs;
		try {
			fs.mkdirSync(path.dirname(indexFile), { recursive: true });
			fs.writeFileSync(indexFile, text);
		} catch (err) {
			console.warn("[easy-mok] 写入引用索引失败:", (err as Error).message || err);
		}
		return refs;
	};

	const keyOf = (ref: string) => ref.normalize("NFC").toLowerCase();

	/** 命中 match 的引用方; match 收到规范化(小写)的快照标识 */
	const usages = (match: (ref: string) => boolean) =>
		Object.entries(collect())
			.filter(([ref]) => match(keyOf(ref)))
			.flatMap(([ref, list]) => list.map(u => ({ ...u, ref })));

	/** 引用某个快照 */
	const forSnapshot = (sid: string) => usages(ref => ref === keyOf(sid));
	/** 引用某个请求或分组之下的快照 */
	const forNode = (id: string) => {
		const k = keyOf(id);
		return usages(ref => ref.startsWith(`${k}#`) || ref.startsWith(`${k}/`));
	};

	/** 按映射改写引用; map 返回新标识或 null(不改). 返回改写的场景数 */
	const rewrite = (map: (ref: string) => string | null) => {
		let count = 0;
		fileStore.listSceneFiles().forEach(({ data }) => {
			if (!data) return;
			const hits = Object.entries(data.scenes).filter(([, env]) => env && typeof env.ref === "string" && map(env.ref) !== null);
			if (!hits.length) return;
			fileStore.updateScenes(data.key, scenes => {
				hits.forEach(([name, env]) => {
					scenes[name] = { ...env, ref: map(env.ref as string) as string };
					count++;
				});
			});
		});
		if (count) opt.reload();
		return count;
	};

	/** 节点改名或移动: 前缀 from 换成 to */
	const moveNode = (from: string, to: string) => {
		const k = keyOf(from);
		return rewrite(ref => {
			const r = keyOf(ref);
			return r.startsWith(`${k}#`) || r.startsWith(`${k}/`) ? to + ref.slice(from.length) : null;
		});
	};
	const renameSnapshot = (from: string, to: string) => rewrite(ref => (keyOf(ref) === keyOf(from) ? to : null));

	return { indexFile, collect, rebuild, forSnapshot, forNode, moveNode, renameSnapshot, reload: opt.reload };
};

export type Refs = ReturnType<typeof createRefs>;
