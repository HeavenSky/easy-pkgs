// 插件调度核心: 配置插件, 解析样式并按插件顺序处理或检查.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import gonzales from 'easy-gonz';
import type { Node, Syntax } from 'easy-gonz';
import { escapePath, globSync } from 'tinyglobby';
import type { Config } from './config.ts';
import Errors from './errors.ts';
import type { LintError, OptionDefinition } from './option.ts';
import Plugin from './plugin.ts';

const { version } = createRequire(import.meta.url)('../package.json');

export interface StringOptions {
  context?: string;
  filename?: string;
  syntax?: string;
}

// 由 Comb/CLI 自身消费, 不对应任何选项插件的配置键.
const CORE_CONFIG_KEYS = ['exclude', 'lint', 'verbose', 'syntax', 'template'];

export default class Comb {
  config: Record<string, unknown> = {};
  exclude: string[] = [];
  // exclude 的解析基准目录; 未设置时取查询时的 cwd. configure() 设置 exclude 时清空, 由加载配置文件的调用方再设为配置文件所在目录.
  _excludeBase?: string;
  // Whether lint mode is on.
  lint = false;
  // List of used plugins.
  plugins: Plugin[] = [];
  pluginsDependencies: Record<string, string[]> = {};
  // List of supported syntaxes.
  supportedSyntaxes = new Set<string>();
  // Mapping file extensions to syntax
  syntaxMap = new Map<string, string>();
  syntax?: string;
  // Whether verbose mode is on.
  verbose = false;

  /**
   * Loads configuration from JSON.
   */
  configure(config: Config | Record<string, unknown>): this {
    if (typeof config !== 'object' || config === null)
      throw new Error('Config must be an object.');

    const conf = config as Record<string, any>;
    this.lint = Boolean(conf.lint);
    this.verbose = Boolean(conf.verbose);
    if (conf.exclude) {
      this.exclude = conf.exclude;
      this._excludeBase = undefined;
    }

    if (conf.syntax) {
      for (let key in conf.syntax) {
        this.syntaxMap.set(key, conf.syntax[key]);
      }
    }

    for (let i = 0, l = this.plugins.length; i < l; i++) {
      let plugin = this.plugins[i];
      let name = plugin.name;
      if (!Object.hasOwn(conf, name)) continue;

      try {
        plugin.value = conf[name];
        this.config[name] = plugin.value;
      } catch (e) {
        // 非法值仍然忽略该选项, 但要提示, 否则用户只会看到"选项不生效".
        console.warn(`Invalid value for option "${name}": ${(e as Error).message}`);
      }
    }

    if (this.plugins.length) {
      Object.keys(conf).forEach((key) => {
        if (CORE_CONFIG_KEYS.indexOf(key) !== -1) return;
        if (this._pluginAlreadyUsed(key)) return;
        console.warn(`Unknown option "${key}" is ignored.`);
      });
    }

    // Chaining.
    return this;
  }

  /**
   * Lints all files in a directory.
   */
  lintDirectory(path: string): Promise<LintError[][]> {
    let files = this._getAcceptableFilesFromDirectory(path);
    let promises = files.map((file) => this.lintFile(file));
    return Promise.all(promises);
  }

  /**
   * Lints a single file.
   */
  lintFile(path: string): Promise<LintError[]> {
    let syntax = this._extractSyntax(path);
    return this._readFile(path).then((string) => {
      return this.lintString(string, {syntax: syntax, filename: path});
    });
  }

  /**
   * Lints a file or a directory.
   */
  lintPath(path: string): Promise<LintError[] | LintError[][]> {
    path = path.replace(/\/$/, '');
    return fs.statSync(path).isDirectory() ?
      this.lintDirectory(path) :
      this.lintFile(path);
  }

  /**
   * Lints a string.
   *
   * @returns Resolves with <Array> list of found errors.
   */
  lintString(text: string, options?: StringOptions): Promise<LintError[]> {
    // 与 processString 一致按 `\n` 处理, 行号不受影响.
    if (typeof text === 'string') text = text.replace(/\r\n/g, '\n');
    return this._parseString(text, options)
      .then(ast => ast ? this._lintTree(ast, undefined, text, options) : [])
      .then(errors => {
        errors.forEach(error => {
          error.context = this._getContext(text, error.line);
        });

        return errors;
      });
  }

