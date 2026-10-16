# Choose option values

**English** · [简体中文](../zh/docs/options.md)

This page explains how option values work, so you can set any option without trial and error; it assumes you have a [config file](configuration.md).
Every option, its accepted values and its effect are documented in the doc comments of the [`Config`](../src/config.ts) type; those comments are written in Chinese. With [`defineConfig`](configuration.md#write-a-typed-config), your editor completes option names and flags invalid values.

## See every option at once

```bash
csscomb -d your.css
```

This prints each option easy-comb detects in `your.css` with its value; see [Generate a config from a stylesheet](detect-config.md).
The built-in config in [src/config/default.ts](../src/config/default.ts) sets every option and is a working example of each value.

## How option values work

- **Every option is off unless you configure it.** An option you leave out changes nothing.
- Options that only accept `true` (for example `strip-spaces` or `unitless-zero`) are turned off by leaving them out; writing `false` or any other value triggers a warning and the option is ignored.
- An invalid value or an unknown option name triggers a `console.warn` warning and is ignored; the other options still apply.
- Whitespace options (the `space-*` options and `block-indent`) take a number, meaning that many spaces, or a string of spaces, tabs and newlines; after a newline, the indentation comes from `block-indent`.
- Options that only deal with braces or semicolons have no effect in indented `.sass` files; the `Config` documentation marks each of them.
- `sort-order` and `sort-order-fallback` are explained in [Sort properties](sort-order.md).
