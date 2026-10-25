// 调试数据的目录名, 命名规则与查重键; 分组, 请求, 快照与环境组共用同一套名字规则
import { MockError } from "../util";

export const DEBUG_DIR = "__debug__";
export const META_FILE = "__meta__.json";
export const REQ_FILE = "req.json";
export const SNAPSHOTS_DIR = "res";

// 与管理页 src/ui/api/debug-contract.ts 的 DEBUG_NAME_RE 必须逐字相同, 契约测试比对两者源码
export const DEBUG_NAME_RE = /^(?![._-])[A-Za-z0-9._\-\p{Script=Han}]{1,64}(?<![._-])$/u;
export const VAR_NAME_RE = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/;
export const SRC_ID_RE = /^[A-Za-z0-9_]{1,64}$/;

/** 分组与请求不能使用的名字(比较时不区分大小写) */
const RESERVED_NODE_NAMES = new Set([SNAPSHOTS_DIR, REQ_FILE]);

/** 查重键: NFC 规范化后转小写; macOS 文件系统可能给出 NFD 形式的中文名 */
export const nameKey = (name: string) => name.normalize("NFC").toLowerCase();

export const isDebugName = (name: unknown): name is string =>
	typeof name === "string" && DEBUG_NAME_RE.test(name.normalize("NFC"));

export const assertDebugName = (name: unknown, what: string, node = false) => {
	if (!isDebugName(name)) {
		throw new MockError(
			"INVALID_NAME",
			400,
			`${what}只能包含字母, 数字, 中文, 点, 下划线与连字符, 长度 1-64, 首尾不能是 . _ -`,
			{ name }
		);
	}
	if (node && RESERVED_NODE_NAMES.has(nameKey(name))) {
		throw new MockError("INVALID_NAME", 400, `${what}不能使用保留名 ${name}`, { name });
	}
	return name.normalize("NFC");
};

/** 请求或分组标识: 用 / 分隔的名字路径; 返回各段 */
export const splitNodeId = (id: unknown, what = "节点标识") => {
	if (typeof id !== "string" || !id) {
		throw new MockError("BAD_REQUEST", 400, `${what}不能为空`);
	}
	return id.split("/").map(seg => assertDebugName(seg, what, true));
};

/** 快照标识 <请求标识>#<快照名> */
export const splitSnapshotId = (id: unknown) => {
	const text = String(id || "");
	const i = text.lastIndexOf("#");
	if (i <= 0) {
		throw new MockError("BAD_REQUEST", 400, "快照标识必须形如 <请求标识>#<快照名>");
	}
	return {
		request: splitNodeId(text.slice(0, i), "请求标识").join("/"),
		name: assertDebugName(text.slice(i + 1), "快照名"),
	};
};

/** URL 中的标识用 base64url 编码, 与路由 id 一致 */
export const decodeId = (raw: unknown) => {
	try {
		return Buffer.from(String(raw || ""), "base64url").toString("utf8");
	} catch {
		return "";
	}
};
export const encodeId = (id: string) => Buffer.from(id, "utf8").toString("base64url");
