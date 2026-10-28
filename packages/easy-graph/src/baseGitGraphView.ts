import * as path from 'path';
import * as vscode from 'vscode';
import { AvatarManager } from './avatarManager';
import { getConfig } from './config';
import { DataSource, GitConfigKey } from './dataSource';
import { ExtensionState } from './extensionState';
import { Logger } from './logger';
import { RepoFileWatcher } from './repoFileWatcher';
import { RepoManager } from './repoManager';
import { ErrorInfo, GitConfigLocation, GitGraphViewInitialState, GitPushBranchMode, GitRepoSet, LoadGitGraphViewTo, RequestMessage, ResponseMessage } from './types';
import { UNABLE_TO_FIND_GIT_MSG, UNCOMMITTED, applyPatch, archive, browseFilesAtCommit, copyFilePathToClipboard, copyToClipboard, createPullRequest, getNonce, getPathFromUri, openExtensionSettings, openExternalUrl, openFile, pathWithTrailingSlash, savePatch, showErrorMessage, viewAllChanges, viewCommitPatch, viewDiff, viewDiffWithWorkingFile, viewFileAtRevision, viewScm } from './utils';
import { Disposable, toDisposable } from './utils/disposable';

/**
 * The behaviour shared by the Easy Graph View in the editor (`GitGraphView`) and in the panel (`GitGraphPanelView`).
 *
 * A view outlives the webview that renders it: the editor view is bound to a single Webview Panel, while the panel view
 * gets a new webview every time Visual Studio Code resolves the Webview View again (e.g. after it was moved or closed).
 * Subclasses therefore only report which webview is currently attached (`attachWebview` / `detachWebview`) and whether
 * its host is visible, everything else (rendering, messages, watching the repository) is handled here. While no webview
 * is attached, rendering and messages are skipped, and the next attached webview is rendered from the current state.
 */
export abstract class BaseGitGraphView extends Disposable {
	protected readonly extensionPath: string;
	protected readonly avatarManager: AvatarManager;
	protected readonly dataSource: DataSource;
	protected readonly extensionState: ExtensionState;
	protected readonly repoFileWatcher: RepoFileWatcher;
	protected readonly repoManager: RepoManager;
	protected readonly logger: Logger;
	protected isGraphViewLoaded: boolean = false;
	protected isPanelVisible: boolean = true;
	protected currentRepo: string | null = null;
	protected loadViewTo: LoadGitGraphViewTo = null; // Is used by the next render of the webview, and is then reset to null

	private loadRepoInfoRefreshId: number = 0;
	private loadCommitsRefreshId: number = 0;

	private attached: { readonly webview: vscode.Webview, readonly messages: vscode.Disposable } | null = null;

	private static readonly openViews = new Set<BaseGitGraphView>();

	// When each repository was last fetched by `easy-graph.repository.fetchOnLoad`, shared by all views so that reopening a view doesn't fetch again
	private static readonly autoFetchedAt: { [repo: string]: number } = {};

	/**
	 * Refresh all open Git Graph Views (editor and panel).
	 */
	public static refreshAll() {
		BaseGitGraphView.openViews.forEach((view) => view.sendMessage({ command: 'refresh' }));
	}

	/**
	 * Reload all open Git Graph Views (editor and panel), so that they use the latest Global View State (e.g. after it was reset).
	 */
	public static reloadAll() {
		BaseGitGraphView.openViews.forEach((view) => {
			if (view.isVisible) view.update();
		});
	}

	/**
	 * Is the host of the attached webview (the Webview Panel or the Webview View) currently visible.
	 */
	protected abstract isHostVisible(): boolean;

	/**
	 * Creates a base Git Graph View.
	 * @param extensionPath The absolute file path of the directory containing the extension.
	 * @param dataSource The Git Graph DataSource instance.
	 * @param extensionState The Git Graph ExtensionState instance.
	 * @param avatarManger The Git Graph AvatarManager instance.
	 * @param repoManager The Git Graph RepoManager instance.
	 * @param logger The Git Graph Logger instance.
	 * @param loadViewTo What to load the view to.
	 */
	protected constructor(extensionPath: string, dataSource: DataSource, extensionState: ExtensionState, avatarManager: AvatarManager, repoManager: RepoManager, logger: Logger, loadViewTo: LoadGitGraphViewTo) {
		super();
		this.extensionPath = extensionPath;
		this.avatarManager = avatarManager;
		this.dataSource = dataSource;
		this.extensionState = extensionState;
		this.repoManager = repoManager;
		this.logger = logger;
		this.loadViewTo = loadViewTo;

		// Instantiate a RepoFileWatcher that watches for file changes in the repository currently open in the Git Graph View
		this.repoFileWatcher = new RepoFileWatcher(logger, () => {
			if (this.isVisible) {
				this.sendMessage({ command: 'refresh' });
			}
		});

		// These subscriptions don't depend on a specific webview, so they are made once for the lifetime of the view
		this.registerDisposables(
			// Subscribe to events triggered when a repository is added or deleted from Git Graph
			this.repoManager.onDidChangeRepos((event) => {
				if (!this.isVisible) return;
				const loadViewTo = event.loadRepo !== null ? { repo: event.loadRepo } : null;
				if ((event.numRepos === 0 && this.isGraphViewLoaded) || (event.numRepos > 0 && !this.isGraphViewLoaded)) {
					this.loadViewTo = loadViewTo;
					this.update();
				} else {
					this.respondLoadRepos(event.repos, loadViewTo);
				}
			}),
			// Refresh workspace folder paths when workspace folders change
			vscode.workspace.onDidChangeWorkspaceFolders(() => {
				if (!this.isVisible || !this.isGraphViewLoaded) return;
				this.respondLoadRepos(this.repoManager.getRepos(), null);
			}),
			// The webview reads easy-graph.commitDetailsView.autoScroll when it's loaded, so a visible view is reloaded to
			// apply a new value at once. A hidden view is reloaded when it's shown again (unless easy-graph.disableRefreshWhenShown is enabled).
			vscode.workspace.onDidChangeConfiguration((event) => {
				if (this.isVisible && event.affectsConfiguration('easy-graph.commitDetailsView.autoScroll')) this.update();
			}),
			// Subscribe to events triggered when an avatar is available
			this.avatarManager.onAvatar((event) => {
				this.sendMessage({
					command: 'fetchAvatar',
					email: event.email,
					image: event.image
				});
			}),

			// Release the attached webview (and with it the RepoFileWatcher) when disposed
			toDisposable(() => {
				this.detachWebview();
				BaseGitGraphView.openViews.delete(this);
			})
		);
		BaseGitGraphView.openViews.add(this);
	}