  _getContext(text: string, currentLineNumber: number): string {
    var LINES_AROUND = 2;
    var result: string[] = [];
    var start = currentLineNumber - 1 - LINES_AROUND;
    var end = currentLineNumber + LINES_AROUND;
    var lines = text.split(/\r\n|\r|\n/);

    for (var i = start; i < end; i++) {
      var line = lines[i];
      if (!line) continue;
      var ln = i + 1;
      if (ln === currentLineNumber) {
        result.push(ln + '*| ' + line);
      } else {
        result.push(ln + ' | ' + line);
      }
    }
    return result.join(os.EOL);
  }

  /**
   * Processes directory recursively.
   */
  processDirectory(path: string): Promise<number[]> {
    let files = this._getAcceptableFilesFromDirectory(path);
    return Promise.all(files.map(file => this._processAcceptedFile(file)));
  }

  /**
   * Processes single file.
   */
  async processFile(path: string): Promise<number | undefined> {
    if (!this._shouldProcessFile(path)) return;
    return this._processAcceptedFile(path);
  }

  async _processAcceptedFile(path: string): Promise<number> {
    let data = await fsp.readFile(path, 'utf8');
    let processedData = await this.processString(data, {
      syntax: this._extractSyntax(path),
      filename: path
    });

    if (data === processedData) {
      if (this.verbose) console.log(' ', path);
      return 0;
    }

    if (!this.lint) await fsp.writeFile(path, processedData, 'utf8');
    if (this.verbose) console.log(this.lint ? '!' : '✓', path);
    return 1;
  }

  /**
   * Processes directory or file.
   */
  async processPath(path: string): Promise<number | undefined | number[]> {
    path = path.replace(/\/$/, '');

    let stat = await fsp.stat(path);
    return stat.isDirectory() ?
      this.processDirectory(path) :
      this.processFile(path);
  }

  /**
   * Processes a string.
   *
   * @returns Resolves in processed string
   */
  async processString(text: string, options?: StringOptions): Promise<string> {
    // 各选项只按 `\n` 处理空白, CRLF 输入不先归一会被插入混合换行.
    let crlf = typeof text === 'string' && text.includes('\r\n');
    if (crlf) text = text.replace(/\r\n/g, '\n');

    let ast = await this._parseString(text, options);
    if (!ast) return text;
    let result = this._processTree(ast).toString();
    return crlf ? result.replace(/\n/g, '\r\n') : result;
  }

  /**
   * Add a plugin.
   */
  use(options: OptionDefinition): this | undefined {
    // Check whether plugin with the same is already used.
    let pluginName = options.name;
    if (this._pluginAlreadyUsed(pluginName)) {
      if (this.verbose)
        console.warn(Errors.twoPluginsWithSameName(pluginName));
      return;
    }

    let plugin = new Plugin(options);

    plugin.syntax.forEach(s => this.supportedSyntaxes.add(s));

    // Sort plugins.
    let pluginToRunBefore = plugin.runBefore;

    if (!pluginToRunBefore) {
      this.plugins.push(plugin);
    } else {
      if (this._pluginAlreadyUsed(pluginToRunBefore)) {
        let i = this._pluginIndex(pluginToRunBefore);
        this.plugins.splice(i, 0, plugin);
      } else {
        this.plugins.push(plugin);
        if (!this.pluginsDependencies[pluginToRunBefore])
          this.pluginsDependencies[pluginToRunBefore] = [];
        this.pluginsDependencies[pluginToRunBefore].push(pluginName);
      }
    }

    let dependents = this.pluginsDependencies[pluginName];
    if (!dependents) return this;

    for (let i = 0, l = dependents.length; i < l; i++) {
      let name = dependents[i];
      let x = this._pluginIndex(name);
      let plugin = this.plugins[x];
      this.plugins.splice(x, 1);
      this.plugins.splice(-1, 0, plugin);
    }

    // Chaining.
    return this;
  }

