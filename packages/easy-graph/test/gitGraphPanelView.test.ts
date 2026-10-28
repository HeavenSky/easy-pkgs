import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import * as vscode from './mocks/vscode';
vi.mock('vscode', () => import('./mocks/vscode'));
vi.mock('../src/avatarManager');
vi.mock('../src/dataSource');
vi.mock('../src/extensionState');
vi.mock('../src/logger');
vi.mock('../src/repoManager');

import * as path from 'path';
import { ConfigurationChangeEvent } from 'vscode';
import { AvatarEvent, AvatarManager } from '../src/avatarManager';
import { BaseGitGraphView } from '../src/baseGitGraphView';
import { DataSource } from '../src/dataSource';
import { ExtensionState } from '../src/extensionState';
import { GitGraphPanelView } from '../src/gitGraphPanelView';
import { GitGraphView } from '../src/gitGraphView';
import { Logger } from '../src/logger';
import { RepoChangeEvent, RepoManager } from '../src/repoManager';
import { RequestMessage, ResponseMessage } from '../src/types';
import * as utils from '../src/utils';
import { EventEmitter } from '../src/utils/event';

import { waitForExpect } from './helpers/expectations';
import { mockRepoState } from './helpers/utils';

/**
 * A fake Webview View, as resolved by Visual Studio Code. Its listeners can be unsubscribed, so that tests can check that
 * no subscriptions are leaked when the view is resolved again.
 */
class FakeWebviewView {
	public visible: boolean;
	public readonly messages: ResponseMessage[] = [];
	public readonly show = vi.fn((_preserveFocus?: boolean) => this.setVisible(true));
	public readonly webview: any;

	private readonly visibilityListeners = new Set<() => void>();
	private readonly disposeListeners = new Set<() => void>();
	private readonly messageListeners = new Set<(msg: RequestMessage) => void>();

	constructor(visible: boolean = true) {
		this.visible = visible;
		this.webview = {
			asWebviewUri: (uri: vscode.Uri) => uri.with({ scheme: 'vscode-webview-resource', path: 'file//' + uri.path }),
			cspSource: 'vscode-webview-resource:',
			html: '',
			options: {},
			onDidReceiveMessage: (listener: (msg: RequestMessage) => void) => subscribe(this.messageListeners, listener),
			postMessage: vi.fn((msg: ResponseMessage) => {
				this.messages.push(msg);
				return Promise.resolve(true);
			})
		};
	}

	public onDidChangeVisibility(listener: () => void) {
		return subscribe(this.visibilityListeners, listener);
	}

	public onDidDispose(listener: () => void) {
		return subscribe(this.disposeListeners, listener);
	}

	public setVisible(visible: boolean) {
		if (this.visible === visible) return;
		this.visible = visible;
		this.visibilityListeners.forEach((listener) => listener());
	}

	public dispose() {
		this.disposeListeners.forEach((listener) => listener());
	}

	public receive(msg: RequestMessage) {
		this.messageListeners.forEach((listener) => listener(msg));
	}

	public get listenerCount() {
		return this.visibilityListeners.size + this.disposeListeners.size + this.messageListeners.size;
	}
}

function subscribe<T>(listeners: Set<T>, listener: T) {
	listeners.add(listener);
	return { dispose: () => { listeners.delete(listener); } };
}

