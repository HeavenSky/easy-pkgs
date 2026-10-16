import gonzales from '#gonzales-pe';
import type { Node } from '#gonzales-pe';
import { defineOption } from '../option.ts';

export default defineOption({
  name: 'space-after-colon',

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
        return null;

      const next = parent.get(i + 1);
      // `a::foo(1) {}` 被解析成值以 `:` 开头的声明, 补空格会把伪元素拆开
      if (next && next.is('value') && next.first() && next.first()!.is('operator') &&
          next.first()!.content === ':')
        return null;
      // `url-prefix(https://...)` 等函数参数里的网址被解析成 `https` 为属性名的声明, 补空格会改掉网址
      if (next && next.is('value') && next.length > 1 && next.get(0)!.is('operator') &&
          next.get(0)!.content === '/' && next.get(1)!.is('operator') && next.get(1)!.content === '/')
        return null;
      // 缩进语法里冒号后紧跟标识符(`a:hover`, `baz:bam`)时 dart-sass 按选择器解析, 补空格会变成声明
      if (delimiter.syntax === 'sass' && next && !next.is('space') && !parent.first('customProperty') &&
          /^(?:[a-zA-Z_\u0080-\uffff\\]|-[^\d.])/.test(next.toString()))
        return null;

      // 缩进语法里冒号后换行表示值是嵌套属性块, 换行不能去掉
      if (delimiter.syntax === 'sass' && next && next.is('space') && next.content.indexOf('\n') !== -1)
        return null;

      // Remove any spaces after colon:
      if (parent.get(i + 1) && parent.get(i + 1)!.is('space'))
          parent.removeChild(i + 1);
      // If the value set in config is not empty, add spaces:
      if (value !== '') {
        const space = gonzales.createNode({
          type: 'space',
          content: value,
          syntax: ast.syntax
        });
        parent.insert(i + 1, space);
      }

      return null;
    });
  },

  /**
   * Detects the value of an option at the tree node.
   */
  detect(ast: Node) {
    const detected: string[] = [];

    ast.traverseByType('propertyDelimiter', function(delimiter, i, parent) {
      const nextNode = parent.get(i + 1)!;

      if (nextNode.is('space')) {
        detected.push(nextNode.content);
      } else {
        detected.push('');
      }
    });

    return detected;
  }
});
