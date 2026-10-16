// 全部内置选项; 顺序即插件注册顺序, 影响没有 runBefore 约束的选项的执行先后.
import alwaysSemicolon from './always-semicolon.ts';
import blockIndent from './block-indent.ts';
import colorCase from './color-case.ts';
import colorShorthand from './color-shorthand.ts';
import elementCase from './element-case.ts';
import eofNewline from './eof-newline.ts';
import leadingZero from './leading-zero.ts';
import linesBetweenRulesets from './lines-between-rulesets.ts';
import quotes from './quotes.ts';
import removeEmptyRulesets from './remove-empty-rulesets.ts';
import sortOrderFallback from './sort-order-fallback.ts';
import sortOrder from './sort-order.ts';
import spaceAfterColon from './space-after-colon.ts';
import spaceAfterCombinator from './space-after-combinator.ts';
import spaceAfterOpeningBrace from './space-after-opening-brace.ts';
import spaceAfterSelectorDelimiter from './space-after-selector-delimiter.ts';
import spaceBeforeClosingBrace from './space-before-closing-brace.ts';
import spaceBeforeColon from './space-before-colon.ts';
import spaceBeforeCombinator from './space-before-combinator.ts';
import spaceBeforeOpeningBrace from './space-before-opening-brace.ts';
import spaceBeforeSelectorDelimiter from './space-before-selector-delimiter.ts';
import spaceBetweenDeclarations from './space-between-declarations.ts';
import stripSpaces from './strip-spaces.ts';
import tabSize from './tab-size.ts';
import unitlessZero from './unitless-zero.ts';
import vendorPrefixAlign from './vendor-prefix-align.ts';
import type { OptionDefinition } from '../option.ts';

const options: OptionDefinition[] = [
  alwaysSemicolon,
  blockIndent,
  colorCase,
  colorShorthand,
  elementCase,
  eofNewline,
  leadingZero,
  linesBetweenRulesets,
  quotes,
  removeEmptyRulesets,
  sortOrderFallback,
  sortOrder,
  spaceAfterColon,
  spaceAfterCombinator,
  spaceAfterOpeningBrace,
  spaceAfterSelectorDelimiter,
  spaceBeforeClosingBrace,
  spaceBeforeColon,
  spaceBeforeCombinator,
  spaceBeforeOpeningBrace,
  spaceBeforeSelectorDelimiter,
  spaceBetweenDeclarations,
  stripSpaces,
  tabSize,
  unitlessZero,
  vendorPrefixAlign
];

export default options;
