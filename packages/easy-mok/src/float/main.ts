// 页内悬浮条: 在业务页面右下角切换本浏览器场景组, 查看最近命中的 mock 请求; Shadow DOM 隔离样式
// 入口脚本 loader.js 按自身地址记下挂载前缀(如 /api/__mock/), 宿主把 easy-mok 挂在子路径时同样可用
const BASE = String((window as unknown as { __MOCK_BASE__?: string }).__MOCK_BASE__ || "/__mock/");
const API = `${BASE}api`;
const COOKIE = "__mock_group";
const STORE_KEY = "__mock_float__";

interface Saved {
	x: number;
	y: number;
	open: boolean;
}
interface LogItem {
	id: string;
	method: string;
	url: string;
	kind: string;
	scene: string | null;
	status: number;
}

const load = (): Saved => {
	try {
		const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null") as Saved | null;
		if (raw && typeof raw.x === "number" && typeof raw.y === "number") {
			return raw;
		}
	} catch {
		/* 使用默认位置 */
	}
	return { x: 16, y: 16, open: false };
};
const save = (s: Saved) => {
	try {
		localStorage.setItem(STORE_KEY, JSON.stringify(s));
	} catch {
		/* 隐私模式下忽略 */
	}
};

const readGroup = () => {
	const hit = document.cookie
		.split(";")
		.map(s => s.trim())
		.find(s => s.startsWith(`${COOKIE}=`));
	return hit ? decodeURIComponent(hit.slice(COOKIE.length + 1)) : "";
};
const writeGroup = (name: string) => {
	document.cookie = name
		? `${COOKIE}=${encodeURIComponent(name)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
		: `${COOKIE}=; path=/; max-age=0`;
};

const getJson = async <T>(path: string): Promise<T> => {
	const res = await fetch(API + path, { headers: { "x-mock-ui": "1" } });
	if (!res.ok) {
		throw new Error(`HTTP ${res.status}`);
	}
	return res.json() as Promise<T>;
};

const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
.wrap { position: fixed; z-index: 2147483000; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.fab { width: 40px; height: 40px; border-radius: 20px; border: 0; background: #0284c7; color: #fff; font: 600 14px/40px sans-serif; cursor: grab; box-shadow: 0 4px 14px rgba(0,0,0,.25); }
.fab.off { background: #71717a; }
.panel { width: 320px; max-height: 420px; overflow: auto; background: #fff; color: #18181b; border: 1px solid #e4e4e7; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.2); padding: 12px; font-size: 12px; }
.row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.title { font-weight: 600; font-size: 13px; flex: 1; }
select, button.btn { height: 26px; border: 1px solid #d4d4d8; border-radius: 6px; background: #fff; color: inherit; font-size: 12px; padding: 0 6px; }
button.btn { cursor: pointer; }
.hint { color: #a16207; }
ul { list-style: none; margin: 0; padding: 0; }
li { display: flex; gap: 6px; padding: 4px 0; border-top: 1px solid #f4f4f5; }
.m { font-family: ui-monospace, Menlo, monospace; color: #0369a1; min-width: 44px; }
.u { flex: 1; font-family: ui-monospace, Menlo, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.s { color: #71717a; }
.err { color: #be123c; }
@media (prefers-color-scheme: dark) {
	.panel { background: #18181b; color: #f4f4f5; border-color: #3f3f46; }
	select, button.btn { background: #27272a; border-color: #3f3f46; }
	li { border-color: #27272a; }
}
`;

const mount = () => {
	const host = document.createElement("div");
	host.setAttribute("data-easy-mok", "float");
	const root = host.attachShadow({ mode: "open" });
	root.innerHTML = `<style>${STYLE}</style><div class="wrap"><div class="panel" hidden></div><button class="fab" type="button" aria-label="easy-mok 悬浮条" title="easy-mok">M</button></div>`;
	document.body.appendChild(host);
	const wrap = root.querySelector(".wrap") as HTMLDivElement;
	const fab = root.querySelector(".fab") as HTMLButtonElement;
	const panel = root.querySelector(".panel") as HTMLDivElement;
	const state = load();
	let timer: ReturnType<typeof setInterval> | null = null;
	let initialGroup = readGroup();

	const place = () => {
		state.x = Math.min(Math.max(state.x, 0), window.innerWidth - 48);
		state.y = Math.min(Math.max(state.y, 0), window.innerHeight - 48);
		wrap.style.right = `${state.x}px`;
		wrap.style.bottom = `${state.y}px`;
	};

	const render = async () => {
		try {
			const [meta, groups, logs] = await Promise.all([
				getJson<{ enabled: { effective: boolean }; group: string | null }>("/meta"),
				getJson<{ groups: Record<string, unknown> }>("/groups"),
				getJson<LogItem[]>("/logs?limit=20&kind=mock,proxy,error"),
			]);
			fab.classList.toggle("off", !meta.enabled.effective);
			const mine = readGroup();
			const names = Object.keys(groups.groups);
			panel.innerHTML = `
				<div class="row"><span class="title">easy-mok</span><button class="btn" data-act="open" type="button">打开管理页</button></div>
				<div class="row">本浏览器场景组
					<select data-act="group" aria-label="本浏览器场景组">
						<option value="">不使用</option>
						${names.map(n => `<option value="${esc(n)}"${n === mine ? " selected" : ""}>${esc(n)}</option>`).join("")}
					</select>
				</div>
				<div class="row s">全局场景组: ${meta.group ? esc(meta.group) : "无"}; mock ${meta.enabled.effective ? "已开启" : "已关闭"}</div>
				${mine !== initialGroup ? `<div class="row hint">场景组已切换, <button class="btn" data-act="reload" type="button">刷新页面</button> 后生效</div>` : ""}
				<div class="row s">最近命中</div>
				<ul>${
					logs.length
						? logs
								.slice()
								.reverse()
								.map(
									l =>
										`<li><span class="m">${esc(l.method)}</span><span class="u" title="${esc(l.url)}">${esc(l.url)}</span><span class="s">${esc(l.scene || l.kind)}</span><span class="${l.status >= 400 ? "err" : "s"}">${l.status || ""}</span></li>`
								)
								.join("")
						: `<li class="s">暂无</li>`
				}</ul>`;
		} catch (err) {
			panel.innerHTML = `<div class="err">无法连接 easy-mok 管理接口: ${esc((err as Error).message)}</div>`;
		}
	};

	const setOpen = (open: boolean) => {
		state.open = open;
		panel.hidden = !open;
		save(state);
		if (timer) clearInterval(timer);
		timer = null;
		if (open) {
			render();
			timer = setInterval(render, 3000);
		}
	};

	panel.addEventListener("change", e => {
		const t = e.target as HTMLSelectElement;
		if (t.dataset.act === "group") {
			writeGroup(t.value);
			render();
		}
	});
	panel.addEventListener("click", e => {
		const act = (e.target as HTMLElement).dataset.act;
		if (act === "open") {
			window.open(BASE, "_blank");
		}
		if (act === "reload") {
			initialGroup = readGroup();
			location.reload();
		}
	});

	// 拖动移动位置, 位移很小时视为点击
	fab.addEventListener("pointerdown", down => {
		const sx = down.clientX;
		const sy = down.clientY;
		const ox = state.x;
		const oy = state.y;
		let moved = false;
		fab.setPointerCapture(down.pointerId);
		const move = (e: PointerEvent) => {
			if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 4) {
				moved = true;
			}
			if (!moved) {
				return;
			}
			state.x = ox - (e.clientX - sx);
			state.y = oy - (e.clientY - sy);
			place();
		};
		const up = () => {
			fab.removeEventListener("pointermove", move);
			fab.removeEventListener("pointerup", up);
			if (moved) save(state);
			else setOpen(!state.open);
		};
		fab.addEventListener("pointermove", move);
		fab.addEventListener("pointerup", up);
	});
	window.addEventListener("resize", place);
	place();
	setOpen(state.open);
};

if (document.body) {
	mount();
} else {
	document.addEventListener("DOMContentLoaded", mount);
}
