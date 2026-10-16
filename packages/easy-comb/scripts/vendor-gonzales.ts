// 把 packages/easy-gonz 的 src/ 原样复制到 vendor/gonzales-pe/src/, 并记录来源版本与 src 内容摘要.
//
// 用法: node scripts/vendor-gonzales.ts [gonzales 目录]
// 默认目录为 ../easy-gonz; easy-gonz 免构建, 不需要先安装依赖.
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = path.resolve(root, process.argv[2] ?? '../easy-gonz');
const target = path.join(root, 'vendor/gonzales-pe');

if (!existsSync(path.join(source, 'src/gonzales.js'))) {
  console.error(`${source} 不是 gonzales 目录`);
  process.exit(1);
}

// 记录内容摘要而不是提交号: 提交号会随 squash 或改写历史失效, 摘要只取决于 src 的内容
const digest = createHash('sha256');
for (const file of (readdirSync(path.join(source, 'src'), { recursive: true }) as string[]).sort()) {
  const full = path.join(source, 'src', file);
  if (!existsSync(full) || !file.endsWith('.js')) continue;
  digest.update(file.split(path.sep).join('/') + '\0').update(readFileSync(full)).update('\0');
}
const srcSha = digest.digest('hex').slice(0, 12);
const { version } = JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8'));

rmSync(path.join(target, 'src'), { recursive: true, force: true });
cpSync(path.join(source, 'src'), path.join(target, 'src'), { recursive: true });
copyFileSync(path.join(source, 'MIT-LICENSE.txt'), path.join(target, 'MIT-LICENSE.txt'));
// easy-comb 是 "type": "module", 没有这个 package.json 时 src/*.js 会被当作 ESM 加载失败; src/parsing-error.js 也从这里读 version.
writeFileSync(path.join(target, 'package.json'), JSON.stringify({
  name: 'easy-gonz',
  version,
  private: true,
  type: 'commonjs',
  description: `由 easy-pkgs 仓库 packages/easy-gonz ${version} 复制, src 内容 sha256 前 12 位 ${srcSha}; 不要手改, 修改 easy-gonz 后执行 node scripts/vendor-gonzales.ts 重新同步`,
}, null, 2) + '\n');

const parser = createRequire(import.meta.url)(path.join(target, 'src/gonzales.js'));
for (const [syntax, sample] of [['css', 'a{b:c}'], ['less', 'a{b:c}'], ['scss', 'a{b:c}'], ['sass', 'a\n  b: c\n']]) {
  try {
    parser.parse(sample, { syntax });
  } catch (error) {
    console.error(`${target} 无法解析 ${syntax}: ${(error as Error).message}`);
    process.exit(1);
  }
}

console.log(`已同步 easy-gonz ${version}(src sha256 ${srcSha}) 到 vendor/gonzales-pe/`);
