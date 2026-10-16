import gonzales from 'easy-gonz';
import type { Node } from 'easy-gonz';
import { defineOption } from '../option.ts';

export default defineOption({
  name: 'space-after-combinator',

  runBefore: 'block-indent',

  syntax: ['css', 'less', 'sass', 'scss'],

  accepts: {
    number: true,
    string: /^[ \t\n]*$/
  },

  /**
   * Processes tree node.
   */
  process(ast: Node) {
    const value = this.value;

    ast.traverseByType('combinator', function(combinator, i, parent) {
      const nextNode = parent.get(i + 1);

      // 选择器末尾的组合符(`a > {}`, `:is(a +)`, 缩进语法里换行前的 `+`)后面的空白归外层节点(`{` 前的空白, 换行)所有,
      // 在选择器里再补一个空格, 再解析时它会并进外层空白, 每格式化一次多一个空格
      if (!nextNode) return;

      if (combinator.syntax === 'sass') {
        // 缩进语法里换行结束语句, 不能并掉
        if (nextNode.is('space') && nextNode.content.indexOf('\n') !== -1) return;
        // 行首的 `+` 两种写法意义不同: `+ c` 是以组合符开头的选择器, `+c` 是 mixin 调用(解析器在顶层会把它当成选择器);
        // 去掉或补上空格都会把一种改成另一种, 原样保留. 跨行选择器里换行后的 `+` 同样在行首
        const prev = parent.get(i - 1);
        const lineStart = i === 0 || Boolean(prev) && prev!.is('space') && /[\n\r\f]/.test(prev!.content);
        if (lineStart && combinator.content === '+' && (value === '' || !nextNode.is('space'))) return;
      }

      if (nextNode && nextNode.is('space')) {
        nextNode.content = value;
      } else {
        const space = gonzales.createNode({
          type: 'space',
          content: value,
          syntax: ast.syntax
        });
        parent.insert(i + 1, space);
      }
    });
  },

  /**
   * Detects the value of an option at the tree node.
   */
  detect(ast: Node) {
    const detected: string[] = [];

    ast.traverseByType('combinator', function(combinator, i, parent) {
      const nextNode = parent.get(i + 1)!;

      if (nextNode.is('space')) {
        detected.push(nextNode.content);
      } else {
        detected.push('');
      }
    });

    return detected;
  }
});
