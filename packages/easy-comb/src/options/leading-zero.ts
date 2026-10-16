import type { Node } from 'easy-gonz';
import { defineOption } from '../option.ts';
import { text, children } from '../node.ts';

export default defineOption({
  name: 'leading-zero',

  syntax: ['css', 'less', 'sass', 'scss'],

  accepts: {
    boolean: [true, false]
  },

  /**
   * Processes tree node.
   */
  process(ast: Node) {
    const value = this.value;

    const fix = (number: Node, prev: Node | undefined) => {
      if (!value) {
        number.content = text(number).replace(/^0+(?=\.)/, '');
      } else if (number.content[0] === '.') {
        // 紧跟在数字或标识符后(`3e-2.1`)时补零会与前一个 token 粘连, 变成 `3e-20.1`
        if (prev && /\w$/.test(prev.toString())) return;
        number.content = '0' + number.content;
      }
    };

    ast.traverse(function(node) {
      // dimension 里的数字由其父节点处理, 那里才知道前一个 token
      if (!Array.isArray(node.content) || node.is('dimension')) return;
      node.content.forEach(function(child: Node, i: number) {
        const prev = children(node)[i - 1];
        if (child.is('number')) fix(child, prev);
        else if (child.is('dimension')) {
          const number = child.first();
          if (number?.is('number')) fix(number, prev);
        }
      });
    });
  },

  /**
   * Detects the value of an option at the tree node.
   */
  detect(ast: Node) {
    const detected: boolean[] = [];

    ast.traverseByType('number', function(number) {
      if (text(number).match(/^\.[0-9]+/)) {
        detected.push(false);
      } else if (text(number).match(/^0\.[0-9]+/)) {
        detected.push(true);
      }
    });

    return detected;
  }
});
