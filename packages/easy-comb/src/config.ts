// 配置类型, 以及配置文件的查找与加载(json / js / cjs / mjs / ts / cts / mts).
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// 数字表示若干空格; 字符串可含空格, tab 与换行, 换行后的缩进由 block-indent 决定.
type Space = string | number;

// 各选项默认关闭; 只接受 `true` 的选项通过不写来关闭, 写其他值会被告警并忽略.
export interface Config {
  /**
   * 命中的文件与目录不处理的 glob, 例如 `["node_modules/**"]`.
   * 写在配置文件里时相对配置文件所在目录; 经 `configure()` 直接传入时相对 cwd.
   */
  exclude?: string[];
  /** 同 CLI 的 `--lint`: 只报告需要修改的文件, 不写回. */
  lint?: boolean;
  /** 同 CLI 的 `--verbose`: 打印每个处理过的文件与汇总. */
  verbose?: boolean;
  /** 额外的扩展名到语法的映射, 例如 `{".wxss": "css"}`; 默认处理 css/less/sass/scss. */
  syntax?: Record<string, string>;
  /** 样式文件路径, 写在配置文件里时相对配置文件所在目录; 从中检测出的选项补齐本配置未设置的项. 只有 CLI 读取. */
  template?: string;

  /** 在最后一条声明或 mixin 后补分号; Less/SCSS 的嵌套值 `}` 后不补. 对 .sass 无效. */
  'always-semicolon'?: true;
  /** 块内缩进(含 media query 与嵌套规则): 空格数, 或由空格/tab 组成的字符串. */
  'block-indent'?: Space;
  /** 十六进制颜色的大小写: `#FFF` → `#fff`. */
  'color-case'?: 'lower' | 'upper';
  /** `true` 缩写(`#ffcc00` → `#fc0`), `false` 展开; 支持 4 位与 8 位颜色. */
  'color-shorthand'?: boolean;
  /** 元素选择器的大小写: `LI > A` → `li > a`; 含插值的选择器不处理. */
  'element-case'?: 'lower' | 'upper';
  /** 文件末尾添加(`true`)或去掉(`false`)换行. */
  'eof-newline'?: boolean;
  /** 小数添加(`true`, `0.5em`)或去掉(`false`, `.5em`)前导零. */
  'leading-zero'?: boolean;
  /** 规则集与 at-rule 之间的空行数; 连续的 `@import`/`@use`/`@forward`/`@charset` 不拆开. */
  'lines-between-rulesets'?: number;
  /** 字符串引号风格; 保留已有的转义. */
  'quotes'?: 'single' | 'double';
  /** 删除只含空白的规则集, 包括 `@media` 内的. */
  'remove-empty-rulesets'?: true;
  /**
   * 属性顺序: 属性名列表, 或分组列表(组间空一行).
   * 未列出的带前缀属性跟在其标准名之前; `--name` 按全名匹配, `$custom-property` 代表其余自定义属性;
   * `...` 标记未列出属性的位置; 预处理器可用 `$variable` `$include` `$include 名称` `$extend` `$import`.
   */
  'sort-order'?: string[] | string[][];
  /** 未列入 `sort-order` 的属性按字母序排列. */
  'sort-order-fallback'?: 'abc';
  /** 声明中 `:` 之后的空白. */
  'space-after-colon'?: Space;
  /** 选择器组合符 `>` `+` `~` 之后的空白. */
  'space-after-combinator'?: Space;
  /** `{` 之后的空白. 对 .sass 无效. */
  'space-after-opening-brace'?: Space;
  /** 选择器分隔符 `,` 之后的空白; `"\n"` 让每个选择器独占一行. */
  'space-after-selector-delimiter'?: Space;
  /** `}` 之前的空白. 对 .sass 无效. */
  'space-before-closing-brace'?: Space;
  /** 声明中 `:` 之前的空白. */
  'space-before-colon'?: Space;
  /** 选择器组合符 `>` `+` `~` 之前的空白. */
  'space-before-combinator'?: Space;
  /** `{` 之前的空白. 对 .sass 无效. */
  'space-before-opening-brace'?: Space;
  /** 选择器分隔符 `,` 之前的空白. */
  'space-before-selector-delimiter'?: Space;
  /** 声明之间 `;` 之后的空白; `"\n"` 让每条声明独占一行. 对 .sass 无效. */
  'space-between-declarations'?: Space;
  /** 去掉行尾空白与文件末尾多余的空行. */
  'strip-spaces'?: true;
  /** 把 tab 替换为该数量的空格. */
  'tab-size'?: number;
  /** 去掉零值的单位: `0px` → `0`. */
  'unitless-zero'?: true;
  /** 对齐带厂商前缀的属性与值. */
  'vendor-prefix-align'?: true;
}

