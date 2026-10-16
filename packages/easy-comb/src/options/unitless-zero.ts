import type { Node } from 'easy-gonz';
import { defineOption } from '../option.ts';

// 值里的 `0px` 能否换成 `0` 而不改语义: 自定义属性与预处理器变量的值会被原样代入别处(`calc()`, `==` 比较),
// flex 简写里的无单位 0 会被当成 flex-shrink; 预处理器括号是运算或 map, 只放过 `@media (min-width: 0px)` 这类条件.
function keepsMeaning(node: Node, parent: Node | undefined, preprocessor: boolean) {
  if (node.is('parentheses')) return !preprocessor || !!(parent && parent.is('atrule'));
  if (!parent || !parent.is('declaration')) return !preprocessor;
  if (parent.first('customProperty')) return false;
  const property = parent.first('property');
  if (!property) return !preprocessor;
  if (property.first('variable')) return false;
  const name = property.toString().trim().toLowerCase().replace(/^-(webkit|moz|ms|o)-/, '');
  return name !== 'flex';
}

// 与第 i 个子节点隔着空白相邻的节点是否为算术运算符
function isOperator(node: Node, i: number, step: number) {
  for (let j = i + step; j >= 0 && j < node.length; j += step) {
    const n = node.get(j)!;
    if (n.is('space')) continue;
    return n.is('operator') && n.content !== ',' && n.content !== ':';
  }
  return false;
}

export default defineOption({
  name: 'unitless-zero',

  syntax: ['css', 'less', 'sass', 'scss'],

  accepts: {
    boolean: [true]
  },

  /**
   * Processes tree node.
   * 只去掉与无单位 0 等价的长度单位; `0%` 不动(`flex: 1 0%`, `text-size-adjust`, Sass 颜色函数等处与 0 不等价).
   */
  process(ast: Node) {
    const UNITS = ['cm', 'em', 'ex', 'pt', 'px'];
    const preprocessor = ast.syntax !== 'css';

    ast.traverseByTypes(['value', 'parentheses'], function(node, _index, parent) {
      if (!keepsMeaning(node, parent, preprocessor)) return;

      node.forEach(function(value, i) {
        if (typeof value === 'string' || !value.is('dimension')) return;
        const unit = value.first('ident')!.content;
        if (value.first('number')!.content !== '0' || UNITS.indexOf(unit) === -1) return;
        // 预处理器里参与运算的 `0px` 带着单位参与换算与比较(`0px + 1pt`, `-0px * 1em`), 不能去掉
        if (preprocessor && (isOperator(node, i, -1) || isOperator(node, i, 1))) return;
        value.removeChild(1);
      });
    });
  },

  /**
   * Detects the value of an option at the tree node.
   */
  detect(ast: Node) {
    const detected: boolean[] = [];

    ast.traverse(function(node, index, parent) {
      // If we see a zero with unit and it is not degree,
      // then we don’t have an option
      if (node.is('percentage') &&
          node.first('number')!.content[1] === '0') {
        detected.push(false);
        return;
      }

      if (node.is('dimension') &&
          node.first('number')!.content === '0' &&
          node.first('ident')!.content !== 'deg') {
        detected.push(false);
        return;
      }

      // If we see a zero and previous node is not percentage
      // or dimension, then we have an option
      if (node.is('number') &&
          node.content === '0' &&
          !parent.is('percentage') &&
          !parent.is('dimension')) {
        detected.push(true);
      }
    });

    return detected;
  }
});
