// 调试历史: __debug__/history/<YYYYMMDD>/[<HH>/]<HHmmss>_<id>/, 每个日目录与小时目录各有一份只追加的 index.ndjson
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { MockError } from "../util";
import { META_FILE } from "./names";
import { readJson } from "./store";

export const DAY_SPLIT_BYTES = 50 * 1024 * 1024;
export const WARN_BYTES = 1024 * 1024 * 1024;
const INDEX = "index.ndjson";
const DAY_RE = /^\d{8}$/;
const HOUR_RE = /^\d{2}$/;
const ENTRY_RE = /^\d{6}_[0-9a-f]{6}$/;
const ID_RE = /^\d{8}\/(\d{2}\/)?\d{6}_[0-9a-f]{6}$/;

export type IndexLine = {
	id: string;
	request: string | null;
	env: string | null;
	method: string;
	url: string;
	status: number | null;
	size: number;
	durationMs: number;
	time: number;
	error: string | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
/** 本地时间的 YYYYMMDD, HH, HHmmss */
const stampOf = (d: Date) => ({
	day: `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`,
	hour: pad(d.getHours()),
	time: `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`,
});

const readLines = (file: string): IndexLine[] => {
	let text = "";
	try {
		text = fs.readFileSync(file, "utf8");
	} catch {
		return [];
	}
	return text
		.split("\n")
		.filter(Boolean)
		.flatMap(line => {
			try {
				return [JSON.parse(line) as IndexLine];
			} catch {
				return [];
			}
		});
};

const dirSize = (dir: string) => {
	let total = 0;
	try {
		fs.readdirSync(dir).forEach(n => {
			try {
				total += fs.statSync(path.join(dir, n)).size;
			} catch {
				/* 文件可能刚被删除 */
			}
		});
	} catch {
		/* 目录不存在 */
	}
	return total;
};

export const createHistoryStore = (debugRoot: string) => {
	const root = path.join(debugRoot, "history");
	let total: number | null = null;

	const listDir = (dir: string, re: RegExp) => {
		try {
			return fs.readdirSync(dir).filter(n => re.test(n));
		} catch {
			return [];
		}
	};

	/** 一天的全部索引行: 日级索引加各小时索引 */
	const dayLines = (day: string) => {
		const dayDir = path.join(root, day);
		return [
			...readLines(path.join(dayDir, INDEX)),
			...listDir(dayDir, HOUR_RE).flatMap(h => readLines(path.join(dayDir, h, INDEX))),
		];
	};

	const days = () =>
		listDir(root, DAY_RE)
			.sort()
			.reverse()
			.map(day => {
				const lines = dayLines(day);
				return { day, bytes: lines.reduce((s, l) => s + (l.size || 0), 0), count: lines.length };
			});

	const totalBytes = () => {
		if (total === null) total = days().reduce((s, d) => s + d.bytes, 0);
		return total;
	};

	/** 为新条目分配目录; 当天已超过 50MB 时改按小时存放 */
	const allocate = (now = new Date()) => {
		const { day, hour, time } = stampOf(now);
		const dayBytes = dayLines(day).reduce((s, l) => s + (l.size || 0), 0);
		const parts = dayBytes > DAY_SPLIT_BYTES ? [day, hour] : [day];
		const name = `${time}_${crypto.randomBytes(3).toString("hex")}`;
		const id = [...parts, name].join("/");
		const dir = path.join(root, ...parts, name);
		fs.mkdirSync(dir, { recursive: true });
		return { id, dir, indexFile: path.join(root, ...parts, INDEX) };
	};

	/** 条目目录写完后追加索引行 */
	const commit = (slot: { id: string; dir: string; indexFile: string }, line: Omit<IndexLine, "id" | "size">) => {
		const size = dirSize(slot.dir);
		const full: IndexLine = { ...line, id: slot.id, size };
		const before = totalBytes(); // 先取总量再追加, 否则首次统计会把这一条算两遍
		fs.appendFileSync(slot.indexFile, `${JSON.stringify(full)}\n`);
		total = before + size;
		return full;
	};

	const dirOf = (id: string) => {
		if (!ID_RE.test(id)) throw new MockError("BAD_REQUEST", 400, `历史标识无效: ${id}`);
		const dir = path.join(root, ...id.split("/"));
		if (!fs.existsSync(dir)) throw new MockError("NOT_FOUND", 404, `历史条目不存在或已删除: ${id}`);
		return dir;
	};

	const get = (id: string) => {
		const dir = dirOf(id);
		const { ok, value } = readJson(path.join(dir, META_FILE));
		if (!ok || !value) throw new MockError("NOT_FOUND", 404, `历史条目元数据缺失: ${id}`);
		return { id, dir, meta: value as Record<string, any> };
	};

	/** 按时间倒序分页; cursor 为上一页最后一条的 id */
	const list = (opt: { request?: string | null; cursor?: string | null; limit?: number }) => {
		const limit = Math.min(Math.max(Number(opt.limit) || 50, 1), 200);
		const items: IndexLine[] = [];
		let passed = !opt.cursor;
		let more = false;
		for (const { day } of days()) {
			const lines = dayLines(day).sort((a, b) => b.time - a.time || (a.id < b.id ? 1 : -1));
			for (const line of lines) {
				if (!passed) {
					if (line.id === opt.cursor) passed = true;
					continue;
				}
				if (opt.request !== undefined && opt.request !== null && line.request !== opt.request) continue;
				if (!ENTRY_RE.test(line.id.split("/").pop() || "") || !fs.existsSync(path.join(root, ...line.id.split("/")))) continue;
				if (items.length === limit) {
					more = true;
					break;
				}
				items.push(line);
			}
			if (more) break;
		}
		return { items, next: more ? items[items.length - 1].id : null };
	};

	const removeDay = (day: string) => {
		if (!DAY_RE.test(day)) throw new MockError("BAD_REQUEST", 400, `日期无效: ${day}`);
		const bytes = dayLines(day).reduce((s, l) => s + (l.size || 0), 0);
		fs.rmSync(path.join(root, day), { recursive: true, force: true });
		total = Math.max(0, totalBytes() - bytes);
	};

	return {
		root,
		allocate,
		commit,
		get,
		list,
		days,
		removeDay,
		totalBytes,
		warn: () => totalBytes() >= WARN_BYTES,
	};
};

export type HistoryStore = ReturnType<typeof createHistoryStore>;
