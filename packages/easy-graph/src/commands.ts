import * as os from 'os';
import * as vscode from 'vscode';
import { AvatarManager } from './avatarManager';
import { BaseGitGraphView } from './baseGitGraphView';
import { getConfig } from './config';
import { BACKUP_REF_PREFIX, DataSource } from './dataSource';
import { DiffDocProvider, decodeDiffDocUri } from './diffDocProvider';
import { CodeReviewData, CodeReviews, ExtensionState } from './extensionState';
import { GitGraphView } from './gitGraphView';
import { GitGraphPanelView } from './gitGraphPanelView';
import { Logger } from './logger';
import { RepoManager } from './repoManager';
import { ErrorInfo, LoadGitGraphViewTo } from './types';
import { GitExecutable, UNCOMMITTED, VsCodeVersionRequirement, abbrevCommit, abbrevText, copyToClipboard, doesVersionMeetRequirement, getExtensionVersion, getPathFromStr, getPathFromUri, getRelativeTimeDiff, getRepoName, getSortedRepositoryPaths, isPathInWorkspace, openFile, resolveToSymbolicPath, showErrorMessage, showInformationMessage, showUnableToFindGitMessage } from './utils';
import { Disposable } from './utils/disposable';
import { Event } from './utils/event';

/**
 * Manages the registration and execution of Git Graph Commands.
 */
export class CommandManager extends Disposable {
	private readonly context: vscode.ExtensionContext;
	private readonly avatarManager: AvatarManager;
	private readonly dataSource: DataSource;
	private readonly extensionState: ExtensionState;
	private readonly logger: Logger;
	private readonly repoManager: RepoManager;
	private gitExecutable: GitExecutable | null;

	/**
	 * Creates the Git Graph Command Manager.
	 * @param extensionPath The absolute file path of the directory containing the extension.
	 * @param avatarManger The Git Graph AvatarManager instance.
	 * @param dataSource The Git Graph DataSource instance.
	 * @param extensionState The Git Graph ExtensionState instance.
	 * @param repoManager The Git Graph RepoManager instance.
	 * @param gitExecutable The Git executable available to Git Graph at startup.
	 * @param onDidChangeGitExecutable The Event emitting the Git executable for Git Graph to use.
	 * @param logger The Git Graph Logger instance.
	 */
	constructor(context: vscode.ExtensionContext, avatarManger: AvatarManager, dataSource: DataSource, extensionState: ExtensionState, repoManager: RepoManager, gitExecutable: GitExecutable | null, onDidChangeGitExecutable: Event<GitExecutable>, logger: Logger) {
		super();
		this.context = context;
		this.avatarManager = avatarManger;
		this.dataSource = dataSource;
		this.extensionState = extensionState;
		this.logger = logger;
		this.repoManager = repoManager;
		this.gitExecutable = gitExecutable;

		// Register Extension Commands
		this.registerCommand('easy-graph.view', (arg) => this.view(arg));
		this.registerCommand('easy-graph.viewInEditor', (arg) => this.viewInEditor(arg));
		this.registerCommand('easy-graph.viewInPanel', (arg) => this.viewInPanel(arg));
		this.registerCommand('easy-graph.addGitRepository', () => this.addGitRepository());
		this.registerCommand('easy-graph.removeGitRepository', () => this.removeGitRepository());
		this.registerCommand('easy-graph.switchRepository', () => this.switchRepository());
		this.registerCommand('easy-graph.clearAvatarCache', () => this.clearAvatarCache());
		this.registerCommand('easy-graph.fetch', () => this.fetch());
		this.registerCommand('easy-graph.goToRef', () => this.goToRef());
		this.registerCommand('easy-graph.refresh', () => BaseGitGraphView.refreshAll());
		this.registerCommand('easy-graph.endAllWorkspaceCodeReviews', () => this.endAllWorkspaceCodeReviews());
		this.registerCommand('easy-graph.endSpecificWorkspaceCodeReview', () => this.endSpecificWorkspaceCodeReview());
		this.registerCommand('easy-graph.resumeWorkspaceCodeReview', () => this.resumeWorkspaceCodeReview());
		this.registerCommand('easy-graph.version', () => this.version());
		this.registerCommand('easy-graph.openFile', (arg) => this.openFile(arg));
		this.registerCommand('easy-graph.openWithPathFilter', (arg) => this.openWithPathFilter(arg));
		this.registerCommand('easy-graph.goToCommit', (arg) => this.goToCommit(arg));
		this.registerCommand('easy-graph.showReflog', () => this.showReflog());
		this.registerCommand('easy-graph.manageBackups', () => this.manageBackups());
		this.registerCommand('easy-graph.resetRememberedDialogChoices', () => this.resetRememberedDialogChoices());

		this.registerDisposable(
			onDidChangeGitExecutable((gitExecutable) => {
				this.gitExecutable = gitExecutable;
			})
		);

		// Register Extension Contexts
		try {
			this.registerContext('easy-graph:codiconsSupported', doesVersionMeetRequirement(vscode.version, VsCodeVersionRequirement.Codicons));
		} catch {
			this.logger.logError('Unable to set Visual Studio Code Context "easy-graph:codiconsSupported"');
		}
	}

