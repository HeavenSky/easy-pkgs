import type { Node } from 'easy-gonz';
import { defineOption } from '../option.ts';
import { text } from '../node.ts';

export default defineOption({
  name: 'tab-size',

  runBefore: 'vendor-prefix-align',

  syntax: ['css', 'less', 'sass', 'scss'],

  accepts: {
    number: true
  },

  /**
   * Processes tree node.
   */
  process(ast: Node) {
    const value = this.value;

    ast.traverseByType('space', function(space) {
      space.content = text(space).replace(/\t/, value);
    });
  },

  /**
  * Detects the value of this option in ast.
  * @return List of detected values
  */
  detect(ast: Node) {
    const detected: number[] = [];

    ast.forEach(node => {
      if (node.is('ruleset') || node.is('atrule')) {
        // spaces 先后存放数字, 去换行后的字符串与匹配结果, 沿用原逻辑故用 any.
        let spaces: any = 0;
        let tabs: RegExpMatchArray | null | number = 0;
        let tabsize: number | 'detected' | undefined;

        node.forEach(block => {
          if (block && block.is('block')) {
            block.forEach(blockContent => {
              // The indent before the very first property declaration in the
              // block usually has a length of one tab or the number of
              // whitespaces set for a tab. Because there might be nested
              // blocks having incremented indent, we continue to the next root
              // block in the each ruleset where tabsize is not detected yet.
              if (tabsize !== 'detected') {
                if (blockContent.is('space')) {
                  spaces = text(blockContent).replace(/\n/g, '');
                  tabs = spaces.match(/\t/g);
                  spaces = spaces.match(/( )/g);
                  if (tabs) {
                    // It is a very rare case when tabs are used in a file
                    // instead of whitespaces and it requires a lot of efforts
                    // to find the tab size in a particular environment. So we
                    // imply that tab size = 2.
                    tabsize = 2;
                  } else if (spaces) {
                    tabsize = spaces.length;
                  }
                } else if (tabsize && blockContent.is('declaration')) {
                  detected.push(tabsize);
                  tabsize = 'detected';
                }
              }
            });
          }
        });
      }
    });

    return detected;
  }
});
