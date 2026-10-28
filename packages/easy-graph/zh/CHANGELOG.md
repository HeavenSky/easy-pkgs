# 更新日志

[English](../CHANGELOG.md) · **简体中文**

每个版本列出升级后能察觉到的变化。

## v0.0.1 2026-10-29

Easy Graph 的第一个版本，在 Git Graph 2 的 1.31.8 版基础上开发。下面列出与 Git Graph 1.30.0 相比能察觉到的全部差异，1.30.0 是 Git Graph 的[最后一个版本](https://github.com/mhutchie/vscode-git-graph/releases/tag/v1.30.0)（2021 年 4 月）。

### 切换前须知

- **Easy Graph 需要 VS Code 1.101 或更新版本**（Git Graph 1.30.0 支持 1.38）。安装前请先升级 VS Code。
- Easy Graph 是独立的扩展（`heavensky.easy-graph`），命令、视图和设置都使用自己的 `easy-graph.*`，可以与 Git Graph、Git Graph 2 同时安装。想保留 Git Graph 的设置，在 `settings.json` 里复制一份，把副本的前缀 `git-graph.` 改为 `easy-graph.`。
- **Git 相关行为跟随你的 Git 配置。** 签名、fetch 时的清理与标签、mailmap、缩写哈希的长度、未跟踪文件、快进以及 push 时设置上游，都使用仓库的 Git 配置（用 `git config` 设置的仓库级、全局或系统级配置），Fetch、Merge、Pull 和 Push 对话框的默认值也随之而定。`easy-graph.builtin` 可以用 Git 原名只为 Easy Graph 覆盖单个配置项：`commit.gpgSign`、`tag.gpgSign`、`fetch.prune`、`fetch.pruneTags`、`fetch.tags`、`log.mailmap`、`core.abbrev`、`status.showUntrackedFiles`、`merge.ff`、`pull.ff` 和 `push.autoSetupRemote`；设为 `null` 或删除的项跟随 Git 配置。默认值把 `core.abbrev` 设为 7、`log.mailmap` 设为 `false`、`merge.ff` 设为 `false`、`push.autoSetupRemote` 设为 `true`、`status.showUntrackedFiles` 设为 `all`，与 Git Graph 的行为一致；设置 `easy-graph.builtin` 会整体替换这个默认值，想保留的项请一并写上。
- 以下 Git Graph 设置由 `easy-graph.builtin` 或 Git 配置取代：`repository.sign.commits`（`commit.gpgSign`）、`repository.sign.tags`（`tag.gpgSign`）、`repository.fetchAndPrune` 和 `dialog.fetchRemote.prune`（`fetch.prune`）、`repository.fetchAndPruneTags` 和 `dialog.fetchRemote.pruneTags`（`fetch.pruneTags`）、`repository.useMailmap`（`log.mailmap`）、`repository.showUntrackedFiles`（`status.showUntrackedFiles`）、`dialog.merge.noFastForward`（`merge.ff`）、`dialog.pullBranch.noFastForward`（`pull.ff`）和 `dialog.pushBranch.skipSetUpstream`（`push.autoSetupRemote`）。
- Easy Graph 不发送安装、更新和卸载事件；Git Graph 会把它们发送到 `api.mhutchie.com`。
- 新图标让 Easy Graph 与 Git Graph 区分开。**View Easy Graph** 按钮和编辑器标签页使用 VS Code 内置的分支图标，跟随颜色主题，因此去掉了 `easy-graph.tabIconColourTheme` 设置。

### 新增

#### 完成 rebase 和 merge

- rebase、merge、cherry-pick 或 revert 进行中时，提交图上方显示横幅，提供 **Continue**、**Skip Commit** 和 **Abort**。
- **Rebase...** > **Interactive Rebase (Todo Editor)** 里拖动提交即可调整顺序，并为每个提交选择 pick、reword、edit、squash、fixup 或 drop。
- 提交右键菜单中的 **Create Fixup Commit** 把已暂存的改动提交为 `fixup!` 或 `squash!` 提交，Rebase 对话框里勾选 **Autosquash** 后会把它并入目标提交。
- Rebase 对话框中的 **Update Refs** 同时更新堆叠的分支；配合 Todo Editor 使用时需要 `awk`。**Ignore Whitespace** 忽略空白改动。

#### 一次操作多个提交

- 用 Ctrl/Cmd+单击和 Shift+单击选中多个提交，**Squash Selected Commits**、**Drop Selected Commits**、**Cherry Pick Selected Commits**（可勾选 **Allow Empty**）和 **Revert Selected Commits** 作用于所有选中的提交。
- 在 HEAD 上执行 **Reset Last Commit...** 可以撤销最后一次提交，把它的改动保留为未提交的改动。
- 提交右键菜单中的 **Edit Message** 改写提交信息。
- 选中两个提交时，**Select Merge Base** 选中它们的合并基准，**Copy Commit Subjects Between to Clipboard** 复制两者之间各提交的标题。

#### 筛选与查找提交

- 控制栏的 **Filter Messages** 只显示提交信息包含该文字的提交，搜索全部历史而不只是已加载的提交。
- **Authors** 下拉框只显示所选作者的提交，所选作者按仓库分别保存。
- **Paths** 下拉框，或资源管理器右键菜单中的 **在 Easy Graph 中按此路径筛选**，只显示改动了所选文件或文件夹的提交。用 `"easy-graph.toolbarButtonVisibility": { "Paths": false }` 隐藏这个下拉框。
- 单击分支或作者时只选中这一项，Ctrl/Cmd+单击追加选择，需开启 `easy-graph.repository.singleBranchSelect` 或 `easy-graph.repository.singleAuthorSelect`。这种模式下，Ctrl/Cmd+Enter 把高亮的选项加入选择。
- **Branches** 和 **Authors** 下拉框支持 `*` 通配符，Enter 选中全部匹配项，方向键可以在选项间移动。
- **Branches** 下拉框提供 **HEAD**、**HEAD + upstream** 和标签。在其中右键分支可以 **Checkout Branch**；显示全部分支时，分支标签的右键菜单也提供 **Select in Branches Dropdown**。
- **Display** 下拉框可以显示完整历史（**All**）、只显示分支或标签指向的提交（**Simplify**，默认值由 `easy-graph.repository.simplifyByDecoration` 设置）、只沿第一父提交显示（**First Parent**），或同时启用后两者。使用 **Paths** 筛选时 **Simplify** 不可用。
- **Scope** 下拉框决定 **Show All** 加载哪些提交：**Local** 分支和标签、**Remote** 分支、只存在于 **Reflog** 中的提交，或它们的任意组合；HEAD 始终包含在内。**Local** 和 **Remote** 都不勾选时，只显示任何分支或标签都到达不了的提交。新仓库的初始勾选由 `easy-graph.repository.showRemoteBranches` 和 `easy-graph.repository.includeCommitsMentionedByReflogs` 决定。
- 勾选 **Scope** 下拉框中的 **Dangling**，还会显示已不被任何引用指向的提交，例如已删除分支上的提交和已丢弃的 stash。这些提交显示为淡色，节点画成空心虚线并带 `dangling` 标签；已丢弃的 stash 可以从右键菜单 apply 或创建分支。已被 `git gc` 清理的对象无法显示。
- `easy-graph.excludeBranchGlobPatterns` 在显示全部分支时隐藏 `gh-pages`、`wip/*` 这类分支；右键菜单中的 **Hide Branch** 和 **Hide Remote** 隐藏单个分支或远程仓库。在 Repository Settings 中可以重新显示它们。
- `easy-graph.repository.onlyShowRemoteBranchesWithLocalBranches` 在显示全部分支时隐藏没有对应本地分支的远程分支。
- Repository Settings 中的 **Custom Log Arguments** 给 `git log` 追加参数，例如 `v1..v2` 这样的提交范围；`--format`、`--graph` 这类会改变输出的参数会被拒绝。
- Repository Settings 中的 **Hide merge commits** 隐藏合并提交，提交图仍保持连通。
- 查找框可以全词匹配并记住这个选项，再次打开时选中上次的搜索文字，搜索的列由 `easy-graph.findWidget.searchColumns` 设置。
- 查找框在已加载的提交中找不到时，**Search all** 在全部历史中按这段文字筛选；输入提交哈希时，即使该提交尚未加载也会跳转过去。

#### 更多 Git 操作

- 复制和比较提交的方式更多：**Copy Short Commit Hash**、**Copy Commit Link**（GitHub、GitLab、Bitbucket 和 Azure DevOps 格式的地址）、**Copy Commit Message** 和 **Compare with Working Tree**。
- 补丁可以复制、保存和应用：**Copy Commit Patch to Clipboard**、**Save Patch As...**、**Save Selected Commits as Patch...** 和 **Apply Patch...**。
- **Push to This Commit...** 把分支推送到某个提交为止，**Rebase Commits After This onto...** 把后续提交移到另一个基准上，**Delete Multiple Branches...** 一次删除多个分支。
- 分支右键菜单提供 **Create Branch**、**Pull Branch**（带 **Force Update** 选项）和 **View Issue**，后者打开分支名中写明的 issue。
- **No Verify** 在 push、merge、pull、squash 和修改提交信息时跳过 Git hook。
- Merge 对话框中的 **Allow unrelated histories** 可以合并历史不相关的分支，默认值由 `easy-graph.dialog.merge.allowUnrelatedHistories` 设置。
- 标签可以 checkout 和强制推送，revert 可以用 **No Commit** 只保留改动不提交，cherry-pick 支持 **Allow Empty**。
- 推送标签前，如果它的提交不在目标远程仓库的任何已知分支上，会先给出提醒。
- checkout 因未提交的改动会被覆盖而失败时，Easy Graph 会询问是否先 stash 这些改动再重新 checkout。
- `easy-graph.repository.backupBeforeDangerousActions`（默认关闭）在 reset、rebase、drop、squash、修改提交信息、删除分支或强制推送前，把受影响的分支备份到 `refs/easy-graph/backup/` 下。用 **Easy Graph: 管理备份...** 恢复或删除备份。
- **Easy Graph: 查看 Reflog...** 在提交图中显示从 reflog 中选择的提交。
- 通过 SSH fetch、pull 和 push 时，会提示输入加密私钥的密码；HTTPS 远程仓库认证失败时，错误信息会建议配置 Git 凭据助手。
- 标签说明和提交信息可以写多行，Ctrl/Cmd+Enter 确认对话框。
- 在 Add Tag 对话框中，名称输入框会提示已有的标签，单击它的信息图标会填入最近的标签。Create Branch 对话框会预先填入 `git.branchPrefix`。
- `easy-graph.dialog.merge.squashMessageFormat` 和 `easy-graph.dialog.pullBranch.squashMessageFormat` 设为 **Branch Name & Commit Subjects** 时，列出全部被 squash 的提交标题。
- 新增的对话框默认值：`easy-graph.dialog.pushBranch.mode` 和 `easy-graph.dialog.deleteBranch.deleteOnRemote`。
- **Easy Graph: 重置对话框中记住的选择** 清除 checkout 提交时的“Always Accept”和推送标签时的“Always Proceed”。
- `easy-graph.logGitCommandOutput` 把 Git 命令的输出（例如 Git hook 的消息）写入 Easy Graph 输出通道。pop 或 drop 的 stash 哈希也记录在那里，需要时可以找回。

#### 提交详情视图

- 列出提交的全部分支和标签，显示它的 `git notes`，重命名的文件显示原来的名称。
- 提交摘要可以折叠，折叠状态按仓库记住。
- 单击提交哈希会复制它，Ctrl/Cmd+单击在远程仓库中打开该提交。**Contained in** 旁边的 **Show** 列出包含该提交的分支。
- 提交信息中用三个反引号围起来的代码块显示为代码。
- 文件列表随输入即时筛选（`*` 匹配任意字符，Esc 清除筛选），摘要显示改动的文件数以及增删行数。`easy-graph.commitDetailsView.hiddenFields` 可以隐藏摘要中的字段。
- 一个按钮即可折叠或展开文件树的全部文件夹。
- 未提交的改动可以按 **All**、**Staged** 或 **Unstaged** 查看。
- **View Patch** 打开提交的完整补丁，**Browse Files at this Commit...** 打开该提交中的任意文件，**Edit Notes...** 添加、修改或删除它的 notes。
- 文件右键菜单提供 **Reset File to this Revision...**、**Copy All Relative File Paths to Clipboard**（遵循文件筛选）和 **Open in External Diff Tool**；`easy-graph.externalDiffToolArgs` 给 `git difftool` 追加参数。`easy-graph.contextMenuActionsVisibility` 的 `commitDetailsViewFile` 键可以隐藏这些操作。
- **Swap** 把两个提交的比较方向反过来，合并提交为每个父提交提供 **View Changes from Parent N**。
- **View All Changes** 在 VS Code 的多文件 diff 编辑器中一次打开某个提交、两个提交的比较、某个 stash（包括其中的未跟踪文件）或未提交改动（全部、已暂存或未暂存）的全部改动文件。提交、stash、已丢弃的 stash、未提交改动和提交详情文件列表的右键菜单中都有这一项，比较两个提交时 **Swap** 旁边也有。
- 在签名标签上执行 **View Details** 会显示签名状态。
- 把 `easy-graph.commitDetailsView.autoScroll` 设为 `false` 后，打开详情时提交图停在原处，不再滚动到该提交。

#### 阅读提交图

- 单击提交的节点会高亮这条线的历史（该提交及其第一父提交链），其余部分变淡；再次单击或按 Esc 取消。
- `easy-graph.graph.showBranchColourOnRows`（默认关闭）在每行左侧显示所在分支颜色的色条。
- 在其他 worktree 中检出的分支显示文件夹图标；仓库下拉框会为同名仓库显示上级文件夹。
- 鼠标悬停在描述上时显示完整标题以及该提交的全部分支和标签；有进行中代码评审的提交显示一个图标。

#### 调整视图

- Easy Graph 既能在编辑器中打开，也能在面板中打开：**Easy Graph: 在面板中查看 Easy Graph**、**Easy Graph: 在编辑器中查看 Easy Graph**，以及决定 **View Easy Graph** 等命令打开位置的 `easy-graph.viewLocation`。
- 滚动时表头保持可见（`easy-graph.stickyHeader`）；**Current** 按钮滚动到 HEAD，必要时加载更早的提交。
- `easy-graph.toolbarButtonVisibility` 可以隐藏 **Display**、**Scope**、**Paths** 等控制栏项目；隐藏表头时也能调整列宽。
- **Easy Graph: 跳转到分支/标签...** 滚动到某个分支或标签，必要时加载更早的提交；**Easy Graph: 切换仓库...** 切换显示的仓库。
- 差异编辑器标题栏或右键菜单中的 **在 Easy Graph 中定位到此提交** 在提交图中显示该文件所属的提交。
- **Easy Graph: 刷新** 刷新所有打开的 Easy Graph 视图。
- VS Code 重启后，编辑器中的 Easy Graph 标签页会恢复。
- `easy-graph.repository.fetchOnLoad`（默认关闭）在打开仓库时 fetch，每个仓库最多每 5 分钟一次。
- `easy-graph.disableRefreshWhenShown` 让视图再次显示时保留已加载的提交图；`easy-graph.toggleViewOnCommand` 让再次执行 **View Easy Graph** 时关闭编辑器中的 Easy Graph 视图。
- `easy-graph.date.format` 设为 **Custom** 时，按 `easy-graph.date.customFormat` 中的格式符显示日期，例如 `YYYY-MM-DD HH:mm`。
- `easy-graph.fontFamily`、`easy-graph.findMatchHighlightColour` 和 `easy-graph.flashColour` 设置视图的字体和颜色。
- Issue Linking 支持多条规则。
- 源代码管理视图中每个仓库旁边重新显示 Easy Graph 图标。
- VS Code 显示语言为中文时，命令标题、设置说明和扩展消息显示为中文；Easy Graph 视图本身保持英文。

#### 管理仓库

- `easy-graph.repositories` 列出始终显示的仓库，支持 `~`、`${workspaceFolder}` 和相对路径。
- 搜索仓库时跳过 `easy-graph.repoSearchExclude`（默认 `**/node_modules`）和 `files.exclude` 匹配的文件夹，在 dev container 中尤其有用。
- **移除 Git 仓库...** 一次移除多个仓库。
- 子模块和 worktree 中的改动会刷新提交图，并且会自动发现新的子模块。

#### 键盘与鼠标

- 把 `easy-graph.keyboardShortcut.modifier` 设为 `CTRL` 或 `CMD`，Ctrl/Cmd+F 只响应其中一个键，另一个留给 VS Code。
- Easy Graph 视图获得焦点时，鼠标的后退和前进键用于在 VS Code 的浏览历史中后退和前进。

### 变更

- 对已检出的分支执行 **Pull Branch** 时，和其他分支一样只做快进，不再产生合并提交或 rebase；本地分支与上游分支名称不同时，也会拉取上游。勾选 **Force Update** 时，把分支重置到刚取回的提交，如果这样会丢掉未提交的改动则拒绝执行。
- 右键单击未选中的提交时，直接打开它的右键菜单，不改变选择，也不关闭提交详情。再次单击已打开的提交会关闭详情并清空选择。
- **Easy Graph 视图只保留一个快捷键 Ctrl/Cmd+F**，用于打开查找框，不再抢占 VS Code 和系统的快捷键（例如 macOS 上的 Cmd+H）。刷新（Ctrl/Cmd+R）、滚动到 HEAD（Ctrl/Cmd+H）和跳到 stash（Ctrl/Cmd+S）的快捷键及对应的 `easy-graph.keyboardShortcut.*` 设置已移除，请改用 **Refresh** 和 **Current** 按钮。
- **Show Remote Branches** 复选框改为 **Scope** 下拉框；Repository Settings 中的 **Include commits only mentioned by reflogs** 和 **Only follow the first parent of commits** 复选框移到了 **Scope** 和 **Display** 下拉框中。各仓库已有的选择会保留。
- 缩写的提交哈希与 Git 一样为 7 位而不是 8 位，`easy-graph.builtin` 中的 `core.abbrev` 可以设为 4 到 40 之间的其他长度，设为 `null` 时使用 Git 为该仓库计算的长度。
- 扩展在 VS Code 启动完成后才激活（`onStartupFinished`），不再拖慢窗口打开。
- Easy Graph 监听的文件更少，最多每 2 秒刷新一次，大仓库中的 CPU 占用更低。
- Diff 视图尽量通过 VS Code 的 Git 扩展（`git:` URI）打开文件版本，因此可以在其中使用 blame 等 Git 功能。
- 未设置 `easy-graph.fileEncoding` 时，Diff 视图使用该仓库的 `files.encoding`；按语言单独设置的 `files.encoding` 不生效。
- `git.path` 中设置的 Git 可执行文件优先使用，即使 Easy Graph 之前找到过别的 Git。
- `easy-graph.repository.onLoad.scrollToHead` 会持续加载更多提交，直到 HEAD 出现。
- `easy-graph.openNewTabEditorGroup` 设为 **Beside** 时，如果 Easy Graph 视图在编辑器中打开，新标签页开在它旁边，而不是当前活动编辑器组旁边。
- 视图较窄时控制栏会折成多行，按钮集中在末尾，下拉框按内容调整宽度。
- 右键菜单项在松开鼠标按键时执行。
- 强制删除分支改用 `git branch -D`，较旧的 Git 版本也能执行。
- Easy Graph 输出日志会把空参数显示为 `''`，并记录你执行的命令。
- Repository Settings 中的 Issue Linking 示例改用占位符，不会被误当作可用的地址。
- Repository Settings 的 **Configure Initial Branches** 不再在 **Specific Branches** 中提供 HEAD（选了也不会保存），请改用 **Checked Out Branch**。

### 修复

#### rebase 与提交修改

- 在终端中启动交互式 rebase 时，分支名中的 shell 语法不会再被当作命令执行。
- **Squash Selected Commits** 只 squash 所选的提交：它们必须是 HEAD 及其连续的祖先，并且有已暂存的改动时拒绝执行。
- **Drop Selected Commits** 用一次 rebase 删除全部所选提交，遇到冲突时不会只删掉一部分。
- **Edit Message** 保留提交信息正文，提交信息中有引号也能正常使用。无论 Git 使用多长的缩写哈希都能找到该提交；修改较早的提交时保留合并提交；修改 HEAD 时不会带上已暂存的改动。HEAD 是合并提交、根提交或处于分离状态时也提供这个操作。
- **No Verify** 在 merge 或 pull 时也会跳过合并提交的 hook，修改较早提交的提交信息时也会跳过被重写提交的 hook。
- Rebase Todo Editor 先检查未提交的改动；todo 列表含 `reword` 或 `squash` 时打开终端；跳过已在上游的提交；在 worktree 和子模块中也能使用。
- 根提交上不再提供 **Reset Last Commit**。

#### 分支、标签与远程仓库

- 推送或删除与分支同名的标签时，操作对象是标签而不是分支。
- 分支右键菜单中的 **Create Branch** 遵循 `easy-graph.dialog.createBranch.checkOut`。
- 已设置 `GIT_ASKPASS` 时（例如远程开发环境），Easy Graph 不再覆盖它。
- Git 已在 `PATH` 中时，Easy Graph 打开的终端保留原有的 `PATH`，`core.editor` 使用的 `code` 命令行等工具可以正常运行，例如在 dev container 中。命令等 shell 就绪后才发送。

#### 提交图、选择与筛选

- 提交信息中有单独的回车符时，不再导致更早的提交全部不显示。
- **Current** 按钮会持续加载更多提交，直到 HEAD 出现。
- stash 的基准提交未显示时（例如只显示部分分支时做了 rebase），stash 挂到最近的已显示祖先上，不再消失。
- 使用 **Paths** 筛选时，侧分支上符合条件的提交不再显示为灰色。
- 使用 **Paths** 筛选时，带注释的标签不再显示两次。
- 开启 **Simplify** 时，只被未显示的标签引用的提交不再显示为没有引用的行。
- Shift+单击从最后一次单击的提交开始选择范围；所选提交被重写或切换仓库后，右键菜单可以正常打开；提交详情跟随选择变化。切换到其他标签页再切回来，选择保持不变。
- 在 **Branches** 和 **Authors** 下拉框中，单击已选中的选项时只保留这一项；输入后立即按 Enter 会使用刚输入的文字；Esc 可以关闭包括 **Paths** 在内的所有下拉框；**Show All** 之后全选不再选中 HEAD 和标签。
- 多次跳转到同一提交时，每次都会重新闪烁；`easy-graph.flashColour` 支持 `rgba(1,2,3)` 这类写法。

#### 提交详情视图

- 改动的文件夹名与 JavaScript 对象内置属性同名（例如 `constructor`），或文件被同名文件夹替换时，提交详情不再一直加载；这样的文件也能与文件夹分开标记为已审阅。
- 类型发生变化的文件（例如被符号链接替换的文件）显示为修改。
- 在文件树和文件列表之间切换，不再给文件加上项目符号；切换到其他标签页再切回来，文件列表保持原来的滚动位置。
- **Copy All Relative File Paths to Clipboard** 的列表中每个路径只出现一次，并使用 `/` 分隔。

#### 视图、菜单与对话框

- 从源代码管理视图打开 Easy Graph 时，不再报错“Cannot read properties of null (reading 'rootUri')”。
- Easy Graph 面板隐藏后再显示，每次改动只刷新一次；面板遵循 `easy-graph.retainContextWhenHidden`；从未打开过面板时，**Easy Graph: 刷新** 不再出错。
- `easy-graph.viewLocation` 设为 `panel` 时，**从远程仓库 fetch** 和 **恢复工作区内指定的代码评审...** 在面板中打开 Easy Graph 视图。
- **在 Easy Graph 中定位到此提交** 在暂存改动的 diff 和与工作区文件对比的 diff 中也能使用。
- **Easy Graph: 查看 Reflog...** 按每条记录写入 reflog 的时间显示日期，而不是提交时间。
- 补丁标签页标题中的提交哈希按 `easy-graph.builtin` 中 `core.abbrev` 设置的位数显示。
- 在 macOS 上右键单击时打开 Easy Graph 的右键菜单，而不是系统原生菜单；按住 Ctrl 单击时只打开菜单，不再同时选中或取消选中提交。
- 右键菜单的 **Copy Selected Text** 复制选中的文本，取代原生菜单中无效的 **Cut**、**Copy** 和 **Paste**。
- 在各版本 VS Code 中，鼠标悬停在按钮、图标等带提示的元素上都会显示提示。
- 自定义协议的链接（例如 Issue Linking 生成的链接）普通单击即可打开；以括号结尾的网址能正确识别为链接。
- 用鼠标粘贴分支名后，对话框的操作按钮可用；可以用 Tab 键把焦点移到对话框按钮上。
- 对话框比视图高时（例如在面板中），内容可以滚动，按钮仍然点得到。

#### Windows

- 通过 `git.bat` 这类批处理文件运行 Git 时，提交详情的文件列表不再为空。
- Cygwin Git 返回 `/cygdrive/c/repo` 这类路径时也能识别仓库。
