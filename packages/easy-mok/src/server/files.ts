// mock 目录内由管理页写入的文件: __scenes__ 下的 JSON 场景与 __gui__.json 路由
import fs from "fs";
import path from "path";
import { MockError, isPlainObject, sha1, writeJsonAtomic } from "./util";
import { SCRIPT_LIMIT } from "./script";
import type { Envelope } from "./scene";
import { refProblem } from "./debug/refs";

export const SCENES_DIR = "__scenes__";
export const GUI_FILE = "__gui__.json";

export type SceneFile = { key: string; scenes: Record<string, Envelope> };

/** bodyFile 的路径形态错误说明; 合法时为 null. 只接受 __scenes__ 内的 POSIX 相对路径 */
export const bodyFileProblem = (value: unknown) => {
	if (typeof value !== "string" || !value.trim()) {
		return "bodyFile 必须是非空字符串";
	}
	if (value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/.test(value)) {
		return "bodyFile 必须是相对 __scenes__ 的 POSIX 路径";
	}
	if (value.split("/").some(seg => seg === ".." || seg === "." || seg === "")) {
		return "bodyFile 不能含 .., . 或空路径段";
	}
	return null;
};

/** 校验响应信封, 返回规范化后的副本. */
export const normalizeEnvelope = (raw: unknown): Envelope => {
	if (!isPlainObject(raw)) {
		throw new MockError("BAD_REQUEST", 400, "响应必须是对象", { field: "response" });
	}
	const out: Envelope = { body: raw.body === undefined ? null : raw.body };
	if (raw.script !== undefined && raw.script !== null) {
		if (typeof raw.script !== "string" || !raw.script.trim()) {
			throw new MockError("BAD_REQUEST", 400, "脚本必须是非空字符串", { field: "script" });
		}
		if (Buffer.byteLength(raw.script) > SCRIPT_LIMIT) {
			throw new MockError("BAD_REQUEST", 400, `脚本不能超过 ${SCRIPT_LIMIT / 1024}KB`, {
				field: "script",
			});
		}
		out.body = null;
		out.script = raw.script;
	}
	if (raw.bodyFile !== undefined && raw.bodyFile !== null) {
		const problem = bodyFileProblem(raw.bodyFile);
		if (problem) {
			throw new MockError("BAD_REQUEST", 400, problem, { field: "bodyFile" });
		}
		if (out.script !== undefined || (raw.body !== undefined && raw.body !== null)) {
			throw new MockError("BAD_REQUEST", 400, "bodyFile 不能与 body 或 script 同时出现", {
				field: "bodyFile",
			});
		}
		out.body = null;
		out.bodyFile = raw.bodyFile as string;
	}
	if (raw.ref !== undefined && raw.ref !== null) {
		const problem = refProblem(raw.ref);
		if (problem) {
			throw new MockError("BAD_REQUEST", 400, problem, { field: "ref" });
		}
		if (
			out.script !== undefined ||
			out.bodyFile !== undefined ||
			(raw.body !== undefined && raw.body !== null)
		) {
			throw new MockError(
				"BAD_REQUEST",
				400,
				"ref 不能与 body, bodyFile 或 script 同时出现",
				{ field: "ref" }
			);
		}
		out.body = null;
		out.ref = raw.ref as string;
	}
	if (raw.status !== undefined && raw.status !== null) {
		if (
			!Number.isInteger(raw.status) ||
			(raw.status as number) < 100 ||
			(raw.status as number) > 599
		) {
			throw new MockError("BAD_REQUEST", 400, "状态码必须是 100-599 的整数", {
				field: "status",
			});
		}
		out.status = raw.status as number;
	}
	if (raw.headers !== undefined && raw.headers !== null) {
		if (!isPlainObject(raw.headers)) {
			throw new MockError("BAD_REQUEST", 400, "响应头必须是对象", { field: "headers" });
		}
		const headers: Record<string, string> = {};
		Object.entries(raw.headers).forEach(([k, v]) => {
			if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(k)) {
				throw new MockError("BAD_REQUEST", 400, `非法的响应头名称: ${k}`, {
					field: "headers",
				});
			}
			headers[k.toLowerCase()] = String(v);
		});
		out.headers = headers;
	}
	if (raw.delay !== undefined && raw.delay !== null) {
		if (typeof raw.delay !== "number" || raw.delay < 0 || raw.delay > 60000) {
			throw new MockError("BAD_REQUEST", 400, "延迟必须是 0-60000 的毫秒数", {
				field: "delay",
			});
		}
		out.delay = raw.delay;
	}
	return out;
};

