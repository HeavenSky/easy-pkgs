// mock 目录内由管理页写入的文件: __scenes__ 下的 JSON 场景与 __gui__.json 路由
import fs from "fs";
import path from "path";
import { MockError, isPlainObject, sha1, writeJsonAtomic } from "./util";
import type { Envelope } from "./scene";

export const SCENES_DIR = "__scenes__";
export const GUI_FILE = "__gui__.json";

export type SceneFile = { key: string, scenes: Record<string, Envelope> };

/** 校验响应信封, 返回规范化后的副本. */
export const normalizeEnvelope = (raw: unknown): Envelope => {
	if (!isPlainObject(raw)) { throw new MockError("BAD_REQUEST", 400, "响应必须是对象", { field: "response" }); }
	const out: Envelope = { body: raw.body === undefined ? null : raw.body };
	if (raw.status !== undefined && raw.status !== null) {
		if (!Number.isInteger(raw.status) || (raw.status as number) < 100 || (raw.status as number) > 599) {
			throw new MockError("BAD_REQUEST", 400, "状态码必须是 100-599 的整数", { field: "status" });
		}
		out.status = raw.status as number;
	}
	if (raw.headers !== undefined && raw.headers !== null) {
		if (!isPlainObject(raw.headers)) { throw new MockError("BAD_REQUEST", 400, "响应头必须是对象", { field: "headers" }); }
		const headers: Record<string, string> = {};
		Object.entries(raw.headers).forEach(([k, v]) => {
			if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(k)) {
				throw new MockError("BAD_REQUEST", 400, `非法的响应头名称: ${k}`, { field: "headers" });
			}
			headers[k.toLowerCase()] = String(v);
		});
		out.headers = headers;
	}
	if (raw.delay !== undefined && raw.delay !== null) {
		if (typeof raw.delay !== "number" || raw.delay < 0 || raw.delay > 60000) {
			throw new MockError("BAD_REQUEST", 400, "延迟必须是 0-60000 的毫秒数", { field: "delay" });
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
		const slug = key.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "route";
		const file = path.join(scenesDir, `${slug}.${sha1(key).slice(0, 8)}.json`);
		if (path.dirname(file) !== scenesDir) { throw new MockError("FORBIDDEN", 403, "场景文件路径越界"); }
		return file;
	};

	const readSceneFile = (file: string): SceneFile | null => {
		try {
			const raw = JSON.parse(fs.readFileSync(file, "utf8"));
			if (!isPlainObject(raw) || typeof raw.key !== "string" || !isPlainObject(raw.scenes)) { return null; }
			return raw as SceneFile;
		} catch (_error) {
			return null;
		}
	};

	const listSceneFiles = (): Array<{ file: string, data: SceneFile | null }> => {
		let names: string[] = [];
		try { names = fs.readdirSync(scenesDir); } catch (_error) { return []; }
		return names.filter(n => n.endsWith(".json")).sort()
			.map(n => path.join(scenesDir, n))
			.map(file => ({ file, data: readSceneFile(file) }));
	};

	const updateScenes = (key: string, mutate: (scenes: Record<string, Envelope>) => void) => {
		const file = sceneFileOf(key);
		const current = readSceneFile(file);
		const map: Record<string, Envelope> = current && current.key === key ? { ...current.scenes } : {};
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
	};

	const removeFile = (file: string) => {
		if (path.dirname(file) !== scenesDir) { throw new MockError("FORBIDDEN", 403, "场景文件路径越界"); }
		try { fs.unlinkSync(file); } catch (err) {
			if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
				throw new MockError("IO_ERROR", 500, "删除场景文件失败", undefined, { cause: err });
			}
		}
	};

	const readGui = (): Record<string, unknown> => {
		try {
			const raw = JSON.parse(fs.readFileSync(guiFile, "utf8"));
			return isPlainObject(raw) ? raw : {};
		} catch (_error) {
			return {};
		}
	};

	const updateGui = (mutate: (routes: Record<string, unknown>) => void) => {
		const routes = readGui();
		mutate(routes);
		try {
			writeJsonAtomic(guiFile, routes);
		} catch (err) {
			throw new MockError("IO_ERROR", 500, "写入 __gui__.json 失败", undefined, { cause: err });
		}
	};

	/** 记下 __gui__.json 与该路由场景文件的原始内容, 返回的函数把两者原样还原(原本不存在的删除) */
	const snapshot = (key: string) => {
		const saved = [guiFile, sceneFileOf(key)].map(file => {
			try { return { file, text: fs.readFileSync(file, "utf8") as string | null }; } catch (_error) { return { file, text: null }; }
		});
		return () => saved.forEach(({ file, text }) => {
			try {
				if (text === null) {
					fs.existsSync(file) && fs.unlinkSync(file);
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

	return { scenesDir, guiFile, sceneFileOf, listSceneFiles, updateScenes, removeFile, readGui, updateGui, snapshot };
};
