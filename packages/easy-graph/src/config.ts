import * as vscode from 'vscode';
import {
	BooleanOverride,
	BuiltinGitConfig,
	CommitDetailsViewConfig,
	CommitDetailsViewLocation,
	CommitOrdering,
	ContextMenuActionsVisibility,
	CustomBranchGlobPattern,
	CustomEmojiShortcodeMapping,
	CustomPullRequestProvider,
	DateFormat,
	DateFormatType,
	DateType,
	DefaultColumnVisibility,
	DialogDefaults,
	FileViewType,
	FindSearchColumn,
	GitPushBranchMode,
	GitResetMode,
	GraphConfig,
	GraphStyle,
	GraphUncommittedChangesStyle,
	KeybindingConfig,
	KeybindingModifier,
	MuteCommitsConfig,
	OnRepoLoadConfig,
	RefLabelAlignment,
	ReferenceLabelsConfig,
	RepoDropdownOrder,
	RepoScope,
	SquashMessageFormat,
	TagType,
	ToolbarButtonVisibility
} from './types';

const VIEW_COLUMN_MAPPING: { [column: string]: vscode.ViewColumn } = {
	'Active': vscode.ViewColumn.Active,
	'Beside': vscode.ViewColumn.Beside,
	'One': vscode.ViewColumn.One,
	'Two': vscode.ViewColumn.Two,
	'Three': vscode.ViewColumn.Three,
	'Four': vscode.ViewColumn.Four,
	'Five': vscode.ViewColumn.Five,
	'Six': vscode.ViewColumn.Six,
	'Seven': vscode.ViewColumn.Seven,
	'Eight': vscode.ViewColumn.Eight,
	'Nine': vscode.ViewColumn.Nine
};

/**
 * The ViewColumn of the Easy Graph View in the editor (undefined when it isn't open), used to resolve "Beside" relative to the Easy Graph View.
 */
let graphViewColumn: vscode.ViewColumn | undefined;

/**
 * Record the ViewColumn of the Easy Graph View in the editor.
 * @param column The ViewColumn, or undefined when the view is closed.
 */
export function setGraphViewColumn(column: vscode.ViewColumn | undefined) {
	graphViewColumn = column;
}

/**
 * Represents the users configuration of Git Graph Extension Settings.
 */
class Config {
	private readonly config: vscode.WorkspaceConfiguration;
	private readonly resource: vscode.Uri | undefined;


	/**
	 * Creates a Config instance.
	 * @param repo An option path of a repository (to be used for Workspace Folder Scoped Configuration Values).
	 * @returns A Config instance.
	 */
	constructor(repo?: string) {
		this.resource = repo ? vscode.Uri.file(repo) : undefined;
		this.config = vscode.workspace.getConfiguration('easy-graph', this.resource);
	}

	/**
	 * Get the Commit Details View configuration from the Extension Settings.
	 */
	get commitDetailsView(): CommitDetailsViewConfig {
		const hiddenFields = this.config.get<unknown>('commitDetailsView.hiddenFields', []);
		return {
			autoCenter: !!this.config.get('commitDetailsView.autoCenter', true),
			autoScroll: !!this.config.get<boolean>('commitDetailsView.autoScroll', true),
			fileTreeCompactFolders: !!this.config.get('commitDetailsView.fileView.fileTree.compactFolders', true),
			fileViewType: this.config.get<string>('commitDetailsView.fileView.type', 'File Tree') === 'File List'
				? FileViewType.List
				: FileViewType.Tree,
			hiddenFields: Array.isArray(hiddenFields) ? hiddenFields.filter((field): field is string => typeof field === 'string') : [],
			location: this.config.get<string>('commitDetailsView.location', 'Inline') === 'Docked to Bottom'
				? CommitDetailsViewLocation.DockedToBottom
				: CommitDetailsViewLocation.Inline
		};
	}

	/**
	 * Get the value of the `easy-graph.builtin` Extension Setting. The keys the user sets are merged over the default value of the
	 * setting (VS Code replaces an object setting as a whole), and keys that are unset, NULL or invalid follow the Git config.
	 */
	get builtin(): BuiltinGitConfig {
		const defaults = this.config.inspect<{ [key: string]: unknown }>('builtin')?.defaultValue;
		const configured = this.config.get<{ [key: string]: unknown }>('builtin', {});
		const values: { [key: string]: unknown } = Object.assign({}, typeof defaults === 'object' && defaults !== null ? defaults : {}, typeof configured === 'object' && configured !== null ? configured : {});
		const bool = (key: string) => typeof values[key] === 'boolean' ? <boolean>values[key] : null;
		const ff = (key: string) => typeof values[key] === 'boolean' || values[key] === 'only' ? <boolean | 'only'>values[key] : null;
		const abbrev = values['core.abbrev'];
		const untracked = values['status.showUntrackedFiles'];
		return {
			'commit.gpgSign': bool('commit.gpgSign'),
			'core.abbrev': typeof abbrev === 'number' && isFinite(abbrev) ? Math.min(40, Math.max(4, Math.round(abbrev))) : null,
			'fetch.prune': bool('fetch.prune'),
			'fetch.pruneTags': bool('fetch.pruneTags'),
			'fetch.tags': bool('fetch.tags'),
			'log.mailmap': bool('log.mailmap'),
			'merge.ff': ff('merge.ff'),
			'pull.ff': ff('pull.ff'),
			'push.autoSetupRemote': bool('push.autoSetupRemote'),
			'status.showUntrackedFiles': untracked === 'no' || untracked === 'normal' || untracked === 'all' ? untracked : null,
			'tag.gpgSign': bool('tag.gpgSign')
		};
	}

