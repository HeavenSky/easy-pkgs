// easy-comb 官方测试集判定, 用内置 csscomb 预设, 只判 easy-gonz 能无损解析的非非法用例:
// crash(格式化抛错) / timeout / reparse(输出不能再解析) / idempotent(再格式化一次结果变了) / semantic(编译后样式变了).
// 语义对照: scss / sass 用 dart-sass 编译, less 用 less 编译, css 直接比较; 输入本身编译失败的用例不判此项.
// 用法: node comb.mjs [--update]; 基线为 packages/easy-comb/test/official-baseline.json.
// node comb.mjs --per-option: 每个选项单独开启, 每种语法等距抽样跑, 只出报告, 用于定位出问题的选项.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { report, summarize } from './baseline.mjs';
import { loadCases } from './extract.mjs';
import { runPool } from './pool.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, '../../packages/easy-comb');
const require = createRequire(import.meta.url);

// 选择器与值里的空白: 合并成一个空格, 标点两侧的空格去掉; 后代组合符等有意义的空格保留
function space(s) {
  return String(s)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/ ?([>+~,(){}:;=[\]]) ?/g, '$1')
    .trim();
}

// 抹平 easy-comb 选项本来就会做的等价改写: 颜色大小写与缩写, 前导零, 无单位零, 引号种类
function value(v) {
  return space(v)
    .replace(/#([0-9a-f]{3,8})\b/gi, (m, hex) => {
      hex = hex.toLowerCase();
      if (hex.length === 3 || hex.length === 4) hex = [...hex].map((ch) => ch + ch).join('');
      return '#' + hex;
    })
    .replace(/(^|[^\w.-])([+-]?)0+\.(\d)/g, '$1$2.$3')
    .replace(/(^|[^\w.-])0(?:px|em|rem|ex|ch|vw|vh|vmin|vmax|cm|mm|in|pt|pc)\b/g, (m, p) => p + '0')
    .replace(/"((?:[^"\\\n]|\\[\s\S])*)"|'((?:[^'\\\n]|\\[\s\S])*)'/g, (m, dq, sq) => string(dq ?? sq));
}

// 字符串记号按值比较: 引号种类与引号的转义写法不同(`'b"r'` 与 `"b\"r"`)是同一个字符串, 统一成双引号形式; 其他转义原样保留
function string(inner) {
  const raw = inner.replace(/\\([\s\S])/g, (m, c) => (c === '"' || c === "'" ? c : m));
  return '"' + raw.replace(/"/g, '\\"') + '"';
}

// 元素名大小写不敏感(element-case 选项会改), 类名与 id 不改; 属性选择器的引号种类(quotes 选项会改)
function selector(s) {
  return space(s)
    .replace(/(^|[\s>+~,()])([A-Za-z][\w-]*)/g, (m, p, name) => p + name.toLowerCase())
    .replace(/'((?:[^'"\\]|\\[^'"])*)'/g, '"$1"');
}

// 属性族: 去掉厂商前缀后取第一段, margin 与 margin-top, border 与 border-top-color 归为一族; 自定义属性各自成族
function family(prop) {
  const p = prop.toLowerCase();
  if (p.startsWith('--')) return prop;
  return p.replace(/^-(?:webkit|moz|ms|o|khtml)-/, '').split('-')[0];
}

// 选择器列表的特异性范围 [最小, 最大], 每项编码成 a*1e6+b*1e3+c; 认不出(含 `&` 等)时返回 null
function specificity(sel, parser) {
  let list;
  try {
    list = parser().astSync(sel);
  } catch {
    return null;
  }
  let unknown = false;
  function of(node) {
    let a = 0, b = 0, c = 0;
    node.walk((n) => {
      if (n.type === 'id') a++;
      else if (n.type === 'class' || n.type === 'attribute') b++;
      else if (n.type === 'tag') c++;
      else if (n.type === 'nesting') unknown = true;
      else if (n.type === 'pseudo') {
        const name = n.value.toLowerCase();
        if (name === ':where') return false;
        if (name === ':is' || name === ':not' || name === ':has' || name === ':matches') {
          const inner = n.nodes.map(of);
          const max = Math.max(0, ...inner);
          a += Math.floor(max / 1e6); b += Math.floor(max / 1e3) % 1e3; c += max % 1e3;
          return false;
        }
        if (n.nodes && n.nodes.length) unknown = true;
        if (name.startsWith('::') || /^:(before|after|first-line|first-letter)$/.test(name)) c++;
        else b++;
        return false;
      }
    });
    return a * 1e6 + b * 1e3 + c;
  }
  const values = list.nodes.map(of);
  return unknown || !values.length ? null : [Math.min(...values), Math.max(...values)];
}

