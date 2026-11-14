/**
 * 清单与本地化的一致性检查。
 *
 * 这些漏了都不会让构建失败, 只会静默丢文案或让设置界面对不上实现, 所以必须有独立的门。
 * 每个函数返回问题描述数组, 空数组表示通过。
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const readJson = path => JSON.parse(readFileSync(path, "utf8"));

/**
 * 递归收集某目录下的 TypeScript 源文件。
 *
 * 必须同时收 `.tsx`: 只收 `.ts` 时, 用 JSX 写 webview 的仓库整棵组件树都不参与扫描,
 * 漏掉的文案不会报错, 只会在中文界面里静默回退成英文。
 */
function collectSourceFiles(dir) {
	const found = [];
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) found.push(...collectSourceFiles(path));
		else if (name.endsWith(".ts") || name.endsWith(".tsx")) found.push(path);
	}
	return found;
}

/**
 * `package.nls.json` 与 `package.nls.zh-cn.json` 的 key 集必须相同,
 * 且与 `package.json` 里用到的 `%...%` 占位符一一对应。
 *
 * 双向断言: 缺 key 会让界面显示成 `%config.foo%`, 多 key 是无人使用的死文案。
 */
export function checkNlsParity(root) {
	const problems = [];
	const en = Object.keys(readJson(join(root, "package.nls.json"))).sort();
	const zh = Object.keys(readJson(join(root, "package.nls.zh-cn.json"))).sort();
	const manifest = readFileSync(join(root, "package.json"), "utf8");
	const used = [...new Set([...manifest.matchAll(/%([\w.-]+)%/g)].map(m => m[1]))].sort();

	const diff = (a, b) => a.filter(key => !b.includes(key));

	for (const key of diff(en, zh)) problems.push(`package.nls.zh-cn.json 缺少 key: ${key}`);
	for (const key of diff(zh, en)) problems.push(`package.nls.json 缺少 key: ${key}`);
	for (const key of diff(used, en)) {
		problems.push(`清单用到但 package.nls 未定义的占位符: %${key}%`);
	}
	for (const key of diff(en, used)) problems.push(`package.nls 定义了但清单未使用的 key: ${key}`);

	return problems;
}

/** `l10n/` 下所有 bundle 的 key 集必须一致, 否则某个语言会缺文案。 */
export function checkL10nBundleParity(root, l10nDir = "l10n") {
	const problems = [];
	const dir = join(root, l10nDir);
	// 没有运行时文案的扩展(例如纯主题)不需要 l10n 目录。
	if (!existsSync(dir)) return problems;
	const bundles = readdirSync(dir).filter(name => /^bundle\.l10n\..*json$/.test(name));
	if (bundles.length < 2) return problems;

	const [first, ...rest] = bundles;
	const baseline = Object.keys(readJson(join(dir, first))).sort();
	for (const name of rest) {
		const keys = Object.keys(readJson(join(dir, name))).sort();
		for (const key of baseline.filter(k => !keys.includes(k))) {
			problems.push(`${l10nDir}/${name} 缺少 key: ${key}`);
		}
		for (const key of keys.filter(k => !baseline.includes(k))) {
			problems.push(`${l10nDir}/${first} 缺少 key: ${key}`);
		}
	}
	return problems;
}

