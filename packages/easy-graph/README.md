# Easy Graph

**English** · [简体中文](./zh/README.md)

See every branch of your repository as one commit graph in VS Code, and rebase, merge, cherry-pick or reset right from it.

Easy Graph is for developers who do their Git work in the graph rather than in a terminal. It continues Git Graph, which hasn't had a release since 1.30.0 (April 2021), building on version 1.31.8 of Git Graph 2. Unlike VS Code's built-in Source Control Graph, it shows all branches, tags, stashes and uncommitted changes in one table, and runs Git actions from their context menus. It sends no usage events, and you can install it next to Git Graph and Git Graph 2.

[![VS Marketplace](https://vsmarketplacebadges.dev/version-short/heavensky.easy-graph.svg?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=heavensky.easy-graph)
[![Installs](https://vsmarketplacebadges.dev/installs-short/heavensky.easy-graph.svg)](https://marketplace.visualstudio.com/items?itemName=heavensky.easy-graph)

![The commit graph with colored branch lanes, and the Commit Details View of the selected commit listing its changed files](media/screenshots/graph.png)

## Get started

1. Install Easy Graph from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=heavensky.easy-graph).
2. Click **View Easy Graph** in the Source Control view, or run `Easy Graph: View Easy Graph (git log)` from the Command Palette (`Ctrl+Shift+P`, `Cmd+Shift+P` on macOS).
3. Click a commit to see its changed files. Right-click a commit, branch or tag for Git actions.

Settings use the `easy-graph.` prefix, so your Git Graph settings don't carry over. To keep them, duplicate them in `settings.json` and change the prefix of the copies from `git-graph.` to `easy-graph.`. Git behavior such as signing commits, fetch pruning or fast-forwarding follows your repository's Git config (`git config`); to change it for Easy Graph only, set the key with its Git name in `easy-graph.builtin`, e.g. `{ "commit.gpgSign": true }`.

## Get out of a stopped rebase without a terminal

When a rebase, merge, cherry-pick or revert stops, a banner above the graph offers **Continue**, **Skip Commit** and **Abort**. **Rebase...** > **Interactive Rebase (Todo Editor)** lets you reorder commits by dragging them and choose pick, reword, edit, squash, fixup or drop for each one. See [Finish rebases and merges](CHANGELOG.md#finish-rebases-and-merges).

## Rewrite several commits in one step

Ctrl/Cmd+click or Shift+click selects several commits. **Squash**, **Drop**, **Cherry Pick** and **Revert** then act on the whole selection. **Create Fixup Commit** turns your staged changes into a `fixup!` commit, and **Autosquash** in the Rebase dialog folds it into its target. See [Act on several commits](CHANGELOG.md#act-on-several-commits).

## Narrow the graph to the commits you need

**Filter Messages** searches commit messages across the whole history, not only the commits loaded so far. The **Authors** and **Paths** dropdowns narrow the graph further, and **Filter in Easy Graph** in the Explorer context menu opens the graph with only the commits that changed a file or folder. `easy-graph.excludeBranchGlobPatterns` keeps branches such as `gh-pages` or `wip/*` out of the way. See [Filter and find commits](CHANGELOG.md#filter-and-find-commits).

## Keep the graph beside your code

**View Easy Graph in Panel** opens the graph in the panel, so it stays visible while you edit. Set `easy-graph.viewLocation` to `panel` to open it there every time. See [Arrange the view](CHANGELOG.md#arrange-the-view).

## When to use something else

To get the extension from its original maintainer, use [Git Graph 2](https://marketplace.visualstudio.com/items?itemName=hansu.git-graph-2). If you only need to browse history, VS Code's built-in Source Control Graph needs no extension. Easy Graph needs VS Code 1.101 or later.

## Learn more

- The [changelog](./CHANGELOG.md) lists what changed in each release; its 0.0.1 entry lists every difference from Git Graph 1.30.0, including the bugs fixed.
- The **Feature Contributions** tab of the extension's page in the Extensions view lists every command and setting.

To try a change that isn't released yet, build the package in `packages/easy-graph`, then install `artifacts/easy-graph-0.0.1.vsix` with **Install from VSIX...** from the **...** menu of the Extensions view:

```sh
npm ci && npm run package
```

## License

[MIT](./LICENSE.txt)