// 编译结果的语义形态: 每条声明记为 (上下文, 声明), 上下文是外层 @-规则与选择器链.
// 先后只在同族属性之间影响层叠, 所以按属性族比较; 不含声明的 @-规则(`@import`, 空 `@media` 等)按文档顺序另列.
export function canon(css, postcss) {
  const families = new Map();
  const statements = [];
  let count = 0;
  (function walk(nodes, ctx, rules) {
    const decls = [];
    for (const n of nodes || []) {
      if (n.type !== 'decl') continue;
      // postcss 认不出后面跟着注释的 `! important`, 按值文本补判
      const v = value(n.value);
      const important = n.important || /!\s*important$/i.test(v);
      decls.push({ n, important, decl: `${n.prop}:${v.replace(/\s*!\s*important$/i, '')}${important ? '!important' : ''}` });
    }
    // 同一规则里完全相同的声明只有最后一次起作用(前面的总被它覆盖), 只计最后一次; less 会合并输出里相同的声明
    const last = new Map(decls.map((d, i) => [d.decl, i]));
    decls.forEach(({ n, important, decl }, i) => {
      if (last.get(decl) !== i) return;
      const f = family(n.prop);
      if (!families.has(f)) families.set(f, []);
      families.get(f).push({ key: `${ctx} | ${decl}`, ctx, rule: rules.length === 1 ? rules[0] : null, important });
      count++;
    });
    for (const n of nodes || []) {
      if (n.type === 'rule') walk(n.nodes, ctx + ' R ' + selector(n.selector), [...rules, n.selector]);
      else if (n.type === 'atrule') {
        const sub = ctx + ` A @${n.name} ${value(n.params)}`;
        const before = count + statements.length;
        walk(n.nodes, sub, rules);
        // remove-empty-rulesets 会删掉空规则, 两边都不计空规则; 不含声明的 @-规则本身要保留
        if (count + statements.length === before) statements.push(sub.trim());
      }
    }
  })(postcss.parse(css).nodes, '', []);
  return { families, statements };
}

// 两边等价: 不含声明的 @-规则序列相同, 每族声明的多重集合相同, 且先后颠倒的每对同族声明都不影响层叠:
// 同一上下文(规则内排序本来就是 sort-order 的行为), 恰有一条 !important, 或两条规则的特异性范围不重叠.
export function compare(before, after, parser) {
  const sb = before.statements.join('\n'), sa = after.statements.join('\n');
  if (sb !== sa) {
    let i = 0;
    while (before.statements[i] === after.statements[i]) i++;
    return `${before.statements[i] ?? '<无>'} → ${after.statements[i] ?? '<无>'}`;
  }
  const names = new Set([...before.families.keys(), ...after.families.keys()]);
  for (const f of [...names].sort()) {
    const b = before.families.get(f) || [], a = after.families.get(f) || [];
    const kb = b.map((x) => x.key).sort(), ka = a.map((x) => x.key).sort();
    if (kb.join('\n') !== ka.join('\n')) {
      let i = 0;
      while (kb[i] === ka[i]) i++;
      return `${kb[i] ?? '<无>'} → ${ka[i] ?? '<无>'}`;
    }
    // 同一 key 的第 k 次出现两边对应
    const seen = new Map();
    const pos = new Map();
    a.forEach((x, i) => {
      const k = (seen.get(x.key) ?? 0);
      seen.set(x.key, k + 1);
      pos.set(x.key + '#' + k, i);
    });
    seen.clear();
    const order = b.map((x) => {
      const k = (seen.get(x.key) ?? 0);
      seen.set(x.key, k + 1);
      return pos.get(x.key + '#' + k);
    });
    for (let i = 0; i < b.length; i++) {
      for (let j = i + 1; j < b.length; j++) {
        if (order[i] < order[j]) continue;
        const x = b[i], y = b[j];
        if (x.ctx === y.ctx || x.important !== y.important) continue;
        const sx = x.rule && specificity(x.rule, parser), sy = y.rule && specificity(y.rule, parser);
        if (sx && sy && (sx[1] < sy[0] || sy[1] < sx[0])) continue;
        return `先后颠倒: ${x.key} / ${y.key}`;
      }
    }
  }
  return null;
}

