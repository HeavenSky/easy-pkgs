// 把上游项目某个提交的文件快照导入 packages/<名称>, 并在 upstreams.json 登记来源与确切提交.
// 不导入上游提交历史(它留在上游仓库), 导入结果留在工作区, 由使用者在 dev 分支提交.
//
// 用法: node scripts/adopt.mjs <名称> <来源> [--ref <分支, tag 或提交>] [--upstream <owner/repo>]
//   <来源>: GitHub 的 owner/repo, git 地址, 或本地仓库路径(只导入已提交的内容)
//   --ref: 默认取来源的默认分支(本地仓库为当前 HEAD)
//   --upstream: 来源不是 GitHub 上游时(例如本地仓库)指明上游的 owner/repo, 供 upstream.mjs 跟踪
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { ref: { type: 'string' }, upstream: { type: 'string' } },
});
const [name, source] = positionals;

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!name || !source) fail('用法: node scripts/adopt.mjs <名称> <来源> [--ref <分支, tag 或提交>] [--upstream <owner/repo>]');
if (!/^[a-z0-9][a-z0-9.-]*$/.test(name)) fail(`名称 ${name} 只能包含小写字母, 数字, "." 与 "-"`);

const target = path.join(root, 'packages', name);
if (existsSync(target)) fail(`packages/${name} 已存在`);

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

const isGithubSlug = /^[\w.-]+\/[\w.-]+$/.test(source) && !existsSync(source);
const url = isGithubSlug ? `https://github.com/${source}.git` : source;
const upstream = values.upstream ?? (isGithubSlug ? source : null);
const ref = values.ref ?? 'HEAD';

// 只取对象不建引用: 上游历史不会进入本仓库的任何分支.
console.log(`获取 ${url} 的 ${ref}`);
try {
  execFileSync('git', ['fetch', '--quiet', '--no-tags', url, ref], { cwd: root, stdio: 'inherit' });
} catch {
  fail(`无法从 ${url} 获取 ${ref}, 请确认地址与分支/tag 名称`);
}
const commit = git('rev-parse', 'FETCH_HEAD');

mkdirSync(target, { recursive: true });
// git archive 只导出受版本控制的文件, 不带 .git 与被忽略的产物.
const archive = execFileSync('git', ['archive', '--format=tar', commit], { cwd: root, maxBuffer: 1 << 30 });
execFileSync('tar', ['-x', '-C', target], { input: archive });

const file = path.join(root, 'upstreams.json');
const upstreams = JSON.parse(readFileSync(file, 'utf8'));
const today = new Date().toISOString().slice(0, 10);
upstreams[name] = { repo: upstream, base: commit, adopted: today, checked: today };
writeFileSync(file, JSON.stringify(upstreams, null, 2) + '\n');

console.log(`
已把 ${commit.slice(0, 12)} 的文件导入 packages/${name}, 尚未提交. 接下来:
  1. 检查 upstreams.json 中 ${name} 的登记(repo 为 null 表示不跟踪上游)
  2. 在 dev 分支提交, 按 README「接手流程」筛选上游 issue 与 PR, 现代化后再合入 main`);
