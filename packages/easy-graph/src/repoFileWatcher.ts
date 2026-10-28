import * as fs from 'fs';
import * as vscode from 'vscode';
import { Logger } from './logger';
import { getPathFromUri, pathWithTrailingSlash } from './utils';

const FILE_CHANGE_REGEX = /(^\.git\/(config|index|HEAD|refs\/stash|refs\/heads\/.*|refs\/remotes\/.*|refs\/tags\/.*)$)|(^(?!\.git).*$)|(^\.git[^/]+$)/;
const GIT_DIR_FILE_CHANGE_REGEX = /^(config|index|HEAD|packed-refs|refs\/stash|refs\/heads\/.*|refs\/remotes\/.*|refs\/tags\/.*)$/;

const REFRESH_DEBOUNCE = 750;
const MIN_REFRESH_INTERVAL = 2000;
const INDEX_LOCK_RETRY_DELAY = 500;
const INDEX_LOCK_MAX_RETRIES = 20;

/**
 * Watches a Git repository for file events.
 */
export class RepoFileWatcher {
	private readonly logger: Logger;
	private readonly repoChangeCallback: () => void;
	private repo: string | null = null;
	private fsWatcher: vscode.FileSystemWatcher | null = null;
	private gitDirWatchers: vscode.FileSystemWatcher[] = [];
	private gitDir: string | null = null;
	private refreshTimeout: ReturnType<typeof setTimeout> | null = null;
	private muted: boolean = false;
	private resumeAt: number = 0;
	private lastRefreshAt: number = 0;
	private indexLockRetries: number = 0;

	/**
	 * Creates a RepoFileWatcher.
	 * @param logger The Git Graph Logger instance.
	 * @param repoChangeCallback A callback to be invoked when a file event occurs in the repository.
	 */
	constructor(logger: Logger, repoChangeCallback: () => void) {
		this.logger = logger;
		this.repoChangeCallback = repoChangeCallback;
	}

	/**
	 * Start watching a repository for file events.
	 * @param repo The path of the repository to watch.
	 */
	public start(repo: string) {
		if (this.fsWatcher !== null) {
			// If there is an existing File System Watcher, stop it
			this.stop();
		}

		this.repo = repo;
		this.gitDir = repo + '/.git';
		// Create a File System Watcher for all events within the specified repository
		this.fsWatcher = vscode.workspace.createFileSystemWatcher(repo + '/**');
		this.fsWatcher.onDidCreate(uri => this.refresh(uri));
		this.fsWatcher.onDidChange(uri => this.refresh(uri));
		this.fsWatcher.onDidDelete(uri => this.refresh(uri));
		this.logger.log('Started watching repo: ' + repo);
	}

	/**
	 * Also watch the Git directories of the repository that are outside of it (e.g. for submodules and worktrees, whose ".git" is a file pointing to a directory elsewhere).
	 * @param repo The path of the repository the Git directories belong to (ignored if it's no longer the watched repository).
	 * @param gitDirs The absolute paths of the Git directories (the first being the repository's own Git directory).
	 */
	public watchGitDirs(repo: string, gitDirs: ReadonlyArray<string>) {
		if (this.repo !== repo || this.fsWatcher === null) return;
		this.disposeGitDirWatchers();
		if (gitDirs.length > 0) this.gitDir = gitDirs[0];

		const repoFolder = pathWithTrailingSlash(repo);
		gitDirs.filter((dir) => !dir.startsWith(repoFolder)).forEach((dir) => {
			const dirFolder = pathWithTrailingSlash(dir);
			const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(dir), '**'));
			const onEvent = (uri: vscode.Uri) => {
				if (getPathFromUri(uri).replace(dirFolder, '').match(GIT_DIR_FILE_CHANGE_REGEX)) this.scheduleRefresh();
			};
			watcher.onDidCreate(onEvent);
			watcher.onDidChange(onEvent);
			watcher.onDidDelete(onEvent);
			this.gitDirWatchers.push(watcher);
			this.logger.log('Started watching Git directory: ' + dir);
		});
	}

	/**
	 * Stop watching the repository for file events.
	 */
	public stop() {
		if (this.fsWatcher !== null) {
			// If there is an existing File System Watcher, stop it
			this.fsWatcher.dispose();
			this.fsWatcher = null;
			this.logger.log('Stopped watching repo: ' + this.repo);
		}
		this.disposeGitDirWatchers();
		if (this.refreshTimeout !== null) {
			// If a timeout is active, clear it
			clearTimeout(this.refreshTimeout);
			this.refreshTimeout = null;
		}
	}

	/**
	 * Mute file events - Used to prevent many file events from being triggered when a Git action is executed by the Git Graph View.
	 */
	public mute() {
		this.muted = true;
	}

	/**
	 * Unmute file events - Used to resume normal watching after a Git action executed by the Git Graph View has completed.
	 */
	public unmute() {
		this.muted = false;
		this.resumeAt = (new Date()).getTime() + 1500;
	}


	/**
	 * Handle a file event triggered by the File System Watcher.
	 * @param uri The URI of the file that the event occurred on.
	 */
	private refresh(uri: vscode.Uri) {
		if (!getPathFromUri(uri).replace(this.repo + '/', '').match(FILE_CHANGE_REGEX)) return;
		this.scheduleRefresh();
	}

	/**
	 * Schedule the repository change callback (debounced, and at most once per MIN_REFRESH_INTERVAL).
	 */
	private scheduleRefresh() {
		if (this.muted) return;
		const now = (new Date()).getTime();
		if (now < this.resumeAt) return;

		if (this.refreshTimeout !== null) {
			clearTimeout(this.refreshTimeout);
		}
		this.indexLockRetries = 0;
		const delay = Math.max(REFRESH_DEBOUNCE, this.lastRefreshAt + MIN_REFRESH_INTERVAL - now);
		this.refreshTimeout = setTimeout(() => this.runRefresh(), delay);
	}

	/**
	 * Invoke the repository change callback, delaying it while Git holds the index lock (e.g. during a merge), to avoid showing transient uncommitted changes.
	 */
	private runRefresh() {
		this.refreshTimeout = null;
		if (this.gitDir !== null && this.indexLockRetries < INDEX_LOCK_MAX_RETRIES && fs.existsSync(this.gitDir + '/index.lock')) {
			this.indexLockRetries++;
			this.refreshTimeout = setTimeout(() => this.runRefresh(), INDEX_LOCK_RETRY_DELAY);
			return;
		}
		this.lastRefreshAt = (new Date()).getTime();
		this.repoChangeCallback();
	}

	/**
	 * Dispose the File System Watchers of the Git directories outside of the repository.
	 */
	private disposeGitDirWatchers() {
		this.gitDirWatchers.forEach((watcher) => watcher.dispose());
		this.gitDirWatchers = [];
	}
}