	/**
	 * Get the value of the `easy-graph.contextMenuActionsVisibility` Extension Setting.
	 */
	get contextMenuActionsVisibility(): ContextMenuActionsVisibility {
		const userConfig = this.config.get('contextMenuActionsVisibility', {});
		const config: ContextMenuActionsVisibility = {
			branch: { checkout: true, rename: true, delete: true, deleteMultiple: true, merge: true, rebase: true, push: true, pull: true, createBranch: true, viewIssue: true, createPullRequest: true, createArchive: true, selectInBranchesDropdown: true, unselectInBranchesDropdown: true, hide: true, copyName: true },
			commit: { addTag: true, createBranch: true, checkout: true, compareWithWorkingTree: true, cherrypick: true, revert: true, drop: true, squash: true, merge: true, rebase: true, rebaseOnto: true, reset: true, undo: true, editMessage: true, createFixup: true, pushToCommit: true, savePatch: true, applyPatch: true, viewPatch: true, viewAllChanges: true, browseFiles: true, editNotes: true, viewChangesFromParent: true, selectMergeBase: true, copyHash: true, copySubject: true, copySubjectsBetween: true, copyPatch: true },
			commitDetailsViewFile: { viewDiff: true, viewAllChanges: true, viewFileAtThisRevision: true, viewDiffWithWorkingFile: true, openFile: true, openInExternalDiffTool: true, markAsReviewed: true, markAsNotReviewed: true, resetFileToThisRevision: true, copyAbsoluteFilePath: true, copyRelativeFilePath: true, copyAllRelativeFilePaths: true },
			remoteBranch: { checkout: true, delete: true, fetch: true, merge: true, pull: true, createBranch: true, viewIssue: true, createPullRequest: true, createArchive: true, selectInBranchesDropdown: true, unselectInBranchesDropdown: true, hide: true, hideRemote: true, copyName: true },
			stash: { apply: true, createBranch: true, pop: true, drop: true, copyName: true, copyHash: true, viewAllChanges: true },
			tag: { viewDetails: true, checkout: true, delete: true, push: true, createArchive: true, copyName: true },
			uncommittedChanges: { stash: true, applyPatch: true, reset: true, clean: true, viewAllChanges: true, openSourceControlView: true }
		};
		mergeConfigObjects(config, userConfig);
		return config;
	}

	/**
	 * Get the value of the `easy-graph.customBranchGlobPatterns` Extension Setting.
	 */
	get customBranchGlobPatterns(): CustomBranchGlobPattern[] {
		let inPatterns = this.config.get('customBranchGlobPatterns', <any[]>[]);
		let outPatterns: CustomBranchGlobPattern[] = [];
		for (let i = 0; i < inPatterns.length; i++) {
			if (typeof inPatterns[i].name === 'string' && typeof inPatterns[i].glob === 'string') {
				outPatterns.push({ name: inPatterns[i].name, glob: '--glob=' + inPatterns[i].glob });
			}
		}
		return outPatterns;
	}

	/**
	 * Get the value of the `easy-graph.customEmojiShortcodeMappings` Extension Setting.
	 */
	get customEmojiShortcodeMappings(): CustomEmojiShortcodeMapping[] {
		let inMappings = this.config.get('customEmojiShortcodeMappings', <any[]>[]);
		let outMappings: CustomEmojiShortcodeMapping[] = [];
		for (let i = 0; i < inMappings.length; i++) {
			if (typeof inMappings[i].shortcode === 'string' && typeof inMappings[i].emoji === 'string') {
				outMappings.push({ shortcode: inMappings[i].shortcode, emoji: inMappings[i].emoji });
			}
		}
		return outMappings;
	}

	/**
	 * Get the value of the `easy-graph.customPullRequestProviders` Extension Setting.
	 */
	get customPullRequestProviders(): CustomPullRequestProvider[] {
		let providers = this.config.get('customPullRequestProviders', <any[]>[]);
		return Array.isArray(providers)
			? providers
				.filter((provider) => typeof provider.name === 'string' && typeof provider.templateUrl === 'string')
				.map((provider) => ({ name: provider.name, templateUrl: provider.templateUrl }))
			: [];
	}

