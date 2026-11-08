/**
 * 本插件专属门禁, 由 scripts/check.mjs 在通用检查之后执行。
 *
 * 默认导出返回 `{ 标签: () => string[] }`: 返回的问题列表为空表示通过, 非空由 check.mjs 汇总失败。
 *
 * 检查项:
 * 1. 配置默认值生成物 (src/generated/configDefaults.ts) 未从 package.json 漂移。
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";

export default function checks(root) {
	return {
		配置默认值生成物未漂移: () => {
			try {
				execFileSync(
					process.execPath,
					[join(root, "scripts/gen-config-defaults.mjs"), "--check"],
					{ cwd: root, stdio: "pipe" }
				);
				return [];
			} catch (error) {
				// 生成脚本的诊断写在 stdout/stderr 里, 补进问题列表; 两者都为空时退回 error.message。
				const detail = [error.stdout, error.stderr]
					.map(chunk => (chunk ? chunk.toString().trim() : ""))
					.filter(chunk => chunk && !error.message.includes(chunk))
					.join("\n");
				return [detail || error.message];
			}
		},
	};
}
