# Resume a failed install

**English** · [简体中文](../zh/docs/resume.md)

A failed or interrupted install does not need a clean `node_modules`: run `npd` again and it continues. This applies to every install command, including `npd -g` with several packages.

## Continue where the install stopped

1. Run `npd`. Expected: when packages fail (download, sub-dependency or script), the others still install, and npd ends with `<n> package(s) failed, run npd again to continue from where they stopped:` lists the failed packages and exits with code 1.
2. Fix the cause shown for each package, for example the network or a missing build tool.
3. Run `npd` again. Expected: each package continues from the stage it stopped at; nothing is extracted again and scripts that succeeded do not run again. The continued packages are summarized in one line, `[npd:resume] continued <n> package(s) left unfinished by the previous run`; add `--detail` to list each of them.

- When a dependency failed, the root package's own lifecycle scripts are skipped and run after the next successful install.
- When an optional dependency or one of its sub-dependencies fails, npd skips it as npm does and does not count it as a failure (when a script of one of its sub-dependencies fails, the already linked optional dependency is removed again); npd lists them with an `npd-x rebuild <pkg>` command to rerun their scripts.
- Ctrl-C (SIGINT) or SIGTERM stops running git processes (SIGTERM, then a forced kill after 1 second) and exits with 130 / 143; the next run continues the same way.

## Know how progress is recorded

Each package's stage is stored in `node_modules/.npd/.npd-state.json`; the packages' own `package.json` files are not modified.

- The stages are `deps`, `preinstall`, `install`, `postinstall` and `finish`.
- Dependency scripts, preinstall included, run only after the whole dependency tree is linked.
- The stages of packages installed in this run are cleared only after every script has succeeded.
- A package is marked unfinished before it is extracted or copied again, so a half-extracted folder is never taken as installed.
- A `node_modules` installed by npminstall counts as unfinished; delete it before the first npd install, see [Migrate from npminstall](migrate-from-npminstall.md).
- After switching Node.js versions, run `npd-x rebuild` to recompile native modules; ordinary failures do not need it.
