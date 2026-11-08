#!/usr/bin/env node
/**
 * 从 package.json 的 contributes.configuration 生成 src/generated/configDefaults.ts,
 * 作为运行时 (`src/config.ts` 的 get() fallback 等) 引用的默认值模块。
 *
 * 默认值的唯一事实来源是 package.json; 本脚本只派生, 生成物不是独立事实来源:
 * - 修改配置默认值后运行 `npm run gen:config` 重新生成;
 * - 漂移由 devkit/check-extra.mjs 在 `npm run check` 中以 `--check` 模式校验;
 * - NEVER 手工编辑生成物。
 *
 * 用法: node scripts/gen-config-defaults.mjs [--check]
 *   --check  不写文件, 生成结果与磁盘上的生成物不一致时报错退出。
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const outputPath = join(root, "src/generated/configDefaults.ts");
const prefix = "easy-graph.";

const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const properties = manifest.contributes?.configuration?.properties ?? {};
if (Object.keys(properties).length === 0) {
	console.error("package.json 的 contributes.configuration.properties 为空, 中止生成");
	process.exit(1);
}

// 门禁 checkConfigDefaults 已保证每个配置项都有 default; 这里遇到缺失直接失败, 不派生半份数据。
const defaults = {};
for (const [key, prop] of Object.entries(properties)) {
	if (!key.startsWith(prefix)) {
		console.error(`配置项 ${key} 缺少 "${prefix}" 前缀, 中止生成`);
		process.exit(1);
	}
	if (!Object.hasOwn(prop, "default")) {
		console.error(`配置项 ${key} 缺少 default, 中止生成`);
		process.exit(1);
	}
	defaults[key.slice(prefix.length)] = prop.default;
}

const banner = [
	"// 由 scripts/gen-config-defaults.mjs 从 package.json 的 contributes.configuration 生成, DO NOT EDIT.",
	"// 默认值的唯一事实来源是 package.json: 修改配置后运行 `npm run gen:config` 重新生成,",
	"// 漂移由 devkit/check-extra.mjs 在 `npm run check` 中校验。",
].join("\n");
const body = `export const configDefaults = ${JSON.stringify(defaults, null, "\t")};\n`;
const content = `${banner}\n\n${body}`;

if (process.argv.includes("--check")) {
	if (!existsSync(outputPath) || readFileSync(outputPath, "utf8") !== content) {
		console.error(
			"src/generated/configDefaults.ts 与 package.json 派生结果不一致, 请运行 `npm run gen:config` 重新生成"
		);
		process.exit(1);
	}
	console.log("ok  configDefaults 生成物未漂移");
	process.exit(0);
}

writeFileSync(outputPath, content);
console.log(`生成 ${outputPath} (${Object.keys(defaults).length} 个配置项)`);
