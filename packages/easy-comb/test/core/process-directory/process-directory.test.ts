import assert from 'node:assert/strict';
import path from 'node:path';
import Comb from '../../../src/csscomb.ts';

const fixture = path.relative(process.cwd(), path.join(import.meta.dirname, 'fixture'));
const relative = (files: string[]) =>
  files.map(file => path.relative(fixture, file).split(path.sep).join('/'));

describe('directory traversal', function() {
  it('lists supported files including dot directories', function() {
    const comb = new Comb({});
    assert.deepEqual(relative(comb._getAcceptableFilesFromDirectory(fixture)),
        ['.hidden/d.css', 'a.css', 'sub/b.scss', 'vendor/lib/c.css']);
  });

  it('skips files matched by exclude patterns relative to cwd', function() {
    const comb = new Comb({exclude: [`${fixture}/vendor/**`, '**/.hidden/**']});
    assert.deepEqual(relative(comb._getAcceptableFilesFromDirectory(fixture)),
        ['a.css', 'sub/b.scss']);
  });

  it('keeps the given path prefix', function() {
    const comb = new Comb({exclude: ['**/vendor/**', '**/.hidden/**']});
    assert.deepEqual(comb._getAcceptableFilesFromDirectory(fixture + '/sub'),
        [path.join(fixture, 'sub', 'b.scss')]);
  });

  it('processDirectory reports changed files without writing in lint mode', async function() {
    const comb = new Comb({lint: true, exclude: ['**/vendor/**'], 'color-case': 'upper'});
    assert.deepEqual(await comb.processDirectory(fixture), [1, 1, 1]);
    assert.equal(await comb.processFile(path.join(fixture, 'vendor/lib/c.css')), undefined);
  });

  it('lintDirectory skips excluded files', async function() {
    const comb = new Comb({exclude: ['**/vendor/**', '**/.hidden/**'], 'always-semicolon': true});
    const errors = await comb.lintDirectory(fixture);
    assert.equal(errors.length, 2);
  });
});
