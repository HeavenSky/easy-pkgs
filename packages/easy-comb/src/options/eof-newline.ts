import gonzales from '#gonzales-pe';
import type { Node } from '#gonzales-pe';
import { defineOption } from '../option.ts';

export default defineOption({
  name: 'eof-newline',

  // 排到最后(vendor-prefix-align 只改声明前的空白): 之后的选项(sort-order 补缩进语法的结束换行, strip-spaces 等)还会改文件末尾的空白
  runBefore: 'vendor-prefix-align',

  syntax: ['css', 'less', 'sass', 'scss'],

  accepts: {
    boolean: [true, false]
  },

  /**
   * Processes ast and fixes found code style errors.
   */
  process(ast: Node) {
    // 文件末尾的空白不一定是 stylesheet 的最后一个子节点: 未闭合的 @-规则, 无分号结尾的语句与缩进语法的块会把它吞进最深的末尾节点,
    // 只看顶层时会在后面再补一个换行, 再解析又被吞进去, 每格式化一次多一个空行. 所以按文本顺序倒着收集末尾的全部空白叶子
    const spaces: Node[] = [];
    let stop: Node | null = null;
    (function collect(node: Node): boolean {
      const text = node.toString();
      if (!Array.isArray(node.content)) {
        if (node.is('space')) {
          spaces.unshift(node);
          return true;
        }
        if (text === '') return true;
        stop = node;
        return false;
      }
      // 带收尾定界符的节点(`{}`, `()`, 注释等)整体当作末尾的非空白内容, 不往里找
      // 其他选项新建的节点可能没有 syntax, 它的 toString 会输出 `undefined`
      const inner = node.content.map((child: Node) => {
        if (!child.syntax) child.syntax = node.syntax;
        return child.toString();
      }).join('');
      if (text !== '' && (inner === '' || !text.endsWith(inner))) {
        stop = node;
        return false;
      }
      for (let i = node.content.length - 1; i >= 0; i--) {
        if (!collect(node.content[i])) return false;
      }
      return true;
    })(ast);

    let tail = spaces.map((node) => node.content).join('');
    // 末尾空白也可能在非空白叶子自身的文本里: 缩进语法的语句结束符(`declarationDelimiter`)就是换行,
    // 解析失败的片段(`raw`)会带着行尾空白与换行; 文件已经以换行结尾时不再补, 叶子里多余的换行一并去掉
    const last = stop as Node | null;
    const leafTail = last !== null && typeof last.content === 'string' && last.toString().endsWith(last.content) ?
        /[\n\r\f]\s*$/.exec(last.content) : null;

    if (leafTail && this.value) {
      if (!last!.is('declarationDelimiter')) last!.content = last!.content.replace(/\n\s*$/, '\n');
      tail = '';
    } else {
      // 从末尾空白中的第一个换行起全部去掉(换行前的行尾空格保留), 再按需补一个换行; 只删一个 \n 时多余的换行要到下一次格式化才消失, 不幂等
      tail = tail.replace(/\n\s*$/, '') + (this.value ? '\n' : '');
    }

    if (!spaces.length) {
      if (tail) ast.content.push(gonzales.createNode({type: 'space', content: tail, syntax: ast.syntax}));
      return;
    }
    spaces.forEach((node, i) => {
      node.content = i === 0 ? tail : '';
    });
  },

  /**
   * Detects the value of this option in ast.
   * @return List of detected values
   */
  detect(ast: Node) {
    const lastChild = ast.last();

    if (lastChild && lastChild.is('space') && lastChild.content.indexOf('\n') !== -1) {
      return [true];
    } else {
      return [false];
    }
  }
});