	/**
	 * Get the value of the `easy-graph.date.format` Extension Setting.
	 */
	get dateFormat(): DateFormat {
		let configValue = this.config.get<string>('date.format', 'Date & Time'), type = DateFormatType.DateAndTime, iso = false;
		if (configValue === 'Relative') {
			type = DateFormatType.Relative;
		} else if (configValue === 'Custom') {
			type = DateFormatType.Custom;
		} else {
			if (configValue.endsWith('Date Only')) type = DateFormatType.DateOnly;
			if (configValue.startsWith('ISO')) iso = true;
		}
		return { type: type, iso: iso };
	}

	/**
	 * Get the value of the `easy-graph.date.customFormat` Extension Setting.
	 */
	get customDateFormat() {
		const format = this.config.get<string>('date.customFormat', 'YYYY-MM-DD HH:mm');
		return typeof format === 'string' && format.trim() !== '' ? format : 'YYYY-MM-DD HH:mm';
	}

	/**
	 * Get the value of the `easy-graph.date.type` Extension Setting.
	 */
	get dateType() {
		return this.config.get<string>('date.type', 'Author Date') === 'Commit Date'
			? DateType.Commit
			: DateType.Author;
	}

	/**
	 * Get the value of the `easy-graph.defaultColumnVisibility` Extension Setting.
	 */
	get defaultColumnVisibility(): DefaultColumnVisibility {
		let obj: any = this.config.get('defaultColumnVisibility', {});
		if (typeof obj === 'object' && obj !== null && typeof obj['Date'] === 'boolean' && typeof obj['Author'] === 'boolean' && typeof obj['Commit'] === 'boolean') {
			return { author: obj['Author'], commit: obj['Commit'], date: obj['Date'] };
		} else {
			return { author: true, commit: true, date: true };
		}
	}

	/**
	 * Get the value of the `easy-graph.toolbarButtonVisibility` Extension Setting.
	 */
	get toolbarButtonVisibility(): ToolbarButtonVisibility {
		const obj: any = this.config.get('toolbarButtonVisibility', {});
		const isHidden = (key: string) => typeof obj === 'object' && obj !== null && obj[key] === false;
		// The Display & Scope dropdowns replaced the Simplify & Remotes checkboxes, hiding either the new or the legacy key hides the dropdown
		return {
			display: !isHidden('Display') && !isHidden('Simplify'),
			scope: !isHidden('Scope') && !isHidden('Remotes'),
			pathFilter: !isHidden('Paths')
		};
	}

	/**
	 * Get the value of the `easy-graph.dialog.*` Extension Settings.
	 */
	get dialogDefaults(): DialogDefaults {
		let resetCommitMode = this.config.get<string>('dialog.resetCurrentBranchToCommit.mode', 'Mixed');
		let resetUncommittedMode = this.config.get<string>('dialog.resetUncommittedChanges.mode', 'Mixed');
		let refInputSpaceSubstitution = this.config.get<string>('dialog.general.referenceInputSpaceSubstitution', 'None');
		const pushBranchMode = this.config.get<string>('dialog.pushBranch.mode', 'Normal');

		return {
			addTag: {
				pushToRemote: !!this.config.get('dialog.addTag.pushToRemote', false),
				type: this.config.get<string>('dialog.addTag.type', 'Annotated') === 'Lightweight' ? TagType.Lightweight : TagType.Annotated
			},
			applyStash: {
				reinstateIndex: !!this.config.get('dialog.applyStash.reinstateIndex', false)
			},
			cherryPick: {
				noCommit: !!this.config.get('dialog.cherryPick.noCommit', false),
				recordOrigin: !!this.config.get('dialog.cherryPick.recordOrigin', false)
			},
			createBranch: {
				checkout: !!this.config.get('dialog.createBranch.checkOut', false)
			},
			deleteBranch: {
				forceDelete: !!this.config.get('dialog.deleteBranch.forceDelete', false),
				deleteOnRemote: !!this.config.get('dialog.deleteBranch.deleteOnRemote', false)
			},
			fetchIntoLocalBranch: {
				forceFetch: !!this.config.get('dialog.fetchIntoLocalBranch.forceFetch', false)
			},
			general: {
				referenceInputSpaceSubstitution: refInputSpaceSubstitution === 'Hyphen' ? '-' : refInputSpaceSubstitution === 'Underscore' ? '_' : null
			},
			merge: {
				noCommit: !!this.config.get('dialog.merge.noCommit', false),
				allowUnrelatedHistories: !!this.config.get('dialog.merge.allowUnrelatedHistories', false),
				squash: !!this.config.get('dialog.merge.squashCommits', false)
			},
			popStash: {
				reinstateIndex: !!this.config.get('dialog.popStash.reinstateIndex', false)
			},
			pullBranch: {
				squash: !!this.config.get('dialog.pullBranch.squashCommits', false)
			},
			pushBranch: {
				mode: pushBranchMode === 'Force With Lease'
					? GitPushBranchMode.ForceWithLease
					: pushBranchMode === 'Force'
						? GitPushBranchMode.Force
						: GitPushBranchMode.Normal
			},
			rebase: {
				ignoreDate: !!this.config.get('dialog.rebase.ignoreDate', true),
				interactive: !!this.config.get('dialog.rebase.launchInteractiveRebase', false)
			},
			resetCommit: {
				mode: resetCommitMode === 'Soft' ? GitResetMode.Soft : (resetCommitMode === 'Hard' ? GitResetMode.Hard : GitResetMode.Mixed)
			},
			resetUncommitted: {
				mode: resetUncommittedMode === 'Hard' ? GitResetMode.Hard : GitResetMode.Mixed
			},
			stashUncommittedChanges: {
				includeUntracked: !!this.config.get('dialog.stashUncommittedChanges.includeUntracked', true)
			}
		};
	}

