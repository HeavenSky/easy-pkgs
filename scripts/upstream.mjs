// 查看各包上游自上次检查以来的动态: 新提交, 新发布, 以及更新过的 PR 与 issue.
//
// 用法: node scripts/upstream.mjs [包目录名...] [--mark]
//   --mark: 查看后把这些包的 checked 更新为今天
// 依赖已登录的 GitHub CLI(gh).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('../upstreams.json', import.meta.url));
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { mark: { type: 'boolean' } },
});
const upstreams = JSON.parse(readFileSync(file, 'utf8'));
const names = positionals.length ? positionals : Object.keys(upstreams);

function gh(...args) {
  try {
    return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) || 'null');
  } catch (error) {
    return { error: String(error.stderr || error.message).trim().split('\n')[0] };
  }
}

const today = new Date().toISOString().slice(0, 10);
for (const name of names) {
  const entry = upstreams[name];
  if (!entry) {
    console.log(`\n# ${name}: 未在 upstreams.json 登记`);
    continue;
  }
  if (!entry.repo) {
    console.log(`\n# ${name}: 未跟踪上游`);
    continue;
  }

  const since = entry.checked || entry.adopted;
  console.log(`\n# ${name} ← ${entry.repo} (基于 ${entry.base.slice(0, 12)}, 上次检查 ${since})`);

  const repo = gh('api', `repos/${entry.repo}`);
  if (repo.error) {
    console.log(`  无法访问上游: ${repo.error}`);
    continue;
  }
  if (repo.archived) console.log('  上游已归档');
  console.log(`  上游最后推送: ${repo.pushed_at.slice(0, 10)}`);

  const commits = gh('api', `repos/${entry.repo}/commits?since=${since}T00:00:00Z&per_page=20`);
  const releases = gh('api', `repos/${entry.repo}/releases?per_page=5`);
  // 依赖升级机器人的 PR 数量多且不需要人工判断, 只报告条数.
  const isBot = item => item.author?.type === 'Bot' || /\[bot\]$|^app\//.test(item.author?.login ?? '');
  const search = kind => {
    const items = [].concat(gh('search', kind, '--repo', entry.repo, '--updated', `>=${since}`,
      '--limit', '100', '--json', 'number,title,state,updatedAt,author'));
    if (items[0]?.error) return [items[0].error];
    const human = items.filter(item => !isBot(item));
    const lines = human.map(i => `#${i.number} ${i.state} ${i.updatedAt.slice(0, 10)} ${i.title}`);
    if (human.length < items.length) lines.push(`(另有 ${items.length - human.length} 条机器人提交, 已省略)`);
    return lines;
  };

  const sections = [
    ['新提交', Array.isArray(commits) ? commits.map(c => `${c.commit.author.date.slice(0, 10)} ${c.sha.slice(0, 7)} ${c.commit.message.split('\n')[0]}`) : [commits.error]],
    ['新发布', Array.isArray(releases) ? releases.filter(r => r.published_at >= since).map(r => `${r.published_at.slice(0, 10)} ${r.tag_name}`) : [releases.error]],
    ['更新过的 PR', search('prs')],
    ['更新过的 issue', search('issues')],
  ];
  for (const [title, lines] of sections) {
    console.log(`  ${title}: ${lines.length ? '' : '无'}`);
    for (const line of lines) console.log(`    ${line}`);
  }

  if (values.mark) entry.checked = today;
}

if (values.mark) {
  writeFileSync(file, JSON.stringify(upstreams, null, 2) + '\n');
  console.log(`\n已把 ${names.join(', ')} 的 checked 更新为 ${today}`);
}
