import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getConfig } from './config';
import { DataSource } from './dataSource';
import { DiffDocProvider, DiffSide, decodeDiffDocUri, encodeDiffDocUri, encodePatchDocUri } from './diffDocProvider';
import { ExtensionState } from './extensionState';
import { ApplyPatchMode, ErrorInfo, GitCommitStash, GitFileChange, GitFileStatus, GitRepoSet, PullRequestConfig, PullRequestProvider, RepoDropdownOrder, UncommittedGroup } from './types';

export const UNCOMMITTED = '*';
// The revision of the index (staging area), as used by "git show :<path>"
export const INDEX = '';
export const UNABLE_TO_FIND_GIT_MSG = 'Unable to find a Git executable. Either: Set the Visual Studio Code Setting "git.path" to the path and filename of an existing Git executable, or install Git and restart Visual Studio Code.';


/* Path Manipulation */

const FS_REGEX = /\\/g;

/**
 * Get the normalised path of a URI.
 * @param uri The URI.
 * @returns The normalised path.
 */
export function getPathFromUri(uri: vscode.Uri) {
	return uri.fsPath.replace(FS_REGEX, '/');
}

/**
 * Get the normalised path of a string.
 * @param str The string.
 * @returns The normalised path.
 */
export function getPathFromStr(str: string) {
	return str.replace(FS_REGEX, '/');
}

/**
 * Get the path with a trailing slash.
 * @param path The path.
 * @returns The path with a trailing slash.
 */
export function pathWithTrailingSlash(path: string) {
	return path.endsWith('/') ? path : path + '/';
}

/**
 * Check whether a path is within the current Visual Studio Code Workspace.
 * @param path The path to check.
 * @returns TRUE => Path is in workspace, FALSE => Path isn't in workspace.
 */
export function isPathInWorkspace(path: string) {
	let rootsExact = [], rootsFolder = [], workspaceFolders = vscode.workspace.workspaceFolders;
	if (typeof workspaceFolders !== 'undefined') {
		for (let i = 0; i < workspaceFolders.length; i++) {
			let tmpPath = getPathFromUri(workspaceFolders[i].uri);
			rootsExact.push(tmpPath);
			rootsFolder.push(pathWithTrailingSlash(tmpPath));
		}
	}
	return rootsExact.indexOf(path) > -1 || rootsFolder.findIndex(x => path.startsWith(x)) > -1;
}

/**
 * Get the normalised canonical absolute path (i.e. resolves symlinks in `path`).
 * @param path The path.
 * @param native Use the native realpath.
 * @returns The normalised canonical absolute path.
 */
export function realpath(path: string, native: boolean = false) {
	return new Promise<string>((resolve) => {
		(native ? fs.realpath.native : fs.realpath)(path, (err, resolvedPath) => resolve(err !== null ? path : getPathFromUri(vscode.Uri.file(resolvedPath))));
	});
}

/**
 * Transform the path from a canonical absolute path to use symbolic links if the containing Visual Studio Code workspace folder has symbolic link(s).
 * @param path The canonical absolute path.
 * @returns The transformed path.
 */
export async function resolveToSymbolicPath(path: string) {
	let workspaceFolders = vscode.workspace.workspaceFolders;
	if (typeof workspaceFolders !== 'undefined') {
		for (let i = 0; i < workspaceFolders.length; i++) {
			let rootSymPath = getPathFromUri(workspaceFolders[i].uri);
			let rootCanonicalPath = await realpath(rootSymPath);
			if (path === rootCanonicalPath) {
				return rootSymPath;
			} else if (path.startsWith(rootCanonicalPath + '/')) {
				return rootSymPath + path.substring(rootCanonicalPath.length);
			} else if (rootCanonicalPath.startsWith(path + '/')) {
				let symPath = rootSymPath;
				let first = symPath.indexOf('/');
				while (true) {
					if (path === symPath || path === await realpath(symPath)) return symPath;
					let next = symPath.lastIndexOf('/');
					if (first !== next && next > -1) {
						symPath = symPath.substring(0, next);
					} else {
						return path;
					}
				}
			}
		}
	}
	return path;
}

/**
 * Checks whether a file exists, and the user has access to read it.
 * @param path The path of the file.
 * @returns Promise resolving to a boolean: TRUE => File exists, FALSE => File doesn't exist.
 */
export function doesFileExist(path: string) {
	return new Promise<boolean>((resolve) => {
		fs.access(path, fs.constants.R_OK, (err) => resolve(err === null));
	});
}


/* General Methods */

/**
 * The length of abbreviated commit hashes when `core.abbrev` isn't known (Git's minimum when it's computed automatically).
 */
export const DEFAULT_ABBREV_LENGTH = 7;

/**
 * Abbreviate a commit hash in messages of the extension, to `core.abbrev` when it's overridden in the `easy-graph.builtin` Extension
 * Setting (the Easy Graph View uses the effective `core.abbrev` of each repository).
 * @param commitHash The full commit hash.
 * @returns The abbreviated commit hash.
 */
export function abbrevCommit(commitHash: string) {
	return commitHash.substring(0, getConfig().builtin['core.abbrev'] ?? DEFAULT_ABBREV_LENGTH);
}

/**
 * Abbreviate a string to the specified number of characters.
 * @param text The string to abbreviate.
 * @param toChars The number of characters to abbreviate the string to.
 * @returns The abbreviated string.
 */
export function abbrevText(text: string, toChars: number) {
	return text.length <= toChars ? text : text.substring(0, toChars - 1) + '...';
}

/**
 * Get the relative time difference between the current time and a Unix timestamp.
 * @param unixTimestamp The Unix timestamp.
 * @returns The relative time difference (e.g. 12 minutes ago).
 */
export function getRelativeTimeDiff(unixTimestamp: number) {
	let diff = Math.round((new Date()).getTime() / 1000) - unixTimestamp, unit;
	if (diff < 60) {
		unit = 'second';
	} else if (diff < 3600) {
		unit = 'minute';
		diff /= 60;
	} else if (diff < 86400) {
		unit = 'hour';
		diff /= 3600;
	} else if (diff < 604800) {
		unit = 'day';
		diff /= 86400;
	} else if (diff < 2629800) {
		unit = 'week';
		diff /= 604800;
	} else if (diff < 31557600) {
		unit = 'month';
		diff /= 2629800;
	} else {
		unit = 'year';
		diff /= 31557600;
	}
	diff = Math.round(diff);
	return diff + ' ' + unit + (diff !== 1 ? 's' : '') + ' ago';
}

