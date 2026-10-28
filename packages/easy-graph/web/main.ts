class GitGraphView {
	private gitRepos: GG.GitRepoSet;
	private gitBranches: ReadonlyArray<string> = [];
	private gitBranchHead: string | null = null;
	private gitConfig: GG.GitRepoConfig | null = null;
	private gitRemotes: ReadonlyArray<string> = [];
	private gitStashes: ReadonlyArray<GG.GitStash> = [];
	private gitBuiltin: GG.GitBuiltinState = { abbrevLength: DEFAULT_ABBREV_LENGTH, fetchPrune: false, fetchPruneTags: false, mergeNoFastForward: true, pullNoFastForward: false, pushSetUpstream: true };
	private gitTags: ReadonlyArray<string> = [];
	private commits: GG.GitCommit[] = [];
	private commitHead: string | null = null;
	private commitLookup: { [hash: string]: number } = {};
	private onlyFollowFirstParent: boolean = false;
	private avatars: AvatarImageCollection = {};
	private currentBranches: string[] | null = null;
	private currentAuthors: string[] | null = null;
	private messageFilter: string = '';
	private commitNotes: { [hash: string]: string | null } = {};
	private pendingEditCommitNotes: { hash: string, target: DialogTarget & CommitTarget } | null = null;
	private uncommittedGroup: GG.UncommittedGroup = 'all';
	private readonly messageFilterElem: HTMLInputElement;
	private pendingScrollToCommit: { hash: string, attemptsRemaining: number, silent?: boolean } | null = null;
	private worktreeBranches: { readonly [branch: string]: string } = {};
	private renderedWorktreeBranches: string = '{}';
	private codeReviewIds: string[] = [];

	private currentRepo!: string;
	private currentRepoLoading: boolean = true;
	private currentRepoRefreshState: {
		inProgress: boolean;
		hard: boolean;
		loadRepoInfoRefreshId: number;
		loadCommitsRefreshId: number;
		repoInfoChanges: boolean;
		configChanges: boolean;
		requestingRepoInfo: boolean;
		requestingConfig: boolean;
	};
	private loadViewTo: GG.LoadGitGraphViewTo = null;

	private readonly graph: Graph;
	private readonly config: Config;

	private moreCommitsAvailable: boolean = false;
	private expandedCommit: ExpandedCommit | null = null;
	private selectedCommits: Set<string> = new Set();
	private selectionAnchor: string | null = null;
	private flashingCommit: { readonly elem: HTMLElement, readonly timeout: ReturnType<typeof setTimeout> } | null = null;
	private maxCommits: number;
	private scrollTop = 0;
	private renderedGitBranchHead: string | null = null;

	private pendingRebaseTodo: {
		repo: string;
		obj: string;
		actionOn: GG.RebaseActionOn;
		signoff: boolean;
		autosquash: boolean;
		updateRefs: boolean;
	} | null = null;

	private readonly findWidget: FindWidget;
	private readonly settingsWidget: SettingsWidget;
	private readonly repoDropdown: Dropdown;
	private readonly branchDropdown: Dropdown;
	private readonly pathFilterDropdown: Dropdown;
	private readonly authorDropdown: Dropdown;
	private readonly displayDropdown: Dropdown;
	private readonly scopeDropdown: Dropdown;

	private readonly viewElem: HTMLElement;
	private readonly controlsElem: HTMLElement;
	private readonly tableElem: HTMLElement;
	private tableColHeadersElem: HTMLElement | null;
	private readonly footerElem: HTMLElement;
	private workspaceFolderPaths: { readonly [repo: string]: readonly string[] };
	private readonly refreshBtnElem: HTMLElement;

	constructor(viewElem: HTMLElement, prevState: WebViewState | null) {
		this.gitRepos = initialState.repos;
		this.config = initialState.config;
		this.maxCommits = this.config.initialLoadCommits;
		this.viewElem = viewElem;
		this.currentRepoRefreshState = {
			inProgress: false,
			hard: true,
			loadRepoInfoRefreshId: initialState.loadRepoInfoRefreshId,
			loadCommitsRefreshId: initialState.loadCommitsRefreshId,
			repoInfoChanges: false,
			configChanges: false,
			requestingRepoInfo: false,
			requestingConfig: false
		};

		this.controlsElem = document.getElementById('controls')!;
		this.tableElem = document.getElementById('commitTable')!;
		this.tableColHeadersElem = document.getElementById('tableColHeaders')!;
		this.footerElem = document.getElementById('footer')!;

		viewElem.focus();

		this.graph = new Graph('commitGraph', viewElem, this.config.graph, this.config.mute);

		this.repoDropdown = new Dropdown('repoDropdown', true, false, 'Repos', (values) => {
			this.loadRepo(values[0]);
		});

		this.branchDropdown = new Dropdown('branchDropdown', false, true, 'Branches', (values) => {
			this.currentBranches = values;
			this.maxCommits = this.config.initialLoadCommits;
			this.renderScopeDropdownState();
			this.saveState();
			this.clearCommits();
			this.requestLoadRepoInfoAndCommits(true, true);
		}, this.config.singleBranchSelect);
		this.branchDropdown.setOptionContextMenuCallback((value, e) => this.showBranchDropdownOptionContextMenu(value, e));
		this.authorDropdown = new Dropdown('authorDropdown', false, true, 'Authors', (values) => {
			this.currentAuthors = values;
			// Remember the selected authors for the repository
			this.saveRepoStateValue(this.currentRepo, 'authorFilter', values.length === 1 && values[0] === SHOW_ALL_BRANCHES ? null : values);
			this.maxCommits = this.config.initialLoadCommits;
			this.saveState();
			this.clearCommits();
			this.requestLoadRepoInfoAndCommits(true, true);
		}, this.config.singleAuthorSelect);
		// The Display dropdown overrides easy-graph.repository.simplifyByDecoration & onlyFollowFirstParent for the current repository,
		// "All" turns both off (i.e. the complete history)
		this.displayDropdown = new Dropdown('displayDropdown', false, true, 'Options', (values) => {
			this.saveRepoStateValue(this.currentRepo, 'simplifyByDecoration', values.includes(DISPLAY_OPTION_SIMPLIFY) ? GG.BooleanOverride.Enabled : GG.BooleanOverride.Disabled);
			this.saveRepoStateValue(this.currentRepo, 'onlyFollowFirstParent', values.includes(DISPLAY_OPTION_FIRST_PARENT) ? GG.BooleanOverride.Enabled : GG.BooleanOverride.Disabled);
			this.refresh(true);
		});
		// The Scope dropdown selects the sources of the commits loaded when showing all branches, "All" is the union of every scope
		document.getElementById('scopeInfo')!.innerHTML = SVG_ICONS.question;
		this.scopeDropdown = new Dropdown('scopeDropdown', false, true, 'Scopes', (values) => {
			this.saveRepoStateValue(this.currentRepo, 'scope', <GG.RepoScopeOption[]>values);
			this.maxCommits = this.config.initialLoadCommits;
			this.refresh(true);
		});

		this.messageFilterElem = <HTMLInputElement>document.getElementById('messageFilterInput')!;
		const applyMessageFilter = () => {
			const value = this.messageFilterElem.value.trim();
			if (value === this.messageFilter) return;
			this.messageFilter = value;
			this.messageFilterElem.classList.toggle('active', value !== '');
			this.maxCommits = this.config.initialLoadCommits;
			this.saveState();
			this.refresh(true);
		};
		this.messageFilterElem.addEventListener('change', applyMessageFilter);
		this.messageFilterElem.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				applyMessageFilter();
			} else if (e.key === 'Escape' && this.messageFilterElem.value !== '') {
				this.messageFilterElem.value = '';
				applyMessageFilter();
				e.stopPropagation();
			}
		});

		this.workspaceFolderPaths = initialState.workspaceFolderPaths;
		this.pathFilterDropdown = new Dropdown('pathFilterDropdown', false, false, 'Paths', (values) => {
			this.handlePathFilterChange(values[0]);
		}, false, (value) => {
			this.saveRepoStateValue(this.currentRepo, 'pathFilter', value);
			this.maxCommits = this.config.initialLoadCommits;
			this.refresh(true);
			this.restorePathFilterState(this.currentRepo);
		});

		this.refreshBtnElem = document.getElementById('refreshBtn')!;
		this.refreshBtnElem.addEventListener('click', () => {
			if (!this.refreshBtnElem.classList.contains(CLASS_REFRESHING)) {
				this.refresh(true, true);
			}
		});
		this.renderRefreshButton();

		this.findWidget = new FindWidget(this);
		this.settingsWidget = new SettingsWidget(this);

		alterClass(document.body, CLASS_BRANCH_LABELS_ALIGNED_TO_GRAPH, this.config.referenceLabels.branchLabelsAlignedToGraph);
		alterClass(document.body, CLASS_TAG_LABELS_RIGHT_ALIGNED, this.config.referenceLabels.tagLabelsOnRight);
		alterClass(document.body, 'showBranchColourOnRows', this.config.showBranchColourOnRows);
		if (this.config.fontFamily !== '') {
			document.body.style.fontFamily = this.config.fontFamily;
			document.body.style.setProperty('--vscode-font-family', this.config.fontFamily);
		}

		this.observeWindowSizeChanges();
		this.observeWebviewStyleChanges();
		this.observeViewScroll();
		this.observeKeyboardEvents();
		this.observeUrls();
		this.observeTableEvents();

		if (prevState && !prevState.currentRepoLoading && typeof this.gitRepos[prevState.currentRepo] !== 'undefined') {
			this.currentRepo = prevState.currentRepo;
			this.currentBranches = prevState.currentBranches;
			this.currentAuthors = prevState.currentAuthors;
			this.messageFilter = prevState.messageFilter || '';
			this.messageFilterElem.value = this.messageFilter;
			this.messageFilterElem.classList.toggle('active', this.messageFilter !== '');
			this.maxCommits = prevState.maxCommits;
			this.expandedCommit = prevState.expandedCommit;
			this.avatars = prevState.avatars;
			this.gitConfig = prevState.gitConfig;
			// The selection is kept when the view is hidden and shown again, loadCommits drops the hashes that are no longer loaded
			if (Array.isArray(prevState.selectedCommits)) prevState.selectedCommits.forEach((hash) => this.selectedCommits.add(hash));
			this.loadRepoInfo(prevState.gitBranches, prevState.gitBranchHead, prevState.gitRemotes, prevState.gitStashes, true);
			this.loadCommits(prevState.commits, prevState.commitHead, prevState.gitTags, prevState.moreCommitsAvailable, prevState.onlyFollowFirstParent);
			this.findWidget.restoreState(prevState.findWidget);
			this.settingsWidget.restoreState(prevState.settingsWidget);
			this.renderScopeDropdown();
			this.restorePathFilterState(prevState.currentRepo);
		}

		let loadViewTo = initialState.loadViewTo;
		if (loadViewTo === null && prevState && prevState.currentRepoLoading && typeof prevState.currentRepo !== 'undefined') {
			loadViewTo = { repo: prevState.currentRepo };
		}

		if (!this.loadRepos(this.gitRepos, initialState.lastActiveRepo, loadViewTo)) {
			if (prevState) {
				this.scrollTop = prevState.scrollTop;
				this.viewElem.scroll(0, this.scrollTop);
			}
			this.requestLoadRepoInfoAndCommits(false, false);
		}

		const currentBtn = document.getElementById('currentBtn')!, fetchBtn = document.getElementById('fetchBtn')!, findBtn = document.getElementById('findBtn')!, settingsBtn = document.getElementById('settingsBtn')!, terminalBtn = document.getElementById('terminalBtn')!;
		currentBtn.innerHTML = SVG_ICONS.current;
		currentBtn.addEventListener('click', () => this.jumpToHead());
		fetchBtn.title = 'Fetch from Remote(s)';
		fetchBtn.innerHTML = SVG_ICONS.download;
		fetchBtn.addEventListener('click', () => this.fetchFromRemotesAction());
		findBtn.innerHTML = SVG_ICONS.search;
		findBtn.addEventListener('click', () => this.findWidget.show(true));
		settingsBtn.innerHTML = SVG_ICONS.gear;
		settingsBtn.addEventListener('click', () => this.settingsWidget.show(this.currentRepo));
		terminalBtn.innerHTML = SVG_ICONS.terminal;
		terminalBtn.addEventListener('click', () => this.openTerminalAction());
	}

	private openTerminalAction() {
		runAction({
			command: 'openTerminal',
			repo: this.currentRepo,
			name: this.gitRepos[this.currentRepo].name || getRepoName(this.currentRepo)
		}, 'Opening Terminal');
	}


	/* Loading Data */

	public loadRepos(repos: GG.GitRepoSet, lastActiveRepo: string | null, loadViewTo: GG.LoadGitGraphViewTo, workspaceFolderPaths?: { readonly [repo: string]: readonly string[] }) {
		this.gitRepos = repos;
		if (workspaceFolderPaths) {
			this.workspaceFolderPaths = workspaceFolderPaths;
		}
		this.saveState();

		let newRepo: string;
		if (loadViewTo !== null && this.currentRepo !== loadViewTo.repo && typeof repos[loadViewTo.repo] !== 'undefined') {
			newRepo = loadViewTo.repo;
		} else if (typeof repos[this.currentRepo] === 'undefined') {
			newRepo = lastActiveRepo !== null && typeof repos[lastActiveRepo] !== 'undefined'
				? lastActiveRepo
				: getSortedRepositoryPaths(repos, this.config.repoDropdownOrder)[0];
		} else {
			newRepo = this.currentRepo;
		}

		alterClass(this.controlsElem, 'singleRepo', Object.keys(repos).length === 1);
		this.renderRepoDropdownOptions(newRepo);

		if (loadViewTo !== null) {
			if (loadViewTo.repo === newRepo) {
				this.loadViewTo = loadViewTo;
			} else {
				this.loadViewTo = null;
				showErrorMessage('Unable to load the Easy Graph View for the repository "' + loadViewTo.repo + '". It is not currently included in Easy Graph.');
			}
		} else {
			this.loadViewTo = null;
		}

		if (this.loadViewTo !== null && this.loadViewTo.pathFilter !== undefined) {
			this.gitRepos[this.loadViewTo.repo].pathFilter = this.loadViewTo.pathFilter;
			sendMessage({ command: 'setRepoState', repo: this.loadViewTo.repo, state: this.gitRepos[this.loadViewTo.repo] });
		}

		if (this.currentRepo !== newRepo) {
			this.loadRepo(newRepo);
			return true;
		} else {
			this.restorePathFilterState(this.currentRepo);
			this.renderScopeDropdown();
			if (this.loadViewTo !== null && this.loadViewTo.pathFilter !== undefined) {
				this.maxCommits = this.config.initialLoadCommits;
				this.refresh(true);
			} else {
				this.finaliseRepoLoad(false);
			}
			return false;
		}
	}

	private loadRepo(repo: string) {
		this.currentRepo = repo;
		this.currentRepoLoading = true;
		this.pendingScrollToCommit = null; // A commit still being loaded belongs to the previous repository
		this.restorePathFilterState(this.currentRepo);
		this.maxCommits = this.config.initialLoadCommits;
		this.gitConfig = null;
		this.gitRemotes = [];
		this.gitStashes = [];
		this.gitTags = [];
		this.currentBranches = null;
		this.renderScopeDropdown();
		this.currentAuthors = this.gitRepos[this.currentRepo].authorFilter !== null ? this.gitRepos[this.currentRepo].authorFilter!.slice() : [];
		this.messageFilter = '';
		this.messageFilterElem.value = '';
		this.messageFilterElem.classList.remove('active');
		this.renderFetchButton();
		this.closeCommitDetails(false);
		// The selected commits belong to the previous repository
		this.selectedCommits.clear();
		this.settingsWidget.close();
		this.saveState();
		this.refresh(true);
	}

	private restorePathFilterState(repo: string) {
		const repoState = this.gitRepos[repo];
		const options = this.getPathFilterOptions();
		const wsPaths = this.workspaceFolderPaths[repo] || [];

		let selectedValue: string;
		if (repoState.pathFilter === PATH_FILTER_WS_ALL && wsPaths.length > 0) {
			selectedValue = wsPaths.length === 1 ? wsPaths[0] : PATH_FILTER_WS_ALL;
		} else if (repoState.pathFilter !== null && repoState.pathFilter !== PATH_FILTER_WS_ALL) {
			const matchingOption = options.find((o) => o.value === repoState.pathFilter);
			selectedValue = matchingOption ? repoState.pathFilter : SHOW_ALL_BRANCHES;
		} else {
			selectedValue = SHOW_ALL_BRANCHES;
		}

		this.pathFilterDropdown.setOptions(options, [selectedValue]);
		this.renderDisplayDropdown();
	}

	private isPathFilterActive(): boolean {
		const repoState = this.gitRepos[this.currentRepo];
		if (repoState.pathFilter === PATH_FILTER_WS_ALL) {
			const paths = this.workspaceFolderPaths[this.currentRepo] || [];
			return paths.length > 0;
		}
		return repoState.pathFilter !== null;
	}

	/**
	 * Render the Display dropdown of the current repository. Simplify By Decoration doesn't apply while a path filter is active, so
	 * it's disabled (First Parent still applies).
	 */
	private renderDisplayDropdown() {
		const repoState = this.gitRepos[this.currentRepo];
		const pathFilterActive = this.isPathFilterActive();
		const selected: string[] = [];
		if (getSimplifyByDecoration(repoState.simplifyByDecoration)) selected.push(DISPLAY_OPTION_SIMPLIFY);
		if (getOnlyFollowFirstParent(repoState.onlyFollowFirstParent)) selected.push(DISPLAY_OPTION_FIRST_PARENT);
		this.displayDropdown.setOptions([
			{ name: 'All', value: DISPLAY_OPTION_ALL },
			{ name: 'Simplify', value: DISPLAY_OPTION_SIMPLIFY, hint: pathFilterActive ? 'unavailable with a path filter' : undefined, disabled: pathFilterActive },
			{ name: 'First Parent', value: DISPLAY_OPTION_FIRST_PARENT }
		], selected);
	}

	/**
	 * Render the Scope dropdown of the current repository.
	 */
	private renderScopeDropdown() {
		const scope = this.gitRepos[this.currentRepo].scope;
		this.scopeDropdown.setOptions(
			[{ name: 'All', value: SCOPE_OPTION_ALL }, ...REPO_SCOPES.map((value) => ({ name: REPO_SCOPE_NAMES[value], value: value }))],
			scope === null ? getInitialRepoScope() : scope.includes(SCOPE_OPTION_ALL) ? [SCOPE_OPTION_ALL] : scope
		);
		this.renderScopeDropdownState();
	}

	/**
	 * The Scope only applies when all branches are shown, otherwise the Scope dropdown is disabled. Remote still controls whether
	 * remote branches are offered in the Branches dropdown and labelled on the commits, which can't be changed while it's disabled.
	 */
	private renderScopeDropdownState() {
		const showAll = this.currentBranches === null || (this.currentBranches.length === 1 && this.currentBranches[0] === SHOW_ALL_BRANCHES);
		this.scopeDropdown.setDisabled(!showAll);
		// The explanation is shown by the question mark next to the dropdown, so that it doesn't widen the dropdown's options
		document.getElementById('scopeInfo')!.setAttribute('data-tooltip', (showAll ? '' : 'Only applies when Branches is "Show All". ') +
			'Where the commits are loaded from: Local (branches, tags & stashes), Remote (remote-tracking branches), Reflog (commits only mentioned by reflogs), Dangling (commits that no reference reaches, e.g. of deleted branches & dropped stashes, ' +
			'except those already removed by git gc). HEAD is always loaded. ' +
			'Without Local and Remote, only the commits that aren\'t referenced by a branch or tag are shown. Remote also controls whether remote branches are shown.');
	}

	private getPathFilterOptions(): DropdownOption[] {
		const options: DropdownOption[] = [{ name: 'All', value: SHOW_ALL_BRANCHES }];
		const wsPaths = this.workspaceFolderPaths[this.currentRepo] || [];
		if (wsPaths.length > 1) {
			options.push({ name: 'Workspace (all)', value: PATH_FILTER_WS_ALL });
		}
		for (const p of wsPaths) {
			options.push({ name: p, value: p });
		}
		// Custom paths can be entered via the dropdown's filter input (Enter key)
		const repoState = this.gitRepos[this.currentRepo];
		if (repoState.pathFilter !== null && repoState.pathFilter !== PATH_FILTER_WS_ALL && !wsPaths.includes(repoState.pathFilter)) {
			options.push({ name: repoState.pathFilter, value: repoState.pathFilter });
		}
		return options;
	}

	private handlePathFilterChange(selected: string) {
		if (selected === SHOW_ALL_BRANCHES) {
			this.saveRepoStateValue(this.currentRepo, 'pathFilter', null);
		} else if (selected === PATH_FILTER_WS_ALL) {
			this.saveRepoStateValue(this.currentRepo, 'pathFilter', PATH_FILTER_WS_ALL);
		} else {
			this.saveRepoStateValue(this.currentRepo, 'pathFilter', selected);
		}
		this.maxCommits = this.config.initialLoadCommits;
		this.renderDisplayDropdown();
		this.refresh(true);
	}

	private getWorkspacePathsForCurrentRepo(): string | null {
		const paths = this.workspaceFolderPaths[this.currentRepo] || [];
		return paths.length > 0 ? paths.join(', ') : null;
	}

	private loadRepoInfo(branchOptions: ReadonlyArray<string>, branchHead: string | null, remotes: ReadonlyArray<string>, stashes: ReadonlyArray<GG.GitStash>, isRepo: boolean, worktrees: { readonly [branch: string]: string } = {}) {
		// Changes to this.gitStashes and this.worktreeBranches are reflected as changes to the commits when loadCommits is run
		this.gitStashes = stashes;
		this.worktreeBranches = worktrees;

		if (!isRepo || (!this.currentRepoRefreshState.hard && arraysStrictlyEqual(this.gitBranches, branchOptions) && this.gitBranchHead === branchHead && arraysStrictlyEqual(this.gitRemotes, remotes))) {
			this.saveState();
			this.finaliseLoadRepoInfo(false, isRepo);
			return;
		}

		// Changes to these properties must be indicated as a repository info change
		this.gitBranches = branchOptions;
		this.gitBranchHead = branchHead;
		this.gitRemotes = remotes;

		// Update the state of the fetch button
		this.renderFetchButton();

		if (this.currentBranches !== null && !(this.currentBranches.length === 1 && this.currentBranches[0] === SHOW_ALL_BRANCHES)) {
			// Drop the selected options that are no longer offered, so that the initial branches are used if none of them remain. HEAD
			// and "HEAD + upstream" are always offered, tags are kept until the tags of the repository are known.
			const globPatterns = this.config.customBranchGlobPatterns.map((pattern) => pattern.glob);
			const isOffered = (value: string) => value === 'HEAD' || value === HEAD_AND_UPSTREAM_BRANCH || this.gitBranches.includes(value) || globPatterns.includes(value) ||
				(value.startsWith(TAG_BRANCH_OPTION_PREFIX) && (this.gitTags.length === 0 || this.gitTags.includes(value.substring(TAG_BRANCH_OPTION_PREFIX.length))));
			this.currentBranches = this.currentBranches.filter(isOffered);
		}
		if (this.currentBranches === null || this.currentBranches.length === 0) {
			// No branches are currently selected
			const onRepoLoadShowCheckedOutBranch = getOnRepoLoadShowCheckedOutBranch(this.gitRepos[this.currentRepo].onRepoLoadShowCheckedOutBranch);
			const onRepoLoadShowSpecificBranches = getOnRepoLoadShowSpecificBranches(this.gitRepos[this.currentRepo].onRepoLoadShowSpecificBranches);
			this.currentBranches = [];
			if (onRepoLoadShowSpecificBranches.length > 0) {
				// Show specific branches if they exist in the repository
				const globPatterns = this.config.customBranchGlobPatterns.map((pattern) => pattern.glob);
				this.currentBranches.push(...onRepoLoadShowSpecificBranches.filter((branch) =>
					this.gitBranches.includes(branch) || globPatterns.includes(branch)
				));
			}
			if (onRepoLoadShowCheckedOutBranch && this.gitBranchHead !== null && !this.currentBranches.includes(this.gitBranchHead)) {
				// Show the checked-out branch, and it hasn't already been added as a specific branch
				this.currentBranches.push(this.gitBranchHead);
			}
			if (this.currentBranches.length === 0) {
				this.currentBranches.push(SHOW_ALL_BRANCHES);
			}
		}

		this.saveState();

		// Set up branch dropdown options
		this.branchDropdown.setOptions(this.getBranchOptions(true), this.currentBranches);
		this.authorDropdown.setOptions(this.getAuthorOptions(), this.currentAuthors);
		this.renderScopeDropdownState();

		// Remove hidden remotes that no longer exist
		let hiddenRemotes = this.gitRepos[this.currentRepo].hideRemotes;
		let hideRemotes = hiddenRemotes.filter((hiddenRemote) => remotes.includes(hiddenRemote));
		if (hiddenRemotes.length !== hideRemotes.length) {
			this.saveRepoStateValue(this.currentRepo, 'hideRemotes', hideRemotes);
		}

		this.finaliseLoadRepoInfo(true, isRepo);
	}

	private finaliseLoadRepoInfo(repoInfoChanges: boolean, isRepo: boolean) {
		const refreshState = this.currentRepoRefreshState;
		if (refreshState.inProgress) {
			if (isRepo) {
				refreshState.repoInfoChanges = refreshState.repoInfoChanges || repoInfoChanges;
				refreshState.requestingRepoInfo = false;
				this.requestLoadCommits();
			} else {
				dialog.closeActionRunning();
				refreshState.inProgress = false;
				this.loadViewTo = null;
				this.renderRefreshButton();
				sendMessage({ command: 'loadRepos', check: true });
			}
		}
	}

	private loadCommits(commits: GG.GitCommit[], commitHead: string | null, tags: ReadonlyArray<string>, moreAvailable: boolean, onlyFollowFirstParent: boolean, pathFilterActive: boolean = false, codeReviews: ReadonlyArray<string> | null = null) {
		// This list of tags is just used to provide additional information in the dialogs. Tag information included in commits is used for all other purposes (e.g. rendering, context menus)
		const tagsChanged = !arraysStrictlyEqual(this.gitTags, tags);
		this.gitTags = tags;
		if (codeReviews !== null) this.codeReviewIds = codeReviews.slice();
		if (tagsChanged) {
			// The Branches dropdown also lists the tags
			this.branchDropdown.setOptions(this.getBranchOptions(true), this.currentBranches);
		}

		if (!this.currentRepoLoading && !this.currentRepoRefreshState.hard && this.moreCommitsAvailable === moreAvailable && this.onlyFollowFirstParent === onlyFollowFirstParent && this.commitHead === commitHead && commits.length > 0 && arraysEqual(this.commits, commits, (a, b) =>
			a.hash === b.hash &&
			arraysStrictlyEqual(a.heads, b.heads) &&
			arraysEqual(a.tags, b.tags, (a, b) => a.name === b.name && a.annotated === b.annotated) &&
			arraysEqual(a.remotes, b.remotes, (a, b) => a.name === b.name && a.remote === b.remote) &&
			arraysStrictlyEqual(a.parents, b.parents) &&
			((a.stash === null && b.stash === null) || (a.stash !== null && b.stash !== null && a.stash.selector === b.stash.selector)) &&
			a.dangling === b.dangling
		) && this.renderedGitBranchHead === this.gitBranchHead && this.renderedWorktreeBranches === JSON.stringify(this.worktreeBranches)) {

			if (this.commits[0].hash === UNCOMMITTED) {
				this.commits[0] = commits[0];
				this.saveState();
				this.renderUncommittedChanges();
				if (this.expandedCommit !== null && this.expandedCommit.commitElem !== null) {
					if (this.expandedCommit.compareWithHash === null) {
						// Commit Details View is open
						if (this.expandedCommit.commitHash === UNCOMMITTED) {
							this.requestCommitDetails(this.expandedCommit.commitHash, true);
						}
					} else {
						// Commit Comparison is open
						if (this.expandedCommit.compareWithElem !== null && (this.expandedCommit.commitHash === UNCOMMITTED || this.expandedCommit.compareWithHash === UNCOMMITTED)) {
							this.requestCommitComparison(this.expandedCommit.commitHash, this.expandedCommit.compareWithHash, true);
						}
					}
				}
			} else if (tagsChanged) {
				this.saveState();
			}
			this.renderCodeReviewMarkers();
			this.finaliseLoadCommits();
			return;
		}

		const currentRepoLoading = this.currentRepoLoading;
		this.currentRepoLoading = false;
		this.moreCommitsAvailable = moreAvailable;
		this.onlyFollowFirstParent = onlyFollowFirstParent;
		this.commits = commits;
		this.commitHead = commitHead;
		this.commitLookup = {};

		let i: number, expandedCommitVisible = false, expandedCompareWithCommitVisible = false, avatarsNeeded: { [email: string]: string[] } = {}, commit;
		for (i = 0; i < this.commits.length; i++) {
			commit = this.commits[i];
			this.commitLookup[commit.hash] = i;
			if (this.expandedCommit !== null) {
				if (this.expandedCommit.commitHash === commit.hash) {
					expandedCommitVisible = true;
				} else if (this.expandedCommit.compareWithHash === commit.hash) {
					expandedCompareWithCommitVisible = true;
				}
			}
			if (this.config.fetchAvatars && typeof this.avatars[commit.email] !== 'string' && commit.email !== '') {
				if (typeof avatarsNeeded[commit.email] === 'undefined') {
					avatarsNeeded[commit.email] = [commit.hash];
				} else {
					avatarsNeeded[commit.email].push(commit.hash);
				}
			}
		}

		if (this.expandedCommit !== null && (!expandedCommitVisible || (this.expandedCommit.compareWithHash !== null && !expandedCompareWithCommitVisible))) {
			this.closeCommitDetails(false);
		}
		// Commits that are no longer loaded (e.g. rewritten by an action, or of another repository) can't remain selected
		this.selectedCommits = new Set(this.getSelectedCommitsArray());
		if (this.selectionAnchor !== null && !this.selectedCommits.has(this.selectionAnchor)) this.selectionAnchor = null;

		this.saveState();

		this.graph.loadCommits(this.commits, this.commitHead, this.commitLookup, this.onlyFollowFirstParent, pathFilterActive);
		this.render();

		if (currentRepoLoading && this.config.onRepoLoad.scrollToHead && this.commitHead !== null) {
			if (typeof this.commitLookup[this.commitHead] === 'number') {
				this.scrollToCommit(this.commitHead, true);
			} else if (this.moreCommitsAvailable) {
				// HEAD is older than the loaded commits: processLoadCommitsResponse loads more commits until it's loaded
				this.pendingScrollToCommit = { hash: this.commitHead, attemptsRemaining: 20, silent: true };
			}
		}

		this.finaliseLoadCommits();
		this.requestAvatars(avatarsNeeded);
	}

	private finaliseLoadCommits() {
		const refreshState = this.currentRepoRefreshState;
		if (refreshState.inProgress) {
			dialog.closeActionRunning();

			if (dialog.isTargetDynamicSource()) {
				if (refreshState.repoInfoChanges) {
					dialog.close();
				} else {
					dialog.refresh(this.getCommits());
				}
			}

			if (contextMenu.isTargetDynamicSource()) {
				if (refreshState.repoInfoChanges) {
					contextMenu.close();
				} else {
					contextMenu.refresh(this.getCommits());
				}
			}

			refreshState.inProgress = false;
			this.renderRefreshButton();
		}

		this.finaliseRepoLoad(true);
	}

	private finaliseRepoLoad(didLoadRepoData: boolean) {
		if (this.loadViewTo !== null && this.currentRepo === this.loadViewTo.repo) {
			if (this.loadViewTo.commitDetails && (this.expandedCommit === null || this.expandedCommit.commitHash !== this.loadViewTo.commitDetails.commitHash || this.expandedCommit.compareWithHash !== this.loadViewTo.commitDetails.compareWithHash)) {
				const commitIndex = this.getCommitId(this.loadViewTo.commitDetails.commitHash);
				const compareWithIndex = this.loadViewTo.commitDetails.compareWithHash !== null ? this.getCommitId(this.loadViewTo.commitDetails.compareWithHash) : null;
				const commitElems = getCommitElems();
				const commitElem = findCommitElemWithId(commitElems, commitIndex);
				const compareWithElem = findCommitElemWithId(commitElems, compareWithIndex);

				if (commitElem !== null && (this.loadViewTo.commitDetails.compareWithHash === null || compareWithElem !== null)) {
					if (compareWithElem !== null) {
						this.loadCommitComparison(commitElem, compareWithElem);
					} else {
						this.loadCommitDetails(commitElem);
					}
				} else {
					showErrorMessage('Unable to resume Code Review, it could not be found in the latest ' + this.maxCommits + ' commits that were loaded in this repository.');
				}
			} else if (this.loadViewTo.scrollToCommit) {
				// Go to Commit, Go to Branch/Tag
				this.scrollToCommitLoadingMoreIfNeeded(this.loadViewTo.scrollToCommit);
			} else if (this.loadViewTo.runCommandOnLoad) {
				switch (this.loadViewTo.runCommandOnLoad) {
					case 'fetch':
						this.fetchFromRemotesAction();
						break;
				}
			}
		}
		this.loadViewTo = null;

		if (this.gitConfig === null || (didLoadRepoData && this.currentRepoRefreshState.configChanges)) {
			this.requestLoadConfig();
		}
	}

	private clearCommits() {
		closeDialogAndContextMenu();
		this.moreCommitsAvailable = false;
		this.commits = [];
		this.commitHead = null;
		this.commitLookup = {};
		this.renderedGitBranchHead = null;
		this.closeCommitDetails(false);
		this.saveState();
		this.graph.loadCommits(this.commits, this.commitHead, this.commitLookup, this.onlyFollowFirstParent);
		this.tableElem.innerHTML = '';
		this.footerElem.innerHTML = '';
		this.renderGraph();
		this.findWidget.refresh();
	}

	public processLoadRepoInfoResponse(msg: GG.ResponseLoadRepoInfo) {
		if (msg.error === null) {
			const refreshState = this.currentRepoRefreshState;
			if (refreshState.inProgress && refreshState.loadRepoInfoRefreshId === msg.refreshId) {
				this.setGitBuiltin(msg.builtin);
				this.loadRepoInfo(msg.branches, msg.head, msg.remotes, msg.stashes, msg.isRepo, msg.worktrees);
			}
		} else {
			this.displayLoadDataError('Unable to load Repository Info', msg.error);
		}
	}

	public processLoadCommitsResponse(msg: GG.ResponseLoadCommits) {
		if (msg.error === null) {
			const refreshState = this.currentRepoRefreshState;
			if (refreshState.inProgress && refreshState.loadCommitsRefreshId === msg.refreshId) {
				this.loadCommits(msg.commits, msg.head, msg.tags, msg.moreCommitsAvailable, msg.onlyFollowFirstParent, msg.pathFilterActive, msg.codeReviews);
				if (this.pendingScrollToCommit !== null) {
					const pending = this.pendingScrollToCommit;
					this.pendingScrollToCommit = null;
					this.scrollToCommitLoadingMoreIfNeeded(pending.hash, pending.attemptsRemaining, pending.silent === true);
				}
			}
		} else {
			const error = this.gitBranches.length === 0 && msg.error.indexOf('bad revision \'HEAD\'') > -1
				? 'There are no commits in this repository.'
				: msg.error;
			this.displayLoadDataError('Unable to load Commits', error);
		}
	}

	public processLoadConfig(msg: GG.ResponseLoadConfig) {
		this.currentRepoRefreshState.requestingConfig = false;
		if (msg.config !== null && this.currentRepo === msg.repo) {
			this.gitConfig = msg.config;
			this.saveState();

			this.renderCdvExternalDiffBtn();
		}
		this.settingsWidget.refresh();
		this.authorDropdown.setOptions(this.getAuthorOptions(), this.currentAuthors);
	}

	private displayLoadDataError(message: string, reason: string) {
		this.clearCommits();
		this.currentRepoRefreshState.inProgress = false;
		this.loadViewTo = null;
		this.renderRefreshButton();
		dialog.showError(message, reason, 'Retry', () => {
			this.refresh(true);
		});
	}

	public loadAvatar(email: string, image: string) {
		this.avatars[email] = image;
		this.saveState();
		let avatarsElems = <HTMLCollectionOf<HTMLElement>>document.getElementsByClassName('avatar'), escapedEmail = escapeHtml(email);
		for (let i = 0; i < avatarsElems.length; i++) {
			if (avatarsElems[i].dataset.email === escapedEmail) {
				avatarsElems[i].innerHTML = '<img class="avatarImg" src="' + image + '">';
			}
		}
	}


	/* Getters */

	public getBranches(): ReadonlyArray<string> {
		return this.gitBranches;
	}

	public getBranchOptions(includeShowAll?: boolean): ReadonlyArray<DialogSelectInputOption> {
		const options: DropdownOption[] = [];
		if (includeShowAll) {
			// Options of the Branches dropdown. HEAD follows whatever is checked out, including a detached HEAD, and isn't
			// offered for the initial branches (Repository Settings), where "Checked Out Branch" serves this purpose. A local branch
			// that is literally called "HEAD" (which older versions of Git allowed) takes its place, as both would have the same value.
			options.push({ name: 'Show All', value: SHOW_ALL_BRANCHES });
			if (!this.gitBranches.includes('HEAD')) {
				options.push({ name: 'HEAD', value: 'HEAD', standalone: true });
			}
			// The checked out branch and its upstream
			options.push({ name: 'HEAD + upstream', value: HEAD_AND_UPSTREAM_BRANCH, standalone: true });
		}
		for (let i = 0; i < this.config.customBranchGlobPatterns.length; i++) {
			options.push({ name: 'Glob: ' + this.config.customBranchGlobPatterns[i].name, value: this.config.customBranchGlobPatterns[i].glob });
		}
		for (let i = 0; i < this.gitBranches.length; i++) {
			options.push({ name: this.gitBranches[i].indexOf('remotes/') === 0 ? this.gitBranches[i].substring(8) : this.gitBranches[i], value: this.gitBranches[i] });
		}
		if (includeShowAll) {
			// Tags can also be selected
			for (let i = 0; i < this.gitTags.length; i++) {
				options.push({ name: 'Tag: ' + this.gitTags[i], value: TAG_BRANCH_OPTION_PREFIX + this.gitTags[i], standalone: true });
			}
		}
		return options;
	}
	public getAuthorOptions(): ReadonlyArray<DialogSelectInputOption> {
		const options: DialogSelectInputOption[] = [];
		options.push({ name: 'All', value: SHOW_ALL_BRANCHES });
		if (this.gitConfig && this.gitConfig.authors) {
			for (let i = 0; i < this!.gitConfig!.authors.length; i++) {
				const author = this!.gitConfig!.authors[i];
				options.push({ name: author.name, value: author.name });
			}
		}
		return options;
	}
	public getCommitId(hash: string) {
		return typeof this.commitLookup[hash] === 'number' ? this.commitLookup[hash] : null;
	}

	private getCommitOfElem(elem: HTMLElement) {
		let id = parseInt(elem.dataset.id!);
		if (id >= this.commits.length) return null;
		const commit = this.commits[id];
		return commit;
	}

	public getCommits(): ReadonlyArray<GG.GitCommit> {
		return this.commits;
	}

	private getPushRemote(branch: string | null = null) {
		const possibleRemotes = [];
		if (this.gitConfig !== null) {
			if (branch !== null && typeof this.gitConfig.branches[branch] !== 'undefined') {
				possibleRemotes.push(this.gitConfig.branches[branch].pushRemote, this.gitConfig.branches[branch].remote);
			}
			possibleRemotes.push(this.gitConfig.pushDefault);
		}
		possibleRemotes.push('origin');
		return possibleRemotes.find((remote) => remote !== null && this.gitRemotes.includes(remote)) || this.gitRemotes[0];
	}

	/**
	 * Get the remote of a local branch's upstream (`branch.<name>.remote`).
	 * @param branchName The name of the local branch.
	 * @returns The name of the remote, or NULL if the branch doesn't have an upstream (or the repository's config hasn't been loaded).
	 */
	private getRemoteForBranch(branchName: string): string | null {
		const upstream = this.getBranchUpstream(branchName);
		return upstream !== null ? upstream.remote : null;
	}

	/**
	 * Get the upstream of a local branch, from its `branch.<name>.remote` and `branch.<name>.merge` Git config. The upstream branch
	 * can have a different name than the local branch (e.g. "main" tracking "origin/master").
	 * @param branchName The name of the local branch.
	 * @returns The remote (`.` when the upstream is a local branch) and the ref of the branch on it (NULL if `branch.<name>.merge`
	 * isn't set), or NULL if the branch doesn't have an upstream (or the repository's config hasn't been loaded).
	 */
	private getBranchUpstream(branchName: string): { readonly remote: string, readonly ref: string | null } | null {
		// The config of a branch is looked up as an own property, so that e.g. a branch named "constructor" isn't matched by Object.prototype
		const branchConfig = this.gitConfig !== null && Object.prototype.hasOwnProperty.call(this.gitConfig.branches, branchName)
			? this.gitConfig.branches[branchName]
			: null;
		return branchConfig !== null && branchConfig.remote !== null
			? { remote: branchConfig.remote, ref: typeof branchConfig.merge === 'string' ? branchConfig.merge : null }
			: null;
	}

	/**
	 * Get the effective values of the `easy-graph.builtin` Git config keys in the current repository.
	 */
	public getGitBuiltin(): GG.GitBuiltinState {
		return this.gitBuiltin;
	}

	/**
	 * Apply the effective values of the `easy-graph.builtin` Git config keys of the current repository.
	 * @param builtin The values loaded with the repository info.
	 */
	private setGitBuiltin(builtin: GG.GitBuiltinState) {
		this.gitBuiltin = builtin;
		abbrevLength = builtin.abbrevLength;
		document.getElementById('fetchBtn')!.title = 'Fetch' + (builtin.fetchPrune ? ' & Prune' : '') + ' from Remote(s)';
	}

	public getRepoConfig(): Readonly<GG.GitRepoConfig> | null {
		return this.gitConfig;
	}

	public getRepoState(repo: string): Readonly<GG.GitRepoState> | null {
		return typeof this.gitRepos[repo] !== 'undefined'
			? this.gitRepos[repo]
			: null;
	}

	public isConfigLoading(): boolean {
		return this.currentRepoRefreshState.requestingConfig;
	}


	/* Refresh */

	public refresh(hard: boolean, configChanges: boolean = false) {
		if (hard) {
			this.clearCommits();
		}
		this.requestLoadRepoInfoAndCommits(hard, false, configChanges);
	}


	/* Requests */

	private requestLoadRepoInfo() {
		const repoState = this.gitRepos[this.currentRepo];
		sendMessage({
			command: 'loadRepoInfo',
			repo: this.currentRepo,
			refreshId: ++this.currentRepoRefreshState.loadRepoInfoRefreshId,
			showRemoteBranches: getRepoScope(repoState.scope).includes('remote'),
			simplifyByDecoration: getSimplifyByDecoration(repoState.simplifyByDecoration),
			showStashes: getShowStashes(repoState.showStashes),
			hideRemotes: repoState.hideRemotes
		});
	}

	private requestLoadCommits() {
		const repoState = this.gitRepos[this.currentRepo];
		sendMessage({
			command: 'loadCommits',
			repo: this.currentRepo,
			refreshId: ++this.currentRepoRefreshState.loadCommitsRefreshId,
			branches: this.currentBranches === null || (this.currentBranches.length === 1 && this.currentBranches[0] === SHOW_ALL_BRANCHES) ? null : this.currentBranches,
			authors: this.currentAuthors === null || (this.currentAuthors.length === 1 && this.currentAuthors[0] === SHOW_ALL_BRANCHES) ? null : this.currentAuthors,
			maxCommits: this.maxCommits,
			showTags: getShowTags(repoState.showTags),
			scope: getRepoScope(repoState.scope),
			simplifyByDecoration: this.isPathFilterActive() ? false : getSimplifyByDecoration(repoState.simplifyByDecoration),
			onlyFollowFirstParent: getOnlyFollowFirstParent(repoState.onlyFollowFirstParent),
			commitOrdering: getCommitOrdering(repoState.commitOrdering),
			remotes: this.gitRemotes,
			hideRemotes: repoState.hideRemotes,
			stashes: this.gitStashes,
			pathFilter: repoState.pathFilter === PATH_FILTER_WS_ALL
				? this.getWorkspacePathsForCurrentRepo()
				: repoState.pathFilter,
			messageFilter: this.messageFilter !== '' ? this.messageFilter : null,
			logFilter: {
				excludeBranches: repoState.excludeBranches,
				hideMergeCommits: repoState.hideMergeCommits,
				customLogArgs: repoState.customLogArgs
			}
		});
	}

	private requestLoadRepoInfoAndCommits(hard: boolean, skipRepoInfo: boolean, configChanges: boolean = false) {
		const refreshState = this.currentRepoRefreshState;
		if (refreshState.inProgress) {
			refreshState.hard = refreshState.hard || hard;
			refreshState.configChanges = refreshState.configChanges || configChanges;
			if (!skipRepoInfo) {
				// This request will trigger a loadCommit request after the loadRepoInfo request has completed.
				// Invalidate any previous commit requests in progress.
				refreshState.loadCommitsRefreshId++;
			}
		} else {
			refreshState.hard = hard;
			refreshState.inProgress = true;
			refreshState.repoInfoChanges = false;
			refreshState.configChanges = configChanges;
			refreshState.requestingRepoInfo = false;
		}

		this.renderRefreshButton();
		if (this.commits.length === 0) {
			this.tableElem.innerHTML = '<h2 id="loadingHeader">' + SVG_ICONS.loading + 'Loading ...</h2>';
		}
		sendMessage({ command: 'loadOperationInProgress', repo: this.currentRepo });

		if (skipRepoInfo) {
			if (!refreshState.requestingRepoInfo) {
				this.requestLoadCommits();
			}
		} else {
			refreshState.requestingRepoInfo = true;
			this.requestLoadRepoInfo();
		}
	}

	public requestLoadConfig() {
		this.currentRepoRefreshState.requestingConfig = true;
		sendMessage({ command: 'loadConfig', repo: this.currentRepo, remotes: this.gitRemotes });
		this.settingsWidget.refresh();
	}

	public requestCommitDetails(hash: string, refresh: boolean) {
		let commit = this.commits[this.commitLookup[hash]];
		sendMessage({
			command: 'commitDetails',
			repo: this.currentRepo,
			commitHash: hash,
			hasParents: commit.parents.length > 0,
			stash: commit.stash,
			avatarEmail: this.config.fetchAvatars && hash !== UNCOMMITTED ? commit.email : null,
			uncommittedGroup: hash === UNCOMMITTED ? this.uncommittedGroup : 'all',
			refresh: refresh
		});
	}

	public requestCommitComparison(hash: string, compareWithHash: string, refresh: boolean) {
		let commitOrder = this.getComparisonOrder(hash, compareWithHash);
		sendMessage({
			command: 'compareCommits',
			repo: this.currentRepo,
			commitHash: hash, compareWithHash: compareWithHash,
			fromHash: commitOrder.from, toHash: commitOrder.to,
			refresh: refresh
		});
	}

	private requestAvatars(avatars: { [email: string]: string[] }) {
		let emails = Object.keys(avatars), remote = this.gitRemotes.length > 0 ? this.gitRemotes.includes('origin') ? 'origin' : this.gitRemotes[0] : null;
		for (let i = 0; i < emails.length; i++) {
			sendMessage({ command: 'fetchAvatar', repo: this.currentRepo, remote: remote, email: emails[i], commits: avatars[emails[i]] });
		}
	}


	/* State */

	public saveState() {
		let expandedCommit;
		if (this.expandedCommit !== null) {
			expandedCommit = Object.assign({}, this.expandedCommit);
			expandedCommit.commitElem = null;
			expandedCommit.compareWithElem = null;
			expandedCommit.contextMenuOpen = {
				summary: false,
				fileView: -1
			};
		} else {
			expandedCommit = null;
		}

		VSCODE_API.setState({
			currentRepo: this.currentRepo,
			currentRepoLoading: this.currentRepoLoading,
			gitRepos: this.gitRepos,
			gitBranches: this.gitBranches,
			gitBranchHead: this.gitBranchHead,
			gitConfig: this.gitConfig,
			gitRemotes: this.gitRemotes,
			gitStashes: this.gitStashes,
			gitTags: this.gitTags,
			commits: this.commits,
			commitHead: this.commitHead,
			avatars: this.avatars,
			currentBranches: this.currentBranches,
			currentAuthors: this.currentAuthors,
			messageFilter: this.messageFilter,
			moreCommitsAvailable: this.moreCommitsAvailable,
			maxCommits: this.maxCommits,
			onlyFollowFirstParent: this.onlyFollowFirstParent,
			expandedCommit: expandedCommit,
			scrollTop: this.scrollTop,
			selectedCommits: Array.from(this.selectedCommits),
			findWidget: this.findWidget.getState(),
			settingsWidget: this.settingsWidget.getState()
		});
	}

	public saveRepoState() {
		sendMessage({ command: 'setRepoState', repo: this.currentRepo, state: this.gitRepos[this.currentRepo] });
	}

	private saveColumnWidths(columnWidths: GG.ColumnWidth[]) {
		this.gitRepos[this.currentRepo].columnWidths = [columnWidths[0], columnWidths[2], columnWidths[3], columnWidths[4]];
		this.saveRepoState();
	}

	private saveExpandedCommitLoading(index: number, commitHash: string, commitElem: HTMLElement, compareWithHash: string | null, compareWithElem: HTMLElement | null) {
		this.expandedCommit = {
			index: index,
			commitHash: commitHash,
			commitElem: commitElem,
			compareWithHash: compareWithHash,
			compareWithElem: compareWithElem,
			commitDetails: null,
			fileChanges: null,
			fileTree: null,
			avatar: null,
			codeReview: null,
			lastViewedFile: null,
			loading: true,
			scrollTop: {
				summary: 0,
				fileView: 0
			},
			contextMenuOpen: {
				summary: false,
				fileView: -1
			}
		};
		this.saveState();
	}

	public saveRepoStateValue<K extends keyof GG.GitRepoState>(repo: string, key: K, value: GG.GitRepoState[K]) {
		if (repo === this.currentRepo) {
			this.gitRepos[this.currentRepo][key] = value;
			this.saveRepoState();
		}
	}

	/* Commit Selection (Ctrl/Cmd + Click & Shift + Click) */

	/**
	 * Get the selected commits that are loaded, in the order they are displayed (newest first).
	 * @returns The hashes of the commits.
	 */
	private getSelectedCommitsArray(): string[] {
		return Array.from(this.selectedCommits)
			.filter((hash) => typeof this.commitLookup[hash] === 'number')
			.sort((a, b) => this.commitLookup[a] - this.commitLookup[b]);
	}

	/**
	 * Replace the selection with a single commit.
	 * @param hash The hash of the commit, or NULL to clear the selection.
	 */
	private selectOnlyCommit(hash: string | null) {
		this.selectedCommits = new Set(hash !== null ? [hash] : []);
		this.selectionAnchor = hash;
		this.onSelectionChanged();
	}

	private clearCommitSelection() {
		this.selectOnlyCommit(null);
	}

	/**
	 * Ctrl/Cmd + Click: add a commit to the selection, or remove it from the selection.
	 * @param hash The hash of the commit.
	 */
	private toggleCommitInSelection(hash: string) {
		this.adoptCommitDetailsAsSelection();
		if (this.selectedCommits.has(hash)) {
			this.selectedCommits.delete(hash);
			if (this.selectionAnchor === hash) this.selectionAnchor = null;
		} else {
			this.selectedCommits.add(hash);
			this.selectionAnchor = hash;
		}
		this.onSelectionChanged();
		this.syncCommitDetailsWithSelection();
	}

	/**
	 * Shift + Click: select the rows from the anchor of the selection (the commit last clicked without Shift) to a commit.
	 * @param hash The hash of the commit.
	 */
	private selectCommitsFromAnchorTo(hash: string) {
		this.adoptCommitDetailsAsSelection();
		const anchor = this.selectionAnchor !== null && typeof this.commitLookup[this.selectionAnchor] === 'number' ? this.selectionAnchor : hash;
		const anchorIndex = this.commitLookup[anchor], index = this.commitLookup[hash];
		this.selectedCommits = new Set(this.commits.slice(Math.min(anchorIndex, index), Math.max(anchorIndex, index) + 1).map((commit) => commit.hash));
		// The anchor stays where it is, so that further Shift + Clicks resize the range from the same commit
		this.selectionAnchor = anchor;
		this.onSelectionChanged();
		this.syncCommitDetailsWithSelection();
	}

	/**
	 * Start a selection with the commit(s) shown in the Commit Details View, when it was opened without selecting them (e.g. by the
	 * Find Widget, or restored from a previous session), so that Ctrl/Cmd + Click still compares with the commit that is open.
	 */
	private adoptCommitDetailsAsSelection() {
		if (this.selectedCommits.size > 0 || this.expandedCommit === null) return;
		const shown = [this.expandedCommit.commitHash, this.expandedCommit.compareWithHash];
		shown.forEach((hash) => {
			if (hash !== null && typeof this.commitLookup[hash] === 'number') this.selectedCommits.add(hash);
		});
		if (this.selectedCommits.has(this.expandedCommit.commitHash)) this.selectionAnchor = this.expandedCommit.commitHash;
	}

	/**
	 * Keep the Commit Details View consistent with the selection after a Ctrl/Cmd + Click or Shift + Click: two selected commits are
	 * compared, a single selected commit replaces the details of commits that are no longer selected, and otherwise the view is closed.
	 */
	private syncCommitDetailsWithSelection() {
		const selection = this.getSelectedCommitsArray(), expandedCommit = this.expandedCommit;
		if (selection.length === 2) {
			if (expandedCommit !== null && expandedCommit.compareWithHash !== null && selection.includes(expandedCommit.commitHash) && selection.includes(expandedCommit.compareWithHash)) return;
			// Like before multi-selection, the commit already open is compared with the other commit
			const primary = expandedCommit !== null && selection.includes(expandedCommit.commitHash) ? expandedCommit.commitHash : selection[1];
			const primaryElem = findCommitElemWithId(getCommitElems(), this.commitLookup[primary]);
			const otherElem = findCommitElemWithId(getCommitElems(), this.commitLookup[selection[0] === primary ? selection[1] : selection[0]]);
			if (primaryElem !== null && otherElem !== null) {
				this.loadCommitComparison(primaryElem, otherElem);
			}
		} else if (expandedCommit !== null) {
			if (selection.length === 1) {
				if (expandedCommit.commitHash === selection[0] && expandedCommit.compareWithHash === null) return;
				const elem = findCommitElemWithId(getCommitElems(), this.commitLookup[selection[0]]);
				if (elem !== null) {
					this.loadCommitDetails(elem);
					return;
				}
			}
			this.closeCommitDetails(true);
		}
	}

	/**
	 * Highlight the rows of the selected commits, and remember the selection (so that it is restored when the view is reopened).
	 */
	private onSelectionChanged() {
		this.renderCommitSelection();
		this.saveState();
	}

	private renderCommitSelection() {
		const elems = getCommitElems();
		for (let i = 0; i < elems.length; i++) {
			const commit = this.commits[parseInt(elems[i].dataset.id!)];
			elems[i].classList.toggle(CLASS_COMMIT_SELECTED, typeof commit !== 'undefined' && this.selectedCommits.has(commit.hash));
		}
	}

	/**
	 * Check if a commit is HEAD, or one of its ancestors that is reachable via the loaded commits.
	 * @param hash The hash of the commit.
	 * @returns TRUE => The commit is on the current branch.
	 */
	private isAncestorOfHead(hash: string) {
		if (this.commitHead === null) return false;
		const visited = new Set<string>(), pending = [this.commitHead];
		while (pending.length > 0) {
			const current = pending.pop()!;
			if (current === hash) return true;
			const index = this.commitLookup[current];
			if (visited.has(current) || typeof index !== 'number') continue;
			visited.add(current);
			pending.push(...this.commits[index].parents);
		}
		return false;
	}

	/**
	 * Get the selected commits if they can be squashed. Squashing moves the current branch back to the parent of the oldest commit, so the
	 * selection must be exactly HEAD and its closest first-parent ancestors, without merge commits.
	 * @returns The hashes of the commits (newest first), or NULL if they can't be squashed.
	 */
	private getSquashableSelection(): string[] | null {
		const chain: string[] = [];
		let hash: string | undefined = this.commitHead !== null ? this.commitHead : undefined;
		while (typeof hash !== 'undefined' && this.selectedCommits.has(hash) && chain.length < this.selectedCommits.size) {
			const index: number | undefined = this.commitLookup[hash];
			if (typeof index !== 'number' || this.commits[index].parents.length !== 1) return null;
			chain.push(hash);
			hash = this.commits[index].parents[0];
		}
		return chain.length >= 2 && chain.length === this.selectedCommits.size ? chain : null;
	}

	/**
	 * Get the selected commits if they can be dropped: each one must pass the topological check of the single commit Drop action.
	 * @returns The hashes of the commits (newest first), or NULL if they can't be dropped.
	 */
	private getDroppableSelection(): string[] | null {
		const selection = this.getSelectedCommitsArray();
		const droppable = selection.length > 1 && selection.length === this.selectedCommits.size && selection.every((hash) => {
			const commit = this.commits[this.commitLookup[hash]];
			return hash !== UNCOMMITTED && commit.stash === null && this.graph.dropCommitPossible(this.commitLookup[hash]);
		});
		return droppable ? selection : null;
	}

	/**
	 * Generate the HTML list of commits shown in the confirmation of an action on several commits.
	 * @param hashes The hashes of the commits.
	 * @returns The HTML.
	 */
	private getCommitListHtml(hashes: ReadonlyArray<string>) {
		return hashes.map((hash) => '<b>' + abbrevCommit(hash) + '</b> - ' + escapeHtml(this.commits[this.commitLookup[hash]].message)).join('<br>');
	}

	private showSquashCommitsDialog(commits: string[], target: DialogTarget & CommitTarget) {
		// Like the squash of an interactive rebase, the initial message combines the messages of the commits (oldest first)
		const initialMessage = commits.slice().reverse().map((hash) => this.commits[this.commitLookup[hash]].message).join('\n\n');
		dialog.showForm('Are you sure you want to squash ' + commits.length + ' commits into one?<br><br>' + this.getCommitListHtml(commits), [{
			type: DialogInputType.TextArea,
			name: 'Commit Message',
			default: initialMessage,
			placeholder: 'Enter the commit message for the squashed commit'
		}, { type: DialogInputType.Checkbox, name: 'No Verify', value: false }], 'Yes, squash commits', (values) => {
			const message = <string>values[0];
			if (message.trim() === '') {
				dialog.showError('Commit message cannot be empty.', null, null, null);
				return;
			}
			runAction({ command: 'squashCommits', repo: this.currentRepo, commits: commits, commitMessage: message, noVerify: <boolean>values[1] }, 'Squashing Commits');
			this.clearCommitSelection();
		}, target);
	}

	private showDropCommitsDialog(commits: string[], target: DialogTarget & CommitTarget) {
		const firstParentNote = this.onlyFollowFirstParent ? '<br/><br/><i>Note: By selecting First Parent in the Display dropdown, some commits may have been hidden from the Easy Graph View that could affect the outcome of performing this action.</i>' : '';
		dialog.showConfirmation('Are you sure you want to permanently drop ' + commits.length + ' commits?<br><br>' + this.getCommitListHtml(commits) + firstParentNote, 'Yes, drop', () => {
			runAction({ command: 'dropCommits', repo: this.currentRepo, commits: commits }, 'Dropping Commits');
			this.clearCommitSelection();
		}, target);
	}

	/**
	 * Show the dialog to edit the message of a commit, once its full message has been loaded.
	 * @param hash The hash of the commit.
	 * @param message The current (full) message of the commit.
	 */
	public showEditCommitMessageDialog(hash: string, message: string) {
		const commitElem = findCommitElemWithId(getCommitElems(), this.getCommitId(hash));
		if (commitElem === null) return;
		const target: DialogTarget & CommitTarget = { type: TargetType.Commit, hash: hash, elem: commitElem };

		dialog.showForm('Edit commit message for <b><i>' + abbrevCommit(hash) + '</i></b>:', [{
			type: DialogInputType.TextArea,
			name: 'Commit Message',
			default: message,
			placeholder: 'Enter the new commit message'
		}, { type: DialogInputType.Checkbox, name: 'No Verify', value: false }], 'Update Message', (values) => {
			const newMessage = <string>values[0];
			if (newMessage.trim() === '') {
				dialog.showError('Commit message cannot be empty.', null, null, null);
				return;
			}
			if (newMessage === message) return;
			runAction({ command: 'editCommitMessage', repo: this.currentRepo, commitHash: hash, message: newMessage, noVerify: <boolean>values[1] }, 'Editing Commit Message');
		}, target);
	}


	/**
	 * Add, edit or remove the notes (`git notes`) of a commit.
	 * @param hash The hash of the commit.
	 * @param target The target of the dialog.
	 */
	private editCommitNotesAction(hash: string, target: DialogTarget & CommitTarget) {
		const notes = this.commitNotes[hash];
		if (typeof notes === 'undefined') {
			// Load the current notes first, the dialog is shown when they are received
			this.pendingEditCommitNotes = { hash: hash, target: target };
			sendMessage({ command: 'loadCommitNotes', repo: this.currentRepo, commitHash: hash });
			return;
		}

		const currentNotes = notes !== null ? notes : '';
		dialog.showForm('Edit the notes of commit <b><i>' + abbrevCommit(hash) + '</i></b> (leave empty to remove the notes):', [{
			type: DialogInputType.TextArea,
			name: 'Notes',
			default: currentNotes,
			placeholder: 'Enter the notes of the commit'
		}], 'Save Notes', (values) => {
			const newNotes = <string>values[0];
			if (newNotes === currentNotes) return;
			runAction({ command: 'setCommitNotes', repo: this.currentRepo, commitHash: hash, notes: newNotes }, 'Saving Notes');
		}, target);
	}


	/* Renderers */

	private render() {
		this.renderTable();
		this.renderGraph();
	}

	private renderGraph() {
		if (typeof this.currentRepo === 'undefined') {
			// Only render the graph if a repo is loaded (or a repo is currently being loaded)
			return;
		}

		const colHeadersElem = document.getElementById('tableColHeaders');
		const cdvHeight = this.gitRepos[this.currentRepo].isCdvSummaryHidden ? 0 : this.gitRepos[this.currentRepo].cdvHeight;
		const headerHeight = colHeadersElem !== null ? colHeadersElem.clientHeight + 1 : 0;
		const expandedCommit = this.isCdvDocked() ? null : this.expandedCommit;
		const expandedCommitElem = expandedCommit !== null ? document.getElementById('cdv') : null;

		// Update the graphs grid dimensions
		this.config.graph.grid.expandY = expandedCommitElem !== null
			? expandedCommitElem.getBoundingClientRect().height
			: cdvHeight;
		this.config.graph.grid.y = this.commits.length > 0 && this.tableElem.children.length > 0
			? (this.tableElem.children[0].clientHeight - headerHeight - (expandedCommit !== null ? cdvHeight : 0)) / this.commits.length
			: this.config.graph.grid.y;
		this.config.graph.grid.offsetY = headerHeight + this.config.graph.grid.y / 2;

		this.graph.render(expandedCommit);
	}

	private renderTable() {
		const colVisibility = this.getColumnVisibility();
		const currentHash = this.commits.length > 0 && this.commits[0].hash === UNCOMMITTED ? UNCOMMITTED : this.commitHead;
		const vertexColours = this.graph.getVertexColours();
		const widthsAtVertices = this.config.referenceLabels.branchLabelsAlignedToGraph ? this.graph.getWidthsAtVertices() : [];
		const mutedCommits = this.graph.getMutedCommits(currentHash);
		const dimmedCommits = this.graph.getPathFilterDimmedCommits();
		const textFormatter = new TextFormatter(this.commits, this.gitRepos[this.currentRepo].issueLinkingConfig, {
			emoji: true,
			issueLinking: true,
			markdown: this.config.markdown
		});

		let html = '<tr id="tableColHeaders"><th id="tableHeaderGraphCol" class="tableColHeader" data-col="0">Graph</th><th class="tableColHeader" data-col="1">Description</th>' +
			(colVisibility.date ? '<th class="tableColHeader dateCol" data-col="2">Date</th>' : '') +
			(colVisibility.author ? '<th class="tableColHeader authorCol" data-col="3">Author</th>' : '') +
			(colVisibility.commit ? '<th class="tableColHeader" data-col="4">Commit</th>' : '') +
			'</tr>';

		for (let i = 0; i < this.commits.length; i++) {
			let commit = this.commits[i];

			let message = '<span class="text">' + textFormatter.format(commit.message) + '</span>';
			let date = formatShortDate(commit.date);
			let branchLabels = getBranchLabels(commit.heads, commit.remotes);
			let refBranches = '', refTags = '', j, k, refName, remoteName, refActive, refHtml, worktreePath, branchCheckedOutAtCommit: string | null = null;

			for (j = 0; j < branchLabels.heads.length; j++) {
				refName = escapeHtml(branchLabels.heads[j].name);
				refActive = branchLabels.heads[j].name === this.gitBranchHead;
				worktreePath = refActive ? undefined : this.worktreeBranches[branchLabels.heads[j].name];
				refHtml = typeof worktreePath === 'string'
					? '<span class="gitRef head worktree" data-name="' + refName + '" title="' + escapeHtml('Checked out in the worktree: ' + worktreePath) + '">' + SVG_ICONS.worktree
					: '<span class="gitRef head' + (refActive ? ' active' : '') + '" data-name="' + refName + '">' + SVG_ICONS.branch;
				refHtml += '<span class="gitRefName" data-fullref="' + refName + '">' + refName + '</span>';
				for (k = 0; k < branchLabels.heads[j].remotes.length; k++) {
					remoteName = escapeHtml(branchLabels.heads[j].remotes[k]);
					refHtml += '<span class="gitRefHeadRemote" data-remote="' + remoteName + '" data-fullref="' + escapeHtml(branchLabels.heads[j].remotes[k] + '/' + branchLabels.heads[j].name) + '">' + remoteName + '</span>';
				}
				refHtml += '</span>';
				refBranches = refActive ? refHtml + refBranches : refBranches + refHtml;
				if (refActive) branchCheckedOutAtCommit = this.gitBranchHead;
			}
			for (j = 0; j < branchLabels.remotes.length; j++) {
				refName = escapeHtml(branchLabels.remotes[j].name);
				refBranches += '<span class="gitRef remote" data-name="' + refName + '" data-remote="' + (branchLabels.remotes[j].remote !== null ? escapeHtml(branchLabels.remotes[j].remote!) : '') + '">' + SVG_ICONS.branch + '<span class="gitRefName" data-fullref="' + refName + '">' + refName + '</span></span>';
			}

			for (j = 0; j < commit.tags.length; j++) {
				refName = escapeHtml(commit.tags[j].name);
				refTags += '<span class="gitRef tag" data-name="' + refName + '" data-tagtype="' + (commit.tags[j].annotated ? 'annotated' : 'lightweight') + '">' + SVG_ICONS.tag + '<span class="gitRefName" data-fullref="' + refName + '">' + refName + '</span></span>';
			}

			if (commit.stash !== null) {
				refName = escapeHtml(commit.stash.selector);
				refBranches = '<span class="gitRef stash" data-name="' + refName + '"' + (commit.parents.length > 0 && commit.parents[0] !== commit.stash.baseHash ? ' title="' + escapeHtml('The base commit ' + abbrevCommit(commit.stash.baseHash) + ' of this stash isn\'t shown, so the stash is displayed on its nearest visible ancestor ' + abbrevCommit(commit.parents[0]) + '.') + '"' : '') + '>' + SVG_ICONS.stash + '<span class="gitRefName" data-fullref="' + refName + '">' + escapeHtml(getStashName(commit.stash.selector)) + '</span></span>' + refBranches;
			}
			if (commit.dangling === true) {
				// Not a reference, so it doesn't have the gitRef class (it has no context menu, and isn't found by Find)
				refBranches += '<span class="danglingLabel" title="' + escapeHtml(DANGLING_COMMIT_TITLE) + '">dangling</span>';
			}

			let descTitle = commit.message;
			if (commit.heads.length > 0 || commit.remotes.length > 0) descTitle += '\nBranches: ' + commit.heads.concat(commit.remotes.map((remote) => remote.name)).join(', ');
			if (commit.tags.length > 0) descTitle += '\nTags: ' + commit.tags.map((tag) => tag.name).join(', ');
			if (commit.stash !== null) descTitle += '\nStash: ' + getStashName(commit.stash.selector);
			if (commit.dangling === true) descTitle += '\n' + DANGLING_COMMIT_TITLE;
			const descTd = '<td title="' + escapeHtml(descTitle) + '">';

			const commitDot = commit.hash === this.commitHead
				? '<span class="commitHeadDot" title="' + (branchCheckedOutAtCommit !== null
					? 'The branch ' + escapeHtml('"' + branchCheckedOutAtCommit + '"') + ' is currently checked out at this commit'
					: 'This commit is currently checked out'
				) + '."></span>'
				: '';

			html += '<tr class="commit' + (commit.hash === currentHash ? ' current' : '') + (mutedCommits[i] ? ' mute' : '') + (commit.dangling === true ? ' dangling' : '') + (dimmedCommits[i] ? ' pathDimmed' : '') + '"' + (commit.hash !== UNCOMMITTED ? '' : ' id="uncommittedChanges"') + ' data-id="' + i + '" data-color="' + vertexColours[i] + '">' +
				(this.config.referenceLabels.branchLabelsAlignedToGraph ? '<td>' + getResizeColHtml(0) + (refBranches !== '' ? '<span style="margin-left:' + (widthsAtVertices[i] - 4) + 'px"' + refBranches.substring(5) : '') + '</td>' + descTd + getResizeColHtml(1) + '<span class="description">' + commitDot : '<td>' + getResizeColHtml(0) + '</td>' + descTd + getResizeColHtml(1) + '<span class="description">' + commitDot + refBranches) + (this.config.referenceLabels.tagLabelsOnRight ? message + refTags : refTags + message) + '</span></td>' +
				(colVisibility.date ? '<td class="dateCol text" title="' + date.title + '">' + getResizeColHtml(2) + date.formatted + '</td>' : '') +
				(colVisibility.author ? '<td class="authorCol text" title="' + escapeHtml(commit.author + ' <' + commit.email + '>') + '">' + getResizeColHtml(3) + (this.config.fetchAvatars ? '<span class="avatar" data-email="' + escapeHtml(commit.email) + '">' + (typeof this.avatars[commit.email] === 'string' ? '<img class="avatarImg" src="' + this.avatars[commit.email] + '">' : '') + '</span>' : '') + escapeHtml(commit.author) + '</td>' : '') +
				(colVisibility.commit ? '<td class="text" title="' + escapeHtml(commit.hash) + '">' + getResizeColHtml(4) + abbrevCommit(commit.hash) + '</td>' : '') +
				'</tr>';


		}
		function getResizeColHtml(col: number) {
			return (col > 0 ? '<span class="resizeCol left" data-col="' + (col - 1) + '"></span>' : '') + (col < 4 ? '<span class="resizeCol right" data-col="' + col + '"></span>' : '');
		}
		this.tableElem.innerHTML = '<table>' + html + '</table>';
		this.footerElem.innerHTML = this.moreCommitsAvailable ? '<div id="loadMoreCommitsBtn" class="roundedBtn">Load More Commits</div>' : '';
		this.makeTableResizable();
		this.findWidget.refresh();
		this.renderedGitBranchHead = this.gitBranchHead;
		this.renderedWorktreeBranches = JSON.stringify(this.worktreeBranches);
		this.renderCodeReviewMarkers();

		if (this.moreCommitsAvailable) {
			document.getElementById('loadMoreCommitsBtn')!.addEventListener('click', () => {
				this.loadMoreCommits();
			});
		}

		if (this.expandedCommit !== null) {
			const expandedCommit = this.expandedCommit, elems = getCommitElems();
			const commitElem = findCommitElemWithId(elems, this.getCommitId(expandedCommit.commitHash));
			const compareWithElem = expandedCommit.compareWithHash !== null ? findCommitElemWithId(elems, this.getCommitId(expandedCommit.compareWithHash)) : null;

			if (commitElem === null || (expandedCommit.compareWithHash !== null && compareWithElem === null)) {
				this.closeCommitDetails(false);
				this.saveState();
			} else {
				expandedCommit.index = parseInt(commitElem.dataset.id!);
				expandedCommit.commitElem = commitElem;
				expandedCommit.compareWithElem = compareWithElem;
				this.saveState();
				if (expandedCommit.compareWithHash === null) {
					// Commit Details View is open
					if (!expandedCommit.loading && expandedCommit.commitDetails !== null && expandedCommit.fileTree !== null) {
						this.showCommitDetails(expandedCommit.commitDetails, expandedCommit.fileTree, expandedCommit.avatar, expandedCommit.codeReview, expandedCommit.lastViewedFile, true);
						if (expandedCommit.commitHash === UNCOMMITTED) {
							this.requestCommitDetails(expandedCommit.commitHash, true);
						}
					} else {
						this.loadCommitDetails(commitElem);
					}
				} else {
					// Commit Comparison is open
					if (!expandedCommit.loading && expandedCommit.fileChanges !== null && expandedCommit.fileTree !== null) {
						this.showCommitComparison(expandedCommit.commitHash, expandedCommit.compareWithHash, expandedCommit.fileChanges, expandedCommit.fileTree, expandedCommit.codeReview, expandedCommit.lastViewedFile, true);
						if (expandedCommit.commitHash === UNCOMMITTED || expandedCommit.compareWithHash === UNCOMMITTED) {
							this.requestCommitComparison(expandedCommit.commitHash, expandedCommit.compareWithHash, true);
						}
					} else {
						this.loadCommitComparison(commitElem, compareWithElem!);
					}
				}
			}
		}

		this.renderCommitSelection();

		if (this.config.stickyHeader) {
			this.tableColHeadersElem = document.getElementById('tableColHeaders');
			this.alignTableHeaderToControls();
		}
	}

	private renderUncommittedChanges() {
		const colVisibility = this.getColumnVisibility(), date = formatShortDate(this.commits[0].date);
		document.getElementById('uncommittedChanges')!.innerHTML = '<td></td><td><b>' + escapeHtml(this.commits[0].message) + '</b></td>' +
			(colVisibility.date ? '<td class="dateCol text" title="' + date.title + '">' + date.formatted + '</td>' : '') +
			(colVisibility.author ? '<td class="authorCol text" title="* <>">*</td>' : '') +
			(colVisibility.commit ? '<td class="text" title="*">*</td>' : '');
	}

	private renderFetchButton() {
		alterClass(this.controlsElem, CLASS_FETCH_SUPPORTED, this.gitRemotes.length > 0);
	}

	public renderRefreshButton() {
		const enabled = !this.currentRepoRefreshState.inProgress;
		this.refreshBtnElem.title = enabled ? 'Refresh' : 'Refreshing';
		this.refreshBtnElem.innerHTML = enabled ? SVG_ICONS.refresh : SVG_ICONS.loading;
		alterClass(this.refreshBtnElem, CLASS_REFRESHING, !enabled);
	}

	public renderTagDetails(tagName: string, commitHash: string, details: GG.GitTagDetails) {
		const textFormatter = new TextFormatter(this.commits, this.gitRepos[this.currentRepo].issueLinkingConfig, {
			commits: true,
			emoji: true,
			issueLinking: true,
			markdown: this.config.markdown,
			multiline: true,
			urls: true
		});
		dialog.showMessage(
			'Tag <b><i>' + escapeHtml(tagName) + '</i></b><br><span class="messageContent">' +
			'<b>Object: </b>' + escapeHtml(details.hash) + '<br>' +
			'<b>Commit: </b>' + escapeHtml(commitHash) + '<br>' +
			'<b>Tagger: </b>' + escapeHtml(details.taggerName) + ' &lt;<a class="' + CLASS_EXTERNAL_URL + '" href="mailto:' + escapeHtml(details.taggerEmail) + '" tabindex="-1">' + escapeHtml(details.taggerEmail) + '</a>&gt;' + (details.signature !== null ? generateSignatureHtml(details.signature) : '') + '<br>' +
			'<b>Date: </b>' + formatLongDate(details.taggerDate) + '<br><br>' +
			textFormatter.format(details.message) +
			'</span>'
		);
	}

	public renderRepoDropdownOptions(repo?: string) {
		this.repoDropdown.setOptions(getRepoDropdownOptions(this.gitRepos), [repo || this.currentRepo]);
	}


	/* Context Menu Generation */

	private getBranchContextMenuActions(target: DialogTarget & RefTarget): ContextMenuActions {
		const refName = target.ref, visibility = this.config.contextMenuActionsVisibility.branch;
		const isSelectedInBranchesDropdown = this.branchDropdown.isSelected(refName);

		return [[
			{
				title: 'Checkout Branch',
				visible: visibility.checkout && this.gitBranchHead !== refName,
				onClick: () => this.checkoutBranchAction(refName, null, null, target)
			}, {
				title: 'Rename Branch' + ELLIPSIS,
				visible: visibility.rename,
				onClick: () => {
					dialog.showRefInput('Enter the new name for branch <b><i>' + escapeHtml(refName) + '</i></b>:', refName, 'Rename Branch', (newName) => {
						runAction({ command: 'renameBranch', repo: this.currentRepo, oldName: refName, newName: newName }, 'Renaming Branch');
					}, target);
				}
			}, {
				title: 'Create Branch' + ELLIPSIS,
				visible: visibility.createBranch,
				// Like on a commit, "Check out" defaults to the "easy-graph.dialog.createBranch.checkOut" Extension Setting
				onClick: () => this.createBranchAction(target.hash, '', this.config.dialogDefaults.createBranch.checkout, target)
			}, {
				title: 'Delete Branch' + ELLIPSIS,
				visible: visibility.delete && this.gitBranchHead !== refName,
				onClick: () => {
					let remotesWithBranch = this.gitRemotes.filter(remote => this.gitBranches.includes('remotes/' + remote + '/' + refName));
					let inputs: DialogInput[] = [{ type: DialogInputType.Checkbox, name: 'Force Delete', value: this.config.dialogDefaults.deleteBranch.forceDelete }];
					if (remotesWithBranch.length > 0) {
						inputs.push({
							type: DialogInputType.Checkbox,
							name: 'Delete this branch on the remote' + (this.gitRemotes.length > 1 ? 's' : ''),
							value: this.config.dialogDefaults.deleteBranch.deleteOnRemote,
							info: 'This branch is on the remote' + (remotesWithBranch.length > 1 ? 's: ' : ' ') + formatCommaSeparatedList(remotesWithBranch.map((remote) => '"' + remote + '"'))
						});
					}
					dialog.showForm('Are you sure you want to delete the branch <b><i>' + escapeHtml(refName) + '</i></b>?', inputs, 'Yes, delete', (values) => {
						runAction({ command: 'deleteBranch', repo: this.currentRepo, branchName: refName, forceDelete: <boolean>values[0], deleteOnRemotes: remotesWithBranch.length > 0 && <boolean>values[1] ? remotesWithBranch : [] }, 'Deleting Branch');
					}, target);
				}
			}, {
				title: 'Delete Multiple Branches' + ELLIPSIS,
				visible: visibility.deleteMultiple,
				onClick: () => this.deleteBranchesAction(refName, target)
			}, {
				title: 'Merge into current branch' + ELLIPSIS,
				visible: visibility.merge && this.gitBranchHead !== refName,
				onClick: () => this.mergeAction(refName, refName, GG.MergeActionOn.Branch, target)
			}, {
				title: 'Rebase current Branch on Branch' + ELLIPSIS,
				visible: visibility.rebase && this.gitBranchHead !== refName,
				onClick: () => this.rebaseAction(refName, refName, GG.RebaseActionOn.Branch, target)
			}, {
				title: 'Push Branch' + ELLIPSIS,
				visible: visibility.push && this.gitRemotes.length > 0,
				onClick: () => {
					const multipleRemotes = this.gitRemotes.length > 1;
					const inputs: DialogInput[] = [
						{ type: DialogInputType.Checkbox, name: 'Set Upstream', value: this.gitBuiltin.pushSetUpstream },
						getNoVerifyInput('Skip the pre-push hook (--no-verify).'),
						{
							type: DialogInputType.Radio,
							name: 'Push Mode',
							options: [
								{ name: 'Normal', value: GG.GitPushBranchMode.Normal },
								{ name: 'Force With Lease', value: GG.GitPushBranchMode.ForceWithLease },
								{ name: 'Force', value: GG.GitPushBranchMode.Force }
							],
							default: this.config.dialogDefaults.pushBranch.mode
						}
					];

					if (multipleRemotes) {
						inputs.unshift({
							type: DialogInputType.Select,
							name: 'Push to Remote(s)',
							defaults: [this.getPushRemote(refName)],
							options: this.gitRemotes.map((remote) => ({ name: remote, value: remote })),
							multiple: true
						});
					}

					dialog.showForm('Are you sure you want to push the branch <b><i>' + escapeHtml(refName) + '</i></b>' + (multipleRemotes ? '' : ' to the remote <b><i>' + escapeHtml(this.gitRemotes[0]) + '</i></b>') + '?', inputs, 'Yes, push', (values) => {
						const remotes = multipleRemotes ? <string[]>values.shift() : [this.gitRemotes[0]];
						const setUpstream = <boolean>values[0];
						const noVerify = <boolean>values[1];
						runAction({
							command: 'pushBranch',
							repo: this.currentRepo,
							branchName: refName,
							remotes: remotes,
							setUpstream: setUpstream,
							mode: <GG.GitPushBranchMode>values[2],
							noVerify: noVerify,
							willUpdateBranchConfig: setUpstream && remotes.length > 0 && (this.gitConfig === null || typeof this.gitConfig.branches[refName] === 'undefined' || this.gitConfig.branches[refName].remote !== remotes[remotes.length - 1])
						}, 'Pushing Branch');
					}, target);
				}
			}, {
				title: 'Pull Branch' + ELLIPSIS,
				visible: visibility.pull && this.gitRemotes.length > 0,
				onClick: () => this.updateBranchFromUpstreamAction(refName, target)
			}
		], [
			this.getViewIssueAction(refName, visibility.viewIssue, target),
			{
				title: 'Create Pull Request' + ELLIPSIS,
				visible: visibility.createPullRequest && this.gitRepos[this.currentRepo].pullRequestConfig !== null,
				onClick: () => {
					const config = this.gitRepos[this.currentRepo].pullRequestConfig;
					if (config === null) return;
					dialog.showCheckbox('Are you sure you want to create a Pull Request for branch <b><i>' + escapeHtml(refName) + '</i></b>?', 'Push branch before creating the Pull Request', true, 'Yes, create Pull Request', (push) => {
						runAction({ command: 'createPullRequest', repo: this.currentRepo, config: config, sourceRemote: config.sourceRemote, sourceOwner: config.sourceOwner, sourceRepo: config.sourceRepo, sourceBranch: refName, push: push }, 'Creating Pull Request');
					}, target);
				}
			}
		], [
			{
				title: 'Create Archive',
				visible: visibility.createArchive,
				onClick: () => {
					runAction({ command: 'createArchive', repo: this.currentRepo, ref: refName }, 'Creating Archive');
				}
			},
			{
				title: 'Select in Branches Dropdown',
				visible: visibility.selectInBranchesDropdown && (!isSelectedInBranchesDropdown || this.branchDropdown.isShowAllSelected()),
				onClick: (e) => this.branchDropdown.selectOption(refName, e)
			},
			{
				title: 'Unselect in Branches Dropdown',
				visible: visibility.unselectInBranchesDropdown && isSelectedInBranchesDropdown,
				onClick: () => this.branchDropdown.unselectOption(refName)
			},
			{
				title: 'Hide Branch',
				visible: visibility.hide && this.gitBranchHead !== refName,
				onClick: () => this.hideBranch(refName)
			}
		], [
			{
				title: 'Copy Branch Name to Clipboard',
				visible: visibility.copyName,
				onClick: () => {
					sendMessage({ command: 'copyToClipboard', type: 'Branch Name', data: refName });
				}
			}
		]];
	}

	private deleteBranchesAction(refName: string, target: DialogTarget & RefTarget) {
		const branches = this.gitBranches.filter((branch) => !branch.startsWith('remotes/') && branch !== this.gitBranchHead);
		const inputs: DialogInput[] = [
			{ type: DialogInputType.Select, name: 'Branches', options: branches.map((branch) => ({ name: branch, value: branch })), defaults: branches.includes(refName) ? [refName] : [], multiple: true },
			{ type: DialogInputType.Checkbox, name: 'Force Delete', value: this.config.dialogDefaults.deleteBranch.forceDelete },
			{ type: DialogInputType.Checkbox, name: 'Delete on Remotes', value: this.config.dialogDefaults.deleteBranch.deleteOnRemote, info: 'Also delete the branches with the same name on the remotes.' }
		];
		dialog.showForm('Select the local branches to delete:', inputs, 'Yes, delete', (values) => {
			const branchNames = <string[]>values[0];
			if (branchNames.length === 0) return;
			const deleteOnRemotes: { [branchName: string]: string[] } = {};
			if (<boolean>values[2]) {
				branchNames.forEach((branch) => {
					deleteOnRemotes[branch] = this.gitRemotes.filter((remote) => this.gitBranches.includes('remotes/' + remote + '/' + branch));
				});
			}
			runAction({ command: 'deleteBranches', repo: this.currentRepo, branchNames: branchNames, forceDelete: <boolean>values[1], deleteOnRemotes: deleteOnRemotes }, 'Deleting Branches');
		}, target);
	}

	private getMultiSelectCommitContextMenuActions(target: DialogTarget & CommitTarget): ContextMenuActions {
		const visibility = this.config.contextMenuActionsVisibility.commit;
		const multiSelectActions: ContextMenuAction[] = [];

		const squashable = this.getSquashableSelection();
		if (squashable !== null) {
			multiSelectActions.push({
				title: 'Squash Selected Commits' + ELLIPSIS,
				visible: visibility.squash,
				onClick: () => this.showSquashCommitsDialog(squashable, target)
			});
		}

		// Cherry pick / revert the selected commits (merge commits need a parent to be chosen, so they are only supported individually)
		const selectedCommits = this.getSelectedCommitsArray();
		if (selectedCommits.every((hash) => typeof this.commitLookup[hash] === 'number' && this.commits[this.commitLookup[hash]].parents.length === 1)) {
			const commitsList = selectedCommits.map((hash) => '<b>' + abbrevCommit(hash) + '</b> - ' + escapeHtml(this.commits[this.commitLookup[hash]].message)).join('<br>');
			multiSelectActions.push({
				title: 'Cherry Pick Selected Commits' + ELLIPSIS,
				visible: visibility.cherrypick,
				onClick: () => {
					dialog.showForm('Are you sure you want to cherry pick these ' + selectedCommits.length + ' commits onto ' + (this.gitBranchHead !== null ? '<b><i>' + escapeHtml(this.gitBranchHead) + '</i></b>' : 'the current branch') + ' (oldest first)?<br><br>' + commitsList, [{
						type: DialogInputType.Checkbox,
						name: 'Allow Empty',
						value: false,
						info: 'Create a commit even if it has no changes, because it is empty or its changes are already on the current branch (--keep-redundant-commits), instead of stopping the cherry pick at it.'
					}], 'Yes, cherry pick', (values) => {
						runAction({ command: 'cherrypickCommits', repo: this.currentRepo, commitHashes: selectedCommits, allowEmpty: values[0] === true }, 'Cherry picking Commits');
						this.clearCommitSelection();
					}, target);
				}
			}, {
				title: 'Revert Selected Commits' + ELLIPSIS,
				visible: visibility.revert,
				onClick: () => {
					dialog.showConfirmation('Are you sure you want to revert these ' + selectedCommits.length + ' commits (newest first)?<br><br>' + commitsList, 'Yes, revert', () => {
						runAction({ command: 'revertCommits', repo: this.currentRepo, commitHashes: selectedCommits }, 'Reverting Commits');
						this.clearCommitSelection();
					}, target);
				}
			});
		}

		const droppable = this.getDroppableSelection();
		if (droppable !== null) {
			multiSelectActions.push({
				title: 'Drop Selected Commits' + ELLIPSIS,
				visible: visibility.drop,
				onClick: () => this.showDropCommitsDialog(droppable, target)
			});
		}

		const otherActions: ContextMenuAction[] = [];
		if (selectedCommits.length === 2 && selectedCommits.every((hash) => hash !== UNCOMMITTED)) {
			// selectedCommits is ordered newest to oldest (as displayed)
			otherActions.push({
				title: 'Select Merge Base',
				visible: visibility.selectMergeBase,
				onClick: () => sendMessage({ command: 'getMergeBase', repo: this.currentRepo, commitHashes: selectedCommits })
			}, {
				title: 'Copy Commit Subjects Between to Clipboard',
				visible: visibility.copySubjectsBetween,
				onClick: () => sendMessage({ command: 'copyCommitSubjectsBetween', repo: this.currentRepo, fromHash: selectedCommits[1], toHash: selectedCommits[0] })
			}, {
				title: 'View All Changes',
				visible: visibility.viewAllChanges,
				onClick: () => runAction({ command: 'viewAllChanges', repo: this.currentRepo, fromHash: selectedCommits[1], toHash: selectedCommits[0], hasParents: true }, 'Opening All Changes')
			});
		}
		if (selectedCommits.every((hash) => hash !== UNCOMMITTED && typeof this.commitLookup[hash] === 'number' && this.commits[this.commitLookup[hash]].stash === null)) {
			otherActions.push({
				title: 'Save Selected Commits as Patch' + ELLIPSIS,
				visible: visibility.savePatch,
				onClick: () => runAction({ command: 'savePatch', repo: this.currentRepo, commitHashes: selectedCommits }, 'Saving Patch')
			});
		}

		return [multiSelectActions, otherActions].filter((actions) => actions.length > 0);
	}

	public selectMergeBase(mergeBase: string | null, error: GG.ErrorInfo) {
		if (mergeBase === null) {
			dialog.showError('Unable to Select Merge Base', error, null, null);
		} else if (typeof this.commitLookup[mergeBase] === 'number') {
			this.clearCommitSelection();
			this.scrollToCommit(mergeBase, true, true);
			const commitElem = findCommitElemWithId(getCommitElems(), this.getCommitId(mergeBase));
			if (commitElem !== null) {
				this.loadCommitDetails(commitElem);
			}
		} else {
			this.clearCommitSelection();
			this.scrollToCommitLoadingMoreIfNeeded(mergeBase);
		}
	}

	/**
	 * Get the context menu actions comparing a merge commit with each of its parents.
	 * @param commit The merge commit.
	 * @returns One action for each parent that is loaded (none if the commit isn't a merge).
	 */
	private getViewChangesFromParentActions(commit: GG.GitCommit): ContextMenuAction[] {
		return getComparableMergeParents(commit.parents, this.commitLookup).map((parent) => ({
			title: 'View Changes from Parent ' + parent.number + ' (' + abbrevCommit(parent.hash) + ')',
			visible: true,
			onClick: () => {
				// The rows may have been rendered again (e.g. by a refresh) while the context menu was open, so they are looked up now
				const commitElems = getCommitElems();
				const findRow = (hash: string) => typeof this.commitLookup[hash] === 'number' ? findCommitElemWithId(commitElems, this.commitLookup[hash]) : null;
				const mergeElem = findRow(commit.hash), parentElem = findRow(parent.hash);
				if (mergeElem !== null && parentElem !== null) this.loadCommitComparison(mergeElem, parentElem);
			}
		}));
	}

	private getCommitContextMenuActions(target: DialogTarget & CommitTarget): ContextMenuActions {
		const hash = target.hash, visibility = this.config.contextMenuActionsVisibility.commit;
		const commit = this.commits[this.commitLookup[hash]];
		let actions: ContextMenuActions = [];

		return [...actions, [
			{
				title: 'Add Tag' + ELLIPSIS,
				visible: visibility.addTag,
				onClick: () => this.addTagAction(hash, '', this.config.dialogDefaults.addTag.type, '', null, target)
			}, {
				title: 'Create Branch' + ELLIPSIS,
				visible: visibility.createBranch,
				onClick: () => this.createBranchAction(hash, '', this.config.dialogDefaults.createBranch.checkout, target)
			}
		], [
			{
				title: 'Compare with Working Tree',
				visible: visibility.compareWithWorkingTree,
				onClick: () => this.compareWithWorkingTreeAction(hash, target.elem)
			}, {
				title: 'Checkout' + (globalState.alwaysAcceptCheckoutCommit ? '' : ELLIPSIS),
				visible: visibility.checkout,
				onClick: () => {
					const checkoutCommit = () => runAction({ command: 'checkoutCommit', repo: this.currentRepo, commitHash: hash }, 'Checking out Commit');
					if (globalState.alwaysAcceptCheckoutCommit) {
						checkoutCommit();
					} else {
						dialog.showCheckbox('Are you sure you want to checkout commit <b><i>' + abbrevCommit(hash) + '</i></b>? This will result in a \'detached HEAD\' state.', 'Always Accept', false, 'Yes, checkout', (alwaysAccept) => {
							if (alwaysAccept) {
								updateGlobalViewState('alwaysAcceptCheckoutCommit', true);
							}
							checkoutCommit();
						}, target);
					}
				}
			}, {
				title: 'Cherry Pick' + ELLIPSIS,
				visible: visibility.cherrypick,
				onClick: () => {
					const isMerge = commit.parents.length > 1;
					let inputs: DialogInput[] = [];
					if (isMerge) {
						let options = commit.parents.map((hash, index) => ({
							name: abbrevCommit(hash) + (typeof this.commitLookup[hash] === 'number' ? ': ' + this.commits[this.commitLookup[hash]].message : ''),
							value: (index + 1).toString()
						}));
						inputs.push({
							type: DialogInputType.Select,
							name: 'Parent Hash',
							options: options,
							default: '1',
							info: 'Choose the parent hash on the main branch, to cherry pick the commit relative to.'
						});
					}
					inputs.push({
						type: DialogInputType.Checkbox,
						name: 'Record Origin',
						value: this.config.dialogDefaults.cherryPick.recordOrigin,
						info: 'Record that this commit was the origin of the cherry pick by appending a line to the original commit message that states "(cherry picked from commit ...​)".'
					}, {
						type: DialogInputType.Checkbox,
						name: 'No Commit',
						value: this.config.dialogDefaults.cherryPick.noCommit,
						info: 'Cherry picked changes will be staged but not committed, so that you can select and commit specific parts of this commit.'
					}, {
						type: DialogInputType.Checkbox,
						name: 'Allow Empty',
						value: false,
						info: 'Create the commit even if it has no changes, because it is empty or its changes are already on the current branch (--keep-redundant-commits). Ignored when "No Commit" is selected, as nothing is committed.'
					});

					dialog.showForm('Are you sure you want to cherry pick commit <b><i>' + abbrevCommit(hash) + '</i></b>?', inputs, 'Yes, cherry pick', (values) => {
						let parentIndex = isMerge ? parseInt(<string>values.shift()) : 0;
						runAction({
							command: 'cherrypickCommit',
							repo: this.currentRepo,
							commitHash: hash,
							parentIndex: parentIndex,
							recordOrigin: <boolean>values[0],
							noCommit: <boolean>values[1],
							allowEmpty: values[2] === true
						}, 'Cherry picking Commit');
					}, target);
				}
			}, {
				title: 'Revert' + ELLIPSIS,
				visible: visibility.revert,
				onClick: () => {
					const revertNoCommitInput: DialogInput = { type: DialogInputType.Checkbox, name: 'No Commit', value: false, info: 'The reverted changes will be staged but not committed (--no-commit).' };
					if (commit.parents.length > 1) {
						let options = commit.parents.map((hash, index) => ({
							name: abbrevCommit(hash) + (typeof this.commitLookup[hash] === 'number' ? ': ' + this.commits[this.commitLookup[hash]].message : ''),
							value: (index + 1).toString()
						}));
						dialog.showForm('Are you sure you want to revert merge commit <b><i>' + abbrevCommit(hash) + '</i></b>?', [
							{ type: DialogInputType.Select, name: 'Parent', options: options, default: '1', info: 'Choose the parent hash on the main branch, to revert the commit relative to.' },
							revertNoCommitInput
						], 'Yes, revert', (values) => {
							runAction({ command: 'revertCommit', repo: this.currentRepo, commitHash: hash, parentIndex: parseInt(<string>values[0]), noCommit: <boolean>values[1] }, 'Reverting Commit');
						}, target);
					} else {
						dialog.showForm('Are you sure you want to revert commit <b><i>' + abbrevCommit(hash) + '</i></b>?', [revertNoCommitInput], 'Yes, revert', (values) => {
							runAction({ command: 'revertCommit', repo: this.currentRepo, commitHash: hash, parentIndex: 0, noCommit: <boolean>values[0] }, 'Reverting Commit');
						}, target);
					}
				}
			}, {
				title: 'Edit Message' + ELLIPSIS,
				visible: visibility.editMessage && (hash === this.commitHead || (commit.parents.length === 1 && this.isAncestorOfHead(hash))),
				onClick: () => sendMessage({ command: 'getCommitMessage', repo: this.currentRepo, commitHash: hash, purpose: 'edit' })
			}, {
				title: 'Create Fixup Commit' + ELLIPSIS,
				visible: visibility.createFixup && this.isAncestorOfHead(hash),
				onClick: () => {
					dialog.showForm('Create a commit of the <b>staged changes</b> that fixes up commit <b><i>' + abbrevCommit(hash) + '</i></b>? Use a rebase with "Autosquash" to combine them.', [
						{ type: DialogInputType.Radio, name: 'Type', options: [{ name: 'Fixup (keep the message of the commit)', value: 'fixup' }, { name: 'Squash (also combine the commit messages)', value: 'squash' }], default: 'fixup' }
					], 'Yes, create', (values) => {
						runAction({ command: 'createFixupCommit', repo: this.currentRepo, commitHash: hash, squash: values[0] === 'squash' }, 'Creating Fixup Commit');
					}, target);
				}
			}, {
				title: 'Reset Last Commit' + ELLIPSIS,
				visible: visibility.undo && hash === this.commitHead && commit.parents.length > 0,
				onClick: () => {
					dialog.showConfirmation('Are you sure you want to reset the last commit? This will keep all changes from the commit as uncommitted changes.', 'Yes, reset the last commit', () => {
						runAction({ command: 'undoLastCommit', repo: this.currentRepo }, 'Resetting Last Commit');
					}, target);
				}
			}, {
				title: 'Drop' + ELLIPSIS,
				visible: visibility.drop && this.graph.dropCommitPossible(this.commitLookup[hash]),
				onClick: () => {
					dialog.showConfirmation('Are you sure you want to permanently drop commit <b><i>' + abbrevCommit(hash) + '</i></b>?' + (this.onlyFollowFirstParent ? '<br/><i>Note: By selecting First Parent in the Display dropdown, some commits may have been hidden from the Easy Graph View that could affect the outcome of performing this action.</i>' : ''), 'Yes, drop', () => {
						runAction({ command: 'dropCommit', repo: this.currentRepo, commitHash: hash }, 'Dropping Commit');
					}, target);
				}
			}
		], [
			{
				title: 'Merge into current branch' + ELLIPSIS,
				visible: visibility.merge,
				onClick: () => this.mergeAction(hash, abbrevCommit(hash), GG.MergeActionOn.Commit, target)
			}, {
				title: 'Rebase' + ELLIPSIS,
				visible: visibility.rebase,
				onClick: () => this.rebaseAction(hash, abbrevCommit(hash), GG.RebaseActionOn.Commit, target)
			}, {
				title: 'Rebase Commits After This onto' + ELLIPSIS,
				visible: visibility.rebaseOnto && hash !== this.commitHead && this.isCommitAncestorOfHead(hash),
				onClick: () => this.rebaseOntoAction(hash, target)
			}, {
				title: 'Reset current branch to this Commit' + ELLIPSIS,
				visible: visibility.reset,
				onClick: () => {
					dialog.showSelect('Are you sure you want to reset ' + (this.gitBranchHead !== null ? '<b><i>' + escapeHtml(this.gitBranchHead) + '</i></b> (the current branch)' : 'the current branch') + ' to commit <b><i>' + abbrevCommit(hash) + '</i></b>?', this.config.dialogDefaults.resetCommit.mode, [
						{ name: 'Soft - Keep all changes, but reset head', value: GG.GitResetMode.Soft },
						{ name: 'Mixed - Keep working tree, but reset index', value: GG.GitResetMode.Mixed },
						{ name: 'Hard - Discard all changes', value: GG.GitResetMode.Hard }
					], 'Yes, reset', (mode) => {
						runAction({ command: 'resetToCommit', repo: this.currentRepo, commit: hash, resetMode: <GG.GitResetMode>mode }, 'Resetting to Commit');
					}, target);
				}
			}, {
				title: 'Push to This Commit' + ELLIPSIS,
				visible: visibility.pushToCommit && this.gitBranchHead !== null && this.getRemoteForBranch(this.gitBranchHead) !== null && this.isCommitAncestorOfHead(hash),
				onClick: () => this.pushToCommitAction(hash, target)
			}
		], [
			{
				title: 'Save Patch As' + ELLIPSIS,
				visible: visibility.savePatch,
				onClick: () => runAction({ command: 'savePatch', repo: this.currentRepo, commitHashes: [hash] }, 'Saving Patch')
			}, {
				// Also available here, as the uncommitted changes (and their context menu) are only shown when there are some
				title: 'Apply Patch' + ELLIPSIS,
				visible: visibility.applyPatch && hash === this.commitHead,
				onClick: () => this.applyPatchAction(target)
			}
		], [
			{
				title: 'View Patch',
				visible: visibility.viewPatch,
				onClick: () => runAction({ command: 'viewCommitPatch', repo: this.currentRepo, commitHash: hash }, 'Opening Patch')
			}, {
				title: 'View All Changes',
				visible: visibility.viewAllChanges,
				onClick: () => runAction({ command: 'viewAllChanges', repo: this.currentRepo, fromHash: hash, toHash: hash, hasParents: commit.parents.length > 0 }, 'Opening All Changes')
			}, {
				title: 'Browse Files at this Commit' + ELLIPSIS,
				visible: visibility.browseFiles,
				onClick: () => runAction({ command: 'browseFilesAtCommit', repo: this.currentRepo, commitHash: hash }, 'Loading Files')
			}, {
				title: 'Edit Notes' + ELLIPSIS,
				visible: visibility.editNotes,
				onClick: () => this.editCommitNotesAction(hash, target)
			}
		],
		visibility.viewChangesFromParent ? this.getViewChangesFromParentActions(commit) : [], [
			{
				title: 'Copy Commit Hash to Clipboard',
				visible: visibility.copyHash,
				onClick: () => {
					sendMessage({ command: 'copyToClipboard', type: 'Commit Hash', data: hash });
				}
			},
			{
				title: 'Copy Short Commit Hash to Clipboard',
				visible: visibility.copyHash,
				onClick: () => {
					sendMessage({ command: 'copyToClipboard', type: 'Short Commit Hash', data: abbrevCommit(hash) });
				}
			},
			{
				title: 'Copy Commit Link to Clipboard',
				visible: visibility.copyHash,
				onClick: () => {
					sendMessage({ command: 'copyCommitLink', repo: this.currentRepo, commitHash: hash });
				}
			},
			{
				title: 'Copy Commit Subject to Clipboard',
				visible: visibility.copySubject,
				onClick: () => {
					sendMessage({ command: 'copyToClipboard', type: 'Commit Subject', data: commit.message });
				}
			},
			{
				title: 'Copy Commit Message to Clipboard',
				visible: visibility.copySubject,
				onClick: () => {
					sendMessage({ command: 'getCommitMessage', repo: this.currentRepo, commitHash: hash, purpose: 'copy' });
				}
			},
			{
				title: 'Copy Commit Patch to Clipboard',
				visible: visibility.copyPatch,
				onClick: () => {
					sendMessage({ command: 'copyCommitPatch', repo: this.currentRepo, commitHash: hash });
				}
			}
		]];
	}

	/**
	 * Check whether a commit is HEAD or an ancestor of HEAD (within the loaded commits).
	 * @param hash The hash of the commit.
	 * @returns TRUE => The commit is HEAD or an ancestor of HEAD.
	 */
	private isCommitAncestorOfHead(hash: string) {
		if (this.commitHead === null || typeof this.commitLookup[this.commitHead] !== 'number') return false;
		const visited = new Set<string>(), queue = [this.commitHead];
		while (queue.length > 0) {
			const current = queue.pop()!;
			if (current === hash) return true;
			if (visited.has(current)) continue;
			visited.add(current);
			const index = this.commitLookup[current];
			if (typeof index === 'number') queue.push(...this.commits[index].parents);
		}
		return false;
	}

	private applyPatchAction(target: DialogTarget & CommitTarget) {
		dialog.showForm('How do you want to apply a patch file? The file is selected next.', [
			{
				type: DialogInputType.Radio, name: 'Mode', options: [
					{ name: 'Create commits from the patch (git am, e.g. for files created by "Save Patch As...")', value: 'am' },
					{ name: 'Apply to the working tree (git apply)', value: 'apply' },
					{ name: 'Apply to the working tree and stage the changes (git apply --index)', value: 'applyIndex' }
				], default: 'am'
			},
			{ type: DialogInputType.Checkbox, name: '3-way Merge', value: false, info: 'If the patch doesn\'t apply cleanly, fall back to a 3-way merge (--3way), leaving conflicts to be resolved.' }
		], 'Select Patch File', (values) => {
			runAction({ command: 'applyPatch', repo: this.currentRepo, mode: <GG.ApplyPatchMode>values[0], threeWay: <boolean>values[1] }, 'Applying Patch');
		}, target);
	}

	private pushToCommitAction(hash: string, target: DialogTarget & CommitTarget) {
		const branchName = this.gitBranchHead!, upstreamRemote = this.getRemoteForBranch(branchName);
		const inputs: DialogInput[] = [];
		if (this.gitRemotes.length > 1) {
			inputs.push({ type: DialogInputType.Select, name: 'Remote', options: this.gitRemotes.map((remote) => ({ name: remote, value: remote })), default: upstreamRemote !== null && this.gitRemotes.includes(upstreamRemote) ? upstreamRemote : this.getPushRemote(branchName) });
		}
		inputs.push(
			{ type: DialogInputType.TextRef, name: 'Remote Branch', default: branchName, info: 'The name of the branch on the remote to update.' },
			{ type: DialogInputType.Checkbox, name: 'No Verify', value: false },
			{ type: DialogInputType.Checkbox, name: 'Force With Lease', value: false, info: 'Allow the remote branch to be moved backwards (e.g. to a commit before the commits that are already on the remote).' }
		);
		dialog.showForm('Push commit <b><i>' + abbrevCommit(hash) + '</i></b> (and the commits before it) to the remote, without pushing the commits after it?', inputs, 'Yes, push', (values) => {
			const remote = this.gitRemotes.length > 1 ? <string>values.shift() : this.gitRemotes[0];
			runAction({ command: 'pushToCommit', repo: this.currentRepo, commitHash: hash, remote: remote, branchName: <string>values[0], noVerify: <boolean>values[1], force: <boolean>values[2] }, 'Pushing to Commit');
		}, target);
	}

	private rebaseOntoAction(hash: string, target: DialogTarget & CommitTarget) {
		const branches = this.gitBranches.filter((branch) => branch !== this.gitBranchHead).map((branch) => ({ name: branch.startsWith('remotes/') ? branch.substring(8) : branch, value: branch }));
		if (branches.length === 0) {
			dialog.showError('Unable to Rebase', 'There are no other branches to rebase the commits onto.', null, null);
			return;
		}
		const current = this.gitBranchHead !== null ? '<b><i>' + escapeHtml(this.gitBranchHead) + '</i></b> (the current branch)' : 'the current branch';
		dialog.showForm('Rebase the commits of ' + current + ' after commit <b><i>' + abbrevCommit(hash) + '</i></b> onto another branch (<code>git rebase --onto &lt;branch&gt; ' + abbrevCommit(hash) + '</code>)? Commit <b><i>' + abbrevCommit(hash) + '</i></b> and the commits before it are not rebased.', [
			{ type: DialogInputType.Select, name: 'Onto', options: branches, default: branches[0].value }
		], 'Yes, rebase', (values) => {
			runAction({ command: 'rebaseOnto', repo: this.currentRepo, newBase: <string>values[0], upstream: hash }, 'Rebasing Commits');
		}, target);
	}

	private getRemoteBranchContextMenuActions(remote: string, target: DialogTarget & RefTarget): ContextMenuActions {
		const refName = target.ref, visibility = this.config.contextMenuActionsVisibility.remoteBranch;
		const branchName = remote !== '' ? refName.substring(remote.length + 1) : '';
		const prefixedRefName = 'remotes/' + refName;
		const isSelectedInBranchesDropdown = this.branchDropdown.isSelected(prefixedRefName);
		return [[
			{
				title: 'Checkout Branch' + ELLIPSIS,
				visible: visibility.checkout,
				onClick: () => this.checkoutBranchAction(refName, remote, null, target)
			}, {
				title: 'Create Branch' + ELLIPSIS,
				visible: visibility.createBranch,
				// Prefilled with the name of the branch on the remote, "Check out" defaults to the Extension Setting (like on a commit)
				onClick: () => this.createBranchAction(target.hash, branchName, this.config.dialogDefaults.createBranch.checkout, target)
			}, {
				title: 'Delete Remote Branch' + ELLIPSIS,
				visible: visibility.delete && remote !== '',
				onClick: () => {
					dialog.showConfirmation('Are you sure you want to delete the remote branch <b><i>' + escapeHtml(refName) + '</i></b>?', 'Yes, delete', () => {
						runAction({ command: 'deleteRemoteBranch', repo: this.currentRepo, branchName: branchName, remote: remote }, 'Deleting Remote Branch');
					}, target);
				}
			}, {
				title: 'Fetch into local branch' + ELLIPSIS,
				visible: visibility.fetch && remote !== '' && this.gitBranches.includes(branchName) && this.gitBranchHead !== branchName,
				onClick: () => {
					dialog.showForm('Are you sure you want to fetch the remote branch <b><i>' + escapeHtml(refName) + '</i></b> into the local branch <b><i>' + escapeHtml(branchName) + '</i></b>?', [{
						type: DialogInputType.Checkbox,
						name: 'Force Fetch',
						value: this.config.dialogDefaults.fetchIntoLocalBranch.forceFetch,
						info: 'Force the local branch to be reset to this remote branch.'
					}], 'Yes, fetch', (values) => {
						runAction({ command: 'fetchIntoLocalBranch', repo: this.currentRepo, remote: remote, remoteBranch: branchName, localBranch: branchName, force: <boolean>values[0] }, 'Fetching Branch');
					}, target);
				}
			}, {
				title: 'Merge into current branch' + ELLIPSIS,
				visible: visibility.merge,
				onClick: () => this.mergeAction(refName, refName, GG.MergeActionOn.RemoteTrackingBranch, target)
			}, {
				title: 'Pull into current branch' + ELLIPSIS,
				visible: visibility.pull && remote !== '',
				onClick: () => {
					dialog.showForm('Are you sure you want to pull the remote branch <b><i>' + escapeHtml(refName) + '</i></b> into ' + (this.gitBranchHead !== null ? '<b><i>' + escapeHtml(this.gitBranchHead) + '</i></b> (the current branch)' : 'the current branch') + '? If a merge is required:', [
						{ type: DialogInputType.Checkbox, name: 'Create a new commit even if fast-forward is possible', value: this.gitBuiltin.pullNoFastForward },
						{ type: DialogInputType.Checkbox, name: 'Squash Commits', value: this.config.dialogDefaults.pullBranch.squash, info: 'Create a single commit on the current branch whose effect is the same as merging this remote branch.' },
						getNoVerifyInput(NO_VERIFY_MERGE_INFO)
					], 'Yes, pull', (values) => {
						runAction({ command: 'pullBranch', repo: this.currentRepo, branchName: branchName, remote: remote, createNewCommit: <boolean>values[0], squash: <boolean>values[1], noVerify: <boolean>values[2] }, 'Pulling Branch');
					}, target);
				}
			}
		], [
			this.getViewIssueAction(refName, visibility.viewIssue, target),
			{
				title: 'Create Pull Request',
				visible: visibility.createPullRequest && this.gitRepos[this.currentRepo].pullRequestConfig !== null && branchName !== 'HEAD' &&
					(this.gitRepos[this.currentRepo].pullRequestConfig!.sourceRemote === remote || this.gitRepos[this.currentRepo].pullRequestConfig!.destRemote === remote),
				onClick: () => {
					const config = this.gitRepos[this.currentRepo].pullRequestConfig;
					if (config === null) return;
					const isDestRemote = config.destRemote === remote;
					runAction({
						command: 'createPullRequest',
						repo: this.currentRepo,
						config: config,
						sourceRemote: isDestRemote ? config.destRemote! : config.sourceRemote,
						sourceOwner: isDestRemote ? config.destOwner : config.sourceOwner,
						sourceRepo: isDestRemote ? config.destRepo : config.sourceRepo,
						sourceBranch: branchName,
						push: false
					}, 'Creating Pull Request');
				}
			}
		], [
			{
				title: 'Create Archive',
				visible: visibility.createArchive,
				onClick: () => {
					runAction({ command: 'createArchive', repo: this.currentRepo, ref: refName }, 'Creating Archive');
				}
			},
			{
				title: 'Select in Branches Dropdown',
				visible: visibility.selectInBranchesDropdown && (!isSelectedInBranchesDropdown || this.branchDropdown.isShowAllSelected()),
				onClick: (e) => this.branchDropdown.selectOption(prefixedRefName, e)
			},
			{
				title: 'Unselect in Branches Dropdown',
				visible: visibility.unselectInBranchesDropdown && isSelectedInBranchesDropdown,
				onClick: () => this.branchDropdown.unselectOption(prefixedRefName)
			},
			{
				title: 'Hide Branch',
				visible: visibility.hide && remote !== '',
				onClick: () => this.hideBranch(prefixedRefName)
			},
			{
				title: 'Hide Remote "' + remote + '"',
				visible: visibility.hideRemote && remote !== '',
				onClick: () => {
					// Reuses the hidden remotes of the Repository Settings
					const hideRemotes = this.gitRepos[this.currentRepo].hideRemotes;
					if (!hideRemotes.includes(remote)) {
						this.saveRepoStateValue(this.currentRepo, 'hideRemotes', hideRemotes.concat([remote]));
						this.refresh(true);
					}
				}
			}
		], [
			{
				title: 'Copy Branch Name to Clipboard',
				visible: visibility.copyName,
				onClick: () => {
					sendMessage({ command: 'copyToClipboard', type: 'Branch Name', data: refName });
				}
			}
		]];
	}

	private getStashContextMenuActions(target: DialogTarget & RefTarget): ContextMenuActions {
		const hash = target.hash, selector = target.ref, visibility = this.config.contextMenuActionsVisibility.stash;
		// A dropped stash (found by the Dangling scope) can be applied or have a branch created from it by its hash, but isn't in the stash list
		const dropped = isDroppedStash(selector), name = escapeHtml(dropped ? 'dropped stash ' + abbrevCommit(hash) : getStashName(selector));
		const commit = typeof this.commitLookup[hash] === 'number' ? this.commits[this.commitLookup[hash]] : null;
		const stash = commit !== null ? commit.stash : null;
		return [[
			{
				title: 'Apply Stash' + ELLIPSIS,
				visible: visibility.apply,
				onClick: () => {
					dialog.showForm('Are you sure you want to apply the stash <b><i>' + name + '</i></b>?', [{
						type: DialogInputType.Checkbox,
						name: 'Reinstate Index',
						value: this.config.dialogDefaults.applyStash.reinstateIndex,
						info: 'Attempt to reinstate the indexed changes, in addition to the working tree\'s changes.'
					}], 'Yes, apply stash', (values) => {
						runAction({ command: 'applyStash', repo: this.currentRepo, selector: selector, reinstateIndex: <boolean>values[0] }, 'Applying Stash');
					}, target);
				}
			}, {
				title: 'Create Branch from Stash' + ELLIPSIS,
				visible: visibility.createBranch,
				onClick: () => {
					dialog.showRefInput('Create a branch from stash <b><i>' + name + '</i></b> with the name:', '', 'Create Branch', (branchName) => {
						runAction({ command: 'branchFromStash', repo: this.currentRepo, selector: selector, branchName: branchName }, 'Creating Branch');
					}, target);
				}
			}, {
				title: 'Pop Stash' + ELLIPSIS,
				visible: visibility.pop && !dropped,
				onClick: () => {
					dialog.showForm('Are you sure you want to pop the stash <b><i>' + name + '</i></b>?', [{
						type: DialogInputType.Checkbox,
						name: 'Reinstate Index',
						value: this.config.dialogDefaults.popStash.reinstateIndex,
						info: 'Attempt to reinstate the indexed changes, in addition to the working tree\'s changes.'
					}], 'Yes, pop stash', (values) => {
						runAction({ command: 'popStash', repo: this.currentRepo, selector: selector, reinstateIndex: <boolean>values[0] }, 'Popping Stash');
					}, target);
				}
			}, {
				title: 'Drop Stash' + ELLIPSIS,
				visible: visibility.drop && !dropped,
				onClick: () => {
					dialog.showConfirmation('Are you sure you want to drop the stash <b><i>' + name + '</i></b>?', 'Yes, drop', () => {
						runAction({ command: 'dropStash', repo: this.currentRepo, selector: selector }, 'Dropping Stash');
					}, target);
				}
			}
		], [
			{
				title: 'View All Changes',
				visible: visibility.viewAllChanges && stash !== null,
				onClick: () => {
					if (stash !== null) runAction({ command: 'viewAllChanges', repo: this.currentRepo, fromHash: hash, toHash: hash, hasParents: true, stash: stash }, 'Opening All Changes');
				}
			}
		], [
			{
				title: 'Copy Stash Name to Clipboard',
				visible: visibility.copyName && !dropped,
				onClick: () => {
					sendMessage({ command: 'copyToClipboard', type: 'Stash Name', data: selector });
				}
			}, {
				title: 'Copy Stash Hash to Clipboard',
				visible: visibility.copyHash,
				onClick: () => {
					sendMessage({ command: 'copyToClipboard', type: 'Stash Hash', data: hash });
				}
			}
		]];
	}

	private getTagContextMenuActions(isAnnotated: boolean, target: DialogTarget & RefTarget): ContextMenuActions {
		const hash = target.hash, tagName = target.ref, visibility = this.config.contextMenuActionsVisibility.tag;
		return [[
			{
				title: 'View Details',
				visible: visibility.viewDetails && isAnnotated,
				onClick: () => {
					runAction({ command: 'tagDetails', repo: this.currentRepo, tagName: tagName, commitHash: hash }, 'Retrieving Tag Details');
				}
			}, {
				title: 'Checkout' + ELLIPSIS,
				visible: visibility.checkout,
				onClick: () => {
					dialog.showConfirmation('Are you sure you want to checkout the tag <b><i>' + escapeHtml(tagName) + '</i></b> (commit <b><i>' + abbrevCommit(hash) + '</i></b>)? This will result in a \'detached HEAD\' state.', 'Yes, checkout', () => {
						runAction({ command: 'checkoutCommit', repo: this.currentRepo, commitHash: hash }, 'Checking out Tag');
					}, target);
				}
			}, {
				title: 'Delete Tag' + ELLIPSIS,
				visible: visibility.delete,
				onClick: () => {
					let message = 'Are you sure you want to delete the tag <b><i>' + escapeHtml(tagName) + '</i></b>?';
					if (this.gitRemotes.length > 1) {
						let options = [{ name: 'Don\'t delete on any remote', value: '-1' }];
						this.gitRemotes.forEach((remote, i) => options.push({ name: remote, value: i.toString() }));
						dialog.showSelect(message + '<br>Do you also want to delete the tag on a remote:', '-1', options, 'Yes, delete', remoteIndex => {
							this.deleteTagAction(tagName, remoteIndex !== '-1' ? this.gitRemotes[parseInt(remoteIndex)] : null);
						}, target);
					} else if (this.gitRemotes.length === 1) {
						dialog.showCheckbox(message, 'Also delete on remote', false, 'Yes, delete', deleteOnRemote => {
							this.deleteTagAction(tagName, deleteOnRemote ? this.gitRemotes[0] : null);
						}, target);
					} else {
						dialog.showConfirmation(message, 'Yes, delete', () => {
							this.deleteTagAction(tagName, null);
						}, target);
					}
				}
			}, {
				title: 'Push Tag' + ELLIPSIS,
				visible: visibility.push && this.gitRemotes.length > 0,
				onClick: () => {
					const runPushTagAction = (remotes: string[], force: boolean) => {
						runAction({
							command: 'pushTag',
							repo: this.currentRepo,
							tagName: tagName,
							remotes: remotes,
							commitHash: hash,
							skipRemoteCheck: globalState.pushTagSkipRemoteCheck,
							force: force
						}, 'Pushing Tag');
					};
					const forceInput: DialogInput = { type: DialogInputType.Checkbox, name: 'Force', value: false, info: 'Replace the tag on the remote if it already exists (e.g. after the tag was moved to another commit).' };

					if (this.gitRemotes.length === 1) {
						dialog.showForm('Are you sure you want to push the tag <b><i>' + escapeHtml(tagName) + '</i></b> to the remote <b><i>' + escapeHtml(this.gitRemotes[0]) + '</i></b>?', [forceInput], 'Yes, push', (values) => {
							runPushTagAction([this.gitRemotes[0]], <boolean>values[0]);
						}, target);
					} else if (this.gitRemotes.length > 1) {
						const defaults = [this.getPushRemote()];
						const options = this.gitRemotes.map((remote) => ({ name: remote, value: remote }));
						dialog.showForm('Are you sure you want to push the tag <b><i>' + escapeHtml(tagName) + '</i></b>?', [
							{ type: DialogInputType.Select, name: 'Push to Remote(s)', defaults: defaults, options: options, multiple: true },
							forceInput
						], 'Yes, push', (values) => {
							runPushTagAction(<string[]>values[0], <boolean>values[1]);
						}, target);
					}
				}
			}
		], [
			{
				title: 'Create Archive',
				visible: visibility.createArchive,
				onClick: () => {
					runAction({ command: 'createArchive', repo: this.currentRepo, ref: tagName }, 'Creating Archive');
				}
			},
			{
				title: 'Copy Tag Name to Clipboard',
				visible: visibility.copyName,
				onClick: () => {
					sendMessage({ command: 'copyToClipboard', type: 'Tag Name', data: tagName });
				}
			}
		]];
	}

	private getUncommittedChangesContextMenuActions(target: DialogTarget & CommitTarget): ContextMenuActions {
		let visibility = this.config.contextMenuActionsVisibility.uncommittedChanges;
		return [[
			{
				title: 'Stash uncommitted changes' + ELLIPSIS,
				visible: visibility.stash,
				onClick: () => {
					dialog.showForm('Are you sure you want to stash the <b>uncommitted changes</b>?', [
						{ type: DialogInputType.Text, name: 'Message', default: '', placeholder: 'Optional' },
						{ type: DialogInputType.Checkbox, name: 'Include Untracked', value: this.config.dialogDefaults.stashUncommittedChanges.includeUntracked, info: 'Include all untracked files in the stash, and then clean them from the working directory.' }
					], 'Yes, stash', (values) => {
						runAction({ command: 'pushStash', repo: this.currentRepo, message: <string>values[0], includeUntracked: <boolean>values[1] }, 'Stashing uncommitted changes');
					}, target);
				}
			}, {
				title: 'Apply Patch' + ELLIPSIS,
				visible: visibility.applyPatch,
				onClick: () => this.applyPatchAction(target)
			}
		], [
			{
				title: 'Reset uncommitted changes' + ELLIPSIS,
				visible: visibility.reset,
				onClick: () => {
					dialog.showSelect('Are you sure you want to reset the <b>uncommitted changes</b> to <b>HEAD</b>?', this.config.dialogDefaults.resetUncommitted.mode, [
						{ name: 'Mixed - Keep working tree, but reset index', value: GG.GitResetMode.Mixed },
						{ name: 'Hard - Discard all changes', value: GG.GitResetMode.Hard }
					], 'Yes, reset', (mode) => {
						runAction({ command: 'resetToCommit', repo: this.currentRepo, commit: 'HEAD', resetMode: <GG.GitResetMode>mode }, 'Resetting uncommitted changes');
					}, target);
				}
			}, {
				title: 'Clean untracked files' + ELLIPSIS,
				visible: visibility.clean,
				onClick: () => {
					dialog.showCheckbox('Are you sure you want to clean all untracked files?', 'Clean untracked directories', true, 'Yes, clean', directories => {
						runAction({ command: 'cleanUntrackedFiles', repo: this.currentRepo, directories: directories }, 'Cleaning untracked files');
					}, target);
				}
			}
		], [
			{
				title: 'View All Changes',
				visible: visibility.viewAllChanges,
				onClick: () => runAction({ command: 'viewAllChanges', repo: this.currentRepo, fromHash: UNCOMMITTED, toHash: UNCOMMITTED, hasParents: true }, 'Opening All Changes')
			}, {
				title: 'Open Source Control View',
				visible: visibility.openSourceControlView,
				onClick: () => {
					sendMessage({ command: 'viewScm' });
				}
			}
		]];
	}

	private getViewIssueAction(refName: string, visible: boolean, target: DialogTarget & RefTarget): ContextMenuAction {
		const issueLinks: { url: string, displayText: string }[] = [];

		let match: RegExpExecArray | null;
		const issueLinkings = visible ? parseIssueLinkingConfig(this.gitRepos[this.currentRepo].issueLinkingConfig) : [];
		for (const issueLinking of issueLinkings) {
			issueLinking.regexp.lastIndex = 0;
			while ((match = issueLinking.regexp.exec(refName))) {
				if (match[0].length === 0) break;
				issueLinks.push({
					url: generateIssueLinkFromMatch(match, issueLinking),
					displayText: match[0]
				});
			}
		}

		return {
			title: 'View Issue' + (issueLinks.length > 1 ? ELLIPSIS : ''),
			visible: issueLinks.length > 0,
			onClick: () => {
				if (issueLinks.length > 1) {
					dialog.showSelect('Select which issue you want to view for this branch:', '0', issueLinks.map((issueLink, i) => ({ name: issueLink.displayText, value: i.toString() })), 'View Issue', (value) => {
						sendMessage({ command: 'openExternalUrl', url: issueLinks[parseInt(value)].url });
					}, target);
				} else if (issueLinks.length === 1) {
					sendMessage({ command: 'openExternalUrl', url: issueLinks[0].url });
				}
			}
		};
	}


	/* Actions */

	private addTagAction(hash: string, initialName: string, initialType: GG.TagType, initialMessage: string, initialPushToRemote: string | null, target: DialogTarget & CommitTarget, isInitialLoad: boolean = true) {
		let mostRecentTagsIndex = -1;
		for (let i = 0; i < this.commits.length; i++) {
			if (this.commits[i].tags.length > 0 && (mostRecentTagsIndex === -1 || this.commits[i].date > this.commits[mostRecentTagsIndex].date)) {
				mostRecentTagsIndex = i;
			}
		}
		const mostRecentTagNames = mostRecentTagsIndex > -1 ? this.commits[mostRecentTagsIndex].tags.map((tag) => tag.name) : [];
		const mostRecentTags = mostRecentTagNames.map((name) => '"' + name + '"');
		// Suggest the existing tag names, the most recent ones first
		const tagSuggestions = mostRecentTagNames.concat(this.gitTags.filter((tag) => !mostRecentTagNames.includes(tag)));

		const inputs: DialogInput[] = [
			{ type: DialogInputType.TextRef, name: 'Name', default: initialName, suggestions: tagSuggestions, info: mostRecentTags.length > 0 ? 'The most recent tag' + (mostRecentTags.length > 1 ? 's' : '') + ' in the loaded commits ' + (mostRecentTags.length > 1 ? 'are' : 'is') + ' ' + formatCommaSeparatedList(mostRecentTags) + '. Click to use ' + (mostRecentTags.length > 1 ? 'the first one' : 'it') + ' as the name.' : undefined },
			{ type: DialogInputType.Select, name: 'Type', default: initialType === GG.TagType.Annotated ? 'annotated' : 'lightweight', options: [{ name: 'Annotated', value: 'annotated' }, { name: 'Lightweight', value: 'lightweight' }] },
			{ type: DialogInputType.TextArea, name: 'Message', default: initialMessage, placeholder: 'Optional', rows: 3, info: 'A message can only be added to an annotated tag.' }
		];
		if (this.gitRemotes.length > 1) {
			const options = [{ name: 'Don\'t push', value: '-1' }];
			this.gitRemotes.forEach((remote, i) => options.push({ name: remote, value: i.toString() }));
			const defaultOption = initialPushToRemote !== null
				? this.gitRemotes.indexOf(initialPushToRemote)
				: isInitialLoad && this.config.dialogDefaults.addTag.pushToRemote
					? this.gitRemotes.indexOf(this.getPushRemote())
					: -1;
			inputs.push({ type: DialogInputType.Select, name: 'Push to remote', options: options, default: defaultOption.toString(), info: 'Once this tag has been added, push it to this remote.' });
		} else if (this.gitRemotes.length === 1) {
			const defaultValue = initialPushToRemote !== null || (isInitialLoad && this.config.dialogDefaults.addTag.pushToRemote);
			inputs.push({ type: DialogInputType.Checkbox, name: 'Push to remote', value: defaultValue, info: 'Once this tag has been added, push it to the repositories remote.' });
		}

		dialog.showForm('Add tag to commit <b><i>' + abbrevCommit(hash) + '</i></b>:', inputs, 'Add Tag', (values) => {
			const tagName = <string>values[0];
			const type = <string>values[1] === 'annotated' ? GG.TagType.Annotated : GG.TagType.Lightweight;
			const message = <string>values[2];
			const pushToRemote = this.gitRemotes.length > 1 && <string>values[3] !== '-1'
				? this.gitRemotes[parseInt(<string>values[3])]
				: this.gitRemotes.length === 1 && <boolean>values[3]
					? this.gitRemotes[0]
					: null;

			const runAddTagAction = (force: boolean) => {
				runAction({
					command: 'addTag',
					repo: this.currentRepo,
					tagName: tagName,
					commitHash: hash,
					type: type,
					message: message,
					pushToRemote: pushToRemote,
					pushSkipRemoteCheck: globalState.pushTagSkipRemoteCheck,
					force: force
				}, 'Adding Tag');
			};

			if (this.gitTags.includes(tagName)) {
				dialog.showTwoButtons('A tag named <b><i>' + escapeHtml(tagName) + '</i></b> already exists, do you want to replace it with this new tag?', 'Yes, replace the existing tag', () => {
					runAddTagAction(true);
				}, 'No, choose another tag name', () => {
					this.addTagAction(hash, tagName, type, message, pushToRemote, target, false);
				}, target);
			} else {
				runAddTagAction(false);
			}
		}, target);

		// Clicking the information icon of the name fills in the most recent tag, so that it can be edited into the next version
		const nameInput = <HTMLInputElement | null>document.getElementById('dialogInput0');
		const nameInfoElem = nameInput !== null && nameInput.closest('tr') !== null ? nameInput.closest('tr')!.querySelector('.dialogInfo') : null;
		if (nameInput !== null && nameInfoElem !== null && mostRecentTagNames.length > 0) {
			(<HTMLElement>nameInfoElem).style.cursor = 'pointer';
			nameInfoElem.addEventListener('click', () => {
				nameInput.value = mostRecentTagNames[0];
				nameInput.dispatchEvent(new Event('input'));
				nameInput.focus();
				nameInput.setSelectionRange(nameInput.value.length, nameInput.value.length);
			});
		}
	}

	/**
	 * Hide a branch when showing all branches. It can be shown again via the Repository Settings.
	 * @param branch The branch name (prefixed with "remotes/" for remote-tracking branches).
	 */
	private hideBranch(branch: string) {
		const excludeBranches = this.gitRepos[this.currentRepo].excludeBranches;
		if (excludeBranches.includes(branch)) return;
		this.saveRepoStateValue(this.currentRepo, 'excludeBranches', excludeBranches.concat([branch]));
		this.refresh(true);
	}

	/**
	 * Show the context menu of an option in the Branches dropdown.
	 * @param value The value of the option.
	 * @param e The mouse event.
	 */
	private showBranchDropdownOptionContextMenu(value: string, e: MouseEvent) {
		if (!this.gitBranches.includes(value)) return;
		const remoteBranch = value.startsWith('remotes/') ? value.substring(8) : null;
		const remote = remoteBranch !== null ? (this.gitRemotes.find((remote) => remoteBranch.startsWith(remote + '/')) || '') : null;
		contextMenu.show([[
			{
				title: 'Checkout Branch' + (remoteBranch !== null ? ELLIPSIS : ''),
				visible: remoteBranch !== null ? this.config.contextMenuActionsVisibility.remoteBranch.checkout && !remoteBranch.endsWith('/HEAD') : this.config.contextMenuActionsVisibility.branch.checkout && value !== this.gitBranchHead,
				onClick: () => this.checkoutBranchAction(remoteBranch !== null ? remoteBranch : value, remote, null, null)
			}
		]], false, null, e, document.body);
	}

	private checkoutBranchAction(refName: string, remote: string | null, prefillName: string | null, target: (DialogTarget & (CommitTarget | RefTarget)) | null) {
		if (remote !== null) {
			dialog.showRefInput('Enter the name of the new branch you would like to create when checking out <b><i>' + escapeHtml(refName) + '</i></b>:', (prefillName !== null ? prefillName : (remote !== '' ? refName.substring(remote.length + 1) : refName)), 'Checkout Branch', newBranch => {
				if (this.gitBranches.includes(newBranch)) {
					const canPullFromRemote = remote !== '';
					dialog.showTwoButtons('The name <b><i>' + escapeHtml(newBranch) + '</i></b> is already used by another branch:', 'Choose another branch name', () => {
						this.checkoutBranchAction(refName, remote, newBranch, target);
					}, 'Checkout the existing branch' + (canPullFromRemote ? ' & pull changes' : ''), () => {
						runAction({
							command: 'checkoutBranch',
							repo: this.currentRepo,
							branchName: newBranch,
							remoteBranch: null,
							pullAfterwards: canPullFromRemote
								? {
									branchName: refName.substring(remote.length + 1),
									remote: remote,
									createNewCommit: this.gitBuiltin.pullNoFastForward,
									squash: this.config.dialogDefaults.pullBranch.squash,
									noVerify: false
								}
								: null
						}, 'Checking out Branch' + (canPullFromRemote ? ' & Pulling Changes' : ''));
					}, target);
				} else {
					runAction({ command: 'checkoutBranch', repo: this.currentRepo, branchName: newBranch, remoteBranch: refName, pullAfterwards: null }, 'Checking out Branch');
				}
			}, target);
		} else {
			runAction({ command: 'checkoutBranch', repo: this.currentRepo, branchName: refName, remoteBranch: null, pullAfterwards: null }, 'Checking out Branch');
		}
	}

	private createBranchAction(hash: string, initialName: string, initialCheckOut: boolean, target: DialogTarget & CommitTarget) {
		dialog.showForm('Create branch at commit <b><i>' + abbrevCommit(hash) + '</i></b>:', [
			{ type: DialogInputType.TextRef, name: 'Name', default: initialName !== '' ? initialName : this.config.branchPrefix },
			{ type: DialogInputType.Checkbox, name: 'Check out', value: initialCheckOut }
		], 'Create Branch', (values) => {
			const branchName = <string>values[0], checkOut = <boolean>values[1];
			if (this.gitBranches.includes(branchName)) {
				dialog.showTwoButtons('A branch named <b><i>' + escapeHtml(branchName) + '</i></b> already exists, do you want to replace it with this new branch?', 'Yes, replace the existing branch', () => {
					runAction({ command: 'createBranch', repo: this.currentRepo, branchName: branchName, commitHash: hash, checkout: checkOut, force: true }, 'Creating Branch');
				}, 'No, choose another branch name', () => {
					this.createBranchAction(hash, branchName, checkOut, target);
				}, target);
			} else {
				runAction({ command: 'createBranch', repo: this.currentRepo, branchName: branchName, commitHash: hash, checkout: checkOut, force: false }, 'Creating Branch');
			}
		}, target);

		// Place the cursor after the prefilled name (e.g. the "git.branchPrefix")
		const nameInput = <HTMLInputElement | null>document.getElementById('dialogInput0');
		if (nameInput !== null) {
			nameInput.setSelectionRange(nameInput.value.length, nameInput.value.length);
		}
	}

	private deleteTagAction(refName: string, deleteOnRemote: string | null) {
		runAction({ command: 'deleteTag', repo: this.currentRepo, tagName: refName, deleteOnRemote: deleteOnRemote }, 'Deleting Tag');
	}

	private fetchFromRemotesAction() {
		runAction({ command: 'fetch', repo: this.currentRepo, name: null, prune: null, pruneTags: null }, 'Fetching from Remote(s)');
	}

	private mergeAction(obj: string, name: string, actionOn: GG.MergeActionOn, target: DialogTarget & (CommitTarget | RefTarget)) {
		dialog.showForm('Are you sure you want to merge ' + actionOn.toLowerCase() + ' <b><i>' + escapeHtml(name) + '</i></b> into ' + (this.gitBranchHead !== null ? '<b><i>' + escapeHtml(this.gitBranchHead) + '</i></b> (the current branch)' : 'the current branch') + '?', [
			{ type: DialogInputType.Checkbox, name: 'Create a new commit even if fast-forward is possible', value: this.gitBuiltin.mergeNoFastForward },
			{ type: DialogInputType.Checkbox, name: 'Allow unrelated histories', value: this.config.dialogDefaults.merge.allowUnrelatedHistories, info: 'Allow merging branches from two completely different repositories or branches.' },
			{ type: DialogInputType.Checkbox, name: 'Squash Commits', value: this.config.dialogDefaults.merge.squash, info: 'Create a single commit on the current branch whose effect is the same as merging this ' + actionOn.toLowerCase() + '.' },
			{ type: DialogInputType.Checkbox, name: 'No Commit', value: this.config.dialogDefaults.merge.noCommit, info: 'The changes of the merge will be staged but not committed, so that you can review and/or modify the merge result before committing.' },
			getNoVerifyInput(NO_VERIFY_MERGE_INFO + ' Has no effect when "No Commit" is selected.')
		], 'Yes, merge', (values) => {
			runAction({ command: 'merge', repo: this.currentRepo, obj: obj, actionOn: actionOn, createNewCommit: <boolean>values[0], allowUnrelatedHistories: <boolean>values[1], squash: <boolean>values[2], noCommit: <boolean>values[3], noVerify: <boolean>values[4] }, 'Merging ' + actionOn);
		}, target);
	}

	/**
	 * Update a local branch (checked out or not) from its upstream branch, see `DataSource.fetchIntoLocalBranch`.
	 * @param branchName The name of the local branch.
	 * @param target The target of the dialog.
	 */
	private updateBranchFromUpstreamAction(branchName: string, target: DialogTarget & RefTarget) {
		const upstream = this.getBranchUpstream(branchName);
		if (upstream === null || upstream.ref === null) {
			dialog.showError('Cannot pull branch <b><i>' + escapeHtml(branchName) + '</i></b> because it is not tracking a remote branch. You may need to set an upstream branch first.', 'Pull Branch', null, null);
			return;
		}
		// The full ref (e.g. "refs/heads/main") is fetched, so that it can't be mistaken for a tag of the same name on the remote
		const upstreamRef = upstream.ref, shortName = upstreamRef.replace(/^refs\/heads\//, '');
		const upstreamName = upstream.remote === '.' ? shortName : upstream.remote + '/' + shortName;
		const isCheckedOut = this.gitBranchHead === branchName;
		dialog.showForm('Are you sure you want to update the local branch <b><i>' + escapeHtml(branchName) + '</i></b> with the latest changes from <b><i>' + escapeHtml(upstreamName) + '</i></b>?', [{
			type: DialogInputType.Checkbox,
			name: 'Force Update',
			value: this.config.dialogDefaults.fetchIntoLocalBranch.forceFetch,
			// The dialog escapes the info
			info: 'Reset the local branch to ' + upstreamName + ', discarding the local commits that aren\'t on it. Without this, the local branch is only fast-forwarded.' + (isCheckedOut ? ' Uncommitted changes are kept, the update is refused if they would be overwritten.' : '')
		}], 'Yes, update', (values) => {
			runAction({ command: 'fetchIntoLocalBranch', repo: this.currentRepo, remote: upstream.remote, remoteBranch: upstreamRef, localBranch: branchName, force: <boolean>values[0] }, 'Updating Branch');
		}, target);
	}

	private rebaseAction(obj: string, name: string, actionOn: GG.RebaseActionOn, target: DialogTarget & (CommitTarget | RefTarget)) {
		dialog.showForm('Are you sure you want to rebase ' + (this.gitBranchHead !== null ? '<b><i>' + escapeHtml(this.gitBranchHead) + '</i></b> (the current branch)' : 'the current branch') + ' on ' + actionOn.toLowerCase() + ' <b><i>' + escapeHtml(name) + '</i></b>?', [
			{
				type: DialogInputType.Radio, name: 'Rebase Mode', options: [
					{ name: 'Rebase', value: 'standard' },
					{ name: 'Interactive Rebase (Todo Editor)', value: 'interactive-extension' },
					{ name: 'Interactive Rebase (New Terminal)', value: 'interactive-terminal' }
				], default: this.config.dialogDefaults.rebase.interactive ? 'interactive-extension' : 'standard'
			},
			{ type: DialogInputType.Checkbox, name: 'Ignore Date', value: this.config.dialogDefaults.rebase.ignoreDate, info: 'Only applicable to a non-interactive rebase.' },
			{ type: DialogInputType.Checkbox, name: 'Signed-off-by', value: false, info: 'Add Signed-off-by trailer to rebased commits (--signoff).' },
			{ type: DialogInputType.Checkbox, name: 'Update Refs', value: false, info: 'Also update the branches that point to the rebased commits, e.g. stacked branches (--update-refs, requires Git >= 2.38).' },
			{ type: DialogInputType.Checkbox, name: 'Ignore Whitespace', value: false, info: 'Ignore whitespace differences when reconciling changes (--ignore-whitespace). Only applicable to a non-interactive rebase.' },
			{ type: DialogInputType.Checkbox, name: 'Autosquash', value: false, info: 'Move "fixup!" / "squash!" commits (e.g. created with "Create Fixup Commit") after the commits they modify, and combine them (--autosquash).' }
		], 'Yes, rebase', (values) => {
			const mode = <string>values[0];
			const signoff = <boolean>values[2];
			if (mode === 'interactive-extension') {
				this.pendingRebaseTodo = { repo: this.currentRepo, obj: obj, actionOn: actionOn, signoff: signoff, autosquash: <boolean>values[5], updateRefs: <boolean>values[3] };
				dialog.showActionRunning('Loading Rebase Todo List');
				sendMessage({ command: 'getRebaseTodoList', repo: this.currentRepo, obj: obj, actionOn: actionOn });
			} else {
				const interactive = mode === 'interactive-terminal';
				runAction({ command: 'rebase', repo: this.currentRepo, obj: obj, actionOn: actionOn, ignoreDate: <boolean>values[1], interactive: interactive, signoff: signoff, updateRefs: <boolean>values[3], ignoreWhitespace: !interactive && <boolean>values[4], autosquash: <boolean>values[5] }, interactive ? 'Launching Interactive Rebase' : 'Rebasing on ' + actionOn);
			}
		}, target);
	}

	public showRebaseTodoEditor(items: ReadonlyArray<GG.RebaseTodoItem>) {
		if (this.pendingRebaseTodo === null) return;
		const ctx = this.pendingRebaseTodo;

		if (items.length === 0) {
			dialog.showError('Nothing to rebase', 'There are no commits in the rebase range.', null, null);
			this.pendingRebaseTodo = null;
			return;
		}

		const todo = ctx.autosquash ? arrangeAutosquashTodo(items) : items.map((item) => ({ item: item, action: GG.RebaseTodoAction.Pick }));
		let html = '<b>Interactive Rebase Todo</b><br><br>';
		html += '<table class="rebaseTodoEditor"><tbody>';
		for (let i = 0; i < todo.length; i++) {
			const item = todo[i].item, action = todo[i].action;
			html += '<tr data-index="' + i + '" data-hash="' + escapeHtml(item.hash) + '" data-action="' + action + '">'
				+ '<td class="dragHandle" title="Drag to reorder">&#x2630;</td>'
				+ '<td class="todoHash">' + escapeHtml(item.hash) + '</td>'
				+ '<td class="todoAction"><select>'
				+ ['pick', 'reword', 'edit', 'squash', 'fixup', 'drop'].map((value) => '<option value="' + value + '"' + (value === action ? ' selected' : '') + '>' + value + '</option>').join('')
				+ '</select></td>'
				+ '<td class="todoSubject">' + escapeHtml(item.subject) + '</td>'
				+ '</tr>';
		}
		html += '</tbody></table>';

		const cleanup = () => {
			this.pendingRebaseTodo = null;
			if (this.todoDialogDragAbort) {
				this.todoDialogDragAbort.abort();
				this.todoDialogDragAbort = null;
			}
		};

		dialog.showCustom(html, 'Rebase', () => {
			const actionBtn = document.getElementById('dialogAction');
			if (actionBtn && actionBtn.classList.contains('disabled')) return;
			const rows = document.querySelectorAll('.rebaseTodoEditor tbody tr');
			const entries: GG.RebaseTodoEntry[] = [];
			rows.forEach((row) => {
				const hash = (<HTMLElement>row).dataset.hash!;
				const action = (<HTMLSelectElement>row.querySelector('.todoAction select')!).value as GG.RebaseTodoAction;
				entries.push({ hash: hash, action: action });
			});
			sendMessage({ command: 'rebaseInteractive', repo: ctx.repo, obj: ctx.obj, actionOn: ctx.actionOn, entries: entries, signoff: ctx.signoff, updateRefs: ctx.updateRefs });
			dialog.close();
			cleanup();
		}, 'Cancel', () => {
			dialog.close();
		}, cleanup);

		this.setupTodoDragAndDrop();
		this.setupTodoActionStyling();
		this.setupTodoDialogDrag();
	}

	private setupTodoDragAndDrop() {
		const tbody = document.querySelector('.rebaseTodoEditor tbody');
		if (tbody === null) return;
		let dragRow: HTMLElement | null = null;

		const handles = tbody.querySelectorAll('.dragHandle');
		handles.forEach((handle) => {
			handle.addEventListener('mousedown', (e: Event) => {
				const evt = e as MouseEvent;
				dragRow = (handle as HTMLElement).closest('tr');
				if (!dragRow) return;
				dragRow.classList.add('dragging');
				evt.preventDefault();
				let lastInsertRef: Node | null = dragRow.nextSibling;

				const onMouseMove = (me: MouseEvent) => {
					if (!dragRow) return;
					const rows = Array.from(tbody.querySelectorAll('tr')) as HTMLElement[];
					let newRef: Node | null = null;
					for (let i = 0; i < rows.length; i++) {
						if (rows[i] === dragRow) continue;
						const rect = rows[i].getBoundingClientRect();
						if (me.clientY < rect.top + rect.height / 2) {
							newRef = rows[i];
							break;
						}
					}
					if (newRef === lastInsertRef) return;
					if (newRef) {
						tbody.insertBefore(dragRow, newRef);
					} else {
						tbody.appendChild(dragRow);
					}
					lastInsertRef = newRef;
					this.updateTodoGrouping();
				};

				const onMouseUp = () => {
					document.removeEventListener('mousemove', onMouseMove);
					document.removeEventListener('mouseup', onMouseUp);
					if (dragRow) {
						dragRow.classList.remove('dragging');
						dragRow = null;
					}
					this.updateTodoGrouping();
				};

				document.addEventListener('mousemove', onMouseMove);
				document.addEventListener('mouseup', onMouseUp);
			});
		});
	}

	private setupTodoActionStyling() {
		const selects = document.querySelectorAll('.rebaseTodoEditor .todoAction select');
		selects.forEach((select) => {
			select.addEventListener('change', () => {
				const row = (select as HTMLElement).closest('tr');
				if (row) {
					(<HTMLElement>row).dataset.action = (<HTMLSelectElement>select).value;
				}
				this.updateTodoGrouping();
			});
		});
	}

	private updateTodoGrouping() {
		const rows = document.querySelectorAll('.rebaseTodoEditor tbody tr');
		let hasError = false;
		rows.forEach((row) => {
			row.classList.remove('groupStart', 'groupMember', 'groupLast', 'todoError');
		});
		for (let i = 0; i < rows.length; i++) {
			const action = (<HTMLElement>rows[i]).dataset.action;
			if (action === 'squash' || action === 'fixup') {
				// Check if there's a non-squash/fixup row above
				let hasParent = false;
				for (let j = i - 1; j >= 0; j--) {
					const prevAction = (<HTMLElement>rows[j]).dataset.action;
					if (prevAction !== 'squash' && prevAction !== 'fixup') {
						hasParent = true;
						rows[j].classList.add('groupStart');
						break;
					}
				}
				if (!hasParent) {
					rows[i].classList.add('todoError');
					hasError = true;
				} else {
					rows[i].classList.add('groupMember');
				}
				const nextAction = i + 1 < rows.length ? (<HTMLElement>rows[i + 1]).dataset.action : null;
				if (nextAction !== 'squash' && nextAction !== 'fixup') {
					rows[i].classList.add('groupLast');
				}
			}
		}
		const actionBtn = document.getElementById('dialogAction');
		if (actionBtn) {
			if (hasError) {
				actionBtn.classList.add('disabled');
				actionBtn.title = 'squash/fixup cannot be the first action — needs a preceding pick/reword/edit';
			} else {
				actionBtn.classList.remove('disabled');
				actionBtn.title = '';
			}
		}
	}

	private setupTodoDialogDrag() {
		const dialogElem = document.querySelector('.dialog:has(.rebaseTodoEditor)') as HTMLElement;
		if (dialogElem === null) return;
		let isDragging = false, offsetX = 0, offsetY = 0;
		const ac = new AbortController();

		const titleElem = dialogElem.querySelector('.dialogContent > b');
		if (titleElem === null) return;
		titleElem.addEventListener('mousedown', (e: Event) => {
			const me = e as MouseEvent;
			isDragging = true;
			const rect = dialogElem.getBoundingClientRect();
			offsetX = me.clientX - rect.left;
			offsetY = me.clientY - rect.top;
			dialogElem.style.transform = 'none';
			dialogElem.style.left = rect.left + 'px';
			dialogElem.style.top = rect.top + 'px';
			me.preventDefault();
		}, { signal: ac.signal });

		document.addEventListener('mousemove', (e: MouseEvent) => {
			if (!isDragging) return;
			dialogElem.style.left = (e.clientX - offsetX) + 'px';
			dialogElem.style.top = (e.clientY - offsetY) + 'px';
		}, { signal: ac.signal });

		document.addEventListener('mouseup', () => {
			isDragging = false;
		}, { signal: ac.signal });

		this.todoDialogDragAbort = ac;
	}
	private todoDialogDragAbort: AbortController | null = null;


	/* Table Utils */

	private makeTableResizable() {
		let colHeadersElem = document.getElementById('tableColHeaders')!, cols = <HTMLCollectionOf<HTMLElement>>document.getElementsByClassName('tableColHeader');
		let columnWidths: GG.ColumnWidth[], mouseX = -1, col = -1, colIndex = -1;

		const makeTableFixedLayout = () => {
			cols[0].style.width = columnWidths[0] + 'px';
			cols[0].style.padding = '';
			for (let i = 2; i < cols.length; i++) {
				cols[i].style.width = columnWidths[parseInt(cols[i].dataset.col!)] + 'px';
			}
			this.tableElem.className = 'fixedLayout';
			this.tableElem.style.removeProperty(CSS_PROP_LIMIT_GRAPH_WIDTH);
			this.graph.limitMaxWidth(columnWidths[0] + COLUMN_LEFT_RIGHT_PADDING);
		};

		for (let i = 0; i < cols.length; i++) {
			let col = parseInt(cols[i].dataset.col!);
			cols[i].innerHTML += (i > 0 ? '<span class="resizeCol left" data-col="' + (col - 1) + '"></span>' : '') + (i < cols.length - 1 ? '<span class="resizeCol right" data-col="' + col + '"></span>' : '');
		}

		let cWidths = this.gitRepos[this.currentRepo].columnWidths;
		if (cWidths === null) { // Initialise auto column layout if it is the first time viewing the repo.
			let defaults = this.config.defaultColumnVisibility;
			columnWidths = [COLUMN_AUTO, COLUMN_AUTO, defaults.date ? COLUMN_AUTO : COLUMN_HIDDEN, defaults.author ? COLUMN_AUTO : COLUMN_HIDDEN, defaults.commit ? COLUMN_AUTO : COLUMN_HIDDEN];
			this.saveColumnWidths(columnWidths);
		} else {
			columnWidths = [cWidths[0], COLUMN_AUTO, cWidths[1], cWidths[2], cWidths[3]];
		}

		if (columnWidths[0] !== COLUMN_AUTO) {
			// Table should have fixed layout
			makeTableFixedLayout();
		} else {
			// Table should have automatic layout
			this.tableElem.className = 'autoLayout';

			let colWidth = cols[0].offsetWidth, graphWidth = this.graph.getContentWidth();
			let maxWidth = Math.round(this.viewElem.clientWidth * 0.333);
			if (Math.max(graphWidth, colWidth) > maxWidth) {
				this.graph.limitMaxWidth(maxWidth);
				graphWidth = maxWidth;
				this.tableElem.className += ' limitGraphWidth';
				this.tableElem.style.setProperty(CSS_PROP_LIMIT_GRAPH_WIDTH, maxWidth + 'px');
			} else {
				this.graph.limitMaxWidth(-1);
				this.tableElem.style.removeProperty(CSS_PROP_LIMIT_GRAPH_WIDTH);
			}

			if (colWidth < Math.max(graphWidth, 64)) {
				cols[0].style.padding = '6px ' + Math.floor((Math.max(graphWidth, 64) - (colWidth - COLUMN_LEFT_RIGHT_PADDING)) / 2) + 'px';
			}
		}

		const processResizingColumn: EventListener = (e) => {
			if (col > -1) {
				let mouseEvent = <MouseEvent>e;
				let mouseDeltaX = mouseEvent.clientX - mouseX;

				if (col === 0) {
					if (columnWidths[0] + mouseDeltaX < COLUMN_MIN_WIDTH) mouseDeltaX = -columnWidths[0] + COLUMN_MIN_WIDTH;
					if (cols[1].clientWidth - COLUMN_LEFT_RIGHT_PADDING - mouseDeltaX < COLUMN_MIN_WIDTH) mouseDeltaX = cols[1].clientWidth - COLUMN_LEFT_RIGHT_PADDING - COLUMN_MIN_WIDTH;
					columnWidths[0] += mouseDeltaX;
					cols[0].style.width = columnWidths[0] + 'px';
					this.graph.limitMaxWidth(columnWidths[0] + COLUMN_LEFT_RIGHT_PADDING);
				} else {
					let colWidth = col !== 1 ? columnWidths[col] : cols[1].clientWidth - COLUMN_LEFT_RIGHT_PADDING;
					let nextCol = col + 1;
					while (columnWidths[nextCol] === COLUMN_HIDDEN) nextCol++;

					if (colWidth + mouseDeltaX < COLUMN_MIN_WIDTH) mouseDeltaX = -colWidth + COLUMN_MIN_WIDTH;
					if (columnWidths[nextCol] - mouseDeltaX < COLUMN_MIN_WIDTH) mouseDeltaX = columnWidths[nextCol] - COLUMN_MIN_WIDTH;
					if (col !== 1) {
						columnWidths[col] += mouseDeltaX;
						cols[colIndex].style.width = columnWidths[col] + 'px';
					}
					columnWidths[nextCol] -= mouseDeltaX;
					cols[colIndex + 1].style.width = columnWidths[nextCol] + 'px';
				}
				mouseX = mouseEvent.clientX;
			}
		};
		const stopResizingColumn: EventListener = () => {
			if (col > -1) {
				col = -1;
				colIndex = -1;
				mouseX = -1;
				eventOverlay.remove();
				this.saveColumnWidths(columnWidths);
			}
		};

		addListenerToClass('resizeCol', 'mousedown', (e) => {
			if (e.target === null) return;
			col = parseInt((<HTMLElement>e.target).dataset.col!);
			while (columnWidths[col] === COLUMN_HIDDEN) col--;
			mouseX = (<MouseEvent>e).clientX;

			let isAuto = columnWidths[0] === COLUMN_AUTO;
			for (let i = 0; i < cols.length; i++) {
				let curCol = parseInt(cols[i].dataset.col!);
				if (isAuto && curCol !== 1) columnWidths[curCol] = cols[i].clientWidth - COLUMN_LEFT_RIGHT_PADDING;
				if (curCol === col) colIndex = i;
			}
			if (isAuto) makeTableFixedLayout();
			eventOverlay.create('colResize', processResizingColumn, stopResizingColumn);
		});

		colHeadersElem.addEventListener('contextmenu', (e: MouseEvent) => {
			handledEvent(e);

			const toggleColumnState = (col: number, defaultWidth: number) => {
				columnWidths[col] = columnWidths[col] !== COLUMN_HIDDEN ? COLUMN_HIDDEN : columnWidths[0] === COLUMN_AUTO ? COLUMN_AUTO : defaultWidth - COLUMN_LEFT_RIGHT_PADDING;
				this.saveColumnWidths(columnWidths);
				this.render();
			};

			const commitOrdering = getCommitOrdering(this.gitRepos[this.currentRepo].commitOrdering);
			const changeCommitOrdering = (repoCommitOrdering: GG.RepoCommitOrdering) => {
				this.saveRepoStateValue(this.currentRepo, 'commitOrdering', repoCommitOrdering);
				this.refresh(true);
			};

			contextMenu.show([
				[
					{
						title: 'Date',
						visible: true,
						checked: columnWidths[2] !== COLUMN_HIDDEN,
						onClick: () => toggleColumnState(2, 128)
					},
					{
						title: 'Author',
						visible: true,
						checked: columnWidths[3] !== COLUMN_HIDDEN,
						onClick: () => toggleColumnState(3, 128)
					},
					{
						title: 'Commit',
						visible: true,
						checked: columnWidths[4] !== COLUMN_HIDDEN,
						onClick: () => toggleColumnState(4, 80)
					}
				],
				[
					{
						title: 'Commit Timestamp Order',
						visible: true,
						checked: commitOrdering === GG.CommitOrdering.Date,
						onClick: () => changeCommitOrdering(GG.RepoCommitOrdering.Date)
					},
					{
						title: 'Author Timestamp Order',
						visible: true,
						checked: commitOrdering === GG.CommitOrdering.AuthorDate,
						onClick: () => changeCommitOrdering(GG.RepoCommitOrdering.AuthorDate)
					},
					{
						title: 'Topological Order',
						visible: true,
						checked: commitOrdering === GG.CommitOrdering.Topological,
						onClick: () => changeCommitOrdering(GG.RepoCommitOrdering.Topological)
					}
				]
			], true, null, e, this.viewElem);
		});
	}

	public getColumnVisibility() {
		let colWidths = this.gitRepos[this.currentRepo].columnWidths;
		if (colWidths !== null) {
			return { date: colWidths[1] !== COLUMN_HIDDEN, author: colWidths[2] !== COLUMN_HIDDEN, commit: colWidths[3] !== COLUMN_HIDDEN };
		} else {
			let defaults = this.config.defaultColumnVisibility;
			return { date: defaults.date, author: defaults.author, commit: defaults.commit };
		}
	}

	private getNumColumns() {
		let colVisibility = this.getColumnVisibility();
		return 2 + (colVisibility.date ? 1 : 0) + (colVisibility.author ? 1 : 0) + (colVisibility.commit ? 1 : 0);
	}

	/**
	 * Scroll the view to a commit (if it exists).
	 * @param hash The hash of the commit to scroll to.
	 * @param alwaysCenterCommit TRUE => Always scroll the view to be centered on the commit. FALSE => Don't scroll the view if the commit is already within the visible portion of commits.
	 * @param flash Should the commit flash after it has been scrolled to.
	 */
	public scrollToCommit(hash: string, alwaysCenterCommit: boolean, flash: boolean = false) {
		const elem = findCommitElemWithId(getCommitElems(), this.getCommitId(hash));
		if (elem === null) return;

		let elemTop = this.controlsElem.clientHeight + elem.offsetTop;
		if (alwaysCenterCommit || elemTop - 8 < this.viewElem.scrollTop || elemTop + 32 - this.viewElem.clientHeight > this.viewElem.scrollTop) {
			this.viewElem.scroll(0, this.controlsElem.clientHeight + elem.offsetTop + 12 - this.viewElem.clientHeight / 2);
		}

		if (flash) this.flashCommitElem(elem);
	}

	/**
	 * Scroll to the commit checked out in the repository (HEAD) and flash it, loading more commits if HEAD is older
	 * than the commits currently loaded. Used by the "Scroll to HEAD" button and keyboard shortcut.
	 */
	private jumpToHead() {
		if (this.commitHead !== null) this.scrollToCommitLoadingMoreIfNeeded(this.commitHead);
	}

	/**
	 * Run the flash animation on a commit row (coloured with `--git-graph-flashPrimary` / `--git-graph-flashSecondary`).
	 * Only one row flashes at a time: flashing a row restarts the animation, even if it is already flashing.
	 * @param elem The row of the commit.
	 */
	private flashCommitElem(elem: HTMLElement) {
		const previous = this.flashingCommit;
		if (previous !== null) {
			clearTimeout(previous.timeout);
			previous.elem.classList.remove('flash');
		}
		// Reading the layout after removing the class lets the browser restart the CSS animation when it's added again
		void elem.offsetWidth;
		elem.classList.add('flash');
		this.flashingCommit = {
			elem: elem,
			timeout: setTimeout(() => {
				// Slightly longer than the animation, so the class is also removed when the animation didn't run (e.g. the view was hidden)
				elem.classList.remove('flash');
				this.flashingCommit = null;
			}, 850)
		};
	}

	/**
	 * Show (or hide) a banner with the actions for the operation in progress (rebase, merge, cherry-pick or revert),
	 * e.g. after a conflict or an "edit" stop of an interactive rebase.
	 */
	public renderOperationInProgress(repo: string, operation: GG.GitOperation | null) {
		if (repo !== this.currentRepo) return;
		let bannerElem = document.getElementById('operationBanner');
		if (operation === null) {
			if (bannerElem !== null) bannerElem.remove();
			return;
		}
		if (bannerElem === null) {
			bannerElem = document.createElement('div');
			bannerElem.id = 'operationBanner';
			this.controlsElem.appendChild(bannerElem);
		}
		const name = operation.charAt(0).toUpperCase() + operation.substring(1);
		bannerElem.innerHTML = SVG_ICONS.alert + '<span>A <b>' + operation + '</b> is in progress. Resolve any conflicts and stage the changes before continuing.</span>' +
			'<div class="roundedBtn" data-action="continue">Continue ' + name + '</div>' +
			(operation !== 'merge' ? '<div class="roundedBtn" data-action="skip">Skip Commit</div>' : '') +
			'<div class="roundedBtn" data-action="abort">Abort ' + name + '</div>';
		bannerElem.querySelectorAll('.roundedBtn').forEach((btn) => btn.addEventListener('click', () => {
			const action = <GG.GitOperationAction>(<HTMLElement>btn).dataset.action;
			const run = () => runAction({ command: 'operationAction', repo: this.currentRepo, operation: operation, action: action }, (action === 'continue' ? 'Continuing ' : action === 'skip' ? 'Skipping Commit in ' : 'Aborting ') + name);
			if (action === 'continue') {
				run();
			} else {
				dialog.showConfirmation(action === 'abort'
					? 'Are you sure you want to abort the ' + operation + '? This restores the state before the ' + operation + ' started.'
					: 'Are you sure you want to skip the current commit? Its changes will be discarded.', 'Yes, ' + action, run, { type: TargetType.Repo });
			}
		}));
	}

	/**
	 * Filter the commits by message (searching the entire history), e.g. when the Find Widget can't find the text in the loaded commits.
	 * @param text The text to filter by.
	 */
	public filterMessages(text: string) {
		this.messageFilterElem.value = text;
		this.messageFilterElem.dispatchEvent(new Event('change'));
	}

	/**
	 * Resolve a revision (e.g. an abbreviated commit hash entered in the Find Widget) to a commit, and scroll to it.
	 * @param ref The revision.
	 */
	public requestResolveCommit(ref: string) {
		sendMessage({ command: 'resolveCommit', repo: this.currentRepo, ref: ref });
	}

	public processResolveCommitResponse(msg: GG.ResponseResolveCommit) {
		if (msg.hash !== null && this.findWidget.isWaitingForCommit(msg.ref)) {
			this.scrollToCommitLoadingMoreIfNeeded(msg.hash);
		}
	}

	/**
	 * Scroll to a commit, loading more commits until it is loaded (e.g. HEAD can be older than the loaded commits).
	 */
	private scrollToCommitLoadingMoreIfNeeded(hash: string, attemptsRemaining: number = 20, silent: boolean = false) {
		if (typeof this.commitLookup[hash] === 'number') {
			this.scrollToCommit(hash, true, !silent);
		} else if (this.moreCommitsAvailable && attemptsRemaining > 0) {
			this.pendingScrollToCommit = { hash: hash, attemptsRemaining: attemptsRemaining - 1, silent: silent };
			this.loadMoreCommits();
		} else if (!silent) {
			dialog.showMessage('The commit <b><i>' + abbrevCommit(hash) + '</i></b> is not included in the commits currently shown in the graph (it may be excluded by the branch, author or path filters).');
		}
	}

	private loadMoreCommits() {
		this.footerElem.innerHTML = '<h2 id="loadingHeader">' + SVG_ICONS.loading + 'Loading ...</h2>';
		this.maxCommits += this.config.loadMoreCommits;
		this.saveState();
		this.requestLoadRepoInfoAndCommits(false, true);
	}

	private alignTableHeaderToControls() {
		if (!this.tableColHeadersElem) {
			return;
		}
	}


	/* Observers */

	private observeWindowSizeChanges() {
		let windowWidth = window.outerWidth, windowHeight = window.outerHeight;
		window.addEventListener('resize', () => {
			if (windowWidth === window.outerWidth && windowHeight === window.outerHeight) {
				this.renderGraph();
			} else {
				windowWidth = window.outerWidth;
				windowHeight = window.outerHeight;
			}

			if (this.config.stickyHeader) {
				this.alignTableHeaderToControls();
			}
		});
	}

	private observeWebviewStyleChanges() {
		let fontFamily = getVSCodeStyle(CSS_PROP_FONT_FAMILY),
			editorFontFamily = getVSCodeStyle(CSS_PROP_EDITOR_FONT_FAMILY),
			findMatchColour = getVSCodeStyle(CSS_PROP_FIND_MATCH_HIGHLIGHT_BACKGROUND),
			selectionBackgroundColor = !!getVSCodeStyle(CSS_PROP_SELECTION_BACKGROUND);

		// The flash animation uses the easy-graph.flashColour Extension Setting (already normalised to rgba() by the
		// extension), falling back to the colour used to highlight find matches
		const applyFlashColour = (findMatchHighlightColour: string) => {
			const colour = this.config.flashColour !== '' ? this.config.flashColour : findMatchHighlightColour, bodyStyle = document.body.style;
			bodyStyle.setProperty('--git-graph-flashPrimary', modifyColourOpacity(colour, 0.7));
			bodyStyle.setProperty('--git-graph-flashSecondary', modifyColourOpacity(colour, 0.5));
		};
		const setSelectionBackgroundColorExists = () => {
			alterClass(document.body, 'selection-background-color-exists', selectionBackgroundColor);
		};

		const applyFindMatchColour = () => {
			const colour = this.config.findMatchHighlightColour !== '' ? this.config.findMatchHighlightColour : findMatchColour;
			this.findWidget.setColour(colour);
			applyFlashColour(colour);
		};

		applyFindMatchColour();
		setSelectionBackgroundColorExists();

		(new MutationObserver(() => {
			let ff = getVSCodeStyle(CSS_PROP_FONT_FAMILY),
				eff = getVSCodeStyle(CSS_PROP_EDITOR_FONT_FAMILY),
				fmc = getVSCodeStyle(CSS_PROP_FIND_MATCH_HIGHLIGHT_BACKGROUND),
				sbc = !!getVSCodeStyle(CSS_PROP_SELECTION_BACKGROUND);

			if (ff !== fontFamily || eff !== editorFontFamily) {
				fontFamily = ff;
				editorFontFamily = eff;
				this.repoDropdown.refresh();
				this.branchDropdown.refresh();
				this.authorDropdown.refresh();
				this.displayDropdown.refresh();
				this.scopeDropdown.refresh();
			}
			if (fmc !== findMatchColour) {
				findMatchColour = fmc;
				applyFindMatchColour();
			}
			if (selectionBackgroundColor !== sbc) {
				selectionBackgroundColor = sbc;
				setSelectionBackgroundColorExists();
			}
		})).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
	}

	private observeViewScroll() {
		let active = this.viewElem.scrollTop > 0, timeout: ReturnType<typeof setTimeout> | null = null;
		this.viewElem.addEventListener('scroll', () => {
			const scrollTop = this.viewElem.scrollTop;
			if (active !== scrollTop > 0) {
				active = scrollTop > 0;
			}

			if (this.config.loadMoreCommitsAutomatically && this.moreCommitsAvailable && !this.currentRepoRefreshState.inProgress) {
				const viewHeight = this.viewElem.clientHeight, contentHeight = this.viewElem.scrollHeight;
				if (scrollTop > 0 && viewHeight > 0 && contentHeight > 0 && (scrollTop + viewHeight) >= contentHeight - 25) {
					// If the user has scrolled such that the bottom of the visible view is within 25px of the end of the content, load more commits.
					this.loadMoreCommits();
				}
			}

			if (timeout !== null) clearTimeout(timeout);
			timeout = setTimeout(() => {
				this.scrollTop = scrollTop;
				this.saveState();
				timeout = null;
			}, 250);
		});
	}

	private observeKeyboardEvents() {
		document.addEventListener('keydown', (e) => {
			if (contextMenu.isOpen()) {
				if (e.key === 'Escape') {
					contextMenu.close();
					handledEvent(e);
				}
			} else if (dialog.isOpen()) {
				if (e.key === 'Escape') {
					dialog.close();
					handledEvent(e);
				} else if (e.keyCode ? e.keyCode === 13 : e.key === 'Enter') {
					// Use keyCode === 13 to detect 'Enter' events if available (for compatibility with IME Keyboards used by Chinese / Japanese / Korean users)
					dialog.submit();
					handledEvent(e);
				}
			} else if (this.expandedCommit !== null && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !(e.target instanceof HTMLInputElement)) {
				const curHashIndex = this.commitLookup[this.expandedCommit.commitHash];
				let newHashIndex = -1;

				if (e.ctrlKey || e.metaKey) {
					// Up / Down navigates according to the order of commits on the branch
					if (e.shiftKey) {
						// Follow commits on alternative branches when possible
						if (e.key === 'ArrowUp') {
							newHashIndex = this.graph.getAlternativeChildIndex(curHashIndex);
						} else if (e.key === 'ArrowDown') {
							newHashIndex = this.graph.getAlternativeParentIndex(curHashIndex);
						}
					} else {
						// Follow commits on the same branch
						if (e.key === 'ArrowUp') {
							newHashIndex = this.graph.getFirstChildIndex(curHashIndex);
						} else if (e.key === 'ArrowDown') {
							newHashIndex = this.graph.getFirstParentIndex(curHashIndex);
						}
					}
				} else {
					// Up / Down navigates according to the order of commits in the table
					if (e.key === 'ArrowUp' && curHashIndex > 0) {
						newHashIndex = curHashIndex - 1;
					} else if (e.key === 'ArrowDown' && curHashIndex < this.commits.length - 1) {
						newHashIndex = curHashIndex + 1;
					}
				}

				if (newHashIndex > -1) {
					handledEvent(e);
					const elem = findCommitElemWithId(getCommitElems(), newHashIndex);
					if (elem !== null) {
						this.selectOnlyCommit(this.commits[newHashIndex].hash);
						this.loadCommitDetails(elem);
						// Without "commitDetailsView.autoScroll", navigating with the keyboard still keeps the commit visible
						if (!this.config.commitDetailsView.autoScroll) this.scrollToCommit(this.commits[newHashIndex].hash, false);
					}
				}
			} else if (e.key && e.key.toLowerCase() === 'f' && !e.shiftKey && !e.altKey && isKeybindingModifierPressed(e, this.config.keybindings.modifier)) {
				// The only keyboard shortcut of the view, other modifier combinations are left to Visual Studio Code
				this.findWidget.show(true);
				handledEvent(e);
			} else if (e.key === 'Escape') {
				if (this.repoDropdown.isOpen()) {
					this.repoDropdown.close();
					handledEvent(e);
				} else if (this.branchDropdown.isOpen()) {
					this.branchDropdown.close();
					handledEvent(e);
				} else if (this.authorDropdown.isOpen()) {
					this.authorDropdown.close();
					handledEvent(e);
				} else if (this.displayDropdown.isOpen()) {
					this.displayDropdown.close();
					handledEvent(e);
				} else if (this.scopeDropdown.isOpen()) {
					this.scopeDropdown.close();
					handledEvent(e);
				} else if (this.settingsWidget.isVisible()) {
					this.settingsWidget.close();
					handledEvent(e);
				} else if (this.findWidget.isVisible()) {
					this.findWidget.close();
					handledEvent(e);
				} else if (this.expandedCommit !== null) {
					this.closeCommitDetails(true);
					handledEvent(e);
				} else if (this.graph.clearHighlightedLine()) {
					handledEvent(e);
				}
			}
		});

		// Mouse back / forward buttons navigate the Visual Studio Code history
		document.addEventListener('mouseup', (e) => {
			if (e.button === 3 || e.button === 4) {
				handledEvent(e);
				sendMessage({ command: 'navigateHistory', forward: e.button === 4 });
			}
		});
	}

	private observeUrls() {
		const followInternalLink = (e: MouseEvent) => {
			if (e.target !== null && isInternalUrlElem(<Element>e.target)) {
				const value = unescapeHtml((<HTMLElement>e.target).dataset.value!);
				switch ((<HTMLElement>e.target).dataset.type!) {
					case 'commit':
						if (typeof this.commitLookup[value] === 'number' && (this.expandedCommit === null || this.expandedCommit.commitHash !== value || this.expandedCommit.compareWithHash !== null)) {
							const elem = findCommitElemWithId(getCommitElems(), this.commitLookup[value]);
							if (elem !== null) this.loadCommitDetails(elem);
						}
						break;
				}
			}
		};

		document.body.addEventListener('click', followInternalLink);

		// The webview only opens http(s) and mailto links natively, open links with other schemes (e.g. custom issue linking schemes) via the extension
		document.body.addEventListener('click', (e: MouseEvent) => {
			if (e.target === null) return;
			const linkElem = (<Element>e.target).closest('a.' + CLASS_EXTERNAL_URL);
			if (linkElem !== null && !/^(https?|mailto):/i.test((<HTMLAnchorElement>linkElem).href)) {
				handledEvent(e);
				sendMessage({ command: 'openExternalUrl', url: (<HTMLAnchorElement>linkElem).href });
			}
		});

		document.body.addEventListener('contextmenu', (e: MouseEvent) => {
			if (e.target === null) return;
			const eventTarget = <Element>e.target;

			const isExternalUrl = isExternalUrlElem(eventTarget), isInternalUrl = isInternalUrlElem(eventTarget);
			if (isExternalUrl || isInternalUrl) {
				const viewElem: HTMLElement | null = eventTarget.closest('#view');
				let eventElem: HTMLElement | null;

				let target: (ContextMenuTarget & CommitTarget) | RepoTarget, isInDialog = false;
				if (this.expandedCommit !== null && eventTarget.closest('#cdv') !== null) {
					// URL is in the Commit Details View
					target = {
						type: TargetType.CommitDetailsView,
						hash: this.expandedCommit.commitHash,
						index: this.commitLookup[this.expandedCommit.commitHash],
						elem: <HTMLElement>eventTarget
					};
					GitGraphView.closeCdvContextMenuIfOpen(this.expandedCommit);
					this.expandedCommit.contextMenuOpen.summary = true;
				} else if ((eventElem = eventTarget.closest('.commit')) !== null) {
					// URL is in the Commits
					const commit = this.getCommitOfElem(eventElem);
					if (commit === null) return;
					target = {
						type: TargetType.Commit,
						hash: commit.hash,
						index: parseInt(eventElem.dataset.id!),
						elem: <HTMLElement>eventTarget
					};
				} else {
					// URL is in a dialog
					target = {
						type: TargetType.Repo
					};
					isInDialog = true;
				}

				handledEvent(e);
				contextMenu.show([
					[
						{
							title: 'Open URL',
							visible: isExternalUrl,
							onClick: () => {
								sendMessage({ command: 'openExternalUrl', url: (<HTMLAnchorElement>eventTarget).href });
							}
						},
						{
							title: 'Follow Internal Link',
							visible: isInternalUrl,
							onClick: () => followInternalLink(e)
						},
						{
							title: 'Copy URL to Clipboard',
							visible: isExternalUrl,
							onClick: () => {
								sendMessage({ command: 'copyToClipboard', type: 'External URL', data: (<HTMLAnchorElement>eventTarget).href });
							}
						}
					]
				], false, target, e, viewElem || document.body, () => {
					if (target.type === TargetType.CommitDetailsView && this.expandedCommit !== null) {
						this.expandedCommit.contextMenuOpen.summary = false;
					}
				}, isInDialog ? 'dialogContextMenu' : null);
			}
		});

		// The native webview context menu items are hidden (their Copy doesn't work), so right clicking selected text
		// that doesn't have its own context menu shows a context menu that can copy it
		document.addEventListener('contextmenu', (e: MouseEvent) => {
			if (e.defaultPrevented || getSelectedText() === null) return;
			const eventTarget = e.target instanceof Element ? e.target : null;
			const dialogElem = eventTarget !== null ? <HTMLElement | null>eventTarget.closest('.dialog') : null;
			handledEvent(e);
			contextMenu.show([], false, null, e, dialogElem !== null ? document.body : this.viewElem, null, dialogElem !== null ? 'dialogContextMenu' : null);
		});
	}

	private observeTableEvents() {

		// Register Click Event Handler
		this.tableElem.addEventListener('click', (e: MouseEvent) => {
			if (e.target === null) return;
			const eventTarget = <Element>e.target;
			if (isUrlElem(eventTarget)) return;
			let eventElem: HTMLElement | null;

			if ((eventElem = eventTarget.closest('.gitRef')) !== null) {
				// .gitRef was clicked
				e.stopPropagation();
				if (contextMenu.isOpen()) {
					contextMenu.close();
				}

			} else if ((eventElem = eventTarget.closest('.commit')) !== null) {
				// .commit was clicked
				const commit = this.getCommitOfElem(eventElem);
				if (commit === null) return;

				if (e.ctrlKey || e.metaKey) {
					this.toggleCommitInSelection(commit.hash);
				} else if (e.shiftKey) {
					this.selectCommitsFromAnchorTo(commit.hash);
				} else if (this.expandedCommit !== null && this.expandedCommit.commitHash === commit.hash) {
					// Clicking the commit that is open closes the Commit Details View, and leaves nothing selected
					this.closeCommitDetails(true);
					this.clearCommitSelection();
				} else {
					this.selectOnlyCommit(commit.hash);
					this.loadCommitDetails(eventElem);
				}
			}
		});

		// Register Double Click Event Handler
		this.tableElem.addEventListener('dblclick', (e: MouseEvent) => {
			if (e.target === null) return;
			const eventTarget = <Element>e.target;
			if (isUrlElem(eventTarget)) return;
			let eventElem: HTMLElement | null;

			if ((eventElem = eventTarget.closest('.gitRef')) !== null) {
				// .gitRef was double clicked
				e.stopPropagation();
				closeDialogAndContextMenu();
				const commitElem = <HTMLElement>eventElem.closest('.commit')!;
				const commit = this.getCommitOfElem(commitElem);
				if (commit === null) return;

				if (eventElem.classList.contains(CLASS_REF_HEAD) || eventElem.classList.contains(CLASS_REF_REMOTE)) {
					let sourceElem = <HTMLElement>eventElem.children[1];
					let refName = unescapeHtml(eventElem.dataset.name!), isHead = eventElem.classList.contains(CLASS_REF_HEAD), isRemoteCombinedWithHead = eventTarget.classList.contains('gitRefHeadRemote');
					if (isHead && isRemoteCombinedWithHead) {
						refName = unescapeHtml((<HTMLElement>eventTarget).dataset.fullref!);
						sourceElem = <HTMLElement>eventTarget;
						isHead = false;
					}

					const target: ContextMenuTarget & DialogTarget & RefTarget = {
						type: TargetType.Ref,
						hash: commit.hash,
						index: parseInt(commitElem.dataset.id!),
						ref: refName,
						elem: sourceElem
					};

					this.checkoutBranchAction(refName, isHead ? null : unescapeHtml((isRemoteCombinedWithHead ? <HTMLElement>eventTarget : eventElem).dataset.remote!), null, target);
				}
			}
		});

		// Register ContextMenu Event Handler
		this.tableElem.addEventListener('contextmenu', (e: Event) => {
			if (e.target === null) return;
			const eventTarget = <Element>e.target;
			if (isUrlElem(eventTarget)) return;
			let eventElem: HTMLElement | null;

			if ((eventElem = eventTarget.closest('.gitRef')) !== null) {
				// .gitRef was right clicked
				handledEvent(e);
				const commitElem = <HTMLElement>eventElem.closest('.commit')!;
				const commit = this.getCommitOfElem(commitElem);
				if (commit === null) return;

				const target: ContextMenuTarget & DialogTarget & RefTarget = {
					type: TargetType.Ref,
					hash: commit.hash,
					index: parseInt(commitElem.dataset.id!),
					ref: unescapeHtml(eventElem.dataset.name!),
					elem: <HTMLElement>eventElem.children[1]
				};

				let actions: ContextMenuActions;
				if (eventElem.classList.contains(CLASS_REF_STASH)) {
					actions = this.getStashContextMenuActions(target);
				} else if (eventElem.classList.contains(CLASS_REF_TAG)) {
					actions = this.getTagContextMenuActions(eventElem.dataset.tagtype === 'annotated', target);
				} else {
					let isHead = eventElem.classList.contains(CLASS_REF_HEAD), isRemoteCombinedWithHead = eventTarget.classList.contains('gitRefHeadRemote');
					if (isHead && isRemoteCombinedWithHead) {
						target.ref = unescapeHtml((<HTMLElement>eventTarget).dataset.fullref!);
						target.elem = <HTMLElement>eventTarget;
						isHead = false;
					}
					if (isHead) {
						actions = this.getBranchContextMenuActions(target);
					} else {
						const remote = unescapeHtml((isRemoteCombinedWithHead ? <HTMLElement>eventTarget : eventElem).dataset.remote!);
						actions = this.getRemoteBranchContextMenuActions(remote, target);
					}
				}

				contextMenu.show(actions, false, target, <MouseEvent>e, this.viewElem);

			} else if ((eventElem = eventTarget.closest('.commit')) !== null) {
				// .commit was right clicked
				handledEvent(e);
				const commit = this.getCommitOfElem(eventElem);
				if (commit === null) return;

				// Right clicking a commit leaves the selection and the Commit Details View as they are, a selected commit opens the menu of the selection
				const target: ContextMenuTarget & DialogTarget & CommitTarget = {
					type: TargetType.Commit,
					hash: commit.hash,
					index: parseInt(eventElem.dataset.id!),
					elem: eventElem
				};

				let actions: ContextMenuActions;
				if (commit.hash === UNCOMMITTED) {
					actions = this.getUncommittedChangesContextMenuActions(target);
				} else if (commit.stash !== null) {
					target.ref = commit.stash.selector;
					actions = this.getStashContextMenuActions(<RefTarget>target);
				} else {
					if (this.selectedCommits.has(commit.hash) && this.getSelectedCommitsArray().length > 1) {
						actions = this.getMultiSelectCommitContextMenuActions(target);
					} else {
						actions = this.getCommitContextMenuActions(target);
					}
				}

				contextMenu.show(actions, false, target, <MouseEvent>e, this.viewElem);
			}
		});
	}


	/* Commit Details View */

	public loadCommitDetails(commitElem: HTMLElement) {
		const commit = this.getCommitOfElem(commitElem);
		if (commit === null) return;

		this.closeCommitDetails(false);
		this.saveExpandedCommitLoading(parseInt(commitElem.dataset.id!), commit.hash, commitElem, null, null);
		commitElem.classList.add(CLASS_COMMIT_DETAILS_OPEN);
		this.renderCommitDetailsView(false);
		this.requestCommitDetails(commit.hash, false);
	}

	public closeCommitDetails(saveAndRender: boolean) {
		const expandedCommit = this.expandedCommit;
		if (expandedCommit === null) return;

		const elem = document.getElementById('cdv'), isDocked = this.isCdvDocked();
		if (elem !== null) {
			elem.remove();
		}
		if (isDocked) {
			this.viewElem.style.bottom = '0px';
		}
		if (expandedCommit.commitElem !== null) {
			expandedCommit.commitElem.classList.remove(CLASS_COMMIT_DETAILS_OPEN);
		}
		if (expandedCommit.compareWithElem !== null) {
			expandedCommit.compareWithElem.classList.remove(CLASS_COMMIT_DETAILS_OPEN);
		}
		GitGraphView.closeCdvContextMenuIfOpen(expandedCommit);
		this.expandedCommit = null;
		if (saveAndRender) {
			this.saveState();
			if (!isDocked) {
				this.renderGraph();
			}
		}
	}

	public showCommitDetails(commitDetails: GG.GitCommitDetails, fileTree: FileTreeFolder, avatar: string | null, codeReview: GG.CodeReview | null, lastViewedFile: string | null, refresh: boolean) {
		const expandedCommit = this.expandedCommit;
		if (expandedCommit === null || expandedCommit.commitElem === null || expandedCommit.commitHash !== commitDetails.hash || expandedCommit.compareWithHash !== null) return;

		if (!this.isCdvDocked()) {
			const elem = document.getElementById('cdv');
			if (elem !== null) elem.remove();
		}

		expandedCommit.commitDetails = commitDetails;
		if (haveFilesChanged(expandedCommit.fileChanges, commitDetails.fileChanges)) {
			expandedCommit.fileChanges = commitDetails.fileChanges;
			expandedCommit.fileTree = fileTree;
			GitGraphView.closeCdvContextMenuIfOpen(expandedCommit);
		}
		expandedCommit.avatar = avatar;
		expandedCommit.codeReview = codeReview;
		if (!refresh) {
			expandedCommit.lastViewedFile = lastViewedFile;
		}
		expandedCommit.commitElem.classList.add(CLASS_COMMIT_DETAILS_OPEN);
		expandedCommit.loading = false;
		this.saveState();

		this.renderCommitDetailsView(refresh);
		sendMessage({ command: 'loadCommitNotes', repo: this.currentRepo, commitHash: commitDetails.hash });
	}

	/**
	 * Show the notes (`git notes`) of a commit in the Commit Details View.
	 */
	public showCommitNotes(commitHash: string, notes: string | null) {
		this.commitNotes[commitHash] = notes;
		const notesElem = document.getElementById('cdvNotes');
		if (notesElem !== null && notesElem.dataset.hash === commitHash) {
			notesElem.innerHTML = this.getCommitNotesHtml(commitHash);
		}
		const pending = this.pendingEditCommitNotes;
		if (pending !== null && pending.hash === commitHash) {
			this.pendingEditCommitNotes = null;
			this.editCommitNotesAction(commitHash, pending.target);
		}
	}

	/**
	 * Reload the notes of a commit (e.g. after they were edited).
	 * @param commitHash The hash of the commit.
	 */
	public reloadCommitNotes(commitHash: string) {
		delete this.commitNotes[commitHash];
		sendMessage({ command: 'loadCommitNotes', repo: this.currentRepo, commitHash: commitHash });
	}

	private getCommitNotesHtml(commitHash: string) {
		const notes = this.commitNotes[commitHash];
		if (typeof notes === 'undefined') return '';
		return (notes !== null ? '<br><br><b>Notes:</b><br>' + escapeHtml(notes).replace(/\n/g, '<br>') : '')
			+ '<br><br><span class="cdvSummaryAction cdvEditNotes" tabindex="-1">' + (notes !== null ? 'Edit Notes' : 'Add Notes') + ELLIPSIS + '</span>';
	}

	/**
	 * Show the branches containing a commit in the Commit Details View.
	 */
	public showBranchesContainingCommit(commitHash: string, branches: ReadonlyArray<string>, error: GG.ErrorInfo) {
		const expandedCommit = this.expandedCommit;
		if (expandedCommit === null || expandedCommit.commitHash !== commitHash || expandedCommit.compareWithHash !== null) return;
		expandedCommit.containedInBranches = error === null ? branches : error;
		const elem = document.getElementById('cdvContainedIn');
		if (elem !== null) elem.innerHTML = this.getContainedInBranchesHtml(expandedCommit);
	}

	private getContainedInBranchesHtml(expandedCommit: ExpandedCommit) {
		const branches = expandedCommit.containedInBranches;
		if (typeof branches === 'undefined') {
			return '<span class="cdvSummaryAction cdvShowContainedIn" tabindex="-1">Show</span>';
		} else if (branches === null) {
			return 'Loading' + ELLIPSIS;
		} else if (typeof branches === 'string') {
			return 'Unable to load the branches: ' + escapeHtml(branches);
		} else {
			return branches.length > 0 ? escapeHtml(branches.join(', ')) : 'None';
		}
	}

	public createFileTree(gitFiles: ReadonlyArray<GG.GitFileChange>, codeReview: GG.CodeReview | null) {
		const repo = this.currentRepo;
		// Repositories nested in the current one (e.g. submodules) are displayed as a single entry
		const files = buildFileTree(gitFiles, codeReview, (relPath) => {
			const absPath = repo + '/' + relPath;
			return Object.prototype.hasOwnProperty.call(this.gitRepos, absPath) ? absPath : null;
		});
		if (codeReview !== null) calcFileTreeFoldersReviewed(files);
		return files;
	}


	/* Commit Comparison View */

	/**
	 * Compare a commit with the working tree: with the "Uncommitted Changes" row when there are uncommitted changes,
	 * otherwise with HEAD (which is then identical to the working tree).
	 */
	private compareWithWorkingTreeAction(hash: string, commitElem: HTMLElement) {
		const commitElems = getCommitElems();
		const compareWithHash = this.commits.length > 0 && this.commits[0].hash === UNCOMMITTED ? UNCOMMITTED : this.commitHead;
		const compareWithElem = compareWithHash !== null && compareWithHash !== hash ? findCommitElemWithId(commitElems, this.getCommitId(compareWithHash)) : null;
		if (compareWithElem === null) {
			dialog.showMessage(compareWithHash === hash ? 'The working tree has no changes compared to this commit.' : 'Unable to find HEAD in the loaded commits.');
			return;
		}
		this.loadCommitComparison(commitElem, compareWithElem);
	}

	private loadCommitComparison(commitElem: HTMLElement, compareWithElem: HTMLElement) {
		const commit = this.getCommitOfElem(commitElem);
		const compareWithCommit = this.getCommitOfElem(compareWithElem);

		if (commit !== null && compareWithCommit !== null) {
			if (this.expandedCommit !== null) {
				if (this.expandedCommit.commitHash !== commit.hash) {
					this.closeCommitDetails(false);
				} else if (this.expandedCommit.compareWithHash !== compareWithCommit.hash) {
					this.closeCommitComparison(false);
				}
			}

			this.saveExpandedCommitLoading(parseInt(commitElem.dataset.id!), commit.hash, commitElem, compareWithCommit.hash, compareWithElem);
			commitElem.classList.add(CLASS_COMMIT_DETAILS_OPEN);
			compareWithElem.classList.add(CLASS_COMMIT_DETAILS_OPEN);
			this.renderCommitDetailsView(false);
			this.requestCommitComparison(commit.hash, compareWithCommit.hash, false);
		}
	}

	public closeCommitComparison(saveAndRequestCommitDetails: boolean) {
		const expandedCommit = this.expandedCommit;
		if (expandedCommit === null || expandedCommit.compareWithHash === null) return;

		if (expandedCommit.compareWithElem !== null) {
			expandedCommit.compareWithElem.classList.remove(CLASS_COMMIT_DETAILS_OPEN);
		}
		GitGraphView.closeCdvContextMenuIfOpen(expandedCommit);
		if (saveAndRequestCommitDetails) {
			if (expandedCommit.commitElem !== null) {
				this.saveExpandedCommitLoading(expandedCommit.index, expandedCommit.commitHash, expandedCommit.commitElem, null, null);
				this.renderCommitDetailsView(false);
				this.requestCommitDetails(expandedCommit.commitHash, false);
			} else {
				this.closeCommitDetails(true);
			}
		}
	}

	public showCommitComparison(commitHash: string, compareWithHash: string, fileChanges: ReadonlyArray<GG.GitFileChange>, fileTree: FileTreeFolder, codeReview: GG.CodeReview | null, lastViewedFile: string | null, refresh: boolean) {
		const expandedCommit = this.expandedCommit;
		if (expandedCommit === null || expandedCommit.commitElem === null || expandedCommit.compareWithElem === null || expandedCommit.commitHash !== commitHash || expandedCommit.compareWithHash !== compareWithHash) return;

		if (haveFilesChanged(expandedCommit.fileChanges, fileChanges)) {
			expandedCommit.fileChanges = fileChanges;
			expandedCommit.fileTree = fileTree;
			GitGraphView.closeCdvContextMenuIfOpen(expandedCommit);
		}
		expandedCommit.codeReview = codeReview;
		if (!refresh) {
			expandedCommit.lastViewedFile = lastViewedFile;
		}
		expandedCommit.commitElem.classList.add(CLASS_COMMIT_DETAILS_OPEN);
		expandedCommit.compareWithElem.classList.add(CLASS_COMMIT_DETAILS_OPEN);
		expandedCommit.loading = false;
		this.saveState();

		this.renderCommitDetailsView(refresh);
	}


	/* Render Commit Details / Comparison View */

	private renderCommitDetailsView(refresh: boolean) {
		const expandedCommit = this.expandedCommit;
		if (expandedCommit === null || expandedCommit.commitElem === null) return;

		let elem = document.getElementById('cdv'), html = '<div id="cdvContent">', isDocked = this.isCdvDocked();
		const commitOrder = this.getCdvCommitOrder(expandedCommit);
		const codeReviewPossible = !expandedCommit.loading && commitOrder.to !== UNCOMMITTED;
		const externalDiffPossible = !expandedCommit.loading && (expandedCommit.compareWithHash !== null || this.commits[this.commitLookup[expandedCommit.commitHash]].parents.length > 0);

		if (elem === null) {
			elem = document.createElement(isDocked ? 'div' : 'tr');
			elem.id = 'cdv';
			elem.className = isDocked ? 'docked' : 'inline';
			this.setCdvHeight(elem, isDocked);
			if (isDocked) {
				document.body.appendChild(elem);
			} else {
				insertAfter(elem, expandedCommit.commitElem);
			}
		}

		if (expandedCommit.loading) {
			html += '<div id="cdvFiles"></div><div id="cdvLoading">' + SVG_ICONS.loading + ' Loading ' + (expandedCommit.compareWithHash === null ? expandedCommit.commitHash !== UNCOMMITTED ? 'Commit Details' : 'Uncommitted Changes' : 'Commit Comparison') + ' ...</div>';
		} else {
			html += '<div id="cdvSummary">';
			if (expandedCommit.compareWithHash === null) {
				// Commit details should be shown
				if (expandedCommit.commitHash !== UNCOMMITTED) {
					const textFormatter = new TextFormatter(this.commits, this.gitRepos[this.currentRepo].issueLinkingConfig, {
						commits: true,
						emoji: true,
						issueLinking: true,
						markdown: this.config.markdown,
						multiline: true,
						urls: true
					});
					const commitDetails = expandedCommit.commitDetails!;
					const hiddenFields = this.config.commitDetailsView.hiddenFields;
					const parents = commitDetails.parents.length > 0
						? commitDetails.parents.map((parent) => {
							const escapedParent = escapeHtml(parent);
							return typeof this.commitLookup[parent] === 'number'
								? '<span class="' + CLASS_INTERNAL_URL + '" data-type="commit" data-value="' + escapedParent + '" tabindex="-1">' + escapedParent + '</span>'
								: escapedParent;
						}).join(', ')
						: 'None';
					// List all refs of the commit, as the ref labels in the graph can be truncated when a commit has many refs
					const commitIndex = this.commitLookup[commitDetails.hash];
					const commit = typeof commitIndex === 'number' ? this.commits[commitIndex] : null;
					const branchNames = commit !== null ? commit.heads.concat(commit.remotes.map((remote) => remote.name)) : [];
					const tagNames = commit !== null ? commit.tags.map((tag) => tag.name) : [];
					// The fields listed in the "commitDetailsView.hiddenFields" setting are not displayed
					const rows: string[] = ['<b>Commit: </b><span id="cdvCommitHash" title="Click to copy the Commit Hash, Ctrl/Cmd+Click to open the Commit on the remote" tabindex="-1">' + escapeHtml(commitDetails.hash) + '</span>'];
					if (!hiddenFields.includes('parents')) rows.push('<b>Parents: </b>' + parents);
					if (!hiddenFields.includes('branches') && branchNames.length > 0) rows.push('<b>Branches: </b>' + escapeHtml(branchNames.join(', ')));
					if (!hiddenFields.includes('tags') && tagNames.length > 0) rows.push('<b>Tags: </b>' + escapeHtml(tagNames.join(', ')));
					if (!hiddenFields.includes('containedInBranches')) rows.push('<b>Contained in: </b><span id="cdvContainedIn">' + this.getContainedInBranchesHtml(expandedCommit) + '</span>');
					if (!hiddenFields.includes('author')) rows.push('<b>Author: </b>' + escapeHtml(commitDetails.author) + (commitDetails.authorEmail !== '' ? ' &lt;<a class="' + CLASS_EXTERNAL_URL + '" href="mailto:' + escapeHtml(commitDetails.authorEmail) + '" tabindex="-1">' + escapeHtml(commitDetails.authorEmail) + '</a>&gt;' : ''));
					if (!hiddenFields.includes('date') && commitDetails.authorDate !== commitDetails.committerDate) rows.push('<b>Author Date: </b>' + formatLongDate(commitDetails.authorDate));
					if (!hiddenFields.includes('committer')) rows.push('<b>Committer: </b>' + escapeHtml(commitDetails.committer) + (commitDetails.committerEmail !== '' ? ' &lt;<a class="' + CLASS_EXTERNAL_URL + '" href="mailto:' + escapeHtml(commitDetails.committerEmail) + '" tabindex="-1">' + escapeHtml(commitDetails.committerEmail) + '</a>&gt;' : '') + (commitDetails.signature !== null ? generateSignatureHtml(commitDetails.signature) : ''));
					if (!hiddenFields.includes('date')) rows.push('<b>' + (commitDetails.authorDate !== commitDetails.committerDate ? 'Committer ' : '') + 'Date: </b>' + formatLongDate(commitDetails.committerDate));
					if (!hiddenFields.includes('changes')) rows.push('<b>Changes: </b>' + generateFileChangesStatsHtml(expandedCommit.fileChanges!));
					html += '<span class="cdvSummaryTop' + (expandedCommit.avatar !== null ? ' withAvatar' : '') + '"><span class="cdvSummaryTopRow"><span class="cdvSummaryKeyValues">'
						+ rows.join('<br>')
						+ '</span>'
						+ (expandedCommit.avatar !== null ? '<span class="cdvSummaryAvatar"><img src="' + expandedCommit.avatar + '"></span>' : '')
						+ '</span></span><br><br>' + textFormatter.format(commitDetails.body)
						+ (!hiddenFields.includes('notes') ? '<div id="cdvNotes" data-hash="' + escapeHtml(commitDetails.hash) + '">' + this.getCommitNotesHtml(commitDetails.hash) + '</div>' : '');
				} else {
					// The uncommitted changes can be displayed all together, or split into the staged and unstaged changes
					const groups: { group: GG.UncommittedGroup, name: string }[] = [{ group: 'all', name: 'All' }, { group: 'staged', name: 'Staged' }, { group: 'unstaged', name: 'Unstaged' }];
					html += 'Displaying ' + (this.uncommittedGroup === 'all' ? 'all' : 'the ' + this.uncommittedGroup) + ' uncommitted changes.'
						+ '<div id="cdvUncommittedGroups">' + groups.map((group) => '<span class="cdvUncommittedGroup' + (group.group === this.uncommittedGroup ? ' ' + CLASS_ACTIVE : '') + '" data-group="' + group.group + '">' + group.name + '</span>').join('') + '</div>'
						+ (!this.config.commitDetailsView.hiddenFields.includes('changes') ? '<b>Changes: </b>' + generateFileChangesStatsHtml(expandedCommit.fileChanges!) : '');
				}
			} else {
				// Commit comparison should be shown
				html += 'Displaying all changes from <b>' + commitOrder.from + '</b> to <b>' + (commitOrder.to !== UNCOMMITTED ? commitOrder.to : 'Uncommitted Changes') + '</b>.'
					+ (commitOrder.from !== UNCOMMITTED && commitOrder.to !== UNCOMMITTED ? ' <span id="cdvSwapComparison" class="cdvSummaryAction" title="Swap the direction of the comparison" tabindex="-1">Swap</span>' : '')
					+ (this.config.contextMenuActionsVisibility.commitDetailsViewFile.viewAllChanges ? ' <span id="cdvViewAllChanges" class="cdvSummaryAction" title="View the changes of all files in one editor" tabindex="-1">View All Changes</span>' : '')
					+ (!this.config.commitDetailsView.hiddenFields.includes('changes') ? '<br><br><b>Changes: </b>' + generateFileChangesStatsHtml(expandedCommit.fileChanges!) : '');
			}
			html += '</div><div id="cdvFiles">' + (!isDocked ? '<div id="cdvSummaryToggleBtn">' + SVG_ICONS.collapse + '</div>' : '') + '<div id="cdvFilesFilter"><input id="cdvFilesFilterInput" type="text" placeholder="Filter Files (* matches any characters)" spellcheck="false" value="' + escapeHtml(expandedCommit.fileFilter || '') + '"></div><div id="cdvFilesViewWrapper"><div id="cdvFilesView">' + generateFileViewHtml(expandedCommit.fileTree!, expandedCommit.fileChanges!, expandedCommit.lastViewedFile, expandedCommit.contextMenuOpen.fileView, this.getFileViewType(), commitOrder.to === UNCOMMITTED) + '</div></div></div><div id="cdvDivider"></div>';
		}
		html += '</div><div id="cdvControls"><div id="cdvClose" class="cdvControlBtn" title="Close">' + SVG_ICONS.close + '</div>' +
			(codeReviewPossible ? '<div id="cdvCodeReview" class="cdvControlBtn">' + SVG_ICONS.review + '</div>' : '') +
			(!expandedCommit.loading ? '<div id="cdvFileViewTypeList" class="cdvControlBtn cdvFileViewTypeBtn" title="File List View">' + SVG_ICONS.fileList + '</div><div id="cdvFileViewTypeTree" class="cdvControlBtn cdvFileViewTypeBtn" title="File Tree View">' + SVG_ICONS.fileTree + '</div><div id="cdvCollapse" class="cdvControlBtn cdvFolderBtn" title="Collapse/Expand Folders">' + SVG_ICONS.collapseAll + '</div><div id="cdvExpand" class="cdvControlBtn cdvFolderBtn" title="Expand Folders">' + SVG_ICONS.expandAll + '</div>' : '') +
			(externalDiffPossible ? '<div id="cdvExternalDiff" class="cdvControlBtn">' + SVG_ICONS.linkExternal + '</div>' : '') +
			'</div><div class="cdvHeightResize"></div>';

		const filterInputFocused = document.activeElement !== null && document.activeElement.id === 'cdvFilesFilterInput';
		elem.innerHTML = isDocked ? html : '<td><div class="cdvHeightResize"></div></td><td colspan="' + (this.getNumColumns() - 1) + '"><div id="cdvContentWrapper">' + html + '</div></td>';
		this.setCdvDivider();
		this.setCdvHeight(elem, isDocked);
		if (!isDocked) this.renderGraph();

		// Opening the view scrolls it into view, unless "commitDetailsView.autoScroll" is disabled
		if (!refresh && this.config.commitDetailsView.autoScroll) {
			this.scrollCdvIntoView(elem, expandedCommit.commitElem, isDocked);
		}

		this.makeCdvResizable();
		document.getElementById('cdvClose')!.addEventListener('click', () => {
			this.closeCommitDetails(true);
		});

		if (!expandedCommit.loading) {
			this.applyCdvFileFilter();
			this.makeCdvFileViewInteractive();
			this.renderCdvFileViewTypeBtns();
			this.makeCdvSummaryInteractive();
			const filterInputElem = <HTMLInputElement | null>document.getElementById('cdvFilesFilterInput');
			if (filterInputFocused && filterInputElem !== null) {
				// Keep typing in the file filter when the Commit Details View is refreshed
				filterInputElem.focus();
				filterInputElem.setSelectionRange(filterInputElem.value.length, filterInputElem.value.length);
			}
			this.renderCdvExternalDiffBtn();
			this.makeCdvDividerDraggable();

			observeElemScroll('cdvSummary', expandedCommit.scrollTop.summary, (scrollTop) => {
				if (this.expandedCommit === null) return;
				this.expandedCommit.scrollTop.summary = scrollTop;
				if (this.expandedCommit.contextMenuOpen.summary) {
					this.expandedCommit.contextMenuOpen.summary = false;
					contextMenu.close();
				}
			}, () => this.saveState());

			this.observeCdvFileViewScroll(expandedCommit.scrollTop.fileView);

			document.getElementById('cdvFileViewTypeTree')!.addEventListener('click', () => {
				this.changeFileViewType(GG.FileViewType.Tree);
			});

			document.getElementById('cdvFileViewTypeList')!.addEventListener('click', () => {
				this.changeFileViewType(GG.FileViewType.List);
			});
			document.getElementById('cdvCollapse')!.addEventListener('click', () => {
				this.openFolders(false);
			});
			document.getElementById('cdvExpand')!.addEventListener('click', () => {
				this.openFolders(true);
			});
			const summaryToggleElem = document.getElementById('cdvSummaryToggleBtn');
			if (summaryToggleElem !== null) {
				summaryToggleElem.addEventListener('click', () => this.toggleCdvSummaryCollapsed());
			}
			this.renderCdvSummaryCollapsed();

			if (codeReviewPossible) {
				this.renderCodeReviewBtn();
				document.getElementById('cdvCodeReview')!.addEventListener('click', (e) => {
					const expandedCommit = this.expandedCommit;
					if (expandedCommit === null || e.target === null) return;
					let sourceElem = <HTMLElement>(<Element>e.target).closest('#cdvCodeReview')!;
					if (sourceElem.classList.contains(CLASS_ACTIVE)) {
						sendMessage({ command: 'endCodeReview', repo: this.currentRepo, id: expandedCommit.codeReview!.id });
						this.endCodeReview();
					} else {
						const commitOrder = this.getCdvCommitOrder(expandedCommit);
						const id = expandedCommit.compareWithHash !== null ? commitOrder.from + '-' + commitOrder.to : expandedCommit.commitHash;
						sendMessage({
							command: 'startCodeReview',
							repo: this.currentRepo,
							id: id,
							commitHash: expandedCommit.commitHash,
							compareWithHash: expandedCommit.compareWithHash,
							files: getFilesInTree(expandedCommit.fileTree!, expandedCommit.fileChanges!),
							lastViewedFile: expandedCommit.lastViewedFile
						});
					}
				});
			}

			if (externalDiffPossible) {
				document.getElementById('cdvExternalDiff')!.addEventListener('click', () => {
					const expandedCommit = this.expandedCommit;
					if (expandedCommit === null || this.gitConfig === null || (this.gitConfig.diffTool === null && this.gitConfig.guiDiffTool === null)) return;
					const commitOrder = this.getCdvCommitOrder(expandedCommit);
					runAction({
						command: 'openExternalDirDiff',
						repo: this.currentRepo,
						fromHash: commitOrder.from,
						toHash: commitOrder.to,
						isGui: this.gitConfig.guiDiffTool !== null
					}, 'Opening External Directory Diff');
				});
			}
		}
	}

	/**
	 * Register the event listeners of the actions in the summary and the file filter of the Commit Details View.
	 */
	private makeCdvSummaryInteractive() {
		const hashElem = document.getElementById('cdvCommitHash');
		if (hashElem !== null) {
			hashElem.addEventListener('click', (e) => {
				// Click copies the commit hash, Ctrl/Cmd+Click opens the commit on the remote
				if (this.expandedCommit === null) return;
				if (e.ctrlKey || e.metaKey) {
					sendMessage({ command: 'openCommitLink', repo: this.currentRepo, commitHash: this.expandedCommit.commitHash });
				} else {
					sendMessage({ command: 'copyToClipboard', type: 'Commit Hash', data: this.expandedCommit.commitHash });
				}
			});
		}

		const containedInElem = document.getElementById('cdvContainedIn');
		if (containedInElem !== null) {
			containedInElem.addEventListener('click', (e) => {
				const expandedCommit = this.expandedCommit;
				if (expandedCommit === null || e.target === null || (<Element>e.target).closest('.cdvShowContainedIn') === null) return;
				expandedCommit.containedInBranches = null;
				containedInElem.innerHTML = this.getContainedInBranchesHtml(expandedCommit);
				sendMessage({ command: 'loadBranchesContainingCommit', repo: this.currentRepo, commitHash: expandedCommit.commitHash });
			});
		}

		const notesElem = document.getElementById('cdvNotes');
		if (notesElem !== null) {
			notesElem.addEventListener('click', (e) => {
				const expandedCommit = this.expandedCommit;
				if (expandedCommit === null || expandedCommit.commitElem === null || e.target === null || (<Element>e.target).closest('.cdvEditNotes') === null) return;
				this.editCommitNotesAction(expandedCommit.commitHash, { type: TargetType.Commit, hash: expandedCommit.commitHash, elem: expandedCommit.commitElem });
			});
		}

		const groupsElem = document.getElementById('cdvUncommittedGroups');
		if (groupsElem !== null) {
			groupsElem.addEventListener('click', (e) => {
				const groupElem = e.target !== null ? <HTMLElement | null>(<Element>e.target).closest('.cdvUncommittedGroup') : null;
				if (this.expandedCommit === null || groupElem === null) return;
				const group = <GG.UncommittedGroup>groupElem.dataset.group!;
				if (group === this.uncommittedGroup) return;
				this.uncommittedGroup = group;
				alterClassOfCollection(<HTMLCollectionOf<HTMLElement>>groupsElem.getElementsByClassName('cdvUncommittedGroup'), CLASS_ACTIVE, false);
				alterClass(groupElem, CLASS_ACTIVE, true);
				this.requestCommitDetails(UNCOMMITTED, true);
			});
		}

		const swapElem = document.getElementById('cdvSwapComparison');
		if (swapElem !== null) {
			swapElem.addEventListener('click', () => {
				const expandedCommit = this.expandedCommit;
				if (expandedCommit === null || expandedCommit.compareWithHash === null) return;
				expandedCommit.compareReversed = expandedCommit.compareReversed !== true;
				this.saveState();
				this.requestCommitComparison(expandedCommit.commitHash, expandedCommit.compareWithHash, false);
			});
		}

		const viewAllChangesElem = document.getElementById('cdvViewAllChanges');
		if (viewAllChangesElem !== null) {
			viewAllChangesElem.addEventListener('click', () => {
				const request = this.expandedCommit !== null ? this.getCdvViewAllChangesRequest(this.expandedCommit) : null;
				if (request !== null) runAction(request, 'Opening All Changes');
			});
		}

		const filterElem = <HTMLInputElement | null>document.getElementById('cdvFilesFilterInput');
		if (filterElem !== null) {
			filterElem.addEventListener('input', () => {
				if (this.expandedCommit === null) return;
				this.expandedCommit.fileFilter = filterElem.value;
				this.applyCdvFileFilter();
			});
			filterElem.addEventListener('keydown', (e) => {
				if (e.key === 'Escape' && filterElem.value !== '') {
					// Escape clears the filter (instead of closing the Commit Details View)
					handledEvent(e);
					filterElem.value = '';
					if (this.expandedCommit !== null) this.expandedCommit.fileFilter = '';
					this.applyCdvFileFilter();
				}
			});
		}
	}

	/**
	 * Scroll the view so that the Commit Details View that has just been opened is visible.
	 * @param cdvElem The element of the Commit Details View.
	 * @param commitElem The row of the commit the Commit Details View was opened for.
	 * @param isDocked Is the Commit Details View docked to the bottom of the Easy Graph View.
	 */
	private scrollCdvIntoView(cdvElem: HTMLElement, commitElem: HTMLElement, isDocked: boolean) {
		const viewTop = this.viewElem.scrollTop, viewHeight = this.viewElem.clientHeight;
		let scrollTo: number | null = null;
		if (isDocked) {
			// Only the commit row needs to be visible: 8px below the top, or 32px above the bottom of the view
			const rowTop = this.controlsElem.clientHeight + commitElem.offsetTop;
			if (rowTop - 8 < viewTop) {
				scrollTo = rowTop - 8;
			} else if (rowTop + 32 - viewHeight > viewTop) {
				scrollTo = rowTop + 32 - viewHeight;
			}
		} else {
			// The inline view is rendered directly below the commit row [24px], both need to be visible (with a gap of 8px)
			const cdvTop = this.controlsElem.clientHeight + cdvElem.offsetTop, cdvHeight = this.gitRepos[this.currentRepo].cdvHeight;
			if (this.config.commitDetailsView.autoCenter) {
				// The middle of the commit row and the view is centered
				scrollTo = cdvTop - 12 + (cdvHeight - viewHeight) / 2;
			} else if (cdvTop - 32 < viewTop) {
				scrollTo = cdvTop - 32;
			} else if (cdvTop + cdvHeight + 8 - viewHeight > viewTop) {
				scrollTo = cdvTop + cdvHeight + 8 - viewHeight;
			}
		}
		if (scrollTo !== null) this.viewElem.scroll(0, scrollTo);
	}

	/**
	 * Restore the scroll position of the file view of the Commit Details View, and keep track of it while it's scrolled, so it's
	 * kept when the view is rendered again (e.g. after switching to another tab and back). The files scroll within
	 * #cdvFilesViewWrapper, below the file filter.
	 * @param initialScrollTop The scroll position to restore.
	 */
	private observeCdvFileViewScroll(initialScrollTop: number) {
		observeElemScroll('cdvFilesViewWrapper', initialScrollTop, (scrollTop) => {
			const expandedCommit = this.expandedCommit;
			if (expandedCommit === null) return;
			expandedCommit.scrollTop.fileView = scrollTop;
			if (expandedCommit.contextMenuOpen.fileView > -1) {
				// The context menu of a file would no longer be next to the file
				expandedCommit.contextMenuOpen.fileView = -1;
				contextMenu.close();
			}
		}, () => this.saveState());
	}

	/**
	 * Collapse or expand the summary of the inline Commit Details View. The choice is remembered for each repository.
	 */
	private toggleCdvSummaryCollapsed() {
		this.saveRepoStateValue(this.currentRepo, 'isCdvSummaryHidden', !this.gitRepos[this.currentRepo].isCdvSummaryHidden);
		this.renderCdvSummaryCollapsed();
	}

	/**
	 * Show or hide the summary of the Commit Details View according to the repository state. The summary is always shown when the
	 * view is docked to the bottom, as it has no toggle button there.
	 */
	private renderCdvSummaryCollapsed() {
		const isDocked = this.isCdvDocked(), collapsed = !isDocked && this.gitRepos[this.currentRepo].isCdvSummaryHidden === true;
		const summaryElem = document.getElementById('cdvSummary'), toggleElem = document.getElementById('cdvSummaryToggleBtn');
		if (summaryElem !== null) alterClass(summaryElem, 'hidden', collapsed);
		if (toggleElem !== null) {
			toggleElem.title = collapsed ? 'Show Commit Summary' : 'Hide Commit Summary';
			// The same icon is used for both states, turned by 180 degrees
			const iconElem = toggleElem.querySelector('svg');
			if (iconElem !== null) iconElem.style.transform = collapsed ? 'rotate(90deg)' : 'rotate(-90deg)';
		}
		const cdvElem = document.getElementById('cdv');
		if (cdvElem !== null) this.setCdvHeight(cdvElem, isDocked);
	}

	private setCdvHeight(elem: HTMLElement, isDocked: boolean) {
		let height = this.gitRepos[this.currentRepo].cdvHeight, windowHeight = window.innerHeight;
		if (height > windowHeight - 40) {
			height = Math.max(windowHeight - 40, 100);
			if (height !== this.gitRepos[this.currentRepo].cdvHeight) {
				this.gitRepos[this.currentRepo].cdvHeight = height;
				this.saveRepoState();
			}
		}

		let heightPx = height + 'px';
		if (isDocked) {
			this.viewElem.style.bottom = heightPx;
			elem.style.height = heightPx;
			return;
		}
		let inlineElem = document.getElementById('cdvContentWrapper');
		if (!inlineElem) {
			elem.style.height = heightPx;
			return;
		}
		if (this.gitRepos[this.currentRepo].isCdvSummaryHidden) {
			inlineElem.style.height = heightPx;
			elem.style.height = '0px';
		} else {
			inlineElem.style.removeProperty('height');
			elem.style.height = heightPx;
		}
		this.renderGraph();
	}

	private setCdvDivider() {
		let percent = (this.gitRepos[this.currentRepo].cdvDivider * 100).toFixed(2) + '%';
		let summaryElem = document.getElementById('cdvSummary'), dividerElem = document.getElementById('cdvDivider'), filesElem = document.getElementById('cdvFiles');
		if (summaryElem !== null) summaryElem.style.width = percent;
		if (dividerElem !== null) dividerElem.style.left = percent;
		if (filesElem !== null) filesElem.style.left = percent;
	}

	private makeCdvResizable() {
		let prevY = -1;

		const processResizingCdvHeight: EventListener = (e) => {
			if (prevY < 0) return;
			let delta = (<MouseEvent>e).pageY - prevY, isDocked = this.isCdvDocked(), windowHeight = window.innerHeight;
			prevY = (<MouseEvent>e).pageY;
			let height = this.gitRepos[this.currentRepo].cdvHeight + (isDocked ? -delta : delta);
			if (height < 100) height = 100;
			else if (height > 600) height = 600;
			if (height > windowHeight - 40) height = Math.max(windowHeight - 40, 100);

			if (this.gitRepos[this.currentRepo].cdvHeight !== height) {
				this.gitRepos[this.currentRepo].cdvHeight = height;
				let elem = document.getElementById('cdv');
				if (elem !== null) this.setCdvHeight(elem, isDocked);
				if (!isDocked) this.renderGraph();
			}
		};
		const stopResizingCdvHeight: EventListener = (e) => {
			if (prevY < 0) return;
			processResizingCdvHeight(e);
			this.saveRepoState();
			prevY = -1;
			eventOverlay.remove();
		};

		addListenerToClass('cdvHeightResize', 'mousedown', (e) => {
			prevY = (<MouseEvent>e).pageY;
			eventOverlay.create('rowResize', processResizingCdvHeight, stopResizingCdvHeight);
		});
	}

	private makeCdvDividerDraggable() {
		let minX = -1, width = -1;

		const processDraggingCdvDivider: EventListener = (e) => {
			if (minX < 0) return;
			let percent = ((<MouseEvent>e).clientX - minX) / width;
			if (percent < 0.2) percent = 0.2;
			else if (percent > 0.8) percent = 0.8;

			if (this.gitRepos[this.currentRepo].cdvDivider !== percent) {
				this.gitRepos[this.currentRepo].cdvDivider = percent;
				this.setCdvDivider();
			}
		};
		const stopDraggingCdvDivider: EventListener = (e) => {
			if (minX < 0) return;
			processDraggingCdvDivider(e);
			this.saveRepoState();
			minX = -1;
			eventOverlay.remove();
		};

		document.getElementById('cdvDivider')!.addEventListener('mousedown', () => {
			const contentElem = document.getElementById('cdvContent');
			if (contentElem === null) return;

			const bounds = contentElem.getBoundingClientRect();
			minX = bounds.left;
			width = bounds.width;
			eventOverlay.create('colResize', processDraggingCdvDivider, stopDraggingCdvDivider);
		});
	}

	/**
	 * Updates the state of a file in the Commit Details View.
	 * @param file The file that was affected.
	 * @param fileElem The HTML Element of the file.
	 * @param isReviewed TRUE/FALSE => Set the files reviewed state accordingly, NULL => Don't update the files reviewed state.
	 * @param fileWasViewed Was the file viewed - if so, set it to be the last viewed file.
	 */
	private cdvUpdateFileState(file: GG.GitFileChange, fileElem: HTMLElement, isReviewed: boolean | null, fileWasViewed: boolean) {
		const expandedCommit = this.expandedCommit, filesElem = document.getElementById('cdvFilesView'), filePath = file.newFilePath;
		if (expandedCommit === null || expandedCommit.fileTree === null || filesElem === null) return;

		if (fileWasViewed) {
			expandedCommit.lastViewedFile = filePath;
			let lastViewedElem = document.getElementById('cdvLastFileViewed');
			if (lastViewedElem !== null) lastViewedElem.remove();
			lastViewedElem = document.createElement('span');
			lastViewedElem.id = 'cdvLastFileViewed';
			lastViewedElem.title = 'Last File Viewed';
			lastViewedElem.innerHTML = SVG_ICONS.eyeOpen;
			insertBeforeFirstChildWithClass(lastViewedElem, fileElem, 'fileTreeFileAction');
		}

		if (expandedCommit.codeReview !== null) {
			if (isReviewed !== null) {
				if (isReviewed) {
					expandedCommit.codeReview.remainingFiles = expandedCommit.codeReview.remainingFiles.filter((path: string) => path !== filePath);
				} else {
					expandedCommit.codeReview.remainingFiles.push(filePath);
				}

				alterFileTreeFileReviewed(expandedCommit.fileTree, filePath, isReviewed);
				updateFileTreeHtmlFileReviewed(filesElem, expandedCommit.fileTree, filePath);
			}

			sendMessage({
				command: 'updateCodeReview',
				repo: this.currentRepo,
				id: expandedCommit.codeReview.id,
				remainingFiles: expandedCommit.codeReview.remainingFiles,
				lastViewedFile: expandedCommit.lastViewedFile
			});

			if (expandedCommit.codeReview.remainingFiles.length === 0) {
				this.setCodeReviewMarker(expandedCommit.codeReview.id, false);
				expandedCommit.codeReview = null;
				this.renderCodeReviewBtn();
			}
		}

		this.saveState();
	}

	private isCdvDocked() {
		return this.config.commitDetailsView.location === GG.CommitDetailsViewLocation.DockedToBottom;
	}

	public isCdvOpen(commitHash: string, compareWithHash: string | null) {
		return this.expandedCommit !== null && this.expandedCommit.commitHash === commitHash && this.expandedCommit.compareWithHash === compareWithHash;
	}

	private getCommitOrder(hash1: string, hash2: string) {
		if (this.commitLookup[hash1] > this.commitLookup[hash2]) {
			return { from: hash1, to: hash2 };
		} else {
			return { from: hash2, to: hash1 };
		}
	}

	/**
	 * Get the order of a commit comparison, which is from the older commit to the newer commit, unless the comparison open
	 * in the Commit Details View has been reversed.
	 */
	private getComparisonOrder(hash: string, compareWithHash: string) {
		const order = this.getCommitOrder(hash, compareWithHash), expandedCommit = this.expandedCommit;
		return expandedCommit !== null && expandedCommit.compareReversed === true && expandedCommit.commitHash === hash && expandedCommit.compareWithHash === compareWithHash
			? { from: order.to, to: order.from }
			: order;
	}

	/**
	 * Get the order of the commit(s) displayed in the Commit Details View.
	 */
	private getCdvCommitOrder(expandedCommit: ExpandedCommit) {
		return expandedCommit.compareWithHash === null
			? this.getCommitOrder(expandedCommit.commitHash, expandedCommit.commitHash)
			: this.getComparisonOrder(expandedCommit.commitHash, expandedCommit.compareWithHash);
	}

	/**
	 * Get the request to view the changes of all files displayed in the Commit Details View in one editor.
	 * @param expandedCommit The Commit Details View.
	 * @returns The request, or NULL if the commit isn't loaded.
	 */
	private getCdvViewAllChangesRequest(expandedCommit: ExpandedCommit): GG.RequestViewAllChanges | null {
		if (expandedCommit.compareWithHash !== null) {
			const commitOrder = this.getCdvCommitOrder(expandedCommit);
			return { command: 'viewAllChanges', repo: this.currentRepo, fromHash: commitOrder.from, toHash: commitOrder.to, hasParents: true };
		} else if (expandedCommit.commitHash === UNCOMMITTED) {
			return { command: 'viewAllChanges', repo: this.currentRepo, fromHash: UNCOMMITTED, toHash: UNCOMMITTED, hasParents: true, uncommittedGroup: this.uncommittedGroup };
		}
		const commit = typeof this.commitLookup[expandedCommit.commitHash] === 'number' ? this.commits[this.commitLookup[expandedCommit.commitHash]] : null;
		return commit !== null ? { command: 'viewAllChanges', repo: this.currentRepo, fromHash: commit.hash, toHash: commit.hash, hasParents: commit.parents.length > 0, stash: commit.stash } : null;
	}

	/**
	 * Hide the files (and folders without any visible files) that don't match the file filter of the Commit Details View.
	 */
	private applyCdvFileFilter() {
		const expandedCommit = this.expandedCommit, filesElem = document.getElementById('cdvFilesView');
		if (expandedCommit === null || expandedCommit.fileChanges === null || filesElem === null) return;
		const pattern = getFileFilterRegExp(expandedCommit.fileFilter);

		const fileElems = <HTMLCollectionOf<HTMLElement>>filesElem.getElementsByClassName('fileTreeFileRecord');
		for (let i = 0; i < fileElems.length; i++) {
			const file = expandedCommit.fileChanges[parseInt(fileElems[i].dataset.index!)];
			alterClass(fileElems[i].parentElement!, CLASS_FILTERED_OUT, !fileChangeMatchesFilter(file, pattern));
		}
		const repoElems = <HTMLCollectionOf<HTMLElement>>filesElem.getElementsByClassName('fileTreeRepo');
		for (let i = 0; i < repoElems.length; i++) {
			// Matched by the path relative to the current repository like the files (and the copied paths), not by the absolute path
			const repoPath = decodeURIComponent(repoElems[i].dataset.path!);
			const relPath = repoPath.startsWith(this.currentRepo + '/') ? repoPath.substring(this.currentRepo.length + 1) : repoPath;
			alterClass(repoElems[i].parentElement!, CLASS_FILTERED_OUT, pattern !== null && !pattern.test(relPath));
		}
		const folderElems = <HTMLCollectionOf<HTMLElement>>filesElem.getElementsByClassName('fileTreeFolder');
		for (let i = folderElems.length - 1; i >= 0; i--) {
			const folderElem = folderElems[i].parentElement!;
			alterClass(folderElem, CLASS_FILTERED_OUT, pattern !== null && folderElem.querySelector('li:not(.' + CLASS_FILTERED_OUT + ') > .fileTreeFileRecord, li:not(.' + CLASS_FILTERED_OUT + ') > .fileTreeRepo') === null);
		}
	}

	private getFileViewType() {
		return this.gitRepos[this.currentRepo].fileViewType === GG.FileViewType.Default
			? this.config.commitDetailsView.fileViewType
			: this.gitRepos[this.currentRepo].fileViewType;
	}

	private setFileViewType(type: GG.FileViewType) {
		this.gitRepos[this.currentRepo].fileViewType = type;
		this.saveRepoState();
	}

	private changeFileViewType(type: GG.FileViewType) {
		const expandedCommit = this.expandedCommit, filesElem = document.getElementById('cdvFilesView');
		if (expandedCommit === null || expandedCommit.fileTree === null || expandedCommit.fileChanges === null || filesElem === null) return;
		GitGraphView.closeCdvContextMenuIfOpen(expandedCommit);
		this.setFileViewType(type);
		const commitOrder = this.getCdvCommitOrder(expandedCommit);
		filesElem.innerHTML = generateFileViewHtml(expandedCommit.fileTree, expandedCommit.fileChanges, expandedCommit.lastViewedFile, expandedCommit.contextMenuOpen.fileView, type, commitOrder.to === UNCOMMITTED);
		this.applyCdvFileFilter();
		this.makeCdvFileViewInteractive();
		this.renderCdvFileViewTypeBtns();
	}

	private openFolders(open: boolean) {
		let expandedCommit = this.expandedCommit;
		if (expandedCommit === null || expandedCommit.fileTree === null) return;
		let folders = document.getElementsByClassName('fileTreeFolder');
		for (let i = 0; i < folders.length; i++) {
			let sourceElem = <HTMLElement>(folders[i]);
			let parent = sourceElem.parentElement!;
			if (open) {
				parent.classList.remove('closed');
				sourceElem.children[0].children[0].innerHTML = SVG_ICONS.openFolder;
				parent.children[1].classList.remove('hidden');
				alterFileTreeFolderOpen(expandedCommit.fileTree, decodeURIComponent(sourceElem.dataset.folderpath!), true);

			} else {
				parent.classList.add('closed');
				sourceElem.children[0].children[0].innerHTML = SVG_ICONS.closedFolder;
				parent.children[1].classList.add('hidden');
				alterFileTreeFolderOpen(expandedCommit.fileTree, decodeURIComponent(sourceElem.dataset.folderpath!), false);
			}
		}
		this.saveState();
	}

	private makeCdvFileViewInteractive() {
		const getFileElemOfEventTarget = (target: EventTarget) => <HTMLElement>(<Element>target).closest('.fileTreeFileRecord');
		const getFileOfFileElem = (fileChanges: ReadonlyArray<GG.GitFileChange>, fileElem: HTMLElement) => fileChanges[parseInt(fileElem.dataset.index!)];

		const getCommitHashForFile = (file: GG.GitFileChange, expandedCommit: ExpandedCommit) => {
			const commit = this.commits[this.commitLookup[expandedCommit.commitHash]];
			if (expandedCommit.compareWithHash !== null) {
				return this.getCdvCommitOrder(expandedCommit).to;
			} else if (commit.stash !== null && file.type === GG.GitFileStatus.Untracked) {
				return commit.stash.untrackedFilesHash!;
			} else {
				return expandedCommit.commitHash;
			}
		};

		const triggerViewFileDiff = (file: GG.GitFileChange, fileElem: HTMLElement) => {
			const expandedCommit = this.expandedCommit;
			if (expandedCommit === null) return;

			let commit = this.commits[this.commitLookup[expandedCommit.commitHash]], fromHash: string, toHash: string, fileStatus = file.type;
			if (expandedCommit.compareWithHash !== null) {
				// Commit Comparison
				const commitOrder = this.getCdvCommitOrder(expandedCommit);
				fromHash = commitOrder.from;
				toHash = commitOrder.to;
			} else if (expandedCommit.commitHash === UNCOMMITTED && this.uncommittedGroup !== 'all' && fileStatus !== GG.GitFileStatus.Untracked) {
				// Staged changes are from HEAD to the index, unstaged changes are from the index to the working tree
				fromHash = this.uncommittedGroup === 'staged' ? 'HEAD' : INDEX;
				toHash = this.uncommittedGroup === 'staged' ? INDEX : UNCOMMITTED;
			} else if (commit.stash !== null) {
				// Stash Commit
				if (fileStatus === GG.GitFileStatus.Untracked) {
					fromHash = commit.stash.untrackedFilesHash!;
					toHash = commit.stash.untrackedFilesHash!;
					fileStatus = GG.GitFileStatus.Added;
				} else {
					fromHash = commit.stash.baseHash;
					toHash = expandedCommit.commitHash;
				}
			} else {
				// Single Commit
				fromHash = expandedCommit.commitHash;
				toHash = expandedCommit.commitHash;
			}

			this.cdvUpdateFileState(file, fileElem, true, true);
			sendMessage({
				command: 'viewDiff',
				repo: this.currentRepo,
				fromHash: fromHash,
				toHash: toHash,
				oldFilePath: file.oldFilePath,
				newFilePath: file.newFilePath,
				type: fileStatus
			});
		};

		const triggerCopyFilePath = (file: GG.GitFileChange, absolute: boolean) => {
			sendMessage({ command: 'copyFilePath', repo: this.currentRepo, filePath: file.newFilePath, absolute: absolute });
		};

		const triggerResetFileToRevision = (file: GG.GitFileChange, fileElem: HTMLElement) => {
			const expandedCommit = this.expandedCommit;
			if (expandedCommit === null) return;

			const commitHash = getCommitHashForFile(file, expandedCommit);
			dialog.showConfirmation('Are you sure you want to reset <b><i>' + escapeHtml(file.newFilePath) + '</i></b> to it\'s state at commit <b><i>' + abbrevCommit(commitHash) + '</i></b>? Any uncommitted changes made to this file will be overwritten.', 'Yes, reset file', () => {
				runAction({ command: 'resetFileToRevision', repo: this.currentRepo, commitHash: commitHash, filePath: file.newFilePath }, 'Resetting file');
			}, {
				type: TargetType.CommitDetailsView,
				hash: commitHash,
				elem: fileElem
			});
		};

		const triggerViewFileAtRevision = (file: GG.GitFileChange, fileElem: HTMLElement) => {
			const expandedCommit = this.expandedCommit;
			if (expandedCommit === null) return;

			this.cdvUpdateFileState(file, fileElem, true, true);
			sendMessage({ command: 'viewFileAtRevision', repo: this.currentRepo, hash: getCommitHashForFile(file, expandedCommit), filePath: file.newFilePath });
		};

		const triggerViewFileDiffWithWorkingFile = (file: GG.GitFileChange, fileElem: HTMLElement) => {
			const expandedCommit = this.expandedCommit;
			if (expandedCommit === null) return;

			this.cdvUpdateFileState(file, fileElem, null, true);
			sendMessage({ command: 'viewDiffWithWorkingFile', repo: this.currentRepo, hash: getCommitHashForFile(file, expandedCommit), filePath: file.newFilePath });
		};

		const triggerOpenFile = (file: GG.GitFileChange, fileElem: HTMLElement) => {
			const expandedCommit = this.expandedCommit;
			if (expandedCommit === null) return;

			this.cdvUpdateFileState(file, fileElem, true, true);
			sendMessage({ command: 'openFile', repo: this.currentRepo, hash: getCommitHashForFile(file, expandedCommit), filePath: file.newFilePath });
		};

		addListenerToClass('fileTreeFolder', 'click', (e) => {
			let expandedCommit = this.expandedCommit;
			if (expandedCommit === null || expandedCommit.fileTree === null || e.target === null) return;

			let sourceElem = <HTMLElement>(<Element>e.target).closest('.fileTreeFolder');
			let parent = sourceElem.parentElement!;
			parent.classList.toggle('closed');
			let isOpen = !parent.classList.contains('closed');
			parent.children[0].children[0].innerHTML = isOpen ? SVG_ICONS.openFolder : SVG_ICONS.closedFolder;
			parent.children[1].classList.toggle('hidden');
			alterFileTreeFolderOpen(expandedCommit.fileTree, decodeURIComponent(sourceElem.dataset.folderpath!), isOpen);
			this.saveState();
		});

		addListenerToClass('fileTreeRepo', 'click', (e) => {
			if (e.target === null) return;
			this.loadRepos(this.gitRepos, null, {
				repo: decodeURIComponent((<HTMLElement>(<Element>e.target).closest('.fileTreeRepo')).dataset.path!)
			});
		});

		addListenerToClass('fileTreeFile', 'click', (e) => {
			const expandedCommit = this.expandedCommit;
			if (expandedCommit === null || expandedCommit.fileChanges === null || e.target === null) return;

			const sourceElem = <HTMLElement>(<Element>e.target).closest('.fileTreeFile'), fileElem = getFileElemOfEventTarget(e.target);
			if (!sourceElem.classList.contains('gitDiffPossible')) return;
			triggerViewFileDiff(getFileOfFileElem(expandedCommit.fileChanges, fileElem), fileElem);
		});

		addListenerToClass('copyGitFile', 'click', (e) => {
			const expandedCommit = this.expandedCommit;
			if (expandedCommit === null || expandedCommit.fileChanges === null || e.target === null) return;

			const fileElem = getFileElemOfEventTarget(e.target);
			triggerCopyFilePath(getFileOfFileElem(expandedCommit.fileChanges, fileElem), true);
		});

		addListenerToClass('viewGitFileAtRevision', 'click', (e) => {
			const expandedCommit = this.expandedCommit;
			if (expandedCommit === null || expandedCommit.fileChanges === null || e.target === null) return;

			const fileElem = getFileElemOfEventTarget(e.target);
			triggerViewFileAtRevision(getFileOfFileElem(expandedCommit.fileChanges, fileElem), fileElem);
		});

		addListenerToClass('openGitFile', 'click', (e) => {
			const expandedCommit = this.expandedCommit;
			if (expandedCommit === null || expandedCommit.fileChanges === null || e.target === null) return;

			const fileElem = getFileElemOfEventTarget(e.target);
			triggerOpenFile(getFileOfFileElem(expandedCommit.fileChanges, fileElem), fileElem);
		});

		addListenerToClass('fileTreeFileRecord', 'contextmenu', (e: Event) => {
			handledEvent(e);
			const expandedCommit = this.expandedCommit;
			if (expandedCommit === null || expandedCommit.fileChanges === null || e.target === null) return;
			const fileElem = getFileElemOfEventTarget(e.target);
			const file = getFileOfFileElem(expandedCommit.fileChanges, fileElem);
			const commitOrder = this.getCdvCommitOrder(expandedCommit);
			const isUncommitted = commitOrder.to === UNCOMMITTED;

			GitGraphView.closeCdvContextMenuIfOpen(expandedCommit);
			expandedCommit.contextMenuOpen.fileView = parseInt(fileElem.dataset.index!);

			const target: ContextMenuTarget & CommitTarget = {
				type: TargetType.CommitDetailsView,
				hash: expandedCommit.commitHash,
				index: this.commitLookup[expandedCommit.commitHash],
				elem: fileElem
			};
			const diffPossible = file.type === GG.GitFileStatus.Untracked || (file.additions !== null && file.deletions !== null);
			const fileExistsAtThisRevision = file.type !== GG.GitFileStatus.Deleted && !isUncommitted;
			const fileExistsAtThisRevisionAndDiffPossible = fileExistsAtThisRevision && diffPossible;
			const codeReviewInProgressAndNotReviewed = expandedCommit.codeReview !== null && expandedCommit.codeReview.remainingFiles.includes(file.newFilePath);
			const visibility = this.config.contextMenuActionsVisibility.commitDetailsViewFile;
			const viewAllChangesRequest = this.getCdvViewAllChangesRequest(expandedCommit);

			contextMenu.show([
				[
					{
						title: 'View Diff',
						visible: visibility.viewDiff && diffPossible,
						onClick: () => triggerViewFileDiff(file, fileElem)
					},
					{
						title: 'View All Changes',
						visible: visibility.viewAllChanges && viewAllChangesRequest !== null,
						onClick: () => {
							if (viewAllChangesRequest !== null) runAction(viewAllChangesRequest, 'Opening All Changes');
						}
					},
					{
						title: 'View File at this Revision',
						visible: visibility.viewFileAtThisRevision && fileExistsAtThisRevisionAndDiffPossible,
						onClick: () => triggerViewFileAtRevision(file, fileElem)
					},
					{
						title: 'View Diff with Working File',
						visible: visibility.viewDiffWithWorkingFile && fileExistsAtThisRevisionAndDiffPossible,
						onClick: () => triggerViewFileDiffWithWorkingFile(file, fileElem)
					},
					{
						title: 'Open File',
						visible: visibility.openFile && file.type !== GG.GitFileStatus.Deleted,
						onClick: () => triggerOpenFile(file, fileElem)
					},
					{
						title: 'Open in External Diff Tool',
						visible: visibility.openInExternalDiffTool && diffPossible && file.type !== GG.GitFileStatus.Untracked && this.gitConfig !== null && (this.gitConfig.diffTool !== null || this.gitConfig.guiDiffTool !== null),
						onClick: () => {
							if (this.gitConfig === null) return;
							runAction({ command: 'openExternalFileDiff', repo: this.currentRepo, fromHash: commitOrder.from, toHash: commitOrder.to, oldFilePath: file.oldFilePath, newFilePath: file.newFilePath, isGui: this.gitConfig.guiDiffTool !== null }, 'Opening External Diff');
						}
					}
				],
				[
					{
						title: 'Mark as Reviewed',
						visible: visibility.markAsReviewed && codeReviewInProgressAndNotReviewed,
						onClick: () => this.cdvUpdateFileState(file, fileElem, true, false)
					},
					{
						title: 'Mark as Not Reviewed',
						visible: visibility.markAsNotReviewed && expandedCommit.codeReview !== null && !codeReviewInProgressAndNotReviewed,
						onClick: () => this.cdvUpdateFileState(file, fileElem, false, false)
					}
				],
				[
					{
						title: 'Reset File to this Revision' + ELLIPSIS,
						visible: visibility.resetFileToThisRevision && fileExistsAtThisRevision && expandedCommit.compareWithHash === null,
						onClick: () => triggerResetFileToRevision(file, fileElem)
					}
				],
				[
					{
						title: 'Copy Absolute File Path to Clipboard',
						visible: visibility.copyAbsoluteFilePath,
						onClick: () => triggerCopyFilePath(file, true)
					},
					{
						title: 'Copy Relative File Path to Clipboard',
						visible: visibility.copyRelativeFilePath,
						onClick: () => triggerCopyFilePath(file, false)
					},
					{
						title: 'Copy All Relative File Paths to Clipboard',
						visible: visibility.copyAllRelativeFilePaths,
						onClick: () => {
							if (expandedCommit.fileChanges === null) return;
							sendMessage({ command: 'copyToClipboard', type: 'File Paths', data: getRelativeFilePathsToCopy(expandedCommit.fileChanges, expandedCommit.fileFilter) });
						}
					}
				]
			], false, target, <MouseEvent>e, this.isCdvDocked() ? document.body : this.viewElem, () => {
				expandedCommit.contextMenuOpen.fileView = -1;
			});
		});
	}

	private renderCdvFileViewTypeBtns() {
		if (this.expandedCommit === null) return;
		let treeBtnElem = document.getElementById('cdvFileViewTypeTree'), listBtnElem = document.getElementById('cdvFileViewTypeList');
		if (treeBtnElem === null || listBtnElem === null) return;

		let listView = this.getFileViewType() === GG.FileViewType.List;
		alterClass(treeBtnElem, CLASS_ACTIVE, !listView);
		alterClass(listBtnElem, CLASS_ACTIVE, listView);
		setFolderBtns();
		function setFolderBtns() {
			let btns = document.getElementsByClassName('cdvFolderBtn');
			for (let i = 0; i < btns.length; i++) {
				if (listView)
					btns[i].classList.add('hidden');
				else
					btns[i].classList.remove('hidden');
			}
		}
	}

	private renderCdvExternalDiffBtn() {
		if (this.expandedCommit === null) return;
		const externalDiffBtnElem = document.getElementById('cdvExternalDiff');
		if (externalDiffBtnElem === null) return;

		alterClass(externalDiffBtnElem, CLASS_ENABLED, this.gitConfig !== null && (this.gitConfig.diffTool !== null || this.gitConfig.guiDiffTool !== null));
		const toolName = this.gitConfig !== null
			? this.gitConfig.guiDiffTool !== null
				? this.gitConfig.guiDiffTool
				: this.gitConfig.diffTool
			: null;
		externalDiffBtnElem.title = 'Open External Directory Diff' + (toolName !== null ? ' with "' + toolName + '"' : '');
	}

	private static closeCdvContextMenuIfOpen(expandedCommit: ExpandedCommit) {
		if (expandedCommit.contextMenuOpen.summary || expandedCommit.contextMenuOpen.fileView > -1) {
			expandedCommit.contextMenuOpen.summary = false;
			expandedCommit.contextMenuOpen.fileView = -1;
			contextMenu.close();
		}
	}


	/* Code Review */

	public startCodeReview(commitHash: string, compareWithHash: string | null, codeReview: GG.CodeReview) {
		if (this.expandedCommit === null || this.expandedCommit.commitHash !== commitHash || this.expandedCommit.compareWithHash !== compareWithHash) return;
		this.setCodeReviewMarker(codeReview.id, true);
		this.saveAndRenderCodeReview(codeReview);
	}

	public endCodeReview() {
		if (this.expandedCommit === null || this.expandedCommit.codeReview === null) return;
		this.setCodeReviewMarker(this.expandedCommit.codeReview.id, false);
		this.saveAndRenderCodeReview(null);
	}

	private setCodeReviewMarker(id: string, active: boolean) {
		this.codeReviewIds = this.codeReviewIds.filter((codeReviewId) => codeReviewId !== id);
		if (active) this.codeReviewIds.push(id);
		this.renderCodeReviewMarkers();
	}

	/**
	 * Mark the commits that have a Code Review in progress (the ID of a Code Review is "<hash>" or "<fromHash>-<toHash>").
	 */
	private renderCodeReviewMarkers() {
		const hashes = new Set<string>();
		this.codeReviewIds.forEach((id) => id.split('-').forEach((hash) => hashes.add(hash)));
		const commitElems = getCommitElems();
		for (let i = 0; i < commitElems.length; i++) {
			const id = parseInt(commitElems[i].dataset.id!);
			const active = id < this.commits.length && hashes.has(this.commits[id].hash);
			const markerElem = commitElems[i].querySelector('.codeReviewMarker');
			if (active && markerElem === null) {
				const descriptionElem = commitElems[i].querySelector('.description');
				if (descriptionElem !== null) {
					const marker = document.createElement('span');
					marker.className = 'codeReviewMarker';
					marker.title = 'A Code Review is in progress for this commit';
					marker.innerHTML = SVG_ICONS.review;
					descriptionElem.insertBefore(marker, descriptionElem.firstChild);
				}
			} else if (!active && markerElem !== null) {
				markerElem.remove();
			}
		}
	}

	private saveAndRenderCodeReview(codeReview: GG.CodeReview | null) {
		let filesElem = document.getElementById('cdvFilesView');
		if (this.expandedCommit === null || this.expandedCommit.fileTree === null || filesElem === null) return;

		this.expandedCommit.codeReview = codeReview;
		setFileTreeReviewed(this.expandedCommit.fileTree, codeReview === null);
		this.saveState();
		this.renderCodeReviewBtn();
		updateFileTreeHtml(filesElem, this.expandedCommit.fileTree);
	}

	private renderCodeReviewBtn() {
		if (this.expandedCommit === null) return;
		let btnElem = document.getElementById('cdvCodeReview');
		if (btnElem === null) return;

		let active = this.expandedCommit.codeReview !== null;
		alterClass(btnElem, CLASS_ACTIVE, active);
		btnElem.title = (active ? 'End' : 'Start') + ' Code Review';
	}
}