export async function setup({ config }) {
  const { default: Comb } = await import(pathToFileURL(path.join(pkg, 'src/csscomb.ts')));
  const gonzales = require(path.join(pkg, 'vendor/gonzales-pe/src/gonzales.js'));
  const postcss = require('postcss');
  const parser = require('postcss-selector-parser');
  const sass = require('sass');
  const less = require('less');
  const comb = new Comb(config ?? 'csscomb');

  async function compile(c, src) {
    if (c.syntax === 'css') return src;
    if (c.syntax === 'less') {
      const out = await less.render(src, { filename: c.file, javascriptEnabled: false });
      return out.css;
    }
    return sass.compileString(src, { syntax: c.syntax === 'sass' ? 'indented' : 'scss', logger: sass.Logger.silent }).css;
  }

  return async (c) => {
    try {
      if (gonzales.parse(c.src, { syntax: c.syntax }).toString() !== c.src) return { level: 'skip' };
    } catch {
      return { level: 'skip' };
    }
    let out;
    try {
      out = await comb.processString(c.src, { syntax: c.syntax });
    } catch (e) {
      return { level: 'crash', error: String(e.message).split('\n')[0].slice(0, 160) };
    }
    try {
      gonzales.parse(out, { syntax: c.syntax });
    } catch {
      return { level: 'reparse' };
    }
    if (await comb.processString(out, { syntax: c.syntax }) !== out) return { level: 'idempotent' };

    // 不执行下载来的 less 插件, 不发起网络请求
    if (c.syntax === 'less' && /@plugin|https?:\/\//.test(c.src)) return { level: 'pass' };
    let before;
    try {
      before = canon(await compile(c, c.src), postcss);
    } catch {
      return { level: 'pass' };
    }
    let after;
    try {
      after = canon(await compile(c, out), postcss);
    } catch (e) {
      return { level: 'semantic', error: '输出编译失败: ' + String(e.message).split('\n')[0].slice(0, 120) };
    }
    const diff = compare(before, after, parser);
    if (!diff) return { level: 'pass' };
    return { level: 'semantic', error: diff.slice(0, 200) };
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const all = loadCases().filter((c) => c.valid !== false);
  if (process.argv.includes('--per-option')) {
    const { default: Comb } = await import(pathToFileURL(path.join(pkg, 'src/csscomb.ts')));
    const preset = new Comb('csscomb').config ?? {};
    const SAMPLE = 500;
    const sample = [];
    for (const syntax of ['css', 'scss', 'sass', 'less']) {
      const list = all.filter((c) => c.syntax === syntax);
      const step = Math.max(1, list.length / SAMPLE);
      for (let k = 0; k < list.length && sample.length < 4 * SAMPLE; k += step) sample.push(list[Math.floor(k)]);
    }
    const rows = {};
    for (const [name, val] of Object.entries(preset)) {
      const results = await runPool(sample, import.meta.url, { config: { [name]: val } }, { timeout: 10000 });
      const row = (rows[name] = {});
      for (const r of results) if (r.level !== 'pass' && r.level !== 'skip') row[r.level] = (row[r.level] || 0) + 1;
    }
    console.table(rows);
  } else {
    const results = await runPool(all, import.meta.url, {}, { timeout: 10000 });
    const judged = all.filter((c, i) => results[i].level !== 'skip');
    const kept = results.filter((r) => r.level !== 'skip');
    const ok = report('easy-comb 官方测试集(只计 easy-gonz 能无损解析的用例)', summarize(judged, kept),
      path.join(pkg, 'test/official-baseline.json'), process.argv.includes('--update'));
    if (process.argv.includes('--verbose')) {
      for (const r of kept) if (r.level !== 'pass') console.log(r.level, r.id, r.error ?? '');
    }
    process.exitCode = ok ? 0 : 1;
  }
}
