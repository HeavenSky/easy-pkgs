import type { Node } from '#gonzales-pe';
import { defineOption } from '../option.ts';

export default defineOption({
  name: 'color-shorthand',

  syntax: ['css', 'less', 'sass', 'scss'],

  accepts: {
    boolean: [true, false]
  },

  /**
   * Processes ast and fixes found code style errors.
   */
  process(ast: Node) {
    const value = this.value;

    ast.traverseByType('color', function(color) {
      // 支持带 alpha 的 8 位/4 位写法, 必须整串匹配, 否则会截坏 `#0000004d`
      color.content = value ?
          color.content.replace(/^(\w)\1(\w)\2(\w)\3(?:(\w)\4)?$/i,
              '$1$2$3$4') :
          color.content.replace(/^(\w)(\w)(\w)(\w)?$/,
              (m: string, r: string, g: string, b: string, a?: string) =>
                  r + r + g + g + b + b + (a ? a + a : ''));
    });
  },

  /**
   * Detects the value of this option in ast.
   * @return List of detected values
   */
  detect(ast: Node) {
    const detected: boolean[] = [];

    ast.traverseByType('color', function(color) {
      if (color.content.match(/^\w{3}(\w)?$/)) {
        detected.push(true);
      } else if (color.content.match(/^(\w)\1(\w)\2(\w)\3(?:(\w)\4)?$/)) {
        detected.push(false);
      }
    });

    return detected;
  }
});