/* Main */

const contextMenu = new ContextMenu(), dialog = new Dialog(), eventOverlay = new EventOverlay();
let loaded = false;

window.addEventListener('load', () => {
	if (loaded) return;
	loaded = true;

	TextFormatter.registerCustomEmojiMappings(initialState.config.customEmojiShortcodeMappings);

	const viewElem = document.getElementById('view');
	if (viewElem === null) return;

	const gitGraph = new GitGraphView(viewElem, VSCODE_API.getState());
	const imageResizer = new ImageResizer();

	/* Command Processing */
	window.addEventListener('message', event => {
		const msg: GG.ResponseMessage = event.data;
		switch (msg.command) {
			case 'addRemote':
				refreshOrDisplayError(msg.error, 'Unable to Add Remote', true);
				break;
			case 'addTag':
				if (msg.pushToRemote !== null && msg.errors.length === 2 && msg.errors[0] === null && isExtensionErrorInfo(msg.errors[1], GG.ErrorInfoExtensionPrefix.PushTagCommitNotOnRemote)) {
					gitGraph.refresh(false);
					handleResponsePushTagCommitNotOnRemote(msg.repo, msg.tagName, [msg.pushToRemote], msg.commitHash, false, msg.errors[1]!);
				} else {
					refreshAndDisplayErrors(msg.errors, 'Unable to Add Tag');
				}
				break;
			case 'applyStash':
				refreshOrDisplayError(msg.error, 'Unable to Apply Stash');
				break;
			case 'branchFromStash':
				refreshOrDisplayError(msg.error, 'Unable to Create Branch from Stash');
				break;
			case 'checkoutBranch':
				if (!offerStashAndCheckout(msg.errors[msg.errors.length - 1], msg.request)) {
					refreshAndDisplayErrors(msg.errors, 'Unable to Checkout Branch' + (msg.pullAfterwards !== null ? ' & Pull Changes' : ''));
				}
				break;
			case 'checkoutCommit':
				if (!offerStashAndCheckout(msg.error, msg.request)) {
					refreshOrDisplayError(msg.error, 'Unable to Checkout Commit');
				}
				break;
			case 'cherrypickCommit':
				refreshAndDisplayErrors(msg.errors, 'Unable to Cherry Pick Commit');
				break;
			case 'cleanUntrackedFiles':
				refreshOrDisplayError(msg.error, 'Unable to Clean Untracked Files');
				break;
			case 'commitDetails':
				if (msg.commitDetails !== null) {
					gitGraph.showCommitDetails(msg.commitDetails, gitGraph.createFileTree(msg.commitDetails.fileChanges, msg.codeReview), msg.avatar, msg.codeReview, msg.codeReview !== null ? msg.codeReview.lastViewedFile : null, msg.refresh);
				} else {
					gitGraph.closeCommitDetails(true);
					dialog.showError('Unable to load Commit Details', msg.error, null, null);
				}
				break;
			case 'compareCommits':
				if (msg.error === null) {
					gitGraph.showCommitComparison(msg.commitHash, msg.compareWithHash, msg.fileChanges, gitGraph.createFileTree(msg.fileChanges, msg.codeReview), msg.codeReview, msg.codeReview !== null ? msg.codeReview.lastViewedFile : null, msg.refresh);
				} else {
					gitGraph.closeCommitComparison(true);
					dialog.showError('Unable to load Commit Comparison', msg.error, null, null);
				}
				break;
			case 'copyFilePath':
				finishOrDisplayError(msg.error, 'Unable to Copy File Path to Clipboard');
				break;
			case 'copyToClipboard':
				finishOrDisplayError(msg.error, 'Unable to Copy ' + msg.type + ' to Clipboard');
				break;
			case 'cherrypickCommits':
				refreshOrDisplayError(msg.error, 'Unable to Cherry Pick Commits');
				break;
			case 'revertCommits':
				refreshOrDisplayError(msg.error, 'Unable to Revert Commits');
				break;
			case 'loadCommitNotes':
				gitGraph.showCommitNotes(msg.commitHash, msg.notes);
				break;
			case 'setCommitNotes':
				finishOrDisplayError(msg.error, 'Unable to Save Notes', true);
				if (msg.error === null) gitGraph.reloadCommitNotes(msg.commitHash);
				break;
			case 'loadBranchesContainingCommit':
				gitGraph.showBranchesContainingCommit(msg.commitHash, msg.branches, msg.error);
				break;
			case 'createFixupCommit':
				refreshOrDisplayError(msg.error, 'Unable to Create Fixup Commit');
				break;
			case 'loadOperationInProgress':
				gitGraph.renderOperationInProgress(msg.repo, msg.operation);
				break;
			case 'operationAction':
				refreshOrDisplayError(msg.error, 'Unable to ' + msg.action.charAt(0).toUpperCase() + msg.action.substring(1) + ' ' + msg.operation.charAt(0).toUpperCase() + msg.operation.substring(1));
				break;
			case 'viewCommitPatch':
				finishOrDisplayError(msg.error, 'Unable to View Patch', true);
				break;
			case 'browseFilesAtCommit':
				finishOrDisplayError(msg.error, 'Unable to Browse Files at this Commit', true);
				break;
			case 'getMergeBase':
				gitGraph.selectMergeBase(msg.mergeBase, msg.error);
				break;
			case 'getCommitMessage':
				if (msg.error !== null || msg.message === null) {
					dialog.showError('Unable to Load Commit Message', msg.error, null, null);
				} else if (msg.purpose === 'edit') {
					gitGraph.showEditCommitMessageDialog(msg.commitHash, msg.message);
				} else {
					sendMessage({ command: 'copyToClipboard', type: 'Commit Message', data: msg.message });
				}
				break;
			case 'createArchive':
				finishOrDisplayError(msg.error, 'Unable to Create Archive', true);
				break;
			case 'savePatch':
				finishOrDisplayError(msg.error, 'Unable to Save Patch', true);
				break;
			case 'applyPatch':
				refreshOrDisplayError(msg.error, 'Unable to Apply Patch');
				break;
			case 'createBranch':
				refreshAndDisplayErrors(msg.errors, 'Unable to Create Branch');
				break;
			case 'createPullRequest':
				finishOrDisplayErrors(msg.errors, 'Unable to Create Pull Request', () => {
					if (msg.push) {
						gitGraph.refresh(false);
					}
				}, true);
				break;
			case 'deleteBranch':
				handleResponseDeleteBranch(msg);
				break;
			case 'deleteBranches':
				refreshAndDisplayErrors(msg.errors, 'Unable to Delete Branches');
				break;
			case 'deleteRemote':
				refreshOrDisplayError(msg.error, 'Unable to Delete Remote', true);
				break;
			case 'deleteRemoteBranch':
				refreshOrDisplayError(msg.error, 'Unable to Delete Remote Branch');
				break;
			case 'deleteTag':
				refreshOrDisplayError(msg.error, 'Unable to Delete Tag');
				break;
			case 'deleteUserDetails':
				finishOrDisplayErrors(msg.errors, 'Unable to Remove Git User Details', () => gitGraph.requestLoadConfig(), true);
				break;
			case 'dropCommit':
				refreshOrDisplayError(msg.error, 'Unable to Drop Commit');
				break;
			case 'dropCommits':
				refreshOrDisplayError(msg.error, 'Unable to Drop Commits');
				break;
			case 'editCommitMessage':
				refreshOrDisplayError(msg.error, 'Unable to Edit Commit Message');
				break;
			case 'dropStash':
				refreshOrDisplayError(msg.error, 'Unable to Drop Stash');
				break;
			case 'editRemote':
				refreshOrDisplayError(msg.error, 'Unable to Save Changes to Remote', true);
				break;
			case 'editUserDetails':
				finishOrDisplayErrors(msg.errors, 'Unable to Save Git User Details', () => gitGraph.requestLoadConfig(), true);
				break;
			case 'exportRepoConfig':
				refreshOrDisplayError(msg.error, 'Unable to Export Repository Configuration');
				break;
			case 'fetch':
				refreshOrDisplayError(msg.error, 'Unable to Fetch from Remote(s)');
				break;
			case 'fetchAvatar':
				imageResizer.resize(msg.image, (resizedImage) => {
					gitGraph.loadAvatar(msg.email, resizedImage);
				});
				break;
			case 'fetchIntoLocalBranch':
				refreshOrDisplayError(msg.error, 'Unable to Fetch into Local Branch');
				break;
			case 'loadCommits':
				gitGraph.processLoadCommitsResponse(msg);
				break;
			case 'resolveCommit':
				gitGraph.processResolveCommitResponse(msg);
				break;
			case 'loadConfig':
				gitGraph.processLoadConfig(msg);
				break;
			case 'loadRepoInfo':
				gitGraph.processLoadRepoInfoResponse(msg);
				break;
			case 'loadRepos':
				gitGraph.loadRepos(msg.repos, msg.lastActiveRepo, msg.loadViewTo, msg.workspaceFolderPaths);
				break;
			case 'merge':
				refreshOrDisplayError(msg.error, 'Unable to Merge ' + msg.actionOn);
				break;
			case 'openExtensionSettings':
				finishOrDisplayError(msg.error, 'Unable to Open Extension Settings');
				break;
			case 'openExternalDirDiff':
				finishOrDisplayError(msg.error, 'Unable to Open External Directory Diff', true);
				break;
			case 'openExternalFileDiff':
				finishOrDisplayError(msg.error, 'Unable to Open External Diff', true);
				break;
			case 'openExternalUrl':
				finishOrDisplayError(msg.error, 'Unable to Open External URL');
				break;
			case 'openFile':
				finishOrDisplayError(msg.error, 'Unable to Open File');
				break;
			case 'openTerminal':
				finishOrDisplayError(msg.error, 'Unable to Open Terminal', true);
				break;
			case 'popStash':
				refreshOrDisplayError(msg.error, 'Unable to Pop Stash');
				break;
			case 'pruneRemote':
				refreshOrDisplayError(msg.error, 'Unable to Prune Remote');
				break;
			case 'pullBranch':
				refreshOrDisplayError(msg.error, 'Unable to Pull Branch');
				break;
			case 'pushBranch':
				refreshAndDisplayErrors(msg.errors, 'Unable to Push Branch', msg.willUpdateBranchConfig);
				break;
			case 'pushToCommit':
				refreshOrDisplayError(msg.error, 'Unable to Push to Commit');
				break;
			case 'pushStash':
				refreshOrDisplayError(msg.error, 'Unable to Stash Uncommitted Changes');
				break;
			case 'pushTag':
				if (msg.errors.length === 1 && isExtensionErrorInfo(msg.errors[0], GG.ErrorInfoExtensionPrefix.PushTagCommitNotOnRemote)) {
					handleResponsePushTagCommitNotOnRemote(msg.repo, msg.tagName, msg.remotes, msg.commitHash, msg.force === true, msg.errors[0]!);
				} else {
					refreshAndDisplayErrors(msg.errors, 'Unable to Push Tag');
				}
				break;
			case 'rebase':
				if (msg.error === null) {
					if (msg.interactive) {
						dialog.closeActionRunning();
					} else {
						gitGraph.refresh(false);
					}
				} else {
					dialog.showError('Unable to Rebase current branch on ' + msg.actionOn, msg.error, null, null);
				}
				break;
			case 'getRebaseTodoList':
				if (msg.error === null && msg.items !== null) {
					gitGraph.showRebaseTodoEditor(msg.items);
				} else {
					dialog.showError('Unable to get Rebase Todo List', msg.error, null, null);
				}
				break;
			case 'rebaseInteractive':
				if (msg.error === null) {
					gitGraph.refresh(false);
				} else {
					dialog.showError('Interactive Rebase', msg.error, null, null);
				}
				break;
			case 'rebaseOnto':
				refreshOrDisplayError(msg.error, 'Unable to Rebase Commits');
				break;
			case 'refresh':
				gitGraph.refresh(false);
				break;
			case 'renameBranch':
				refreshOrDisplayError(msg.error, 'Unable to Rename Branch');
				break;
			case 'resetFileToRevision':
				refreshOrDisplayError(msg.error, 'Unable to Reset File to Revision');
				break;
			case 'resetToCommit':
				refreshOrDisplayError(msg.error, 'Unable to Reset to Commit');
				break;
			case 'revertCommit':
				refreshOrDisplayError(msg.error, 'Unable to Revert Commit');
				break;
			case 'undoLastCommit':
				refreshOrDisplayError(msg.error, 'Unable to Reset Last Commit');
				break;
			case 'squashCommits':
				refreshOrDisplayError(msg.error, 'Unable to Squash Commits');
				break;
			case 'setGlobalViewState':
				finishOrDisplayError(msg.error, 'Unable to save the Global View State');
				break;
			case 'setWorkspaceViewState':
				finishOrDisplayError(msg.error, 'Unable to save the Workspace View State');
				break;
			case 'startCodeReview':
				if (msg.error === null) {
					gitGraph.startCodeReview(msg.commitHash, msg.compareWithHash, msg.codeReview);
				} else {
					dialog.showError('Unable to Start Code Review', msg.error, null, null);
				}
				break;
			case 'tagDetails':
				if (msg.details !== null) {
					gitGraph.renderTagDetails(msg.tagName, msg.commitHash, msg.details);
				} else {
					dialog.showError('Unable to retrieve Tag Details', msg.error, null, null);
				}
				break;
			case 'updateCodeReview':
				if (msg.error !== null) {
					dialog.showError('Unable to update Code Review', msg.error, null, null);
				}
				break;
			case 'viewAllChanges':
				finishOrDisplayError(msg.error, 'Unable to View All Changes', true);
				break;
			case 'viewDiff':
				finishOrDisplayError(msg.error, 'Unable to View Diff');
				break;
			case 'viewDiffWithWorkingFile':
				finishOrDisplayError(msg.error, 'Unable to View Diff with Working File');
				break;
			case 'viewFileAtRevision':
				finishOrDisplayError(msg.error, 'Unable to View File at Revision');
				break;
			case 'viewScm':
				finishOrDisplayError(msg.error, 'Unable to open the Source Control View');
				break;
		}
	});

	/**
	 * If a checkout failed because the uncommitted changes would be overwritten, offer to stash them and checkout again.
	 * @param error The error of the checkout.
	 * @param request The request that performed the checkout.
	 * @returns TRUE => The offer was shown, FALSE => The error wasn't caused by uncommitted changes.
	 */
	function offerStashAndCheckout(error: GG.ErrorInfo, request: GG.RequestCheckoutBranch | GG.RequestCheckoutCommit) {
		if (error === null || request.stashFirst || !/would be overwritten by checkout/.test(error)) return false;
		dialog.showConfirmation('<span class="messageContent">' + escapeHtml(error).replace(/\n/g, '<br>') + '</span><br>Do you want to stash the uncommitted changes (including untracked files), and then checkout?', 'Yes, stash & checkout', () => {
			runAction(Object.assign({}, request, { stashFirst: true }), 'Stashing Changes & Checking out');
		}, { type: TargetType.Repo });
		return true;
	}

	function handleResponseDeleteBranch(msg: GG.ResponseDeleteBranch) {
		if (msg.errors.length > 0 && msg.errors[0] !== null && msg.errors[0].includes('git branch -D')) {
			dialog.showConfirmation('The branch <b><i>' + escapeHtml(msg.branchName) + '</i></b> is not fully merged. Would you like to force delete it?', 'Yes, force delete branch', () => {
				runAction({ command: 'deleteBranch', repo: msg.repo, branchName: msg.branchName, forceDelete: true, deleteOnRemotes: msg.deleteOnRemotes }, 'Deleting Branch');
			}, { type: TargetType.Repo });
		} else {
			refreshAndDisplayErrors(msg.errors, 'Unable to Delete Branch');
		}
	}

	function handleResponsePushTagCommitNotOnRemote(repo: string, tagName: string, remotes: string[], commitHash: string, force: boolean, error: string) {
		const remotesNotContainingCommit: string[] = parseExtensionErrorInfo(error, GG.ErrorInfoExtensionPrefix.PushTagCommitNotOnRemote);

		const html = '<span class="dialogAlert">' + SVG_ICONS.alert + 'Warning: Commit is not on Remote' + (remotesNotContainingCommit.length > 1 ? 's ' : ' ') + '</span><br>' +
			'<span class="messageContent">' +
			'<p style="margin:0 0 6px 0;">The tag <b><i>' + escapeHtml(tagName) + '</i></b> is on a commit that isn\'t on any known branch on the remote' + (remotesNotContainingCommit.length > 1 ? 's' : '') + ' ' + formatCommaSeparatedList(remotesNotContainingCommit.map((remote) => '<b><i>' + escapeHtml(remote) + '</i></b>')) + '.</p>' +
			'<p style="margin:0;">Would you like to proceed to push the tag to the remote' + (remotes.length > 1 ? 's' : '') + ' ' + formatCommaSeparatedList(remotes.map((remote) => '<b><i>' + escapeHtml(remote) + '</i></b>')) + ' anyway?</p>' +
			'</span>';

		dialog.showForm(html, [{ type: DialogInputType.Checkbox, name: 'Always Proceed', value: false }], 'Proceed to Push', (values) => {
			if (<boolean>values[0]) {
				updateGlobalViewState('pushTagSkipRemoteCheck', true);
			}
			runAction({
				command: 'pushTag',
				repo: repo,
				tagName: tagName,
				remotes: remotes,
				commitHash: commitHash,
				skipRemoteCheck: true,
				force: force
			}, 'Pushing Tag');
		}, { type: TargetType.Repo }, 'Cancel', null, true);
	}

	function refreshOrDisplayError(error: GG.ErrorInfo, errorMessage: string, configChanges: boolean = false) {
		if (error === null) {
			gitGraph.refresh(false, configChanges);
		} else {
			dialog.showError(errorMessage, error, null, null);
		}
	}

	function refreshAndDisplayErrors(errors: GG.ErrorInfo[], errorMessage: string, configChanges: boolean = false) {
		const reducedErrors = reduceErrorInfos(errors);
		if (reducedErrors.error !== null) {
			dialog.showError(errorMessage, reducedErrors.error, null, null);
		}
		if (reducedErrors.partialOrCompleteSuccess) {
			gitGraph.refresh(false, configChanges);
		} else if (configChanges) {
			gitGraph.requestLoadConfig();
		}
	}

	function finishOrDisplayError(error: GG.ErrorInfo, errorMessage: string, dismissActionRunning: boolean = false) {
		if (error !== null) {
			dialog.showError(errorMessage, error, null, null);
		} else if (dismissActionRunning) {
			dialog.closeActionRunning();
		}
	}

	function finishOrDisplayErrors(errors: GG.ErrorInfo[], errorMessage: string, partialOrCompleteSuccessCallback: () => void, dismissActionRunning: boolean = false) {
		const reducedErrors = reduceErrorInfos(errors);
		finishOrDisplayError(reducedErrors.error, errorMessage, dismissActionRunning);
		if (reducedErrors.partialOrCompleteSuccess) {
			partialOrCompleteSuccessCallback();
		}
	}

	function reduceErrorInfos(errors: GG.ErrorInfo[]) {
		let error: GG.ErrorInfo = null, partialOrCompleteSuccess = false;
		for (let i = 0; i < errors.length; i++) {
			if (errors[i] !== null) {
				error = error !== null ? error + '\n\n' + errors[i] : errors[i];
			} else {
				partialOrCompleteSuccess = true;
			}
		}

		return {
			error: error,
			partialOrCompleteSuccess: partialOrCompleteSuccess
		};
	}

	/**
	 * Checks whether the given ErrorInfo has an ErrorInfoExtensionPrefix.
	 * @param error The ErrorInfo to check.
	 * @param prefix The ErrorInfoExtensionPrefix to test.
	 * @returns TRUE => ErrorInfo has the ErrorInfoExtensionPrefix, FALSE => ErrorInfo doesn\'t have the ErrorInfoExtensionPrefix
	 */
	function isExtensionErrorInfo(error: GG.ErrorInfo, prefix: GG.ErrorInfoExtensionPrefix) {
		return error !== null && error.startsWith(prefix);
	}

	/**
	 * Parses the JSON data from an ErrorInfo prefixed by the provided ErrorInfoExtensionPrefix.
	 * @param error The ErrorInfo to parse.
	 * @param prefix The ErrorInfoExtensionPrefix used by `error`.
	 * @returns The parsed JSON data.
	 */
	function parseExtensionErrorInfo(error: string, prefix: GG.ErrorInfoExtensionPrefix) {
		return JSON.parse(error.substring(prefix.length));
	}
});


