# Run easy-comb in CI, on commit and in editors

**English** · [简体中文](../zh/docs/integrations.md)

This page wires easy-comb into a CI job, a pre-commit hook and an editor, so unformatted stylesheets never reach your main branch; it assumes easy-comb is [installed](install.md) in the project.

## Fail CI on unformatted files

```bash
npx csscomb --lint --verbose src/styles
```

The command exits with `1` when any file would change, which fails the CI step, and the `!` lines name the files to fix; see [Check files without changing them](command-line.md#check-files-without-changing-them).

## Fix staged files with lint-staged

Add this to `package.json` to format staged stylesheets with [lint-staged](https://github.com/lint-staged/lint-staged) before each commit:

```json
{ "lint-staged": { "*.{css,scss,less,sass}": "csscomb" } }
```

lint-staged passes the staged file paths to `csscomb`, which fixes them in place.

## Format on save from an editor

```bash
npx csscomb -t path/to/file.scss
```

In any editor or tool that can run a command when a file is saved, run this command with the saved file's path.
Tools usually start `csscomb` with a pipe attached, so pass `-t` (`--tty-mode`): easy-comb then processes the given path and never waits for standard input.
To format unsaved CSS from the editor instead, send it on standard input and pass `-`; standard input is always parsed as CSS, see [Format standard input](command-line.md#format-standard-input).
To format from your own JavaScript, use the [Node.js API](node-api.md).
