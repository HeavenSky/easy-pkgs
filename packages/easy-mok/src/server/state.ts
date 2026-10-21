// 运行状态(手选场景, 模式, 延迟, 场景组, 全局开关)的持久化
import fs from "fs";
import { isPlainObject, writeJsonAtomic } from "./util";

export const STATE_VERSION = 1;
export const LOG_LEVELS = ["silent", "hit", "all"];

export type RouteState = {
	scene?: string | null;
	mode?: "mock" | "pass";
	delay?: number | null;
	status?: number | null;
};
export type MockState = {
	version: number;
	enabled: boolean;
	group: string | null;
	logLevel: "silent" | "hit" | "all";
	routes: Record<string, RouteState>;
	groups: Record<string, Record<string, string>>;
	/** 请求忽略: 内置规则总开关, 逐条停用的内置规则, 管理页自定义规则 */
	ignore: { defaults: boolean; disabled: string[]; custom: string[] };
};

export const defaults = (): MockState => ({
	version: STATE_VERSION,
	enabled: true,
	group: null,
	logLevel: "hit",
	routes: {},
	groups: {},
	ignore: { defaults: true, disabled: [], custom: [] },
});

/** 只保留结构合法的字段, 其余丢弃, 防止手改坏的状态文件让服务崩溃. */
export const sanitize = (raw: unknown): MockState => {
	const base = defaults();
	if (!isPlainObject(raw)) {
		return base;
	}
	if (typeof raw.enabled === "boolean") {
		base.enabled = raw.enabled;
	}
	if (typeof raw.group === "string") {
		base.group = raw.group;
	}
	if (typeof raw.logLevel === "string" && LOG_LEVELS.includes(raw.logLevel)) {
		base.logLevel = raw.logLevel as MockState["logLevel"];
	}
	if (isPlainObject(raw.routes)) {
		Object.entries(raw.routes).forEach(([id, r]) => {
			if (!isPlainObject(r)) {
				return;
			}
			const out: RouteState = {};
			if (typeof r.scene === "string") {
				out.scene = r.scene;
			}
			if (r.mode === "mock" || r.mode === "pass") {
				out.mode = r.mode;
			}
			if (typeof r.delay === "number" && r.delay >= 0) {
				out.delay = Math.min(r.delay, 60000);
			}
			if (typeof r.status === "number" && r.status >= 100 && r.status <= 599) {
				out.status = r.status;
			}
			if (Object.keys(out).length) {
				base.routes[id] = out;
			}
		});
	}
	if (isPlainObject(raw.groups)) {
		Object.entries(raw.groups).forEach(([name, g]) => {
			if (!isPlainObject(g)) {
				return;
			}
			const map: Record<string, string> = {};
			Object.entries(g).forEach(([id, scene]) => {
				if (typeof scene === "string") map[id] = scene;
			});
			base.groups[name] = map;
		});
	}
	if (isPlainObject(raw.ignore)) {
		const ig = raw.ignore;
		const strings = (v: unknown) =>
			Array.isArray(v)
				? [
						...new Set(
							v
								.filter(x => typeof x === "string" && x.trim())
								.map(x => (x as string).trim())
						),
					]
				: [];
		if (typeof ig.defaults === "boolean") {
			base.ignore.defaults = ig.defaults;
		}
		base.ignore.disabled = strings(ig.disabled);
		base.ignore.custom = strings(ig.custom);
	}
	if (base.group && !base.groups[base.group]) {
		base.group = null;
	}
	return base;
};

export const createStateStore = (
	file: string,
	hooks: { onChange?: (state: MockState) => void } = {}
) => {
	const problems: string[] = [];
	let readOnly = false;
	let state = defaults();
	try {
		const text = fs.readFileSync(file, "utf8");
		let raw: unknown;
		try {
			raw = JSON.parse(text);
		} catch {
			const broken = `${file}.broken-${Date.now()}`;
			fs.renameSync(file, broken);
			problems.push(`状态文件无法解析, 已改名为 ${broken} 并以默认状态启动`);
		}
		if (raw !== undefined) {
			if (
				isPlainObject(raw) &&
				typeof raw.version === "number" &&
				raw.version > STATE_VERSION
			) {
				readOnly = true;
				problems.push(
					`状态文件版本 ${raw.version} 高于当前支持的 ${STATE_VERSION}, 以只读方式运行`
				);
			}
			state = sanitize(raw);
		}
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
			problems.push(`读取状态文件失败: ${(err as Error).message}`);
		}
	}

	return {
		file,
		problems,
		get readOnly() {
			return readOnly;
		},
		get: (): MockState => state,
		update: (mutate: (draft: MockState) => void): MockState => {
			const draft = structuredClone(state) as MockState;
			mutate(draft);
			const next = sanitize(draft);
			if (!readOnly) {
				writeJsonAtomic(file, next);
			}
			state = next;
			if (hooks.onChange) hooks.onChange(state);
			return state;
		},
	};
};
