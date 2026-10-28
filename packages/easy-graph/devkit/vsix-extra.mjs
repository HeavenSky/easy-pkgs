/**
 * 运行时按路径读取, 无法从 `package.json` 清单推导的 VSIX 条目 (相对 `extension/`)。
 *
 * 与 `package.json` 的 `files` 互相独立: 两边任何一边漏改, `npm run package` 的内容断言都会失败。
 */
export default [
	// git 在子进程里运行的 askpass 脚本, 以及脚本调用的 node 入口 (src/askpass/askpassManager.ts)
	"out/askpass/askpassMain.js",
	"out/askpass/askpass.sh",
	"out/askpass/askpass-empty.sh",
	"out/askpass/ssh-askpass.sh",
	// webview 的脚本与样式 (src/baseGitGraphView.ts getWebUri)
	"out/web/out.min.js",
	"out/web/out.min.css",
];
