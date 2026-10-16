// 命令行用例: 以子进程运行 src/cli.ts, 工作目录是带 .csscomb.json 的 fixture 目录.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Comb from '../../src/csscomb.ts';

const cli = path.join(import.meta.dirname, '../../src/cli.ts');
const fixture = path.join(import.meta.dirname, 'fixture');
const config = JSON.parse(readFileSync(path.join(fixture, '.csscomb.json'), 'utf8'));
const version = JSON.parse(readFileSync(path.join(import.meta.dirname, '../../package.json'), 'utf8')).version;

interface Result {
  code: number | null;
  stdout: string;
  stderr: string;
}

// stdout / stderr 都经管道读取; input 为 undefined 时 stdin 是立即关闭的管道, 为 null 时是 /dev/null.
function run(args: string[], input?: string | null, command: string[] = [process.execPath, cli]): Promise<Result> {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], [...command.slice(1), ...args],
        {cwd: fixture, stdio: [input === null ? 'ignore' : 'pipe', 'pipe', 'pipe']});
    let stdout = '';
    let stderr = '';
    child.stdout!.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
    child.stderr!.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({code, stdout, stderr}));
    if (input !== null) child.stdin!.end(input);
  });
}

// 用 script(1) 给子进程分配伪终端, 让它的 stdin 是 TTY; 没有 script 时返回 null.
function ttyCommand(): string[] | null {
  if (spawnSync('script', ['-q', '/dev/null', 'true'], {stdio: 'ignore'}).error) return null;
  if (process.platform === 'darwin') return ['script', '-q', '/dev/null', process.execPath, cli];
  if (process.platform === 'linux') return ['script', '-qec', `"${process.execPath}" "${cli}"`, '/dev/null'];
  return null;
}

// 运行可能误改 fixture 的命令, 结束后断言并恢复原内容.
async function withFixtureFile(name: string, fn: (file: string) => Promise<void>): Promise<void> {
  const file = path.join(fixture, name);
  const original = readFileSync(file, 'utf8');
  try {
    await fn(file);
    assert.equal(readFileSync(file, 'utf8'), original, `${name} must not be modified`);
  } finally {
    writeFileSync(file, original);
  }
}

describe('cli', function() {
  this.timeout(20000);

  describe('stdin', function() {
    it('writes the whole result to a pipe before exiting', async function() {
      const input = Array.from({length: 12000}, (_, i) => `.a${i}{color:#FFF;top:0}\n`).join('');
      const expected = await new Comb(config).processString(input);
      assert.ok(expected.length > 256 * 1024);
      const result = await run(['-'], input);
      assert.equal(result.stderr, '');
      assert.equal(result.code, 0);
      assert.equal(result.stdout.length, expected.length);
      assert.equal(result.stdout, expected);
    });

    it('reads stdin when no path is given and stdin is not a TTY', async function() {
      const result = await run([], 'a{color:#FFF}');
      assert.deepEqual(result, {code: 0, stdout: 'a{color: #fff}', stderr: ''});
    });

    it('prints help and exits with 1 when no path is given and stdin is a TTY', async function() {
      const command = ttyCommand();
      if (!command) this.skip();
      // script 自身的 stdin 不能是 socket(macOS 上 tcgetattr 失败), 改用 /dev/null
      const result = await run([], null, command!);
      assert.equal(result.code, 1);
      assert.match(result.stdout + result.stderr, /SYNOPSIS/);
    });
  });

  describe('options', function() {
    it('rejects unknown options without processing any file', async function() {
      await withFixtureFile('unformatted.css', async file => {
        const result = await run(['--lnt', file]);
        assert.equal(result.code, 2);
        assert.match(result.stderr, /Unknown option '--lnt'/);
        assert.match(result.stderr, /SYNOPSIS/);
        assert.equal(result.stdout, '');
      });
    });

    it('rejects unknown short options', async function() {
      const result = await run(['-x', '-'], 'a{color:#FFF}');
      assert.equal(result.code, 2);
      assert.match(result.stderr, /Unknown option '-x'/);
      assert.equal(result.stdout, '');
    });

    for (const flag of ['--version', '-V']) {
      it(`${flag} prints the package version`, async function() {
        const result = await run([flag]);
        assert.deepEqual(result, {code: 0, stdout: version + os.EOL, stderr: ''});
      });
    }

    it('--help prints help', async function() {
      const result = await run(['--help']);
      assert.equal(result.code, 0);
      assert.match(result.stdout, /-V, --version/);
    });

    it('still requires a value for --config', async function() {
      const result = await run(['--config']);
      assert.equal(result.code, 1);
      assert.match(result.stderr, /Option --config requires a <path> argument/);
    });
  });

  describe('missing files', function() {
    it('reports a missing path without a stack trace', async function() {
      await withFixtureFile('unformatted.css', async file => {
        const result = await run([file, 'missing.css']);
        assert.equal(result.code, 1);
        assert.match(result.stderr, /missing\.css was not found/);
        assert.doesNotMatch(result.stderr, /\n\s+at /);
        assert.equal(result.stdout, '');
      });
    });

    it('--detect reports a missing file without a stack trace', async function() {
      const result = await run(['--detect', 'missing.css']);
      assert.equal(result.code, 1);
      assert.match(result.stderr, /missing\.css was not found/);
      assert.doesNotMatch(result.stderr, /\n\s+at /);
      assert.equal(result.stdout, '');
    });
  });

  describe('files', function() {
    it('--detect prints the detected options', async function() {
      const result = await run(['--detect', 'unformatted.css']);
      assert.equal(result.code, 0);
      assert.equal(JSON.parse(result.stdout)['color-case'], 'upper');
    });

    it('--lint exits with 1 for files that need changes', async function() {
      await withFixtureFile('unformatted.css', async file => {
        const result = await run(['--lint', '--verbose', file]);
        assert.equal(result.code, 1);
        assert.match(result.stdout, /1 file processed/);
      });
    });

    it('fixes files in place', async function() {
      const file = path.join(fixture, 'unformatted.css');
      const original = readFileSync(file, 'utf8');
      try {
        const result = await run([file]);
        assert.deepEqual(result, {code: 0, stdout: '', stderr: ''});
        assert.equal(readFileSync(file, 'utf8'), await new Comb(config).processString(original));
        assert.notEqual(original, readFileSync(file, 'utf8'));
      } finally {
        writeFileSync(file, original);
      }
    });
  });
});
