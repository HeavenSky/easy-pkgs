// processString 的 context 选项交给解析器作为根节点类型, 用来处理样式表片段.
import assert from 'node:assert/strict';
import Comb from '../../../src/csscomb.ts';

describe('context option', function() {
  it('parses a declaration list without a selector', async function() {
    const comb = new Comb({'color-case': 'upper'});
    assert.equal(await comb.processString('color: #fff', {context: 'declaration'}), 'color: #FFF');
  });
});