	/**
	 * Is a webview attached, and is its host visible.
	 */
	protected get isVisible(): boolean {
		return this.attached !== null && this.isHostVisible();
	}

	/**
	 * The attached webview. Only use it while a webview is attached (i.e. when rendering or sending a message).
	 */
	private get webview(): vscode.Webview {
		if (this.attached === null) {
			throw new Error('No webview is attached to the Easy Graph View.');
		}
		return this.attached.webview;
	}

	/**
	 * Start rendering the view in a webview, replacing the previously attached webview (if any).
	 * @param webview The webview.
	 * @param visible Is the host of the webview currently visible.
	 */
	protected attachWebview(webview: vscode.Webview, visible: boolean) {
		this.detachWebview();
		this.attached = {
			webview: webview,
			messages: webview.onDidReceiveMessage((msg) => this.respondToMessage(msg))
		};
		this.isPanelVisible = visible;

		// Log before rendering, as rendering consumes `loadViewTo`
		this.logger.log('Created Easy Graph View' + (this.loadViewTo !== null ? ' (active repo: ' + this.loadViewTo.repo + ')' : ''));
		this.update();
	}

	/**
	 * Stop rendering the view in the attached webview (e.g. because it was disposed). The repository is no longer watched
	 * until a webview is attached again, which then loads the repository again.
	 */
	protected detachWebview() {
		if (this.attached === null) return;
		this.attached.messages.dispose();
		this.attached = null;
		this.currentRepo = null;
		this.repoFileWatcher.stop();
	}

	/**
	 * Handle the host of the attached webview being shown or hidden.
	 * @param visible Whether the view is now visible.
	 */
	protected onDidChangeVisibility(visible: boolean) {
		if (visible === this.isPanelVisible) return;
		this.isPanelVisible = visible;

		// With `easy-graph.disableRefreshWhenShown`, the loaded view is kept as is when it's shown again
		const keepContent = getConfig().disableRefreshWhenShown && this.isGraphViewLoaded;
		if (!visible) {
			if (!keepContent) {
				this.currentRepo = null;
				this.repoFileWatcher.stop();
			}
		} else if (!keepContent) {
			this.update();
		} else if (this.loadViewTo !== null) {
			// The kept view isn't rendered again, so deliver what was requested while it was hidden (e.g. a repository to show)
			const loadViewTo = this.loadViewTo;
			this.loadViewTo = null;
			this.respondLoadRepos(this.repoManager.getRepos(), loadViewTo);
		}
	}

	/**
	 * Fetch from the remotes of a repository when it's opened, if `easy-graph.repository.fetchOnLoad` is enabled (at most once every 5 minutes per repository).
	 * @param repo The path of the repository.
	 */
	private fetchOnLoad(repo: string) {
		const config = getConfig();
		const now = (new Date()).getTime();
		if (!config.fetchOnLoad || now - (BaseGitGraphView.autoFetchedAt[repo] || 0) < 300000) return;
		BaseGitGraphView.autoFetchedAt[repo] = now;
		this.logger.log('Fetching from remotes on load: ' + repo);
		this.dataSource.fetch(repo, null, null, null).then((error) => {
			if (error !== null) {
				this.logger.logError('Unable to fetch from remotes on load (' + repo + '): ' + error);
				showErrorMessage(vscode.l10n.t('Unable to fetch from the remotes of the repository "{0}": {1}', repo, error));
			} else if (this.currentRepo === repo && this.isVisible) {
				this.sendMessage({ command: 'refresh' });
			}
		}, () => { });
	}

	/**
	 * Update the view with the provided repositories and load target.
	 * @param repos The repositories to show.
	 * @param loadViewTo What to load the view to.
	 */
	public updateWithRepos(repos: GitRepoSet, loadViewTo: LoadGitGraphViewTo) {
		if (this.isVisible) {
			if (loadViewTo !== null) {
				this.respondLoadRepos(repos, loadViewTo);
			}
		} else {
			this.loadViewTo = loadViewTo;
		}
	}

