// 路由 key 解析与路径编译, 语法与结果同 express 4 路由(path-to-regexp@0.1.13)

export type RouteParamKey = { name: string | number; optional: boolean; offset: number };
export type CompiledRoute = { re: RegExp; keys: RouteParamKey[] };
export type ParsedKey = { methods: string[]; weight: number; path: string };

/*
 * 路由编译: 内联 path-to-regexp@0.1.13 的字符串分支(express@4.22 实际使用的版本).
 * 来源 https://github.com/pillarjs/path-to-regexp/blob/v0.1.13/index.js, MIT License, Copyright (c) 2014 Blake Embrey.
 * 选项同 express 4 路由: 不区分大小写, 末尾斜杠可选, 整段匹配; 与宿主 express 版本脱钩, 同样写法与 express 4 结果一致.
 * 0.1.13 自身无法编译的写法(如命名分组)同样抛错, 由调用方记为 invalid-route.
 */
export const compileRoute = (route: string): CompiledRoute => {
	const raw = String(route);
	const keys: RouteParamKey[] = [];
	let extraOffset = 0;
	let i = 0;
	let name = 0;
	let pos = 0;
	let backtrack = "";
	let m: RegExpExecArray | null;
	let src = raw.replace(
		/\\.|(\/)?(\.)?:(\w+)(\(.*?\))?(\*)?(\?)?|[.*]|\/\(/g,
		(
			match: string,
			slash: string | undefined,
			format: string | undefined,
			key: string,
			capture: string | undefined,
			star: string | undefined,
			optional: string | undefined,
			offset: number
		) => {
			if (match[0] === "\\") {
				backtrack += match;
				pos += 2;
				return match;
			}
			if (match === ".") {
				backtrack += "\\.";
				extraOffset += 1;
				pos += 1;
				return "\\.";
			}
			backtrack = slash || format ? "" : backtrack + raw.slice(pos, offset);
			pos = offset + match.length;
			if (match === "*") {
				backtrack = "";
				extraOffset += 3;
				return "(.*)";
			}
			if (match === "/(") {
				backtrack += "/";
				extraOffset += 2;
				return "/(?:";
			}
			const sl = slash || "";
			const fmt = format ? "\\." : "";
			const opt = optional || "";
			const cap = capture
				? capture.replace(/\\.|\*/, c => (c === "*" ? "(.*)" : c))
				: backtrack
					? `((?:(?!/|${backtrack}).)+?)`
					: `([^/${fmt}]+?)`;
			keys.push({ name: key, optional: !!optional, offset: offset + extraOffset });
			const result = `(?:${fmt}${sl}${cap}${star ? `((?:[/${fmt}].+?)?)` : ""})${opt}`;
			backtrack = "";
			extraOffset += result.length - match.length;
			return result;
		}
	);
	const group = /\\.|\((?:\?<(.*?)>)?(?!\?)/g; // 补登匿名分组, 按位置插入 keys
	while ((m = group.exec(src))) {
		if (m[0][0] === "\\") {
			continue;
		}
		if (i === keys.length || keys[i].offset > m.index) {
			keys.splice(i, 0, { name: name++, optional: false, offset: m.index });
		}
		i++;
	}
	src += src[src.length - 1] === "/" ? "?" : "/?";
	return { keys, re: new RegExp(`^${src}$`, "i") };
};

/** 参数解码失败, 同 express 4 以 400 结束请求 */
export class ParamError extends Error {
	status = 400;
}

/** 同 express 4 的 decode_param: 空串与 undefined 原样返回, 解码失败抛 ParamError */
export const decode = (val: string | undefined) => {
	if (typeof val !== "string" || val.length === 0) {
		return val;
	}
	try {
		return decodeURIComponent(val);
	} catch {
		throw new ParamError(`Failed to decode param '${val}'`);
	}
};

/** 只匹配不解码, 供同步查找路由 */
export const matchRoute = (compiled: CompiledRoute, pathname: string) => compiled.re.exec(pathname);

/** 同 express 4 Layer.match 的参数写入规则: 后出现的 undefined 不覆盖已有值; 解码失败抛 ParamError */
export const paramsOf = (compiled: CompiledRoute, data: RegExpExecArray) => {
	const params: Record<string, string | undefined> = {};
	compiled.keys.forEach((k, i) => {
		const val = decode(data[i + 1]);
		if (val !== undefined || !Object.prototype.hasOwnProperty.call(params, k.name)) {
			params[k.name] = val;
		}
	});
	return params;
};

export const execRoute = (
	compiled: CompiledRoute,
	pathname: string
): Record<string, string | undefined> | null => {
	const data = matchRoute(compiled, pathname);
	return data ? paramsOf(compiled, data) : null;
};

/** 解析 `METHOD[|METHOD][:权重] /路由`; METHOD 写作 ALL 或 METHOD 时匹配任意方法. */
export const parseKey = (key: string): ParsedKey | null => {
	const [, protocols, path] = /^(\S+)\s+(\S.*)$/.exec(String(key).trim()) || [];
	if (!protocols || !path || !path.startsWith("/")) {
		return null;
	}
	const [protocol, weight] = protocols.split(":");
	const methods = protocol
		.toUpperCase()
		.split("|")
		.filter(Boolean)
		.map(m => (m === "METHOD" ? "ALL" : m));
	if (!methods.length || methods.some(m => !/^[A-Z]+$/.test(m))) {
		return null;
	}
	return { methods: [...new Set(methods)], weight: Number(weight) || 0, path: path.trim() };
};

/** 拆出请求目标的路径与查询串; 不经 new URL, 以免 //a/b 被当成主机名, 畸形路径抛错. */
export const splitUrl = (raw: string) => {
	const s = String(raw || "/")
		.replace(/#.*$/s, "")
		.replace(/^[a-z][a-z\d+.-]*:\/\/[^/?]*/i, "");
	const i = s.indexOf("?");
	return {
		pathname: (i < 0 ? s : s.slice(0, i)) || "/",
		searchParams: new URLSearchParams(i < 0 ? "" : s.slice(i + 1)),
	};
};

export const routeIdOf = (key: string) => Buffer.from(key, "utf8").toString("base64url");

export const keyOfRouteId = (id: string) => Buffer.from(String(id), "base64url").toString("utf8");
