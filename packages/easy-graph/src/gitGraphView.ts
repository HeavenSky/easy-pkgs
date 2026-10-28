import * as vscode from 'vscode';
import { AvatarManager } from './avatarManager';
import { BaseGitGraphView, createWebviewOptions } from './baseGitGraphView';
import { getConfig, setGraphViewColumn } from './config';
import { DataSource } from './dataSource';
import { ExtensionState } from './extensionState';
import { Logger } from './logger';
import { RepoManager } from './repoManager';
import { LoadGitGraphViewTo } from './types';
import { toDisposable } from './utils/disposable';

/**
 * Manages the Git Graph View in the editor. At most one exists at a time, rendered in its own Webview Panel.
 */
export class GitGraphView extends BaseGitGraphView {
	public static readonly viewType = 'easy-graph';
	public static currentPanel: GitGraphView | undefined;

	private readonly panel: vscode.WebviewPanel;

	/**
	 * If a Git Graph View already exists, show and update it. Otherwise, create a Git Graph View.
	 * @param extensionPath The absolute file path of the directory containing the extension.
	 * @param dataSource The Git Graph DataSource instance.
	 * @param extensionState The Git Graph ExtensionState instance.
	 * @param avatarManger The Git Graph AvatarManager instance.
	 * @param repoManager The Git Graph RepoManager instance.
	 * @param logger The Git Graph Logger instance.
	 * @param loadViewTo What to load the view to.
	 */
	public static createOrShow(extensionPath: string, dataSource: DataSource, extensionState: ExtensionState, avatarManager: AvatarManager, repoManager: RepoManager, logger: Logger, loadViewTo: LoadGitGraphViewTo) {
		const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;
		const existing = GitGraphView.currentPanel;
		if (existing) {
			existing.updateWithRepos(repoManager.getRepos(), loadViewTo);
			existing.panel.reveal(column);
		} else {
			GitGraphView.currentPanel = new GitGraphView(extensionPath, dataSource, extensionState, avatarManager, repoManager, logger, loadViewTo, column);
		}
	}

	/**
	 * Restore a Git Graph View that was open when Visual Studio Code was restarted.
	 * @param panel The restored Webview Panel.
	 * @param extensionPath The absolute file path of the directory containing the extension.
	 * @param dataSource The Git Graph DataSource instance.
	 * @param extensionState The Git Graph ExtensionState instance.
	 * @param avatarManger The Git Graph AvatarManager instance.
	 * @param repoManager The Git Graph RepoManager instance.
	 * @param logger The Git Graph Logger instance.
	 */
	public static revive(panel: vscode.WebviewPanel, extensionPath: string, dataSource: DataSource, extensionState: ExtensionState, avatarManager: AvatarManager, repoManager: RepoManager, logger: Logger) {
		if (GitGraphView.currentPanel) {
			// Only a single Git Graph View is supported
			panel.dispose();
			return;
		}
		GitGraphView.currentPanel = new GitGraphView(extensionPath, dataSource, extensionState, avatarManager, repoManager, logger, null, panel.viewColumn, panel);
	}

	/**
	 * Close the Git Graph View if it is the active editor (used to toggle the view).
	 * @returns TRUE => The view was closed, FALSE => The view isn't active.
	 */
	public static closeIfActive() {
		const view = GitGraphView.currentPanel;
		if (!view || !view.panel.active) return false;
		view.dispose();
		return true;
	}

	/**
	 * Creates a Git Graph View.
	 * @param extensionPath The absolute file path of the directory containing the extension.
	 * @param dataSource The Git Graph DataSource instance.
	 * @param extensionState The Git Graph ExtensionState instance.
	 * @param avatarManger The Git Graph AvatarManager instance.
	 * @param repoManager The Git Graph RepoManager instance.
	 * @param logger The Git Graph Logger instance.
	 * @param loadViewTo What to load the view to.
	 * @param column The column the view should be loaded in.
	 * @param restoredPanel The Webview Panel restored by Visual Studio Code (when reviving the view), otherwise a new one is created.
	 */
	private constructor(extensionPath: string, dataSource: DataSource, extensionState: ExtensionState, avatarManager: AvatarManager, repoManager: RepoManager, logger: Logger, loadViewTo: LoadGitGraphViewTo, column: vscode.ViewColumn | undefined, restoredPanel?: vscode.WebviewPanel) {
		super(extensionPath, dataSource, extensionState, avatarManager, repoManager, logger, loadViewTo);

		if (restoredPanel) {
			// The options of a restored panel aren't persisted by Visual Studio Code, only its state is
			restoredPanel.webview.options = createWebviewOptions(extensionPath);
			this.panel = restoredPanel;
		} else {
			this.panel = vscode.window.createWebviewPanel(GitGraphView.viewType, 'Easy Graph', column || vscode.ViewColumn.One, {
				...createWebviewOptions(extensionPath),
				retainContextWhenHidden: getConfig().retainContextWhenHidden
			});
		}
		setGraphViewColumn(this.panel.viewColumn);
		// Without an iconPath VS Code falls back to the extension's colour icon on the tab
		this.panel.iconPath = new vscode.ThemeIcon('git-branch');

		// The order matters: the subscription to `onDidDispose` must be released before the panel is disposed, otherwise
		// disposing the panel would dispose this view a second time
		this.registerDisposables(
			toDisposable(() => {
				if (GitGraphView.currentPanel === this) GitGraphView.currentPanel = undefined;
				setGraphViewColumn(undefined);
			}),
			this.panel.onDidDispose(() => this.dispose()),
			this.panel.onDidChangeViewState(() => {
				setGraphViewColumn(this.panel.viewColumn);
				this.onDidChangeVisibility(this.panel.visible);
			}),
			this.panel
		);

		this.attachWebview(this.panel.webview, this.panel.visible);
	}

	/**
	 * Is the Webview Panel currently visible.
	 */
	protected isHostVisible() {
		return this.panel.visible;
	}
}