	/**
	 * Respond to a message sent from the front-end.
	 * @param msg The message that was received.
	 */
	private async respondToMessage(msg: RequestMessage) {
		this.repoFileWatcher.mute();
		let errorInfos: ErrorInfo[];

		switch (msg.command) {
			case 'addRemote':
				this.sendMessage({
					command: 'addRemote',
					error: await this.dataSource.addRemote(msg.repo, msg.name, msg.url, msg.pushUrl, msg.fetch)
				});
				break;
			case 'addTag':
				errorInfos = [await this.dataSource.addTag(msg.repo, msg.tagName, msg.commitHash, msg.type, msg.message, msg.force)];
				if (errorInfos[0] === null && msg.pushToRemote !== null) {
					errorInfos.push(...await this.dataSource.pushTag(msg.repo, msg.tagName, [msg.pushToRemote], msg.commitHash, msg.pushSkipRemoteCheck));
				}
				this.sendMessage({
					command: 'addTag',
					repo: msg.repo,
					tagName: msg.tagName,
					pushToRemote: msg.pushToRemote,
					commitHash: msg.commitHash,
					errors: errorInfos
				});
				break;
			case 'applyStash':
				this.sendMessage({
					command: 'applyStash',
					error: await this.dataSource.applyStash(msg.repo, msg.selector, msg.reinstateIndex)
				});
				break;
			case 'branchFromStash':
				this.sendMessage({
					command: 'branchFromStash',
					error: await this.dataSource.branchFromStash(msg.repo, msg.selector, msg.branchName)
				});
				break;
			case 'checkoutBranch':
				errorInfos = msg.stashFirst ? [await this.dataSource.pushStash(msg.repo, 'Stashed by Easy Graph before checking out ' + msg.branchName, true)] : [];
				if (errorInfos.length === 0 || errorInfos[0] === null) {
					errorInfos.push(await this.dataSource.checkoutBranch(msg.repo, msg.branchName, msg.remoteBranch));
					if (errorInfos[errorInfos.length - 1] === null && msg.pullAfterwards !== null) {
						errorInfos.push(await this.dataSource.pullBranch(msg.repo, msg.pullAfterwards.branchName, msg.pullAfterwards.remote, msg.pullAfterwards.createNewCommit, msg.pullAfterwards.squash, msg.pullAfterwards.noVerify));
					}
				}
				this.sendMessage({
					command: 'checkoutBranch',
					pullAfterwards: msg.pullAfterwards,
					request: msg,
					errors: errorInfos
				});
				break;
			case 'checkoutCommit': {
				const stashError = msg.stashFirst ? await this.dataSource.pushStash(msg.repo, 'Stashed by Easy Graph before checking out ' + msg.commitHash, true) : null;
				this.sendMessage({
					command: 'checkoutCommit',
					request: msg,
					error: stashError !== null ? stashError : await this.dataSource.checkoutCommit(msg.repo, msg.commitHash)
				});
				break;
			}
			case 'cherrypickCommit':
				errorInfos = [await this.dataSource.cherrypickCommit(msg.repo, msg.commitHash, msg.parentIndex, msg.recordOrigin, msg.noCommit, !!msg.allowEmpty)];
				if (errorInfos[0] === null && msg.noCommit) {
					errorInfos.push(await viewScm());
				}
				this.sendMessage({ command: 'cherrypickCommit', errors: errorInfos });
				break;
			case 'cleanUntrackedFiles':
				this.sendMessage({
					command: 'cleanUntrackedFiles',
					error: await this.dataSource.cleanUntrackedFiles(msg.repo, msg.directories)
				});
				break;
			case 'commitDetails':
				let data = await Promise.all([
					msg.commitHash === UNCOMMITTED
						? this.dataSource.getUncommittedDetails(msg.repo, msg.uncommittedGroup)
						: msg.stash === null
							? this.dataSource.getCommitDetails(msg.repo, msg.commitHash, msg.hasParents)
							: this.dataSource.getStashDetails(msg.repo, msg.commitHash, msg.stash),
					msg.avatarEmail !== null ? this.avatarManager.getAvatarImage(msg.avatarEmail) : Promise.resolve(null)
				]);
				this.sendMessage({
					command: 'commitDetails',
					...data[0],
					avatar: data[1],
					codeReview: msg.commitHash !== UNCOMMITTED ? this.extensionState.getCodeReview(msg.repo, msg.commitHash) : null,
					refresh: msg.refresh
				});
				break;
			case 'compareCommits':
				this.sendMessage({
					command: 'compareCommits',
					commitHash: msg.commitHash,
					compareWithHash: msg.compareWithHash,
					...await this.dataSource.getCommitComparison(msg.repo, msg.fromHash, msg.toHash),
					codeReview: msg.toHash !== UNCOMMITTED ? this.extensionState.getCodeReview(msg.repo, msg.fromHash + '-' + msg.toHash) : null,
					refresh: msg.refresh
				});
				break;
			case 'copyFilePath':
				this.sendMessage({
					command: 'copyFilePath',
					error: await copyFilePathToClipboard(msg.repo, msg.filePath, msg.absolute)
				});
				break;
			case 'cherrypickCommits':
			case 'revertCommits':
				this.sendMessage({
					command: msg.command,
					error: await this.dataSource.applyCommits(msg.repo, msg.command === 'revertCommits', msg.commitHashes, !!msg.allowEmpty)
				});
				break;
			case 'loadCommitNotes':
				this.sendMessage({
					command: 'loadCommitNotes',
					commitHash: msg.commitHash,
					notes: await this.dataSource.getCommitNotes(msg.repo, msg.commitHash)
				});
				break;
			case 'setCommitNotes':
				this.sendMessage({
					command: 'setCommitNotes',
					commitHash: msg.commitHash,
					error: await this.dataSource.setCommitNotes(msg.repo, msg.commitHash, msg.notes)
				});
				break;
			case 'loadBranchesContainingCommit':
				this.sendMessage({
					command: 'loadBranchesContainingCommit',
					commitHash: msg.commitHash,
					...await this.dataSource.getBranchesContainingCommit(msg.repo, msg.commitHash)
				});
				break;
			case 'createFixupCommit':
				this.sendMessage({
					command: 'createFixupCommit',
					error: await this.dataSource.createFixupCommit(msg.repo, msg.commitHash, msg.squash)
				});
				break;
			case 'loadOperationInProgress':
				this.sendMessage({
					command: 'loadOperationInProgress',
					repo: msg.repo,
					operation: await this.dataSource.getOperationInProgress(msg.repo).catch(() => null)
				});
				break;
			case 'operationAction':
				this.sendMessage({
					command: 'operationAction',
					operation: msg.operation,
					action: msg.action,
					error: await this.dataSource.operationAction(msg.repo, msg.operation, msg.action)
				});
				break;
			case 'copyCommitLink': {
				const result = await this.dataSource.getCommitWebUrl(msg.repo, msg.commitHash);
				this.sendMessage({
					command: 'copyToClipboard',
					type: 'Commit Link',
					error: result.url !== null ? await copyToClipboard(result.url) : result.error
				});
				break;
			}
			case 'openCommitLink': {
				const result = await this.dataSource.getCommitWebUrl(msg.repo, msg.commitHash);
				this.sendMessage({
					command: 'openExternalUrl',
					error: result.url !== null ? await openExternalUrl(result.url, 'Commit Link') : result.error
				});
				break;
			}
			case 'viewCommitPatch':
				this.sendMessage({
					command: 'viewCommitPatch',
					error: await viewCommitPatch(msg.repo, msg.commitHash)
				});
				break;
			case 'browseFilesAtCommit':
				this.sendMessage({
					command: 'browseFilesAtCommit',
					error: await browseFilesAtCommit(msg.repo, msg.commitHash, this.dataSource)
				});
				break;
			case 'copyCommitPatch': {
				const result = await this.dataSource.getCommitPatch(msg.repo, msg.commitHash);
				this.sendMessage({
					command: 'copyToClipboard',
					type: 'Commit Patch',
					error: result.patch !== null ? await copyToClipboard(result.patch) : result.error
				});
				break;
			}
			case 'copyCommitSubjectsBetween': {
				const result = await this.dataSource.getCommitSubjectsBetween(msg.repo, msg.fromHash, msg.toHash);
				this.sendMessage({
					command: 'copyToClipboard',
					type: 'Commit Subjects',
					error: result.subjects !== null ? await copyToClipboard(result.subjects) : result.error
				});
				break;
			}
			case 'getMergeBase':
				this.sendMessage({
					command: 'getMergeBase',
					...await this.dataSource.getMergeBase(msg.repo, msg.commitHashes)
				});
				break;
			case 'getCommitMessage': {
				const message = await this.dataSource.getCommitMessage(msg.repo, msg.commitHash);
				this.sendMessage({
					command: 'getCommitMessage',
					commitHash: msg.commitHash,
					purpose: msg.purpose,
					message: message,
					error: message === null ? 'Unable to load the message of commit ' + msg.commitHash + '.' : null
				});
				break;
			}
			case 'copyToClipboard':
				this.sendMessage({
					command: 'copyToClipboard',
					type: msg.type,
					error: await copyToClipboard(msg.data)
				});
				break;
			case 'createArchive':
				this.sendMessage({
					command: 'createArchive',
					error: await archive(msg.repo, msg.ref, this.dataSource)
				});
				break;
			case 'savePatch':
				this.sendMessage({
					command: 'savePatch',
					error: await savePatch(msg.repo, msg.commitHashes, this.dataSource)
				});
				break;
			case 'applyPatch':
				this.sendMessage({
					command: 'applyPatch',
					error: await applyPatch(msg.repo, msg.mode, msg.threeWay, this.dataSource)
				});
				break;
			case 'createBranch':
				this.sendMessage({
					command: 'createBranch',
					errors: await this.dataSource.createBranch(msg.repo, msg.branchName, msg.commitHash, msg.checkout, msg.force)
				});
				break;
			case 'createPullRequest':
				errorInfos = [msg.push ? await this.dataSource.pushBranch(msg.repo, msg.sourceBranch, msg.sourceRemote, true, GitPushBranchMode.Normal, false) : null];
				if (errorInfos[0] === null) {
					errorInfos.push(await createPullRequest(msg.config, msg.sourceOwner, msg.sourceRepo, msg.sourceBranch));
				}
				this.sendMessage({
					command: 'createPullRequest',
					push: msg.push,
					errors: errorInfos
				});
				break;
			case 'deleteBranch':
				errorInfos = [await this.dataSource.deleteBranch(msg.repo, msg.branchName, msg.forceDelete)];
				if (errorInfos[0] === null) {
					for (let i = 0; i < msg.deleteOnRemotes.length; i++) {
						errorInfos.push(await this.dataSource.deleteRemoteBranch(msg.repo, msg.branchName, msg.deleteOnRemotes[i]));
					}
				}
				this.sendMessage({
					command: 'deleteBranch',
					repo: msg.repo,
					branchName: msg.branchName,
					deleteOnRemotes: msg.deleteOnRemotes,
					errors: errorInfos
				});
				break;
			case 'deleteBranches':
				errorInfos = [];
				for (const branchName of msg.branchNames) {
					const error = await this.dataSource.deleteBranch(msg.repo, branchName, msg.forceDelete);
					errorInfos.push(error !== null ? 'Branch "' + branchName + '": ' + error : null);
					if (error === null && Array.isArray(msg.deleteOnRemotes[branchName])) {
						for (const remote of msg.deleteOnRemotes[branchName]) {
							const remoteError = await this.dataSource.deleteRemoteBranch(msg.repo, branchName, remote);
							errorInfos.push(remoteError !== null ? 'Branch "' + remote + '/' + branchName + '": ' + remoteError : null);
						}
					}
				}
				this.sendMessage({
					command: 'deleteBranches',
					errors: errorInfos
				});
				break;
			case 'deleteRemote':
				this.sendMessage({
					command: 'deleteRemote',
					error: await this.dataSource.deleteRemote(msg.repo, msg.name)
				});
				break;
			case 'deleteRemoteBranch':
				this.sendMessage({
					command: 'deleteRemoteBranch',
					error: await this.dataSource.deleteRemoteBranch(msg.repo, msg.branchName, msg.remote)
				});
				break;
			case 'deleteTag':
				this.sendMessage({
					command: 'deleteTag',
					error: await this.dataSource.deleteTag(msg.repo, msg.tagName, msg.deleteOnRemote)
				});
				break;
			case 'deleteUserDetails':
				errorInfos = [];
				if (msg.name) {
					errorInfos.push(await this.dataSource.unsetConfigValue(msg.repo, GitConfigKey.UserName, msg.location));
				}
				if (msg.email) {
					errorInfos.push(await this.dataSource.unsetConfigValue(msg.repo, GitConfigKey.UserEmail, msg.location));
				}
				this.sendMessage({
					command: 'deleteUserDetails',
					errors: errorInfos
				});
				break;
			case 'dropCommit':
				this.sendMessage({
					command: 'dropCommit',
					error: await this.dataSource.dropCommit(msg.repo, msg.commitHash)
				});
				break;
			case 'dropCommits':
				this.sendMessage({
					command: 'dropCommits',
					error: await this.dataSource.dropCommits(msg.repo, msg.commits)
				});
				break;
			case 'dropStash':
				this.sendMessage({
					command: 'dropStash',
					error: await this.dataSource.dropStash(msg.repo, msg.selector)
				});
				break;
			case 'squashCommits':
				this.sendMessage({
					command: 'squashCommits',
					error: await this.dataSource.squashCommits(msg.repo, msg.commits, msg.commitMessage, msg.noVerify)
				});
				break;
			case 'editRemote':
				this.sendMessage({
					command: 'editRemote',
					error: await this.dataSource.editRemote(msg.repo, msg.nameOld, msg.nameNew, msg.urlOld, msg.urlNew, msg.pushUrlOld, msg.pushUrlNew)
				});
				break;
			case 'editUserDetails':
				errorInfos = [
					await this.dataSource.setConfigValue(msg.repo, GitConfigKey.UserName, msg.name, msg.location),
					await this.dataSource.setConfigValue(msg.repo, GitConfigKey.UserEmail, msg.email, msg.location)
				];
				if (errorInfos[0] === null && errorInfos[1] === null) {
					if (msg.deleteLocalName) {
						errorInfos.push(await this.dataSource.unsetConfigValue(msg.repo, GitConfigKey.UserName, GitConfigLocation.Local));
					}
					if (msg.deleteLocalEmail) {
						errorInfos.push(await this.dataSource.unsetConfigValue(msg.repo, GitConfigKey.UserEmail, GitConfigLocation.Local));
					}
				}
				this.sendMessage({
					command: 'editUserDetails',
					errors: errorInfos
				});
				break;
			case 'endCodeReview':
				this.extensionState.endCodeReview(msg.repo, msg.id);
				break;
			case 'exportRepoConfig':
				this.sendMessage({
					command: 'exportRepoConfig',
					error: await this.repoManager.exportRepoConfig(msg.repo)
				});
				break;
			case 'fetch':
				this.sendMessage({
					command: 'fetch',
					error: await this.dataSource.fetch(msg.repo, msg.name, msg.prune, msg.pruneTags, msg.noTags === true)
				});
				break;
			case 'fetchAvatar':
				this.avatarManager.fetchAvatarImage(msg.email, msg.repo, msg.remote, msg.commits);
				break;
			case 'fetchIntoLocalBranch':
				this.sendMessage({
					command: 'fetchIntoLocalBranch',
					error: await this.dataSource.fetchIntoLocalBranch(msg.repo, msg.remote, msg.remoteBranch, msg.localBranch, msg.force)
				});
				break;
			case 'loadCommits': {
				this.loadCommitsRefreshId = msg.refreshId;
				const loadCommitsStartedAt = (new Date()).getTime();
				const commitData = await this.dataSource.getCommits(msg.repo, msg.branches, msg.authors, msg.maxCommits, msg.showTags, msg.scope, msg.onlyFollowFirstParent, msg.commitOrdering, msg.remotes, msg.hideRemotes, msg.stashes, msg.simplifyByDecoration, msg.pathFilter, msg.messageFilter || null, msg.logFilter || {});
				this.logger.log('Loaded ' + (commitData && commitData.commits ? commitData.commits.length : 0) + ' commits in ' + ((new Date()).getTime() - loadCommitsStartedAt) + 'ms');
				this.sendMessage({
					command: 'loadCommits',
					refreshId: msg.refreshId,
					onlyFollowFirstParent: msg.onlyFollowFirstParent,
					codeReviews: Object.keys(this.extensionState.getCodeReviews()[msg.repo] || {}),
					...commitData
				});
				break;
			}
			case 'resolveCommit':
				this.sendMessage({
					command: 'resolveCommit',
					ref: msg.ref,
					hash: await this.dataSource.resolveCommit(msg.repo, msg.ref)
				});
				break;
			case 'loadConfig':
				this.sendMessage({
					command: 'loadConfig',
					repo: msg.repo,
					...await this.dataSource.getConfig(msg.repo, msg.remotes)
				});
				break;
			case 'loadRepoInfo':
				this.loadRepoInfoRefreshId = msg.refreshId;
				// The repository info is loaded when the view is refreshed (manually, after an action, or when the repository changed), the commits that
				// follow it find the dangling commits again
				this.dataSource.invalidateDanglingCommits(msg.repo);
				const loadRepoInfoStartedAt = (new Date()).getTime();
				let [repoInfo, worktrees] = await Promise.all([this.dataSource.getRepoInfo(msg.repo, msg.showRemoteBranches, msg.showStashes, msg.hideRemotes), this.dataSource.getWorktreeBranches(msg.repo)]), isRepo = true;
				this.logger.log('Loaded repository info in ' + ((new Date()).getTime() - loadRepoInfoStartedAt) + 'ms');
				if (repoInfo.error) {
					// If an error occurred, check to make sure the repo still exists
					isRepo = (await this.dataSource.repoRoot(msg.repo)) !== null;
					if (!isRepo) repoInfo.error = null; // If the error is caused by the repo no longer existing, clear the error message
				}
				this.sendMessage({
					command: 'loadRepoInfo',
					refreshId: msg.refreshId,
					...repoInfo,
					worktrees: worktrees,
					isRepo: isRepo
				});
				if (msg.repo !== this.currentRepo) {
					this.currentRepo = msg.repo;
					this.extensionState.setLastActiveRepo(msg.repo);
					this.repoFileWatcher.start(msg.repo);
					// Submodules and worktrees keep their Git directory outside of the repository, watch it too
					const watchedRepo = msg.repo;
					this.dataSource.getGitDirs(watchedRepo).then((gitDirs) => this.repoFileWatcher.watchGitDirs(watchedRepo, gitDirs), () => { });
					if (isRepo) this.fetchOnLoad(watchedRepo);
				}
				break;
			case 'loadRepos':
				if (!msg.check || !await this.repoManager.checkReposExist()) {
					// If not required to check repos, or no changes were found when checking, respond with repos
					this.respondLoadRepos(this.repoManager.getRepos(), null);
				}
				break;
			case 'merge':
				this.sendMessage({
					command: 'merge',
					actionOn: msg.actionOn,
					error: await this.dataSource.merge(msg.repo, msg.obj, msg.actionOn, msg.createNewCommit, msg.allowUnrelatedHistories, msg.squash, msg.noCommit, msg.noVerify)
				});
				break;
			case 'openExtensionSettings':
				this.sendMessage({
					command: 'openExtensionSettings',
					error: await openExtensionSettings()
				});
				break;
			case 'openExternalDirDiff':
				this.sendMessage({
					command: 'openExternalDirDiff',
					error: await this.dataSource.openExternalDirDiff(msg.repo, msg.fromHash, msg.toHash, msg.isGui)
				});
				break;
			case 'openExternalFileDiff':
				this.sendMessage({
					command: 'openExternalFileDiff',
					error: await this.dataSource.openExternalFileDiff(msg.repo, msg.fromHash, msg.toHash, msg.oldFilePath, msg.newFilePath, msg.isGui)
				});
				break;
			case 'openExternalUrl':
				this.sendMessage({
					command: 'openExternalUrl',
					error: await openExternalUrl(msg.url)
				});
				break;
			case 'openFile':
				this.sendMessage({
					command: 'openFile',
					error: await openFile(msg.repo, msg.filePath, msg.hash, this.dataSource)
				});
				break;
			case 'openTerminal':
				this.sendMessage({
					command: 'openTerminal',
					error: await this.dataSource.openGitTerminal(msg.repo, null, msg.name)
				});
				break;
			case 'navigateHistory':
				// Mouse back / forward buttons aren't handled by Visual Studio Code while the webview has focus
				vscode.commands.executeCommand(msg.forward ? 'workbench.action.navigateForward' : 'workbench.action.navigateBack').then(() => { }, () => { });
				break;
			case 'popStash':
				this.sendMessage({
					command: 'popStash',
					error: await this.dataSource.popStash(msg.repo, msg.selector, msg.reinstateIndex)
				});
				break;
			case 'pruneRemote':
				this.sendMessage({
					command: 'pruneRemote',
					error: await this.dataSource.pruneRemote(msg.repo, msg.name)
				});
				break;
			case 'pullBranch':
				this.sendMessage({
					command: 'pullBranch',
					error: await this.dataSource.pullBranch(msg.repo, msg.branchName, msg.remote, msg.createNewCommit, msg.squash, msg.noVerify)
				});
				break;
			case 'pushBranch':
				this.sendMessage({
					command: 'pushBranch',
					willUpdateBranchConfig: msg.willUpdateBranchConfig,
					errors: await this.dataSource.pushBranchToMultipleRemotes(msg.repo, msg.branchName, msg.remotes, msg.setUpstream, msg.mode, msg.noVerify)
				});
				break;
			case 'pushToCommit':
				this.sendMessage({
					command: 'pushToCommit',
					error: await this.dataSource.pushToCommit(msg.repo, msg.commitHash, msg.remote, msg.branchName, msg.noVerify, msg.force)
				});
				break;
			case 'pushStash':
				this.sendMessage({
					command: 'pushStash',
					error: await this.dataSource.pushStash(msg.repo, msg.message, msg.includeUntracked)
				});
				break;
			case 'pushTag':
				this.sendMessage({
					command: 'pushTag',
					repo: msg.repo,
					tagName: msg.tagName,
					remotes: msg.remotes,
					commitHash: msg.commitHash,
					force: msg.force === true,
					errors: await this.dataSource.pushTag(msg.repo, msg.tagName, msg.remotes, msg.commitHash, msg.skipRemoteCheck, msg.force === true)
				});
				break;
			case 'rebase':
				this.sendMessage({
					command: 'rebase',
					actionOn: msg.actionOn,
					interactive: msg.interactive,
					error: await this.dataSource.rebase(msg.repo, msg.obj, msg.actionOn, msg.ignoreDate, msg.interactive, msg.signoff, msg.updateRefs === true, msg.ignoreWhitespace === true, msg.autosquash === true)
				});
				break;
			case 'getRebaseTodoList': {
				const todoResult = await this.dataSource.getRebaseTodoList(msg.repo, msg.obj, msg.actionOn);
				this.sendMessage({
					command: 'getRebaseTodoList',
					items: todoResult.items,
					error: todoResult.error
				});
				break;
			}
			case 'rebaseInteractive':
				this.sendMessage({
					command: 'rebaseInteractive',
					error: await this.dataSource.rebaseInteractiveWithTodo(msg.repo, msg.obj, msg.actionOn, msg.entries, msg.signoff, msg.updateRefs === true)
				});
				break;
			case 'rebaseOnto':
				this.sendMessage({
					command: 'rebaseOnto',
					error: await this.dataSource.rebaseOnto(msg.repo, msg.newBase, msg.upstream)
				});
				break;
			case 'renameBranch':
				this.sendMessage({
					command: 'renameBranch',
					error: await this.dataSource.renameBranch(msg.repo, msg.oldName, msg.newName)
				});
				break;
			case 'rescanForRepos':
				if (!(await this.repoManager.searchWorkspaceForRepos())) {
					showErrorMessage(vscode.l10n.t('No Git repositories were found in the current workspace.'));
				}
				break;
			case 'resetFileToRevision':
				this.sendMessage({
					command: 'resetFileToRevision',
					error: await this.dataSource.resetFileToRevision(msg.repo, msg.commitHash, msg.filePath)
				});
				break;
			case 'resetToCommit':
				this.sendMessage({
					command: 'resetToCommit',
					error: await this.dataSource.resetToCommit(msg.repo, msg.commit, msg.resetMode)
				});
				break;
			case 'revertCommit':
				this.sendMessage({
					command: 'revertCommit',
					error: await this.dataSource.revertCommit(msg.repo, msg.commitHash, msg.parentIndex, msg.noCommit === true)
				});
				break;
			case 'undoLastCommit':
				this.sendMessage({
					command: 'undoLastCommit',
					error: await this.dataSource.undoLastCommit(msg.repo)
				});
				break;
			case 'editCommitMessage':
				this.sendMessage({
					command: 'editCommitMessage',
					error: await this.dataSource.editCommitMessage(msg.repo, msg.commitHash, msg.message, msg.noVerify)
				});
				break;
			case 'setGlobalViewState':
				this.sendMessage({
					command: 'setGlobalViewState',
					error: await this.extensionState.setGlobalViewState(msg.state)
				});
				break;
			case 'setRepoState':
				this.repoManager.setRepoState(msg.repo, msg.state);
				break;
			case 'setWorkspaceViewState':
				this.sendMessage({
					command: 'setWorkspaceViewState',
					error: await this.extensionState.setWorkspaceViewState(msg.state)
				});
				break;
			case 'showErrorMessage':
				showErrorMessage(msg.message);
				break;
			case 'startCodeReview':
				this.sendMessage({
					command: 'startCodeReview',
					commitHash: msg.commitHash,
					compareWithHash: msg.compareWithHash,
					...await this.extensionState.startCodeReview(msg.repo, msg.id, msg.files, msg.lastViewedFile)
				});
				break;
			case 'tagDetails':
				this.sendMessage({
					command: 'tagDetails',
					tagName: msg.tagName,
					commitHash: msg.commitHash,
					...await this.dataSource.getTagDetails(msg.repo, msg.tagName)
				});
				break;
			case 'updateCodeReview':
				this.sendMessage({
					command: 'updateCodeReview',
					error: await this.extensionState.updateCodeReview(msg.repo, msg.id, msg.remainingFiles, msg.lastViewedFile)
				});
				break;
			case 'viewAllChanges':
				this.sendMessage({
					command: 'viewAllChanges',
					error: await viewAllChanges(msg.repo, msg.fromHash, msg.toHash, msg.hasParents, this.dataSource, msg.uncommittedGroup, msg.stash)
				});
				break;
			case 'viewDiff':
				this.sendMessage({
					command: 'viewDiff',
					error: await viewDiff(msg.repo, msg.fromHash, msg.toHash, msg.oldFilePath, msg.newFilePath, msg.type, this.dataSource)
				});
				break;
			case 'viewDiffWithWorkingFile':
				this.sendMessage({
					command: 'viewDiffWithWorkingFile',
					error: await viewDiffWithWorkingFile(msg.repo, msg.hash, msg.filePath, this.dataSource)
				});
				break;
			case 'viewFileAtRevision':
				this.sendMessage({
					command: 'viewFileAtRevision',
					error: await viewFileAtRevision(msg.repo, msg.hash, msg.filePath)
				});
				break;
			case 'viewScm':
				this.sendMessage({
					command: 'viewScm',
					error: await viewScm()
				});
				break;
		}

		this.repoFileWatcher.unmute();
	}