// 供配置文件获得类型提示: `export default defineConfig({...})`.
export function defineConfig(config: Config): Config {
  return config;
}

// 同一目录下按此顺序取第一个存在的文件.
export const CONFIG_FILES = [
  '.csscomb.json',
  '.csscomb.js',
  '.csscomb.cjs',
  '.csscomb.mjs',
  '.csscomb.ts',
  '.csscomb.cts',
  '.csscomb.mts',
  'csscomb.config.json',
  'csscomb.config.js',
  'csscomb.config.cjs',
  'csscomb.config.mjs',
  'csscomb.config.ts',
  'csscomb.config.cts',
  'csscomb.config.mts'
];

/**
 * 加载配置文件; `.ts` / `.cts` / `.mts` 依赖 Node 22.18+ 的原生类型剥离.
 */
export async function loadConfigFile(file: string): Promise<Config> {
  const fullPath = path.resolve(file);
  if (fullPath.endsWith('.json'))
    return JSON.parse(readFileSync(fullPath, 'utf8'));

  // import() 下 CommonJS 的 module.exports 也落在 default 上.
  let exported;
  try {
    exported = await import(pathToFileURL(fullPath).href);
  } catch (error) {
    throw explainConfigLoadError(file, error);
  }
  let config = exported.default;
  // 由 TS/Babel 转译出的 CommonJS 配置把对象放在 exports.default 上.
  if (config && config.__esModule && 'default' in config) config = config.default;
  if (!config || typeof config !== 'object')
    throw new Error(`Config file ${file} must export an object.`);
  return config;
}

// 原生类型剥离不可用或不支持时 import() 抛出的错误码.
const TYPE_STRIPPING_ERRORS = new Set([
  'ERR_UNKNOWN_FILE_EXTENSION',
  'ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX',
  'ERR_INVALID_TYPESCRIPT_SYNTAX',
  'ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING',
  'ERR_NO_TYPESCRIPT'
]);

/**
 * TS 配置加载失败时补上原因与替代格式, 原错误放在 cause 上; 其他错误原样返回.
 * CommonJS 项目里的 `.ts` 按 CommonJS 加载, 写 `export` 会报不带错误码的 SyntaxError.
 */
export function explainConfigLoadError(file: string, error: unknown): unknown {
  if (!/\.[cm]?ts$/.test(file) || !(error instanceof Error)) return error;
  const code = (error as Error & {code?: unknown}).code;
  if (!(typeof code === 'string' && TYPE_STRIPPING_ERRORS.has(code)) && !(error instanceof SyntaxError))
    return error;
  return new Error([
    `Cannot load TypeScript config ${file}: ${error.message}`,
    `TypeScript config files are loaded with the native type stripping of Node.js 22.18+ ` +
        `(erasable syntax only; running ${process.version}).`,
    'In a CommonJS project a .ts file is loaded as CommonJS, so ESM syntax needs .mts. ' +
        'Otherwise use a .mjs or .json config file.'
  ].join('\n'), {cause: error});
}

/**
 * 从 `start` 所在目录向上查找配置文件, 到用户目录或根目录为止.
 * `start` 本身是已存在的文件时直接返回它.
 */
export function findConfigFile(start: string = process.cwd()): string | null {
  // 用 os.homedir() 而不是环境变量: Windows 的 HOMEPATH 不带盘符, 永远不等于带盘符的目录.
  const home = os.homedir();

  let dir = path.resolve(start);
  if (existsSync(dir) && !statSync(dir).isDirectory()) return realpathSync(dir);
  if (!existsSync(dir)) dir = path.dirname(dir);

  while (true) {
    for (const name of CONFIG_FILES) {
      const candidate = path.join(dir, name);
      if (existsSync(candidate)) return realpathSync(candidate);
    }

    const parent = path.dirname(dir);
    if (dir === home || dir === parent) return null;
    dir = parent;
  }
}