/* File Tree Methods (for the Commit Details & Comparison Views) */

/** The key suffix of a file whose name is also used by a folder in the same folder (e.g. a file replaced by a folder of the same name) */
const FILE_TREE_SHADOWED_FILE_SUFFIX = '\u0000file';

/**
 * Build the File Tree of the files changed by a commit or a comparison.
 *
 * The contents of the folders are dictionaries without a prototype, and are only read via getFileTreeFolder / getFileTreeLeaf,
 * so a file or folder named after an Object.prototype member (e.g. "constructor") is stored and found like any other.
 * @param gitFiles The changed files.
 * @param codeReview The Code Review in progress, files it hasn't reviewed yet are marked.
 * @param getRepoPath Get the absolute path of the repository at a path relative to the current repository, NULL if it isn't a known repository.
 * @returns The root folder of the File Tree.
 */
function buildFileTree(gitFiles: ReadonlyArray<GG.GitFileChange>, codeReview: GG.CodeReview | null, getRepoPath: (relPath: string) => string | null): FileTreeFolder {
	const createFolder = (name: string, folderPath: string): FileTreeFolder => ({ type: 'folder', name: name, folderPath: folderPath, contents: Object.create(null), open: true, reviewed: true });
	const root = createFolder('', '');

	gitFiles.forEach((file, index) => {
		const names = file.newFilePath.split('/');
		let folder = root;
		for (let depth = 0; depth < names.length; depth++) {
			const name = names[depth], relPath = names.slice(0, depth + 1).join('/');
			const repoPath = getRepoPath(relPath);
			if (repoPath !== null) {
				if (typeof getOwnFileTreeEntry(folder, name) === 'undefined') addFileTreeChild(folder, { type: 'repo', name: name, path: repoPath });
				return;
			}
			if (depth === names.length - 1) {
				// The last name is empty when the path ends with "/" (e.g. an untracked folder)
				if (name !== '') addFileTreeChild(folder, { type: 'file', name: name, index: index, reviewed: codeReview === null || !codeReview.remainingFiles.includes(file.newFilePath) });
				return;
			}
			let child = getFileTreeFolder(folder, name);
			if (typeof child === 'undefined') {
				child = createFolder(name, relPath);
				addFileTreeChild(folder, child);
			}
			folder = child;
		}
	});
	return root;
}

