import type { Node } from 'easy-gonz';
import { defineOption } from '../option.ts';
import { text } from '../node.ts';

export default defineOption({
  name: 'color-case',

  syntax: ['css', 'less', 'sass', 'scss'],

  accepts: {
    string: /^(?:lower|upper)$/
  },

  /**
   * Processes ast and fixes found code style errors.
   */
  process(ast: Node) {
    const value = this.value;

    ast.traverseByType('color', function(color) {
      color.content = value === 'lower' ?
          text(color).toLowerCase() :
          text(color).toUpperCase();
    });
  },

  /**
   * Detects the value of this option in ast.
   * @return List of detected values
   */
  detect(ast: Node) {
    const detected: string[] = [];

    ast.traverseByType('color', function(color) {
      if (text(color).match(/^[^A-F]*[a-f][^A-F]*$/)) {
        detected.push('lower');
      } else if (text(color).match(/^[^a-f]*[A-F][^a-f]*$/)) {
        detected.push('upper');
      }
    });

    return detected;
  }
});
