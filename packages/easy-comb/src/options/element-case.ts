import type { Node } from '#gonzales-pe';
import { defineOption } from '../option.ts';

// 参数是选择器的伪类; 其余伪类的参数(如 `:lang(EN)`, `:state(Foo)`)不是元素名
const SELECTOR_ARGUMENTS = /^(?:not|is|where|has|matches|-(?:moz|webkit)-any|any|host|host-context|slotted|cue|current|past|future|nth-(?:last-)?(?:child|of-type))$/i;

/**
 * scss / sass 里 `&` 出现在值或插值中(`a: &`, `#{&}`)时, 外层规则的选择器原文会进入输出的值或拼出的名字,
 * 这些规则的元素名大小写不能改. 返回这样的规则集合.
 */
function rulesetsWithObservedSelector(ast: Node): Set<Node> {
  const observed = new Set<Node>();
  if (ast.syntax !== 'scss' && ast.syntax !== 'sass') return observed;

  (function walk(node: Node, rulesets: Node[], inSelector: boolean) {
    if (node.is('parentSelector') && !inSelector) {
      for (const ruleset of rulesets) observed.add(ruleset);
      return;
    }
    if (!Array.isArray(node.content)) return;
    const own = node.is('ruleset') ? [...rulesets, node] : rulesets;
    for (const child of node.content as Node[]) {
      const selector = child.is('selector') ? true : child.is('interpolation') ? false : inSelector;
      walk(child, own, selector);
    }
  })(ast, [], false);

  return observed;
}

// 按遍历顺序(父先于子)收集元素名所在的 selector / arguments 节点, 跳过非选择器伪类参数的整棵子树
function eachElementList(ast: Node, callback: (node: Node) => void) {
  const skipped = new Set<Node>();
  const observed = rulesetsWithObservedSelector(ast);

  ast.traverse((node, i, parent) => {
    if (parent && skipped.has(parent)) {
      skipped.add(node);
      return;
    }

    if (node.is('selector') && parent && observed.has(parent)) {
      skipped.add(node);
      return;
    }

    if (node.is('arguments') && parent &&
        (parent.is('pseudoClass') || parent.is('pseudoElement'))) {
      const name = parent.first('ident');
      if (name && !SELECTOR_ARGUMENTS.test(name.content)) {
        skipped.add(node);
        return;
      }
    }

    if (node.is('selector') || node.is('arguments')) callback(node);
  });
}

// 只改 ASCII 字母, 转义序列(`\212A`)与非 ASCII 字符原样保留, 否则会改变匹配的元素名
function convertCase(name: string, value: string): string {
  return name.replace(/(\\(?:[0-9a-fA-F]{1,6}\s?|[\s\S]))|[A-Za-z]+/g, (m, escape) =>
    escape ? escape : value === 'lower' ? m.toLowerCase() : m.toUpperCase());
}

export default defineOption({
  name: 'element-case',

  syntax: ['css', 'less', 'sass', 'scss'],

  accepts: {
    string: /^(?:lower|upper)$/
  },

  /**
   * Processes ast and fixes found code style errors.
   */
  process(ast: Node) {
    const value = this.value;

    eachElementList(ast, (node) => {

      node.forEach('typeSelector', (selector) => {
        // 含插值的 typeSelector(如 `#{$b}-fooBar`)实为拼接出的名字, 不改大小写.
        if (selector.contains('interpolation')) return;

        selector.forEach('ident', (ident) => {
          ident.content = convertCase(ident.content, value);
        });
      });
    });
  },

  /**
   * Detects the value of this option in ast.
   * @return List of detected values
   */
  detect(ast: Node) {
    const detected: string[] = [];

    eachElementList(ast, (node) => {

      node.forEach('typeSelector', (selector) => {
        if (selector.contains('interpolation')) return;

        selector.forEach('ident', (ident) => {
          if (ident.content.match(/^[a-z]+$/)) {
            detected.push('lower');
          } else if (ident.content.match(/^[A-Z]+$/)) {
            detected.push('upper');
          }
        });
      });
    });

    return detected;
  }
});
