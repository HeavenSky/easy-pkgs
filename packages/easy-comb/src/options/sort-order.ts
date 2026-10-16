import gonzales from '#gonzales-pe';
import type { Node } from '#gonzales-pe';
import { defineOption } from '../option.ts';

// 属性在排序表中的位置: 组序号与组内序号.
interface OrderEntry {
  group: number;
  prop: number;
}

type Order = Record<string, OrderEntry>;

// 待排序的声明/@-规则及其附带的空白, 分隔符与注释.
interface ExtendedNode {
  i: number;
  node: Node;
  prefixRank?: number;
  groupIndex?: number;
  propertyIndex?: number;
  spacesBeforeNode?: Node[];
  spacesBeforeDelimiter?: Node[];
  spacesAfterDelimiter?: Node[];
  delim?: Node;
  endIndex?: number;
  nodesToDelete?: number[];
  // scss / sass: 节点前面有几个不参与排序的语句(嵌套规则, 控制指令等), 即原本所在的段.
  slot?: number;
  origSlot?: number;
  // sass: 从后面的空白里拆出来, 随语句移动的结束换行
  lineEnd?: Node;
  less?: LessDependency;
  deps?: Dependency;
}

// scss / sass 里决定求值先后的信息: 变量声明, @include / @import 这类不透明语句, 普通声明.
interface Dependency {
  kind: 'variable' | 'opaque' | 'plain';
  declares?: string;
  refs: Set<string>;
  property?: string;
  hasCall: boolean;
  isImport?: boolean;
  global?: boolean;
  // 调用了按名字查变量, 函数, mixin 的 meta 函数(`variable-exists` 等)
  reflective?: boolean;
  // @include 里(内容块中)赋值的变量
  assigns?: Set<string>;
}

// less 里决定先后的信息: mixin 调用会在调用处输出声明, 与同名属性的声明, 以及其他 mixin 调用保持先后.
interface LessDependency {
  include: boolean;
  // 声明的属性族, 或 mixin 调用能解析到的本文件定义里输出的属性族; 解析不到时为 null(沿用上游行为, 可以移动)
  families: Set<string> | null;
}

