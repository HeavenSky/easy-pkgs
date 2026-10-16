// 全局 setup: 设置 TEST_TRACE=1 时在每个用例前打印所属文件与用例路径, 便于把日志对应到用例.
import { relative } from 'node:path';

if (process.env.TEST_TRACE) {
  beforeEach(function() {
    const { file, parent, title } = this.currentTest || {};
    const cases = [title];
    let node = parent;
    while (node && node.title) {
      cases.unshift(node.title);
      node = node.parent;
    }
    console.log(`\tsuite: ${relative(process.cwd(), file || '')}`);
    console.log(`\tcase: ${cases.join(' -> ')}`);
  });
}