	/**
	 * Get the value of the `easy-graph.dialog.merge.squashMessageFormat` Extension Setting.
	 */
	get squashMergeMessageFormat() {
		return parseSquashMessageFormat(this.config.get<string>('dialog.merge.squashMessageFormat', 'Default'));
	}

	/**
	 * Get the value of the `easy-graph.dialog.pullBranch.squashMessageFormat` Extension Setting.
	 */
	get squashPullMessageFormat() {
		return parseSquashMessageFormat(this.config.get<string>('dialog.pullBranch.squashMessageFormat', 'Default'));
	}

	/**
	 * Get the value of the `easy-graph.excludeBranchGlobPatterns` Extension Setting.
	 */
	get excludeBranchGlobPatterns(): string[] {
		const patterns = this.config.get('excludeBranchGlobPatterns', <any[]>[]);
		return Array.isArray(patterns)
			? patterns.filter((pattern) => typeof pattern === 'string' && pattern !== '')
			: [];
	}

	/**
	 * Get the value of the `easy-graph.findWidget.searchColumns` Extension Setting.
	 */
	get findWidgetSearchColumns(): FindSearchColumn[] {
		const allColumns: FindSearchColumn[] = ['Description', 'Date', 'Author', 'Commit'];
		const columns = this.config.get('findWidget.searchColumns', <any[]>allColumns);
		return Array.isArray(columns)
			? allColumns.filter((column) => columns.includes(column))
			: allColumns;
	}

	/**
	 * Get the value of the `easy-graph.externalDiffToolArgs` Extension Setting.
	 */
	get externalDiffToolArgs(): string[] {
		const args = this.config.get('externalDiffToolArgs', <any[]>[]);
		return Array.isArray(args)
			? args.filter((arg) => typeof arg === 'string' && arg !== '')
			: [];
	}

	/**
	 * Get the value of the `easy-graph.logGitCommandOutput` Extension Setting.
	 */
	get logGitCommandOutput() {
		return !!this.config.get('logGitCommandOutput', false);
	}

	/**
	 * Get the value of the `easy-graph.enhancedAccessibility` Extension Setting.
	 */
	get enhancedAccessibility() {
		return !!this.config.get('enhancedAccessibility', false);
	}

	/**
	 * Get the value of the `easy-graph.fileEncoding` Extension Setting.
	 */
	get fileEncoding() {
		const value = this.config.get<string>('fileEncoding', 'utf8');
		const values = this.config.inspect<string>('fileEncoding');
		if (typeof values !== 'undefined' && (typeof values.globalValue !== 'undefined' || typeof values.workspaceValue !== 'undefined' || typeof values.workspaceFolderValue !== 'undefined')) {
			return value;
		}
		// Not configured for Easy Graph: follow Visual Studio Code's `files.encoding`
		const encoding = vscode.workspace.getConfiguration('files', this.resource).get<string>('encoding', value);
		return typeof encoding === 'string' && encoding !== ''
			? encoding === 'utf8bom' ? 'utf8' : encoding
			: value;
	}

	/**
	 * Get the value of the `easy-graph.findMatchHighlightColour` Extension Setting.
	 */
	get findMatchHighlightColour() {
		return getColourSetting(this.config.get<string>('findMatchHighlightColour', ''));
	}

	/**
	 * Get the value of the `easy-graph.flashColour` Extension Setting, normalised to `rgba(r,g,b,a)` so that
	 * the webview can derive the faded colours of the flash animation from it.
	 * @returns The colour, or `""` (use the find match highlight colour) if the setting isn't a valid HEX or RGB colour.
	 */
	get flashColour() {
		const rgba = parseHexOrRgbColour(this.config.get<string>('flashColour', ''));
		return rgba !== null ? 'rgba(' + rgba.join(',') + ')' : '';
	}

