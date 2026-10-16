// 选项插件的类型契约, 每个 src/options/*.ts 都用 defineOption 声明.
import type { Node } from 'easy-gonz';

export interface LintError {
  message: string;
  line: number;
  column: number;
  // 由通用 lint(按处理结果是否改动判定)产出的错误带上选项名; 选项自带 lint() 的错误不带.
  option?: string;
  context?: string;
  filename?: string;
}

export interface Accepts {
  boolean?: boolean[];
  number?: boolean;
  string?: RegExp;
}

export interface OptionDefinition {
  // 配置里的键名.
  name: string;
  syntax: string[];
  accepts?: Accepts;
  // 需要排在其前面执行的插件名.
  runBefore?: string;
  setValue?(value: unknown): unknown;
  process?(ast: Node, config: Record<string, unknown>): void;
  lint?(ast: Node, config: Record<string, unknown>): LintError[];
  detect?(ast: Node): unknown[];
  detectDefault?: unknown;
}

// 方法内的 `this` 是 Plugin 实例: 选项自身的成员加上经校验的 `value`.
export function defineOption<T extends OptionDefinition>(
  option: T & ThisType<T & { value: any }>
): T {
  return option;
}