	/**
	 * Send a message to the front-end.
	 * @param msg The message to be sent.
	 */
	protected sendMessage(msg: ResponseMessage) {
		if (this.isDisposed()) {
			this.logger.log('The Easy Graph View has already been disposed, ignored sending "' + msg.command + '" message.');
		} else if (this.attached !== null) {
			// Without an attached webview (e.g. the panel view was never opened, or its webview was closed while a request
			// was being handled) the message is dropped, the next attached webview loads its data from scratch.
			this.attached.webview.postMessage(msg).then(
				() => { },
				() => {
					if (this.isDisposed()) {
						this.logger.log('The Easy Graph View was disposed while sending "' + msg.command + '" message.');
					} else {
						this.logger.logError('Unable to send "' + msg.command + '" message to the Easy Graph View.');
					}
				}
			);
		}
	}

	/**
	 * Update the HTML document loaded in the Webview.
	 */
	protected update() {
		// Without an attached webview there is nothing to render, `attachWebview` renders the view when one is attached
		if (this.attached === null) return;
		this.attached.webview.html = this.getHtmlForWebview();
	}

	/**
	 * Get the HTML document to be loaded in the Webview.
	 * @returns The HTML.
	 */
	protected getHtmlForWebview() {
		const config = getConfig(), nonce = getNonce();
		const initialState: GitGraphViewInitialState = {
			config: {
				branchPrefix: config.branchPrefix,
				commitDetailsView: config.commitDetailsView,
				commitOrdering: config.commitOrder,
				contextMenuActionsVisibility: config.contextMenuActionsVisibility,
				customBranchGlobPatterns: config.customBranchGlobPatterns,
				customEmojiShortcodeMappings: config.customEmojiShortcodeMappings,
				customPullRequestProviders: config.customPullRequestProviders,
				dateFormat: config.dateFormat,
				customDateFormat: config.customDateFormat,
				defaultColumnVisibility: config.defaultColumnVisibility,
				stickyHeader: config.stickyHeader,
				dialogDefaults: config.dialogDefaults,
				enhancedAccessibility: config.enhancedAccessibility,
				fetchAvatars: config.fetchAvatars && this.extensionState.isAvatarStorageAvailable(),
				findMatchHighlightColour: config.findMatchHighlightColour,
				flashColour: config.flashColour,
				fontFamily: config.fontFamily,
				findWidgetSearchColumns: config.findWidgetSearchColumns,
				graph: config.graph,
				includeCommitsMentionedByReflogs: config.includeCommitsMentionedByReflogs,
				initialLoadCommits: config.initialLoadCommits,
				keybindings: config.keybindings,
				loadMoreCommits: config.loadMoreCommits,
				loadMoreCommitsAutomatically: config.loadMoreCommitsAutomatically,
				markdown: config.markdown,
				mute: config.muteCommits,
				onlyFollowFirstParent: config.onlyFollowFirstParent,
				onRepoLoad: config.onRepoLoad,
				referenceLabels: config.referenceLabels,
				repoDropdownOrder: config.repoDropdownOrder,
				singleAuthorSelect: config.singleAuthorSelect,
				singleBranchSelect: config.singleBranchSelect,
				showBranchColourOnRows: config.showBranchColourOnRows,
				showRemoteBranches: config.showRemoteBranches,
				simplifyByDecoration: config.simplifyByDecoration,
				showStashes: config.showStashes,
				showTags: config.showTags,
				toolbarButtonVisibility: config.toolbarButtonVisibility
			},
			lastActiveRepo: this.extensionState.getLastActiveRepo(),
			loadViewTo: this.loadViewTo,
			repos: this.repoManager.getRepos(),
			loadRepoInfoRefreshId: this.loadRepoInfoRefreshId,
			loadCommitsRefreshId: this.loadCommitsRefreshId,
			workspaceFolderPaths: getWorkspaceFolderRelativePaths(this.repoManager.getRepos())
		};
		const globalState = this.extensionState.getGlobalViewState();
		const workspaceState = this.extensionState.getWorkspaceViewState();

		let body, numRepos = Object.keys(initialState.repos).length, colorVars = '', colorParams = '';
		for (let i = 0; i < initialState.config.graph.colours.length; i++) {
			colorVars += '--git-graph-color' + i + ':' + initialState.config.graph.colours[i] + '; ';
			colorParams += '[data-color="' + i + '"]{--git-graph-color:var(--git-graph-color' + i + ');} ';
		}

		if (this.dataSource.isGitExecutableUnknown()) {
			body = `<body class="unableToLoad">
			<h2>Unable to load Easy Graph</h2>
			<p class="unableToLoadMessage">${UNABLE_TO_FIND_GIT_MSG}</p>
			</body>`;
		} else if (numRepos > 0) {
			const stickyClassAttr = initialState.config.stickyHeader ? ' class="sticky"' : '';
			const hideDisplay = config.toolbarButtonVisibility.display ? '' : 'style="display: none"';
			const hideScope = config.toolbarButtonVisibility.scope ? '' : 'style="display: none"';
			const hidePathFilter = config.toolbarButtonVisibility.pathFilter ? '' : 'style="display: none"';
			body = `<body data-vscode-context='{"preventDefaultContextMenuItems":true}'>
			<div id="view" tabindex="-1">
				<div id="controls"${stickyClassAttr}>
					<div id="filterControls">
						<span id="repoControl" class="filterControl"><span class="unselectable">Repo</span><div id="repoDropdown" class="dropdown"></div></span>
						<span id="branchControl" class="filterControl"><span class="unselectable">Branches</span><div id="branchDropdown" class="dropdown"></div></span>
						<span id="pathFilterControl" class="filterControl" ${hidePathFilter} title="Select path by context menu in file explorer"><span class="unselectable">Paths</span><div id="pathFilterDropdown" class="dropdown"></div></span>
						<span id="authorControl" class="filterControl"><span class="unselectable">Authors</span><div id="authorDropdown" class="dropdown"></div></span>
						<span id="messageFilterControl" title="Only show the commits whose message contains this text (searches the entire history, not just the loaded commits). Press Enter to apply."><input type="text" id="messageFilterInput" placeholder="Filter Messages" spellcheck="false"></span>
						<span id="displayControl" class="filterControl" ${hideDisplay} title="How the history is displayed: Simplify only shows the commits referenced by branches or tags, First Parent only follows the first parent of commits. All shows the complete history."><span class="unselectable">Display</span><div id="displayDropdown" class="dropdown"></div></span>
						<span id="scopeControl" class="filterControl" ${hideScope}><span class="unselectable">Scope</span><div id="scopeDropdown" class="dropdown"></div><span id="scopeInfo" class="filterInfo"></span></span>
					</div>
					<div id="toolbarBtns">
						<div id="currentBtn" title="Current"></div>
						<div id="findBtn" title="Find"></div>
						<div id="terminalBtn" title="Open a Terminal for this Repository"></div>
						<div id="settingsBtn" title="Repository Settings"></div>
						<div id="fetchBtn"></div>
						<div id="refreshBtn"></div>
					</div>
				</div>
				<div id="content">
					<div id="commitGraph"></div>
					<div id="commitTable"></div>
				</div>
				<div id="footer"></div>
			</div>
			<script nonce="${nonce}">var initialState = ${JSON.stringify(initialState)}, globalState = ${JSON.stringify(globalState)}, workspaceState = ${JSON.stringify(workspaceState)};</script>
			<script nonce="${nonce}" src="${this.getWebUri('out.min.js')}"></script>
			</body>`;
		} else {
			body = `<body class="unableToLoad">
			<h2>Unable to load Easy Graph</h2>
			<p class="unableToLoadMessage">No Git repositories were found in the current workspace when it was last scanned by Easy Graph.</p>
			<p>If your repositories are in subfolders of the open workspace folder(s), make sure you have set the Easy Graph Setting "easy-graph.maxDepthOfRepoSearch" appropriately (read the <a href="https://github.com/hansu/vscode-git-graph/wiki/Extension-Settings#max-depth-of-repo-search" target="_blank">documentation</a> for more information).</p>
			<p><div id="rescanForReposBtn" class="roundedBtn">Re-scan the current workspace for repositories</div></p>
			<script nonce="${nonce}">(function(){ var api = acquireVsCodeApi(); document.getElementById('rescanForReposBtn').addEventListener('click', function(){ api.postMessage({command: 'rescanForRepos'}); }); })();</script>
			</body>`;
		}
		this.isGraphViewLoaded = numRepos > 0;
		this.loadViewTo = null;

		return `<!DOCTYPE html>
		<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${standardiseCspSource(this.webview.cspSource)} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src data:;">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link rel="stylesheet" type="text/css" href="${this.getWebUri('out.min.css')}">
				<title>Easy Graph</title>
				<style>body{${colorVars}} ${colorParams}</style>
			</head>
			${body}
		</html>`;
	}