	/**
	 * Get the value of the `easy-graph.fontFamily` Extension Setting.
	 */
	get fontFamily() {
		const value = this.config.get<string>('fontFamily', '');
		return typeof value === 'string' ? value.replace(/[<>{};\\]/g, '').trim() : '';
	}

	/**
	 * Get the graph configuration from the Extension Settings.
	 */
	get graph(): GraphConfig {
		const colours = this.config.get<string[]>('graph.colours', []);
		return {
			colours: Array.isArray(colours) && colours.length > 0
				? colours.filter((v) => v.match(/^\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|rgb[a]?\s*\(\d{1,3},\s*\d{1,3},\s*\d{1,3}\))\s*$/) !== null)
				: ['#0085d9', '#d9008f', '#00d90a', '#d98500', '#a300d9', '#ff0000', '#00d9cc', '#e138e8', '#85d900', '#dc5b23', '#6f24d6', '#ffcc00'],
			style: this.config.get<string>('graph.style', 'rounded') === 'angular'
				? GraphStyle.Angular
				: GraphStyle.Rounded,
			grid: { x: 16, y: 24, offsetX: 16, offsetY: 12, expandY: 250 },
			uncommittedChanges: this.config.get<string>('graph.uncommittedChanges', 'Open Circle at the Uncommitted Changes') === 'Open Circle at the Checked Out Commit'
				? GraphUncommittedChangesStyle.OpenCircleAtTheCheckedOutCommit
				: GraphUncommittedChangesStyle.OpenCircleAtTheUncommittedChanges
		};
	}

	/**
	 * Get the value of the `easy-graph.integratedTerminalShell` Extension Setting.
	 */
	get integratedTerminalShell() {
		return this.config.get('integratedTerminalShell', '');
	}

	/**
	 * Get the keybinding configuration from the `easy-graph.keyboardShortcut.modifier` Extension Setting.
	 */
	get keybindings(): KeybindingConfig {
		const modifier = this.config.get<string>('keyboardShortcut.modifier', 'CTRL/CMD');
		return {
			modifier: modifier === 'CTRL' ? KeybindingModifier.Ctrl : modifier === 'CMD' ? KeybindingModifier.Cmd : KeybindingModifier.CtrlOrCmd
		};
	}

	/**
	 * Get the value of the `easy-graph.maxDepthOfRepoSearch` Extension Setting.
	 */
	get maxDepthOfRepoSearch() {
		return this.config.get('maxDepthOfRepoSearch', 0);
	}

	/**
	 * Get the value of the `easy-graph.markdown` Extension Setting.
	 */
	get markdown() {
		return !!this.config.get('markdown', true);
	}

	/**
	 * Get the value of the `easy-graph.openNewTabEditorGroup` Extension Setting.
	 */
	get openNewTabEditorGroup(): vscode.ViewColumn {
		const location = this.config.get<string>('openNewTabEditorGroup', 'Active');
		const column = typeof location === 'string' && typeof VIEW_COLUMN_MAPPING[location] !== 'undefined'
			? VIEW_COLUMN_MAPPING[location]
			: vscode.ViewColumn.Active;
		// "Beside" is resolved relative to the Easy Graph View (when it's open in the editor), instead of the active editor
		return column === vscode.ViewColumn.Beside && typeof graphViewColumn === 'number' && graphViewColumn > 0 && graphViewColumn < vscode.ViewColumn.Nine
			? graphViewColumn + 1
			: column;
	}

	/**
	 * Get the value of the `easy-graph.openToTheRepoOfTheActiveTextEditorDocument` Extension Setting.
	 */
	get openToTheRepoOfTheActiveTextEditorDocument() {
		return !!this.config.get('openToTheRepoOfTheActiveTextEditorDocument', false);
	}

	/**
	 * Get the reference label configuration from the Extension Settings.
	 */
	get referenceLabels(): ReferenceLabelsConfig {
		const alignmentConfigValue = this.config.get<string>('referenceLabels.alignment', 'Normal');
		const alignment = alignmentConfigValue === 'Branches (on the left) & Tags (on the right)'
			? RefLabelAlignment.BranchesOnLeftAndTagsOnRight
			: alignmentConfigValue === 'Branches (aligned to the graph) & Tags (on the right)'
				? RefLabelAlignment.BranchesAlignedToGraphAndTagsOnRight
				: RefLabelAlignment.Normal;
		return {
			branchLabelsAlignedToGraph: alignment === RefLabelAlignment.BranchesAlignedToGraphAndTagsOnRight,
			combineLocalAndRemoteBranchLabels: !!this.config.get('referenceLabels.combineLocalAndRemoteBranchLabels', true),
			tagLabelsOnRight: alignment !== RefLabelAlignment.Normal
		};
	}

	/**
	 * Get the value of the `easy-graph.repository.commits.fetchAvatars` Extension Setting.
	 */
	get fetchAvatars() {
		return !!this.config.get('repository.commits.fetchAvatars', false);
	}

	/**
	 * Get the value of the `easy-graph.repository.commits.initialLoad` Extension Setting.
	 */
	get initialLoadCommits() {
		return this.config.get('repository.commits.initialLoad', 300);
	}


	/**
	 * Get the value of the `easy-graph.repository.backupBeforeDangerousActions` Extension Setting.
	 */
	get backupBeforeDangerousActions() {
		return !!this.config.get('repository.backupBeforeDangerousActions', false);
	}

	/**
	 * Get the value of the `easy-graph.repository.commits.loadMore` Extension Setting.
	 */
	get loadMoreCommits() {
		return this.config.get('repository.commits.loadMore', 100);
	}

	/**
	 * Get the value of the `easy-graph.repository.commits.loadMoreAutomatically` Extension Setting.
	 */
	get loadMoreCommitsAutomatically() {
		return !!this.config.get('repository.commits.loadMoreAutomatically', true);
	}

	/**
	 * Get the mute commits configuration from the Extension Settings.
	 */
	get muteCommits(): MuteCommitsConfig {
		return {
			commitsNotAncestorsOfHead: !!this.config.get('repository.commits.mute.commitsThatAreNotAncestorsOfHead', false),
			mergeCommits: !!this.config.get('repository.commits.mute.mergeCommits', true)
		};
	}

	/**
	 * Get the value of the `easy-graph.repository.commits.order` Extension Setting.
	 */
	get commitOrder() {
		const ordering = this.config.get<string>('repository.commits.order', 'date');
		return ordering === 'author-date'
			? CommitOrdering.AuthorDate
			: ordering === 'topo'
				? CommitOrdering.Topological
				: CommitOrdering.Date;
	}

	/**
	 * Get the value of the `easy-graph.repository.commits.showSignatureStatus` Extension Setting.
	 */
	get showSignatureStatus() {
		return !!this.config.get('repository.commits.showSignatureStatus', false);
	}

	/**
	 * Get the value of the `easy-graph.repository.fetchOnLoad` Extension Setting.
	 */
	get fetchOnLoad() {
		return !!this.config.get('repository.fetchOnLoad', false);
	}

	/**
	 * Get the value of the `easy-graph.repository.includeCommitsMentionedByReflogs` Extension Setting, which selects Reflog in the initial
	 * Scope of repositories.
	 */
	get includeCommitsMentionedByReflogs() {
		return !!this.config.get('repository.includeCommitsMentionedByReflogs', false);
	}

	/**
	 * Get the On Repo Load configuration from the Extension Settings.
	 */
	get onRepoLoad(): OnRepoLoadConfig {
		const branches = this.config.get('repository.onLoad.showSpecificBranches', []);
		return {
			scrollToHead: !!this.config.get('repository.onLoad.scrollToHead', false),
			showCheckedOutBranch: !!this.config.get('repository.onLoad.showCheckedOutBranch', false),
			showSpecificBranches: Array.isArray(branches)
				? branches.filter((branch) => typeof branch === 'string')
				: []
		};
	}

	/**
	 * Get the value of the `easy-graph.repository.onlyFollowFirstParent` Extension Setting, the default state of First Parent in the
	 * Display dropdown.
	 */
	get onlyFollowFirstParent() {
		return !!this.config.get('repository.onlyFollowFirstParent', false);
	}

	/**
	 * Get the value of the `easy-graph.repository.singleAuthorSelect` Extension Setting. When enabled, clicking an author in the
	 * Authors dropdown selects only that author, and Ctrl / Cmd + click adds or removes an author.
	 */
	get singleAuthorSelect() {
		return !!this.config.get('repository.singleAuthorSelect', true);
	}

	/**
	 * Get the value of the `easy-graph.repository.singleBranchSelect` Extension Setting. When enabled, clicking a branch in the
	 * Branches dropdown selects only that branch, and Ctrl / Cmd + click adds or removes a branch.
	 */
	get singleBranchSelect() {
		return !!this.config.get('repository.singleBranchSelect', true);
	}

	/**
	 * Get the value of the `easy-graph.graph.showBranchColourOnRows` Extension Setting.
	 */
	get showBranchColourOnRows() {
		return !!this.config.get('graph.showBranchColourOnRows', false);
	}

	/**
	 * Get the value of the `easy-graph.repository.showCommitsOnlyReferencedByTags` Extension Setting.
	 */
	get showCommitsOnlyReferencedByTags() {
		return !!this.config.get('repository.showCommitsOnlyReferencedByTags', true);
	}

	/**
	 * Get the value of the `easy-graph.repository.showRemoteBranches` Extension Setting, which selects Remote in the initial Scope of
	 * repositories.
	 */
	get showRemoteBranches() {
		return !!this.config.get('repository.showRemoteBranches', true);
	}

	/**
	 * Get the value of the `easy-graph.repository.simplifyByDecoration` Extension Setting, the default state of Simplify in the Display
	 * dropdown, which only shows the commits referenced by branches or tags.
	 */
	get simplifyByDecoration() {
		return !!this.config.get('repository.simplifyByDecoration', false);
	}

	/**
	 * Get the value of the `easy-graph.repository.onlyShowRemoteBranchesWithLocalBranches` Extension Setting.
	 */
	get onlyShowRemoteBranchesWithLocalBranches() {
		return !!this.config.get('repository.onlyShowRemoteBranchesWithLocalBranches', false);
	}

	/**
	 * Get the value of the `easy-graph.repository.showRemoteHeads` Extension Setting.
	 */
	get showRemoteHeads() {
		return !!this.config.get('repository.showRemoteHeads', true);
	}

	/**
	 * Get the value of the `easy-graph.repository.showStashes` Extension Setting.
	 */
	get showStashes() {
		return !!this.config.get('repository.showStashes', true);
	}

	/**
	 * Get the value of the `easy-graph.repository.showTags` Extension Setting.
	 */
	get showTags() {
		return !!this.config.get('repository.showTags', true);
	}

	/**
	 * Get the value of the `easy-graph.repository.showUncommittedChanges` Extension Setting.
	 */
	get showUncommittedChanges() {
		return !!this.config.get('repository.showUncommittedChanges', true);
	}

	/**
	 * Get the value of the `easy-graph.repositoryDropdownOrder` Extension Setting.
	 */
	get repoDropdownOrder(): RepoDropdownOrder {
		const order = this.config.get<string>('repositoryDropdownOrder', 'Workspace Full Path');
		return order === 'Full Path'
			? RepoDropdownOrder.FullPath
			: order === 'Name'
				? RepoDropdownOrder.Name
				: RepoDropdownOrder.WorkspaceFullPath;
	}

	/**
	 * Get the value of the `easy-graph.repositories` Extension Setting.
	 */
	get repositories(): string[] {
		const repos = this.config.get('repositories', <any[]>[]);
		return Array.isArray(repos)
			? repos.filter((repo) => typeof repo === 'string' && repo.trim() !== '')
			: [];
	}

	/**
	 * Get the glob patterns of the folders to skip when searching for repositories, combining `easy-graph.repoSearchExclude` with the enabled patterns of Visual Studio Code's `files.exclude`.
	 */
	get repoSearchExclude(): string[] {
		const patterns = this.config.get('repoSearchExclude', <any[]>['**/node_modules']);
		const result = Array.isArray(patterns)
			? patterns.filter((pattern) => typeof pattern === 'string' && pattern !== '')
			: [];
		const filesExclude = vscode.workspace.getConfiguration('files').get<{ [pattern: string]: any }>('exclude', {});
		if (typeof filesExclude === 'object' && filesExclude !== null) {
			Object.keys(filesExclude).forEach((pattern) => {
				if (filesExclude[pattern] === true && !result.includes(pattern)) result.push(pattern);
			});
		}
		return result;
	}

	/**
	 * Get the value of the `easy-graph.retainContextWhenHidden` Extension Setting.
	 */
	get retainContextWhenHidden() {
		return !!this.config.get('retainContextWhenHidden', true);
	}

	/**
	 * Get the value of the `easy-graph.disableRefreshWhenShown` Extension Setting.
	 */
	get disableRefreshWhenShown() {
		return !!this.config.get('disableRefreshWhenShown', false);
	}

	/**
	 * Get the value of the `easy-graph.showStatusBarItem` Extension Setting.
	 */
	get showStatusBarItem() {
		return !!this.config.get('showStatusBarItem', true);
	}

	/**
	 * Get the value of the `easy-graph.stickyHeader` Extension Setting.
	 */
	get stickyHeader() {
		return !!this.config.get('stickyHeader', true);
	}

	/**
	 * Get the value of the `easy-graph.toggleViewOnCommand` Extension Setting.
	 */
	get toggleViewOnCommand() {
		return !!this.config.get('toggleViewOnCommand', false);
	}

	/**
	 * Get the value of the `easy-graph.viewLocation` Extension Setting.
	 */
	get viewLocation(): 'editor' | 'panel' | 'both' {
		switch (this.config.get<string>('viewLocation', 'editor')) {
			case 'panel':
				return 'panel';
			case 'both':
				return 'both';
			default:
				// Unknown values fall back to the default, the editor
				return 'editor';
		}
	}

	/**
	 * Get the branch name prefix configured by the `git.branchPrefix` Visual Studio Code Setting.
	 */
	get branchPrefix() {
		const prefix = vscode.workspace.getConfiguration('git').get<string>('branchPrefix', '');
		return typeof prefix === 'string' ? prefix : '';
	}

	/**
	 * Get the Git executable paths configured by the `git.path` Visual Studio Code Setting.
	 */
	get gitPaths() {
		const configValue = vscode.workspace.getConfiguration('git').get<string | string[] | null>('path', null);
		if (configValue === null) {
			return [];
		} else if (typeof configValue === 'string') {
			return [configValue];
		} else if (Array.isArray(configValue)) {
			return configValue.filter((value) => typeof value === 'string');
		} else {
			return [];
		}
	}
}

