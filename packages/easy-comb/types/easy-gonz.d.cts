// easy-comb 编译期使用的 easy-gonz 类型: 只覆盖本项目用到的 API, 比 easy-gonz 自带的 gonzales.d.ts 宽松; 运行时与发布产物都用 easy-gonz 本身.
declare const gonzales: {
  createNode(options: gonzales.CreateNodeOptions): gonzales.Node;
  parse(css: string, options?: gonzales.ParseOptions): gonzales.Node;
};

declare namespace gonzales {
  interface Position {
    line: number;
    column: number;
  }

  type NodeCallback = (node: Node, index: number, parent: Node) => unknown;

  interface Node {
    type: string;
    // 叶子节点是字符串, 其余是子节点数组.
    content: any;
    syntax: string;
    start: Position;
    end: Position;
    readonly length: number;

    contains(type: string): boolean;
    eachFor(callback: NodeCallback): void;
    eachFor(type: string, callback: NodeCallback): void;
    first(type?: string): Node | null;
    forEach(callback: NodeCallback): void;
    forEach(type: string, callback: NodeCallback): void;
    get(index: number): Node | null;
    insert(index: number, node: Node): void;
    is(type: string): boolean;
    last(type?: string): Node | null;
    removeChild(index: number): Node;
    toJson(): string;
    toString(): string;
    traverse(callback: NodeCallback): void;
    traverseByType(type: string, callback: NodeCallback): void;
    traverseByTypes(types: string[], callback: NodeCallback): void;
  }

  interface CreateNodeOptions {
    type: string;
    content: any;
    syntax?: string;
    start?: Position;
    end?: Position;
  }

  interface ParseOptions {
    syntax?: string;
    rule?: string;
    context?: string;
    tabSize?: number;
  }
}

export = gonzales;
