// 服务端通用工具: 原子写文件, 内容摘要, 错误类型
import crypto from "crypto";
import fs from "fs";
import path from "path";

export const sha1 = (data: string | Buffer) => crypto.createHash("sha1").update(data).digest("hex");

export const etagOf = (value: unknown) => sha1(JSON.stringify(value === undefined ? null : value));

/** 先写同目录临时文件再 rename, 进程中断时不会留下半个文件. */
export const writeJsonAtomic = (file: string, data: unknown) => {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
	fs.writeFileSync(tmp, `${JSON.stringify(data, null, "\t")}\n`);
	try {
		fs.renameSync(tmp, file);
	} catch (err) {
		try {
			fs.unlinkSync(tmp);
		} catch {
			/* 临时文件可能已不存在 */
		}
		throw err;
	}
};

export const isPlainObject = (v: unknown): v is Record<string, unknown> =>
	!!v &&
	typeof v === "object" &&
	!Array.isArray(v) &&
	(Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

/** 面向管理接口调用方的错误, code 与 HTTP 状态见方案第 8.1 节 */
export class MockError extends Error {
	code: string;
	status: number;
	details: Record<string, unknown> | undefined;

	constructor(
		code: string,
		status: number,
		message: string,
		details?: Record<string, unknown>,
		opt?: { cause?: unknown }
	) {
		super(message, opt);
		this.code = code;
		this.status = status;
		this.details = details;
	}
}

export const NAME_RE = /^[\p{L}\p{N}_-]{1,64}$/u;

export const assertName = (name: unknown, what: string) => {
	if (typeof name !== "string" || !NAME_RE.test(name)) {
		throw new MockError(
			"INVALID_NAME",
			400,
			`${what}只能包含字母, 数字, 下划线与连字符, 长度 1-64`,
			{ name }
		);
	}
	return name;
};
