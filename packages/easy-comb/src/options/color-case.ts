import type { Node } from 'easy-gonz';
import { defineOption } from '../option.ts';

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
          color.content.toLowerCase() :
          color.content.toUpperCase();
    });
  },

  /**
   * Detects the value of this option in ast.
   * @return List of detected values
   */
  detect(ast: Node) {
    const detected: string[] = [];

    ast.traverseByType('color', function(color) {
      if (color.content.match(/^[^A-F]*[a-f][^A-F]*$/)) {
        detected.push('lower');
      } else if (color.content.match(/^[^a-f]*[A-F][^a-f]*$/)) {
        detected.push('upper');
      }
    });

    return detected;
  }
});
