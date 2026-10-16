// 管理页脚本场景: 把场景 JSON 中的 script 源码编译成处理函数
import path from "path";
import vm from "vm";
import { createRequire } from "module";

export const SCRIPT_LIMIT = 100 * 1024;

/**
 * 源码的最后一条语句是一个函数表达式, 写法同 mock 文件中的场景函数, 如 (req, res) => ({ id: req.params.id });
 * 前面可以有注释与辅助声明. 在宿主进程中执行, require 的相对路径按 mock 目录 folder 解析; file 只用于报错位置.
 * 语法错误或结果不是函数时抛错. onRequire 在脚本运行时每次 require 后收到解析出的路径, 供热更新追踪依赖.
 */
export const compileScript = (source: string, folder: string, file: string, onRequire?: (resolved: string) => void): Function => {
	const body = String(source);
	if (!body.trim()) { throw new TypeError("脚本不能为空"); }
	// 直接 eval 取最后一条语句的值, 末尾分号, 注释与前置声明都不影响; 改成拼进 return (...) 会让这些写法报语法错误
	const wrapper = vm.runInThisContext("(function (require, __filename, __dirname, __source) { return eval(__source); })", { filename: file });
	const base = createRequire(path.join(folder, "__script__.js"));
	const req = Object.assign((id: string) => {
		const mod = base(id);
		if (onRequire) { try { onRequire(base.resolve(id)); } catch (_error) { /* 解析失败时 base(id) 已抛错 */ } }
		return mod;
	}, { resolve: base.resolve, cache: base.cache });
	const fn = wrapper(req, file, folder, body);
	if (typeof fn !== "function") { throw new TypeError("脚本必须是一个函数, 如 (req, res) => ({ ok: true })"); }
	return fn;
};
