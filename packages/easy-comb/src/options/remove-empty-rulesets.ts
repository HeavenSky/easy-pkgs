import type { Node } from 'easy-gonz';
import { defineOption } from '../option.ts';

function processNode(node: Node, targets: string[]) {
  // 只在删过规则集的节点里合并空白: 缩进 Sass 本来就会解析出相邻的空白节点,
  // 无删除时也合并会改变后续选项看到的结构, 使格式化结果不幂等
  if (removeEmptyRulesets(node, targets)) mergeAdjacentWhitespace(node);
}

function removeEmptyRulesets(stylesheet: Node, targets: string[]) {
  let removed = false;
  // 下钻 `@media` 等带块的 at-rule, 处理其中的规则集.
  stylesheet.forEach('atrule', function(atrule) {
    const block = atrule.first('block');
    if (block) processNode(block, targets);
  });

  stylesheet.forEach('ruleset', function(ruleset, i) {
    // 缩进 Sass 里选择器跨行等写法会解析出不带块的规则集, 原样保留
    const block = ruleset.first('block');
    if (!block) return;
    processNode(block, targets);
    if (isEmptyBlock(block) && !isReferenced(ruleset, targets)) {
      stylesheet.removeChild(i);
      removed = true;
    }
  });
  return removed;
}

/**
 * 被引用的选择器名: Sass `@extend` 的目标与 Less mixin 调用的名字.
 * 删掉唯一含有它的空规则集会让 `@extend` 找不到目标, mixin 调用变成未定义, 编译报错.
 */
function collectTargets(ast: Node) {
  const targets: string[] = [];
  ast.traverseByTypes(['extend', 'include'], function(node) {
    node.traverseByTypes(['class', 'id', 'placeholder'], function(name) {
      targets.push(name.toString());
    });
  });
  return targets;
}

/**
 * 空规则集仍有作用的情形: 选择器带 Less `:extend()`(把它的选择器追加到别的规则上),
 * 是 Sass 占位选择器, 或含有被 `@extend` / mixin 调用引用的名字.
 */
function isReferenced(ruleset: Node, targets: string[]) {
  let used = false;
  // `a, b` 解析成多个并列的 selector 节点
  ruleset.forEach('selector', function(selector) {
    selector.traverse(function(node) {
      if (node.is('placeholder')) used = true;
      else if (node.is('pseudoClass') && node.first('ident')?.content === 'extend') used = true;
      else if ((node.is('class') || node.is('id')) && targets.indexOf(node.toString()) !== -1) used = true;
    });
  });
  return used;
}

/**
 * Removing ruleset nodes from tree may result in two adjacent whitespace
 * nodes which is not correct AST:
 * [space, ruleset, space] => [space, space]
 * To ensure correctness of further processing we should merge such nodes
 * into one:
 * [space, space] => [space]
 */
function mergeAdjacentWhitespace(node: Node) {
  let i = node.content.length - 1;
  while (i-- > 0) {
    if (node.get(i)!.is('space') &&
        node.get(i + 1) && node.get(i + 1)!.is('space')) {
      node.get(i)!.content += node.get(i + 1)!.content;
      node.removeChild(i + 1);
    }
  }
}

/**
 * Block is considered empty when it has nothing but spaces.
 */
function isEmptyBlock(node: Node) {
  if (!node.length) return true;

  return !node.content.some(function(node: Node) {
    return !node.is('space');
  });
}

export default defineOption({
  name: 'remove-empty-rulesets',

  runBefore: 'block-indent',

  syntax: ['css', 'less', 'sass', 'scss'],

  accepts: {
    boolean: [true]
  },

  /**
   * Remove rulesets with no declarations.
   */
  process(ast: Node) {
    processNode(ast, collectTargets(ast));
  },

  detectDefault: true,

  /**
   * Detects the value of an option at the tree node.
   * This option is treated as `true` by default, but any trailing space
   * would invalidate it.
   */
  detect(ast: Node) {
    const detected: boolean[] = [];

    ast.traverse(function(node) {
      if (!node.is('atrulers') && !node.is('block')) return;

      if (node.length === 0 ||
          (node.length === 1 && node.first()!.is('space'))) {
        detected.push(false);
      }
    });

    return detected;
  }
});
