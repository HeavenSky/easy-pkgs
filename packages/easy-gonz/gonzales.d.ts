// easy-gonz 的类型声明, 与 src/gonzales.js 和 src/node/basic-node.js 的实现对齐.
declare const gonzales: {
  /** 用给定选项创建一个节点. */
  createNode(options: gonzales.CreateNodeOptions): gonzales.Node;
  /**
   * 解析源码. 空字符串返回空的 stylesheet 节点; 不支持的 syntax 会打印错误并返回 undefined;
   * css 不是字符串时抛 Error, 无法解析时抛 ParsingError.
   */
  parse(css: string, options?: gonzales.ParseOptions): gonzales.Node;
};

declare namespace gonzales {
  type Syntax = 'css' | 'less' | 'sass' | 'scss';

  /** 解析器产出的节点类型, 见 docs/node-types.md; createNode 也接受任意字符串. */
  type NodeType =
    | 'arguments'
    | 'atkeyword'
    | 'atrule'
    | 'attributeFlags'
    | 'attributeMatch'
    | 'attributeName'
    | 'attributeSelector'
    | 'attributeValue'
    | 'block'
    | 'brackets'
    | 'class'
    | 'color'
    | 'combinator'
    | 'condition'
    | 'conditionalStatement'
    | 'customProperty'
    | 'declaration'
    | 'declarationDelimiter'
    | 'default'
    | 'delimiter'
    | 'dimension'
    | 'escapedString'
    | 'expression'
    | 'extend'
    | 'function'
    | 'functionsList'
    | 'global'
    | 'id'
    | 'ident'
    | 'important'
    | 'include'
    | 'interpolatedVariable'
    | 'interpolation'
    | 'keyframesSelector'
    | 'loop'
    | 'mixin'
    | 'module'
    | 'multilineComment'
    | 'namePrefix'
    | 'namespacePrefix'
    | 'namespaceSeparator'
    | 'number'
    | 'operator'
    | 'optional'
    | 'parentSelector'
    | 'parentSelectorExtension'
    | 'parentheses'
    | 'percentage'
    | 'placeholder'
    | 'progid'
    | 'property'
    | 'propertyDelimiter'
    | 'pseudoClass'
    | 'pseudoElement'
    | 'raw'
    | 'ruleset'
    | 'selector'
    | 'singlelineComment'
    | 'space'
    | 'string'
    | 'stylesheet'
    | 'typeSelector'
    | 'unicodeRange'
    | 'universalSelector'
    | 'urange'
    | 'uri'
    | 'value'
    | 'variable'
    | 'variablesList'
    // 保留字面量提示的同时接受任意字符串.
    | (string & {});

  /** 1 起算的行列号. 空输入返回的 stylesheet 节点的 start/end 是 [0, 0]. */
  interface Position {
    line: number;
    column: number;
  }

  /**
   * forEach / eachFor 的回调; 返回 null 时停止循环, 方法本身也返回 null.
   */
  type EachCallback = (node: Node, index: number, parent: Node) => unknown;

  /**
   * traverse / traverseByType / traverseByTypes 的回调.
   * index 与 parent 对调用方法的根节点分别是 undefined 与 null;
   * level 是从该根节点(level 1)起算的绝对深度. 返回值被忽略.
   * traverseByType / traverseByTypes 中 this 指向匹配的节点.
   */
  type TraverseCallback = (
    this: Node,
    node: Node,
    index: number | undefined,
    parent: Node | null,
    level: number
  ) => unknown;

  interface Node {
    type: NodeType;
    /** 叶子节点是字符串, 其余是子节点数组. */
    content: string | Node[];
    syntax: Syntax | undefined;
    start?: Position;
    end?: Position;
    /** 子节点数; content 是字符串时为 0. */
    readonly length: number;

    /** 是否有给定类型的直接子节点. */
    contains(type: NodeType): boolean;
    /** 从后往前遍历直接子节点. */
    eachFor(callback: EachCallback): null | void;
    eachFor(type: NodeType, callback: EachCallback): null | void;
    /** 没找到时返回 null; 不带 type 且没有子节点时返回 undefined. */
    first(type?: NodeType): Node | null | undefined;
    /** 从前往后遍历直接子节点. */
    forEach(callback: EachCallback): null | void;
    forEach(type: NodeType, callback: EachCallback): null | void;
    get(index: number): Node | null;
    /** content 是字符串时什么也不做. */
    insert(index: number, node: Node): void;
    is(type: NodeType): boolean;
    /** 没找到时返回 null; 不带 type 且没有子节点时返回 undefined. */
    last(type?: NodeType): Node | null | undefined;
    /** 返回 splice 的结果(含被删节点的数组); content 是字符串时返回 undefined. */
    removeChild(index: number): Node[] | undefined;
    /** 2 空格缩进的 JSON 字符串. */
    toJson(): string;
    /** 按 syntax 还原源码; syntax 不受支持时打印错误并返回 undefined. */
    toString(): string;
    traverse(callback: TraverseCallback): void;
    traverseByType(type: NodeType, callback: TraverseCallback): void;
    traverseByTypes(types: NodeType[], callback: TraverseCallback): void;
  }

  interface CreateNodeOptions {
    type: NodeType;
    content: string | Node[];
    syntax?: Syntax;
    start?: Position;
    end?: Position;
  }

  interface ParseOptions {
    /** 默认 'css'. */
    syntax?: Syntax;
    /** 根节点类型(例: 'declaration', 'value'), 可用值随 syntax 而异; 默认 'stylesheet'. */
    context?: string;
    /** 制表符按几列计算列号, 非正整数时按 1; 默认 1. */
    tabSize?: number;
    /**
     * 只对 syntax 'css' 与 'less' 生效: false 时不做错误恢复, 遇到会被恢复成 raw 的非法输入
     * 改为抛出 ParsingError(行号指向第一处被恢复的语句), 与 gonzales-pe 4.3.0 一样; 默认 true.
     */
    recover?: boolean;
  }

  /** parse 无法解析时抛出; 注意它不是 Error 的实例. */
  interface ParsingError {
    name: 'Parsing error';
    line: number;
    syntax: Syntax;
    message: string;
    /** 出错行前后的源码片段, 出错行以 * 标记. */
    readonly context: string;
    version: string;
    toString(): string;
  }
}

export = gonzales;
