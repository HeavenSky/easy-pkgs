# Change Log

**English** · [简体中文](./zh/CHANGELOG.md)

Each release lists the changes you notice when you upgrade.

## v0.0.1 2026-10-29

The first release of Easy Graph, building on version 1.31.8 of Git Graph 2. It lists every difference you notice compared with Git Graph 1.30.0, the [last release](https://github.com/mhutchie/vscode-git-graph/releases/tag/v1.30.0) of Git Graph (April 2021).

### Before you switch

- **Easy Graph needs VS Code 1.101 or later** (Git Graph 1.30.0 supports 1.38). Update VS Code before installing.
- Easy Graph is its own extension (`heavensky.easy-graph`) with its own `easy-graph.*` commands, views and settings, so it can be installed next to Git Graph and Git Graph 2. To keep your Git Graph settings, duplicate them in `settings.json` and change the prefix of the copies from `git-graph.` to `easy-graph.`.
- **Git behavior follows your Git config.** Signing, fetch pruning and tags, mailmap, the length of abbreviated hashes, untracked files, fast-forwarding and setting the upstream when pushing use the Git config of the repository (local, global or system, as set with `git config`), which also sets the defaults of the Fetch, Merge, Pull and Push dialogs. `easy-graph.builtin` overrides single keys for Easy Graph only, with their Git names: `commit.gpgSign`, `tag.gpgSign`, `fetch.prune`, `fetch.pruneTags`, `fetch.tags`, `log.mailmap`, `core.abbrev`, `status.showUntrackedFiles`, `merge.ff`, `pull.ff` and `push.autoSetupRemote`; a key set to `null` or removed follows the Git config. By default it sets `core.abbrev` to 7, `log.mailmap` to `false`, `merge.ff` to `false`, `push.autoSetupRemote` to `true` and `status.showUntrackedFiles` to `all`, which keeps Git Graph's behavior; setting `easy-graph.builtin` replaces this default, so copy the keys you want to keep.
- These Git Graph settings are replaced by `easy-graph.builtin` or your Git config: `repository.sign.commits` (`commit.gpgSign`), `repository.sign.tags` (`tag.gpgSign`), `repository.fetchAndPrune` and `dialog.fetchRemote.prune` (`fetch.prune`), `repository.fetchAndPruneTags` and `dialog.fetchRemote.pruneTags` (`fetch.pruneTags`), `repository.useMailmap` (`log.mailmap`), `repository.showUntrackedFiles` (`status.showUntrackedFiles`), `dialog.merge.noFastForward` (`merge.ff`), `dialog.pullBranch.noFastForward` (`pull.ff`) and `dialog.pushBranch.skipSetUpstream` (`push.autoSetupRemote`).
- Easy Graph sends no install, update or uninstall events; Git Graph sent them to `api.mhutchie.com`.
- A new icon tells Easy Graph apart from Git Graph. The **View Easy Graph** button and the editor tab use VS Code's built-in branch icon, which follows your color theme, so the setting `easy-graph.tabIconColourTheme` is gone.

### Added

#### Finish rebases and merges

- While a rebase, merge, cherry-pick or revert is in progress, a banner above the graph offers **Continue**, **Skip Commit** and **Abort**.
- **Rebase...** > **Interactive Rebase (Todo Editor)** lets you reorder commits by dragging them and choose pick, reword, edit, squash, fixup or drop for each one.
- **Create Fixup Commit** on a commit commits your staged changes as a `fixup!` or `squash!` commit, and **Autosquash** in the Rebase dialog folds it into its target.
- **Update Refs** in the Rebase dialog also updates stacked branches; with the Todo Editor this needs `awk`. **Ignore Whitespace** ignores whitespace changes.

#### Act on several commits

- Ctrl/Cmd+click and Shift+click select several commits. **Squash Selected Commits**, **Drop Selected Commits**, **Cherry Pick Selected Commits** (with **Allow Empty**) and **Revert Selected Commits** act on the whole selection.
- **Reset Last Commit...** on HEAD undoes the last commit and keeps its changes as uncommitted changes.
- **Edit Message** on a commit rewrites its message.
- With two commits selected, **Select Merge Base** selects their merge base, and **Copy Commit Subjects Between to Clipboard** copies the subjects of the commits between them.

#### Filter and find commits

- **Filter Messages** in the control bar shows only the commits whose message contains the text, searching the entire history rather than the loaded commits.
- The **Authors** dropdown shows only the commits of the chosen authors, and the selection is remembered per repository.
- The **Paths** dropdown, or **Filter in Easy Graph** in the Explorer context menu, shows only the commits that touch the chosen files or folders. Hide the dropdown with `"easy-graph.toolbarButtonVisibility": { "Paths": false }`.
- Clicking a branch or author selects only that one, and Ctrl/Cmd+click adds more, when `easy-graph.repository.singleBranchSelect` or `easy-graph.repository.singleAuthorSelect` is on. In this mode, Ctrl/Cmd+Enter adds the highlighted option.
- The **Branches** and **Authors** dropdowns accept `*` wildcards, Enter selects every matching option, and the arrow keys move through the options.
- The **Branches** dropdown offers **HEAD**, **HEAD + upstream** and tags. Right-clicking a branch in it offers **Checkout Branch**, and **Select in Branches Dropdown** in the context menu of a branch label is also offered while all branches are shown.
- The **Display** dropdown shows the full history (**All**), only the commits that branches or tags point to (**Simplify**, default set by `easy-graph.repository.simplifyByDecoration`), only first parents (**First Parent**), or both. **Simplify** is unavailable while a **Paths** filter is active.
- The **Scope** dropdown chooses what **Show All** loads: **Local** branches and tags, **Remote** branches, commits only in the **Reflog**, or any combination; HEAD is always included. With neither **Local** nor **Remote**, only the commits that no branch or tag reaches are shown. `easy-graph.repository.showRemoteBranches` and `easy-graph.repository.includeCommitsMentionedByReflogs` set the initial choice for new repositories.
- **Dangling** in the **Scope** dropdown also shows the commits that nothing references any more, such as those of deleted branches and dropped stashes. They are faded and drawn as hollow dashed nodes with a `dangling` label, and a dropped stash can be applied or turned into a branch from its context menu. Objects that `git gc` has already pruned can't be shown.
- `easy-graph.excludeBranchGlobPatterns` keeps branches such as `gh-pages` or `wip/*` hidden when showing all branches, and **Hide Branch** and **Hide Remote** in the context menus hide a single branch or remote. Show them again in Repository Settings.
- `easy-graph.repository.onlyShowRemoteBranchesWithLocalBranches` hides remote branches that have no local branch when showing all branches.
- **Custom Log Arguments** in Repository Settings passes extra arguments to `git log`, e.g. a commit range such as `v1..v2`; arguments that change the output, such as `--format` or `--graph`, are rejected.
- **Hide merge commits** in Repository Settings hides merge commits and keeps the graph connected.
- The Find Widget can match whole words and remembers that choice, selects the previous search text when reopened, and searches the columns set in `easy-graph.findWidget.searchColumns`.
- When the Find Widget finds nothing in the loaded commits, **Search all** filters by that text across the entire history, and typing a commit hash into it jumps to the commit even if it isn't loaded yet.

#### More Git actions

- More ways to copy and compare a commit: **Copy Short Commit Hash**, **Copy Commit Link** (GitHub, GitLab, Bitbucket and Azure DevOps style URLs), **Copy Commit Message** and **Compare with Working Tree**.
- Patches can be copied, saved and applied: **Copy Commit Patch to Clipboard**, **Save Patch As...**, **Save Selected Commits as Patch...** and **Apply Patch...**.
- **Push to This Commit...** pushes a branch up to a commit, **Rebase Commits After This onto...** moves commits onto another base, and **Delete Multiple Branches...** deletes several branches at once.
- The branch context menu offers **Create Branch**, **Pull Branch** (with **Force Update**) and **View Issue**, which opens the issue named in the branch name.
- **No Verify** skips Git hooks when pushing, merging, pulling, squashing and editing a message.
- **Allow unrelated histories** in the Merge dialog merges branches with unrelated histories; `easy-graph.dialog.merge.allowUnrelatedHistories` sets its default.
- Tags can be checked out and force-pushed, reverts can leave the changes uncommitted with **No Commit**, and cherry-picks accept **Allow Empty**.
- Pushing a tag warns first when its commit is on no known branch of the target remote.
- When a checkout fails because uncommitted changes would be overwritten, Easy Graph offers to stash them and check out again.
- `easy-graph.repository.backupBeforeDangerousActions` (off by default) saves the affected branch under `refs/easy-graph/backup/` before a reset, rebase, drop, squash, message edit, branch deletion or force push. Restore or delete the backups with **Easy Graph: Manage Backups...**.
- **Easy Graph: Show Reflog...** shows the commit chosen from the reflog in the graph.
- Fetching, pulling and pushing over SSH prompt for the passphrase of an encrypted key, and when authentication with an HTTPS remote fails, the error suggests configuring a Git credential helper.
- Tag messages and commit messages can span several lines, and Ctrl/Cmd+Enter submits the dialog.
- In the Add Tag dialog, the Name field suggests existing tags, and clicking its information icon fills in the most recent tag. The Create Branch dialog prefills `git.branchPrefix`.
- **Branch Name & Commit Subjects** in `easy-graph.dialog.merge.squashMessageFormat` and `easy-graph.dialog.pullBranch.squashMessageFormat` lists the subjects of all squashed commits.
- More dialog defaults: `easy-graph.dialog.pushBranch.mode` and `easy-graph.dialog.deleteBranch.deleteOnRemote`.
- **Easy Graph: Reset Remembered Dialog Choices** clears "Always Accept" for checking out commits and "Always Proceed" for pushing tags.
- `easy-graph.logGitCommandOutput` writes the output of Git commands, such as messages from Git hooks, to the Easy Graph Output Channel. The hash of a popped or dropped stash is logged there, so you can recover it.

#### Commit Details View

- The view lists every branch and tag of the commit, shows its `git notes`, and shows the previous name of renamed files.
- The commit summary can be collapsed, and the state is remembered per repository.
- Clicking the commit hash copies it, and Ctrl/Cmd+click opens the commit on the remote. **Show** next to **Contained in** lists the branches that contain the commit.
- Code blocks fenced with triple backticks in commit messages are shown as code.
- The file list filters as you type (`*` matches any characters, Esc clears the filter), and the summary shows the number of changed files and of added and deleted lines. `easy-graph.commitDetailsView.hiddenFields` hides summary fields.
- One button collapses or expands every folder of the file tree.
- Uncommitted changes can be shown as **All**, **Staged** or **Unstaged**.
- **View Patch** opens the full patch of the commit, **Browse Files at this Commit...** opens any file of the commit, and **Edit Notes...** adds, changes or removes its notes.
- The file context menu offers **Reset File to this Revision...**, **Copy All Relative File Paths to Clipboard** (following the file filter) and **Open in External Diff Tool**; `easy-graph.externalDiffToolArgs` passes extra arguments to `git difftool`. The `commitDetailsViewFile` key of `easy-graph.contextMenuActionsVisibility` hides these actions.
- **Swap** reverses a comparison of two commits, and a merge commit offers **View Changes from Parent N** for each parent.
- **View All Changes** opens every changed file of a commit, a comparison of two commits, a stash (including its untracked files) or the uncommitted changes (all, staged or unstaged) in VS Code's multi-file diff editor. It's in the context menus of commits, stashes, dropped stashes, the uncommitted changes and the Commit Details View's files, and next to **Swap** in a comparison.
- **View Details** on a signed tag shows its signature status.
- `easy-graph.commitDetailsView.autoScroll` set to `false` leaves the graph where it is when the view opens, instead of scrolling to the commit.

#### Read the graph

- Clicking a commit's node highlights the history of its line (the commit and its first-parent ancestors) and fades the rest; click again or press Esc to clear it.
- `easy-graph.graph.showBranchColourOnRows` (off by default) shows a strip in the branch's color at the left of each row.
- Branches checked out in another worktree show a folder icon, and the repository dropdown shows the parent folder of repositories with the same name.
- Hovering over a description shows the full subject and every branch and tag of the commit, and commits with a Code Review in progress show an icon.

#### Arrange the view

- Easy Graph opens in the panel as well as in an editor: **View Easy Graph in Panel**, **View Easy Graph in Editor**, and `easy-graph.viewLocation` for **View Easy Graph** and the other commands.
- The table header stays visible while you scroll (`easy-graph.stickyHeader`), and the **Current** button scrolls to HEAD, loading older commits when needed.
- `easy-graph.toolbarButtonVisibility` hides control bar items such as **Display**, **Scope** and **Paths**, and column widths can be adjusted while the table header is hidden.
- **Easy Graph: Go to Branch/Tag...** scrolls to a branch or tag, loading older commits when needed, and **Easy Graph: Switch Repository...** switches the repository shown.
- **Go to Commit in Easy Graph**, in the title bar or context menu of a diff editor, shows the commit of the file in the graph.
- **Easy Graph: Refresh** refreshes every open Easy Graph View.
- Easy Graph tabs in the editor are restored after VS Code restarts.
- `easy-graph.repository.fetchOnLoad` (off by default) fetches a repository when it's opened, at most once every 5 minutes per repository.
- `easy-graph.disableRefreshWhenShown` keeps the loaded graph when the view is shown again, and `easy-graph.toggleViewOnCommand` closes the Easy Graph View in the editor when **View Easy Graph** runs again.
- **Custom** in `easy-graph.date.format` formats dates with the tokens of `easy-graph.date.customFormat`, e.g. `YYYY-MM-DD HH:mm`.
- `easy-graph.fontFamily`, `easy-graph.findMatchHighlightColour` and `easy-graph.flashColour` set the font and colors of the view.
- Issue Linking accepts several rules.
- The Easy Graph icon is shown again next to each repository in the Source Control view.
- Command titles, setting descriptions and messages are shown in Chinese when the VS Code display language is Chinese; the Easy Graph View itself stays in English.

#### Manage repositories

- `easy-graph.repositories` lists repositories to always show, with `~`, `${workspaceFolder}` and relative paths.
- The repository search skips the folders matched by `easy-graph.repoSearchExclude` (default `**/node_modules`) and `files.exclude`, which helps in dev containers.
- **Remove Git Repository...** removes several repositories at once.
- Changes in submodules and worktrees refresh the graph, and new submodules are found automatically.

#### Keyboard and mouse

- `CTRL` or `CMD` in `easy-graph.keyboardShortcut.modifier` makes Ctrl/Cmd+F respond to only one of the keys, leaving the other to VS Code.
- The mouse back and forward buttons navigate VS Code's history while the Easy Graph View has focus.

### Changed

- **Pull Branch** on the checked-out branch only fast-forwards it, as on any other branch, instead of creating a merge commit or rebasing. It pulls the branch's upstream even when its name differs from the local branch. With **Force Update**, it resets the branch to the commit just fetched, and refuses when that would discard uncommitted changes.
- Right-clicking a commit outside the selection opens its context menu without changing the selection or closing the Commit Details View. Clicking the open commit again closes it and clears the selection.
- **The only keyboard shortcut of the Easy Graph View is Ctrl/Cmd+F**, which opens the Find Widget, so the view no longer takes over VS Code's and the system's shortcuts, such as Cmd+H on macOS. The shortcuts for refreshing (Ctrl/Cmd+R), scrolling to HEAD (Ctrl/Cmd+H) and scrolling to stashes (Ctrl/Cmd+S) are removed, together with their `easy-graph.keyboardShortcut.*` settings; use the **Refresh** and **Current** buttons instead.
- The **Show Remote Branches** checkbox is replaced by the **Scope** dropdown, and Repository Settings no longer have the **Include commits only mentioned by reflogs** and **Only follow the first parent of commits** checkboxes, which moved to the **Scope** and **Display** dropdowns. Your existing choices for each repository are kept.
- Abbreviated commit hashes have 7 characters, like Git's, instead of 8; `core.abbrev` in `easy-graph.builtin` sets another length (4 to 40), or follows the length Git computes for the repository when set to `null`.
- The extension activates after VS Code has started (`onStartupFinished`), so it no longer slows down opening a window.
- Easy Graph watches fewer files and refreshes at most once every 2 seconds, which lowers the CPU load in large repositories.
- The Diff View opens file versions through VS Code's Git extension (`git:` URIs) when it can, so blame and other Git features work in it.
- When `easy-graph.fileEncoding` isn't set, the Diff View uses the repository's `files.encoding`; language-specific `files.encoding` values aren't applied.
- The Git executable set in `git.path` is used even when Easy Graph found another one before.
- `easy-graph.repository.onLoad.scrollToHead` loads more commits until HEAD is shown.
- **Beside** in `easy-graph.openNewTabEditorGroup` opens new tabs beside the Easy Graph View when it's open in an editor, rather than beside the active editor group.
- The control bar wraps into rows when the view is narrow, groups its buttons at the end, and sizes its dropdowns to their content.
- Context menu items run when the mouse button is released.
- Force deleting a branch uses `git branch -D`, which also works with older Git versions.
- The Easy Graph output log shows empty arguments as `''` and logs the commands you run.
- The Issue Linking example in Repository Settings uses placeholders, so it can't be mistaken for a working URL.
- **Configure Initial Branches** in Repository Settings no longer offers HEAD under **Specific Branches**, as it wasn't kept; use **Checked Out Branch** instead.

### Fixed

#### Rebases and commit edits

- A branch name containing shell syntax can no longer run commands when an interactive rebase starts in a terminal.
- **Squash Selected Commits** only squashes the selected commits: they must be HEAD and its consecutive ancestors, and the squash is refused while changes are staged.
- **Drop Selected Commits** drops every selected commit in a single rebase, so a conflict can no longer leave only some of them dropped.
- **Edit Message** keeps the message body and works with quotes in the message. It finds the commit whatever abbreviation length Git uses, keeps merge commits when editing an older commit, and leaves staged changes out when editing HEAD. It's offered on HEAD even when HEAD is a merge or root commit or detached.
- **No Verify** also skips the hooks of the merge commit when merging or pulling, and of the rewritten commits when editing the message of an older commit.
- The Rebase Todo Editor checks for uncommitted changes first, opens a terminal when the todo list contains `reword` or `squash`, skips commits that are already upstream, and works in worktrees and submodules.
- **Reset Last Commit** is no longer offered on the root commit.

#### Branches, tags and remotes

- Pushing or deleting a tag that has the same name as a branch acts on the tag, not the branch.
- **Create Branch** in the branch context menus follows `easy-graph.dialog.createBranch.checkOut`.
- Easy Graph no longer replaces a `GIT_ASKPASS` that is already set, e.g. in remote development environments.
- Terminals opened by Easy Graph keep their `PATH` when Git is already on it, so tools such as the `code` CLI used by `core.editor` keep working, e.g. in dev containers. Commands are sent once the shell is ready.

#### Graph, selection and filters

- A commit message containing a lone carriage return no longer hides all older commits.
- The **Current** button loads more commits until HEAD is shown.
- A stash whose base commit isn't shown, e.g. after a rebase while only some branches are shown, is attached to its nearest shown ancestor instead of disappearing.
- With a **Paths** filter, matching commits on side branches are no longer grayed out.
- With a **Paths** filter, an annotated tag is no longer shown twice.
- With **Simplify**, commits referenced only by tags that aren't shown no longer appear as rows without references.
- Shift+click selects the range from the last commit you clicked, the context menu opens again after selected commits were rewritten or the repository was switched, and the Commit Details View follows the selection. The selection is kept when you switch to another tab and back.
- In the **Branches** and **Authors** dropdowns, clicking an option that is already selected selects only that option, Enter right after typing uses the text just typed, Esc closes every dropdown including **Paths**, and selecting all after **Show All** no longer selects HEAD and tags.
- Jumping to the same commit again flashes it again each time, and `easy-graph.flashColour` values such as `rgba(1,2,3)` work.

#### Commit Details View

- The view no longer loads forever when a changed folder is named after a built-in JavaScript object property such as `constructor`, or when a file is replaced by a folder of the same name; such a file can also be marked as reviewed separately from the folder.
- Files whose type changed, e.g. a file replaced by a symbolic link, are listed as modified.
- Switching between the file tree and the file list no longer adds bullets to the files, and the file list keeps its scroll position when you switch to another tab and back.
- **Copy All Relative File Paths to Clipboard** lists each path once, with `/` separators.

#### Views, menus and dialogs

- Opening Easy Graph from the Source Control view no longer fails with "Cannot read properties of null (reading 'rootUri')".
- The Easy Graph panel no longer refreshes several times per change after it has been hidden and shown again, follows `easy-graph.retainContextWhenHidden`, and **Easy Graph: Refresh** no longer fails while the panel has never been opened.
- **Fetch from Remote(s)** and **Resume a specific Code Review in Workspace...** open the Easy Graph View in the panel when `easy-graph.viewLocation` is `panel`.
- **Go to Commit in Easy Graph** works in diffs of staged changes and against the working file.
- **Easy Graph: Show Reflog...** dates each entry by when it was recorded in the reflog, not by its commit.
- Patch tab titles show the commit hash with the number of characters set by `core.abbrev` in `easy-graph.builtin`.
- Right-clicking on macOS opens Easy Graph's context menu instead of the native one, and Ctrl+click opens it without also selecting or deselecting the commit.
- **Copy Selected Text** in the context menu copies the selected text, replacing the native **Cut**, **Copy** and **Paste** items, which didn't work.
- Buttons, icons and other items with a tooltip show it on hover in every VS Code version.
- Links with custom schemes, e.g. from Issue Linking, open on a normal click, and URLs that end in a parenthesis or bracket are linked correctly.
- Pasting a branch name with the mouse enables the dialog's action button, and dialog buttons can be reached with Tab.
- A dialog taller than the view, e.g. in the panel, scrolls its content, so its buttons can still be reached.

#### Windows

- The Commit Details View no longer shows an empty file list when Git runs through a batch file such as `git.bat`.
- Repositories are recognized when Cygwin Git returns paths such as `/cygdrive/c/repo`.
