import gonzales from '#gonzales-pe';
import type { Node } from '#gonzales-pe';
import { defineOption } from '../option.ts';

export default defineOption({
  name: 'space-before-opening-brace',

  runBefore: 'block-indent',

  syntax: ['css', 'less', 'scss'],

  accepts: {
    number: true,
    string: /^[ \t\n]*$/
  },

  /**
   * Processes tree node.
   */
  process(ast: Node) {
    const value = this.value;

    // If found block node stop at the next one for space check.
    ast.traverseByTypes(['block', 'value'], function(block, i, parent) {
      if (block.is('value') && !block.first()?.is('block')) return;

      const previousNode = parent.get(i - 1);
      if (!previousNode) return;

      // `//` 注释后的换行是注释的结束符, 改成空格会让注释吞掉 `{`
      if (previousNode.is('space') && parent.get(i - 2) && parent.get(i - 2)!.is('singlelineComment')) return;

      // less 的 `when (...)` 守卫把 `{` 前的空白收进了 condition 节点, 改它而不是再补一个
      const trailing = previousNode.is('condition') ? previousNode.last() : null;
      if (trailing && trailing.is('space')) {
        trailing.content = value;
        return;
      }

      // If it's spaces, modify this node.
      // If it's something different from spaces, add a space node to
      // the end:
      if (previousNode.is('space')) {
        previousNode.content = value;
      } else if (value !== '') {
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

    ast.traverseByTypes(['block', 'value'], function(block, i, parent) {
      if (block.is('value') && !block.first()?.is('block')) return;

      const previousNode = parent.get(i - 1);
      if (!previousNode) return;

      // If it's spaces, modify this node.
      // If it's something different from spaces, add a space node to
      // the end:
      if (previousNode.is('space')) {
        detected.push(previousNode.content);
      } else {
        detected.push('');
      }
    });

    return detected;
  }
});