/**
 * Gets the version of Git Graph.
 * @param extensionContext The extension context of Git Graph.
 * @returns The Git Graph version.
 */
export function getExtensionVersion(extensionContext: vscode.ExtensionContext) {
	return new Promise<string>((resolve, reject) => {
		fs.readFile(path.join(extensionContext.extensionPath, 'package.json'), (err, data) => {
			if (err) {
				reject();
			} else {
				try {
					resolve(JSON.parse(data.toString()).version);
				} catch {
					reject();
				}
			}
		});
	});
}

/**
 * Randomly generate a nonce.
 * @returns The nonce.
 */
export function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

/**
 * Get a short name for a repository.
 * @param path The path of the repository.
 * @returns The short name.
 */
export function getRepoName(path: string) {
	const firstSep = path.indexOf('/');
	if (firstSep === path.length - 1 || firstSep === -1) {
		return path; // Path has no slashes, or a single trailing slash ==> use the path
	} else {
		const p = path.endsWith('/') ? path.substring(0, path.length - 1) : path; // Remove trailing slash if it exists
		return p.substring(p.lastIndexOf('/') + 1);
	}
}

/**
 * Get a sorted list of repository paths from a given GitRepoSet.
 * @param repos The set of repositories.
 * @param order The order to sort the repositories.
 * @returns An array of ordered repository paths.
 */
export function getSortedRepositoryPaths(repos: GitRepoSet, order: RepoDropdownOrder): ReadonlyArray<string> {
	const repoPaths = Object.keys(repos);
	if (order === RepoDropdownOrder.WorkspaceFullPath) {
		return repoPaths.sort((a, b) => repos[a].workspaceFolderIndex === repos[b].workspaceFolderIndex
			? a.localeCompare(b)
			: repos[a].workspaceFolderIndex === null
				? 1
				: repos[b].workspaceFolderIndex === null
					? -1
					: repos[a].workspaceFolderIndex! - repos[b].workspaceFolderIndex!
		);
	} else if (order === RepoDropdownOrder.FullPath) {
		return repoPaths.sort((a, b) => a.localeCompare(b));
	} else {
		return repoPaths.map((path) => ({ name: repos[path].name || getRepoName(path), path: path }))
			.sort((a, b) => a.name !== b.name ? a.name.localeCompare(b.name) : a.path.localeCompare(b.path))
			.map((x) => x.path);
	}
}


/* Visual Studio Code Command Wrappers */

/**
 * Create an archive of a repository at a specific reference, and save to disk.
 * @param repo The path of the repository.
 * @param ref The reference of the revision to archive.
 * @param dataSource The DataSource instance that can be used to create the archive.
 * @returns A promise resolving to the ErrorInfo of the executed command.
 */
export function archive(repo: string, ref: string, dataSource: DataSource): Thenable<ErrorInfo> {
	return vscode.window.showSaveDialog({
		defaultUri: vscode.Uri.file(repo),
		saveLabel: 'Create Archive',
		filters: { 'TAR Archive': ['tar'], 'ZIP Archive': ['zip'] }
	}).then(
		(uri) => {
			if (uri) {
				const extension = uri.fsPath.substring(uri.fsPath.lastIndexOf('.') + 1).toLowerCase();
				if (extension === 'tar' || extension === 'zip') {
					return dataSource.archive(repo, ref, uri.fsPath, extension);
				} else {
					return 'Invalid file extension "*.' + extension + '". The archive file must have a *.tar or *.zip extension.';
				}
			} else {
				return 'No file name was provided for the archive.';
			}
		},
		() => 'Visual Studio Code was unable to display the save dialog.'
	);
}

/**
 * Save the patches of one or more commits to a file chosen by the user.
 * @param repo The repository containing the commits.
 * @param commitHashes The commit hashes, ordered newest to oldest.
 * @param dataSource The DataSource instance.
 * @returns A promise resolving to the ErrorInfo of the executed command.
 */
export function savePatch(repo: string, commitHashes: ReadonlyArray<string>, dataSource: DataSource): Thenable<ErrorInfo> {
	const fileName = commitHashes.length === 1 ? abbrevCommit(commitHashes[0]) + '.patch' : abbrevCommit(commitHashes[commitHashes.length - 1]) + '-' + abbrevCommit(commitHashes[0]) + '.patch';
	return vscode.window.showSaveDialog({
		defaultUri: vscode.Uri.file(path.join(repo, fileName)),
		saveLabel: 'Save Patch',
		filters: { 'Patch': ['patch', 'diff'] }
	}).then(
		(uri) => uri ? dataSource.savePatch(repo, commitHashes, uri.fsPath) : null,
		() => 'Visual Studio Code was unable to display the save dialog.'
	);
}

/**
 * Apply a patch file chosen by the user to a repository.
 * @param repo The repository.
 * @param mode How the patch is applied.
 * @param threeWay Fall back to a 3-way merge if the patch doesn't apply cleanly.
 * @param dataSource The DataSource instance.
 * @returns A promise resolving to the ErrorInfo of the executed command.
 */
export function applyPatch(repo: string, mode: ApplyPatchMode, threeWay: boolean, dataSource: DataSource): Thenable<ErrorInfo> {
	return vscode.window.showOpenDialog({
		defaultUri: vscode.Uri.file(repo),
		openLabel: 'Apply Patch',
		canSelectFiles: true,
		canSelectFolders: false,
		canSelectMany: false,
		filters: { 'Patch': ['patch', 'diff', 'eml', 'mbox'], 'All Files': ['*'] }
	}).then(
		(uris) => uris && uris.length > 0 ? dataSource.applyPatch(repo, uris[0].fsPath, mode, threeWay) : null,
		() => 'Visual Studio Code was unable to display the open dialog.'
	);
}