/**
 * `contributes.configuration` 的默认值自洽检查。编号即稳定地址, 废弃时保留编号不复用:
 * 1. 每个配置项 MUST 声明 `default`, 且 `default` 必须是合法 JSON Schema default (占位符
 *    字符串 `%...%` 视为未声明), 其类型与声明的 `type` 一致 —— 设置界面按 `type` 渲染控件,
 *    运行时按实际值生效, 错位时两边各读各的且不报错。用户未设置时行为依赖该值, 用 `{}` / `[]` 占位而实际
 *    另有非空默认值的设置, Settings UI 会显示错误的信息, 且运行时与 schema 静默漂移。
 * 2. `type: "object"` 的配置 MUST 声明 `additionalProperties` (boolean 或子 schema);
 *    缺了它 VS Code 会拒绝该设置写入 `settings.json`。
 * 3. object 配置同时声明 nested `properties` 时, 父对象 `default` 必须是普通对象 (`null` 也
 *    承载不了 nested 默认值), MUST 覆盖全部 nested 键,
 *    且每个 nested 子键的 `default` 与父对象 `default` 中的对应值深度相等。VS Code 不会为
 *    含嵌套对象或 nullable 值的 object 渲染子项默认值, 父 default 是唯一可见的默认值来源。
 * 4. `defaultSnippets` 中 body 覆盖全部 nested 键 (即"写出全部默认值"的全量 snippet) 时,
 *    其 body MUST 与父对象 `default` 深度相等。全量 snippet 复制默认值, 会形成第二来源,
 *    两处不一致时用户从 snippet 写出的值与实际默认行为不同。
 *
 * 兼容用的覆盖容器例外: `default: {}` 但说明中明确标注只是"无覆盖"状态的 open object
 * (additionalProperties 为 true 或子 schema 且无 nested properties) 不算违规 —— 空对象
 * 就是它的实际默认值。这类容器的判定靠"无 nested properties", 因此不需要人工白名单。
 *
 * `markdownDescription` / `description` / `docs/` 是否复述默认值不在本函数判定:
 * 文案与文档的归口是 `../readme-rule.md` 的「内容不重复」, 抄了不会报错, 也不会有第二
 * 个可执行的门; 这里只管 schema 自身的一致性。
 *
 * 可复制修复的问题见 `fixConfigDefaults`。
 */
export function checkConfigDefaults(root) {
	const manifest = readJson(join(root, "package.json"));
	return analyzeConfigDefaults(manifest).map(issue => issue.message);
}

/** JSON 值的类型名, 供诊断信息与 type 对照使用; 整数单列为 integer, schema 两者是不同 type。 */
const jsonType = value => {
	if (value === null) return "null";
	if (Array.isArray(value)) return "array";
	if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
	return typeof value;
};

/** default 值是否符合 schema 的 `type` (可为字符串或数组); integer 是 number 的合法取值。 */
function matchesSchemaType(value, type) {
	const actual = jsonType(value);
	return (Array.isArray(type) ? type : [type]).some(expected =>
		expected === "number" ? actual === "number" || actual === "integer" : actual === expected
	);
}

/** 键序无关的深相等; JSON.stringify 依赖键序, 会把键序不同值相同的对象误判成不一致。 */
function deepEqual(a, b) {
	if (a === b) return true;
	const type = jsonType(a);
	if (type !== jsonType(b)) return false;
	if (type === "array") return a.length === b.length && a.every((value, index) => deepEqual(value, b[index]));
	if (type !== "object") return false;
	const keys = Object.keys(a);
	return keys.length === Object.keys(b).length &&
		keys.every(key => Object.hasOwn(b, key) && deepEqual(a[key], b[key]));
}

/**
 * 收集配置默认值问题, 供检查与修复共用。每个问题形如 `{ message, fix }`:
 *
 * - `fix` 为 null 表示只能人工改代码: 实际默认值只存在于运行时代码里 (完全缺 default,
 *   父 default 含 schema 未声明的键), 或补什么值是语义取舍 (additionalProperties 的
 *   true / false / 子 schema, default 与 type 的错位)。
 * - `fix` 非空表示两边值都已在 package.json 里, 只差复制; 修复方向以父对象 `default`
 *   为准 —— 它是 Settings UI 唯一渲染的默认值来源 (见 checkConfigDefaults 头注释第 3 条)。
 */
