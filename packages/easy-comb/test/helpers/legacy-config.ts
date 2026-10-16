// 旧版内置 csscomb 预设, 供依赖其排序清单与取值的回归用例使用, 与当前默认配置无关.
import { readFileSync } from 'node:fs';
// 用例会就地修改其中的 sort-order, 所以返回宽松类型.
export default function legacyConfig(): Record<string, any> {
  return JSON.parse(readFileSync(new URL('../fixtures/csscomb-legacy.json', import.meta.url), 'utf8'));
}