function getOwnFileTreeEntry(folder: FileTreeFolder, key: string): FileTreeNode | undefined {
	return Object.prototype.hasOwnProperty.call(folder.contents, key) ? folder.contents[key] : undefined;
}

/**
 * Add a file, folder or repository to a folder of a File Tree. When a folder and a file (or repository) share a name, the folder
 * keeps the name as its key, and the other one is stored under the name with FILE_TREE_SHADOWED_FILE_SUFFIX.
 */
function addFileTreeChild(folder: FileTreeFolder, node: FileTreeNode) {
	const existing = getOwnFileTreeEntry(folder, node.name);
	if (typeof existing === 'undefined' || (existing.type === 'folder') === (node.type === 'folder')) {
		folder.contents[node.name] = node;
	} else if (node.type === 'folder') {
		folder.contents[node.name + FILE_TREE_SHADOWED_FILE_SUFFIX] = existing;
		folder.contents[node.name] = node;
	} else {
		folder.contents[node.name + FILE_TREE_SHADOWED_FILE_SUFFIX] = node;
	}
}

function getFileTreeFolder(folder: FileTreeFolder, name: string): FileTreeFolder | undefined {
	const entry = getOwnFileTreeEntry(folder, name);
	return typeof entry !== 'undefined' && entry.type === 'folder' ? entry : undefined;
}