/**
 * Get a Config instance for retrieving the users configuration of Git Graph Extension Settings.
 * @param repo An optional path of a repository (to be used for Workspace Folder Scoped Configuration Values).
 * @returns A Config instance.
 */
export function getConfig(repo?: string) {
	return new Config(repo);
}

/**
 * Get the Scope of a repository from its legacy Remotes & Reflog overrides (which the Scope dropdown replaced), so that they keep
 * applying. The overrides that are default fall back to the `repository.showRemoteBranches` and
 * `repository.includeCommitsMentionedByReflogs` Extension Settings, like they did.
 * @param showRemoteBranches The override of `repository.showRemoteBranches`.
 * @param includeCommitsMentionedByReflogs The override of `repository.includeCommitsMentionedByReflogs`.
 * @returns The Scope, or NULL if neither is overridden (i.e. the initial Scope from the Extension Settings applies).
 */
export function getRepoScopeFromLegacyOverrides(showRemoteBranches: BooleanOverride, includeCommitsMentionedByReflogs: BooleanOverride): RepoScope[] | null {
	if (showRemoteBranches === BooleanOverride.Default && includeCommitsMentionedByReflogs === BooleanOverride.Default) return null;
	const config = getConfig();
	const scope: RepoScope[] = ['local'];
	if (showRemoteBranches === BooleanOverride.Default ? config.showRemoteBranches : showRemoteBranches === BooleanOverride.Enabled) scope.push('remote');
	if (includeCommitsMentionedByReflogs === BooleanOverride.Default ? config.includeCommitsMentionedByReflogs : includeCommitsMentionedByReflogs === BooleanOverride.Enabled) scope.push('reflog');
	return scope;
}

