# Resume a failed install

**English** · [简体中文](../zh/docs/resume.md)

Rerun the same command and easy-np finishes a failed or interrupted install without starting over; this works for both entry points, for every workspace and for `np -g` with several packages.

## Continue after a failure

1. Read the summary at the end of the failed run. You should see: `✖ Install finished with <n> failed package(s)`, the list of failed packages, and exit code 1.
2. Fix the cause, for example the network or a missing build tool.
3. Run the same command again, for example `np`. You should see: the install continuing from where it stopped; you do not need to delete `node_modules`.

## What happens on a failure

- One failed package (download, sub-dependency or script) does not stop the install: the other packages are installed, and the end of the run lists every failed package.
- When any dependency failed, the root package's own lifecycle scripts are skipped and run after the next successful install.
- The next run does not download or extract again, and scripts that already succeeded do not run again.
- A failed optional dependency, or a failure in its sub-dependencies, only skips that optional dependency, as in npm (when a script of one of its sub-dependencies fails, the already linked optional dependency is removed again); the end of the run lists them with the `np-x rebuild <pkg>` command to rerun their scripts.
- The progress of each package is recorded in `node_modules/.np/.np-state.json` through the stages `deps`, `preinstall`, `install`, `postinstall` and `finish`; it is cleared when a run has no failure.
- easy-np does not change the `package.json` of installed packages.
- After you switch Node.js versions, run `np-x rebuild` to recompile native modules; an ordinary failure or interruption does not need a rebuild.
