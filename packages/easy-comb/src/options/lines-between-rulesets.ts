import gonzales from 'easy-gonz';
import type { Node } from 'easy-gonz';
import { defineOption } from '../option.ts';
import { text, children } from '../node.ts';

const IMPORT_LIKE = ['import', 'use', 'forward', 'charset'];

export default defineOption({
  newLinesString: '',

  /**
   * Option's name as it's used in config.
   */
  name: 'lines-between-rulesets',

  /**
   * Name of option that must run after this option.
   * 要排在 sort-order 之后: 它会把嵌套规则与 @-规则挪到声明后面, 先插空行时挪过来的规则前没有空行, 要到下一次格式化才补上, 不幂等.
   * 也在 block-indent 之后, 缩进已经定好, 插空行时保留最后一个换行后的缩进即可.
   */
  runBefore: 'strip-spaces',

  /**
   * List of syntaxes that are supported by this option.
   */
  syntax: ['css', 'less', 'sass', 'scss'],

  /**
   * Types of values this option accepts in config.
   */
  accepts: {
    number: true
  },

  /*
  ** Still need to override, as the core implementation of setValue doesn't
  ** pass numbers through, but creates a string of spaces of the same length.
  */
  setValue(value: unknown): number {
    let valueType = typeof value;

    if (valueType !== 'number') {
      throw new Error('Value must be a number.');
    }

    return value as number;
  },

  buildSpacing(syntax: string | undefined): string {
    let spacing = '';
    let numNewLines = 0;
    let newLinesOffset = 1;

    if (syntax === 'sass') {
      newLinesOffset = 0;
    }

    numNewLines = Math.round(this.value) + newLinesOffset;

    for (let i = 0; i < numNewLines; i++) {
      spacing += '\n';
    }

    return spacing;
  },

  /**
   * Processes ast and fixes found code style errors.
   */
  process(ast: Node) {
    this.newLinesString = this.buildSpacing(ast.syntax);
    this.processBlock(ast);
  },

  processBlock(x: Node): void {
    if (x.is('stylesheet')) {
      // Check all @rules
      this.processAtRules(x);

      // Check all rulesets
      this.processRuleSets(x);
    }

    x.forEach((node) => {
      if (!node.is('block')) {
        return this.processBlock(node);
      }

      // Check all @rules
      this.processAtRules(node);

      // Check all rulesets
      this.processRuleSets(node);

      this.processBlock(node);
    });
  },

  processAtRules(node: Node): void {
    node.forEach('atrule', (atRuleNode, index) => {
      // 连续的 `@import` 类语句之间不插空行.
      if (this.isImportLike(atRuleNode) &&
          this.isImportLike(this.findPrevStatement(node, index))) return;
      this.insertNewlines(node, index);
    });
  },

  isImportLike(node: Node | null): boolean {
    if (!node || !node.is('atrule')) return false;
    let atkeyword = node.first('atkeyword');
    let ident = atkeyword && atkeyword.first('ident');
    return Boolean(ident) && IMPORT_LIKE.indexOf(text(ident!)) !== -1;
  },

  findPrevStatement(parent: Node, index: number): Node | null {
    for (let i = index - 1; i >= 0; i--) {
      let node = parent.get(i)!;
      if (!node.is('space') && !node.is('declarationDelimiter')) return node;
    }
    return null;
  },

  processRuleSets(node: Node): void {
    node.forEach('ruleset', (ruleSetNode, index) => {
      this.insertNewlines(node, index);
    });
  },

  isComment(node: Node | null): boolean {
    if (!node) {
      return false;
    }
    return (node.is('singlelineComment') || node.is('multilineComment'));
  },

  /**
   * 注释是否独占一行(前面直到上一条语句之间有换行, 或是父节点里的第一条内容); 与上一条语句同行的行尾注释属于上一条语句, 空行不能插到它前面.
   */
  isOwnLineComment(parent: Node, commentIndex: number): boolean {
    let run = '';
    let i = commentIndex - 1;
    for (; i >= 0 && parent.get(i)!.is('space'); i--) run = parent.get(i)!.content + run;
    if (i < 0) return true;
    const prev = parent.get(i)!;
    if (!prev.syntax) prev.syntax = parent.syntax;
    return /[\n\r\f]\s*$/.test(prev.toString() + run);
  },

  /**
   * 空行插入点: 规则前独占一行或紧贴着它的注释算作规则的一部分, 空行插到它们前面.
   * 返回插入点前的节点(其后的空白, 或没有空白时该节点本身)的下标; 前面没有别的语句时返回 -1.
   * 缩进语法把换行与缩进拆成多个 space 节点, 这里按连续的空白段处理, 不按固定的节点个数跳.
   */
  findInsertionIndex(parent: Node, index: number): number {
    let i = index - 1;
    for (;;) {
      let j = i;
      while (j >= 0 && parent.get(j)!.is('space')) j--;
      if (j < 0) return -1;
      // 紧贴在后面内容前的注释(`}/* c */.b {}`)也算作规则的一部分
      if (this.isComment(parent.get(j)) && (j === i || this.isOwnLineComment(parent, j))) {
        i = j - 1;
        continue;
      }
      return i;
    }
  },

  insertNewlines(node: Node, index: number): void {
    let prevChild = node.get(index - 1);
    let shouldInsert = false;

    // Check for previous nodes that are not a space
    // Do not insert if the ruleset is the first item
    for (let i = 0; i < index; i++) {
      if (!node.get(i)!.is('space')) {
        shouldInsert = true;
        break;
      }
    }

    if (prevChild && shouldInsert) {
      prevChild = node.get(this.findInsertionIndex(node, index));
      if (!prevChild) return;

      if (prevChild.is('space')) {
        // 缩进语法把空行与下一行的缩进解析成相邻的两个 space 节点(`\n`, `  `), 只改最后一个时前面的空行会留下来, 每格式化一次多一个空行;
        // 先把相邻的 space 并进最后一个再计算
        let first = children(node).indexOf(prevChild);
        while (first > 0 && node.get(first - 1)!.is('space')) first--;
        let merged = '';
        for (let i = first; i < children(node).indexOf(prevChild); i++) {
          const space = node.get(i)!;
          merged += space.content;
          space.content = '';
        }
        const before = node.get(first - 1);
        if (before) merged = this.takeTrailingSpace(before) + merged;
        const indent = before ? this.lineIndent(node, before) : '';
        prevChild.content = this.spacing(merged + prevChild.content, before, node.syntax, indent);
      } else {
        // 每次插入新节点: 共享同一实例时, 后续选项改一处会波及所有插入点.
        const moved = this.takeTrailingSpace(prevChild);
        const content = this.spacing(moved, prevChild, node.syntax, this.lineIndent(node, prevChild));
        prevChild.insert(prevChild.length, gonzales.createNode({type: 'space', content, syntax: node.syntax}));
      }
    }
  },

  /**
   * 取出并清空节点文本末尾的空白叶子. 缩进语法里上一条语句末尾的空行常被解析进它最深的末尾节点(块, `@extend` 的选择器等),
   * 不并进来计算时这些空行会留在原处, 再补的空行叠在后面, 每格式化一次多一个空行.
   * 带收尾定界符的节点(`{}`, `()`, 注释等)不往里找.
   */
  takeTrailingSpace(node: Node): string {
    const spaces: Node[] = [];
    (function collect(n: Node): boolean {
      const text = n.toString();
      if (!Array.isArray(n.content)) {
        if (n.is('space')) {
          spaces.unshift(n);
          return true;
        }
        return text === '';
      }
      // 其他选项新建的节点可能没有 syntax, 它的 toString 会输出 `undefined`
      const inner = n.content.map((child: Node) => {
        if (!child.syntax) child.syntax = n.syntax;
        return child.toString();
      }).join('');
      if (text !== '' && (inner === '' || !text.endsWith(inner))) return false;
      for (let i = n.content.length - 1; i >= 0; i--) {
        if (!collect(n.content[i])) return false;
      }
      return true;
    })(node);
    let content = '';
    for (const space of spaces) {
      content += space.content;
      space.content = '';
    }
    return content;
  },

  /**
   * 规则前的空白: 保留最后一个换行后的缩进(没有换行时用 indent), 前面换成配置的空行数.
   * 缩进语法里上一条语句(注释, `;` 结尾的语句, 无子块的规则等)自身不以换行结尾时, 这里的第一个换行是它的结束符而不是空行,
   * 不能去掉, 否则下一行会并进上一条语句.
   */
  spacing(content: string, before: Node | null, syntax: string | undefined, indent: string): string {
    const lineEnd = content.match(/\r\n|[\n\r\f]/);
    const afterLineEnd = Boolean(before) && /[\n\r\f]$/.test(before!.toString());
    const keepLineEnd = syntax === 'sass' && Boolean(before) && lineEnd !== null && !afterLineEnd;
    // 与上一条语句同行(`a {} .b {}`)时没有现成的缩进, 换行后沿用上一条语句开头所在行的缩进(block-indent 已经排好;
    // 它末行 `}` 前的缩进要等 space-before-closing-brace 再改, 不能用)
    let result = this.newLinesString +
        (lineEnd ? content.substring(content.lastIndexOf('\n') + 1) : afterLineEnd ? content : indent);
    // 保留结束符本身及它前面的行尾空白(行尾空白归 strip-spaces 处理)
    if (keepLineEnd) result = content.slice(0, lineEnd!.index! + lineEnd![0].length) + result;
    return result;
  },

  /**
   * 节点开头所在行的缩进: 父节点里它前面的文本中最后一个换行之后的行首空白.
   */
  lineIndent(parent: Node, child: Node): string {
    let text = '';
    for (let i = children(parent).indexOf(child) - 1; i >= 0; i--) {
      text = parent.get(i)!.toString() + text;
      if (/[\n\r\f]/.test(text)) break;
    }
    const line = /[\n\r\f]([^\n\r\f]*)$/.exec(text);
    return line ? /^[ \t]*/.exec(line[1])![0] : '';
  },

  /**
   * Detects the value of this option in ast.
   * @return List of detected values
   */
  detect(ast: Node) {
    const detected: number[] = [];
    let ruleNode = false;

    ast.forEach((node, index) => {
      if (ruleNode && node.is('space')) {
        if (node.end!.line && node.start!.line) {
          const lines = node.end!.line - node.start!.line;
          if (lines > 0) {
            detected.push(lines);
          }
        }
        ruleNode = false;
      }

      if (node.is('ruleset') || node.is('atrule')) {
        ruleNode = true;
      }
    });

    return detected;
  }
});
