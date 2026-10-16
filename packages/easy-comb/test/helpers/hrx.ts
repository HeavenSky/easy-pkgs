// 从用例目录的 fixtures.hrx 归档读取 fixture, 归档或条目缺失时回退读真实文件.
import fs from 'node:fs';
import path from 'node:path';

export const ARCHIVE_NAME = 'fixtures.hrx';

const archives = new Map<string, Map<string, string> | null>();

// 条目正文是头行之后到 `\n<boundary>` 之前的文本, 边界前的换行不属于正文; 归档以单独一行边界(空注释)收尾, 删掉它会让最后一个 fixture 多出编辑器补的末尾换行.
export function parseHrx(text: string): Map<string, string> {
  const entries = new Map<string, string>();
  const boundary = /^<=+>/.exec(text)?.[0];
  if (!boundary) throw new Error('HRX archive must start with a boundary');

  for (const part of text.slice(boundary.length).split('\n' + boundary)) {
    if (!part.startsWith(' ')) continue;
    const eol = part.indexOf('\n');
    const name = eol === -1 ? part.slice(1) : part.slice(1, eol);
    const body = eol === -1 ? '' : part.slice(eol + 1);
    if (entries.has(name)) throw new Error(`Duplicate HRX entry ${name}`);
    entries.set(name, body);
  }
  return entries;
}

function loadArchive(dir: string): Map<string, string> | null {
  if (!archives.has(dir)) {
    const file = path.join(dir, ARCHIVE_NAME);
    archives.set(dir, fs.existsSync(file) ? parseHrx(fs.readFileSync(file, 'utf8')) : null);
  }
  return archives.get(dir)!;
}

export function readFixture(dir: string, relPath: string): string {
  const content = loadArchive(dir)?.get(relPath.split(path.sep).join('/'));
  return content ?? fs.readFileSync(path.join(dir, relPath), 'utf8');
}
