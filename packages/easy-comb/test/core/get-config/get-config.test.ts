import assert from 'node:assert/strict';
import defaultConfig from '../../../src/config/default.ts';
import Test from '../../helpers/core-test.ts';

describe('csscomb methods', function() {
  it('getConfig()', function() {
    const test = new Test(this);
    assert.deepEqual(test.Comb.getConfig(), defaultConfig);
  });

  it('getConfig() returns a copy', function() {
    const test = new Test(this);
    const config = test.Comb.getConfig();
    (config['sort-order'] as string[][])[0].push('mutated');
    assert.deepEqual(test.Comb.getConfig(), defaultConfig);
  });

  it('getConfig(number)', function() {
    const test = new Test(this);
    assert.throws(() => test.Comb.getConfig(16 as unknown as string));
  });

  it('getConfig(boolean)', function() {
    const test = new Test(this);
    assert.throws(() => test.Comb.getConfig(true as unknown as string));
  });

  it('getConfig(empty string)', function() {
    const test = new Test(this);
    assert.deepEqual(test.Comb.getConfig(''), defaultConfig);
  });

  it('getConfig(invalid string)', function() {
    const test = new Test(this);
    assert.throws(() => test.Comb.getConfig('nani'));
  });

  it('getConfig(csscomb)', function() {
    const test = new Test(this);
    assert.deepEqual(test.Comb.getConfig('csscomb'), defaultConfig);
  });

  it('getConfig(zen) is no longer available', function() {
    const test = new Test(this);
    assert.throws(() => test.Comb.getConfig('zen'));
  });

  it('default config is accepted without warnings', function() {
    const test = new Test(this);
    const warn = console.warn;
    const warnings: unknown[] = [];
    console.warn = (...args: unknown[]) => warnings.push(args);
    try {
      test.comb.configure(test.Comb.getConfig());
    } finally {
      console.warn = warn;
    }
    assert.deepEqual(warnings, []);
  });

  it('default sort-order has no duplicates', function() {
    const properties = (defaultConfig['sort-order'] as string[][]).flat();
    assert.equal(new Set(properties).size, properties.length);
  });
});
