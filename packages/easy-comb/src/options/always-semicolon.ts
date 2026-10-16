import gonzales from 'easy-gonz';
import type { Node } from 'easy-gonz';
import { defineOption } from '../option.ts';
import type { LintError } from '../option.ts';

export default defineOption({
  /**
   * Option's name as it's used in config.
   */
  name: 'always-semicolon',

  /**
   * List of syntaxes that are supported by this option.
   */
  syntax: ['css', 'less', 'sass', 'scss'],

  /**
   * Types of values this option accepts in config.
   */
  accepts: {
    boolean: [true]
  },

  /**
   * Checks ast for code style errors.
   *
   * @return List of found errors.
   */
  lint(ast: Node) {
    const errors: LintError[] = [];

    ast.traverseByType('block', (block) => {
      block.eachFor((currentNode) => {
        let nodeWithoutSemicolon: Node;
        // Skip nodes that already have `;` at the end:
        if (currentNode.is('declarationDelimiter')) return null;

        // Add semicolon only after declarations and includes.
        // If current node is include, insert semicolon right into it.
        // If it's declaration, look for value node:
        if (currentNode.is('include') ||
            currentNode.is('extend')) {
          nodeWithoutSemicolon = currentNode;
        } else if (currentNode.is('declaration')) {
          nodeWithoutSemicolon = currentNode.last('value')!;
        } else {
          return;
        }

        errors.push({
          message: 'Missing semicolon',
          line: nodeWithoutSemicolon.end.line,
          column: nodeWithoutSemicolon.end.column + 1
        });

        // Stop looping through block's children:
        return null;
      });
    });

    return errors;
  },

  /**
   * Processes ast and fixes found code style errors.
   */
  process(ast: Node) {
    let nodeWithoutSemicolon: Node;

    // 缩进语法以换行结束语句, 不补分号; 文件末尾没有换行的最后一条声明也一样
    if (ast.syntax === 'sass') return;

    // 自定义属性值里的 `{}` 是原样保留的记号, 不是规则块, 里面不补分号
    const rawBlocks = new Set<Node>();
    ast.traverseByType('declaration', (declaration) => {
      if (!declaration.first('customProperty')) return;
      declaration.traverseByType('block', (block) => {
        rawBlocks.add(block);
      });
    });

    ast.traverseByType('block', (block) => {
      if (rawBlocks.has(block)) return;
      let lineComment = false;
      block.eachFor((currentNode) => {
        // Skip nodes that already have `;` at the end:
        if (currentNode.is('declarationDelimiter')) return null;

        // 自定义属性的值里 `//` 不是注释(scss / sass 编译时整段保留), 后面补分号会把它切出值外
        if (currentNode.is('singlelineComment')) lineComment = true;
        if (lineComment && currentNode.is('declaration') && currentNode.first('customProperty')) return null;

        // Add semicolon only after declarations and includes.
        // If current node is include, insert semicolon right into it.
        // If it's declaration, look for value node:
        if (currentNode.is('include') ||
            currentNode.is('extend')) {
          nodeWithoutSemicolon = currentNode;
        } else if (currentNode.is('declaration')) {
          nodeWithoutSemicolon = currentNode.last('value')!;
        } else {
          return;
        }

        // Check if there are spaces and comments at the end of the node
        let j: number;
        for (j = nodeWithoutSemicolon.length; j--;) {
          const lastNode = nodeWithoutSemicolon.get(j)!;

          // If the node's last child is block (scss / less nested
          // properties), do not add semicolon; a css value ending with `{}`
          // still needs one:
          if (lastNode.is('block') && lastNode.syntax !== 'css') {
            return null;
          } else if (!lastNode.is('space') &&
                     !lastNode.is('multilineComment') &&
                     !lastNode.is('singlelineComment')) {
            j++;
            break;
          }
        }

        const declDelim = gonzales.createNode({
          type: 'declarationDelimiter',
          content: ';',
          syntax: nodeWithoutSemicolon.syntax
        });
        nodeWithoutSemicolon.insert(j, declDelim);
        return null;
      });
    });
  },

  /**
   * Detects the value of this option in ast.
   * @return List of detected values
   */
  detect(ast: Node) {
    const detected: boolean[] = [];

    ast.traverseByType('block', (block) => {
      block.eachFor((node) => {
        if (node.is('declarationDelimiter')) {
          detected.push(true);
          return null;
        } else if (node.is('declaration')) {
          detected.push(false);
          return null;
        }
      });
    });

    return detected;
  }
});