function getFileTreeLeaf(folder: FileTreeFolder, name: string): FileTreeLeaf | undefined {
	const shadowed = getOwnFileTreeEntry(folder, name + FILE_TREE_SHADOWED_FILE_SUFFIX);
	if (typeof shadowed !== 'undefined' && shadowed.type !== 'folder') return shadowed;
	const entry = getOwnFileTreeEntry(folder, name);
	return typeof entry !== 'undefined' && entry.type !== 'folder' ? entry : undefined;
}

/** Is a list item of the file view a folder (otherwise it's a file or a repository) */
function isFileTreeFolderElem(li: HTMLElement) {
	return li.children.length > 0 && li.children[0].classList.contains('fileTreeFolder');
}

function generateFileViewHtml(folder: FileTreeFolder, gitFiles: ReadonlyArray<GG.GitFileChange>, lastViewedFile: string | null, fileContextMenuOpen: number, type: GG.FileViewType, isUncommitted: boolean) {
	return type === GG.FileViewType.List
		? generateFileListHtml(folder, gitFiles, lastViewedFile, fileContextMenuOpen, isUncommitted)
		: generateFileTreeHtml(folder, gitFiles, lastViewedFile, fileContextMenuOpen, isUncommitted, true);
}

function generateFileTreeHtml(folder: FileTreeFolder, gitFiles: ReadonlyArray<GG.GitFileChange>, lastViewedFile: string | null, fileContextMenuOpen: number, isUncommitted: boolean, topLevelFolder: boolean): string {
	const curFolderInfo = topLevelFolder || !initialState.config.commitDetailsView.fileTreeCompactFolders
		? { folder: folder, name: folder.name, pathSeg: folder.name }
		: getCurrentFolderInfo(folder, folder.name, folder.name);

	const children = sortFolderKeys(curFolderInfo.folder).map((key) => {
		const cur = curFolderInfo.folder.contents[key];
		return cur.type === 'folder'
			? generateFileTreeHtml(cur, gitFiles, lastViewedFile, fileContextMenuOpen, isUncommitted, false)
			: generateFileTreeLeafHtml(cur.name, cur, gitFiles, lastViewedFile, fileContextMenuOpen, isUncommitted);
	});

	return (topLevelFolder ? '' : '<li' + (curFolderInfo.folder.open ? '' : ' class="closed"') + ' data-pathseg="' + encodeURIComponent(curFolderInfo.pathSeg) + '"><span class="fileTreeFolder' + (curFolderInfo.folder.reviewed ? '' : ' pendingReview') + '" title="./' + escapeHtml(curFolderInfo.folder.folderPath) + '" data-folderpath="' + encodeURIComponent(curFolderInfo.folder.folderPath) + '"><span class="fileTreeFolderIcon">' + (curFolderInfo.folder.open ? SVG_ICONS.openFolder : SVG_ICONS.closedFolder) + '</span><span class="gitFolderName">' + escapeHtml(curFolderInfo.name) + '</span></span>') +
		'<ul class="fileTreeFolderContents' + (curFolderInfo.folder.open ? '' : ' hidden') + '">' + children.join('') + '</ul>' +
		(topLevelFolder ? '' : '</li>');
}