function analyzeConfigDefaults(manifest) {
	const issues = [];
	const configurations = manifest.contributes?.configuration ?? [];
	const entries = Array.isArray(configurations) ? configurations : [configurations];

	const isPlaceholder = value => typeof value === "string" && /^%.+%$/.test(value);
	const hasDefault = (key, prop) => {
		if (!("default" in prop) || isPlaceholder(prop.default)) {
			issues.push({ message: `${key} 缺少 default`, fix: null });
			return false;
		}
		return true;
	};

	for (const configuration of entries) {
		for (const [key, prop] of Object.entries(configuration.properties ?? {})) {
			if (!hasDefault(key, prop)) continue;

			if (prop.type === "object") {
				if (!("additionalProperties" in prop)) {
					issues.push({ message: `${key} 是 object 配置但缺少 additionalProperties`, fix: null });
				}
				const parent = prop.default;
				// null 或标量承载不了 nested 默认值, 下面的对比会直接抛 TypeError; 报出可定位的
				// 诊断后跳过对比, 类型错位已由这条消息覆盖, 不再走通用 type 对照。
				if (typeof parent !== "object" || parent === null || Array.isArray(parent)) {
					issues.push({
						message: `${key} 是 object 配置但 default 不是普通对象 (${jsonType(parent)})`,
						fix: null,
					});
					continue;
				}
				const nested = prop.properties;
				if (!nested) continue;

				for (const [name, child] of Object.entries(nested)) {
					if (!("default" in child)) {
						issues.push({ message: `${key}.properties.${name} 缺少 default`, fix: null });
					}
				}
				// 父 default 只覆盖部分 nested 键时, 缺的键既出现在设置界面又无默认值,
				// 与第 3 条是同一类静默漂移, 一并报出。
				for (const name of Object.keys(nested)) {
					if (!Object.hasOwn(parent, name)) {
						// 子键自己声明了 default 时两边值都已在清单里, 补进父 default 即可对齐。
						const fix =
							nested[name] && "default" in nested[name]
								? { kind: "parent-add", key, name }
								: null;
						issues.push({ message: `${key} 的 default 缺少 nested 键: ${name}`, fix });
					} else if (nested[name] && "default" in nested[name]) {
						if (!deepEqual(nested[name].default, parent[name])) {
							issues.push({
								message: `${key} 的 nested default 与父 default 不一致: ${name}`,
								fix: { kind: "nested-sync", key, name },
							});
						}
					}
				}
				for (const name of Object.keys(parent)) {
					if (!Object.hasOwn(nested, name)) {
						issues.push({ message: `${key} 的 default 含有 schema 未声明的键: ${name}`, fix: null });
					}
				}

				for (const [index, snippet] of (prop.defaultSnippets ?? []).entries()) {
					const body = snippet.body;
					if (!body || typeof body !== "object") continue;
					const nestedKeys = Object.keys(nested);
					const bodyKeys = Object.keys(body);
					const coversAll = nestedKeys.every(k => bodyKeys.includes(k));
					if (!coversAll) continue;
					if (!deepEqual(body, parent)) {
						issues.push({
							message: `${key} 的全量 defaultSnippets[${index}] 与 default 不一致`,
							fix: { kind: "snippet-sync", key, index },
						});
					}
				}
				continue;
			}

			// default 的类型与 schema 的 type 一致: 错位 (例: type: "boolean" 配 default: "true")
			// 时设置界面与运行时各读各的, 不报错也不可见, 所以按 JSON 值的实际类型对照校验。
			if (prop.type && !matchesSchemaType(prop.default, prop.type)) {
				issues.push({
					message: `${key} 的 default 类型与声明的 type ${JSON.stringify(prop.type)} 不一致: 实际是 ${jsonType(prop.default)}`,
					fix: null,
				});
			}
		}
	}
	return issues;
}

/**
 * 把 `analyzeConfigDefaults` 判定可复制的问题直接修好, 返回已修复的问题描述列表;
 * 剩余只能人工改代码的问题留给 `checkConfigDefaults` 报出。
 *
 * 先补父 default 再同步 nested 与 snippet, 且至少修一处就重跑分析直到收敛: 全量
 * snippet 的 body 复制的是当时的父 default, 父 default 自身还缺键时先同步会把缺键
 * 状态写进 body。轮数上限只是防御, 每个修复在下一轮分析里必然消失。
 */
