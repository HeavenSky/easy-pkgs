// 从已下载的官方语料抽取统一格式的用例 {id, suite, syntax, valid, group, src, file?}, 结果缓存在 .cache/official/ 下.
// valid: true = 官方判定合法, false = 官方判定非法(不参与判定), null = 未经官方标注(WPT <style> 块).
// 下载内容只当文本读取, 不执行其中任何 JS.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cacheRoot, fetchAll, suiteDir } from './fetch.mjs';

// 颜色文件是生成的排列组合, 每个文件等距抽样; 改动会使用例 id 集合变化, 须同时更新各包基线
const COLOR_SAMPLE = 100;

function walk(dir, fn, rel = '') {
  for (const ent of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
    const r = rel ? `${rel}/${ent.name}` : ent.name;
    if (ent.isDirectory()) walk(path.join(dir, ent.name), fn, r);
    else fn(path.join(dir, ent.name), r);
  }
}

function cssParsingTests(dir) {
  const out = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    // 输入是字节流与编码协商, 与文本解析器无关
    if (f === 'stylesheet_bytes.json') continue;
    const name = f.slice(0, -5);
    const arr = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
    let pairs = [];
    for (let i = 0; i < arr.length; i += 2) pairs.push([arr[i], arr[i + 1], i / 2]);
    const isColor = name.startsWith('color_');
    if (isColor && pairs.length > COLOR_SAMPLE) {
      const step = pairs.length / COLOR_SAMPLE;
      pairs = Array.from({ length: COLOR_SAMPLE }, (_, k) => pairs[Math.floor(k * step)]);
    }
    for (const [input, expected, idx] of pairs) {
      let src;
      if (['stylesheet', 'rule_list', 'one_rule'].includes(name)) src = input;
      else if (['declaration_list', 'one_declaration', 'blocks_contents'].includes(name)) src = `a{${input}}`;
      else if (['component_value_list', 'one_component_value'].includes(name) || isColor) src = `a{b:${input}}`;
      else if (name === 'An+B') src = `:nth-child(${input}){}`;
      else continue;
      const valid = expected !== null && !JSON.stringify(expected).includes('"error"');
      out.push({ id: `css-parsing-tests:${name}#${idx}`, suite: 'css-parsing-tests', syntax: 'css', valid, group: isColor ? 'color_*' : name, src });
    }
  }
  return out;
}

// 只认参数全是普通字符串字面量的调用; 含变量, 拼接, 模板插值的调用跳过
function readJsString(s, i) {
  const q = s[i];
  if (q !== '"' && q !== "'" && q !== '`') return null;
  let out = '';
  i++;
  while (i < s.length) {
    const ch = s[i];
    if (ch === q) return [out, i + 1];
    if (q === '`' && ch === '$' && s[i + 1] === '{') return null;
    if (ch === '\\') {
      const n = s[i + 1];
      const map = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };
      if (n in map && !(n === '0' && /[0-9]/.test(s[i + 2]))) { out += map[n]; i += 2; continue; }
      if (n === 'x') { out += String.fromCharCode(parseInt(s.substr(i + 2, 2), 16)); i += 4; continue; }
      if (n === 'u') {
        if (s[i + 2] === '{') { const e = s.indexOf('}', i); out += String.fromCodePoint(parseInt(s.slice(i + 3, e), 16)); i = e + 1; continue; }
        out += String.fromCharCode(parseInt(s.substr(i + 2, 4), 16)); i += 6; continue;
      }
      if (n === '\n') { i += 2; continue; }
      out += n; i += 2; continue;
    }
    if (ch === '\n' && q !== '`') return null;
    out += ch; i++;
  }
  return null;
}

function readArgs(s, i, n) {
  const args = [];
  for (let k = 0; k < n; k++) {
    while (/\s/.test(s[i])) i++;
    const r = readJsString(s, i);
    if (!r) return null;
    args.push(r[0]);
    i = r[1];
    while (/\s/.test(s[i])) i++;
    if (k < n - 1) { if (s[i] !== ',') return null; i++; }
  }
  return args;
}

const WPT_HELPERS = {
  test_valid_value: { n: 2, mk: ([p, v]) => `a{${p}: ${v}}`, valid: true, kind: 'value' },
  test_invalid_value: { n: 2, mk: ([p, v]) => `a{${p}: ${v}}`, valid: false, kind: 'value' },
  test_valid_selector: { n: 1, mk: ([s]) => `${s}{}`, valid: true, kind: 'selector' },
  test_invalid_selector: { n: 1, mk: ([s]) => `${s}{}`, valid: false, kind: 'selector' },
  test_valid_rule: { n: 1, mk: ([r]) => r, valid: true, kind: 'rule' },
  test_invalid_rule: { n: 1, mk: ([r]) => r, valid: false, kind: 'rule' },
  test_keyframes_name_valid: { n: 1, mk: ([k]) => `@keyframes ${k}{}`, valid: true, kind: 'keyframes-name' },
  test_keyframes_name_invalid: { n: 1, mk: ([k]) => `@keyframes ${k}{}`, valid: false, kind: 'keyframes-name' },
};