function getCurrentFolderInfo(folder: FileTreeFolder, name: string, pathSeg: string): { folder: FileTreeFolder, name: string, pathSeg: string } {
	const keys = Object.keys(folder.contents);
	let child: FileTreeNode;
	return keys.length === 1 && (child = folder.contents[keys[0]]).type === 'folder'
		? getCurrentFolderInfo(<FileTreeFolder>child, name + ' / ' + child.name, pathSeg + '/' + child.name)
		: { folder: folder, name: name, pathSeg: pathSeg };
}

function generateFileListHtml(folder: FileTreeFolder, gitFiles: ReadonlyArray<GG.GitFileChange>, lastViewedFile: string | null, fileContextMenuOpen: number, isUncommitted: boolean) {
	const sortLeaves = (folder: FileTreeFolder, folderPath: string) => {
		let keys = sortFolderKeys(folder);
		let items: { relPath: string, leaf: FileTreeLeaf }[] = [];
		for (let i = 0; i < keys.length; i++) {
			let cur = folder.contents[keys[i]];
			let relPath = (folderPath !== '' ? folderPath + '/' : '') + cur.name;
			if (cur.type === 'folder') {
				items = items.concat(sortLeaves(cur, relPath));
			} else {
				items.push({ relPath: relPath, leaf: cur });
			}
		}
		return items;
	};
	let sortedLeaves = sortLeaves(folder, '');
	let html = '';
	for (let i = 0; i < sortedLeaves.length; i++) {
		html += generateFileTreeLeafHtml(sortedLeaves[i].relPath, sortedLeaves[i].leaf, gitFiles, lastViewedFile, fileContextMenuOpen, isUncommitted);
	}
	return '<ul class="fileTreeFolderContents">' + html + '</ul>';
}

