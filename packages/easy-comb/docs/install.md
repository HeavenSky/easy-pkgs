# Install easy-comb

**English** · [简体中文](../zh/docs/install.md)

This page gets the `csscomb` command and the `easy-comb` package working in a project or globally; you need npm and Node.js `^16.17.0 || >=18.3.0`.
The shortest path is the README's [quick start](../README.md#format-your-first-stylesheets).

## Install in a project

```bash
npm install easy-comb --save-dev
npx csscomb --help
```

The second command prints the help, which confirms that the `csscomb` command resolves to easy-comb.

## Install globally

```bash
npm install easy-comb -g
```

The command keeps the name `csscomb`, so it collides with a global install of the original `csscomb` package.

- Symptom: `npm install easy-comb -g` fails with `EEXIST`.
- Cause: the original `csscomb` package already owns the global `csscomb` command.
- Fix: run `npm uninstall csscomb -g` first, or add `--force` to overwrite the command.

## Check your Node.js version

- easy-comb runs on Node.js 16.17 or newer; Node.js 18.0 to 18.2 are not supported.
- TypeScript config files (`.ts`, `.cts`, `.mts`) need Node.js 22.18 or newer, because they are loaded with Node's built-in type stripping.
- `require('easy-comb')` from CommonJS needs Node.js 20.19+ or 22.12+; on older versions use `import()`, see [Import the package](node-api.md#import-the-package).