function wpt(dir) {
  const out = [];
  const seen = new Set();
  walk(path.join(dir, 'css'), (full, rel) => {
    if (!/\.html?$/.test(rel)) return;
    rel = `css/${rel}`;
    const text = readFileSync(full, 'utf8');
    const re = /\b(test_[a-z_]+)\(/g;
    let m;
    let n = 0;
    while ((m = re.exec(text))) {
      const h = WPT_HELPERS[m[1]];
      if (!h) continue;
      const args = readArgs(text, m.index + m[0].length, h.n);
      if (!args) continue;
      const src = h.mk(args);
      // 同一输入在多个文件重复出现时只计一次
      const key = `${h.kind}|${h.valid}|${src}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: `wpt-parsing:${rel}#${n++}`, suite: 'wpt-parsing', syntax: 'css', valid: h.valid, group: h.kind, src });
    }
    // 非 parsing 目录中 reftest 等页面的 <style> 块: 多数合法但不保证, 部分页面专测错误恢复
    if (!rel.includes('/parsing/') && !rel.includes('crashtests') &&
        /^css\/(css-nesting|css-syntax|mediaqueries|selectors)\//.test(rel)) {
      const sre = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
      let k = 0;
      while ((m = sre.exec(text))) {
        if (!m[1].trim()) continue;
        // 误收: `<style>` 写在 JS 字符串字面量里且内容含模板插值 `${` 或闭合引号(字符串拼接片段), 抽到的不是 CSS 原文
        const q = text[m.index - 1];
        if ((q === '`' || q === '"' || q === "'") && (m[1].includes(q) || (q === '`' && m[1].includes('${')))) continue;
        out.push({ id: `wpt-style:${rel}#${k++}`, suite: 'wpt-style', syntax: 'css', valid: null, group: rel.split('/')[1], src: m[1] });
      }
    }
  });
  return out;
}

// HRX: 边界为 "<" "="+ ">", 长度由首个边界决定; 边界前的那个换行不属于文件内容
function parseHrx(text) {
  const m = /^<=+>/.exec(text);
  if (!m) return [];
  const parts = text.split('\n' + m[0]);
  parts[0] = parts[0].slice(m[0].length);
  const files = [];
  for (const p of parts) {
    const nl = p.indexOf('\n');
    const head = nl < 0 ? p : p.slice(0, nl);
    if (!head.startsWith(' ')) continue;
    const name = head.trim();
    if (!name.endsWith('/')) files.push([name, nl < 0 ? '' : p.slice(nl + 1)]);
  }
  return files;
}

function sassSpec(dir) {
  const base = path.join(dir, 'spec');
  const vfs = new Map();
  walk(base, (full, rel) => {
    if (rel.endsWith('.hrx')) {
      for (const [n, body] of parseHrx(readFileSync(full, 'utf8'))) vfs.set(path.posix.join(rel.slice(0, -4), n), body);
    } else vfs.set(rel, readFileSync(full, 'utf8'));
  });
  // options.yml 递归生效; 被标注 dart-sass 尚未实现或忽略的用例没有可信期望, 剔除
  const skipped = (d) => {
    const parts = d.split('/');
    for (let i = parts.length; i >= 0; i--) {
      const y = vfs.get([...parts.slice(0, i), 'options.yml'].filter(Boolean).join('/'));
      if (!y) continue;
      const re = /:(todo|ignore_for):\s*\n((?:\s*-.*\n?)*)/g;
      let r;
      while ((r = re.exec(y))) if (/dart-sass/.test(r[2])) return true;
    }
    return false;
  };
  const out = [];
  for (const [p, src] of [...vfs].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
    const m = /^(.*)\/input\.(scss|sass)$/.exec(p);
    if (!m || skipped(m[1])) continue;
    const has = (f) => vfs.has(`${m[1]}/${f}`);
    // 只有 dart-sass 给出编译结果的才算合法; 运行期报错的用例语法可能合法, 但无法据此区分, 一并不判
    let valid;
    if (has('error-dart-sass')) valid = false;
    else if (has('output-dart-sass.css') || has('output.css')) valid = true;
    else valid = false;
    out.push({ id: `sass-spec:${p}`, suite: `sass-spec-${m[2]}`, syntax: m[2], valid, group: p.split('/')[0], src });
  }
  return out;
}

function less(dir) {
  const root = path.join(dir, 'packages/test-data');
  const out = [];
  walk(root, (full, rel) => {
    if (!rel.endsWith('.less')) return;
    const seg = rel.split('/');
    const top = seg[0] === 'tests-error' ? `tests-error/${seg[1]}` : seg[0];
    // less.js 无正式规范: tests-error/parse 视为语法非法, 其余(含被 @import 的辅助文件)视为合法
    out.push({ id: `less:${rel}`, suite: 'less', syntax: 'less', valid: top !== 'tests-error/parse', group: top, src: readFileSync(full, 'utf8'), file: full });
  });
  return out;
}

export function loadCases() {
  fetchAll();
  const key = createHash('sha1')
    .update(readFileSync(new URL('./suites.json', import.meta.url)))
    .update(readFileSync(fileURLToPath(import.meta.url)))
    .digest('hex').slice(0, 12);
  const cacheFile = path.join(cacheRoot, `cases-${key}.json`);
  if (existsSync(cacheFile)) {
    const cases = JSON.parse(readFileSync(cacheFile, 'utf8'));
    // less 用例的 file 是绝对路径, 缓存目录换位置后需要重算
    for (const c of cases) if (c.file) c.file = path.join(suiteDir('less'), 'packages/test-data', c.id.slice('less:'.length));
    return cases;
  }
  const cases = [
    ...cssParsingTests(suiteDir('css-parsing-tests')),
    ...wpt(suiteDir('wpt')),
    ...sassSpec(suiteDir('sass-spec')),
    ...less(suiteDir('less')),
  ];
  const ids = new Set();
  for (const c of cases) {
    if (ids.has(c.id)) throw new Error(`用例 id 重复: ${c.id}`);
    ids.add(c.id);
  }
  writeFileSync(cacheFile, JSON.stringify(cases));
  return cases;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tally = {};
  for (const c of loadCases()) {
    const k = `${c.suite} valid=${c.valid}`;
    tally[k] = (tally[k] || 0) + 1;
  }
  console.table(tally);
}
