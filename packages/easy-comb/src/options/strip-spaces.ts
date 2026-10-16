import type { Node } from '#gonzales-pe';
import { defineOption } from '../option.ts';

/**
 * Trim trailing spaces on each line.
 * @private
 * @param string Spaceful string
 */
function trim(string: string): string {
  return string.replace(/[ \t]+\n/g, '\n');
}

// 结尾没有收尾符号的语句节点(缩进语法)
const OPEN_ENDED = ['block', 'ruleset', 'atrule', 'loop', 'conditionalStatement', 'mixin', 'include'];

/**
 * 从 node 末尾往前去掉行尾空格, 末尾是没有收尾符号的语句时进入其中继续.
 * @param atLineEnd 后面紧跟换行或文件结尾
 */
function stripTrailing(node: Node, atLineEnd: boolean): void {
  for (let k = node.length - 1; k >= 0; k--) {
    const child = node.get(k)!;
    if (child.is('space')) {
      if (atLineEnd) child.content = child.content.replace(/[ \t]+$/, '');
      atLineEnd = /^[ \t]*(?:\n|$)/.test(child.content);
      continue;
    }
    if (atLineEnd && OPEN_ENDED.indexOf(child.type) !== -1) stripTrailing(child, true);
    return;
  }
}

export default defineOption({
  name: 'strip-spaces',

  syntax: ['css', 'less', 'sass', 'scss'],

  accepts: {
    boolean: [true]
  },

  /**
   * Processes tree node.
   */
  process(ast: Node) {
    const lastChild = ast.last();
    if (lastChild && lastChild.is('space')) {
      lastChild.content = trim(lastChild.content)
          .replace(/[ \t]+$/, '')
          .replace(/[\n]+/g, '\n');
    }

    ast.traverseByType('space', function(space, index, parent) {
      space.content = trim(space.content);
      // 排序等选项会把空白拆成相邻的两个节点, 换行落在后一个节点里时行尾空格在前一个节点.
      const next = parent.get(index + 1);
      if (next && next.is('space') && /^[ \t]*\n/.test(next.content))
        space.content = space.content.replace(/[ \t]+$/, '');
    });

    // 缩进语法的块没有收尾的 `}`, 文件末尾的空白可能落在最后一个语句的块里(如 `@for ... //\n  `), 也去掉其中的行尾空格
    if (ast.syntax === 'sass') stripTrailing(ast, true);
  },

  detectDefault: true,

  /**
   * Detects the value of an option at the tree node.
   * This option is treated as `true` by default, but any trailing
   * space would invalidate it.
   */
  detect(ast: Node) {
    const detected: boolean[] = [];

    const lastChild = ast.last();
    if (lastChild && lastChild.is('space') &&
        lastChild.content !== '\n' &&
        lastChild.content.match(/^[ \n\t]+$/)) {
      detected.push(false);
    }

    ast.traverseByType('space', function(space) {
      if (space.content.match(/[ \t]\n/)) detected.push(false);
    });

    return detected;
  }
});
