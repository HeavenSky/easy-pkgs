/**
 * 从清单推导 VSIX 应当包含的完整文件清单。
 *
 * 用**允许清单**而不是禁止清单: 禁止清单只能拦住预料到的路径, 任何新出现的生成目录都会
 * 静默混进包里。清单从 `package.json` 与仓库里实际存在的文件推导, 所以加一个贡献点不需要
 * 同时改这里 —— 除了确实引入了新的产物类别 (例如视图容器图标) 的情况。
 *
 * 本模块是纯函数: 目录内容由调用方读好传进来, 便于单测用假清单断言推导规则。
 *
 * 偏离骨架 (easy-graph): 视图容器图标与命令图标可以是 `$(codicon)` 引用而不是文件, 这类引用不进
 * 允许清单; 命令图标 (`contributes.commands[].icon`, 可按明暗主题各给一份) 按文件推导。
 */

const strip = path => path.replace(/^\.\//, "");

/** vsce 会把这几个文档重命名后再放进包里, 因此按打包后的实际名字断言。 */
const RENAMED = { "README.md": "readme.md", "CHANGELOG.md": "changelog.md" };

const DOCS = ["LICENSE.txt", "README.md", "CHANGELOG.md"];

const NLS = ["package.nls.json", "package.nls.zh-cn.json"];

/**
 * @param {object} input               - 推导所需的输入
 * @param {object} input.pkg           - 解析后的 package.json
 * @param {string[]} input.rootEntries  - 仓库根目录下的文件名
 * @param {string[]} input.l10nEntries  - `pkg.l10n` 目录下的文件路径, 相对该目录且**含子目录**
 *                                      (例如 `bundle.l10n.zh-cn.json`, `yaml-server/bundle.l10n.json`);
 *                                      无 `pkg.l10n` 时传空数组
 * @param {string[]} [input.outEntries] - `pkg.main` 所在目录下的文件名; 用于放行与 bundle 并列的
 *                                      WebAssembly 产物。省略时按空数组处理。
 * @returns {Set<string>} VSIX 内应当存在的条目 (相对 `extension/`)
 */
export default function deriveAllowlist({ pkg, rootEntries, l10nEntries, outEntries = [] }) {
	const allowed = new Set(["package.json"]);

	// 纯主题扩展没有运行时入口, `main` 可以不存在。
	if (pkg.main) allowed.add(strip(pkg.main));
	if (pkg.browser) allowed.add(strip(pkg.browser));
	if (pkg.icon) allowed.add(strip(pkg.icon));

	// 与 bundle 并列的 `.wasm`: 由 Rust/Go 等编译而来的语言服务器无法被 esbuild 内联,
	// 只能作为独立产物随包分发。限定在入口所在目录且只认 `.wasm`, 其它新出现的生成物
	// 仍然会被允许清单拦下。
	if (pkg.main) {
		const outDir = strip(pkg.main).split("/").slice(0, -1).join("/");
		for (const name of outEntries) {
			if (name.endsWith(".wasm")) allowed.add(outDir ? `${outDir}/${name}` : name);
		}
	}

	if (pkg.l10n) {
		const dir = strip(pkg.l10n);
		for (const name of l10nEntries) allowed.add(`${dir}/${name}`);
	}

	// 活动栏等视图容器各有自己的图标, 且与 `pkg.icon` (市场图标) 是不同的产物。
	const isFile = icon => typeof icon === "string" && !icon.startsWith("$(");
	for (const containers of Object.values(pkg.contributes?.viewsContainers ?? {})) {
		for (const container of containers) {
			if (isFile(container.icon)) allowed.add(strip(container.icon));
		}
	}
	for (const command of pkg.contributes?.commands ?? []) {
		const icons =
			typeof command.icon === "object" ? Object.values(command.icon ?? {}) : [command.icon];
		for (const icon of icons) {
			if (isFile(icon)) allowed.add(strip(icon));
		}
	}

	// 语言类贡献点各自引用磁盘上的文件, 且都是运行时必需的 —— 少一个不会构建失败,
	// 只会让高亮或括号行为在装上之后静默失效。
	const contributes = pkg.contributes ?? {};
	for (const language of contributes.languages ?? []) {
		if (language.configuration) allowed.add(strip(language.configuration));
		// 文件图标可以按明暗主题各给一份。
		for (const variant of Object.values(language.icon ?? {})) {
			if (typeof variant === "string") allowed.add(strip(variant));
		}
	}
	for (const grammar of contributes.grammars ?? []) {
		if (grammar.path) allowed.add(strip(grammar.path));
	}
	for (const snippet of contributes.snippets ?? []) {
		if (snippet.path) allowed.add(strip(snippet.path));
	}
	for (const theme of [
		...(contributes.themes ?? []),
		...(contributes.iconThemes ?? []),
		...(contributes.productIconThemes ?? []),
	]) {
		if (theme.path) allowed.add(strip(theme.path));
	}

	// Markdown 预览的脚本与样式在预览打开时按路径加载, 漏打包只会让预览静默缺功能。
	// 脚本项可以是字符串或 `{ path, type }`。
	for (const script of contributes["markdown.previewScripts"] ?? []) {
		const path = typeof script === "string" ? script : script?.path;
		if (path) allowed.add(strip(path));
	}
	for (const style of contributes["markdown.previewStyles"] ?? []) {
		if (typeof style === "string") allowed.add(strip(style));
	}

	for (const name of NLS) {
		if (rootEntries.includes(name)) allowed.add(name);
	}

	for (const name of DOCS) {
		if (rootEntries.includes(name)) allowed.add(RENAMED[name] ?? name);
	}

	// README 的其它语言版本保留原名, 例如 README.zh-cn.md。
	for (const name of rootEntries) {
		if (/^README\..+\.md$/.test(name) && name !== "README.md") allowed.add(name);
	}

	return allowed;
}