	/**
	 * Register a Git Graph command with Visual Studio Code.
	 * @param command A unique identifier for the command.
	 * @param callback A command handler function.
	 */
	private registerCommand(command: string, callback: (...args: any[]) => any) {
		this.registerDisposable(
			vscode.commands.registerCommand(command, (...args: any[]) => {
				this.logger.log('Command Invoked: ' + command);
				callback(...args);
			})
		);
	}

	/**
	 * Register a context with Visual Studio Code.
	 * @param key The Context Key.
	 * @param value The Context Value.
	 */
	private registerContext(key: string, value: any) {
		return vscode.commands.executeCommand('setContext', key, value).then(
			() => this.logger.log('Successfully set Visual Studio Code Context "' + key + '" to "' + JSON.stringify(value) + '"'),
			() => this.logger.logError('Failed to set Visual Studio Code Context "' + key + '" to "' + JSON.stringify(value) + '"')
		);
	}


	/* Commands */

	/**
	 * The method run when the `easy-graph.view` command is invoked.
	 * @param arg An optional argument passed to the command (when invoked from the Visual Studio Code Git Extension).
	 */
	private view(arg: any) {
		// `easy-graph.viewLocation` only decides where this command opens the view, "both" keeps the editor as the default
		// (the views in the editor and in the panel can always be opened with their own commands)
		return getConfig().viewLocation === 'panel' ? this.viewInPanel(arg) : this.viewInEditor(arg);
	}

	/**
	 * The method run when the `easy-graph.viewInEditor` command is invoked.
	 * @param arg An optional argument passed to the command (when invoked from the Visual Studio Code Git Extension).
	 */
	private async viewInEditor(arg: any) {
		if (getConfig().toggleViewOnCommand && GitGraphView.closeIfActive()) {
			// The view was active, so running the command again closes it
			return;
		}
		const loadViewTo = await this.getViewTarget(arg);
		GitGraphView.createOrShow(this.context.extensionPath, this.dataSource, this.extensionState, this.avatarManager, this.repoManager, this.logger, loadViewTo);
	}

	/**
	 * The method run when the `easy-graph.viewInPanel` command is invoked.
	 * @param arg An optional argument passed to the command (when invoked from the Visual Studio Code Git Extension).
	 */
	private async viewInPanel(arg: any) {
		if (this.gitExecutable === null) {
			showUnableToFindGitMessage();
			return;
		}
		const loadViewTo = await this.getViewTarget(arg);
		await GitGraphPanelView.getInstance(this.context.extensionPath, this.dataSource, this.extensionState, this.avatarManager, this.repoManager, this.logger).show(loadViewTo);
	}

	/**
	 * Get what the commands that open the Easy Graph View should load it to.
	 * @param arg An optional argument passed to the command (when invoked from the Visual Studio Code Git Extension).
	 * @returns The repository to load, or NULL to load the view as it was.
	 */
	private async getViewTarget(arg: any): Promise<LoadGitGraphViewTo> {
		if (arg !== null && typeof arg === 'object' && arg.rootUri) {
			// Run from the Visual Studio Code Source Control View: load its repository, adding it if it isn't known yet
			const repoPath = getPathFromUri(arg.rootUri);
			let repo = await this.repoManager.getKnownRepo(repoPath);
			if (repo === null) repo = (await this.repoManager.registerRepo(await resolveToSymbolicPath(repoPath), true)).root;
			return repo !== null ? { repo: repo } : null;
		}

		const editor = vscode.window.activeTextEditor;
		if (editor && getConfig().openToTheRepoOfTheActiveTextEditorDocument) {
			const repo = this.repoManager.getRepoContainingFile(getPathFromUri(editor.document.uri));
			if (repo !== null) return { repo: repo };
		}
		return null;
	}

