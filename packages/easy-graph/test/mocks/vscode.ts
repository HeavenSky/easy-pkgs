import { beforeEach, type Mock, vi } from 'vitest';
import * as vscode from 'vscode';
import { RequestMessage, ResponseMessage, Writeable } from '../../src/types';
import packageJson from '../../package.json';


/* Mocks */

const mockedExtensionSettingValues: { [section: string]: any } = {};
// The defaults of the Extension Settings declared in package.json, which `WorkspaceConfiguration.inspect` reports like VS Code does
const extensionSettingDefaults: { [section: string]: any } = Object.fromEntries(
	Object.entries<{ default?: any }>(packageJson.contributes.configuration.properties)
		.map(([key, value]) => [key.substring('easy-graph.'.length), value.default])
);
const mockedCommands: { [command: string]: (...args: any[]) => any } = {};

interface WebviewPanelMocks {
	messages: ResponseMessage[],
	panel: {
		onDidChangeViewState: (e: vscode.WebviewPanelOnDidChangeViewStateEvent) => any,
		onDidDispose: (e: void) => any,
		setVisibility: (visible: boolean) => void,
		webview: {
			onDidReceiveMessage: (msg: RequestMessage) => void
		}
	}
}

let mockedWebviews: { panel: vscode.WebviewPanel, mocks: WebviewPanelMocks }[] = [];

export const mocks = {
	extensionContext: asExtensionContext({
		asAbsolutePath: vi.fn(),
		environmentVariableCollection: <vscode.EnvironmentVariableCollection>{},
		extensionMode: <vscode.ExtensionMode>1, // vscode.ExtensionMode.Production
		extensionPath: '/path/to/extension',
		get extensionUri() {
			return Uri.file('/path/to/extension');
		},
		globalState: {
			get: vi.fn(),
			update: vi.fn()
		},
		globalStoragePath: '/path/to/globalStorage',
		get globalStorageUri() {
			return Uri.file('/path/to/globalStorage');
		},
		logPath: '/path/to/logs',
		get logUri() {
			return Uri.file('/path/to/logs');
		},
		storagePath: '/path/to/storage',
		get storageUri() {
			return Uri.file('/path/to/storage');
		},
		subscriptions: [],
		workspaceState: {
			get: vi.fn(),
			update: vi.fn()
		}
	}),
	outputChannel: {
		appendLine: vi.fn(),
		dispose: vi.fn()
	},
	statusBarItem: {
		text: '',
		tooltip: '',
		command: '',
		show: vi.fn(),
		hide: vi.fn(),
		dispose: vi.fn()
	},
	terminal: {
		sendText: vi.fn(),
		show: vi.fn()
	},
	workspaceConfiguration: {
		get: vi.fn((section: string, defaultValue?: any) => {
			return typeof mockedExtensionSettingValues[section] !== 'undefined'
				? mockedExtensionSettingValues[section]
				: defaultValue;
		}),
		inspect: vi.fn((section: string) => ({
			defaultValue: extensionSettingDefaults[section],
			workspaceValue: mockedExtensionSettingValues[section],
			globalValue: mockedExtensionSettingValues[section]
		}))
	}
};


// @types/vscode 新增了 ExtensionContext 的必填成员 (secrets, extension 等), 用例不使用它们; 这里只补类型, 保留各成员的 Mock 类型
function asExtensionContext<T>(context: T) {
	return context as T & vscode.ExtensionContext;
}

/* Visual Studio Code API Mocks */

export const commands = {
	executeCommand: vi.fn((command: string, ...rest: any[]) => mockedCommands[command](...rest)),
	registerCommand: vi.fn((command: string, callback: (...args: any[]) => any) => {
		mockedCommands[command] = callback;
		return {
			dispose: () => {
				delete mockedCommands[command];
			}
		};
	})
};

export const env = {
	clipboard: {
		writeText: vi.fn()
	},
	openExternal: vi.fn()
};

export const extensions = {
	getExtension: vi.fn()
};

export const l10n = {
	t: (message: string, ...args: any[]) => message.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)]))
};

export const EventEmitter = vi.fn(function () {
	return {
		dispose: vi.fn(),
		event: vi.fn()
	};
});

export class Uri implements vscode.Uri {
	public readonly scheme: string;
	public readonly authority: string;
	public readonly path: string;
	public readonly query: string;
	public readonly fragment: string;

	protected constructor(scheme: string, authority?: string, path?: string, query?: string, fragment?: string) {
		this.scheme = scheme;
		this.authority = authority || '';
		this.path = path || '';
		this.query = query || '';
		this.fragment = fragment || '';
	}

	get fsPath() {
		return this.path;
	}

	public with(change: { scheme?: string | undefined; authority?: string | undefined; path?: string | undefined; query?: string | undefined; fragment?: string | undefined; }): vscode.Uri {
		return new Uri(change.scheme || this.scheme, change.authority || this.authority, change.path || this.path, change.query || this.query, change.fragment || this.fragment);
	}

	public toString() {
		return this.scheme + '://' + this.path + (this.query ? '?' + this.query : '') + (this.fragment ? '#' + this.fragment : '');
	}

	public toJSON() {
		return this;
	}

	public static file(path: string) {
		return new Uri('file', '', path);
	}

