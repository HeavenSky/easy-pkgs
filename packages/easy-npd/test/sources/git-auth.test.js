// 含 userinfo 的 https git 地址: 凭据不进 git 子进程 argv, 改经 credential helper 提供, 且只对原始
// URL 的协议与主机生效; 地址用不可解析的 example.invalid, 不真正联网
const { spawnSync } = require("node:child_process");
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

	for (const [protocol, host, matchingHosts] of [
		["https", "example.invalid", ["example.invalid", "example.invalid:443"]],
		["https", "example.invalid:443", ["example.invalid", "example.invalid:443"]],
		["http", "example.invalid:80", ["example.invalid", "example.invalid:80"]],
		["https", "example.invalid:8443", ["example.invalid:8443"]],
	]) {
		it(`git credential fill 限定凭据作用域: ${protocol}://${host}`, async () => {
			const calls = mockGit("");
			await assert.rejects(
				run(`git+${protocol}://user:secret@${host}/a/b.git#${SHA}`),
				/package\.json/
			);
			const mirror = calls.find(({ args }) => args.includes("--mirror"));
			const fill = (scheme, hostname) =>
				spawnSync("git", ["credential", "fill"], {
					env: {
						...mirror.env,
						GIT_ASKPASS: "",
						SSH_ASKPASS: "",
						GIT_TERMINAL_PROMPT: "0",
					},
					input: `url=${scheme}://${hostname}/a/b.git\n\n`,
					encoding: "utf8",
					timeout: 5000,
				});
			for (const matchingHost of matchingHosts) {
				const result = fill(protocol, matchingHost);
				assert.ifError(result.error);
				assert.strictEqual(result.status, 0, result.stderr);
				assert.match(result.stdout, /\nusername=user\npassword=secret\n/);
			}
			for (const [scheme, hostname] of [
				[protocol, "evil.example"],
				[protocol, "example.invalid:9443"],
				[protocol === "https" ? "http" : "https", host],
			]) {
				const result = fill(scheme, hostname);
				assert.ifError(result.error);
				assert.notStrictEqual(result.status, 0);
				assert.strictEqual(result.stdout, "");
			}
		});
	}

	it("SSH 下载保留调用方的 GIT_SSH_COMMAND", async () => {
		const command = "ssh -i /example/deploy-key -o IdentitiesOnly=yes";
		mm(process.env, "GIT_SSH_COMMAND", command);
		const calls = mockGit("");
		await assert.rejects(run(`git+ssh://git@example.invalid/a/b.git#${SHA}`), /package\.json/);
		const mirror = calls.find(({ args }) => args.includes("--mirror"));
		assert.strictEqual(mirror.env.GIT_SSH_COMMAND, command);
	});
});
