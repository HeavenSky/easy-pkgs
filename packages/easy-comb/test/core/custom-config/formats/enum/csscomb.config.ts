// @ts-nocheck
// 含不可擦除的 TS 语法, 原生类型剥离加载时报 ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX.
enum Case { Upper = 'upper' }
export default {'color-case': Case.Upper};
