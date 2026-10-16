import assert from 'node:assert/strict';
import Comb from '../../../src/csscomb.ts';

describe('.lintString()', function() {
  it('Should report options without own lint() by processing with them', async function() {
    const comb = new Comb({'color-case': 'lower', 'leading-zero': true});
    const errors = await comb.lintString('a {\n  color: #FFF;\n  margin: .5px;\n}\n');
    assert.deepEqual(errors.map(e => [e.option, e.line, e.column]), [
      ['color-case', 2, 11],
      ['leading-zero', 3, 11]
    ]);
    assert.match(errors[0].message, /"color-case" \("lower"\)/);
    assert.match(errors[1].context!, /^3\*\| {3}margin: \.5px;$/m);
  });

  it('Should report nothing when the code already matches the config', async function() {
    const comb = new Comb('csscomb');
    const formatted = await comb.processString('a{color:RED;top:0}\n.b{&:hover{color:blue}}', {syntax: 'scss'});
    assert.deepEqual(await comb.lintString(formatted, {syntax: 'scss'}), []);
  });

  it('Should not report options whose result is overwritten by another option', async function() {
    // space-after-opening-brace 单独处理会去掉缩进, 但最终由 block-indent 补回
    const comb = new Comb({
      'space-after-opening-brace': '\n',
      'space-before-closing-brace': '\n',
      'block-indent': 2,
      'color-case': 'lower'
    });
    const errors = await comb.lintString('a {\n  color: #FFF;\n}');
    assert.deepEqual(errors.map(e => e.option), ['color-case']);
  });

  it('Should keep the format of always-semicolon errors', async function() {
    const comb = new Comb({'always-semicolon': true, 'color-case': 'lower'});
    const errors = await comb.lintString('a { color: #FFF }');
    assert.deepEqual(errors[0], {
      message: 'Missing semicolon',
      line: 1,
      column: 16,
      context: '1*| a { color: #FFF }'
    });
    assert.equal(errors[1].option, 'color-case');
  });
});