/**
 * Parse the value of a `squashMessageFormat` Extension Setting.
 * @param value The value of the setting.
 * @returns The SquashMessageFormat.
 */
function parseSquashMessageFormat(value: string) {
	return value === 'Git SQUASH_MSG'
		? SquashMessageFormat.GitSquashMsg
		: value === 'Branch Name & Commit Subjects'
			? SquashMessageFormat.BranchAndCommitSubjects
			: SquashMessageFormat.Default;
}

/**
 * Recursively apply the values in a user specified object to an object containing default values.
 * @param base An object containing the default values.
 * @param user An object specified by the user.
 */
function mergeConfigObjects(base: { [key: string]: any }, user: { [key: string]: any }) {
	if (typeof base !== typeof user) return;

	let keys = Object.keys(base);
	for (let i = 0; i < keys.length; i++) {
		if (typeof base[keys[i]] === 'object') {
			if (typeof user[keys[i]] === 'object') {
				mergeConfigObjects(base[keys[i]], user[keys[i]]);
			}
		} else if (typeof user[keys[i]] === typeof base[keys[i]]) {
			base[keys[i]] = user[keys[i]];
		}
	}
}

/**
 * Validate a colour Extension Setting (#RGB, #RGBA, #RRGGBB, #RRGGBBAA, rgb(...) or rgba(...)).
 * @param value The value of the Extension Setting.
 * @returns The trimmed colour if it is valid, otherwise an empty string.
 */