  /**
   * 列出目录下未被 exclude 排除且语法受支持的文件, 路径保持以 `dir` 开头的写法.
   */
  _getAcceptableFilesFromDirectory(dir: string): string[] {
    let root = path.resolve(dir);
    let scope = globScope(root, this._excludeBase);
    let pattern = scope.pattern ? escapePath(scope.pattern) + '/**/*' : '**/*';

    return globSync(pattern, {
      cwd: scope.cwd,
      ignore: this.exclude,
      dot: true,
      absolute: true
    })
      .map(file => path.join(dir, path.relative(root, file)))
      .filter(file => this.supportedSyntaxes.has(this._extractSyntax(file)))
      .sort();
  }

  /**
   * @return List of errors.
   */
  _lintTree(ast: Node, filename?: string, text?: string, options?: StringOptions): LintError[] {
    let errors: LintError[] = [];
    let config = this.config;

    let active = this.plugins.filter(plugin => {
      return plugin.value !== null &&
             plugin.syntax.indexOf(ast.syntax!) !== -1;
    });

    active.forEach(plugin => {
      if (typeof plugin.lint === 'function')
        errors = errors.concat(plugin.lint(ast, config));
    });

    if (text !== undefined)
      errors = errors.concat(this._lintByProcess(active, text, ast.syntax!, options));

    if (filename) {
      errors.forEach(error => {
        error.filename = filename;
      });
    }

    return errors;
  }

  /**
   * 没有专门 lint() 的选项的通用 lint: 只启用该选项处理, 结果与输入不同则报告该选项.
   * 选项之间有配合(例: 换行类选项先去掉缩进, 再由 block-indent 补回), 单独处理会误报, 所以:
   * 全部选项处理后与输入相同时不报; 否则只报同时满足以下两点的选项, 位置取第一处交集:
   * 去掉该选项会改变全部选项处理的结果; 该选项的改动行与全部选项处理的改动行有交集.
   */
  _lintByProcess(plugins: Plugin[], text: string, syntax: Syntax, options?: StringOptions): LintError[] {
    let parse = () => gonzales.parse(text, {syntax, context: options && options.context});
    let full = this._processTree(parse()).toString();
    if (full === text) return [];

    let lines = text.split('\n');
    let fullChanged = changedLines(lines, full.split('\n'));
    let errors: LintError[] = [];

    plugins.forEach(plugin => {
      if (typeof plugin.lint === 'function' || typeof plugin.process !== 'function') return;

      let ast = parse();
      plugin.process(ast, this.config);
      let result = ast.toString();
      if (result === text) return;

      let line = changedLines(lines, result.split('\n')).find(i => fullChanged.has(i));
      if (line === undefined || this._processTree(parse(), plugin).toString() === full) return;
      // 只差末尾换行时(例: eof-newline)指向最后一个非空行的行尾
      let column: number | undefined;
      if (line > 0 && line === lines.length - 1 && lines[line] === '') {
        line--;
        column = lines[line].length + 1;
      }
      errors.push(this._lintError(plugin, text, result, line, column));
    });

    return errors;
  }

  _lintError(plugin: Plugin, text: string, result: string, line: number, column?: number): LintError {
    if (column === undefined) {
      // 第一个不同字符落在该行时用它的列, 否则指向行首
      let i = 0;
      while (i < text.length && text[i] === result[i]) i++;
      let before = text.slice(0, i).split('\n');
      column = before.length === line + 1 ? before[before.length - 1].length + 1 : 1;
    }

    // 数组等复杂取值(例: sort-order)不写进消息
    let value = typeof plugin.value === 'object' ? '' : ` (${JSON.stringify(plugin.value)})`;
    return {
      message: `Code style does not match option "${plugin.name}"${value}`,
      line: line + 1,
      column: column,
      option: plugin.name
    };
  }

  async _parseString(text: string, options?: StringOptions): Promise<Node | null> {
    let syntax = options && options.syntax || 'css';
    let filename = options && options.filename || '';
    let context = options && options.context;

    if (!text) return null;

    this.syntax = syntax;

    try {
      return gonzales.parse(text, {syntax: syntax as Syntax, context});
    } catch (e) {
      let error = e as Error;
      let message = filename ? [filename] : [];
      message.push(error.message);
      message.push('CSScomb Core version: ' + version);
      error.stack = error.message = message.join(os.EOL);
      throw error;
    }
  }