	public static parse(path: string) {
		const comps = path.match(/([a-z]+):\/\/([^?#]+)(\?([^#]+)|())(#(.+)|())/)!;
		return new Uri(comps[1], '', comps[2], comps[4], comps[6]);
	}
}

export class RelativePattern {
	public readonly baseUri: Uri;
	public readonly pattern: string;

	constructor(base: Uri, pattern: string) {
		this.baseUri = base;
		this.pattern = pattern;
	}
}

export class ThemeColor {
	public readonly id: string;

	constructor(id: string) {
		this.id = id;
	}
}

export class ThemeIcon {
	public readonly id: string;
	public readonly color: ThemeColor | undefined;

	constructor(id: string, color?: ThemeColor) {
		this.id = id;
		this.color = color;
	}
}

export enum StatusBarAlignment {
	Left = 1,
	Right = 2
}

export let version = '1.51.0';

export enum ViewColumn {
	Active = -1,
	Beside = -2,
	One = 1,
	Two = 2,
	Three = 3,
	Four = 4,
	Five = 5,
	Six = 6,
	Seven = 7,
	Eight = 8,
	Nine = 9
}

export const window = {
	activeTextEditor: undefined as any,
	createOutputChannel: vi.fn(() => mocks.outputChannel),
	createStatusBarItem: vi.fn(() => mocks.statusBarItem),
	createWebviewPanel: vi.fn(createWebviewPanel),
	createTerminal: vi.fn(() => mocks.terminal),
	showErrorMessage: vi.fn(),
	showInformationMessage: vi.fn(),
	showOpenDialog: vi.fn(),
	showQuickPick: vi.fn(),
	showSaveDialog: vi.fn(),
	tabGroups: { activeTabGroup: { activeTab: undefined as any } }
};

export const workspace = {
	createFileSystemWatcher: vi.fn(() => ({
		onDidCreate: vi.fn(),
		onDidChange: vi.fn(),
		onDidDelete: vi.fn(),
		dispose: vi.fn()
	})),
	getConfiguration: vi.fn(() => mocks.workspaceConfiguration),
	onDidChangeConfiguration: vi.fn<(listener: (e: vscode.ConfigurationChangeEvent) => void) => { dispose: Mock }>(() => ({ dispose: vi.fn() })),
	onDidChangeWorkspaceFolders: vi.fn<(listener: () => Promise<void>) => { dispose: Mock }>(() => ({ dispose: vi.fn() })),
	onDidCloseTextDocument: vi.fn<(listener: () => void) => { dispose: Mock }>(() => ({ dispose: vi.fn() })),
	workspaceFolders: <{ uri: Uri, index: number }[] | undefined>undefined
};

function createWebviewPanel(viewType: string, title: string, _showOptions: ViewColumn | { viewColumn: ViewColumn, preserveFocus?: boolean }, _options?: vscode.WebviewPanelOptions & vscode.WebviewOptions) {
	const mocks: WebviewPanelMocks = {
		messages: [],
		panel: {
			onDidChangeViewState: () => { },
			onDidDispose: () => { },
			setVisibility: (visible) => {
				webviewPanel.visible = visible;
				mocks.panel.onDidChangeViewState({ webviewPanel: webviewPanel });
			},
			webview: {
				onDidReceiveMessage: () => { }
			}
		}
	};

	const webviewPanel: Writeable<vscode.WebviewPanel> = {
		active: true,
		dispose: vi.fn(),
		iconPath: undefined,
		onDidChangeViewState: vi.fn((onDidChangeViewState) => {
			mocks.panel.onDidChangeViewState = onDidChangeViewState;
			return { dispose: vi.fn() };
		}),
		onDidDispose: vi.fn((onDidDispose) => {
			mocks.panel.onDidDispose = onDidDispose;
			return { dispose: vi.fn() };
		}),
		options: {},
		reveal: vi.fn((_viewColumn?: ViewColumn, _preserveFocus?: boolean) => { }),
		title: title,
		visible: true,
		viewType: viewType,
		viewColumn: undefined,
		webview: {
			asWebviewUri: vi.fn((uri: Uri) => uri.with({ scheme: 'vscode-webview-resource', path: 'file//' + uri.path.replace(/\\/g, '/') })),
			cspSource: 'vscode-webview-resource:',
			html: '',
			onDidReceiveMessage: vi.fn((onDidReceiveMessage) => {
				mocks.panel.webview.onDidReceiveMessage = onDidReceiveMessage;
				return { dispose: vi.fn() };
			}),
			options: {},
			postMessage: vi.fn((msg) => {
				mocks.messages.push(msg);
				return Promise.resolve(true);
			})
		}
	};

	mockedWebviews.push({ panel: webviewPanel, mocks: mocks });
	return webviewPanel;
}


/* Utilities */

beforeEach(() => {
	vi.clearAllMocks();

	window.activeTextEditor = {
		document: {
			uri: Uri.file('/path/to/workspace-folder/active-file.txt')
		},
		viewColumn: ViewColumn.One
	};
	window.tabGroups.activeTabGroup.activeTab = undefined;

	// Clear any mocked extension setting values before each test
	Object.keys(mockedExtensionSettingValues).forEach((section) => {
		delete mockedExtensionSettingValues[section];
	});

	mockedWebviews = [];

	version = '1.51.0';
});

export function mockExtensionSettingReturnValue(section: string, value: any) {
	mockedExtensionSettingValues[section] = value;
}

export function mockVscodeVersion(newVersion: string) {
	version = newVersion;
}

export function getMockedWebviewPanel(i: number) {
	return mockedWebviews[i];
}