	/**
	 * The method run when the `easy-graph.addGitRepository` command is invoked.
	 */
	private addGitRepository() {
		if (this.gitExecutable === null) {
			showUnableToFindGitMessage();
			return;
		}

		vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false }).then(uris => {
			if (uris && uris.length > 0) {
				let path = getPathFromUri(uris[0]);
				if (isPathInWorkspace(path)) {
					this.repoManager.registerRepo(path, false).then(status => {
						if (status.error === null) {
							showInformationMessage(vscode.l10n.t('The repository "{0}" was added to Easy Graph.', status.root!));
						} else {
							showErrorMessage(vscode.l10n.t('{0} Therefore it could not be added to Easy Graph.', status.error!));
						}
					});
				} else {
					showErrorMessage(vscode.l10n.t('The folder "{0}" is not within the opened Visual Studio Code workspace, and therefore could not be added to Easy Graph.', path));
				}
			}
		}, () => { });
	}

	/**
	 * The method run when the `easy-graph.removeGitRepository` command is invoked.
	 */
	private removeGitRepository() {
		if (this.gitExecutable === null) {
			showUnableToFindGitMessage();
			return;
		}

		const repos = this.repoManager.getRepos();
		const items: vscode.QuickPickItem[] = getSortedRepositoryPaths(repos, getConfig().repoDropdownOrder).map((path) => ({
			label: repos[path].name || getRepoName(path),
			description: path
		}));

		vscode.window.showQuickPick(items, {
			placeHolder: vscode.l10n.t('Select the repositories to remove from Easy Graph:'),
			canPickMany: true
		}).then((selected) => {
			if (!selected) return;
			const removed: string[] = [];
			selected.forEach((item) => {
				if (item.description === undefined) return;
				if (this.repoManager.ignoreRepo(item.description)) {
					removed.push(item.label);
				} else {
					showErrorMessage(vscode.l10n.t('The repository "{0}" is not known to Easy Graph.', item.label));
				}
			});
			if (removed.length === 1) {
				showInformationMessage(vscode.l10n.t('The repository "{0}" was removed from Easy Graph.', removed[0]));
			} else if (removed.length > 1) {
				showInformationMessage(vscode.l10n.t('The repositories {0} were removed from Easy Graph.', '"' + removed.join('", "') + '"'));
			}
		}, () => { });
	}

	/**
	 * The method run when the `easy-graph.switchRepository` command is invoked. The chosen repository is shown in
	 * the Easy Graph View, which is opened in the location configured by `easy-graph.viewLocation` if it isn't open yet.
	 */
	private async switchRepository() {
		const repos = this.repoManager.getRepos();
		const paths = getSortedRepositoryPaths(repos, getConfig().repoDropdownOrder);
		if (paths.length < 2) {
			// There is nothing to choose from: show the only repository, or the view's message that no repository was found
			this.showView(paths.length === 1 ? { repo: paths[0] } : null);
			return;
		}

		const items = paths.map((path): vscode.QuickPickItem => ({ label: repos[path].name || getRepoName(path), description: path }));
		let chosen: vscode.QuickPickItem | undefined;
		try {
			chosen = await vscode.window.showQuickPick(items, {
				placeHolder: vscode.l10n.t('Select the repository you want to open in Easy Graph:'),
				canPickMany: false
			});
		} catch {
			showErrorMessage(vscode.l10n.t('An unexpected error occurred while running the command "{0}".', vscode.l10n.t('Switch Repository...')));
			return;
		}
		if (chosen && typeof chosen.description === 'string') {
			this.showView({ repo: chosen.description });
		}
	}

	/**
	 * Show the Easy Graph View in the configured location (`easy-graph.viewLocation`).
	 * @param loadViewTo What to load the view to.
	 */
	private showView(loadViewTo: LoadGitGraphViewTo) {
		if (getConfig().viewLocation === 'panel') {
			GitGraphPanelView.getInstance(this.context.extensionPath, this.dataSource, this.extensionState, this.avatarManager, this.repoManager, this.logger).show(loadViewTo);
		} else {
			GitGraphView.createOrShow(this.context.extensionPath, this.dataSource, this.extensionState, this.avatarManager, this.repoManager, this.logger, loadViewTo);
		}
	}

	/**
	 * The method run when the `easy-graph.clearAvatarCache` command is invoked.
	 */
	private clearAvatarCache() {
		this.avatarManager.clearCache().then((errorInfo) => {
			if (errorInfo === null) {
				showInformationMessage(vscode.l10n.t('The Avatar Cache was successfully cleared.'));
			} else {
				showErrorMessage(errorInfo);
			}
		}, () => {
			showErrorMessage(vscode.l10n.t('An unexpected error occurred while running the command "{0}".', vscode.l10n.t('Clear Avatar Cache')));
		});
	}

	/**
	 * The method run when the `easy-graph.fetch` command is invoked.
	 */
	private fetch() {
		const repos = this.repoManager.getRepos();
		const repoPaths = getSortedRepositoryPaths(repos, getConfig().repoDropdownOrder);

		if (repoPaths.length > 1) {
			const items: vscode.QuickPickItem[] = repoPaths.map((path) => ({
				label: repos[path].name || getRepoName(path),
				description: path
			}));

			const lastActiveRepo = this.extensionState.getLastActiveRepo();
			if (lastActiveRepo !== null) {
				let lastActiveRepoIndex = items.findIndex((item) => item.description === lastActiveRepo);
				if (lastActiveRepoIndex > -1) {
					const item = items.splice(lastActiveRepoIndex, 1)[0];
					items.unshift(item);
				}
			}

			vscode.window.showQuickPick(items, {
				placeHolder: vscode.l10n.t('Select the repository you want to open in Easy Graph, and fetch from remote(s):'),
				canPickMany: false
			}).then((item) => {
				if (item && item.description) {
					this.showView({
						repo: item.description,
						runCommandOnLoad: 'fetch'
					});
				}
			}, () => {
				showErrorMessage(vscode.l10n.t('An unexpected error occurred while running the command "{0}".', vscode.l10n.t('Fetch from Remote(s)')));
			});
		} else if (repoPaths.length === 1) {
			this.showView({
				repo: repoPaths[0],
				runCommandOnLoad: 'fetch'
			});
		} else {
			this.showView(null);
		}
	}

	/**
	 * The method run when the `easy-graph.goToRef` command is invoked.
	 * Selects a branch or tag from a Quick Pick, then scrolls the Easy Graph View to the commit it points to.
	 */
	private async goToRef() {
		if (this.gitExecutable === null) {
			showUnableToFindGitMessage();
			return;
		}

		const repos = this.repoManager.getRepos();
		const repoPaths = getSortedRepositoryPaths(repos, getConfig().repoDropdownOrder);
		if (repoPaths.length === 0) {
			showErrorMessage(vscode.l10n.t('No Git repositories are known to Easy Graph.'));
			return;
		}

		let repo = repoPaths[0];
		if (repoPaths.length > 1) {
			const lastActiveRepo = this.extensionState.getLastActiveRepo();
			const items: vscode.QuickPickItem[] = repoPaths.map((path) => ({ label: repos[path].name || getRepoName(path), description: path }));
			const lastActiveRepoIndex = items.findIndex((item) => item.description === lastActiveRepo);
			if (lastActiveRepoIndex > 0) items.unshift(items.splice(lastActiveRepoIndex, 1)[0]);
			const item = await vscode.window.showQuickPick(items, { placeHolder: vscode.l10n.t('Select a repository:') });
			if (!item || !item.description) return;
			repo = item.description;
		}

		const refs = await this.dataSource.getRefList(repo).catch((errorMessage) => {
			showErrorMessage(vscode.l10n.t('Unable to load the branches and tags of the repository: {0}', String(errorMessage)));
			return null;
		});
		if (refs === null) return;

		// Annotated tags are listed twice (the tag object, and the dereferenced commit marked as annotated), keep the commit
		const tagHashes: { [name: string]: string } = {};
		refs.tags.forEach((tag) => {
			if (tag.annotated || typeof tagHashes[tag.name] === 'undefined') tagHashes[tag.name] = tag.hash;
		});
		const items: GoToRefQuickPickItem[] = [
			...refs.heads.map((ref) => ({ label: '$(git-branch) ' + ref.name, description: abbrevCommit(ref.hash), hash: ref.hash })),
			...refs.remotes.map((ref) => ({ label: '$(cloud) ' + ref.name, description: abbrevCommit(ref.hash), hash: ref.hash })),
			...Object.keys(tagHashes).map((name) => ({ label: '$(tag) ' + name, description: abbrevCommit(tagHashes[name]), hash: tagHashes[name] }))
		];

		const item = await vscode.window.showQuickPick(items, { placeHolder: vscode.l10n.t('Select a branch or tag to go to:'), matchOnDescription: true });
		if (!item) return;

		const loadViewTo = { repo: repo, scrollToCommit: item.hash };
		if (getConfig().viewLocation === 'panel') {
			GitGraphPanelView.getInstance(this.context.extensionPath, this.dataSource, this.extensionState, this.avatarManager, this.repoManager, this.logger).show(loadViewTo);
		} else {
			GitGraphView.createOrShow(this.context.extensionPath, this.dataSource, this.extensionState, this.avatarManager, this.repoManager, this.logger, loadViewTo);
		}
	}

	/**
	 * The method run when the `easy-graph.endAllWorkspaceCodeReviews` command is invoked.
	 */
	private endAllWorkspaceCodeReviews() {
		this.extensionState.endAllWorkspaceCodeReviews();
		showInformationMessage(vscode.l10n.t('Ended All Code Reviews in Workspace'));
	}

	/**
	 * The method run when the `easy-graph.endSpecificWorkspaceCodeReview` command is invoked.
	 */
	private endSpecificWorkspaceCodeReview() {
		const codeReviews = this.extensionState.getCodeReviews();
		if (Object.keys(codeReviews).length === 0) {
			showErrorMessage('There are no Code Reviews in progress within the current workspace.');
			return;
		}

		vscode.window.showQuickPick(this.getCodeReviewQuickPickItems(codeReviews), {
			placeHolder: vscode.l10n.t('Select the Code Review you want to end:'),
			canPickMany: false
		}).then((item) => {
			if (item) {
				this.extensionState.endCodeReview(item.codeReviewRepo, item.codeReviewId).then((errorInfo) => {
					if (errorInfo === null) {
						showInformationMessage(vscode.l10n.t('Successfully ended Code Review "{0}".', item.label));
					} else {
						showErrorMessage(errorInfo);
					}
				}, () => { });
			}
		}, () => {
			showErrorMessage(vscode.l10n.t('An unexpected error occurred while running the command "{0}".', vscode.l10n.t('End a specific Code Review in Workspace...')));
		});
	}

	/**
	 * The method run when the `easy-graph.resumeWorkspaceCodeReview` command is invoked.
	 */
	private resumeWorkspaceCodeReview() {
		const codeReviews = this.extensionState.getCodeReviews();
		if (Object.keys(codeReviews).length === 0) {
			showErrorMessage('There are no Code Reviews in progress within the current workspace.');
			return;
		}

		vscode.window.showQuickPick(this.getCodeReviewQuickPickItems(codeReviews), {
			placeHolder: vscode.l10n.t('Select the Code Review you want to resume:'),
			canPickMany: false
		}).then((item) => {
			if (item) {
				const commitHashes = item.codeReviewId.split('-');
				this.showView({
					repo: item.codeReviewRepo,
					commitDetails: {
						commitHash: commitHashes[commitHashes.length > 1 ? 1 : 0],
						compareWithHash: commitHashes.length > 1 ? commitHashes[0] : null
					}
				});
			}
		}, () => {
			showErrorMessage(vscode.l10n.t('An unexpected error occurred while running the command "{0}".', vscode.l10n.t('Resume a specific Code Review in Workspace...')));
		});
	}

	/**
	 * The method run when the `easy-graph.version` command is invoked.
	 */
	private async version() {
		try {
			const gitGraphVersion = await getExtensionVersion(this.context);
			const information = 'Easy Graph: ' + gitGraphVersion + '\nVisual Studio Code: ' + vscode.version + '\nOS: ' + os.type() + ' ' + os.arch() + ' ' + os.release() + '\nGit: ' + (this.gitExecutable !== null ? this.gitExecutable.version : '(none)');
			const copy = vscode.l10n.t('Copy');
			vscode.window.showInformationMessage(information, { modal: true }, copy).then((selectedItem) => {
				if (selectedItem === copy) {
					copyToClipboard(information).then((result) => {
						if (result !== null) {
							showErrorMessage(result);
						}
					});
				}
			}, () => { });
		} catch {
			showErrorMessage(vscode.l10n.t('An unexpected error occurred while retrieving version information.'));
		}
	}

	/**
	 * Opens a file in Visual Studio Code, based on a Git Graph URI (from the Diff View).
	 * The method run when the `easy-graph.openFile` command is invoked.
	 * @param arg The Git Graph URI.
	 */
	private openFile(arg?: vscode.Uri) {
		const uri = arg || vscode.window.activeTextEditor?.document.uri;
		if (typeof uri === 'object' && uri && uri.scheme === DiffDocProvider.scheme) {
			// A Git Graph URI has been provided
			const request = decodeDiffDocUri(uri);
			return openFile(request.repo, request.filePath, request.commit, this.dataSource, vscode.ViewColumn.Active).then((errorInfo) => {
				if (errorInfo !== null) {
					return showErrorMessage(vscode.l10n.t('Unable to Open File: {0}', errorInfo));
				}
			});
		} else {
			return showErrorMessage(vscode.l10n.t('Unable to Open File: {0}', vscode.l10n.t('The command was not called with the required arguments.')));
		}
	}


	/**
	 * The method run when the `easy-graph.openWithPathFilter` command is invoked.
	 * Opens Git Graph with a path filter applied to the selected file or folder.
	 * @param arg The URI of the file or folder from the Explorer context menu.
	 */
	private async openWithPathFilter(arg: vscode.Uri) {
		if (!(arg instanceof vscode.Uri)) {
			return;
		}

		const absPath = getPathFromUri(arg);
		const repo = this.repoManager.getRepoContainingFile(absPath);
		if (repo === null) {
			showErrorMessage(vscode.l10n.t('The selected path is not within a known Git repository.'));
			return;
		}

		const relativePath = absPath.startsWith(repo + '/') ? absPath.substring(repo.length + 1) : absPath.substring(repo.length);
		const loadViewTo = { repo: repo, pathFilter: relativePath };

		const config = getConfig();
		if (config.viewLocation === 'panel') {
			const panelProvider = GitGraphPanelView.getInstance(
				this.context.extensionPath,
				this.dataSource,
				this.extensionState,
				this.avatarManager,
				this.repoManager,
				this.logger
			);
			panelProvider.show(loadViewTo);
		} else {
			GitGraphView.createOrShow(this.context.extensionPath, this.dataSource, this.extensionState, this.avatarManager, this.repoManager, this.logger, loadViewTo);
		}
	}


	/**
	 * Show the commit of a revision document (e.g. a side of the active Diff View) in the Easy Graph View.
	 * The method run when the `easy-graph.goToCommit` command is invoked.
	 * @param arg The URI of the document the command was invoked on (if it was invoked from a menu).
	 */
	private async goToCommit(arg?: unknown) {
		// Menus provide the URI of the focused side (`editor/context`) or the modified side (`editor/title`), which can be a
		// working file (e.g. "View Diff with Working File"), so the other side of the active Diff View is also considered.
		const candidates: vscode.Uri[] = [];
		const addCandidate = (uri: unknown) => {
			if (isUri(uri) && !candidates.some((candidate) => candidate.toString() === uri.toString())) candidates.push(uri);
		};
		addCandidate(arg);
		addCandidate(vscode.window.activeTextEditor?.document.uri);
		getSidesOfActiveDiffTab().forEach(addCandidate);

		let location: RevisionLocation | null = null;
		for (let i = 0; i < candidates.length && location === null; i++) {
			location = getRevisionLocationOfUri(candidates[i], (path) => this.repoManager.getRepoContainingFile(path));
		}
		if (location === null) {
			showErrorMessage(vscode.l10n.t('Unable to Go to Commit: {0}', vscode.l10n.t('The command was not called with the required arguments.')));
			return;
		}

		const hash = await this.dataSource.resolveCommit(location.repo, location.rev);
		if (hash === null) {
			showErrorMessage(vscode.l10n.t('Unable to Go to Commit: {0}', vscode.l10n.t('Unable to resolve "{0}" to a commit.', location.rev)));
			return;
		}
		// The webview loads more commits until the commit is shown (or reports that it's excluded by the filters)
		this.showView({ repo: location.repo, scrollToCommit: hash });
	}

	/**
	 * Show the reflog of HEAD in a Quick Pick, and show the selected commit in the Easy Graph View.
	 * The method run when the `easy-graph.showReflog` command is invoked.
	 */
	private async showReflog() {
		const repo = await this.pickRepo(vscode.l10n.t('Select the repository to show the reflog of:'));
		if (repo === null) return;

		let entries: { hash: string, selector: string, message: string, date: number }[];
		try {
			entries = await this.dataSource.getReflog(repo, 500);
		} catch (error) {
			showErrorMessage(vscode.l10n.t('Unable to load the reflog: {0}', String(error)));
			return;
		}
		if (entries.length === 0) {
			showInformationMessage(vscode.l10n.t('The reflog of this repository is empty.'));
			return;
		}

		const item = await vscode.window.showQuickPick(entries.map((entry) => ({
			label: abbrevCommit(entry.hash) + '  ' + entry.message,
			description: entry.selector + (entry.date > 0 ? '  ' + getRelativeTimeDiff(entry.date) : ''),
			hash: entry.hash
		})), {
			placeHolder: vscode.l10n.t('Select a reflog entry to show its commit in Easy Graph:'),
			matchOnDescription: true
		});
		if (item) {
			this.showView({ repo: repo, scrollToCommit: item.hash });
		}
	}

	/**
	 * Restore, show or delete the backups created before dangerous actions.
	 * The method run when the `easy-graph.manageBackups` command is invoked.
	 */
	private async manageBackups() {
		const repo = await this.pickRepo(vscode.l10n.t('Select the repository to manage the backups of:'));
		if (repo === null) return;

		let backups: { ref: string, hash: string, subject: string }[];
		try {
			backups = await this.dataSource.getBackups(repo);
		} catch (error) {
			showErrorMessage(vscode.l10n.t('Unable to load the backups: {0}', String(error)));
			return;
		}
		if (backups.length === 0) {
			showInformationMessage(vscode.l10n.t('There are no backups in this repository. Backups are created before dangerous actions when the setting "easy-graph.repository.backupBeforeDangerousActions" is enabled.'));
			return;
		}

		const backup = await vscode.window.showQuickPick([
			...backups.map((backup) => ({ label: backup.ref.substring(BACKUP_REF_PREFIX.length), description: abbrevCommit(backup.hash), detail: backup.subject, backup: <typeof backup | null>backup })),
			{ label: vscode.l10n.t('Delete All Backups'), description: '', detail: '', backup: null }
		], {
			placeHolder: vscode.l10n.t('Select a backup:'),
			matchOnDetail: true
		});
		if (!backup) return;

		if (backup.backup === null) {
			const confirm = vscode.l10n.t('Delete');
			if (await vscode.window.showWarningMessage(vscode.l10n.t('Are you sure you want to delete all {0} backups?', backups.length), { modal: true }, confirm) === confirm) {
				this.showActionResult(await this.dataSource.deleteBackups(repo, backups.map((backup) => backup.ref)), vscode.l10n.t('Deleted all backups.'));
			}
			return;
		}

		const selected = backup.backup;
		const actions = {
			reset: vscode.l10n.t('Reset Current Branch to This Backup'),
			branch: vscode.l10n.t('Create Branch at This Backup...'),
			show: vscode.l10n.t('Show in Easy Graph'),
			delete: vscode.l10n.t('Delete This Backup')
		};
		const action = await vscode.window.showQuickPick([
			{ label: actions.reset, detail: 'git reset --keep ' + backup.label },
			{ label: actions.branch, detail: 'git branch <name> ' + abbrevCommit(selected.hash) },
			{ label: actions.show, detail: abbrevCommit(selected.hash) + ' ' + selected.subject },
			{ label: actions.delete, detail: 'git update-ref -d ' + selected.ref }
		], { placeHolder: backup.label });
		if (!action) return;

		if (action.label === actions.reset) {
			const confirm = vscode.l10n.t('Reset');
			if (await vscode.window.showWarningMessage(vscode.l10n.t('Are you sure you want to reset the current branch to the backup "{0}"? Uncommitted changes are kept (the reset is refused if they would be overwritten).', backup.label), { modal: true }, confirm) === confirm) {
				this.showActionResult(await this.dataSource.restoreBackup(repo, selected.ref), vscode.l10n.t('The current branch was reset to the backup "{0}".', backup.label));
			}
		} else if (action.label === actions.branch) {
			const branchName = await vscode.window.showInputBox({
				prompt: vscode.l10n.t('Enter the name of the branch to create at the backup "{0}":', backup.label),
				validateInput: (value) => value.trim() === '' ? vscode.l10n.t('The branch name must not be empty.') : null
			});
			if (branchName) {
				const errors = await this.dataSource.createBranch(repo, branchName.trim(), selected.hash, false, false);
				this.showActionResult(errors[0], vscode.l10n.t('The branch "{0}" was created.', branchName.trim()));
			}
		} else if (action.label === actions.show) {
			this.showView({ repo: repo, scrollToCommit: selected.hash });
		} else if (action.label === actions.delete) {
			this.showActionResult(await this.dataSource.deleteBackups(repo, [selected.ref]), vscode.l10n.t('The backup "{0}" was deleted.', backup.label));
		}
	}

	/**
	 * Reset the choices remembered by the dialogs of the Easy Graph View ("Always Accept" when checking out a commit, and "Always Proceed"
	 * when pushing a tag). The method run when the `easy-graph.resetRememberedDialogChoices` command is invoked.
	 */
	private async resetRememberedDialogChoices() {
		const state = this.extensionState.getGlobalViewState();
		const error = await this.extensionState.setGlobalViewState(Object.assign({}, state, { alwaysAcceptCheckoutCommit: false, pushTagSkipRemoteCheck: false }));
		if (error === null) {
			BaseGitGraphView.reloadAll();
			showInformationMessage(vscode.l10n.t('The remembered dialog choices were reset, the confirmation dialogs will be shown again.'));
		} else {
			showErrorMessage(error);
		}
	}


	/* Helper Methods */

	/**
	 * Ask the user to select a repository (if there is more than one), with the last active repository listed first.
	 * @param placeHolder The placeholder of the Quick Pick.
	 * @returns The path of the selected repository, or NULL if no repository was selected.
	 */
	private async pickRepo(placeHolder: string): Promise<string | null> {
		const repos = this.repoManager.getRepos();
		const repoPaths = getSortedRepositoryPaths(repos, getConfig().repoDropdownOrder);
		if (repoPaths.length === 0) {
			showErrorMessage(vscode.l10n.t('No Git repositories were found in the current workspace.'));
			return null;
		} else if (repoPaths.length === 1) {
			return repoPaths[0];
		}

		const items: vscode.QuickPickItem[] = repoPaths.map((path) => ({ label: repos[path].name || getRepoName(path), description: path }));
		const lastActiveRepoIndex = items.findIndex((item) => item.description === this.extensionState.getLastActiveRepo());
		if (lastActiveRepoIndex > 0) {
			items.unshift(items.splice(lastActiveRepoIndex, 1)[0]);
		}
		const item = await vscode.window.showQuickPick(items, { placeHolder: placeHolder });
		return item && item.description ? item.description : null;
	}

	/**
	 * Show the result of an action, and refresh the open Easy Graph Views if it succeeded.
	 * @param error The ErrorInfo of the action.
	 * @param successMessage The message shown if the action succeeded.
	 */
	private showActionResult(error: ErrorInfo, successMessage: string) {
		if (error === null) {
			BaseGitGraphView.refreshAll();
			showInformationMessage(successMessage);
		} else {
			showErrorMessage(error);
		}
	}

	/**
	 * Transform a set of Code Reviews into a list of Quick Pick items for use with `vscode.window.showQuickPick`.
	 * @param codeReviews A set of Code Reviews.
	 * @returns A list of Quick Pick items.
	 */
	private getCodeReviewQuickPickItems(codeReviews: CodeReviews): Promise<CodeReviewQuickPickItem[]> {
		const repos = this.repoManager.getRepos();
		const enrichedCodeReviews: { repo: string, id: string, review: CodeReviewData, fromCommitHash: string, toCommitHash: string }[] = [];
		const fetchCommits: { repo: string, commitHash: string }[] = [];

		Object.keys(codeReviews).forEach((repo) => {
			if (typeof repos[repo] === 'undefined') return;
			Object.keys(codeReviews[repo]).forEach((id) => {
				const commitHashes = id.split('-');
				commitHashes.forEach((commitHash) => fetchCommits.push({ repo: repo, commitHash: commitHash }));
				enrichedCodeReviews.push({
					repo: repo, id: id, review: codeReviews[repo][id],
					fromCommitHash: commitHashes[0], toCommitHash: commitHashes[commitHashes.length > 1 ? 1 : 0]
				});
			});
		});

		return Promise.all(fetchCommits.map((fetch) => this.dataSource.getCommitSubject(fetch.repo, fetch.commitHash))).then(
			(subjects) => {
				const commitSubjects: { [repo: string]: { [commitHash: string]: string } } = {};
				subjects.forEach((subject, i) => {
					if (typeof commitSubjects[fetchCommits[i].repo] === 'undefined') {
						commitSubjects[fetchCommits[i].repo] = {};
					}
					commitSubjects[fetchCommits[i].repo][fetchCommits[i].commitHash] = subject !== null ? subject : '<Unknown Commit Subject>';
				});

				return enrichedCodeReviews.sort((a, b) => b.review.lastActive - a.review.lastActive).map((codeReview) => {
					const fromSubject = commitSubjects[codeReview.repo][codeReview.fromCommitHash];
					const toSubject = commitSubjects[codeReview.repo][codeReview.toCommitHash];
					const isComparison = codeReview.fromCommitHash !== codeReview.toCommitHash;
					return {
						codeReviewRepo: codeReview.repo,
						codeReviewId: codeReview.id,
						label: (repos[codeReview.repo].name || getRepoName(codeReview.repo)) + ': ' + abbrevCommit(codeReview.fromCommitHash) + (isComparison ? ' ↔ ' + abbrevCommit(codeReview.toCommitHash) : ''),
						description: getRelativeTimeDiff(Math.round(codeReview.review.lastActive / 1000)),
						detail: isComparison
							? abbrevText(fromSubject, 50) + ' ↔ ' + abbrevText(toSubject, 50)
							: fromSubject
					};
				});
			}
		);
	}
}

