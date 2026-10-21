// 请求忽略规则: 命中的请求不进请求日志, 也不打印终端日志; 不影响路由匹配与响应

/** 内置规则: 浏览器自动探测与 dev server 内部请求; 不含 /manifest.json, /sw.js 等可能是业务资源的路径 */
export const DEFAULT_IGNORE: ReadonlyArray<{ pattern: string; reason: string }> = [
	{
		pattern: "/.well-known/**",
		reason: "浏览器与 DevTools 探测(如 Chrome DevTools 的 com.chrome.devtools.json)",
	},
	{ pattern: "/favicon.ico", reason: "浏览器站点图标" },
	{ pattern: "/apple-touch-icon*.png", reason: "iOS / Safari 主屏图标" },
	{ pattern: "/robots.txt", reason: "爬虫协议" },
	{ pattern: "/browserconfig.xml", reason: "IE / Edge 磁贴配置" },
	{ pattern: "/crossdomain.xml", reason: "Flash 跨域策略探测" },
	{ pattern: "/sitemap.xml", reason: "站点地图探测" },
	{ pattern: "/__webpack_hmr", reason: "webpack-hot-middleware 热更新" },
	{ pattern: "/sockjs-node/**", reason: "webpack-dev-server 3 热更新" },
	{ pattern: "/ws", reason: "webpack-dev-server 4+ 热更新" },
	{ pattern: "/@vite/**", reason: "vite 客户端" },
	{ pattern: "/@fs/**", reason: "vite 文件服务" },
	{ pattern: "/@id/**", reason: "vite 模块解析" },
	{ pattern: "/@react-refresh", reason: "vite React 热更新" },
	{ pattern: "/node_modules/.vite/**", reason: "vite 预构建依赖" },
	{ pattern: "**/*.hot-update.json", reason: "webpack 热更新清单" },
	{ pattern: "**/*.hot-update.js", reason: "webpack 热更新模块" },
	{ pattern: "/__mock/**", reason: "easy-mok 管理页自身" },
];

export type IgnoreRule = { pattern: string; method: string[] | null; re: RegExp };

/**
 * 编译一条规则: 可选方法前缀(`GET /x`, `GET|POST /x`), 路径以 / 或 ** 开头;
 * `*` 匹配单段内任意字符, `**` 跨段(`/a/**` 也匹配 `/a`, `**\/x` 也匹配 `/x`), 不区分大小写, 匹配不含查询串的路径
 */
export const compileIgnore = (pattern: string): IgnoreRule => {
	const text = String(pattern || "").trim();
	const m = /^(?:([A-Za-z]+(?:\|[A-Za-z]+)*)\s+)?(\S+)$/.exec(text);
	if (!m) {
		throw new Error("格式应为 [方法 ]路径, 如 /a/** 或 GET /a/*");
	}
	const [, methods, glob] = m;
	if (!glob.startsWith("/") && !glob.startsWith("**")) {
		throw new Error("路径必须以 / 或 ** 开头");
	}
	if (/\*{3,}/.test(glob)) {
		throw new Error("不支持连续三个以上的 *");
	}
	let src = "";
	for (let i = 0; i < glob.length;) {
		if (glob.startsWith("/**", i) && i + 3 === glob.length) {
			src += "(?:/.*)?";
			i += 3;
			continue;
		} // 末尾 /** 含目录自身
		if (glob.startsWith("**/", i)) {
			src += "(?:.*/)?";
			i += 3;
			continue;
		}
		if (glob.startsWith("**", i)) {
			src += ".*";
			i += 2;
			continue;
		}
		if (glob[i] === "*") {
			src += "[^/]*";
			i += 1;
			continue;
		}
		src += glob[i].replace(/[.+?^${}()|[\]\\]/g, "\\$&");
		i += 1;
	}
	if (glob.startsWith("**")) {
		src = `/?${src}`;
	} // ** 开头时路径首个 / 归入通配
	return {
		pattern: text,
		method: methods ? methods.toUpperCase().split("|") : null,
		re: new RegExp(`^${src}$`, "i"),
	};
};

/** 校验一组规则, 返回第一个错误; 用于管理接口与选项 */
export const validateIgnore = (patterns: unknown[]) =>
	patterns
		.map((p, index) => {
			if (typeof p !== "string" || !p.trim()) {
				return { index, pattern: String(p), error: "规则不能为空" };
			}
			if (p.length > 300) {
				return { index, pattern: p, error: "规则过长" };
			}
			try {
				compileIgnore(p);
				return null;
			} catch (err) {
				return { index, pattern: p, error: (err as Error).message };
			}
		})
		.filter(Boolean) as Array<{ index: number; pattern: string; error: string }>;

export type IgnoreState = { defaults: boolean; disabled: string[]; custom: string[] };

/**
 * 当前生效的规则: 内置(总开关开且未逐条停用) + 选项 ignore + 管理页自定义.
 * 编译结果按状态对象缓存, 状态不变时不重复编译.
 */
export const createIgnore = (opt: {
	defaults: boolean;
	extra: string[];
	state: () => IgnoreState;
}) => {
	const extra = opt.extra.flatMap(p => {
		try {
			return [compileIgnore(p)];
		} catch (err) {
			console.warn(`[easy-mok] 忽略规则无效, 已跳过: ${p} (${(err as Error).message})`);
			return [];
		}
	});
	const builtin = DEFAULT_IGNORE.map(r => compileIgnore(r.pattern));
	let cacheKey: IgnoreState | null = null;
	let rules: IgnoreRule[] = [];
	const current = () => {
		const s = opt.state();
		if (s !== cacheKey) {
			cacheKey = s;
			const off = new Set(s.disabled);
			rules = [
				...(opt.defaults && s.defaults ? builtin.filter(r => !off.has(r.pattern)) : []),
				...extra,
				...s.custom.flatMap(p => {
					try {
						return [compileIgnore(p)];
					} catch {
						return [];
					}
				}),
			];
		}
		return rules;
	};
	return {
		/** 方法与不含查询串的路径是否命中任一规则 */
		test: (method: string, pathname: string) => {
			const m = method.toUpperCase();
			return current().some(r => (!r.method || r.method.includes(m)) && r.re.test(pathname));
		},
		optionDefaults: opt.defaults,
		optionRules: opt.extra,
	};
};