describe('GitGraphPanelView', () => {
	let onDidChangeConfiguration: EventEmitter<ConfigurationChangeEvent>;
	let onDidChangeGitExecutable: EventEmitter<utils.GitExecutable>;
	let onDidChangeRepos: EventEmitter<RepoChangeEvent>;
	let onAvatar: EventEmitter<AvatarEvent>;

	let logger: Logger;
	let dataSource: DataSource;
	let extensionState: ExtensionState;
	let avatarManager: AvatarManager;
	let repoManager: RepoManager;

	let spyOnLog: MockInstance;
	let spyOnLogError: MockInstance;

	beforeAll(() => {
		onDidChangeConfiguration = new EventEmitter<ConfigurationChangeEvent>();
		onDidChangeGitExecutable = new EventEmitter<utils.GitExecutable>();
		onDidChangeRepos = new EventEmitter<RepoChangeEvent>();
		onAvatar = new EventEmitter<AvatarEvent>();

		logger = new Logger();
		dataSource = new DataSource({ path: '/path/to/git', version: '2.25.0' }, onDidChangeConfiguration.subscribe, onDidChangeGitExecutable.subscribe, logger);
		extensionState = new ExtensionState(vscode.mocks.extensionContext, onDidChangeGitExecutable.subscribe);
		avatarManager = new AvatarManager(dataSource, extensionState, logger);
		repoManager = new RepoManager(dataSource, extensionState, onDidChangeConfiguration.subscribe, logger);

		spyOnLog = vi.spyOn(logger, 'log');
		spyOnLogError = vi.spyOn(logger, 'logError');
		vi.spyOn(repoManager, 'getRepos').mockReturnValue({ '/path/to/repo': mockRepoState() });
		vi.spyOn(dataSource, 'isGitExecutableUnknown').mockReturnValue(false);
		vi.spyOn(dataSource, 'getGitDirs').mockResolvedValue([]);
		Object.defineProperty(repoManager, 'onDidChangeRepos', {
			get: () => onDidChangeRepos.subscribe
		});
		Object.defineProperty(avatarManager, 'onAvatar', {
			get: () => onAvatar.subscribe
		});
		vi.spyOn(extensionState, 'getLastActiveRepo').mockReturnValue(null);
	});

	afterAll(() => {
		repoManager.dispose();
		avatarManager.dispose();
		extensionState.dispose();
		dataSource.dispose();
		logger.dispose();
		onAvatar.dispose();
		onDidChangeRepos.dispose();
		onDidChangeGitExecutable.dispose();
		onDidChangeConfiguration.dispose();
	});

	let panelView: GitGraphPanelView;
	beforeEach(() => {
		panelView = GitGraphPanelView.getInstance('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger);
	});

	afterEach(() => {
		panelView.dispose();
		if (GitGraphView.currentPanel) {
			GitGraphView.currentPanel.dispose();
		}
	});

	describe('getInstance', () => {
		it('Should return the same instance until it is disposed', () => {
			// Run
			const instance = GitGraphPanelView.getInstance('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger);

			// Assert
			expect(instance).toBe(panelView);

			// Run
			panelView.dispose();
			const newInstance = GitGraphPanelView.getInstance('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger);

			// Assert
			expect(newInstance).not.toBe(panelView);
			newInstance.dispose();
		});
	});

	describe('Before the Webview View is resolved', () => {
		it('Shouldn\'t render or send anything (and not throw)', () => {
			// Run
			BaseGitGraphView.refreshAll();
			BaseGitGraphView.reloadAll();
			onAvatar.emit({ email: 'user1@mhutchie.com', image: 'data:image/png;base64,YmluYXJ5LWltYWdlLWRhdGE=' });
			onDidChangeRepos.emit({ repos: { '/path/to/repo': mockRepoState() }, numRepos: 1, loadRepo: '/path/to/repo' });

			// Assert
			expect(spyOnLogError).not.toHaveBeenCalled();
		});

		it('Should still refresh the view in the editor when running easy-graph.refresh', () => {
			// Setup
			GitGraphView.createOrShow('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger, null);

			// Run
			BaseGitGraphView.refreshAll();

			// Assert
			expect(vscode.getMockedWebviewPanel(0).mocks.messages).toStrictEqual([{ command: 'refresh' }]);
		});
	});

	describe('resolveWebviewView', () => {
		it('Should render the view in the resolved Webview View', () => {
			// Setup
			const webviewView = new FakeWebviewView();

			// Run
			panelView.resolveWebviewView(<any>webviewView);

			// Assert
			expect(webviewView.webview.options).toStrictEqual({
				enableScripts: true,
				localResourceRoots: [vscode.Uri.file(path.join('/path/to/extension', 'out', 'web'))]
			});
			expect(webviewView.webview.html).toContain('<div id="view" tabindex="-1">');
			expect(webviewView.webview.html).toContain('src="vscode-webview-resource://file///path/to/extension/out/web/out.min.js"');
			expect(spyOnLog).toHaveBeenCalledWith('Created Easy Graph View');
		});

		it('Should respond to messages from the resolved Webview View', async () => {
			// Setup
			const webviewView = new FakeWebviewView();
			vi.spyOn(utils, 'viewScm').mockResolvedValueOnce(null);
			panelView.resolveWebviewView(<any>webviewView);

			// Run
			webviewView.receive({ command: 'viewScm' });

			// Assert
			await waitForExpect(() => {
				expect(webviewView.messages).toStrictEqual([{ command: 'viewScm', error: null }]);
			});
		});

		it('Should release the subscriptions to a disposed Webview View, and stop watching the repository', () => {
			// Setup
			const webviewView = new FakeWebviewView();
			panelView.resolveWebviewView(<any>webviewView);
			panelView['currentRepo'] = '/path/to/repo';
			const spyOnRepoFileWatcherStop = vi.spyOn(panelView['repoFileWatcher'], 'stop');

			// Run
			webviewView.dispose();

			// Assert
			expect(webviewView.listenerCount).toBe(0);
			expect(panelView['currentRepo']).toBeNull();
			expect(spyOnRepoFileWatcherStop).toHaveBeenCalledTimes(1);
		});

		it('Should only use the latest Webview View when it is resolved again', () => {
			// Setup
			const oldWebviewView = new FakeWebviewView();
			panelView.resolveWebviewView(<any>oldWebviewView);
			oldWebviewView.dispose();
			const newWebviewView = new FakeWebviewView();

			// Run
			panelView.resolveWebviewView(<any>newWebviewView);
			BaseGitGraphView.refreshAll();

			// Assert
			expect(newWebviewView.webview.html).toContain('<div id="view" tabindex="-1">');
			expect(newWebviewView.listenerCount).toBe(3);
			expect(newWebviewView.messages).toStrictEqual([{ command: 'refresh' }]);
			expect(oldWebviewView.messages).toStrictEqual([]);
		});

		it('Should replace a Webview View that is resolved again without being disposed first', () => {
			// Setup
			const oldWebviewView = new FakeWebviewView();
			panelView.resolveWebviewView(<any>oldWebviewView);
			const newWebviewView = new FakeWebviewView();

			// Run
			panelView.resolveWebviewView(<any>newWebviewView);
			oldWebviewView.dispose();
			BaseGitGraphView.refreshAll();

			// Assert
			expect(oldWebviewView.listenerCount).toBe(0);
			expect(newWebviewView.messages).toStrictEqual([{ command: 'refresh' }]);
		});

		it('Should drop the response to a request that was pending when the Webview View was disposed', async () => {
			// Setup
			const webviewView = new FakeWebviewView();
			let resolveViewScm: (error: null) => void = () => { };
			vi.spyOn(utils, 'viewScm').mockReturnValueOnce(new Promise((resolve) => { resolveViewScm = resolve; }));
			panelView.resolveWebviewView(<any>webviewView);
			const spyOnRepoFileWatcherUnmute = vi.spyOn(panelView['repoFileWatcher'], 'unmute');
			webviewView.receive({ command: 'viewScm' });

			// Run
			webviewView.dispose();
			resolveViewScm(null);

			// Assert
			await waitForExpect(() => {
				expect(spyOnRepoFileWatcherUnmute).toHaveBeenCalledTimes(1);
			});
			expect(webviewView.messages).toStrictEqual([]);
			expect(spyOnLogError).not.toHaveBeenCalled();
		});
	});

	describe('Visibility', () => {
		it('Should stop watching the repository when hidden, and render the view again when shown', () => {
			// Setup
			const webviewView = new FakeWebviewView();
			panelView.resolveWebviewView(<any>webviewView);
			const spyOnRepoFileWatcherStop = vi.spyOn(panelView['repoFileWatcher'], 'stop');

			// Run
			webviewView.setVisible(false);

			// Assert
			expect(spyOnRepoFileWatcherStop).toHaveBeenCalledTimes(1);
			expect(panelView['isPanelVisible']).toBe(false);

			// Run
			webviewView.webview.html = '';
			webviewView.setVisible(true);

			// Assert
			expect(webviewView.webview.html).not.toBe('');
			expect(panelView['isPanelVisible']).toBe(true);
		});

		it('Should use the visibility of the Webview View when it is resolved', () => {
			// Setup
			const webviewView = new FakeWebviewView(false);

			// Run
			panelView.resolveWebviewView(<any>webviewView);
			panelView['repoFileWatcher']['repoChangeCallback']();

			// Assert
			expect(panelView['isPanelVisible']).toBe(false);
			expect(webviewView.messages).toStrictEqual([]);
		});
	});

	describe('show', () => {
		it('Should reveal the panel and render the requested repository when the Webview View isn\'t resolved yet', async () => {
			// Setup
			const webviewView = new FakeWebviewView();
			vscode.commands.registerCommand('easy-graph.panel.focus', () => panelView.resolveWebviewView(<any>webviewView));

			// Run
			await panelView.show({ repo: '/path/to/repo' });

			// Assert
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith('easy-graph.panel.focus');
			expect(webviewView.webview.html).toContain('"loadViewTo":{"repo":"/path/to/repo"}');
			expect(spyOnLog).toHaveBeenCalledWith('Created Easy Graph View (active repo: /path/to/repo)');
		});

		it('Should open the view container when the Webview View can\'t be focused', async () => {
			// Setup
			vscode.commands.registerCommand('easy-graph.panel.focus', () => Promise.reject(new Error('Unknown command')));
			vscode.commands.registerCommand('workbench.view.extension.easy-graph-panel', () => Promise.resolve());

			// Run
			await panelView.show(null);

			// Assert
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.view.extension.easy-graph-panel');
			expect(spyOnLogError).not.toHaveBeenCalled();
		});

		it('Should keep the requested repository for when the Webview View is resolved, if the panel can\'t be revealed', async () => {
			// Setup
			vscode.commands.registerCommand('easy-graph.panel.focus', () => Promise.reject(new Error('Unknown command')));
			vscode.commands.registerCommand('workbench.view.extension.easy-graph-panel', () => Promise.reject(new Error('Unknown command')));
			const webviewView = new FakeWebviewView();

			// Run
			await panelView.show({ repo: '/path/to/repo' });
			panelView.resolveWebviewView(<any>webviewView);

			// Assert
			expect(spyOnLogError).toHaveBeenCalledWith('Failed to reveal the Easy Graph panel');
			expect(webviewView.webview.html).toContain('"loadViewTo":{"repo":"/path/to/repo"}');
		});

		it('Should send the requested repository to a visible Webview View', async () => {
			// Setup
			const webviewView = new FakeWebviewView();
			panelView.resolveWebviewView(<any>webviewView);

			// Run
			await panelView.show({ repo: '/path/to/repo' });

			// Assert
			expect(webviewView.show).toHaveBeenCalledWith(true);
			expect(webviewView.messages).toStrictEqual([
				{
					command: 'loadRepos',
					lastActiveRepo: null,
					loadViewTo: { repo: '/path/to/repo' },
					repos: { '/path/to/repo': mockRepoState() },
					workspaceFolderPaths: { '/path/to/repo': [] }
				}
			]);
		});

		it('Should render a hidden Webview View with the requested repository once it is shown', async () => {
			// Setup
			const webviewView = new FakeWebviewView();
			panelView.resolveWebviewView(<any>webviewView);
			webviewView.setVisible(false);
			// The Webview View becomes visible asynchronously, after `show` returned
			webviewView.show.mockImplementationOnce(() => { });

			// Run
			await panelView.show({ repo: '/path/to/repo' });
			webviewView.setVisible(true);

			// Assert
			expect(webviewView.show).toHaveBeenCalledWith(true);
			expect(webviewView.webview.html).toContain('"loadViewTo":{"repo":"/path/to/repo"}');
			expect(webviewView.messages).toStrictEqual([]);
		});
	});

	describe('easy-graph.disableRefreshWhenShown', () => {
		beforeEach(() => {
			vscode.mockExtensionSettingReturnValue('disableRefreshWhenShown', true);
		});

		it('Should deliver the repository requested while the view in the panel was hidden, without rendering it again', async () => {
			// Setup
			const webviewView = new FakeWebviewView();
			panelView.resolveWebviewView(<any>webviewView);
			webviewView.setVisible(false);
			webviewView.show.mockImplementationOnce(() => { });
			webviewView.webview.html = '';

			// Run
			await panelView.show({ repo: '/path/to/repo' });
			webviewView.setVisible(true);

			// Assert
			expect(webviewView.webview.html).toBe('');
			expect(webviewView.messages).toStrictEqual([
				{
					command: 'loadRepos',
					lastActiveRepo: null,
					loadViewTo: { repo: '/path/to/repo' },
					repos: { '/path/to/repo': mockRepoState() },
					workspaceFolderPaths: { '/path/to/repo': [] }
				}
			]);
		});

		it('Should deliver the repository requested while the view in the editor was hidden, without rendering it again', () => {
			// Setup
			GitGraphView.createOrShow('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger, null);
			const mockedWebviewPanel = vscode.getMockedWebviewPanel(0);
			mockedWebviewPanel.mocks.panel.setVisibility(false);
			mockedWebviewPanel.panel.webview.html = '';

			// Run
			GitGraphView.createOrShow('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger, { repo: '/path/to/repo' });
			mockedWebviewPanel.mocks.panel.setVisibility(true);

			// Assert
			expect(mockedWebviewPanel.panel.webview.html).toBe('');
			expect(mockedWebviewPanel.mocks.messages).toStrictEqual([
				{
					command: 'loadRepos',
					lastActiveRepo: null,
					loadViewTo: { repo: '/path/to/repo' },
					repos: { '/path/to/repo': mockRepoState() },
					workspaceFolderPaths: { '/path/to/repo': [] }
				}
			]);
		});
	});

	describe('Editor and panel open at the same time', () => {
		it('Should refresh both views, and only dispose the view that was closed', () => {
			// Setup
			const webviewView = new FakeWebviewView();
			panelView.resolveWebviewView(<any>webviewView);
			GitGraphView.createOrShow('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger, null);
			const mockedWebviewPanel = vscode.getMockedWebviewPanel(0);

			// Run
			BaseGitGraphView.refreshAll();

			// Assert
			expect(webviewView.messages).toStrictEqual([{ command: 'refresh' }]);
			expect(mockedWebviewPanel.mocks.messages).toStrictEqual([{ command: 'refresh' }]);

			// Run
			mockedWebviewPanel.mocks.panel.onDidDispose();
			BaseGitGraphView.refreshAll();

			// Assert
			expect(GitGraphView.currentPanel).toBeUndefined();
			expect(webviewView.messages).toStrictEqual([{ command: 'refresh' }, { command: 'refresh' }]);
			expect(mockedWebviewPanel.mocks.messages).toStrictEqual([{ command: 'refresh' }]);
		});

		it('Should only refresh the view whose repository changed', () => {
			// Setup
			const webviewView = new FakeWebviewView();
			panelView.resolveWebviewView(<any>webviewView);
			GitGraphView.createOrShow('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger, null);
			const mockedWebviewPanel = vscode.getMockedWebviewPanel(0);

			// Run
			panelView['repoFileWatcher']['repoChangeCallback']();

			// Assert
			expect(webviewView.messages).toStrictEqual([{ command: 'refresh' }]);
			expect(mockedWebviewPanel.mocks.messages).toStrictEqual([]);
		});
	});
});