interface CodeReviewQuickPickItem extends vscode.QuickPickItem {
	codeReviewRepo: string;
	codeReviewId: string;
}

interface GoToRefQuickPickItem extends vscode.QuickPickItem {
	hash: string;
}

/** The repository and revision that a revision document (e.g. a side of a Diff View) shows the file at. */
interface RevisionLocation {
	readonly repo: string;
	readonly rev: string;
}

function isUri(value: unknown): value is vscode.Uri {
	return typeof value === 'object' && value !== null && typeof (<vscode.Uri>value).scheme === 'string' && typeof (<vscode.Uri>value).query === 'string';
}

/**
 * Get the URIs of both sides of the active editor tab, if it is a Diff View (the modified side first).
 */
function getSidesOfActiveDiffTab(): vscode.Uri[] {
	const input = vscode.window.tabGroups?.activeTabGroup?.activeTab?.input;
	if (typeof input !== 'object' || input === null) return [];
	const { modified, original } = <{ modified?: unknown, original?: unknown }>input;
	return [modified, original].filter(isUri);
}

/**
 * Get the repository and revision shown by a document, for the URIs of Easy Graph's DiffDocProvider and the Visual Studio Code Git Extension.
 * The index and the working tree (e.g. the Uncommitted Changes) are located at HEAD.
 * @param uri The URI of the document.
 * @param getRepoContainingFile Get the known repository containing a file (or NULL if there isn't one).
 * @returns The location, or NULL if the URI doesn't refer to a revision of a known repository (e.g. it is a working file).
 */
function getRevisionLocationOfUri(uri: vscode.Uri, getRepoContainingFile: (path: string) => string | null): RevisionLocation | null {
	let repo: string | null = null, rev: unknown = null;
	try {
		if (uri.scheme === DiffDocProvider.scheme) {
			const data = decodeDiffDocUri(uri);
			repo = typeof data.repo === 'string' && data.repo !== '' ? data.repo : null;
			rev = data.commit;
		} else if (uri.scheme === 'git') {
			// The query is JSON, e.g. {"path":"/repo/file.txt","ref":"HEAD"}. An empty ref, or "~", refers to the index.
			const query = JSON.parse(uri.query);
			repo = getRepoContainingFile(getPathFromStr(typeof query.path === 'string' && query.path !== '' ? query.path : uri.fsPath));
			rev = query.ref;
		}
	} catch {
		// The query of the URI is malformed
		return null;
	}
	if (repo === null) return null;
	if (typeof rev === 'undefined' || rev === null || rev === '' || rev === '~' || rev === UNCOMMITTED) return { repo: repo, rev: 'HEAD' };
	return typeof rev === 'string' ? { repo: repo, rev: rev } : null;
}
