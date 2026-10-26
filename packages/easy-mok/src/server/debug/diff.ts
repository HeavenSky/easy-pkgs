// 快照与历史的对比: 状态码, 响应头(按名对齐)与响应体; JSON 先递归排序 key 再按行 diff, 其余文本按行 diff, 二进制与过大只比摘要
import fs from "fs";
import path from "path";
import { isPlainObject } from "../util";
import { extOfFile, isTextExt } from "../mime";

export const DIFF_LIMIT = 2 * 1024 * 1024;
const CONTEXT = 3;

export type DiffLine = { op: " " | "-" | "+"; text: string };
export type Hunk = {
	aStart: number;
	aLines: number;
	bStart: number;
	bLines: number;
	lines: DiffLine[];
};
export type Side = { meta: Record<string, any>; dir: string };

/** 递归排序对象的 key(数组保持顺序), 2 空格缩进 */
export const canonicalJson = (value: unknown) => {
	const sort = (v: unknown): unknown =>
		Array.isArray(v)
			? v.map(sort)
			: isPlainObject(v)
				? Object.fromEntries(
						Object.keys(v)
							.sort()
							.map(k => [k, sort(v[k])])
					)
				: v;
	return JSON.stringify(sort(value), null, 2);
};

/** Myers 差分: 返回逐行的编辑脚本 */
export const diffLines = (a: string[], b: string[]): DiffLine[] => {
	const n = a.length;
	const m = b.length;
	const max = n + m;
	const offset = max;
	const v = new Int32Array(2 * max + 2);
	const trace: Int32Array[] = [];
	let found = false;
	for (let d = 0; d <= max && !found; d++) {
		trace.push(v.slice());
		for (let k = -d; k <= d; k += 2) {
			let x =
				k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])
					? v[offset + k + 1]
					: v[offset + k - 1] + 1;
			let y = x - k;
			while (x < n && y < m && a[x] === b[y]) {
				x++;
				y++;
			}
			v[offset + k] = x;
			if (x >= n && y >= m) {
				found = true;
				break;
			}
		}
	}
	// 回溯生成编辑脚本
	const out: DiffLine[] = [];
	let x = n;
	let y = m;
	for (let d = trace.length - 1; d >= 0; d--) {
		const vd = trace[d];
		const k = x - y;
		const prevK =
			k === -d || (k !== d && vd[offset + k - 1] < vd[offset + k + 1]) ? k + 1 : k - 1;
		const prevX = vd[offset + prevK];
		const prevY = prevX - prevK;
		while (x > prevX && y > prevY) {
			out.push({ op: " ", text: a[x - 1] });
			x--;
			y--;
		}
		if (d > 0) {
			if (x === prevX) out.push({ op: "+", text: b[y - 1] });
			else out.push({ op: "-", text: a[x - 1] });
		}
		x = prevX;
		y = prevY;
	}
	return out.reverse();
};

/** 编辑脚本按上下文行数切成 hunk; 完全相同时为空 */
export const hunksOf = (script: DiffLine[], context = CONTEXT): Hunk[] => {
	const hunks: Hunk[] = [];
	let aLine = 1;
	let bLine = 1;
	let current: Hunk | null = null;
	let trailing = 0;
	script.forEach((line, i) => {
		const changed = line.op !== " ";
		const nearChange = script.slice(i + 1, i + 1 + context).some(l => l.op !== " ");
		if (changed || nearChange || (current && trailing < context)) {
			if (!current) {
				current = { aStart: aLine, aLines: 0, bStart: bLine, bLines: 0, lines: [] };
				hunks.push(current);
			}
			current.lines.push(line);
			if (line.op !== "+") current.aLines++;
			if (line.op !== "-") current.bLines++;
			trailing = changed ? 0 : trailing + 1;
		} else {
			current = null;
			trailing = 0;
		}
		if (line.op !== "+") aLine++;
		if (line.op !== "-") bLine++;
	});
	return hunks;
};

const bodyOf = (side: Side) => {
	const body = side.meta.response && side.meta.response.body;
	const file = body && body.file ? path.join(side.dir, body.file) : null;
	return {
		file,
		size: body ? Number(body.size) || 0 : 0,
		sha256: body ? String(body.sha256 || "") : "",
		contentType: body ? (body.contentType as string | null) : null,
		decoded: !body || body.decoded !== false,
	};
};

/** 合法 UTF-8 时返回文本, 否则 null */
const utf8 = (buf: Buffer) => {
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(buf);
	} catch {
		return null;
	}
};

const headersOf = (side: Side) => {
	const map = new Map<string, string[]>();
	((side.meta.response && side.meta.response.headers) || []).forEach(([k, v]: [string, string]) =>
		map.set(k, [...(map.get(k) || []), v])
	);
	return map;
};

export const diffResults = (a: Side, b: Side) => {
	const ha = headersOf(a);
	const hb = headersOf(b);
	const names = [...new Set([...ha.keys(), ...hb.keys()])].sort();
	const headers = names.map(name => {
		const av = ha.get(name) || [];
		const bv = hb.get(name) || [];
		const change = !av.length
			? "added"
			: !bv.length
				? "removed"
				: JSON.stringify(av) === JSON.stringify(bv)
					? "same"
					: "changed";
		return { name, a: av, b: bv, change };
	});
	const ba = bodyOf(a);
	const bb = bodyOf(b);
	const summary = {
		a: { size: ba.size, sha256: ba.sha256 },
		b: { size: bb.size, sha256: bb.sha256 },
	};
	let body: { mode: string; same: boolean; hunks: Hunk[] };
	if (!ba.file && !bb.file) {
		body = { mode: "empty", same: true, hunks: [] };
	} else if (ba.size > DIFF_LIMIT || bb.size > DIFF_LIMIT) {
		body = { mode: "too-large", same: ba.sha256 === bb.sha256, hunks: [] };
	} else {
		const textual = (f: string | null, decoded: boolean) =>
			!f || (decoded && isTextExt(extOfFile(f)));
		const ta = ba.file ? utf8(fs.readFileSync(ba.file)) : "";
		const tb = bb.file ? utf8(fs.readFileSync(bb.file)) : "";
		if (
			!textual(ba.file, ba.decoded) ||
			!textual(bb.file, bb.decoded) ||
			ta === null ||
			tb === null
		) {
			body = { mode: "binary", same: ba.sha256 === bb.sha256, hunks: [] };
		} else {
			let mode = "text";
			let la = ta;
			let lb = tb;
			try {
				la = canonicalJson(JSON.parse(ta));
				lb = canonicalJson(JSON.parse(tb));
				mode = "json";
			} catch {
				la = ta;
				lb = tb;
			}
			const script = diffLines(la.split("\n"), lb.split("\n"));
			const hunks = hunksOf(script);
			body = { mode, same: hunks.length === 0, hunks };
		}
	}
	return {
		status: {
			a: a.meta.response ? a.meta.response.status : null,
			b: b.meta.response ? b.meta.response.status : null,
		},
		headers,
		body: { ...body, ...summary },
	};
};
