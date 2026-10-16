import gonzales from 'easy-gonz';
import type { Node } from 'easy-gonz';
import { defineOption } from '../option.ts';

export default defineOption({
  name: 'space-before-selector-delimiter',

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
      if (parent.is('arguments')) return;

      const previousNode = parent.get(i - 1);

      if (previousNode && previousNode.is('space')) {
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

    ast.traverseByType('delimiter', function(delimiter, i, parent) {
      if (parent.is('arguments')) return;

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