function generateFileTreeLeafHtml(name: string, leaf: FileTreeLeaf, gitFiles: ReadonlyArray<GG.GitFileChange>, lastViewedFile: string | null, fileContextMenuOpen: number, isUncommitted: boolean) {
	let encodedName = encodeURIComponent(name), escapedName = escapeHtml(name);
	if (leaf.type === 'file') {
		const fileTreeFile = gitFiles[leaf.index];
		const textFile = fileTreeFile.additions !== null && fileTreeFile.deletions !== null;
		const diffPossible = fileTreeFile.type === GG.GitFileStatus.Untracked || textFile;
		const changeTypeMessage = GIT_FILE_CHANGE_TYPES[fileTreeFile.type] + (fileTreeFile.type === GG.GitFileStatus.Renamed ? ' (' + escapeHtml(fileTreeFile.oldFilePath) + ' → ' + escapeHtml(fileTreeFile.newFilePath) + ')' : '');
		return '<li data-pathseg="' + encodedName + '"><span class="fileTreeFileRecord' + (leaf.index === fileContextMenuOpen ? ' ' + CLASS_CONTEXT_MENU_ACTIVE : '') + '" data-index="' + leaf.index + '"><span class="fileTreeFile' + (diffPossible ? ' gitDiffPossible' : '') + (leaf.reviewed ? '' : ' ' + CLASS_PENDING_REVIEW) + '" title="' + (diffPossible ? 'Click to View Diff' : 'Unable to View Diff' + (fileTreeFile.type !== GG.GitFileStatus.Deleted ? ' (this is a binary file)' : '')) + ' • ' + changeTypeMessage + '"><span class="fileTreeFileIcon">' + SVG_ICONS.file + '</span><span class="gitFileName ' + fileTreeFile.type + '">' + escapedName + '</span>' +
			(fileTreeFile.type === GG.GitFileStatus.Renamed ? '<span class="gitFileRenamedFrom">← ' + escapeHtml(getRenamedFromLabel(fileTreeFile.oldFilePath, fileTreeFile.newFilePath)) + '</span>' : '') + '</span>' +
			(initialState.config.enhancedAccessibility ? '<span class="fileTreeFileType" title="' + changeTypeMessage + '">' + fileTreeFile.type + '</span>' : '') +
			(fileTreeFile.type !== GG.GitFileStatus.Added && fileTreeFile.type !== GG.GitFileStatus.Untracked && fileTreeFile.type !== GG.GitFileStatus.Deleted && textFile ? '<span class="fileTreeFileAddDel">(<span class="fileTreeFileAdd" title="' + fileTreeFile.additions + ' addition' + (fileTreeFile.additions !== 1 ? 's' : '') + '">+' + fileTreeFile.additions + '</span>|<span class="fileTreeFileDel" title="' + fileTreeFile.deletions + ' deletion' + (fileTreeFile.deletions !== 1 ? 's' : '') + '">-' + fileTreeFile.deletions + '</span>)</span>' : '') +
			(fileTreeFile.newFilePath === lastViewedFile ? '<span id="cdvLastFileViewed" title="Last File Viewed">' + SVG_ICONS.eyeOpen + '</span>' : '') +
			'<span class="copyGitFile fileTreeFileAction" title="Copy Absolute File Path to Clipboard">' + SVG_ICONS.copy + '</span>' +
			(fileTreeFile.type !== GG.GitFileStatus.Deleted
				? (diffPossible && !isUncommitted ? '<span class="viewGitFileAtRevision fileTreeFileAction" title="View File at this Revision">' + SVG_ICONS.commit + '</span>' : '') +
				'<span class="openGitFile fileTreeFileAction" title="Open File">' + SVG_ICONS.openFile + '</span>'
				: ''
			) + '</span></li>';
	} else {
		return '<li data-pathseg="' + encodedName + '"><span class="fileTreeRepo" data-path="' + encodeURIComponent(leaf.path) + '" title="Click to View Repository"><span class="fileTreeRepoIcon">' + SVG_ICONS.closedFolder + '</span>' + escapedName + '</span></li>';
	}
}

