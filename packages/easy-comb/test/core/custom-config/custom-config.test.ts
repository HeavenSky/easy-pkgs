import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { CONFIG_FILES, explainConfigLoadError, loadConfigFile } from '../../../src/config.ts';
import Test from '../../helpers/core-test.ts';

const formats = path.join(import.meta.dirname, 'formats');

describe('custom config', function() {
  for (const ext of ['json', 'js', 'cjs', 'mjs', 'ts', 'cts', 'mts']) {
    it(`loads .csscomb.${ext}`, async function() {
      const test = new Test(this);
      const file = test.Comb.getCustomConfigPath(path.join(formats, ext));
      assert.equal(file, path.join(formats, ext, `.csscomb.${ext}`));
      assert.deepEqual(await test.Comb.getCustomConfig(file!), {'color-case': 'upper'});
    });
  }

  it('finds csscomb.config.ts', function() {
    const test = new Test(this);
    const file = test.Comb.getCustomConfigPath(path.join(formats, 'modern'));
    assert.equal(file, path.join(formats, 'modern', 'csscomb.config.ts'));
  });

  it('searches parent directories', function() {
    const test = new Test(this);
    const file = test.Comb.getCustomConfigPath(path.join(formats, 'nested', 'deeper'));
    assert.equal(file, path.join(formats, 'nested', '.csscomb.json'));
  });

  it('applies a loaded config', async function() {
    const test = new Test(this);
    test.comb.configure(await loadConfigFile(path.join(formats, 'ts', '.csscomb.ts')));
    assert.equal(await test.comb.processString('a { color: #fff }'), 'a { color: #FFF }');
  });

  it('returns null for a broken config', async function() {
    const test = new Test(this);
    assert.equal(await test.Comb.getCustomConfig(path.join(formats, 'missing.json')), null);
  });

  it('lists every supported extension', function() {
    for (const ext of ['json', 'js', 'cjs', 'mjs', 'ts', 'cts', 'mts'])
      assert.ok(CONFIG_FILES.includes(`.csscomb.${ext}`), ext);
  });

  it('stops searching at the home directory returned by os.homedir()', function() {
    const test = new Test(this);
    const deeper = path.join(formats, 'nested', 'deeper');
    const homedir = os.homedir;
    // 模拟 Windows: 没有 HOME, HOMEPATH 不带盘符
    const env = {HOME: process.env.HOME, HOMEPATH: process.env.HOMEPATH, USERPROFILE: process.env.USERPROFILE};
    os.homedir = () => deeper;
    delete process.env.HOME;
    process.env.HOMEPATH = '\\Users\\nobody';
    delete process.env.USERPROFILE;
    try {
      assert.equal(test.Comb.getCustomConfigPath(deeper), null);
    } finally {
      os.homedir = homedir;
      for (const [name, value] of Object.entries(env)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it('explains TypeScript configs that need type stripping', async function() {
    const file = path.join(formats, 'enum', 'csscomb.config.ts');
    await assert.rejects(loadConfigFile(file), (error: Error) => {
      assert.match(error.message, /TypeScript config/);
      assert.match(error.message, /Node\.js 22\.18\+/);
      assert.match(error.message, /\.mjs/);
      assert.match(error.message, /enum/);
      return true;
    });
  });

  for (const [what, error] of [
    ['an unknown .ts extension', Object.assign(new TypeError('Unknown file extension ".ts"'), {code: 'ERR_UNKNOWN_FILE_EXTENSION'})],
    ['ESM syntax in a CommonJS project', new SyntaxError('Unexpected token \'export\'')]
  ] as const) {
    it(`explains ${what}`, function() {
      const explained = explainConfigLoadError('csscomb.config.ts', error) as Error & {cause?: unknown};
      assert.notEqual(explained, error);
      assert.match(explained.message, /Node\.js 22\.18\+/);
      assert.match(explained.message, /\.mts/);
      assert.match(explained.message, /\.json/);
      assert.ok(explained.message.includes(error.message));
      assert.equal(explained.cause, error);
    });
  }

  it('keeps load errors of JavaScript configs as they are', function() {
    const error = Object.assign(new TypeError('Unknown file extension'), {code: 'ERR_UNKNOWN_FILE_EXTENSION'});
    assert.equal(explainConfigLoadError('csscomb.config.mjs', error), error);
  });
});
