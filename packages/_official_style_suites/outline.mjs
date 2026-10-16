// easy-gonz 结构对照: 把 easy-gonz 与参考解析器(postcss / postcss-scss / postcss-less)的结果各自归一成大纲后比较.
// 大纲每行一个条目: 缩进 + 种类(R 规则, A at-rule, D 声明, M Less mixin 调用) + 去掉空白与注释的文本; 只比较两边都能无损解析的用例.
// gonz.mjs 用 compareOutline 作第 3 级判定; 直接运行本文件按分歧种类汇总, 用于调试归一规则: node outline.mjs [语料名...], 明细写入 .cache/official/outline-report.json.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cacheRoot } from './fetch.mjs';
import { loadCases } from './extract.mjs';
import { runPool } from './pool.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// 行注释只有 scss / less 有; css 里的 `//` 出现在 url 等值中, 两边按同一规则处理不影响比较
let lineComments = false;
// 以下 less 归一规则只对 less 语料生效, 抹平 postcss-less 的解析怪癖
let isLess = false;
const norm = (s) => (lineComments ? stripLineComments : String)(String(s).replace(/\/\*[\s\S]*?\*\//g, ''))
  .replace(/\s+/g, '')
  .replace(/!important$/i, '!important');

// 去掉 `//` 行注释; 字符串与 url 类函数(`url(https://a)`, `url-prefix(…)`, `domain(…)`)里的 `//` 不是注释
function stripLineComments(s) {
  let out = '';
  let quote = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === '\\') out += ch + (s[++i] ?? '');
      else {
        if (ch === quote) quote = '';
        out += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' && /(?:^|[^\w-])(?:url|url-prefix|domain)$/i.test(out)) {
      const end = s.indexOf(')', i);
      const stop = end < 0 ? s.length : end + 1;
      out += s.slice(i, stop);
      i = stop - 1;
      continue;
    } else if (ch === '/' && s[i + 1] === '/') {
      while (i < s.length && s[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    out += ch;
  }
  return out;
}

// 参考解析器给出的选择器或 at-rule 参数括号不配对, 说明它把其中的 `//` 等当成了注释而解析错了结构
function refBroken(root) {
  let broken = false;
  root.walk((n) => {
    const text = n.type === 'rule' ? n.selector : n.type === 'atrule' ? n.params : null;
    if (text == null) return;
    const stripped = String(text).replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\\./g, '');
    if ((stripped.match(/\(/g) || []).length !== (stripped.match(/\)/g) || []).length) broken = true;
  });
  return broken;
}

function postcssOutline(root) {
  const out = [];
  (function walk(nodes, depth) {
    for (const n of nodes || []) {
      const pad = '  '.repeat(depth);
      if (n.type === 'comment') continue;
      if (n.type === 'decl') {
        // postcss 把 IE 属性名 hack `*zoom` / `_height` 的 `*` / `_` 放进 raws.before, 补回属性名
        const star = ((n.raws.before || '').match(/[*_]+$/) || [''])[0];
        // postcss-less 把带空白的属性合并标记 `a +: b` 的 `+` / `+_` 放进 raws.between, 补回属性名
        const merge = isLess ? ((n.raws.between || '').match(/^\s*(\+_?)\s*:/) || ['', ''])[1] : '';
        out.push(`${pad}D ${star}${norm(n.prop)}${merge}:${norm(n.value)}${n.important ? '!important' : ''}`);
        walk(n.nodes, depth + 1);
      } else if (n.type === 'rule') {
        if (n.mixin) out.push(`${pad}M ${norm(n.selector)}`);
        // 顶层的 `<!--` / `-->` 按 CSS 规范忽略, postcss 把它并进后面规则的选择器
        else out.push(`${pad}R ${depth ? norm(n.selector) : norm(n.selector).replace(/^(?:<!--|-->)+/, '')}`);
        walk(n.nodes, depth + 1);
      } else if (n.type === 'atrule') {
        // postcss-less 把部分无块的变量声明(`@a:b;` 名称含冒号, `@a : b;` 参数以冒号开头)解析成普通 at-rule, 按变量声明归一
        if (isLess && !n.variable && !n.nodes && !n.mixin && !n.function &&
            (n.name.includes(':') || n.params.startsWith(':'))) {
          out.push(`${pad}D @${norm(n.name + n.raws.afterName + n.params)}`);
        } else if (n.variable) out.push(`${pad}D @${norm(n.name)}:${norm(n.value ?? n.params)}`);
        // postcss-less 把语句级函数调用 `each(...);` 解析成 function at-rule, 与 easy-gonz 的 function 节点一样按 mixin 调用归一
        else if (isLess && n.function) out.push(`${pad}M ${norm(n.name + n.params)}`);
        else if (n.mixin) out.push(`${pad}M ${norm((n.raws.identifier || '') + n.name + n.params)}${n.important ? '!important' : ''}`);
        else out.push(`${pad}A @${norm(n.name)} ${norm(n.params)}`);
        walk(n.nodes, depth + 1);
      } else {
        out.push(`${pad}? ${n.type}`);
      }
    }
  })(root.nodes, 0);
  return out;
}

const SKIP = new Set(['space', 'declarationDelimiter', 'delimiter', 'multilineComment', 'singlelineComment']);

function gonzOutline(ast) {
  const out = [];
  (function walk(nodes, depth) {
    for (const n of nodes) {
      if (SKIP.has(n.type)) continue;
      if (!depth && n.type === 'raw' && /^(?:<!--|-->)$/.test(n.content)) continue;
      const pad = '  '.repeat(depth);
      const content = Array.isArray(n.content) ? n.content : [];
      const blockIndex = content.findIndex((c) => c.type === 'block');
      const head = (blockIndex < 0 ? content : content.slice(0, blockIndex)).map(String).join('');
      const text = blockIndex < 0 ? n.toString() : head;
      if (n.type === 'declaration') {
        const colon = content.findIndex((c) => c.type === 'propertyDelimiter');
        const prop = norm(content.slice(0, colon < 0 ? content.length : colon).map(String).join(''));
        const valueNode = content.find((c) => c.type === 'value');
        const valueContent = valueNode && Array.isArray(valueNode.content) ? valueNode.content : [];
        const nested = valueContent.findIndex((c) => c.type === 'block');
        const after = colon < 0 ? [] : content.slice(colon + 1);
        // css 的值里没有嵌套属性, `--x: { … }` 是普通声明
        if (nested < 0 || n.syntax === 'css') {
          out.push(`${pad}D ${prop}:${norm(after.map(String).join(''))}`);
        } else {
          // scss 嵌套属性 `font: 12px { family: x }` / `font: { ... }` 与 less 分离规则集 `@a: { ... }`
          const before = norm(valueContent.slice(0, nested).map(String).join(''));
          out.push(before || prop.startsWith('@') ? `${pad}D ${prop}:${before}` : `${pad}R ${prop}:`);
          walk(valueContent[nested].content, depth + 1);
        }
      } else if (n.type === 'ruleset') {
        out.push(`${pad}R ${norm(head)}`);
      } else if (n.syntax === 'less' && n.type === 'mixin' && blockIndex >= 0) {
        // less 的 mixin 定义, postcss-less 当作普通规则
        out.push(`${pad}R ${norm(head)}`);
      } else if (n.syntax === 'less' && (n.type === 'include' || n.type === 'mixin' || n.type === 'function')) {
        out.push(`${pad}M ${norm(text).replace(/;$/, '')}`);
      } else if (n.syntax === 'less' && n.type === 'extend' && blockIndex >= 0) {
        // 带块的 extend `.a:extend(.b) {}` 在 postcss-less 中是普通规则
        out.push(`${pad}R ${norm(head)}`);
      } else if (n.syntax === 'less' && n.type === 'extend') {
        // `&:extend(.a);` 在 postcss-less 中是属性为 & 的声明
        out.push(`${pad}D ${norm(text).replace(/;$/, '')}`);
      } else if (norm(text).startsWith('@')) {
        const m = /^\s*@((?:[\w-]|\\[0-9a-fA-F]{1,6} ?|\\[^0-9a-fA-F\n]|#\{[^}]*\})+)([\s\S]*)$/.exec(text.replace(/\/\*[\s\S]*?\*\//g, ' '));
        out.push(`${pad}A @${m ? norm(m[1]) : norm(text)} ${m ? norm(m[2]).replace(/;$/, '') : ''}`);
      } else {
        out.push(`${pad}? ${n.type} ${norm(text)}`);
      }
      if (blockIndex >= 0) walk(content[blockIndex].content, depth + 1);
    }
  })(ast.content, 0);
  return out;
}

const refSyntaxes = { css: 'postcss', scss: 'postcss-scss', less: 'postcss-less' };

// ast 须是 c.src 的无损解析结果; 返回 pass / ref-error(参考解析器失败, 无从比较) / diff(附首个不同条目)
export function compareOutline(ast, c) {
  lineComments = c.syntax !== 'css';
  isLess = c.syntax === 'less';
  let ref;
  try {
    ref = require(refSyntaxes[c.syntax]).parse(c.src, { from: undefined });
  } catch {
    return { level: 'ref-error' };
  }
  const a = gonzOutline(ast);
  const b = postcssOutline(ref);
  if (a.join('\n') === b.join('\n')) return { level: 'pass' };
  if (refBroken(ref)) return { level: 'ref-error' };
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return { level: 'diff', gonz: (a[i] ?? '<无>').trim().slice(0, 120), ref: (b[i] ?? '<无>').trim().slice(0, 120) };
}

export function setup({ gonzPkg }) {
  const gonzales = require(gonzPkg);
  return (c) => {
    let ast;
    try {
      ast = gonzales.parse(c.src, { syntax: c.syntax });
      if (ast.toString() !== c.src) return { level: 'gonz-lossy' };
    } catch {
      return { level: 'gonz-error' };
    }
    return compareOutline(ast, c);
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const only = process.argv.slice(2);
  const cases = loadCases().filter((c) => c.valid !== false && c.syntax !== 'sass' && (!only.length || only.includes(c.suite)));
  const results = await runPool(cases, import.meta.url, { gonzPkg: path.resolve(here, '../../packages/easy-gonz') });
  const rows = {};
  const kinds = {};
  cases.forEach((c, i) => {
    const r = results[i];
    const row = (rows[c.suite] ??= { 用例: 0, 'gonz 不能无损解析': 0, '参考解析器失败': 0, 可比: 0, 一致: 0, 一致率: '' });
    row.用例++;
    if (r.level === 'gonz-error' || r.level === 'gonz-lossy' || r.level === 'timeout' || r.level === 'crash') row['gonz 不能无损解析']++;
    else if (r.level === 'ref-error') row['参考解析器失败']++;
    else {
      row.可比++;
      if (r.level === 'pass') row.一致++;
      else {
        const k = `${c.syntax} | gonz: ${r.gonz.replace(/^(\S+ \S{0,24}).*$/, '$1')} | ref: ${r.ref.replace(/^(\S+ \S{0,24}).*$/, '$1')}`;
        (kinds[k] ??= []).push(c.id);
      }
    }
  });
  for (const row of Object.values(rows)) row.一致率 = (100 * row.一致 / Math.max(1, row.可比)).toFixed(1) + '%';
  console.table(rows);
  const top = Object.entries(kinds).sort((a, b) => b[1].length - a[1].length);
  for (const [k, ids] of top.slice(0, 25)) console.log(String(ids.length).padStart(5), k, ' 例:', ids[0]);
  writeFileSync(path.join(cacheRoot, 'outline-report.json'), JSON.stringify({ rows, kinds: Object.fromEntries(top) }, null, 1));
}