	/**
	 * Get a WebviewUri for a media file included in the extension.
	 * @param file The file name in the `media` directory.
	 * @returns The WebviewUri.
	 */
	protected getWebUri(file: string) {
		return this.webview.asWebviewUri(this.getUri('out', 'web', file));
	}

	/**
	 * Get a File Uri for a resource file included in the extension.
	 * @param file The file name in the `resource` directory.
	 * @returns The Uri.
	 */
	protected getResourcesUri(file: string) {
		return this.getUri('resources', file);
	}

	/**
	 * Get a File Uri for a file included in the extension.
	 * @param pathComps The path components relative to the root directory of the extension.
	 * @returns The File Uri.
	 */
	protected getUri(...pathComps: string[]) {
		return vscode.Uri.file(path.join(this.extensionPath, ...pathComps));
	}

	/**
	 * Send the known repositories to the front-end.
	 * @param repos The set of known repositories.
	 * @param loadViewTo What to load the view to.
	 */
	protected respondLoadRepos(repos: GitRepoSet, loadViewTo: LoadGitGraphViewTo) {
		this.sendMessage({
			command: 'loadRepos',
			repos: repos,
			lastActiveRepo: this.extensionState.getLastActiveRepo(),
			loadViewTo: loadViewTo,
			workspaceFolderPaths: getWorkspaceFolderRelativePaths(repos)
		});
	}
}