  _pluginAlreadyUsed(name: string): boolean {
    return this._pluginIndex(name) !== -1;
  }

  _pluginIndex(name: string): number {
    return this.plugins.findIndex(plugin => plugin.name === name);
  }

  /**
   * @return Transformed AST
   */
  _processTree(ast: Node, skip?: Plugin): Node {
    let config = this.config;

    this.plugins.filter(plugin => {
      return plugin.value !== null && plugin !== skip &&
             typeof plugin.process === 'function' &&
             plugin.syntax.indexOf(ast.syntax!) !== -1;
    }).forEach(plugin => {
      plugin.process!(ast, config);
    });

    return ast;
  }

  _readFile(path: string): Promise<string> {
    if (!this._shouldProcessFile(path))
      return Promise.reject(new Error('Path ' + path + ' is not processable.'));

    return fsp.readFile(path, 'utf8');
  }

  /**
   * Checks if path is not present in `exclude` list.
   *
   * @returns False if specified path is present in `exclude` list.
   * Otherwise returns true.
   */
  _shouldProcess(file: string): boolean {
    file = file.replace(/\/$/, '');
    if (!fs.existsSync(file)) {
      console.warn('Path ' + file + ' was not found.');
      return false;
    }

    if (!this.exclude.length) return true;

    // tinyglobby 没有单路径匹配接口: 以路径自身为 pattern 查询, 被 ignore 命中时结果为空.
    let scope = globScope(path.resolve(file), this._excludeBase);
    return globSync(escapePath(scope.pattern), {
      cwd: scope.cwd,
      ignore: this.exclude,
      dot: true,
      onlyFiles: false
    }).length > 0;
  }

  /**
   * Checks if specified path is not present in `exclude` list and it has one of
   * acceptable syntaxes.
   *
   * @returns False if the path either has unacceptable extension or
   * is present in `exclude` list. True if everything is ok.
   */
  _shouldProcessFile(path: string): boolean {
    // Get file's extension:
    var syntax = this._extractSyntax(path);

    // Check if syntax is supported. If not, ignore the file:
    if (!this.supportedSyntaxes.has(syntax))
      return false;

    return this._shouldProcess(path);
  }

  /**
   * Extract syntax by file path
   *
   * @returns syntax
   */
  _extractSyntax(path: string): string {
    var extension = path.split('.').pop() as string;

    return this.syntaxMap.get('.' + extension) || extension;
  }
}

/**
 * 按行求 LCS, 返回 `a` 中未出现在公共子序列里的行号(从 0 起), 升序.
 * 去掉首尾相同的行后规模仍过大时, 中间部分整体视为改动.
 */
function changedLines(a: string[], b: string[]): number[] & { has(i: number): boolean } {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }

  let n = endA - start;
  let m = endB - start;
  let changed: number[] = [];
  if (n * m > 4e6) {
    for (let i = start; i < endA; i++) changed.push(i);
  } else {
    // dp[i][j]: a[start+i..] 与 b[start+j..] 的 LCS 长度
    let dp = Array.from({length: n + 1}, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = a[start + i] === b[start + j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    for (let i = 0, j = 0; i < n;) {
      if (j < m && a[start + i] === b[start + j]) { i++; j++; }
      else if (j < m && dp[i][j + 1] >= dp[i + 1][j]) j++;
      else changed.push(start + i++);
    }
  }
  let set = new Set(changed);
  return Object.assign(changed, {has: (i: number) => set.has(i)});
}

/**
 * exclude 是相对 `base`(缺省为 cwd)的 glob, 所以 `base` 内的路径以 `base` 为基准查询;
 * `base` 外的路径无法用相对 `base` 的 pattern 表达, 改以其所在目录为基准.
 */
function globScope(target: string, base: string = process.cwd()): { cwd: string; pattern: string } {
  let cwd = base;
  let relative = path.relative(cwd, target);
  if (relative.startsWith('..') || path.isAbsolute(relative))
    return { cwd: path.dirname(target), pattern: path.basename(target) };
  return { cwd, pattern: relative.split(path.sep).join('/') };
}