export default defineOption({
  name: 'sort-order',

  runBefore: 'space-before-closing-brace',

  syntax: ['css', 'less', 'sass', 'scss'],

  // 由 process 写入, 供 _sortNodes 读取 `sort-order-fallback`.
  _config: undefined as Record<string, unknown> | undefined,
  // 当前块是否是 @if / @each 等控制指令的块, 其中的变量赋值会改写外层变量.
  _inFlow: false,
  // 本文件里用 `!global` 赋值过的变量.
  _globals: new Set<string>(),
  // 缩进语法: 文件里的换行写法, 补结束换行与组间空行时沿用.
  _lineBreak: '\n',
  // 缩进语法: 位于文件末尾的块(最后一条语句的块, 及其中最后一条语句的块...).
  _eofBlocks: new Set<Node>(),
  // less: 本文件里的 mixin 定义(含可当 mixin 调用的简单选择器规则), 名字 -> 块.
  _lessMixins: new Map<string, Node[]>(),
  _lessFamilies: new Map<Node, Set<string>>(),
  // 当前块 `{` 后的空白节点(块首的空白节点); 排序后仍在块首时保留其中的空行
  _blockLead: null as Node | null,

  /**
   * @param value Option value
   */
  setValue(value: unknown): Order {
    if (!Array.isArray(value))
      throw new Error('The option accepts only array of properties.');

    const order: Order = {};

    if (typeof value[0] === 'string') {
      // If there is only one group of properties.
      value.forEach(function(prop: string, propIndex: number) {
        order[prop] = {group: 0, prop: propIndex};
      });
    } else {
      value.forEach(function(group: string[], groupIndex: number) {
        group.forEach(function(prop: string, propIndex: number) {
          order[prop] = {group: groupIndex, prop: propIndex};
        });
      });
    }

    return order;
  },

  process(ast: Node, config: Record<string, unknown>) {
    this._config = config;
    this._globals = new Set();
    const lineBreak = ast.syntax === 'sass' && ast.toString().match(/\r\n|[\n\r\f]/);
    this._lineBreak = lineBreak ? lineBreak[0] : '\n';
    this._eofBlocks = new Set();
    if (ast.syntax === 'sass') this._collectEofBlocks(ast);
    if (ast.syntax === 'scss' || ast.syntax === 'sass') {
      const re = /\$((?:[\w-]|[^\x00-\x7f]|\\.)+)\s*:[^;\n]*!global\b/g;
      const text = ast.toString();
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) this._globals.add(this._normalizeVariable(m[1]));
    }
    this._lessMixins = new Map();
    this._lessFamilies = new Map();
    if (ast.syntax === 'less') this._collectLessMixins(ast);
    // Sort properties only inside blocks.
    ast.traverseByType('block', (block, i, parent) => {
      // `@function` 体内是有先后依赖的语句, 排序会改变语义.
      if (this._isFunctionBody(parent)) return;
      // less 的分离规则集 / 映射(`@map: {...}`): `@map[]` 取最后一项, 里面的先后有意义
      if (block.syntax === 'less' && parent && parent.is('value')) return;
      this._inFlow = Boolean(parent) && (parent!.is('conditionalStatement') || parent!.is('loop'));
      this._processBlock(block);
    });
  },

  _isFunctionBody(parent: Node | null): boolean {
    if (!parent || !parent.is('atrule')) return false;
    let atkeyword = parent.first('atkeyword');
    let ident = atkeyword && atkeyword.first('ident');
    return Boolean(ident) && ident!.content === 'function';
  },

  _cleanSassLinebreaks(node: Node): void {
    let containsOnlyLinebreaks = true;

    node.forEach((space) => {
      if (!space.is('space') || !this._isLineBreak(space.content)) {
        containsOnlyLinebreaks = false;
        return null;
      }
    });

    if (containsOnlyLinebreaks)
      node.content = [];
  },

  _extendNode(block: Node, i: number, spacesBefore: number[]): ExtendedNode | null {
    let nodesToDelete = [i];
    let node = block.get(i)!;
    let extendedNode: ExtendedNode = {i: i, node: node};

    let propertyName = this._getSortableName(node);
    if (!propertyName) return null;

    // Check if current node's property name is in sort order.
    let {entry: propertyIndex, prefixRank} = this._getOrderEntry(propertyName);
    extendedNode.prefixRank = prefixRank;
    // If the declaration's property is in order's list, save its
    // group and property indices. Otherwise set them to 10000, so
    // declaration appears at the bottom of a sorted list:
    extendedNode.groupIndex = propertyIndex && propertyIndex.group > -1 ?
        propertyIndex.group : this._getLastGroupIndex();
    extendedNode.propertyIndex = propertyIndex && propertyIndex.prop > -1 ?
        propertyIndex.prop : this._getLastPropertyIndex();

    // Spaces before node.
    nodesToDelete = nodesToDelete.concat(spacesBefore);
    extendedNode.spacesBeforeNode =
        this._getNodesByIndex(block, spacesBefore);

    // Spaces after node.
    let spacesBeforeDelimiter =
        this._getSpacesAndCommentsAfterNode(block, i);
    nodesToDelete = nodesToDelete.concat(spacesBeforeDelimiter);
    extendedNode.spacesBeforeDelimiter =
        this._getNodesByIndex(block, spacesBeforeDelimiter);

    i += spacesBeforeDelimiter.length;

    // Spaces after delimiter.
    // If there is `;` right after the declaration, save it with the
    // declaration and mark it for removing from parent node:
    if (block.get(i + 1) && block.get(i + 1)!.is('declarationDelimiter')) {
      i += 1;
      node = block.get(i)!;
      nodesToDelete.push(i);
      extendedNode.delim = node;

      if (node.syntax !== 'sass') {
        // Save spaces and comments which follow right after
        // the declaration and mark them for removing from parent node:
        let spacesAfterDelimiter =
            this._getSpacesAndCommentsAfterNode(block, i);
        i += spacesAfterDelimiter.length;
        nodesToDelete = nodesToDelete.concat(spacesAfterDelimiter);
        extendedNode.spacesAfterDelimiter =
            this._getNodesByIndex(block, spacesAfterDelimiter);
      }
    }

    // 缩进语法里结束语句的换行不一定是分隔符(`@extend` 后的换行, `;` 后的换行是独立的空白节点), 随语句一起移动,
    // 否则语句移走后会和下一行并成一行
    if (block.syntax === 'sass' && !(extendedNode.delim && this._isLineBreak(extendedNode.delim.content)) &&
        !this._endsWithLineBreak(extendedNode)) {
      let after: number[] = [];
      if (extendedNode.delim) {
        after = this._getSpacesAndCommentsAfterNode(block, i);
        i += after.length;
      }
      // 块里最后一条语句后的换行留在原处(块末), 解析器对它的归属(块内或外层)不固定; 这条语句排到前面时再补换行
      const isLast = block.content.slice(i + 1).every((n: Node) => this._isSpaceOrComment(n));
      const lineEnd = isLast ? -1 : this._takeLineEnd(block, i + 1);
      if (lineEnd !== -1) {
        i = lineEnd;
        extendedNode.lineEnd = block.get(lineEnd)!;
      }
      if (extendedNode.delim) {
        if (lineEnd !== -1) after.push(lineEnd);
        nodesToDelete = nodesToDelete.concat(after);
        extendedNode.spacesAfterDelimiter = this._getNodesByIndex(block, after);
      } else if (lineEnd !== -1) {
        nodesToDelete.push(lineEnd);
        extendedNode.delim = block.get(lineEnd)!;
      }
    }

    extendedNode.endIndex = i;
    // Remove all nodes, that were moved to `sortables` list,
    // from block node:
    extendedNode.nodesToDelete = nodesToDelete;

    return extendedNode;
  },

  // 语句(连同分隔符前的空白与注释)本身是否以换行结尾, 如带子块的语句, 把结束换行包在里面的 @-规则
  _endsWithLineBreak(n: ExtendedNode): boolean {
    const parts = [n.node, ...(n.spacesBeforeDelimiter || [])];
    if (n.delim) parts.push(n.delim, ...(n.spacesAfterDelimiter || []));
    return /[\n\r\f]$/.test(parts.map((x) => x.toString()).join(''));
  },

  /**
   * sass: 块里最后一条语句的结束换行若不在块里(文件末尾, 或 `;` 后的换行由解析器放在外层), 排到最后的语句也不带自己的结束换行,
   * 否则再解析时这个换行又落到外层, 两次格式化结果不同.
   */
  _keepBlockEnd(block: Node, nodes: ExtendedNode[]): void {
    if (nodes.length < 2) return;
    const newLast = nodes[nodes.length - 1];
    const origLast = nodes.reduce((a, b) => (b.i > a.i ? b : a));
    if (origLast === newLast || !newLast.lineEnd) return;
    // 文件末尾的换行由 eof-newline 统一处理; 解析器把它放在块内还是外层随语句写法而变
    if (this._endsWithLineBreak(origLast) && !this._eofBlocks.has(block)) return;
    const lineEnd = newLast.lineEnd;
    newLast.lineEnd = undefined;
    if (newLast.delim === lineEnd) newLast.delim = undefined;
    if (newLast.spacesAfterDelimiter) newLast.spacesAfterDelimiter = newLast.spacesAfterDelimiter.filter((n) => n !== lineEnd);
  },

  /**
   * less: a 原本在 b 之前时二者是否必须保持先后. mixin 调用在调用处输出声明(`+:` 合并, `$prop` 取值, 同名属性层叠都看先后),
   * 还会把定义带进作用域(命名空间, 守卫里的 `default()`); 排在同一位置的调用之间保持原顺序, 不按字母重排.
   */
  _lessConflicts(a: ExtendedNode, b: ExtendedNode): boolean {
    const x = a.less!, y = b.less!;
    if (x.include && y.include) {
      if (a.groupIndex === b.groupIndex && a.propertyIndex === b.propertyIndex) return true;
      return Boolean(x.families && y.families && [...x.families].some((f) => y.families!.has(f)));
    }
    if (x.include === y.include) return false;
    const include = x.include ? x : y;
    const plain = x.include ? y : x;
    if (!include.families || !plain.families) return false;
    return [...plain.families].some((f) => f === '*' || include.families!.has(f));
  },

  _getLessDependency(node: Node): LessDependency {
    if (node.is('include')) {
      const blocks = this._resolveLessMixin(node);
      return {include: true, families: blocks ? this._lessBlockFamilies(blocks) : null};
    }
    if (node.is('declaration')) {
      const property = node.first('property');
      const head = property && property.first();
      if (!property || head && head.is('variable')) return {include: false, families: null};
      const name = property.toString().trim();
      // 插值属性名不知道是哪个属性, 与所有能解析的 mixin 调用保持先后
      return {include: false, families: new Set([/[@$]\{/.test(name) ? '*' : this._family(name)])};
    }
    return {include: false, families: null};
  },

  // 属性族: 去掉厂商前缀后取第一段, 简写与分写(`border` 与 `border-top`)归为一族
  _family(prop: string): string {
    const p = prop.toLowerCase();
    if (p.startsWith('--')) return p;
    return p.replace(/^-(?:webkit|moz|ms|o|khtml)-/, '').split('-')[0];
  },

  // mixin 名: 开头的类名 / id 序列(去掉空格与 `>`)
  _lessMixinName(node: Node): string {
    let name = '';
    for (const child of node.content as Node[]) {
      if (child.is('class') || child.is('id')) name += child.toString();
      else if (child.is('space') || child.is('operator') && child.content === '>') continue;
      else break;
    }
    return name;
  },

  _collectLessMixins(ast: Node): void {
    const add = (name: string, block: Node | null) => {
      if (!name || !block) return;
      const keys = [name];
      const last = name.match(/[.#][^.#]+$/);
      if (last && last[0] !== name) keys.push(last[0]);
      for (const key of keys) {
        if (!this._lessMixins.has(key)) this._lessMixins.set(key, []);
        this._lessMixins.get(key)!.push(block);
      }
    };
    ast.traverse((node) => {
      if (node.is('mixin')) add(this._lessMixinName(node), node.first('block'));
      if (node.is('ruleset')) {
        node.forEach('selector', (selector) => {
          const text = selector.toString().trim();
          if (/^(?:[.#][\w-]+)+$/.test(text)) add(text, node.first('block'));
        });
      }
    });
  },

  _resolveLessMixin(node: Node): Node[] | null {
    const name = this._lessMixinName(node);
    if (!name) return null;
    const found = this._lessMixins.get(name);
    if (found) return found;
    const last = name.match(/[.#][^.#]+$/);
    return last && this._lessMixins.get(last[0]) || null;
  },

  // mixin 定义块输出的属性族, 含其中再调用的 mixin; 嵌套规则输出到别的选择器, 不算
  _lessBlockFamilies(blocks: Node[], visiting: Set<Node> = new Set()): Set<string> {
    const result = new Set<string>();
    for (const block of blocks) {
      if (visiting.has(block)) continue;
      let cached = this._lessFamilies.get(block);
      if (!cached) {
        visiting.add(block);
        cached = new Set();
        for (const child of block.content as Node[]) {
          if (child.is('declaration')) {
            const dep = this._getLessDependency(child);
            if (dep.families) dep.families.forEach((f) => cached!.add(f));
          } else if (child.is('include')) {
            const inner = this._resolveLessMixin(child);
            if (inner) this._lessBlockFamilies(inner, visiting).forEach((f) => cached!.add(f));
          }
        }
        visiting.delete(block);
        this._lessFamilies.set(block, cached);
      }
      cached.forEach((f) => result.add(f));
    }
    return result;
  },

  _collectEofBlocks(node: Node): void {
    if (!Array.isArray(node.content)) return;
    for (let k = node.content.length - 1; k >= 0; k--) {
      const child: Node = node.content[k];
      if (this._isSpaceOrComment(child) || child.is('declarationDelimiter')) continue;
      if (child.is('block')) this._eofBlocks.add(child);
      this._collectEofBlocks(child);
      return;
    }
  },

  _isLineBreak(text: string): boolean {
    return /^(?:\r\n|[\n\r\f])$/.test(text);
  },

  /**
   * 缩进语法: 位置 i 是以换行开头的空白节点时, 把开头的一个换行拆成单独的节点, 返回它的位置; 否则返回 -1.
   */
  _takeLineEnd(block: Node, i: number): number {
    const space = block.get(i);
    if (!space || !space.is('space')) return -1;
    const m = String(space.content).match(/^(?:\r\n|[\n\r\f])/);
    if (!m) return -1;
    if (m[0] === space.content) return i;
    space.content = space.content.slice(m[0].length);
    block.insert(i, gonzales.createNode({type: 'space', content: m[0], syntax: block.syntax}));
    return i;
  },

  _getLastGroupIndex(): number {
    return this.value && this.value['...'] ?
        this.value['...'].group : Infinity;
  },

  _getLastPropertyIndex(): number {
    return this.value && this.value['...'] ?
        this.value['...'].prop : Infinity;
  },

  _getNodesByIndex(block: Node, index: number[]): Node[] {
    return index.map((i) => block.get(i)!);
  },

  /**
   * 带厂商前缀的属性未单独列出时按去前缀后的名字定位, 并排在标准写法之前.
   */
  _getOrderEntry(name: string | undefined): {entry: OrderEntry | undefined, prefixRank: number} {
    const PREFIXES = ['-webkit-', '-khtml-', '-moz-', '-ms-', '-o-'];
    const own = (key: string): OrderEntry | undefined => Object.prototype.hasOwnProperty.call(this.value, key) ?
        this.value[key] : undefined;

    let entry = own(name as string);
    if (entry || typeof name !== 'string')
      return {entry: entry, prefixRank: PREFIXES.length};

    // 属性名不区分大小写(`Z-INDEX` 按 `z-index` 定位); 自定义属性与 `$variable` 等占位名区分大小写
    if (!/^(?:--|\$)/.test(name)) {
      name = name.toLowerCase();
      entry = own(name);
      if (entry) return {entry: entry, prefixRank: PREFIXES.length};
    }

    let rank = PREFIXES.findIndex(prefix => name.startsWith(prefix));
    if (rank === -1) return {entry: undefined, prefixRank: PREFIXES.length};

    entry = own(name.slice(PREFIXES[rank].length));
    return {entry: entry, prefixRank: entry ? rank : PREFIXES.length};
  },

  _getSortableIncludeName(node: Node): string {
    // Divide `include` into mixins with specific name
    // (e. g. `$include breakpoint`), and the rest — `$include`.
    let mixinName: string;

    if (node.syntax === 'less') {
      // `node.first()` is class and `node.first().first()` is ident.
      mixinName = node.first()!.first()!.content;
    } else if (node.syntax === 'sass' && node.first()!.content === '+') {
      // `node.first()` is `+` and `node.get(1)` is ident.
      mixinName = node.get(1)!.content;
    } else {
      // `node.first()` is @-keyword, `node.get(1)` is space and
      // `node.get(2)` is ident, or a module namespace followed by ident
      // (`@include ns.foo` is configured as `$include ns.foo`).
      const name = node.get(2)!;
      mixinName = name.is('module') ? name.toString() + node.get(3)!.content : name.content;
    }

    let includeMixinName = '$include ' + mixinName;
    return this.value.hasOwnProperty(includeMixinName) ?
        includeMixinName :
        '$include';
  },

  _getSortableName(node: Node): string | undefined {
    // less 语句级兜底解析出的 raw 语句(`include[raw]`, `declaration[property[raw], ...]` 等)内容不透明, 不参与排序
    const head = node.first();
    if (head && (head.is('raw') || head.is('property') && head.first() && head.first()!.is('raw'))) return;
    if (node.is('extend')) return '$extend';
    if (node.is('include')) return this._getSortableIncludeName(node);
    else return this._getSortablePropertyName(node);
  },

  _getSortablePropertyName(node: Node): string | undefined {
    if (node.is('declaration')) {
      let property = node.first('property');
      if (property === null) return this._getSortableCustomPropertyName(node);

      property = property.first()!;
      return property.is('variable') ? '$variable' : property.content;
    }

    let atkeyword = node.first('atkeyword');
    if (atkeyword && atkeyword.first()!.content === 'import')
        return '$import';
  },

  /**
   * 自定义属性按带 `--` 的全名匹配, 避免 `--color` 被当成 `color` 排序;
   * 未单独列出时归入 `$custom-property` 组(若已配置).
   * @param node Declaration node
   */
  _getSortableCustomPropertyName(node: Node): string | undefined {
    let customProperty = node.first('customProperty');
    if (!customProperty) return;

    // 只有 `--` 的空名字自定义属性没有子节点
    const ident = customProperty.first();
    let name = '--' + (ident ? ident.content : '');
    if (this.value.hasOwnProperty(name)) return name;
    return this.value.hasOwnProperty('$custom-property') ?
        '$custom-property' :
        name;
  },

  _getSpacesAndCommentsAfterNode(node: Node, i: number): number[] {
    // List of start positions for nodes with spaces and comments:
    let positions: number[] = [];

    // Skip node itself.
    i++;

    for (let l = node.length; i < l; i++) {
      let currentNode = node.get(i)!;

      // If node is nor spaces neither comment, stop.
      if (!this._isSpaceOrComment(currentNode)) break;

      if (currentNode.is('multilineComment') ||
          currentNode.is('singlelineComment')) {
        positions.push(i);
        continue;
      }

      // If there are any line breaks in a node with spaces, stop and
      // split the node into two: one with spaces before line break
      // and one with `\n` symbol and everything that goes after.
      // Combine the first one with declaration/@-rule's node:
      // 缩进语法还认单独的 `\r` 与 `\f` 换行
      let linebreakIndex = currentNode.content.search(node.syntax === 'sass' ? /[\n\r\f]/ : /\r?\n/);
      if (linebreakIndex !== -1) {
        const s: string = currentNode.content.substring(0, linebreakIndex);
        if (s === '') break;
        const space = gonzales.createNode({type: 'space', content: s, syntax: node.syntax});
        node.insert(i + 1, space);
        positions.push(i + 1);
        currentNode.content = currentNode.content
            .substring(linebreakIndex);
        break;
      }

      positions.push(i);
    }

    return positions;
  },

  /**
   * Check if there are any comments or spaces before
   * the declaration/@-rule.
   * @returns List of nodes with spaces and comments
   */
  _getSpacesAndCommentsBeforeNode(node: Node, i: number): number[] | null {
    // List of start positions for nodes with spaces and comments:
    let positions: number[] = [];
    let sendPositions = false;

    for (let l = node.length; i < l; i++) {
      let currentNode = node.get(i)!;

      // If the node is declaration or @-rule, stop and return all
      // found nodes with spaces and comments (if there are any):
      if (!this._isSpaceOrComment(currentNode)) {
        sendPositions = true;
        break;
      }

      positions.push(i);
    }

    return sendPositions ? positions : null;
  },

  // 插到 block 的 at 位置; trailingDelimiter 表示后面还有语句, 最后一个声明缺分隔符时也要补.
  _insertSortablesToBlock(nodesToSort: ExtendedNode[], node: Node, at: number, trailingDelimiter = false): void {
    const insert = (child: Node) => node.content.splice(at, 0, child);
    if (node.syntax === 'sass' && !trailingDelimiter) this._keepBlockEnd(node, nodesToSort);
    // 块里剩下的换行只有在最后一条语句自带结尾换行时才是多余的; 最后一条语句不带换行时它就是块末换行, 删了会和下一行并成一行
    // (文件末尾的块除外, 那里的换行由 eof-newline 处理)
    const last = nodesToSort[nodesToSort.length - 1];
    if (node.syntax === 'sass' && at === 0 &&
        (!last || this._endsWithLineBreak(last) || this._eofBlocks.has(node)))
      this._cleanSassLinebreaks(node);

    for (let i = nodesToSort.length - 1, l = -1; i > l; i--) {
      let currentNode = nodesToSort[i];
      let prevNode = nodesToSort[i - 1];
      let spacesBeforeNode = currentNode.spacesBeforeNode || [];
      let spacesBeforeDelimiter = currentNode.spacesBeforeDelimiter || [];
      let spacesAfterDelimiter = currentNode.spacesAfterDelimiter || [];
      // 下面会就地反转这几个列表, 先算
      const endsWithLineBreak = node.syntax === 'sass' && this._endsWithLineBreak(currentNode);

      if (node.syntax === 'sass' && spacesBeforeNode.length) {
        let space = spacesBeforeNode[0];
        space.content = space.content.replace(/\r\n|[\n\r\f]/, '');
      }

      // 块首(`{` 后)的空白属于块, 其中的空行由 space-after-opening-brace 决定, 不删(#459)
      const lead = at === 0 && i === 0 ? this._blockLead : null;
      spacesBeforeNode.reverse().forEach((n) => {
        if (n !== lead) this._removeEmptyLines(n);
      });
      spacesBeforeDelimiter.reverse().map(this._removeEmptyLines);
      spacesAfterDelimiter.reverse().map(this._removeEmptyLines);

      // Divide declarations from different groups with
      // an empty line:
      if (prevNode && currentNode.groupIndex! > prevNode.groupIndex!) {
        let space = spacesBeforeNode[0];
        if (space && space.is('space') &&
            (space.syntax === 'sass' ||
            space.content.match(/\n/g) &&
            space.content.match(/\n/g).length < 2)) {
          space.content = (space.syntax === 'sass' ? this._lineBreak : '\n') + space.content;
        }
      }

      // sass: 原本在块末尾, 结束换行不在块里(文件末尾, `;` 后的换行落在外层)的语句移到了别的语句之前, 补上换行
      if (node.syntax === 'sass' && (i !== nodesToSort.length - 1 || trailingDelimiter) && !endsWithLineBreak) {
        const isDeclaration = !currentNode.delim &&
            (currentNode.node.is('declaration') || currentNode.node.is('extend'));
        insert(gonzales.createNode({
          type: isDeclaration ? 'declarationDelimiter' : 'space',
          content: this._lineBreak,
          syntax: node.syntax
        }));
      }

      for (let j = 0, nl = spacesAfterDelimiter.length; j < nl; j++) {
        insert(spacesAfterDelimiter[j]);
      }

      if (currentNode.delim) {
        insert(currentNode.delim);
      } else if (node.syntax === 'sass') {
        // 换行已在上面补过
      } else if ((i !== nodesToSort.length - 1 || trailingDelimiter) &&
          !this._hasInnerDelimiter(currentNode.node) &&
          !this._endsWithBlock(currentNode.node) &&
          (currentNode.node.is('declaration') ||
          currentNode.node.is('extend'))) {
        let delimiter = gonzales.createNode({
          type: 'declarationDelimiter',
          content: ';',
          syntax: node.syntax
        });
        insert(delimiter);
      }

      for (let j = 0, nl = spacesBeforeDelimiter.length; j < nl; j++) {
        insert(spacesBeforeDelimiter[j]);
      }

      insert(currentNode.node);

      for (let j = 0, nl = spacesBeforeNode.length; j < nl; j++) {
        insert(spacesBeforeNode[j]);
      }
    }
  },

  /**
   * `always-semicolon` 会把 `;` 插进 value 内部, 这种声明不能再补分隔符.
   */
  _hasInnerDelimiter(node: Node): boolean {
    let value = node.is('declaration') ? node.last('value') : null;
    return Boolean(value) && value!.contains('declarationDelimiter');
  },

  /**
   * scss 嵌套属性(`font: { family: x; }`)的 value 以块结尾, 后面不补分隔符(#622).
   */
  _endsWithBlock(node: Node): boolean {
    const value = node.is('declaration') ? node.last('value') : null;
    if (!value || !Array.isArray(value.content)) return false;
    for (let k = value.content.length - 1; k >= 0; k--) {
      const child: Node = value.content[k];
      if (this._isSpaceOrComment(child)) continue;
      return child.is('block');
    }
    return false;
  },

  // Types of nodes that can be sorted.
  _isAcceptableNode(node: Node): boolean {
    const NODES = ['atrule', 'declaration', 'extend', 'include',
                    'multilineComment', 'singlelineComment', 'space'];
    return NODES.indexOf(node.type) !== -1;
  },

  // Spaces and comments.
  _isSpaceOrComment(node: Node): boolean {
    const SC = ['multilineComment', 'singlelineComment', 'space'];
    return SC.indexOf(node.type) !== -1;
  },

  _processBlock(block: Node): void {
    // Check every child node.
    // If it is declaration (property-value pair, e.g. `color: tomato`),
    // or @-rule (e.g. `@include nani`),
    // combine it with spaces, semicolon and comments and move them from
    // current node to a separate list for further sorting:
    const head = block.get(0);
    this._blockLead = block.syntax !== 'sass' && head && head.is('space') ? head : null;
    const barriers: Node[] = [];
    let nodesToSort = this._separateSortablesFromBlock(block, barriers);
    const first = nodesToSort[0];

    // css / less 沿用上游行为: 全部提到块首排序. scss / sass 按顺序求值, 只在不改变求值结果的范围内移动.
    const ordered = block.syntax === 'scss' || block.syntax === 'sass';
    if (!ordered || !nodesToSort.length) {
      this._sortNodes(nodesToSort);
      this._keepLeadingSpace(first, nodesToSort[0]);
      this._insertSortablesToBlock(nodesToSort, block, 0);
      return;
    }

    const slots = this._assignSlots(nodesToSort, barriers);
    // 从后往前插, 前面段的插入位置不受影响
    for (let k = slots.length - 1; k >= 0; k--) {
      const list = slots[k];
      if (!list.length) continue;
      const oldFirst = list[0];
      this._sortNodes(list);
      if (k === 0) this._keepLeadingSpace(first, list[0]);
      else this._keepLeadingSpace(oldFirst, list[0]);
      if (k === 0) this._keepBlockLeadingSpace(block, list[0]);
      let index = k === 0 ? 0 : block.content.indexOf(barriers[k - 1]) + 1;
      // `@content;` 等语句自带的分号留在语句后面
      if (k > 0 && block.get(index) && block.get(index)!.is('declarationDelimiter')) index++;
      this._insertSortablesToBlock(list, block, index, k < slots.length - 1);
    }
  },

  /**
   * 越过嵌套语句排到块首的节点以单行空白开头(如 `} g: h`)时, 沿用块首原有的换行与缩进, 否则要再格式化一次才换行.
   */
  _keepBlockLeadingSpace(block: Node, newFirst: ExtendedNode): void {
    if (newFirst.origSlot === 0) return;
    const lead = block.get(0);
    if (!lead || !lead.is('space') || lead.content.indexOf('\n') === -1) return;
    const spaces = newFirst.spacesBeforeNode || [];
    if (!spaces.length) {
      newFirst.spacesBeforeNode = [gonzales.createNode({type: 'space', content: lead.content, syntax: block.syntax})];
    } else if (spaces[0].is('space') && spaces[0].content.indexOf('\n') === -1) {
      // 后面可能还跟着注释, 只换掉开头的单行空白
      spaces[0].content = lead.content;
    }
  },

  /**
   * scss / sass: 定出每个节点最终所在的段. 普通声明可以像上游一样提到前面的嵌套规则, 控制指令之前,
   * 但不越过会改变它取值的语句(见 _canCross); 有依赖的节点不排到被依赖节点所在段之前.
   */
  _assignSlots(nodes: ExtendedNode[], barriers: Node[]): ExtendedNode[][] {
    const slots: ExtendedNode[][] = barriers.map(() => []);
    slots.push([]);
    nodes.forEach((n, idx) => {
      let slot = n.slot!;
      n.origSlot = slot;
      while (slot > 0 && this._canCross(n, barriers[slot - 1])) slot--;
      for (let j = 0; j < idx; j++) {
        if (nodes[j].slot! > slot && this._conflicts(nodes[j], n)) slot = nodes[j].slot!;
      }
      n.slot = slot;
      slots[slot].push(n);
    });
    return slots;
  },

  /**
   * 节点能否移到不参与排序的语句 barrier 之前.
   */
  _canCross(n: ExtendedNode, barrier: Node): boolean {
    const deps = n.deps!;
    if (deps.isImport || deps.global) return false;
    const CROSSABLE = ['ruleset', 'conditionalStatement', 'loop', 'mixin', 'atrule'];
    if (CROSSABLE.indexOf(barrier.type) === -1) return false;
    const text = barrier.toString();
    if (barrier.is('atrule')) {
      const name = this._atruleName(barrier);
      // @content 输出调用方传入的内容, 越过它会改变输出先后
      if (name === 'content') return false;
      if (name === 'function' && deps.hasCall) return false;
    }
    if (barrier.is('mixin') && deps.reflective) return false;
    // 控制指令与 mixin 定义可能定义或改写 @include 用到的东西
    if (deps.kind === 'opaque' &&
        !barrier.is('ruleset') && !(barrier.is('atrule') && barrier.contains('block'))) return false;
    if (deps.kind === 'variable' && this._collectVariableRefs(text).has(deps.declares!)) return false;
    // 语句里有同名属性时, 越过它会改变哪一个声明生效
    if (deps.property && this._declaresProperty(barrier, deps.property)) return false;
    if (deps.refs.size) {
      if (/!global\b/.test(text) || this._containsType(barrier, 'include')) return false;
      for (const name of this._collectVariableAssignments(text)) {
        if (deps.refs.has(name)) return false;
      }
    }
    return true;
  },

  _atruleName(node: Node): string {
    const atkeyword = node.first('atkeyword');
    const ident = atkeyword && atkeyword.first('ident');
    return ident ? String(ident.content).toLowerCase() : '';
  },

  _containsType(node: Node, type: string): boolean {
    let found = false;
    node.traverse((child) => {
      if (child.is(type)) found = true;
    });
    return found;
  },

  // 嵌套规则里的声明作用于别的选择器, 不算
  _declaresProperty(node: Node, property: string): boolean {
    if (node.is('ruleset')) return false;
    if (node.is('declaration')) {
      const own = node.first('property');
      return Boolean(own) && own!.toString().trim().toLowerCase() === property;
    }
    if (!Array.isArray(node.content)) return false;
    return node.content.some((child: Node) => this._declaresProperty(child, property));
  },

  _collectVariableAssignments(text: string): Set<string> {
    const names = new Set<string>();
    const re = /\$((?:[\w-]|[^\x00-\x7f]|\\.)+)\s*:/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) names.add(this._normalizeVariable(m[1]));
    return names;
  },

  // Sass 变量名里 `-` 与 `_` 等价
  _normalizeVariable(name: string): string {
    return name.replace(/_/g, '-');
  },

  _collectVariableRefs(text: string): Set<string> {
    const names = new Set<string>();
    const re = /\$((?:[\w-]|[^\x00-\x7f]|\\.)+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) names.add(this._normalizeVariable(m[1]));
    return names;
  },

  _getDependency(node: Node): Dependency {
    const text = node.toString().replace(/\/\*[\s\S]*?\*\//g, '');
    const refs = this._collectVariableRefs(text);
    const hasCall = /[\w-]\(/.test(text);
    const reflective = /(?:variable-exists|function-exists|mixin-exists|get-function|get-mixin|module-variables|module-functions|module-mixins)\s*\(/i.test(text);
    if (node.is('include') || node.is('atrule')) return {kind: 'opaque', refs, hasCall, reflective, isImport: node.is('atrule'),
        assigns: this._collectVariableAssignments(text)};
    if (node.is('declaration')) {
      const property = node.first('property');
      const head = property && property.first();
      if (head && head.is('variable')) {
        const name = this._collectVariableRefs(property!.toString());
        const declares = [...name][0];
        const valueRefs = this._collectVariableRefs(text.slice(property!.toString().length));
        // `!global` 或控制指令块里的赋值会改写外层变量, @include 也能读到
        const global = this._inFlow || /!global\b/.test(text);
        return {kind: 'variable', declares, refs: valueRefs, hasCall, reflective, global};
      }
      const name = property ? property.toString().trim().toLowerCase() : undefined;
      return {kind: 'plain', property: name, refs, hasCall, reflective};
    }
    return {kind: 'plain', refs, hasCall, reflective};
  },

  /**
   * a 原本在 b 之前时, 二者是否必须保持先后(交换会改变求值结果).
   */
  _conflicts(a: ExtendedNode, b: ExtendedNode): boolean {
    if (a.less && b.less) return this._lessConflicts(a, b);
    const x = a.deps, y = b.deps;
    if (!x || !y) return false;
    // @include 之间沿用上游行为可以互换; @include / @import 与变量声明, @import 与 @include 保持先后
    if (x.kind === 'opaque' && y.kind === 'opaque') return Boolean(x.isImport || y.isImport);
    if (x.kind === 'opaque' && y.kind === 'variable') return y.global || x.isImport || x.refs.has(y.declares!);
    if (y.kind === 'opaque' && x.kind === 'variable') return x.global || y.isImport || y.refs.has(x.declares!);
    if (x.kind === 'variable' && (y.refs.has(x.declares!) || y.declares === x.declares)) return true;
    if (y.kind === 'variable' && x.refs.has(y.declares!)) return true;
    // 变量声明与按名字查变量的 meta 函数, 改写外层变量的声明与可能读到它的函数调用
    if (x.kind === 'variable' || y.kind === 'variable') {
      const other = x.kind === 'variable' ? y : x;
      const variable = x.kind === 'variable' ? x : y;
      if (other.reflective || variable.global && other.hasCall) return true;
    }
    // 用了变量的声明不越过可能改写该变量的 @include: 内容块里的赋值会改写外层变量, 本文件里有 `!global` 赋值的变量 mixin 也能改写
    if (x.kind === 'opaque' && y.kind === 'plain' || y.kind === 'opaque' && x.kind === 'plain') {
      const plain = x.kind === 'plain' ? x : y;
      const opaque = x.kind === 'plain' ? y : x;
      for (const name of plain.refs) {
        if (opaque.isImport || opaque.assigns!.has(name) || this._globals.has(name)) return true;
      }
      if (opaque.isImport && plain.hasCall) return true;
    }
    return false;
  },

  /**
   * 多行写法里排到块首的节点原本没有前导空白(如紧跟在嵌套规则的 `}` 后)时, 沿用原块首的换行与缩进, 否则要再格式化一次才补上.
   */
  _keepLeadingSpace(oldFirst: ExtendedNode | undefined, newFirst: ExtendedNode | undefined): void {
    if (!oldFirst || !newFirst || oldFirst === newFirst) return;
    const spaces = oldFirst.spacesBeforeNode || [];
    const newSpaces = newFirst.spacesBeforeNode || [];
    if (!spaces.length || !spaces.every((n) => n.is('space'))) return;
    const multiline = spaces.some((n) => n.content.indexOf('\n') !== -1);
    if (newSpaces.length) {
      // 块首(`{` 后)的空白属于块, 留在首位, 与排到块首的节点交换前导空白(#350); 带注释时注释随节点移动, 不交换
      if (oldFirst.node.syntax === 'sass' || !newSpaces.every((n) => n.is('space'))) return;
      oldFirst.spacesBeforeNode = newSpaces;
      newFirst.spacesBeforeNode = spaces;
      return;
    }
    if (multiline) {
      newFirst.spacesBeforeNode = [gonzales.createNode({
        type: 'space',
        content: spaces.map((n) => n.content).join(''),
        syntax: oldFirst.node.syntax
      })];
      return;
    }
    // 单行写法: 块首空白移给排到块首的节点(#350)
    if (oldFirst.node.syntax === 'sass') return;
    newFirst.spacesBeforeNode = spaces;
    oldFirst.spacesBeforeNode = [];
  },

  /**
   * Remove empty lines in space node.
   * @param node Space node.
   */
  _removeEmptyLines(node: Node): void {
    node.content = node.content.replace(/\n[\s\t\n\r]*\n/, '\n');
  },

  // barriers 收集块里不参与排序的语句(嵌套规则, 控制指令, 其他 @-规则等), 按原顺序.
  _separateSortablesFromBlock(block: Node, barriers: Node[] = []): ExtendedNode[] {
    let sortables: ExtendedNode[] = [];
    let nodesToDelete: number[] = [];
    const BARRIERS = ['ruleset', 'conditionalStatement', 'loop', 'mixin', 'atrule'];

    // Don't cache `block.length` since we may insert new nodes into it.
    for (let i = 0; i < block.length; i++) {
      let node = block.get(i)!;
      if (!this._isAcceptableNode(node)) {
        if (BARRIERS.indexOf(node.type) !== -1) barriers.push(node);
        continue;
      }

      // Save preceding spaces and comments, if there are any,
      // and mark them for removing from parent node:
      let spacesBeforeNode =
          this._getSpacesAndCommentsBeforeNode(block, i);
      if (!spacesBeforeNode) break;

      i += spacesBeforeNode.length;
      node = block.get(i)!;

      let extendedNode = this._extendNode(block, i, spacesBeforeNode);
      if (!extendedNode) {
        if (BARRIERS.indexOf(node.type) !== -1) barriers.push(node);
        continue;
      }

      if (block.syntax === 'scss' || block.syntax === 'sass') {
        extendedNode.slot = barriers.length;
        extendedNode.deps = this._getDependency(extendedNode.node);
      } else if (block.syntax === 'less') {
        extendedNode.less = this._getLessDependency(extendedNode.node);
      }
      nodesToDelete = nodesToDelete.concat(extendedNode.nodesToDelete!);
      i = extendedNode.endIndex!;
      sortables.push(extendedNode);
    }

    nodesToDelete.sort((a, b) => a - b);
    for (let x = nodesToDelete.length - 1; x > -1; x--)
      block.removeChild(nodesToDelete[x]);

    return sortables;
  },

  // a/b 在函数内被依次复用为节点, 名字和匹配结果, 类型不固定.
  _sortLeftovers(a: any, b: any): number {
    let prefixes = ['-webkit-', '-moz-', '-ms-', '-o-', ''];
    let prefixesRegExp = /^(-webkit-|-moz-|-ms-|-o-)(.*)$/;

    // Get property name (i.e. `color`, `-o-animation`):
    // 按小写比较, 大写属性名不排到小写之前
    a = this._getLeftoverName(a.node).toLowerCase();
    b = this._getLeftoverName(b.node).toLowerCase();

    // Get prefix and unprefixed part. For example:
    // ['-o-animation', '-o-', 'animation']
    // ['color', '', 'color']
    a = a.match(prefixesRegExp) || [a, '', a];
    b = b.match(prefixesRegExp) || [b, '', b];

    if (a[2] !== b[2]) {
      // If unprefixed parts are different (i.e. `border` and
      // `color`), compare them:
      return a[2] < b[2] ? -1 : 1;
    }

    // If unprefixed parts are identical (i.e. `border` in
    // `-moz-border` and `-o-border`), compare prefixes.
    // They should be untouched if they are equal:
    if (prefixes.indexOf(a[1]) === prefixes.indexOf(b[1])) {
      return 0;
    }

    // They should go in the same order they are set
    // in `prefixes` array.
    return prefixes.indexOf(a[1]) < prefixes.indexOf(b[1]) ? -1 : 1;
  },

  _getLeftoverName(node: Node): string {
    const property = node.first();
    const first = property && property.first();
    let name: any = first && first.content;
    if (Array.isArray(name)) name = name[0] && name[0].content;
    // 属性名含插值, 或是 less 的 `&:extend` 等非常规声明时没有简单的标识符, 用属性原文排序
    if (typeof name !== 'string') return property ? property.toString() : '';
    return property!.is('customProperty') ? '--' + name : name;
  },

  _sortNodes(nodes: ExtendedNode[]): void {
    const compare = (a: ExtendedNode, b: ExtendedNode): number => {
      // If a's group index is higher than b's group index, in
      // a sorted list a appears after b:
      if (a.groupIndex !== b.groupIndex)
        return a.groupIndex! - b.groupIndex!;

      // If a and b have the same group index, and a's property index
      // is higher than b's property index, in a sorted list
      // a appears after b:
      if (a.propertyIndex !== b.propertyIndex)
        return a.propertyIndex! - b.propertyIndex!;

      if (a.prefixRank !== b.prefixRank)
        return a.prefixRank! - b.prefixRank!;

      // If a and b both belong to leftovers (`...` position) and
      // `sort-order-fallback` option is set to `abc`, sort properties
      // alphabetically; explicitly listed properties keep their order:
      if (a.groupIndex === this._getLastGroupIndex() &&
          a.propertyIndex === this._getLastPropertyIndex() &&
          this._config!['sort-order-fallback']) {
        return this._sortLeftovers(a, b) || a.i - b.i;
      }

      // If a and b have the same group index and the same property
      // index, in a sorted list they appear in the same order
      // they were in original array:
      return a.i - b.i;
    };

    // scss / sass 里有依赖的节点(变量的声明与使用, @import 与其后的语句等)保持原先后: 每次取出前驱都已排好的节点里排序最靠前的
    if (!nodes.some((n) => n.deps || n.less)) {
      nodes.sort(compare);
      return;
    }
    const rest = nodes.slice().sort((a, b) => a.i - b.i);
    const result: ExtendedNode[] = [];
    while (rest.length) {
      let best = -1;
      for (let k = 0; k < rest.length; k++) {
        let blocked = false;
        for (let m = 0; m < k && !blocked; m++) blocked = this._conflicts(rest[m], rest[k]);
        if (blocked) continue;
        if (best === -1 || compare(rest[k], rest[best]) < 0) best = k;
      }
      result.push(rest.splice(best, 1)[0]);
    }
    nodes.splice(0, nodes.length, ...result);
  },

  detect: () => []
});