/**
 * Copy the path of a file in a repository to the clipboard.
 * @param repo The repository the file is contained in.
 * @param filePath The relative path of the file within the repository.
 * @param absolute TRUE => Absolute path, FALSE => Relative path.
 * @returns A promise resolving to the ErrorInfo of the executed command.
 */
export function copyFilePathToClipboard(repo: string, filePath: string, absolute: boolean) {
	return copyToClipboard(absolute ? path.join(repo, filePath) : filePath);
}

/**
 * Copy a string to the clipboard.
 * @param text The string.
 * @returns A promise resolving to the ErrorInfo of the executed command.
 */
export function copyToClipboard(text: string): Thenable<ErrorInfo> {
	return vscode.env.clipboard.writeText(text).then(
		() => null,
		() => 'Visual Studio Code was unable to write to the Clipboard.'
	);
}

/**
 * Construct the web URL of a commit from the URL of a remote (supports GitHub, GitLab, Bitbucket, Azure DevOps and
 * other hosts that use the GitHub style "/commit/<hash>" path).
 * @param remoteUrl The URL of the remote (https, ssh or scp-like syntax).
 * @param commitHash The commit hash.
 * @returns The URL, or NULL if the remote URL couldn't be parsed.
 */
export function getCommitWebUrl(remoteUrl: string, commitHash: string): string | null {
	let host: string, repoPath: string, match: RegExpMatchArray | null;
	if ((match = remoteUrl.match(/^(?:https?|ssh|git):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/)) !== null) {
		host = match[1];
		repoPath = match[2];
	} else if ((match = remoteUrl.match(/^(?:[^@/]+@)?([^/:]+):(.+)$/)) !== null) {
		host = match[1];
		repoPath = match[2];
	} else {
		return null;
	}
	repoPath = repoPath.replace(/\/+$/, '').replace(/\.git$/, '').replace(/^\/+/, '');
	if (repoPath === '') return null;

	if (host === 'ssh.dev.azure.com' || host.endsWith('.visualstudio.com') && repoPath.startsWith('v3/')) {
		// Azure DevOps SSH: v3/<organization>/<project>/<repository>
		const parts = repoPath.replace(/^v3\//, '').split('/');
		if (parts.length !== 3) return null;
		return 'https://dev.azure.com/' + parts[0] + '/' + parts[1] + '/_git/' + parts[2] + '/commit/' + commitHash;
	}
	if (host.startsWith('ssh.')) host = host.substring(4);
	const commitPath = host.includes('bitbucket') ? '/commits/' : host.includes('gitlab') ? '/-/commit/' : '/commit/';
	return 'https://' + host + '/' + repoPath + commitPath + commitHash;
}

/**
 * Construct the URL for creating a new Pull Request, and open it in the users default web browser.
 * @param config The Pull Request Provider's Configuration.
 * @param sourceOwner The owner of the repository that is the source of the Pull Request.
 * @param sourceRepo The name of the repository that is the source of the Pull Request.
 * @param sourceBranch The source branch the Pull Request should be created from.
 * @returns A promise resolving to the ErrorInfo of the executed command.
 */
export function createPullRequest(config: PullRequestConfig, sourceOwner: string, sourceRepo: string, sourceBranch: string) {
	let templateUrl;
	switch (config.provider) {
		case PullRequestProvider.Bitbucket:
			templateUrl = '$1/$2/$3/pull-requests/new?source=$2/$3::$4&dest=$5/$6::$8';
			break;
		case PullRequestProvider.Custom:
			templateUrl = config.custom.templateUrl;
			break;
		case PullRequestProvider.GitHub:
			templateUrl = '$1/$5/$6/compare/$8...$2:$4';
			break;
		case PullRequestProvider.GitLab:
			templateUrl = '$1/$2/$3/-/merge_requests/new?merge_request[source_branch]=$4&merge_request[target_branch]=$8' +
				(config.destProjectId !== '' ? '&merge_request[target_project_id]=$7' : '');
			break;
	}

	const urlFieldValues = [
		config.hostRootUrl,
		sourceOwner, sourceRepo, sourceBranch,
		config.destOwner, config.destRepo, config.destProjectId, config.destBranch
	];

	const url = templateUrl.replace(/\$([1-8])/g, (_, index) => urlFieldValues[parseInt(index) - 1]);

	return openExternalUrl(url, 'Pull Request URL');
}

/**
 * Open the Visual Studio Code Settings Editor to the Git Graph Extension Settings.
 * @returns A promise resolving to the ErrorInfo of the executed command.
 */
export function openExtensionSettings(): Thenable<ErrorInfo> {
	return vscode.commands.executeCommand('workbench.action.openSettings', '@ext:heavensky.easy-graph').then(
		() => null,
		() => 'Visual Studio Code was unable to open the Easy Graph Extension Settings.'
	);
}

/**
 * Open an External URL using the default application.
 * @param url The URL for Visual Studio Code to open.
 * @param type The type of URL being opened (defaults to "External URL").
 * @returns A promise resolving to the ErrorInfo of the executed command.
 */
export function openExternalUrl(url: string, type: string = 'External URL'): Thenable<ErrorInfo> {
	const getErrorMessage = () => 'Visual Studio Code was unable to open the ' + type + ': ' + url;
	try {
		return vscode.env.openExternal(vscode.Uri.parse(url)).then(
			(success) => success ? null : getErrorMessage(),
			getErrorMessage
		);
	} catch {
		return Promise.resolve(getErrorMessage());
	}
}

/**
 * Open a file within a repository in Visual Studio Code.
 * @param repo The repository the file is contained in.
 * @param filePath The relative path of the file within the repository.
 * @param hash An optional commit hash where the file is known to have existed.
 * @param dataSource An optional DataSource instance, that's used to check if the file has been renamed.
 * @param viewColumn An optional ViewColumn that the file should be opened in.
 * @returns A promise resolving to the ErrorInfo of the executed command.
 */
export async function openFile(repo: string, filePath: string, hash: string | null = null, dataSource: DataSource | null = null, viewColumn: vscode.ViewColumn | null = null) {
	let newFilePath = filePath;
	let newAbsoluteFilePath = path.join(repo, newFilePath);
	let fileExists = await doesFileExist(newAbsoluteFilePath);
	if (!fileExists && hash !== null && dataSource !== null) {
		const renamedFilePath = await dataSource.getNewPathOfRenamedFile(repo, hash, filePath);
		if (renamedFilePath !== null) {
			const renamedAbsoluteFilePath = path.join(repo, renamedFilePath);
			if (await doesFileExist(renamedAbsoluteFilePath)) {
				newFilePath = renamedFilePath;
				newAbsoluteFilePath = renamedAbsoluteFilePath;
				fileExists = true;
			}
		}
	}

	if (fileExists) {
		return vscode.commands.executeCommand('vscode.open', vscode.Uri.file(newAbsoluteFilePath), {
			preview: true,
			viewColumn: viewColumn === null ? getConfig().openNewTabEditorGroup : viewColumn
		}).then(
			() => null,
			() => 'Visual Studio Code was unable to open ' + newFilePath + '.'
		);
	} else {
		return 'The file ' + newFilePath + ' doesn\'t currently exist in this repository.';
	}
}

/**
 * Open the Visual Studio Code Diff View for a specific Git file change.
 * @param repo The repository the file is contained in.
 * @param fromHash The revision of the left-side of the Diff View.
 * @param toHash The revision of the right-side of the Diff View.
 * @param oldFilePath The relative path of the left-side file within the repository.
 * @param newFilePath The relative path of the right-side file within the repository.
 * @param type The Git file status of the change.
 * @param dataSource An optional DataSource instance, that's used to open the revisions with the `git` scheme of the Visual Studio Code Git Extension (so that its features, e.g. blame, work in the Diff View).
 * @returns A promise resolving to the ErrorInfo of the executed command.
 */
export async function viewDiff(repo: string, fromHash: string, toHash: string, oldFilePath: string, newFilePath: string, type: GitFileStatus, dataSource: DataSource | null = null): Promise<ErrorInfo> {
	if (type !== GitFileStatus.Untracked) {
		let abbrevFromHash = fromHash === INDEX ? 'Index' : abbrevCommit(fromHash), abbrevToHash = toHash === UNCOMMITTED ? 'Present' : toHash === INDEX ? 'Index' : abbrevCommit(toHash), pathComponents = newFilePath.split('/');
		let desc = fromHash === toHash
			? fromHash === UNCOMMITTED
				? 'Uncommitted'
				: (type === GitFileStatus.Added ? 'Added in ' + abbrevToHash : type === GitFileStatus.Deleted ? 'Deleted in ' + abbrevToHash : abbrevFromHash + '^ ↔ ' + abbrevToHash)
			: (type === GitFileStatus.Added ? 'Added between ' + abbrevFromHash + ' & ' + abbrevToHash : type === GitFileStatus.Deleted ? 'Deleted between ' + abbrevFromHash + ' & ' + abbrevToHash : abbrevFromHash + ' ↔ ' + abbrevToHash);
		let title = pathComponents[pathComponents.length - 1] + ' (' + desc + ')';

		const { oldUri, newUri } = await getDiffUris(repo, fromHash, toHash, oldFilePath, newFilePath, type, dataSource);
		return vscode.commands.executeCommand('vscode.diff', oldUri, newUri, title, {
			preview: true,
			viewColumn: getConfig().openNewTabEditorGroup
		}).then(
			() => null,
			() => 'Visual Studio Code was unable to load the diff editor for ' + newFilePath + '.'
		);
	} else {
		return openFile(repo, newFilePath);
	}
}

/**
 * Get the URIs of both sides of the Diff View for a specific Git file change.
 * @param repo The repository the file is contained in.
 * @param fromHash The revision of the left-side of the Diff View (equal to `toHash` for the changes of a single commit, compared with its first parent).
 * @param toHash The revision of the right-side of the Diff View.
 * @param oldFilePath The relative path of the left-side file within the repository.
 * @param newFilePath The relative path of the right-side file within the repository.
 * @param type The Git file status of the change.
 * @param dataSource A DataSource instance (to resolve revisions to commit hashes), or NULL to always use the DiffDocProvider.
 * @returns The URIs of the left-side and right-side.
 */
async function getDiffUris(repo: string, fromHash: string, toHash: string, oldFilePath: string, newFilePath: string, type: GitFileStatus, dataSource: Pick<DataSource, 'resolveCommit'> | null) {
	if (fromHash === UNCOMMITTED) fromHash = 'HEAD';
	const oldUri = await getDiffUri(repo, oldFilePath, fromHash === toHash ? fromHash + '~1' : fromHash, type, DiffSide.Old, dataSource);
	const newUri = await getDiffUri(repo, newFilePath, toHash, type, DiffSide.New, dataSource);
	return { oldUri, newUri };
}

/**
 * Open the Visual Studio Code Multi Diff Editor (the `vscode.changes` command), to display the changes of all files of a single commit,
 * of a stash, of the uncommitted changes (all of them, or only the staged or unstaged changes), or between two commits, in one editor.
 * @param repo The repository.
 * @param fromHash The revision the changes are from (equal to `toHash` for a single commit, a stash, or the uncommitted changes).
 * @param toHash The revision the changes are to (`UNCOMMITTED` for the working tree).
 * @param hasParents Does the single commit have parents (a root commit is compared with the empty tree).
 * @param dataSource A DataSource instance, that's used to get the file changes, and to open the revisions with the `git` scheme.
 * @param uncommittedGroup The group of uncommitted changes to view (only used for the uncommitted changes).
 * @param stash The stash, if the single commit is a stash (its changes are from its base commit, and include its untracked files).
 * @returns A promise resolving to the ErrorInfo of the executed command.
 */
export async function viewAllChanges(repo: string, fromHash: string, toHash: string, hasParents: boolean, dataSource: DataSource, uncommittedGroup: UncommittedGroup = 'all', stash: GitCommitStash | null = null): Promise<ErrorInfo> {
	// The revisions of each file are the same as when its diff is viewed from the Commit Details View
	let fileChanges: ReadonlyArray<{ file: GitFileChange, fromHash: string, toHash: string }>, title: string;
	if (fromHash === toHash && toHash === UNCOMMITTED) {
		const result = await dataSource.getUncommittedDetails(repo, uncommittedGroup);
		if (result.commitDetails === null) return result.error;
		// Staged changes are from HEAD to the index, unstaged changes (including the untracked files) are from the index to the working tree
		const revs = uncommittedGroup === 'staged' ? ['HEAD', INDEX] : uncommittedGroup === 'unstaged' ? [INDEX, UNCOMMITTED] : [UNCOMMITTED, UNCOMMITTED];
		fileChanges = result.commitDetails.fileChanges.map((file) => ({ file: file, fromHash: revs[0], toHash: revs[1] }));
		title = uncommittedGroup === 'staged' ? 'Staged Changes' : uncommittedGroup === 'unstaged' ? 'Unstaged Changes' : 'Uncommitted Changes';
	} else if (fromHash === toHash && stash !== null) {
		const [result, subject] = await Promise.all([
			dataSource.getStashDetails(repo, toHash, stash),
			dataSource.getCommitSubject(repo, toHash)
		]);
		if (result.commitDetails === null) return result.error;
		// The untracked files are added by the third parent of the stash, the other changes are from its base commit
		fileChanges = result.commitDetails.fileChanges.map((file) => file.type === GitFileStatus.Untracked && stash.untrackedFilesHash !== null
			? { file: file, fromHash: stash.untrackedFilesHash, toHash: stash.untrackedFilesHash }
			: { file: file, fromHash: stash.baseHash, toHash: toHash });
		// A dropped stash (found by the Dangling scope) isn't in the stash list, its selector is its hash
		title = (stash.selector.startsWith('refs/') ? stash.selector.substring(5) : 'dropped stash ' + abbrevCommit(toHash)) + (subject ? ': ' + subject : '');
	} else if (fromHash === toHash) {
		// The diff from the first parent ('~1' rather than '^', see DataSource.getCommitDetails), or of a root commit from the empty tree
		const [result, subject] = await Promise.all([
			dataSource.getCommitComparison(repo, hasParents ? fromHash + '~1' : fromHash, toHash),
			dataSource.getCommitSubject(repo, toHash)
		]);
		if (result.error !== null) return result.error;
		fileChanges = result.fileChanges.map((file) => ({ file: file, fromHash: fromHash, toHash: toHash }));
		title = abbrevCommit(toHash) + (subject ? ': ' + subject : '');
	} else {
		const result = await dataSource.getCommitComparison(repo, fromHash, toHash);
		if (result.error !== null) return result.error;
		fileChanges = result.fileChanges.map((file) => ({ file: file, fromHash: fromHash, toHash: toHash }));
		title = abbrevCommit(fromHash) + ' ↔ ' + (toHash === UNCOMMITTED ? 'Present' : abbrevCommit(toHash));
	}
	if (fileChanges.length === 0) return 'There are no file changes to view.';

	// Each revision only needs to be resolved to a commit hash once, rather than for every file
	const resolvedCommits = new Map<string, Promise<string | null>>();
	const resolver: Pick<DataSource, 'resolveCommit'> = {
		resolveCommit: (repo, rev) => {
			let hash = resolvedCommits.get(rev);
			if (typeof hash === 'undefined') {
				hash = dataSource.resolveCommit(repo, rev);
				resolvedCommits.set(rev, hash);
			}
			return hash;
		}
	};

	const resources = await Promise.all(fileChanges.map(async ({ file, fromHash, toHash }) => {
		// An untracked file is displayed like an added file (an empty document on the left-side)
		const type = file.type === GitFileStatus.Untracked ? GitFileStatus.Added : file.type;
		const { oldUri, newUri } = await getDiffUris(repo, fromHash, toHash, file.oldFilePath, file.newFilePath, type, resolver);
		return [vscode.Uri.file(path.join(repo, type === GitFileStatus.Deleted ? file.oldFilePath : file.newFilePath)), oldUri, newUri];
	}));

	return vscode.commands.executeCommand('vscode.changes', title, resources).then(
		() => null,
		(error) => 'Visual Studio Code was unable to open the changes editor (the "vscode.changes" command): ' + (error instanceof Error ? error.message : String(error))
	);
}

/**
 * Get the URI of one side of the Diff View. When possible, a `git` scheme URI of the Visual Studio Code Git Extension is used, so that its
 * features (e.g. blame decorations) work in the Diff View. Otherwise (e.g. the file doesn't exist on this side, the Git
 * Extension is disabled, or it doesn't know the repository), the URI provided by Easy Graph's DiffDocProvider is used.
 * @param repo The repository the file is contained in.
 * @param filePath The relative path of the file within the repository.
 * @param rev The revision of the file (e.g. a commit hash, `hash^` or `HEAD`).
 * @param type The Git file status of the change.
 * @param diffSide The side of the Diff View.
 * @param dataSource A DataSource instance (to resolve `rev` to a commit hash), or NULL to always use the DiffDocProvider.
 * @returns The URI.
 */
async function getDiffUri(repo: string, filePath: string, rev: string, type: GitFileStatus, diffSide: DiffSide, dataSource: Pick<DataSource, 'resolveCommit'> | null): Promise<vscode.Uri> {
	const uri = encodeDiffDocUri(repo, filePath, rev, type, diffSide);
	if (dataSource === null || uri.scheme !== DiffDocProvider.scheme || !decodeDiffDocUri(uri).exists) return uri;

	try {
		const gitApi = getVsCodeGitApi();
		if (gitApi === null) return uri;
		const fileUri = vscode.Uri.file(path.join(repo, filePath));
		// The Git Extension must know the repository itself (not only a parent repository containing it)
		const gitRepo = gitApi.getRepository(fileUri);
		if (!gitRepo || pathWithTrailingSlash(getPathFromUri(gitRepo.rootUri)) !== pathWithTrailingSlash(repo)) return uri;
		// The Git Extension refreshes its index documents when the index changes, unlike the cached Easy Graph documents
		if (rev === INDEX) return gitApi.toGitUri(fileUri, '');
		// The Git Extension only accepts a full commit hash (abbreviated hashes and revisions like "hash^" are rejected)
		const hash = await dataSource.resolveCommit(repo, rev);
		return hash !== null ? gitApi.toGitUri(fileUri, hash) : uri;
	} catch {
		return uri;
	}
}

/**
 * Get the API of the Visual Studio Code Git Extension, if it is enabled and activated.
 * @returns The API, or NULL if it isn't available.
 */
export function getVsCodeGitApi(): { getRepository(uri: vscode.Uri): { rootUri: vscode.Uri } | null, toGitUri(uri: vscode.Uri, ref: string): vscode.Uri } | null {
	if (vscode.workspace.getConfiguration('git').get<boolean>('enabled', true) === false || typeof vscode.extensions === 'undefined') return null;
	const extension = vscode.extensions.getExtension('vscode.git');
	if (!extension || !extension.isActive || !extension.exports || typeof extension.exports.getAPI !== 'function') return null;
	const api = extension.exports.getAPI(1);
	return api && typeof api.toGitUri === 'function' && typeof api.getRepository === 'function' ? api : null;
}

/**
 * Open the Visual Studio Code Diff View to display the changes of a file between a commit hash and the working tree.
 * @param repo The repository the file is contained in.
 * @param hash The revision of the left-side of the Diff View.
 * @param filePath The relative path of the file within the repository.
 * @param dataSource A DataSource instance, that's used to check if the file has been renamed.
 * @returns A promise resolving to the ErrorInfo of the executed command.
 */
export async function viewDiffWithWorkingFile(repo: string, hash: string, filePath: string, dataSource: DataSource) {
	let newFilePath = filePath;
	let fileExists = await doesFileExist(path.join(repo, newFilePath));
	if (!fileExists) {
		const renamedFilePath = await dataSource.getNewPathOfRenamedFile(repo, hash, filePath);
		if (renamedFilePath !== null && await doesFileExist(path.join(repo, renamedFilePath))) {
			newFilePath = renamedFilePath;
			fileExists = true;
		}
	}

	const type = fileExists
		? filePath === newFilePath
			? GitFileStatus.Modified
			: GitFileStatus.Renamed
		: GitFileStatus.Deleted;

	return viewDiff(repo, hash, UNCOMMITTED, filePath, newFilePath, type);
}

/**
 * Open a Visual Studio Code Editor (readonly) for a file a specific Git revision.
 * @param repo The repository the file is contained in.
 * @param hash The revision of the file.
 * @param filePath The relative path of the file within the repository.
 * @returns A promise resolving to the ErrorInfo of the executed command.
 */
export function viewFileAtRevision(repo: string, hash: string, filePath: string) {
	const pathComponents = filePath.split('/');
	const title = abbrevCommit(hash) + ': ' + pathComponents[pathComponents.length - 1];

	return vscode.commands.executeCommand('vscode.open', encodeDiffDocUri(repo, filePath, hash, GitFileStatus.Modified, DiffSide.New).with({ path: title }), {
		preview: true,
		viewColumn: getConfig().openNewTabEditorGroup
	}).then(
		() => null,
		() => 'Visual Studio Code was unable to open ' + filePath + ' at commit ' + abbrevCommit(hash) + '.'
	);
}

/**
 * Open a Visual Studio Code Editor (readonly) for the patch of a commit, as output by `git show --patch`.
 * @param repo The repository the commit is in.
 * @param commitHash The commit hash.
 * @returns A promise resolving to the ErrorInfo of the executed command.
 */
export function viewCommitPatch(repo: string, commitHash: string) {
	return vscode.commands.executeCommand('vscode.open', encodePatchDocUri(repo, commitHash), {
		preview: true,
		viewColumn: getConfig().openNewTabEditorGroup
	}).then(
		() => null,
		() => 'Visual Studio Code was unable to open the patch of commit ' + abbrevCommit(commitHash) + '.'
	);
}

/**
 * Pick one of the files in the tree of a commit with a Quick Pick, and open it at the revision of the commit.
 * @param repo The repository the commit is in.
 * @param commitHash The commit hash.
 * @param dataSource A DataSource instance, that's used to list the files of the commit.
 * @returns A promise resolving to the ErrorInfo of the executed command.
 */
export async function browseFilesAtCommit(repo: string, commitHash: string, dataSource: DataSource): Promise<ErrorInfo> {
	let files: string[];
	try {
		files = await dataSource.getFilesAtCommit(repo, commitHash);
	} catch (errorMessage) {
		return typeof errorMessage === 'string' ? errorMessage : 'Unable to list the files of commit ' + abbrevCommit(commitHash) + '.';
	}
	const filePath = await vscode.window.showQuickPick(files, {
		placeHolder: vscode.l10n.t('Select a file to view at commit {0}', abbrevCommit(commitHash))
	});
	return typeof filePath === 'string' ? viewFileAtRevision(repo, commitHash, filePath) : null;
}

/**
 * Open the Visual Studio Code Source Control View.
 * @returns A promise resolving to the ErrorInfo of the executed command.
 */
export function viewScm(): Thenable<ErrorInfo> {
	return vscode.commands.executeCommand('workbench.view.scm').then(
		() => null,
		() => 'Visual Studio Code was unable to open the Source Control View.'
	);
}

/**
 * Open a new terminal, set up the Git executable, and optionally run a command.
 * @param cwd The working directory for the terminal.
 * @param gitPath The path of the Git executable.
 * @param command The command to run.
 * @param name The name for the terminal.
 */
export function openGitTerminal(cwd: string, gitPath: string, command: string | null, name: string, env?: { [name: string]: string }) {
	let p = process.env['PATH'] || '', sep = isWindows() ? ';' : ':';
	const gitDirectory = path.dirname(gitPath), terminalEnv: { [name: string]: string } = {};
	// Setting PATH replaces the PATH of the terminal (e.g. losing the directories Visual Studio Code adds in remote / dev container
	// environments, such as the one of the `code` CLI used by `core.editor`), so it's only set when Git isn't already on it
	if (!p.split(sep).includes(gitDirectory)) {
		if (p !== '' && !p.endsWith(sep)) p += sep;
		terminalEnv['PATH'] = p + gitDirectory;
	}

	const options: vscode.TerminalOptions = {
		cwd: cwd,
		name: 'Easy Graph: ' + name,
		env: Object.assign(terminalEnv, env)
	};
	const shell = getConfig().integratedTerminalShell;
	if (shell !== '') options.shellPath = shell;

	const terminal = vscode.window.createTerminal(options);
	if (command !== null) {
		runCommandInTerminal(terminal, 'git ' + command);
	}
	terminal.show();
}

/**
 * Run a command in a terminal once its shell is ready. Sending the text immediately can interleave it with the shell's
 * activation scripts (e.g. Python environments), so shell integration is used to run it when available, falling back to sending
 * the text if shell integration doesn't become available within a few seconds.
 * @param terminal The terminal.
 * @param command The command to run.
 */
function runCommandInTerminal(terminal: vscode.Terminal, command: string) {
	if (terminal.shellIntegration) {
		terminal.shellIntegration.executeCommand(command);
		return;
	}
	if (typeof vscode.window.onDidChangeTerminalShellIntegration !== 'function') {
		terminal.sendText(command);
		return;
	}
	let done = false;
	const finish = (run: () => void) => {
		if (done) return;
		done = true;
		listener.dispose();
		clearTimeout(timeout);
		run();
	};
	const listener = vscode.window.onDidChangeTerminalShellIntegration((event) => {
		if (event.terminal === terminal) {
			finish(() => event.shellIntegration.executeCommand(command));
		}
	});
	const timeout = setTimeout(() => finish(() => terminal.sendText(command)), 3000);
}

/**
 * Check whether Git Graph is running on a Windows-based platform.
 * @returns TRUE => Windows-based platform, FALSE => Not a Windows-based platform.
 */
function isWindows() {
	return process.platform === 'win32' || process.env.OSTYPE === 'cygwin' || process.env.OSTYPE === 'msys';
}


/* Visual Studio Code API Wrappers */

/**
 * Show a Visual Studio Code Information Message Dialog with the specified message.
 * @param message The message to show.
 */
export function showInformationMessage(message: string) {
	return vscode.window.showInformationMessage(message).then(() => { }, () => { });
}

/**
 * Show a Visual Studio Code Error Message Dialog with the specified message.
 * @param message The message to show.
 */
export function showUnableToFindGitMessage() {
	return showErrorMessage(vscode.l10n.t('Unable to find a Git executable. Either: Set the Visual Studio Code Setting "git.path" to the path and filename of an existing Git executable, or install Git and restart Visual Studio Code.'));
}

/**
 * Show a Visual Studio Code Error Message Dialog with the specified message.
 * @param message The message to show.
 */
export function showErrorMessage(message: string) {
	return vscode.window.showErrorMessage(message).then(() => { }, () => { });
}


/* Promise Methods */

/**
 * Evaluate promises in parallel, with at most `maxParallel` running at any point in time.
 * @param data The array of elements to be mapped via promises.
 * @param maxParallel The maximum number of promises to run at any point in time.
 * @param createPromise A function that creates a promise from an element of `data`.
 * @returns A result array evaluated by mapping promises generated from `data`.
 */
export function evalPromises<X, Y>(data: X[], maxParallel: number, createPromise: (val: X) => Promise<Y>) {
	return new Promise<Y[]>((resolve, reject) => {
		if (data.length === 1) {
			createPromise(data[0]).then(v => resolve([v])).catch(() => reject());
		} else if (data.length === 0) {
			resolve([]);
		} else {
			let results: Y[] = Array.from({ length: data.length }), nextPromise = 0, rejected = false, completed = 0;
			function startNext() {
				let cur = nextPromise;
				nextPromise++;
				createPromise(data[cur]).then(result => {
					if (!rejected) {
						results[cur] = result;
						completed++;
						if (nextPromise < data.length) startNext();
						else if (completed === data.length) resolve(results);
					}
				}).catch(() => {
					reject();
					rejected = true;
				});
			}
			for (let i = 0; i < maxParallel && i < data.length; i++) startNext();
		}
	});
}

/**
 * Resolve the output of a spawned child process.
 * @param cmd The Child Process.
 * @returns Promise that resolves to [{code, error}, stdout, stderr]
 */
export function resolveSpawnOutput(cmd: cp.ChildProcess) {
	return Promise.all([
		new Promise<{ code: number, error: Error | null }>((resolve) => {
			// status promise
			let resolved = false;
			cmd.on('error', (error) => {
				if (resolved) return;
				resolve({ code: -1, error: error });
				resolved = true;
			});
			cmd.on('exit', (code) => {
				if (resolved) return;
				// The exit code is NULL when the process was terminated by a signal
				resolve({ code: code !== null ? code : -1, error: null });
				resolved = true;
			});
		}),
		new Promise<Buffer>((resolve) => {
			// stdout promise (the stream only exists when stdout is piped, which is the default of spawn)
			const stdout = cmd.stdout;
			if (stdout === null) {
				resolve(Buffer.alloc(0));
				return;
			}
			let buffers: Buffer[] = [];
			stdout.on('data', (b: Buffer) => { buffers.push(b); });
			stdout.on('close', () => resolve(Buffer.concat(buffers)));
		}),
		new Promise<string>((resolve) => {
			// stderr promise
			const stderrStream = cmd.stderr;
			if (stderrStream === null) {
				resolve('');
				return;
			}
			let stderr = '';
			stderrStream.on('data', (d) => { stderr += d; });
			stderrStream.on('close', () => resolve(stderr));
		})
	]);
}


/* Find Git Executable */

// The following code matches the behaviour of equivalent functions in Visual Studio Code's Git Extension,
// however was rewritten to meet the needs of this extension.
// The original code has the following copyright notice "Copyright (c) 2015 - present Microsoft Corporation",
// and is licensed under the MIT License.
// https://github.com/microsoft/vscode/blob/473af338e1bd9ad4d9853933da1cd9d5d9e07dc9/extensions/git/src/git.ts#L44-L135

export interface GitExecutable {
	readonly path: string;
	readonly version: string;
}

/**
 * Find a Git executable that Git Graph can use.
 * @param extensionState The Git Graph ExtensionState instance.
 * @returns A Git executable.
 */
export async function findGit(extensionState: ExtensionState) {
	// The user's `git.path` takes precedence over the cached last known path
	const configGitPaths = getConfig().gitPaths;
	if (configGitPaths.length > 0) {
		try {
			return await getGitExecutableFromPaths(configGitPaths);
		} catch { }
	}

	const lastKnownPath = extensionState.getLastKnownGitPath();
	if (lastKnownPath !== null) {
		try {
			return await getGitExecutable(lastKnownPath);
		} catch { }
	}

	switch (process.platform) {
		case 'darwin':
			return findGitOnDarwin();
		case 'win32':
			return findGitOnWin32();
		default:
			return getGitExecutable('git');
	}
}

/**
 * Find a Git executable on a Darwin-based platform that Git Graph can use.
 * @returns A Git executable.
 */
function findGitOnDarwin() {
	return new Promise<GitExecutable>((resolve, reject) => {
		cp.exec('which git', (err, stdout) => {
			if (err) return reject();

			const path = stdout.trim();
			if (path !== '/usr/bin/git') {
				getGitExecutable(path).then((exec) => resolve(exec), () => reject());
			} else {
				// must check if XCode is installed
				cp.exec('xcode-select -p', (err: any) => {
					if (err && err.code === 2) {
						// git is not installed, and launching /usr/bin/git will prompt the user to install it
						reject();
					} else {
						getGitExecutable(path).then((exec) => resolve(exec), () => reject());
					}
				});
			}
		});
	});
}

/**
 * Find a Git executable on a Windows-based platform that Git Graph can use.
 * @returns A Git executable.
 */
function findGitOnWin32() {
	return findSystemGitWin32(process.env['ProgramW6432'])
		.then(undefined, () => findSystemGitWin32(process.env['ProgramFiles(x86)']))
		.then(undefined, () => findSystemGitWin32(process.env['ProgramFiles']))
		.then(undefined, () => findSystemGitWin32(process.env['LocalAppData'] ? path.join(process.env['LocalAppData']!, 'Programs') : undefined))
		.then(undefined, () => findGitWin32InPath());
}
function findSystemGitWin32(pathBase?: string) {
	return pathBase
		? getGitExecutable(path.join(pathBase, 'Git', 'cmd', 'git.exe'))
		: Promise.reject<GitExecutable>();
}
async function findGitWin32InPath() {
	let dirs = (process.env['PATH'] || '').split(';');
	dirs.unshift(process.cwd());

	for (let i = 0; i < dirs.length; i++) {
		let file = path.join(dirs[i], 'git.exe');
		if (await isExecutable(file)) {
			try {
				return await getGitExecutable(file);
			} catch { }
		}
	}
	return Promise.reject<GitExecutable>();
}

/**
 * Checks whether a path is an executable (a file that's not a symbolic link).
 * @param path The path to test.
 * @returns TRUE => Executable, FALSE => Not an Executable.
 */
function isExecutable(path: string) {
	return new Promise<boolean>(resolve => {
		fs.stat(path, (err, stat) => {
			resolve(!err && (stat.isFile() || stat.isSymbolicLink()));
		});
	});
}

/**
 * Tests whether the specified path corresponds to the path of a Git executable.
 * @param path The path of the Git executable.
 * @returns The GitExecutable data.
 */
export function getGitExecutable(path: string) {
	return new Promise<GitExecutable>((resolve, reject) => {
		resolveSpawnOutput(cp.spawn(path, ['--version'])).then((values) => {
			if (values[0].code === 0) {
				resolve({ path: path, version: values[1].toString().trim().replace(/^git version /, '') });
			} else {
				reject();
			}
		});
	});
}

/**
 * Tests whether one of the specified paths corresponds to the path of a Git executable.
 * @param paths The paths of possible Git executables.
 * @returns The GitExecutable data.
 */
export async function getGitExecutableFromPaths(paths: string[]): Promise<GitExecutable> {
	for (let i = 0; i < paths.length; i++) {
		try {
			return await getGitExecutable(paths[i]);
		} catch { }
	}
	throw new Error('None of the provided paths are a Git executable');
}


/* Version Handling / Requirements */

export const enum GitVersionRequirement {
	FetchAndPruneTags = '2.17.0',
	GpgInfo = '2.4.0',
	PushStash = '2.13.2',
	TagDetails = '1.7.8'
}

export const enum VsCodeVersionRequirement {
	Codicons = '1.42.0'
}

/**
 * Checks whether a version is at least a required version.
 * @param version The version to check.
 * @param requiredVersion The minimum required version.
 * @returns TRUE => `version` is at least `requiredVersion`, FALSE => `version` is older than `requiredVersion`.
 */
export function doesVersionMeetRequirement(version: string, requiredVersion: GitVersionRequirement | VsCodeVersionRequirement) {
	const v1 = parseVersion(version);
	const v2 = parseVersion(requiredVersion);

	if (v1 === null || v2 === null) {
		// Unable to parse a version number
		return true;
	}

	if (v1.major > v2.major) return true; // Git major version is newer
	if (v1.major < v2.major) return false; // Git major version is older

	if (v1.minor > v2.minor) return true; // Git minor version is newer
	if (v1.minor < v2.minor) return false; // Git minor version is older

	if (v1.patch > v2.patch) return true; // Git patch version is newer
	if (v1.patch < v2.patch) return false; // Git patch version is older

	return true; // Versions are the same
}

/**
 * Parse a version number from a string.
 * @param version The string version number.
 * @returns The `major`.`minor`.`patch` version numbers.
 */
function parseVersion(version: string) {
	const match = version.trim().match(/^[0-9]+(\.[0-9]+|)(\.[0-9]+|)/);
	if (match === null) {
		// Unable to find a valid version number
		return null;
	}

	const comps = match[0].split('.');
	return {
		major: parseInt(comps[0], 10),
		minor: comps.length > 1 ? parseInt(comps[1], 10) : 0,
		patch: comps.length > 2 ? parseInt(comps[2], 10) : 0
	};
}

/**
 * Construct a message that explains to the user that the Git executable is not compatible with a feature.
 * @param executable The Git executable.
 * @param version The minimum required version.
 * @param feature An optional name for the feature.
 * @returns The message for the user.
 */
export function constructIncompatibleGitVersionMessage(executable: GitExecutable, version: GitVersionRequirement, feature?: string) {
	return 'A newer version of Git (>= ' + version + ') is required for ' + (feature ? feature : 'this feature') + '. Git ' + executable.version + ' is currently installed. Please install a newer version of Git to use this feature.';
}
