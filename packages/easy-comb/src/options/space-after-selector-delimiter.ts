import gonzales from 'easy-gonz';
import type { Node } from 'easy-gonz';
import { text } from '../node.ts';
import { defineOption } from '../option.ts';

export default defineOption({
  name: 'space-after-selector-delimiter',

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

    ast.traverseByType('delimiter', function(delimiter, i, parent) {
      if (!parent || i === undefined) return;
      if (parent.is('arguments')) return;

      const nextNode = parent.get(i + 1);
      if (!nextNode) return;

      // 缩进语法里 `@extend a,` 后的换行结束语句(下一行不属于 @extend), 不能并掉
      if (parent.is('extend') && parent.syntax === 'sass' && nextNode.is('space') &&
          text(nextNode).indexOf('\n') !== -1) return;

      if (nextNode.is('space')) {
        nextNode.content = value;
        // 缩进语法里逗号后续行的换行与缩进是相邻的两个空白节点, 一并换掉, 否则要再格式化一次才稳定
        if (parent.syntax === 'sass') {
          while (parent.get(i + 2) && parent.get(i + 2)!.is('space')) parent.removeChild(i + 2);
        }
      } else if (!Array.isArray(nextNode.content)) {
        // 连续的逗号(`a,, b`)之间没有可放空白的子节点
        return;
      } else if (nextNode.first() && nextNode.first()!.is('space')) {
        nextNode.first()!.content = value;
      } else {
        const space = gonzales.createNode({
          type: 'space',
          content: value,
          syntax: ast.syntax
        });
        nextNode.insert(0, space);
      }
    });
  },

  /**
   * Detects the value of an option at the tree node.
   */
  detect(ast: Node) {
    const detected: string[] = [];

    ast.traverseByType('delimiter', function(delimiter, i, parent) {
      if (!parent || i === undefined) return;
      if (parent.is('arguments')) return;

      const nextNode = parent.get(i + 1)!;

      if (nextNode && nextNode.is('space')) {
        detected.push(text(nextNode));
      } else if (nextNode.first() && nextNode.first()!.is('space')) {
        detected.push(text(nextNode.first()!));
      } else {
        detected.push('');
      }
    });

    return detected;
  }
});
