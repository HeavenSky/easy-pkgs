// easy-gonz 节点的 content: 叶子节点是字符串, 其余是子节点数组; 调用方已按节点类型确定是哪一种.
import type { Node } from "easy-gonz";

export function text(node: Node): string {
	return node.content as string;
}

export function children(node: Node): Node[] {
	return node.content as Node[];
}
