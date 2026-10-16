import gonzales from '#gonzales-pe';
import type { Node } from '#gonzales-pe';
import { defineOption } from '../option.ts';

export default defineOption({
  name: 'space-before-combinator',

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
      const previousNode = parent.get(i - 1);

      if (!previousNode) return;

      // 缩进语法里换行结束语句, 不能并掉
      if (combinator.syntax === 'sass' && previousNode.is('space') &&
          previousNode.content.indexOf('\n') !== -1) return;

      if (previousNode.is('space')) {
        previousNode.content = value;
      } else {
        const space = gonzales.createNode({
          type: 'space',
          content: value,
          syntax: ast.syntax
        });
        parent.insert(i, space);
      }
    });
  },

  /**
   * Detects the value of an option at the tree node.
   */
  detect(ast: Node) {
    const detected: string[] = [];

    ast.traverseByType('combinator', function(combinator, i, parent) {
      const previousNode = parent.get(i - 1);

      if (previousNode && previousNode.is('space')) {
        detected.push(previousNode.content);
      } else {
        detected.push('');
      }
    });

    return detected;
  }
});