export function fixConfigDefaults(root) {
	const path = join(root, "package.json");
	const raw = readFileSync(path, "utf8");
	const manifest = JSON.parse(raw);
	const configurations = manifest.contributes?.configuration ?? [];
	const entries = Array.isArray(configurations) ? configurations : [configurations];
	const findProp = key =>
		entries.map(entry => entry.properties ?? {}).find(properties => key in properties)?.[key];

	const applied = [];
	for (let round = 0; round < 8; round++) {
		const fixable = analyzeConfigDefaults(manifest).filter(issue => issue.fix);
		if (fixable.length === 0) break;
		for (const { message, fix } of fixable) {
			// 同一配置项可能同时命中多类修复, 每次都按键重新定位, 不缓存上一轮的引用。
			const prop = findProp(fix.key);
			if (fix.kind === "parent-add") {
				prop.default[fix.name] = structuredClone(prop.properties[fix.name].default);
			} else if (fix.kind === "nested-sync") {
				prop.properties[fix.name].default = structuredClone(prop.default[fix.name]);
			} else {
				prop.defaultSnippets[fix.index].body = structuredClone(prop.default);
			}
			applied.push(message);
		}
	}
	if (applied.length > 0) {
		// 缩进按原文件探测, 避免 JSON.stringify 默认两空格把整份清单重排污染 diff。
		const space = raw.includes("\n") ? raw.match(/\n([ \t]+)/)?.[1] ?? "\t" : undefined;
		writeFileSync(path, JSON.stringify(manifest, null, space) + (raw.endsWith("\n") ? "\n" : ""));
	}
	return applied;
}

/**
 * `src/` 里内联的 `l10n.t('字面量')` 必须都在中文 bundle 里有对应条目。
 *
 * `vscode.l10n.t` 的 key 就是源码里的英文原文, 所以英语 bundle 是恒等映射, 不需要存在;
 * 中文 bundle 缺条目则会静默回退成英文。字符串表集中声明的仓库 (没有内联字面量) 自动跳过,
 * 由该仓库自己的生成物漂移检查覆盖。
 */
export function checkInlineRuntimeStrings(root, l10nDir = "l10n") {
	const inline = new Set();
	// 没有运行时代码的扩展(例如纯主题)不需要 src 目录。
	if (!existsSync(join(root, "src"))) return [];
	for (const file of collectSourceFiles(join(root, "src"))) {
		// 注释里的 l10n.t 示例(例: JSDoc 写 `vscode.l10n.t` 会被当成标签模板)会造出假问题, 扫描前先剥掉;
		// 行注释要求 `//` 前不是 `:`, 避免吞掉字符串里的 `https://...` 及其后同一行的真实代码。
		const source = readFileSync(file, "utf8")
			.replace(/\/\*[\s\S]*?\*\//g, " ")
			.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
		for (const match of source.matchAll(/l10n\.t\(\s*'((?:[^'\\]|\\.)*)'/g)) {
			inline.add(match[1]);
		}
		for (const match of source.matchAll(/l10n\.t\(\s*"((?:[^"\\]|\\.)*)"/g)) {
			inline.add(match[1]);
		}
		// 反引号同样是合法写法, 格式化工具也常把引号统一成它。带 `${}` 的模板不收 —— 那种 key
		// 运行时才拼得出来, 本就无法静态对到 bundle 条目, 收进来只会造出必然失败的假问题。
		for (const match of source.matchAll(/l10n\.t\(\s*`((?:[^`\\]|\\.)*)`/g)) {
			if (!match[1].includes("${")) inline.add(match[1]);
		}
		// 标签模板形态 l10n.t`...` 与调用形态等价, 漏收会让这类文案绕过 bundle 对齐门禁;
		// 与上面带括号的写法不重叠 (那个要求 t 后紧跟 `(`)。
		for (const match of source.matchAll(/l10n\.t\s*`((?:[^`\\]|\\.)*)`/g)) {
			if (!match[1].includes("${")) inline.add(match[1]);
		}
	}
	if (inline.size === 0) return [];

	const bundlePath = join(root, l10nDir, "bundle.l10n.zh-cn.json");
	const bundle = readJson(bundlePath);
	const problems = [];
	for (const key of [...inline].sort()) {
		if (!(key in bundle)) {
			problems.push(`${l10nDir}/bundle.l10n.zh-cn.json 缺少运行时文案: ${key}`);
		}
	}
	for (const key of Object.keys(bundle).sort()) {
		if (!inline.has(key)) {
			problems.push(`${l10nDir}/bundle.l10n.zh-cn.json 存在无人使用的条目: ${key}`);
		}
	}
	return problems;
}