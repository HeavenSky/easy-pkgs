// 端到端验证: 启动演示服务, 连接 127.0.0.1:9222 的调试 Chrome, 在新标签页里走一遍主流程, 结束时关闭标签页并断开
// 前置: npm run build; 调试 Chrome 已启动(chrome-debug)
import { spawn } from "node:child_process";
import path from "node:path";
import { chromium } from "playwright-core";

const PORT = 4110;
const BASE = `http://127.0.0.1:${PORT}`;
const root = path.resolve(import.meta.dirname, "../..");
const server = spawn(process.execPath, ["test/dev-server.js"], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "inherit"] });
await new Promise((resolve, reject) => {
	server.stdout.on("data", d => String(d).includes("[dev]") && resolve(undefined));
	server.on("exit", code => reject(new Error(`演示服务退出: ${code}`)));
});

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` - ${detail}` : ""}`); };

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0];
const page = await context.newPage();
try {
	const errors = [];
	page.on("pageerror", e => errors.push(e.message));
	await page.goto(`${BASE}/__mock/`);
	await page.getByRole("radio", { name: /^vip/ }).click();
	await page.getByText("已切换到场景「vip」").waitFor();
	const vip = await page.evaluate(async () => (await fetch("/api/user/1")).json());
	check("管理页切换场景后业务请求生效", vip?.data?.vip === true, JSON.stringify(vip));

	await page.getByRole("tab", { name: "行为" }).click();
	await page.getByLabel(/状态码覆盖/).fill("418");
	await page.getByRole("button", { name: "保存" }).click();
	await page.getByText("已保存").waitFor();
	const status = await page.evaluate(async () => (await fetch("/api/user/1")).status);
	check("状态码覆盖生效", status === 418, String(status));
	await page.getByRole("button", { name: "恢复默认" }).click();
	await page.getByRole("tab", { name: "场景" }).click();
	await page.getByRole("radio", { name: /不手动选择/ }).click();

	await page.getByRole("button", { name: "新建场景" }).click();
	const form = page.getByRole("form", { name: "新建场景" });
	await form.getByLabel("场景名").fill("e2escript");
	await form.getByRole("radio", { name: "JS 脚本" }).click();
	const code = form.getByLabel("脚本").locator(".cm-content");
	await code.click();
	await page.keyboard.press("ControlOrMeta+a");
	await page.keyboard.insertText("req => ({ script: req.params.id })");
	await form.getByRole("button", { name: "保存" }).click();
	await page.getByText("已新建场景「e2escript」").waitFor();
	const scripted = await page.evaluate(async () => (await fetch("/api/user/5?__scene=e2escript")).json());
	check("管理页新建的脚本场景按处理函数执行", scripted?.script === "5", JSON.stringify(scripted));
	const routeId = Buffer.from("GET /api/user/:id").toString("base64url");
	await page.evaluate(async id => { await fetch(`/__mock/api/routes/${id}/scenes/e2escript`, { method: "DELETE", headers: { "x-mock-ui": "1" } }); }, routeId);

	const biz = await context.newPage();
	await biz.goto(`${BASE}/`);
	await biz.locator("[data-easy-mok=float]").waitFor({ state: "attached" });
	check("业务页注入悬浮条", true);
	await biz.getByRole("button", { name: "GET /api/missing" }).click();
	await biz.close();

	await page.getByRole("link", { name: "请求日志" }).click();
	await page.getByText("/api/missing").first().waitFor();
	check("请求日志实时出现未命中的 fetch 请求", true);
	check("管理页无脚本错误", errors.length === 0, errors.join("; "));
} catch (err) {
	check("流程执行", false, err.message);
} finally {
	await page.close();
	await browser.close(); // 只断开 CDP 连接, 不关闭调试 Chrome
	server.kill();
}
process.exit(results.every(r => r.ok) ? 0 : 1);
