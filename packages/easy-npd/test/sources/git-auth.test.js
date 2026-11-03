// 含 userinfo 的 https git 地址: 凭据不进 git 子进程 argv, 改经 credential helper 提供, 且只对原始
// URL 的协议与主机生效; 地址用不可解析的 example.invalid, 不真正联网
const { execFileSync } = require("node:child_process");
const mm = require("mm");
const assert = require("node:assert");
const helper = require("../support/helper");
const utils = require("../../lib/utils");
const downloadGit = require("../../lib/download/git");

describe("test/sources/git-auth.test.js", () => {
	const [tmp, cleanup] = helper.tmp();
	beforeEach(cleanup);
	afterEach(cleanup);
	afterEach(mm.restore);

	const SHA = `${"a".repeat(39)}1`;
	/** 在 spawnWithTimeout 边界拦截 git 调用; ls-remote 公布一个 pull ref */
	const mockGit = lsRemoteStdout => {
		const calls = [];
		mm(utils, "spawnWithTimeout", async (cmd, args, opts) => {
			calls.push({ args, env: (opts && opts.env) || {} });
			const sub = args[1];
			if (sub === "ls-remote") return { stdout: lsRemoteStdout, stderr: "" };
			if (sub === "rev-parse") return { stdout: `${SHA}\n`, stderr: "" };
			return { stdout: "", stderr: "" };
		});
		return calls;
	};
	const run = raw =>
		downloadGit(
			{ name: null, raw, displayName: "git" },
			{
				cache: { dependenciesTree: {} },
				storeDir: tmp,
				console: { warn() {}, info() {}, error() {} },
				remoteNames: {},
			}
		);

	it("full sha mirror clone: argv 不含凭据, 网络调用经 credential helper", async () => {
		const calls = mockGit("");
		await assert.rejects(
			run(`git+https://user:secret@example.invalid/a/b.git#${SHA}`),
			/package\.json/
		);
		const mirror = calls.find(({ args }) => args.includes("--mirror"));
		assert.ok(mirror, "mirror clone is called");
		assert(mirror.args.includes("https://example.invalid/a/b.git"));
		assert(!mirror.args.join(" ").includes("secret"));
		// 本地 checkout 不带凭据, 网络调用带
		const checkout = calls.find(({ args }) => args.includes("checkout"));
		assert.strictEqual(checkout.env._NPD_GIT_USER_, undefined);
		assert.strictEqual(mirror.env._NPD_GIT_USER_, "user");
		assert.strictEqual(mirror.env._NPD_GIT_PASS_, "secret");
		// 凭据经 credential helper 提供, 且限定到原始 URL 的协议与主机
		assert.strictEqual(mirror.env.GIT_ASKPASS, "echo");
		assert.strictEqual(mirror.env._NPD_GIT_ORIGIN_, "https://example.invalid");
		assert.strictEqual(mirror.env.GIT_CONFIG_COUNT, "2");
		assert.strictEqual(mirror.env.GIT_CONFIG_KEY_1, "credential.helper");
		assert(mirror.env.GIT_CONFIG_VALUE_1, "credential helper is configured");
		assert(!mirror.env.GIT_CONFIG_VALUE_1.includes("secret"));
	});

	it("pull ref fetch: ls-remote, remote add 与 fetch 均剥离凭据", async () => {
		const calls = mockGit(`${SHA}\trefs/pull/1/head\n`);
		await assert.rejects(
			run("git+https://user:secret@example.invalid/a/b.git#pull/1"),
			/package\.json/
		);
		for (const { args, env } of calls) {
			assert(!args.join(" ").includes("secret"), `argv leaks credentials: ${args.join(" ")}`);
			if (env._NPD_GIT_PASS_) {
				assert(
					env.GIT_CONFIG_VALUE_1,
					`credential helper is configured: ${args.join(" ")}`
				);
				assert.strictEqual(env._NPD_GIT_ORIGIN_, "https://example.invalid");
			}
		}
		const lsRemote = calls.find(({ args }) => args.includes("ls-remote"));
		assert(lsRemote.args.includes("https://example.invalid/a/b.git"));
		const remoteAdd = calls.find(({ args }) => args.includes("remote"));
		assert(remoteAdd.args.includes("https://example.invalid/a/b.git"));
		assert.strictEqual(remoteAdd.env._NPD_GIT_USER_, "user");
		const fetch = calls.find(({ args }) => args.includes("fetch"));
		assert.strictEqual(fetch.env._NPD_GIT_PASS_, "secret");
	});

	it("submodule update 继承凭据与主机限定", async () => {
		const calls = mockGit(`${SHA}\trefs/pull/1/head\n`);
		mm(utils, "exists", async p =>
			String(p).endsWith(".gitmodules") ? true : utils.exists(p)
		);
		await assert.rejects(
			run("git+https://user:secret@example.invalid/a/b.git#pull/1"),
			/package\.json/
		);
		const sub = calls.find(({ args }) => args.includes("submodule"));
		assert(sub, "submodule update is called");
		assert.strictEqual(sub.env._NPD_GIT_USER_, "user");
		assert.strictEqual(sub.env._NPD_GIT_PASS_, "secret");
		assert.strictEqual(sub.env._NPD_GIT_ORIGIN_, "https://example.invalid");
		assert.strictEqual(sub.env.GIT_ASKPASS, "echo");
	});

	it("credential helper 只对原始主机返回凭据", async () => {
		const calls = mockGit(`${SHA}\trefs/pull/1/head\n`);
		await assert.rejects(
			run("git+https://user:secret@example.invalid/a/b.git#pull/1"),
			/package\.json/
		);
		const fetch = calls.find(({ args }) => args.includes("fetch"));
		const helper = fetch.env.GIT_CONFIG_VALUE_1;
		// 与 git 一致的方式执行 helper: sh -c '<helper> "$@"' <helper> get
		const runHelper = host =>
			execFileSync("sh", ["-c", `${helper} "$@"`, helper, "get"], {
				env: fetch.env,
				input: `protocol=https\nhost=${host}\n\n`,
			}).toString();
		assert.strictEqual(runHelper("evil.example"), "");
		assert.strictEqual(runHelper("example.invalid"), "username=user\npassword=secret\n");
	});
});
