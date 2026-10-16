'use strict';

// 到 EOF 仍未闭合的多行注释(`/* x`)没有 `*/`: 解析时 end 落在注释最后一个字符上,
// 闭合注释的 end 落在 `*/` 的 `/` 上; stringify 据 end 判断是否补 `*/`, 以便逐字还原.
// CSS, Less, SCSS 共用; 缩进 Sass 的注释由缩进结束, 另有判断.

/**
 * 未闭合注释最后一个字符的位置
 * @param {string} content 去掉 `/*` 后的注释内容
 * @param {number} line `/*` 所在行
 * @param {number} column `/*` 所在列
 * @return {!Array} [line, column]
 */
function unclosedEnd(content, line, column) {
  var lines = ('/*' + content).split('\n');
  var n = lines.length;

  // 以换行结尾: 最后一个字符是该换行, 位于倒数第二行行尾之后
  if (n > 1 && lines[n - 1] === '') {
    return [line + n - 2, (n === 2 ? column - 1 : 0) + lines[n - 2].length + 1];
  }

  return [line + n - 1, (n === 1 ? column - 1 : 0) + lines[n - 1].length];
}

/**
 * 注释节点是否未闭合; 缺少位置信息(例: 手工创建的节点)时按闭合处理
 * @param {!Object} node multilineComment 节点
 * @return {boolean}
 */
function isUnclosed(node) {
  if (!node.start || !node.end || typeof node.content !== 'string') return false;

  var end = unclosedEnd(node.content, node.start.line, node.start.column);

  return node.end.line === end[0] && node.end.column === end[1];
}

module.exports = {
  unclosedEnd: unclosedEnd,
  isUnclosed: isUnclosed
};
