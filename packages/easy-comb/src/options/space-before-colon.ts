import gonzales from 'easy-gonz';
import type { Node } from 'easy-gonz';
import { defineOption } from '../option.ts';

export default defineOption({
  name: 'space-before-colon',

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

    ast.traverseByType('propertyDelimiter', function(delimiter, i, parent) {
      if (delimiter.syntax === 'sass' && !parent.get(i - 1))
        return;

      // `//` 注释后的换行是注释的结束符, 不能去掉
      const before = parent.get(i - 2);
      if (parent.get(i - 1)!.is('space') && before && before.is('singlelineComment')) return;

      // Remove any spaces before colon:
      if (parent.get(i - 1)!.is('space')) {
        parent.removeChild(--i);
      }

      // If the value set in config is not empty, add spaces:
      if (value !== '') {
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

    ast.traverseByType('propertyDelimiter', function(delimiter, i, parent) {
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