function getColourSetting(value: unknown) {
	if (typeof value !== 'string') return '';
	const colour = value.trim();
	return /^(#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+\s*)?\))$/.test(colour) ? colour : '';
}

/**
 * Parse a colour written as `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb(r, g, b)` or `rgba(r, g, b, a)` (the alpha is optional in both functions).
 * @param value The colour.
 * @returns The red, green and blue channels (0 - 255) and the alpha (0 - 1), or NULL if the value isn't such a colour.
 */
function parseHexOrRgbColour(value: unknown): [number, number, number, number] | null {
	if (typeof value !== 'string') return null;
	const text = value.trim();

	const hex = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(text);
	if (hex !== null) {
		const digits = hex[1].length <= 4 ? hex[1].replace(/./g, '$&$&') : hex[1];
		const channels = (digits.match(/../g) || []).map((pair) => parseInt(pair, 16));
		return [channels[0], channels[1], channels[2], channels.length === 4 ? Math.round(channels[3] / 255 * 100) / 100 : 1];
	}

	const fn = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(\d*\.?\d+)\s*)?\)$/i.exec(text);
	if (fn !== null) {
		const channels = [fn[1], fn[2], fn[3]].map((channel) => parseInt(channel, 10));
		if (channels.some((channel) => channel > 255)) return null;
		const alpha = typeof fn[4] === 'string' ? Math.min(parseFloat(fn[4]), 1) : 1;
		return [channels[0], channels[1], channels[2], alpha];
	}
	return null;
}