/**
 * Get the options of the webview of an Easy Graph View, which are the same in the editor and in the panel.
 * @param extensionPath The absolute file path of the directory containing the extension.
 * @returns The Webview options.
 */
export function createWebviewOptions(extensionPath: string): vscode.WebviewOptions {
	return {
		enableScripts: true,
		localResourceRoots: [vscode.Uri.file(path.join(extensionPath, 'out', 'web'))]
	};
}

/**
 * Compute workspace folder relative paths for each repository.
 * @param repos The set of known repositories.
 * @returns A mapping from repo path to an array of workspace folder relative paths within that repo.
 */
function getWorkspaceFolderRelativePaths(repos: GitRepoSet): { [repo: string]: string[] } {
	const result: { [repo: string]: string[] } = {};
	const wsFolders = vscode.workspace.workspaceFolders || [];
	const wsPaths = wsFolders.map((f) => getPathFromUri(f.uri));
	const repoPaths = Object.keys(repos);
	for (let i = 0; i < repoPaths.length; i++) {
		const repoPath = repoPaths[i];
		const repoPathWithSlash = pathWithTrailingSlash(repoPath);
		const paths: string[] = [];
		for (let j = 0; j < wsPaths.length; j++) {
			if (wsPaths[j] === repoPath) {
				// Workspace folder is the repo root — no filtering needed
				continue;
			}
			if (wsPaths[j].startsWith(repoPathWithSlash)) {
				paths.push(path.posix.relative(repoPath, wsPaths[j]));
			}
		}
		result[repoPath] = paths;
	}
	return result;
}

/**
 * Standardise the CSP Source provided by Visual Studio Code for use with the Webview. It is idempotent unless called with http/https URI's, in which case it keeps only the authority portion of the http/https URI. This is necessary to be compatible with some web browser environments.
 * @param cspSource The value provide by Visual Studio Code.
 * @returns The standardised CSP Source.
 */
export function standardiseCspSource(cspSource: string) {
	if (cspSource.startsWith('http://') || cspSource.startsWith('https://')) {
		const pathIndex = cspSource.indexOf('/', 8), queryIndex = cspSource.indexOf('?', 8), fragmentIndex = cspSource.indexOf('#', 8);
		let endOfAuthorityIndex = pathIndex;
		if (queryIndex > -1 && (queryIndex < endOfAuthorityIndex || endOfAuthorityIndex === -1)) endOfAuthorityIndex = queryIndex;
		if (fragmentIndex > -1 && (fragmentIndex < endOfAuthorityIndex || endOfAuthorityIndex === -1)) endOfAuthorityIndex = fragmentIndex;
		return endOfAuthorityIndex > -1 ? cspSource.substring(0, endOfAuthorityIndex) : cspSource;
	} else {
		return cspSource;
	}
}
