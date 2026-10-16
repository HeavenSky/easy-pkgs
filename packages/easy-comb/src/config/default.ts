// 内置默认配置; 属性排序清单由 scripts/sort-order.ts 生成到 ./sort-order.ts.
import type { Config } from '../config.ts';
import sortOrder from './sort-order.ts';

const defaultConfig: Config = {
  'exclude': [
    '.git/**',
    'node_modules/**',
    'bower_components/**'
  ],
  'always-semicolon': true,
  'block-indent': 2,
  'color-case': 'lower',
  'color-shorthand': true,
  'element-case': 'lower',
  'eof-newline': true,
  'leading-zero': true,
  'lines-between-rulesets': 1,
  'quotes': 'double',
  'remove-empty-rulesets': true,
  'sort-order-fallback': 'abc',
  'space-after-colon': ' ',
  'space-after-combinator': ' ',
  'space-after-opening-brace': '\n',
  'space-after-selector-delimiter': ' ',
  'space-before-closing-brace': '\n',
  'space-before-colon': '',
  'space-before-combinator': ' ',
  'space-before-opening-brace': ' ',
  'space-before-selector-delimiter': '',
  'space-between-declarations': '\n',
  'strip-spaces': true,
  'tab-size': 2,
  'unitless-zero': true,
  'vendor-prefix-align': true,
  'sort-order': sortOrder
};

export default defaultConfig;
