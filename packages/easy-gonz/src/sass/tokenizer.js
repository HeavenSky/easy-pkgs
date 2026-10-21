'use strict';

module.exports = function(css, tabSize) {
  var TokenType = require('../token-types');

  let tokens = [];
  let urlMode = false;
  let c; // Current character
  let cn; // Next character
  let pos = 0;
  let tn = 0;
  let ln = 1;
  let col = 1;

  var Punctuation = {
    ' ': TokenType.Space,
    '\n': TokenType.Newline,
    '\r': TokenType.Newline,
    '\f': TokenType.Newline,
    '\t': TokenType.Tab,
    '!': TokenType.ExclamationMark,
    '"': TokenType.QuotationMark,
    '#': TokenType.NumberSign,
    '$': TokenType.DollarSign,
    '%': TokenType.PercentSign,
    '&': TokenType.Ampersand,
    '\'': TokenType.Apostrophe,
    '(': TokenType.LeftParenthesis,
    ')': TokenType.RightParenthesis,
    '*': TokenType.Asterisk,
    '+': TokenType.PlusSign,
    ',': TokenType.Comma,
    '-': TokenType.HyphenMinus,
    '.': TokenType.FullStop,
    '/': TokenType.Solidus,
    ':': TokenType.Colon,
    ';': TokenType.Semicolon,
    '<': TokenType.LessThanSign,
    '=': TokenType.EqualsSign,
    '==': TokenType.EqualitySign,
    '!=': TokenType.InequalitySign,
    '>': TokenType.GreaterThanSign,
    '?': TokenType.QuestionMark,
    '@': TokenType.CommercialAt,
    '[': TokenType.LeftSquareBracket,
    ']': TokenType.RightSquareBracket,
    '^': TokenType.CircumflexAccent,
    '_': TokenType.LowLine,
    '{': TokenType.LeftCurlyBracket,
    '|': TokenType.VerticalLine,
    '}': TokenType.RightCurlyBracket,
    '~': TokenType.Tilde,
    '`': TokenType.Backtick
  };

  /**
   * Add a token to the token list
   * @param {string} type
   * @param {string} value
   */
  function pushToken(type, value, column) {
    tokens.push({
      tn: tn++,
      ln: ln,
      col: column,
      type: type,
      value: value
    });
  }

  /**
   * Check if a character is a decimal digit
   * @param {string} c Character
   * @returns {boolean}
   */
  function isDecimalDigit(c) {
    return '0123456789'.indexOf(c) >= 0;
  }

  /**
   * Parse spaces
   * @param {string} css Unparsed part of CSS string
   */
  function parseSpaces(css) {
    var start = pos;

    // Read the string until we meet a non-space character:
    for (; pos < css.length; pos++) {
      if (css.charAt(pos) !== ' ') break;
    }

    // Add a substring containing only spaces to tokens:
    pushToken(TokenType.Space, css.substring(start, pos--), col);
    col += pos - start;
  }

  /**
   * Parse a string within quotes
   * @param {string} css Unparsed part of CSS string
   * @param {string} q Quote (either `'` or `"`)
   */
  function parseString(css, q) {
    var start = pos;

    // Read the string until we meet a matching quote:
    for (pos++; pos < css.length; pos++) {
      // Skip escaped quotes:
      if (css.charAt(pos) === '\\') pos++;
      else if (css.charAt(pos) === q) break;
      // Skip interpolation, it may contain quotes: `"a #{"b"}"`.
      else if (css.charAt(pos) === '#' && css.charAt(pos + 1) === '{') {
        const end = findInterpolationEnd(css, pos + 2);
        if (end !== -1) pos = end;
      }
    }

    // Add the string (including quotes) to tokens:
    let type = q === '"' ? TokenType.StringDQ : TokenType.StringSQ;
    pushToken(type, css.substring(start, pos + 1), col);
    col += pos - start;
  }

  /**
   * Find closing `}` of an interpolation, skipping nested strings, braces
   * and comments that may contain `}`
   * @param {string} css Unparsed part of CSS string
   * @param {number} i Index right after `#{`
   * @returns {number} Index of closing `}` or -1
   */
  function findInterpolationEnd(css, i) {
    let depth = 1;
    let quote = null;

    for (; i < css.length; i++) {
      const c = css.charAt(i);
      if (c === '\\') i++;
      else if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === '\'') quote = c;
      else if (c === '/' && css.charAt(i + 1) === '*') {
        const close = css.indexOf('*/', i + 2);
        if (close === -1) return -1;
        i = close + 1;
      } else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) return i;
    }

    return -1;
  }

  /**
   * Parse numbers
   * @param {string} css Unparsed part of CSS string
   */
  function parseDecimalNumber(css) {
    var start = pos;

    // Read the string until we meet a character that's not a digit:
    for (; pos < css.length; pos++) {
      if (!isDecimalDigit(css.charAt(pos))) break;
    }

    // Add the number to tokens:
    pushToken(TokenType.DecimalNumber, css.substring(start, pos--), col);
    col += pos - start;
  }

  /**
   * Parse identifier
   * @param {string} css Unparsed part of CSS string
   */
  function parseIdentifier(css) {
    var start = pos;

    // Skip all opening slashes:
    while (css.charAt(pos) === '/') pos++;

    // Read the string until we meet a punctuation mark:
    for (; pos < css.length; pos++) {
      // Skip all '\':
      if (css.charAt(pos) === '\\') pos++;
      else if (css.charAt(pos) in Punctuation) break;
    }

    var ident = css.substring(start, pos--);

    // Enter url mode if parsed substring is `url`:
    if (!urlMode && ident === 'url' && css.charAt(pos + 1) === '(') {
      urlMode = true;
    }

    // Add identifier to tokens:
    pushToken(TokenType.Identifier, ident, col);
    col += pos - start;
  }

  /**
   * Parse equality sign
   */
  function parseEquality() {
    pushToken(TokenType.EqualitySign, '==', col);
    pos++;
    col++;
  }

  /**
   * Parse inequality sign
   */
  function parseInequality() {
    pushToken(TokenType.InequalitySign, '!=', col);
    pos++;
    col++;
  }

  function isIndent(ch) {
    return ch === ' ' || ch === '\t';
  }

  /**
  * Parse a multiline comment
  * @param {string} css Unparsed part of CSS string
  */
  function parseMLComment(css) {
    var start = pos;
    var col_ = col;

    // Get current indent level:
    var il = 0;
    var _pos = pos - 1;
    // Sass 允许用空格或 tab 缩进(同一文件内不能混用), 两者都按一个字符计
    for (; _pos > -1; _pos--) {
      if (isIndent(css.charAt(_pos))) il++;
      else break;
    }

    // A comment after other content on its line is closed by `*/` only,
    // like in CSS. A comment starting a line also ends where the
    // indentation drops.
    var inline = _pos > -1 && css.charAt(_pos) !== '\n' &&
        css.charAt(_pos) !== '\r';
    var close = inline ? css.indexOf('*/', pos + 2) : -1;

    if (close !== -1) {
      pos = close + 1;
    } else {
      for (pos += 2; pos < css.length; pos++) {
        let ch = css.charAt(pos);
        if (ch === '\n') {
          let _pos;
          // Get next non-blank line's indent level:
          var _il = 0;
          for (_pos = pos + 1; _pos < css.length; _pos++) {
            if (isIndent(css.charAt(_pos))) _il++;
            else if (css.charAt(_pos) === '\n') _il = 0;
            else if (css.charAt(_pos) !== '\r') break;
          }

          if (_il > il) {
            col = 0;
            pos += _pos - pos;
          } else if (css.charAt(_pos) === '*' && css.charAt(_pos + 1) === '/') {
            // Closing `*/` on its own line at the comment's indent level.
            pos = _pos + 1;
            break;
          } else {
            pos--;
            break;
          }
        } else if (ch === '*' && css.charAt(pos + 1) === '/') {
          pos++;
          break;
        }
      }
    }

    // If CRLF is used, we need to adjust pos
    if (css.charAt(pos) === '\r') pos--;

    // Add full comment (including `/*`) to the list of tokens:
    var comment = css.substring(start, pos + 1);
    pushToken(TokenType.CommentML, comment, col_);

    var newlines = comment.split('\n');
    if (newlines.length > 1) {
      ln += newlines.length - 1;
      col = newlines[newlines.length - 1].length;
    } else {
      col += (pos - start);
    }
  }

  /**
  * Parse a single line comment
  * @param {string} css Unparsed part of CSS string
  */
  function parseSLComment(css) {
    var start = pos;
    var col_ = col;
    var _pos;

    // Check if comment is the only token on the line, and if so,
    // get current indent level:
    var il = 0;
    var onlyToken = false;
    for (_pos = pos - 1; _pos > -1; _pos--) {
      if (isIndent(css.charAt(_pos))) il++;
      else if (css.charAt(_pos) === '\n') {
        onlyToken = true;
        break;
      } else break;
    }
    if (_pos === -1) onlyToken = true;

    // Read the string until we meet comment end.
    // Since we already know first 2 characters (`//`), start reading
    // from `pos + 2`:
    if (!onlyToken) {
      for (pos += 2; pos < css.length; pos++) {
        if (css.charAt(pos) === '\n' || css.charAt(pos) === '\r') {
          break;
        }
      }
    } else {
      for (pos += 2; pos < css.length; pos++) {
        var ch = css.charAt(pos);
        if (ch === '\n') {
          // Get new line's indent level:
          var _il = 0;
          for (_pos = pos + 1; _pos < css.length; _pos++) {
            if (isIndent(css.charAt(_pos))) _il++;
            else break;
          }

          if (_il > il) {
            col = 0;
            pos += _pos - pos;
          } else {
            break;
          }
        }
      }
    }

    // If CRLF is used, we need to adjust pos
    if (css.charAt(pos - 1) === '\r') pos--;

    // Add comment (including `//` and line break) to the list of tokens:
    var comment = css.substring(start, pos--);
    pushToken(TokenType.CommentSL, comment, col_);

    var newlines = comment.split('\n');
    if (newlines.length > 1) {
      ln += newlines.length - 1;
      col = newlines[newlines.length - 1].length;
    } else {
      col += (pos - start);
    }
  }

  /**
   * Convert a CSS string to a list of tokens
   * @param {string} css CSS string
   * @returns {Array} List of tokens
   * @private
   */
  function getTokens(css) {
    // Parse string, character by character:
    for (pos = 0; pos < css.length; col++, pos++) {
      c = css.charAt(pos);
      cn = css.charAt(pos + 1);

      // If we meet `/*`, it's a start of a multiline comment.
      // Parse following characters as a multiline comment:
      if (c === '/' && cn === '*') {
        parseMLComment(css);
      }

      // If we meet `//` and it is not a part of url:
      else if (!urlMode && c === '/' && cn === '/') {
        // If we're currently inside a block, treat `//` as a start
        // of identifier. Else treat `//` as a start of a single-line
        // comment:
        parseSLComment(css);
      }

      // If current character is a double or single quote, it's a start
      // of a string:
      else if (c === '"' || c === "'") {
        parseString(css, c);
      }

      // If current character is a space:
      else if (c === ' ') {
        parseSpaces(css);
      }

      // If current character is `=`, it must be combined with next `=`
      else if (c === '=' && cn === '=') {
        parseEquality(css);
      }

      // If we meet `!=`, this must be inequality
      else if (c === '!' && cn === '=') {
        parseInequality(css);
      }

      // If current character is a punctuation mark:
      else if (c in Punctuation) {
        // CRLF, LF, a lone CR and FF are all line breaks
        if (Punctuation[c] === TokenType.Newline) {
          if (c === '\r' && cn === '\n') {
            // Push CRLF as one token and skip `\n` so as not to double
            // count newlines or columns
            pushToken(TokenType.Newline, '\r\n', col);
            pos++;
          } else {
            pushToken(TokenType.Newline, c, col);
          }

          ln++; // Go to next line
          col = 0; // Reset the column count
        } else {
          // Handle all other punctuation and add to list of tokens
          pushToken(Punctuation[c], c, col);
        }
        if (c === ')') urlMode = false; // Exit url mode
        else if (c === '\t' && tabSize > 1) col += (tabSize - 1);
      }

      // If current character is a decimal digit:
      else if (isDecimalDigit(c)) {
        parseDecimalNumber(css);
      }

      // If current character is anything else:
      else {
        parseIdentifier(css);
      }
    }

    return tokens;
  }

  return getTokens(css);
};
