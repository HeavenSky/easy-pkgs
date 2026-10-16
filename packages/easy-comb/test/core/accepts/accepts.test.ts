// 枚举取值的正则必须整体锚定: `/^lower|upper$/` 会接受 `lowercase`, `xupper` 等非法值.
import assert from 'node:assert/strict';
import Comb from '../../../src/csscomb.ts';
import options from '../../../src/options/index.ts';

// 配置非法值时应告警并忽略该选项, 处理结果保持原样.
async function processWithInvalid(config: Record<string, unknown>, input: string) {
  const warnings: unknown[][] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  let comb: Comb;
  try {
    comb = new Comb(config);
  } finally {
    console.warn = warn;
  }
  return {warnings, output: await comb.processString(input)};
}

describe('enumerated option values', function() {
  const cases: Array<[Record<string, unknown>, string]> = [
    [{'color-case': 'lowercase'}, 'a { color: #fff }'],
    [{'color-case': 'xupper'}, 'a { color: #fff }'],
    [{'element-case': 'lowercase'}, 'li a { top: 0 }'],
    [{'element-case': 'xupper'}, 'li a { top: 0 }'],
    [{'quotes': 'singlequote'}, 'a { content: "x" }'],
    [{'quotes': 'xdouble'}, 'a { content: \'x\' }']
  ];

  for (const [config, input] of cases) {
    it(`warns about and ignores ${JSON.stringify(config)}`, async function() {
      const {warnings, output} = await processWithInvalid(config, input);
      assert.equal(warnings.length, 1);
      assert.equal(output, input);
    });
  }

  it('accepts the exact values', async function() {
    const comb = new Comb({'color-case': 'upper', 'element-case': 'upper', 'quotes': 'single'});
    assert.equal(await comb.processString('li { content: "x"; color: #fff }'),
        'LI { content: \'x\'; color: #FFF }');
  });

  it('every string pattern with alternatives is anchored as a whole', function() {
    for (const option of options) {
      const pattern = option.accepts?.string;
      if (!pattern || !pattern.source.includes('|')) continue;
      assert.match(pattern.source, /^\^\(\?:[^()]*\)\$$/, option.name);
    }
  });
});