export const createFileStore = (folder: string) => {
	const scenesDir = path.join(folder, SCENES_DIR);
	const guiFile = path.join(folder, GUI_FILE);

	/** 文件名只由 key 生成, 调用方无法指定路径 */
	const sceneFileOf = (key: string) => {
		const slug =
			key
				.replace(/[^\p{L}\p{N}]+/gu, "_")
				.replace(/^_+|_+$/g, "")
				.slice(0, 60) || "route";
		const file = path.join(scenesDir, `${slug}.${sha1(key).slice(0, 8)}.json`);
		if (path.dirname(file) !== scenesDir) {
			throw new MockError("FORBIDDEN", 403, "场景文件路径越界");
		}
		return file;
	};

	/** bodyFile → 绝对路径; 越出 __scenes__ 时抛错 */
	const bodyFilePath = (rel: string) => {
		const file = path.resolve(scenesDir, rel);
		if (!file.startsWith(scenesDir + path.sep)) {
			throw new MockError("FORBIDDEN", 403, "bodyFile 路径越界");
		}
		return file;
	};

	/** 归属该路由的文件目录: 场景文件名去掉 .json; 其中被场景引用过的文件随场景删除 */
	const ownedDirOf = (key: string) => sceneFileOf(key).replace(/\.json$/, "");

	/** 删除不再被引用的归属文件, 目录空了一并删除 */
	const dropOwnedFiles = (
		key: string,
		before: Record<string, Envelope>,
		after: Record<string, Envelope>
	) => {
		const dir = ownedDirOf(key);
		const kept = new Set(
			Object.values(after)
				.filter(env => env && typeof env.bodyFile === "string")
				.map(env => path.resolve(scenesDir, env.bodyFile as string))
		);
		Object.values(before).forEach(env => {
			if (!env || typeof env.bodyFile !== "string" || bodyFileProblem(env.bodyFile)) {
				return;
			}
			const file = path.resolve(scenesDir, env.bodyFile);
			if (path.dirname(file) !== dir || kept.has(file)) {
				return;
			}
			try {
				fs.unlinkSync(file);
			} catch {
				/* 文件可能已被手动删除 */
			}
		});
		try {
			if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
		} catch {
			/* 目录不存在 */
		}
	};

	const readSceneFile = (file: string): SceneFile | null => {
		try {
			const raw = JSON.parse(fs.readFileSync(file, "utf8"));
			if (!isPlainObject(raw) || typeof raw.key !== "string" || !isPlainObject(raw.scenes)) {
				return null;
			}
			return raw as SceneFile;
		} catch {
			return null;
		}
	};

	const listSceneFiles = (): Array<{ file: string; data: SceneFile | null }> => {
		let names: string[] = [];
		try {
			names = fs.readdirSync(scenesDir);
		} catch {
			return [];
		}
		return names
			.filter(n => n.endsWith(".json"))
			.sort()
			.map(n => path.join(scenesDir, n))
			.map(file => ({ file, data: readSceneFile(file) }));
	};

	const updateScenes = (key: string, mutate: (scenes: Record<string, Envelope>) => void) => {
		const file = sceneFileOf(key);
		const current = readSceneFile(file);
		const map: Record<string, Envelope> =
			current && current.key === key ? { ...current.scenes } : {};
		const before = { ...map };
		mutate(map);
		try {
			if (Object.keys(map).length) {
				writeJsonAtomic(file, { key, scenes: map });
			} else if (fs.existsSync(file)) {
				fs.unlinkSync(file);
			}
		} catch (err) {
			throw new MockError("IO_ERROR", 500, "写入场景文件失败", undefined, { cause: err });
		}
		dropOwnedFiles(key, before, map);
	};

	const removeFile = (file: string) => {
		if (path.dirname(file) !== scenesDir) {
			throw new MockError("FORBIDDEN", 403, "场景文件路径越界");
		}
		try {
			fs.unlinkSync(file);
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
				throw new MockError("IO_ERROR", 500, "删除场景文件失败", undefined, { cause: err });
			}
		}
		// 归属该场景文件的 bodyFile 目录随之删除
		fs.rmSync(file.replace(/\.json$/, ""), { recursive: true, force: true });
	};

	/** 文件不存在时为空对象; 存在但不是 JSON 对象时抛 GUI_FILE_INVALID, 免得写入时整份覆盖手改的内容 */
	const readGui = (): Record<string, unknown> => {
		let text: string;
		try {
			text = fs.readFileSync(guiFile, "utf8");
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === "ENOENT") {
				return {};
			}
			throw new MockError("IO_ERROR", 500, "读取 __gui__.json 失败", undefined, {
				cause: err,
			});
		}
		let raw: unknown;
		let reason = "顶层必须是对象";
		try {
			raw = text.trim() ? JSON.parse(text) : {};
		} catch (err) {
			reason = (err as Error).message;
		}
		if (!isPlainObject(raw)) {
			throw new MockError(
				"GUI_FILE_INVALID",
				409,
				`${guiFile} 不是合法的 JSON 对象(${reason}), 为免覆盖其中内容已拒绝写入; 请先修复或删除该文件`,
				{ file: guiFile }
			);
		}
		return raw;
	};

	const updateGui = (mutate: (routes: Record<string, unknown>) => void) => {
		const routes = readGui();
		mutate(routes);
		try {
			writeJsonAtomic(guiFile, routes);
		} catch (err) {
			throw new MockError("IO_ERROR", 500, "写入 __gui__.json 失败", undefined, {
				cause: err,
			});
		}
	};

	/** 记下 __gui__.json 与该路由场景文件的原始内容, 返回的函数把两者原样还原(原本不存在的删除) */
	const snapshot = (key: string) => {
		const saved = [guiFile, sceneFileOf(key)].map(file => {
			try {
				return { file, text: fs.readFileSync(file, "utf8") as string | null };
			} catch {
				return { file, text: null };
			}
		});
		return () =>
			saved.forEach(({ file, text }) => {
				try {
					if (text === null) {
						if (fs.existsSync(file)) fs.unlinkSync(file);
					} else {
						const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
						fs.writeFileSync(tmp, text);
						fs.renameSync(tmp, file);
					}
				} catch (err) {
					console.warn("[easy-mok] 还原文件失败:", file, (err as Error).message || err);
				}
			});
	};

	return {
		scenesDir,
		guiFile,
		sceneFileOf,
		bodyFilePath,
		ownedDirOf,
		listSceneFiles,
		updateScenes,
		removeFile,
		readGui,
		updateGui,
		snapshot,
	};
};