/**
 * Arrange a rebase todo list like `git rebase --autosquash`: each "fixup! <subject>" / "squash! <subject>" commit is
 * moved after the commit it refers to (matched by subject or hash prefix), with the action fixup / squash.
 * @param items The commits of the rebase todo list (oldest first).
 * @returns The arranged todo list.
 */
function arrangeAutosquashTodo(items: ReadonlyArray<GG.RebaseTodoItem>) {
	const todo: { item: GG.RebaseTodoItem, action: GG.RebaseTodoAction }[] = [];
	const pending = items.slice();
	while (pending.length > 0) {
		const item = pending.shift()!;
		todo.push({ item: item, action: GG.RebaseTodoAction.Pick });
		// Append the fixup!/squash! commits (including those of the appended commits) that refer to this commit
		for (let i = todo.length - 1; i < todo.length; i++) {
			const target = todo[i].item;
			for (let j = 0; j < pending.length; j++) {
				const match = pending[j].subject.match(/^(fixup|squash)! (.*)$/);
				if (match !== null && (match[2] === target.subject || target.hash.startsWith(match[2]))) {
					todo.push({ item: pending[j], action: match[1] === 'fixup' ? GG.RebaseTodoAction.Fixup : GG.RebaseTodoAction.Squash });
					pending.splice(j, 1);
					j--;
				}
			}
		}
	}
	return todo;
}

/**
 * Get the label describing where a renamed file was renamed from: only the old file name if the file stayed in
 * the same folder, otherwise the old path.
 */
function getRenamedFromLabel(oldFilePath: string, newFilePath: string) {
	const oldSlash = oldFilePath.lastIndexOf('/'), newSlash = newFilePath.lastIndexOf('/');
	return oldFilePath.substring(0, oldSlash + 1) === newFilePath.substring(0, newSlash + 1) ? oldFilePath.substring(oldSlash + 1) : oldFilePath;
}

function alterFileTreeFolderOpen(folder: FileTreeFolder, folderPath: string, open: boolean) {
	let cur: FileTreeFolder | undefined = folder;
	const names = folderPath.split('/');
	for (let i = 0; i < names.length && typeof cur !== 'undefined'; i++) {
		cur = getFileTreeFolder(cur, names[i]);
	}
	if (typeof cur !== 'undefined') cur.open = open;
}

function alterFileTreeFileReviewed(folder: FileTreeFolder, filePath: string, reviewed: boolean) {
	let path = filePath.split('/'), i, cur = folder, folders = [folder];
	for (i = 0; i < path.length; i++) {
		if (i < path.length - 1) {
			const next = getFileTreeFolder(cur, path[i]);
			if (typeof next === 'undefined') break;
			cur = next;
			folders.push(cur);
		} else {
			const leaf = getFileTreeLeaf(cur, path[i]);
			if (typeof leaf !== 'undefined' && leaf.type === 'file') leaf.reviewed = reviewed;
		}
	}

	// Recalculate whether each of the folders leading to the file are now reviewed (deepest first).
	for (i = folders.length - 1; i >= 0; i--) {
		let keys = Object.keys(folders[i].contents), entireFolderReviewed = true;
		for (let j = 0; j < keys.length; j++) {
			let cur = folders[i].contents[keys[j]];
			if ((cur.type === 'folder' || cur.type === 'file') && !cur.reviewed) {
				entireFolderReviewed = false;
				break;
			}
		}
		folders[i].reviewed = entireFolderReviewed;
	}
}

function setFileTreeReviewed(folder: FileTreeFolder, reviewed: boolean) {
	folder.reviewed = reviewed;
	let keys = Object.keys(folder.contents);
	for (let i = 0; i < keys.length; i++) {
		let cur = folder.contents[keys[i]];
		if (cur.type === 'folder') {
			setFileTreeReviewed(cur, reviewed);
		} else if (cur.type === 'file') {
			cur.reviewed = reviewed;
		}
	}
}

function calcFileTreeFoldersReviewed(folder: FileTreeFolder) {
	const calc = (folder: FileTreeFolder) => {
		let reviewed = true;
		let keys = Object.keys(folder.contents);
		for (let i = 0; i < keys.length; i++) {
			let cur = folder.contents[keys[i]];
			if ((cur.type === 'folder' && !calc(cur)) || (cur.type === 'file' && !cur.reviewed)) reviewed = false;
		}
		folder.reviewed = reviewed;
		return reviewed;
	};
	calc(folder);
}

function updateFileTreeHtml(elem: HTMLElement, folder: FileTreeFolder) {
	let ul = getChildUl(elem);
	if (ul === null) return;

	for (let i = 0; i < ul.children.length; i++) {
		let li = <HTMLLIElement>ul.children[i];
		let pathSeg = decodeURIComponent(li.dataset.pathseg!);
		let child = getChildByPathSegment(folder, pathSeg, !isFileTreeFolderElem(li));
		if (typeof child === 'undefined') continue;
		if (child.type === 'folder') {
			alterClass(<HTMLSpanElement>li.children[0], CLASS_PENDING_REVIEW, !child.reviewed);
			updateFileTreeHtml(li, child);
		} else if (child.type === 'file') {
			alterClass(<HTMLSpanElement>li.children[0].children[0], CLASS_PENDING_REVIEW, !child.reviewed);
		}
	}
}

function updateFileTreeHtmlFileReviewed(elem: HTMLElement, folder: FileTreeFolder, filePath: string) {
	let path = filePath;
	const update = (elem: HTMLElement, folder: FileTreeFolder) => {
		let ul = getChildUl(elem);
		if (ul === null) return;

		for (let i = 0; i < ul.children.length; i++) {
			let li = <HTMLLIElement>ul.children[i];
			let pathSeg = decodeURIComponent(li.dataset.pathseg!), isFolder = isFileTreeFolderElem(li);
			// A file and a folder can have the same path segment, only the folder can contain the file
			if (isFolder ? path.startsWith(pathSeg + '/') : path === pathSeg) {
				let child = getChildByPathSegment(folder, pathSeg, !isFolder);
				if (typeof child === 'undefined') break;
				if (child.type === 'folder') {
					alterClass(<HTMLSpanElement>li.children[0], CLASS_PENDING_REVIEW, !child.reviewed);
					path = path.substring(pathSeg.length + 1);
					update(li, child);
				} else if (child.type === 'file') {
					alterClass(<HTMLSpanElement>li.children[0].children[0], CLASS_PENDING_REVIEW, !child.reviewed);
				}
				break;
			}
		}
	};
	update(elem, folder);
}

function getFilesInTree(folder: FileTreeFolder, gitFiles: ReadonlyArray<GG.GitFileChange>) {
	let files: string[] = [];
	const scanFolder = (folder: FileTreeFolder) => {
		let keys = Object.keys(folder.contents);
		for (let i = 0; i < keys.length; i++) {
			let cur = folder.contents[keys[i]];
			if (cur.type === 'folder') {
				scanFolder(cur);
			} else if (cur.type === 'file') {
				files.push(gitFiles[cur.index].newFilePath);
			}
		}
	};
	scanFolder(folder);
	return files;
}

function sortFolderKeys(folder: FileTreeFolder) {
	let keys = Object.keys(folder.contents);
	keys.sort((a, b) => folder.contents[a].type !== 'file' && folder.contents[b].type === 'file' ? -1 : folder.contents[a].type === 'file' && folder.contents[b].type !== 'file' ? 1 : folder.contents[a].name.localeCompare(folder.contents[b].name));
	return keys;
}

function getChildByPathSegment(folder: FileTreeFolder, pathSeg: string, isLeaf: boolean): FileTreeNode | undefined {
	const names = pathSeg.split('/');
	let cur: FileTreeFolder | undefined = folder;
	for (let i = 0; i < names.length - 1 && typeof cur !== 'undefined'; i++) {
		cur = getFileTreeFolder(cur, names[i]);
	}
	if (typeof cur === 'undefined') return undefined;
	return isLeaf ? getFileTreeLeaf(cur, names[names.length - 1]) : getFileTreeFolder(cur, names[names.length - 1]);
}


/* Repository State Helpers */

function getCommitOrdering(repoValue: GG.RepoCommitOrdering): GG.CommitOrdering {
	switch (repoValue) {
		case GG.RepoCommitOrdering.Default:
			return initialState.config.commitOrdering;
		case GG.RepoCommitOrdering.Date:
			return GG.CommitOrdering.Date;
		case GG.RepoCommitOrdering.AuthorDate:
			return GG.CommitOrdering.AuthorDate;
		case GG.RepoCommitOrdering.Topological:
			return GG.CommitOrdering.Topological;
	}
}

/**
 * The initial Scope of repositories, from the `easy-graph.repository.showRemoteBranches` and
 * `easy-graph.repository.includeCommitsMentionedByReflogs` Extension Settings.
 */
function getInitialRepoScope(): GG.RepoScope[] {
	const scope: GG.RepoScope[] = ['local'];
	if (initialState.config.showRemoteBranches) scope.push('remote');
	if (initialState.config.includeCommitsMentionedByReflogs) scope.push('reflog');
	return scope;
}

/**
 * Get the scopes to load for a repository.
 * @param repoValue The options selected in the repository's Scope dropdown (NULL => the initial Scope).
 * @returns The scopes, in the order of the Scope dropdown. "All" (or a selection without any offered scope) => every offered scope.
 */
function getRepoScope(repoValue: ReadonlyArray<GG.RepoScopeOption> | null): GG.RepoScope[] {
	if (repoValue === null) return getInitialRepoScope();
	const scope = REPO_SCOPES.filter((value) => repoValue.includes(value));
	return repoValue.includes(SCOPE_OPTION_ALL) || scope.length === 0 ? REPO_SCOPES.slice() : scope;
}

/**
 * Is Simplify By Decoration enabled for a repository.
 * @param repoValue The repository's override of `easy-graph.repository.simplifyByDecoration`.
 */
function getSimplifyByDecoration(repoValue: GG.BooleanOverride) {
	switch (repoValue) {
		case GG.BooleanOverride.Enabled:
			return true;
		case GG.BooleanOverride.Disabled:
			return false;
		default:
			return initialState.config.simplifyByDecoration;
	}
}

function getShowStashes(repoValue: GG.BooleanOverride) {
	return repoValue === GG.BooleanOverride.Default
		? initialState.config.showStashes
		: repoValue === GG.BooleanOverride.Enabled;
}

function getShowTags(repoValue: GG.BooleanOverride) {
	return repoValue === GG.BooleanOverride.Default
		? initialState.config.showTags
		: repoValue === GG.BooleanOverride.Enabled;
}

function getOnlyFollowFirstParent(repoValue: GG.BooleanOverride) {
	return repoValue === GG.BooleanOverride.Default
		? initialState.config.onlyFollowFirstParent
		: repoValue === GG.BooleanOverride.Enabled;
}

function getOnRepoLoadShowCheckedOutBranch(repoValue: GG.BooleanOverride) {
	return repoValue === GG.BooleanOverride.Default
		? initialState.config.onRepoLoad.showCheckedOutBranch
		: repoValue === GG.BooleanOverride.Enabled;
}

function getOnRepoLoadShowSpecificBranches(repoValue: string[] | null) {
	return repoValue === null
		? initialState.config.onRepoLoad.showSpecificBranches
		: repoValue;
}


/* Miscellaneous Helper Methods */

function haveFilesChanged(oldFiles: ReadonlyArray<GG.GitFileChange> | null, newFiles: ReadonlyArray<GG.GitFileChange> | null) {
	if ((oldFiles === null) !== (newFiles === null)) {
		return true;
	} else if (oldFiles === null && newFiles === null) {
		return false;
	} else {
		return !arraysEqual(oldFiles!, newFiles!, (a, b) => a.additions === b.additions && a.deletions === b.deletions && a.newFilePath === b.newFilePath && a.oldFilePath === b.oldFilePath && a.type === b.type);
	}
}

/**
 * Generate the HTML describing the number of changed files, and the total numbers of added and deleted lines.
 * @param fileChanges The file changes.
 * @returns The HTML.
 */
function generateFileChangesStatsHtml(fileChanges: ReadonlyArray<GG.GitFileChange>) {
	let additions = 0, deletions = 0;
	for (let i = 0; i < fileChanges.length; i++) {
		additions += fileChanges[i].additions !== null ? fileChanges[i].additions! : 0;
		deletions += fileChanges[i].deletions !== null ? fileChanges[i].deletions! : 0;
	}
	return fileChanges.length + ' file' + (fileChanges.length !== 1 ? 's' : '') + ', '
		+ '<span class="fileTreeFileAdd" title="' + additions + ' addition' + (additions !== 1 ? 's' : '') + '">+' + additions + '</span> '
		+ '<span class="fileTreeFileDel" title="' + deletions + ' deletion' + (deletions !== 1 ? 's' : '') + '">-' + deletions + '</span>';
}

/**
 * Get the regular expression of a file filter: a case-insensitive substring match, where "*" matches any characters.
 * @param filter The file filter.
 * @returns The regular expression, or NULL if the filter is empty.
 */
/**
 * Get the parents of a merge commit that it can be compared with, i.e. the parents that are loaded.
 * @param parents The parents of the commit.
 * @param commitLookup The index of each loaded commit.
 * @returns The parents with their number, as in `<commit>^<number>`. Empty if the commit isn't a merge.
 */
function getComparableMergeParents(parents: ReadonlyArray<string>, commitLookup: { readonly [hash: string]: number }) {
	const comparable: { number: number, hash: string }[] = [];
	if (parents.length > 1) {
		parents.forEach((hash, i) => {
			if (Object.prototype.hasOwnProperty.call(commitLookup, hash)) comparable.push({ number: i + 1, hash: hash });
		});
	}
	return comparable;
}

/**
 * Does a changed file match the file filter of the Commit Details View? A renamed file also matches by its old path.
 * @param pattern The filter, from getFileFilterRegExp (NULL => no filter).
 */
function fileChangeMatchesFilter(file: GG.GitFileChange, pattern: RegExp | null) {
	return pattern === null || pattern.test(file.newFilePath) || pattern.test(file.oldFilePath);
}

/**
 * Get the text copied by "Copy All Relative File Paths to Clipboard": the paths (relative to the repository, with
 * "/" separators like the other copied relative paths) of the files that the file filter shows, one per line.
 * @param fileChanges The changed files.
 * @param filter The file filter of the Commit Details View.
 */
function getRelativeFilePathsToCopy(fileChanges: ReadonlyArray<GG.GitFileChange>, filter: string | undefined) {
	const pattern = getFileFilterRegExp(filter), paths: string[] = [];
	fileChanges.forEach((file) => {
		if (fileChangeMatchesFilter(file, pattern) && !paths.includes(file.newFilePath)) paths.push(file.newFilePath);
	});
	return paths.join('\n');
}

function getFileFilterRegExp(filter: string | undefined) {
	const trimmed = typeof filter === 'string' ? filter.trim() : '';
	return trimmed !== '' ? new RegExp(trimmed.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*'), 'i') : null;
}

/**
 * The length of abbreviated commit hashes in the current repository (its effective `core.abbrev`), loaded with the repository info.
 */
let abbrevLength = DEFAULT_ABBREV_LENGTH;

/**
 * Abbreviate a commit hash for display, to the effective `core.abbrev` of the current repository.
 */
function abbrevCommit(commitHash: string) {
	return commitHash.length > abbrevLength ? commitHash.slice(0, abbrevLength) : commitHash;
}

/**
 * Is a stash a dropped stash (found by the Dangling scope), whose selector is its hash rather than a reference in the stash list.
 * @param selector The selector of the stash.
 */
function isDroppedStash(selector: string) {
	return !selector.startsWith('refs/');
}

/**
 * Get the name of a stash for display, e.g. "stash@{0}", or "dropped stash" for a dropped stash.
 * @param selector The selector of the stash.
 */
function getStashName(selector: string) {
	return isDroppedStash(selector) ? 'dropped stash' : selector.substring(5);
}

function getRepoDropdownOptions(repos: Readonly<GG.GitRepoSet>) {
	const repoPaths = getSortedRepositoryPaths(repos, initialState.config.repoDropdownOrder);
	const paths: string[] = [], names: string[] = [], distinctNames: string[] = [], firstSep: number[] = [];
	const resolveAmbiguous = (indexes: number[]) => {
		// Find ambiguous names within indexes
		let firstOccurrence: { [name: string]: number } = {}, ambiguous: { [name: string]: number[] } = {};
		for (let i = 0; i < indexes.length; i++) {
			let name = distinctNames[indexes[i]];
			if (typeof firstOccurrence[name] === 'number') {
				// name is ambiguous
				if (typeof ambiguous[name] === 'undefined') {
					// initialise ambiguous array with the first occurrence
					ambiguous[name] = [firstOccurrence[name]];
				}
				ambiguous[name].push(indexes[i]); // append current ambiguous index
			} else {
				firstOccurrence[name] = indexes[i]; // set the first occurrence of the name
			}
		}

		let ambiguousNames = Object.keys(ambiguous);
		for (let i = 0; i < ambiguousNames.length; i++) {
			// For each ambiguous name, resolve the ambiguous indexes
			let ambiguousIndexes = ambiguous[ambiguousNames[i]], retestIndexes = [];
			for (let j = 0; j < ambiguousIndexes.length; j++) {
				let ambiguousIndex = ambiguousIndexes[j];
				let nextSep = paths[ambiguousIndex].lastIndexOf('/', paths[ambiguousIndex].length - distinctNames[ambiguousIndex].length - 2);
				if (firstSep[ambiguousIndex] < nextSep) {
					// prepend the addition path and retest
					distinctNames[ambiguousIndex] = paths[ambiguousIndex].substring(nextSep + 1);
					retestIndexes.push(ambiguousIndex);
				} else {
					distinctNames[ambiguousIndex] = paths[ambiguousIndex];
				}
			}
			if (retestIndexes.length > 1) {
				// If there are 2 or more indexes that may be ambiguous
				resolveAmbiguous(retestIndexes);
			}
		}
	};

	// Initialise recursion
	const indexes = [];
	for (let i = 0; i < repoPaths.length; i++) {
		firstSep.push(repoPaths[i].indexOf('/'));
		const repo = repos[repoPaths[i]];
		if (repo.name) {
			// A name has been set for the repository
			paths.push(repoPaths[i]);
			names.push(repo.name);
			distinctNames.push(repo.name);
		} else if (firstSep[i] === repoPaths[i].length - 1 || firstSep[i] === -1) {
			// Path has no slashes, or a single trailing slash ==> use the path as the name
			paths.push(repoPaths[i]);
			names.push(repoPaths[i]);
			distinctNames.push(repoPaths[i]);
		} else {
			paths.push(repoPaths[i].endsWith('/') ? repoPaths[i].substring(0, repoPaths[i].length - 1) : repoPaths[i]); // Remove trailing slash if it exists
			let name = paths[i].substring(paths[i].lastIndexOf('/') + 1);
			names.push(name);
			distinctNames.push(name);
			indexes.push(i);
		}
	}
	resolveAmbiguous(indexes);

	const options: DropdownOption[] = [];
	for (let i = 0; i < repoPaths.length; i++) {
		let hint;
		if (names[i] === distinctNames[i]) {
			// Name is distinct, no hint needed
			hint = '';
		} else {
			// Hint path is the prefix of the distinctName before the common suffix with name
			let hintPath = distinctNames[i].substring(0, distinctNames[i].length - names[i].length - 1);

			// Keep two informative directories
			let hintComps = hintPath.split('/');
			let keepDirs = hintComps[0] !== '' ? 2 : 3;
			if (hintComps.length > keepDirs) hintComps.splice(keepDirs, hintComps.length - keepDirs, '...');

			// Construct the hint
			hint = (distinctNames[i] !== paths[i] ? '.../' : '') + hintComps.join('/');
		}
		options.push({ name: names[i], value: repoPaths[i], hint: hint, displayName: hint !== '' ? distinctNames[i].split('/').slice(-2).join('/') : undefined });
	}
	return options;
}

function runAction(msg: GG.RequestMessage, action: string) {
	dialog.showActionRunning(action);
	sendMessage(msg);
}

// The hooks skipped by "No Verify" when merging or pulling: a merge commit and the commit of a squash merge run different hooks
const NO_VERIFY_MERGE_INFO = 'Skip the pre-merge-commit and commit-msg hooks of the merge commit, or the pre-commit and commit-msg hooks of the squashed commit (--no-verify).';

/**
 * Get the "No Verify" checkbox of a dialog, which is unchecked by default (there is no Extension Setting for it).
 * @param info The description of the hooks that are skipped.
 * @returns The dialog input.
 */
function getNoVerifyInput(info: string): DialogInput {
	return { type: DialogInputType.Checkbox, name: 'No Verify', value: false, info: info };
}

function getBranchLabels(heads: ReadonlyArray<string>, remotes: ReadonlyArray<GG.GitCommitRemote>) {
	let headLabels: { name: string; remotes: string[] }[] = [], headLookup: { [name: string]: number } = {}, remoteLabels: ReadonlyArray<GG.GitCommitRemote>;
	for (let i = 0; i < heads.length; i++) {
		headLabels.push({ name: heads[i], remotes: [] });
		headLookup[heads[i]] = i;
	}
	if (initialState.config.referenceLabels.combineLocalAndRemoteBranchLabels) {
		let remainingRemoteLabels = [];
		for (let i = 0; i < remotes.length; i++) {
			if (remotes[i].remote !== null) { // If the remote of the remote branch ref is known
				let branchName = remotes[i].name.substring(remotes[i].remote!.length + 1);
				if (typeof headLookup[branchName] === 'number') {
					headLabels[headLookup[branchName]].remotes.push(remotes[i].remote!);
					continue;
				}
			}
			remainingRemoteLabels.push(remotes[i]);
		}
		remoteLabels = remainingRemoteLabels;
	} else {
		remoteLabels = remotes;
	}
	return { heads: headLabels, remotes: remoteLabels };
}

function findCommitElemWithId(elems: HTMLCollectionOf<HTMLElement>, id: number | null) {
	if (id === null) return null;
	let findIdStr = id.toString();
	for (let i = 0; i < elems.length; i++) {
		if (findIdStr === elems[i].dataset.id) return elems[i];
	}
	return null;
}

function generateSignatureHtml(signature: GG.GitSignature) {
	return '<span class="signatureInfo ' + signature.status + '" title="' + GIT_SIGNATURE_STATUS_DESCRIPTIONS[signature.status] + ':'
		+ ' Signed by ' + escapeHtml(signature.signer !== '' ? signature.signer : '<Unknown>')
		+ ' (GPG Key Id: ' + escapeHtml(signature.key !== '' ? signature.key : '<Unknown>') + ')">'
		+ (signature.status === GG.GitSignatureStatus.GoodAndValid
			? SVG_ICONS.passed
			: signature.status === GG.GitSignatureStatus.Bad
				? SVG_ICONS.failed
				: SVG_ICONS.inconclusive)
		+ '</span>';
}

function closeDialogAndContextMenu() {
	if (dialog.isOpen()) dialog.close();
	if (contextMenu.isOpen()) contextMenu.close();
}

/**
 * Is the modifier key of the keyboard shortcuts pressed (it can be restricted to only CTRL, or only CMD).
 * @param e The keyboard event.
 * @param modifier The configured modifier key.
 * @returns TRUE => The modifier key is pressed, FALSE => The modifier key isn't pressed.
 */
function isKeybindingModifierPressed(e: KeyboardEvent, modifier: GG.KeybindingModifier) {
	switch (modifier) {
		case GG.KeybindingModifier.Ctrl:
			return e.ctrlKey && !e.metaKey;
		case GG.KeybindingModifier.Cmd:
			return e.metaKey && !e.ctrlKey;
		default:
			return e.ctrlKey || e.metaKey;
	}
}
