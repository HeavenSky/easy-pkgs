import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import * as date from './mocks/date';
import * as vscode from './mocks/vscode';
vi.mock('vscode', () => import('./mocks/vscode'));
vi.mock('../src/avatarManager');
vi.mock('../src/dataSource');
vi.mock('../src/extensionState');
vi.mock('../src/gitGraphView');
vi.mock('../src/logger');
vi.mock('../src/repoManager');
vi.mock('os', { spy: true });

import * as os from 'os';
import { ConfigurationChangeEvent } from 'vscode';
import { AvatarManager } from '../src/avatarManager';
import { CommandManager } from '../src/commands';
import { DataSource } from '../src/dataSource';
import { DiffSide, encodeDiffDocUri } from '../src/diffDocProvider';
import { ExtensionState } from '../src/extensionState';
import { GitGraphPanelView } from '../src/gitGraphPanelView';
import { GitGraphView } from '../src/gitGraphView';
import { Logger } from '../src/logger';
import { RepoManager } from '../src/repoManager';
import { GitFileStatus, RepoDropdownOrder } from '../src/types';
import * as utils from '../src/utils';
import { EventEmitter } from '../src/utils/event';

import { waitForExpect } from './helpers/expectations';
import { mockRepoState } from './helpers/utils';

let onDidChangeConfiguration: EventEmitter<ConfigurationChangeEvent>;
let onDidChangeGitExecutable: EventEmitter<utils.GitExecutable>;
let logger: Logger;
let dataSource: DataSource;
let extensionState: ExtensionState;
let avatarManager: AvatarManager;
let repoManager: RepoManager;
let spyOnGitGraphViewCreateOrShow: MockInstance, spyOnGetRepos: MockInstance, spyOnGetKnownRepo: MockInstance, spyOnRegisterRepo: MockInstance, spyOnGetCodeReviews: MockInstance, spyOnEndCodeReview: MockInstance, spyOnGetCommitSubject: MockInstance, spyOnLog: MockInstance, spyOnLogError: MockInstance;
beforeAll(() => {
	onDidChangeConfiguration = new EventEmitter<ConfigurationChangeEvent>();
	onDidChangeGitExecutable = new EventEmitter<utils.GitExecutable>();
	logger = new Logger();
	dataSource = new DataSource(null, onDidChangeConfiguration.subscribe, onDidChangeGitExecutable.subscribe, logger);
	extensionState = new ExtensionState(vscode.mocks.extensionContext, onDidChangeGitExecutable.subscribe);
	avatarManager = new AvatarManager(dataSource, extensionState, logger);
	repoManager = new RepoManager(dataSource, extensionState, onDidChangeConfiguration.subscribe, logger);
	spyOnGitGraphViewCreateOrShow = vi.spyOn(GitGraphView, 'createOrShow');
	spyOnGetRepos = vi.spyOn(repoManager, 'getRepos');
	spyOnGetKnownRepo = vi.spyOn(repoManager, 'getKnownRepo');
	spyOnRegisterRepo = vi.spyOn(repoManager, 'registerRepo');
	spyOnGetCodeReviews = vi.spyOn(extensionState, 'getCodeReviews');
	spyOnEndCodeReview = vi.spyOn(extensionState, 'endCodeReview');
	spyOnGetCommitSubject = vi.spyOn(dataSource, 'getCommitSubject');
	spyOnLog = vi.spyOn(logger, 'log');
	spyOnLogError = vi.spyOn(logger, 'logError');
});

afterAll(() => {
	repoManager.dispose();
	avatarManager.dispose();
	extensionState.dispose();
	dataSource.dispose();
	logger.dispose();
	onDidChangeConfiguration.dispose();
	onDidChangeGitExecutable.dispose();
});

describe('CommandManager', () => {
	let commandManager: CommandManager;
	beforeEach(() => {
		commandManager = new CommandManager(vscode.mocks.extensionContext, avatarManager, dataSource, extensionState, repoManager, { path: '/path/to/git', version: '2.25.0' }, onDidChangeGitExecutable.subscribe, logger);
	});
	afterEach(() => {
		commandManager.dispose();
	});

	it('Should construct a CommandManager, and be disposed', () => {
		// Assert
		expect(commandManager['disposables']).toHaveLength(21);
		expect(commandManager['gitExecutable']).toStrictEqual({
			path: '/path/to/git',
			version: '2.25.0'
		});

		// Run
		commandManager.dispose();

		// Assert
		expect(commandManager['disposables']).toHaveLength(0);
	});

	it('Should process onDidChangeGitExecutable events', () => {
		// Run
		onDidChangeGitExecutable.emit({
			path: '/path/to/other-git',
			version: '2.26.0'
		});

		// Assert
		expect(commandManager['gitExecutable']).toStrictEqual({
			path: '/path/to/other-git',
			version: '2.26.0'
		});
	});

	describe('easy-graph:codiconsSupported', () => {
		it('Should set easy-graph:codiconsSupported to TRUE when vscode.version >= 1.42.0', async () => {
			// Setup
			commandManager.dispose();
			vscode.mockVscodeVersion('1.42.0');
			const spyOnExecuteCommand = vi.spyOn(vscode.commands, 'executeCommand');
			vscode.commands.executeCommand.mockResolvedValueOnce(null);

			// Run
			commandManager = new CommandManager(vscode.mocks.extensionContext, avatarManager, dataSource, extensionState, repoManager, { path: '/path/to/git', version: '2.25.0' }, onDidChangeGitExecutable.subscribe, logger);

			// Assert
			await waitForExpect(() => {
				expect(spyOnExecuteCommand).toHaveBeenCalledWith('setContext', 'easy-graph:codiconsSupported', true);
				expect(spyOnLog).toHaveBeenCalledWith('Successfully set Visual Studio Code Context "easy-graph:codiconsSupported" to "true"');
			});
		});

		it('Should set easy-graph:codiconsSupported to FALSE when vscode.version < 1.42.0', async () => {
			// Setup
			commandManager.dispose();
			vscode.mockVscodeVersion('1.41.1');
			const spyOnExecuteCommand = vi.spyOn(vscode.commands, 'executeCommand');
			vscode.commands.executeCommand.mockResolvedValueOnce(null);

			// Run
			commandManager = new CommandManager(vscode.mocks.extensionContext, avatarManager, dataSource, extensionState, repoManager, { path: '/path/to/git', version: '2.25.0' }, onDidChangeGitExecutable.subscribe, logger);

			// Assert
			await waitForExpect(() => {
				expect(spyOnExecuteCommand).toHaveBeenCalledWith('setContext', 'easy-graph:codiconsSupported', false);
				expect(spyOnLog).toHaveBeenCalledWith('Successfully set Visual Studio Code Context "easy-graph:codiconsSupported" to "false"');
			});
		});

		it('Should log an error message when vscode.commands.executeCommand rejects', async () => {
			// Setup
			commandManager.dispose();
			const spyOnExecuteCommand = vi.spyOn(vscode.commands, 'executeCommand');

			vscode.commands.executeCommand.mockRejectedValueOnce(null);

			// Run
			commandManager = new CommandManager(vscode.mocks.extensionContext, avatarManager, dataSource, extensionState, repoManager, { path: '/path/to/git', version: '2.25.0' }, onDidChangeGitExecutable.subscribe, logger);

			// Assert
			await waitForExpect(() => {
				expect(spyOnExecuteCommand).toHaveBeenCalledWith('setContext', 'easy-graph:codiconsSupported', true);
				expect(spyOnLogError).toHaveBeenCalledWith('Failed to set Visual Studio Code Context "easy-graph:codiconsSupported" to "true"');
			});
		});

		it('Should log an error message when an exception is thrown', async () => {
			// Setup
			commandManager.dispose();
			const spyOnExecuteCommand = vi.spyOn(vscode.commands, 'executeCommand');
			const spyOnDoesVersionMeetRequirement = vi.spyOn(utils, 'doesVersionMeetRequirement');
			const spyOnLogError = vi.spyOn(logger, 'logError');
			vscode.commands.executeCommand.mockRejectedValueOnce(null);
			spyOnDoesVersionMeetRequirement.mockImplementationOnce(() => {
				throw new Error();
			});

			// Run
			commandManager = new CommandManager(vscode.mocks.extensionContext, avatarManager, dataSource, extensionState, repoManager, { path: '/path/to/git', version: '2.25.0' }, onDidChangeGitExecutable.subscribe, logger);

			// Assert
			await waitForExpect(() => {
				expect(spyOnExecuteCommand).toHaveBeenCalledWith('setContext', 'easy-graph:codiconsSupported', true);
				expect(spyOnLogError).toHaveBeenCalledWith('Unable to set Visual Studio Code Context "easy-graph:codiconsSupported"');
			});
		});
	});

	describe('easy-graph.view', () => {
		it('Should open the Easy Graph View', async () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('openToTheRepoOfTheActiveTextEditorDocument', false);

			// Run
			vscode.commands.executeCommand('easy-graph.view');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.view');
				expect(spyOnGitGraphViewCreateOrShow).toHaveBeenCalledWith('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger, null);
			});
		});

		it('Should close the Easy Graph View when it is active and easy-graph.toggleViewOnCommand is enabled', async () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('toggleViewOnCommand', true);
			const spyOnCloseIfActive = vi.spyOn(GitGraphView, 'closeIfActive').mockReturnValueOnce(true);

			// Run
			vscode.commands.executeCommand('easy-graph.view');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.view');
				expect(spyOnCloseIfActive).toHaveBeenCalledTimes(1);
			});
			expect(spyOnGitGraphViewCreateOrShow).not.toHaveBeenCalled();
		});

		it('Should open the Easy Graph View when it isn\'t active and easy-graph.toggleViewOnCommand is enabled', async () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('toggleViewOnCommand', true);
			vscode.mockExtensionSettingReturnValue('openToTheRepoOfTheActiveTextEditorDocument', false);
			vi.spyOn(GitGraphView, 'closeIfActive').mockReturnValueOnce(false);

			// Run
			vscode.commands.executeCommand('easy-graph.view');

			// Assert
			await waitForExpect(() => {
				expect(spyOnGitGraphViewCreateOrShow).toHaveBeenCalledWith('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger, null);
			});
		});

		it('Should open the Easy Graph View to the known repository', async () => {
			// Setup
			spyOnGetKnownRepo.mockResolvedValueOnce('/path/to/workspace-folder/repo');
			vscode.mockExtensionSettingReturnValue('openToTheRepoOfTheActiveTextEditorDocument', false);

			// Run
			vscode.commands.executeCommand('easy-graph.view', { rootUri: vscode.Uri.file('/path/to/workspace-folder/repo') });

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.view');
				expect(spyOnGitGraphViewCreateOrShow).toHaveBeenCalledWith('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger, { repo: '/path/to/workspace-folder/repo' });
			});
		});

		it('Should open the Easy Graph View to a newly registered repository', async () => {
			// Setup
			spyOnGetKnownRepo.mockResolvedValueOnce(null);
			spyOnRegisterRepo.mockResolvedValueOnce({ root: '/path/to/workspace-folder/repo', error: null });
			vscode.mockExtensionSettingReturnValue('openToTheRepoOfTheActiveTextEditorDocument', false);

			// Run
			vscode.commands.executeCommand('easy-graph.view', { rootUri: vscode.Uri.file('/path/to/workspace-folder/repo') });

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.view');
				expect(spyOnGitGraphViewCreateOrShow).toHaveBeenCalledWith('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger, { repo: '/path/to/workspace-folder/repo' });
			});
		});

		it('Should open the Easy Graph View to the repository containing the active text editor', async () => {
			// Setup
			vscode.window.activeTextEditor = { document: { uri: vscode.Uri.file('/path/to/workspace-folder/active-file.txt') } };
			vscode.mockExtensionSettingReturnValue('openToTheRepoOfTheActiveTextEditorDocument', true);
			vi.spyOn(repoManager, 'getRepoContainingFile').mockReturnValueOnce('/path/to/workspace-folder');

			// Run
			vscode.commands.executeCommand('easy-graph.view');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.view');
				expect(spyOnGitGraphViewCreateOrShow).toHaveBeenCalledWith('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger, { repo: '/path/to/workspace-folder' });
			});
		});

		it('Should open the Easy Graph View without a repository when the repository from the Source Control View can\'t be registered', async () => {
			// Setup
			spyOnGetKnownRepo.mockResolvedValueOnce(null);
			spyOnRegisterRepo.mockResolvedValueOnce({ root: null, error: 'The folder "/path/to/folder" is not a Git repository.' });

			// Run
			vscode.commands.executeCommand('easy-graph.view', { rootUri: vscode.Uri.file('/path/to/folder') });

			// Assert
			await waitForExpect(() => {
				expect(spyOnGitGraphViewCreateOrShow).toHaveBeenCalledWith('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger, null);
			});
		});
	});

	describe('easy-graph.viewLocation', () => {
		let show: MockInstance;
		beforeEach(() => {
			show = vi.fn(() => Promise.resolve());
			vi.spyOn(GitGraphPanelView, 'getInstance').mockReturnValue(<GitGraphPanelView><unknown>{ show: show });
			vscode.mockExtensionSettingReturnValue('openToTheRepoOfTheActiveTextEditorDocument', false);
		});
		afterEach(() => {
			vi.mocked(GitGraphPanelView.getInstance).mockRestore();
		});

		it('Should open easy-graph.view in the panel when easy-graph.viewLocation is "panel"', async () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('viewLocation', 'panel');
			spyOnGetKnownRepo.mockResolvedValueOnce('/path/to/workspace-folder/repo');

			// Run
			vscode.commands.executeCommand('easy-graph.view', { rootUri: vscode.Uri.file('/path/to/workspace-folder/repo') });

			// Assert
			await waitForExpect(() => {
				expect(GitGraphPanelView.getInstance).toHaveBeenCalledWith('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger);
				expect(show).toHaveBeenCalledWith({ repo: '/path/to/workspace-folder/repo' });
			});
			expect(spyOnGitGraphViewCreateOrShow).not.toHaveBeenCalled();
		});

		it('Should open easy-graph.view in the editor when easy-graph.viewLocation is "both"', async () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('viewLocation', 'both');

			// Run
			vscode.commands.executeCommand('easy-graph.view');

			// Assert
			await waitForExpect(() => {
				expect(spyOnGitGraphViewCreateOrShow).toHaveBeenCalledWith('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger, null);
			});
			expect(show).not.toHaveBeenCalled();
		});

		it('Should open easy-graph.viewInPanel in the panel regardless of easy-graph.viewLocation', async () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('viewLocation', 'editor');

			// Run
			vscode.commands.executeCommand('easy-graph.viewInPanel');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.viewInPanel');
				expect(show).toHaveBeenCalledWith(null);
			});
			expect(spyOnGitGraphViewCreateOrShow).not.toHaveBeenCalled();
		});

		it('Should open easy-graph.viewInEditor in the editor regardless of easy-graph.viewLocation', async () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('viewLocation', 'panel');

			// Run
			vscode.commands.executeCommand('easy-graph.viewInEditor');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.viewInEditor');
				expect(spyOnGitGraphViewCreateOrShow).toHaveBeenCalledWith('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger, null);
			});
			expect(show).not.toHaveBeenCalled();
		});

		it('Should display an error message instead of opening the panel when no Git executable is known', async () => {
			// Setup
			commandManager.dispose();
			commandManager = new CommandManager(vscode.mocks.extensionContext, avatarManager, dataSource, extensionState, repoManager, null, onDidChangeGitExecutable.subscribe, logger);
			vscode.window.showErrorMessage.mockResolvedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.viewInPanel');

			// Assert
			await waitForExpect(() => {
				expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Unable to find a Git executable.'));
			});
			expect(show).not.toHaveBeenCalled();
		});
	});

	describe('easy-graph.addGitRepository', () => {
		let spyOnIsPathInWorkspace: MockInstance;
		beforeAll(() => {
			spyOnIsPathInWorkspace = vi.spyOn(utils, 'isPathInWorkspace');
		});

		it('Should register the selected repository', async () => {
			// Setup
			vscode.window.showOpenDialog.mockResolvedValueOnce([vscode.Uri.file('/path/to/workspace-folder/repo')]);
			spyOnIsPathInWorkspace.mockReturnValueOnce(true);
			spyOnRegisterRepo.mockResolvedValueOnce({ root: '/path/to/workspace-folder/repo', error: null });
			vscode.window.showInformationMessage.mockResolvedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.addGitRepository');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.addGitRepository');
				expect(vscode.window.showOpenDialog).toHaveBeenCalledWith({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
				expect(spyOnIsPathInWorkspace).toHaveBeenCalledWith('/path/to/workspace-folder/repo');
				expect(spyOnRegisterRepo).toHaveBeenCalledWith('/path/to/workspace-folder/repo', false);
				expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('The repository "/path/to/workspace-folder/repo" was added to Easy Graph.');
			});
		});

		it('Should display the error message returned when registering the selected repository', async () => {
			// Setup
			vscode.window.showOpenDialog.mockResolvedValueOnce([vscode.Uri.file('/path/to/workspace-folder/repo')]);
			spyOnIsPathInWorkspace.mockReturnValueOnce(true);
			spyOnRegisterRepo.mockResolvedValueOnce({ root: null, error: 'The folder "/path/to/workspace-folder/repo" is not a Git repository.' });
			vscode.window.showErrorMessage.mockResolvedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.addGitRepository');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.addGitRepository');
				expect(vscode.window.showOpenDialog).toHaveBeenCalledWith({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
				expect(spyOnIsPathInWorkspace).toHaveBeenCalledWith('/path/to/workspace-folder/repo');
				expect(spyOnRegisterRepo).toHaveBeenCalledWith('/path/to/workspace-folder/repo', false);
				expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('The folder "/path/to/workspace-folder/repo" is not a Git repository. Therefore it could not be added to Easy Graph.');
			});
		});

		it('Should display an error message when the selected repository is not within the workspace', async () => {
			// Setup
			vscode.window.showOpenDialog.mockResolvedValueOnce([vscode.Uri.file('/path/to/non-workspace-folder/repo')]);
			spyOnIsPathInWorkspace.mockReturnValueOnce(false);
			vscode.window.showErrorMessage.mockResolvedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.addGitRepository');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.addGitRepository');
				expect(vscode.window.showOpenDialog).toHaveBeenCalledWith({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
				expect(spyOnIsPathInWorkspace).toHaveBeenCalledWith('/path/to/non-workspace-folder/repo');
				expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('The folder "/path/to/non-workspace-folder/repo" is not within the opened Visual Studio Code workspace, and therefore could not be added to Easy Graph.');
				expect(spyOnRegisterRepo).not.toHaveBeenCalled();
			});
		});

		it('Should not proceed to register a repository when none was selected', async () => {
			// Setup
			vscode.window.showOpenDialog.mockResolvedValueOnce([]);

			// Run
			vscode.commands.executeCommand('easy-graph.addGitRepository');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.addGitRepository');
				expect(vscode.window.showOpenDialog).toHaveBeenCalledWith({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
				expect(spyOnIsPathInWorkspace).not.toHaveBeenCalled();
			});
		});

		it('Should handle if showOpenDialog rejects', async () => {
			// Setup
			vscode.window.showOpenDialog.mockRejectedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.addGitRepository');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.addGitRepository');
				expect(vscode.window.showOpenDialog).toHaveBeenCalledWith({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
				expect(spyOnIsPathInWorkspace).not.toHaveBeenCalled();
			});
		});

		it('Should display an error message if no git executable is known', async () => {
			// Setup
			commandManager['gitExecutable'] = null;
			vscode.window.showErrorMessage.mockResolvedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.addGitRepository');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.addGitRepository');
				expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(utils.UNABLE_TO_FIND_GIT_MSG);
			});
		});
	});

	describe('easy-graph.removeGitRepository', () => {
		let spyOnIgnoreRepo: MockInstance;
		beforeAll(() => {
			spyOnIgnoreRepo = vi.spyOn(repoManager, 'ignoreRepo');
		});

		it('Should ignore the selected repository', async () => {
			// Setup
			const repos = {
				'/path/to/repo2': mockRepoState({ name: 'Custom Name', workspaceFolderIndex: 1 }),
				'/path/to/repo1': mockRepoState({ name: null, workspaceFolderIndex: 0 })
			};
			spyOnGetRepos.mockReturnValueOnce(repos);
			vscode.window.showQuickPick.mockResolvedValueOnce([{
				label: 'repo1',
				description: '/path/to/repo1'
			}]);
			spyOnIgnoreRepo.mockReturnValueOnce(true);
			vscode.window.showInformationMessage.mockResolvedValueOnce(null);
			const spyOnGetSortedRepositoryPaths = vi.spyOn(utils, 'getSortedRepositoryPaths');

			// Run
			vscode.commands.executeCommand('easy-graph.removeGitRepository');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.removeGitRepository');
				expect(spyOnGetSortedRepositoryPaths).toHaveBeenCalledWith(repos, RepoDropdownOrder.WorkspaceFullPath);
				expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
					[
						{
							label: 'repo1',
							description: '/path/to/repo1'
						},
						{
							label: 'Custom Name',
							description: '/path/to/repo2'
						}
					],
					{
						placeHolder: 'Select the repositories to remove from Easy Graph:',
						canPickMany: true
					}
				);
				expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('The repository "repo1" was removed from Easy Graph.');
			});
		});

		it('Should ignore all of the selected repositories', async () => {
			// Setup
			spyOnGetRepos.mockReturnValueOnce({
				'/path/to/repo1': mockRepoState({ name: null, workspaceFolderIndex: 0 }),
				'/path/to/repo2': mockRepoState({ name: 'Custom Name', workspaceFolderIndex: 0 })
			});
			vscode.window.showQuickPick.mockResolvedValueOnce([
				{ label: 'repo1', description: '/path/to/repo1' },
				{ label: 'Custom Name', description: '/path/to/repo2' }
			]);
			spyOnIgnoreRepo.mockReturnValueOnce(true);
			spyOnIgnoreRepo.mockReturnValueOnce(true);
			vscode.window.showInformationMessage.mockResolvedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.removeGitRepository');

			// Assert
			await waitForExpect(() => {
				expect(spyOnIgnoreRepo).toHaveBeenCalledWith('/path/to/repo1');
				expect(spyOnIgnoreRepo).toHaveBeenCalledWith('/path/to/repo2');
				expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('The repositories "repo1", "Custom Name" were removed from Easy Graph.');
			});
		});

		it('Should display an error message if the selected repository no longer exists', async () => {
			// Setup
			spyOnGetRepos.mockReturnValueOnce({
				'/path/to/repo1': mockRepoState({ name: null, workspaceFolderIndex: 0 }),
				'/path/to/repo2': mockRepoState({ name: 'Custom Name', workspaceFolderIndex: 0 })
			});
			vscode.window.showQuickPick.mockResolvedValueOnce([{
				label: 'repo1',
				description: '/path/to/repo1'
			}]);
			spyOnIgnoreRepo.mockReturnValueOnce(false);
			vscode.window.showErrorMessage.mockResolvedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.removeGitRepository');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.removeGitRepository');
				expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
					[
						{
							label: 'repo1',
							description: '/path/to/repo1'
						},
						{
							label: 'Custom Name',
							description: '/path/to/repo2'
						}
					],
					{
						placeHolder: 'Select the repositories to remove from Easy Graph:',
						canPickMany: true
					}
				);
				expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('The repository "repo1" is not known to Easy Graph.');
			});
		});

		it('Shouldn\'t attempt to ignore a repository if none was selected', async () => {
			// Setup
			spyOnGetRepos.mockReturnValueOnce({
				'/path/to/repo1': mockRepoState({ name: null, workspaceFolderIndex: 0 }),
				'/path/to/repo2': mockRepoState({ name: 'Custom Name', workspaceFolderIndex: 0 })
			});
			vscode.window.showQuickPick.mockResolvedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.removeGitRepository');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.removeGitRepository');
				expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
					[
						{
							label: 'repo1',
							description: '/path/to/repo1'
						},
						{
							label: 'Custom Name',
							description: '/path/to/repo2'
						}
					],
					{
						placeHolder: 'Select the repositories to remove from Easy Graph:',
						canPickMany: true
					}
				);
				expect(spyOnIgnoreRepo).not.toHaveBeenCalled();
			});
		});

		it('Should handle if showQuickPick rejects', async () => {
			// Setup
			spyOnGetRepos.mockReturnValueOnce({
				'/path/to/repo1': mockRepoState({ name: null, workspaceFolderIndex: 0 }),
				'/path/to/repo2': mockRepoState({ name: 'Custom Name', workspaceFolderIndex: 0 })
			});
			vscode.window.showQuickPick.mockRejectedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.removeGitRepository');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.removeGitRepository');
				expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
					[
						{
							label: 'repo1',
							description: '/path/to/repo1'
						},
						{
							label: 'Custom Name',
							description: '/path/to/repo2'
						}
					],
					{
						placeHolder: 'Select the repositories to remove from Easy Graph:',
						canPickMany: true
					}
				);
			});
		});

		it('Should display an error message if no git executable is known', async () => {
			// Setup
			commandManager['gitExecutable'] = null;
			vscode.window.showErrorMessage.mockResolvedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.removeGitRepository');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.removeGitRepository');
				expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(utils.UNABLE_TO_FIND_GIT_MSG);
			});
		});
	});

	describe('easy-graph.switchRepository', () => {
		const twoRepos = () => ({
			'/path/to/repo-b': mockRepoState({ name: 'Backend', workspaceFolderIndex: 1 }),
			'/path/to/repo-a': mockRepoState({ name: null, workspaceFolderIndex: 0 })
		});
		const expectedItems = [
			{ label: 'repo-a', description: '/path/to/repo-a' },
			{ label: 'Backend', description: '/path/to/repo-b' }
		];
		const expectedOptions = { placeHolder: 'Select the repository you want to open in Easy Graph:', canPickMany: false };

		it('Should offer the repositories in the dropdown order, and show the chosen one in the Easy Graph View', async () => {
			// Setup
			spyOnGetRepos.mockReturnValueOnce(twoRepos());
			vscode.window.showQuickPick.mockResolvedValueOnce(expectedItems[1]);

			// Run
			vscode.commands.executeCommand('easy-graph.switchRepository');

			// Assert
			await waitForExpect(() => {
				expect(spyOnGitGraphViewCreateOrShow).toHaveBeenCalledWith('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger, { repo: '/path/to/repo-b' });
			});
			expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.switchRepository');
			expect(vscode.window.showQuickPick).toHaveBeenCalledWith(expectedItems, expectedOptions);
		});

		it('Should show the chosen repository in the panel when easy-graph.viewLocation is "panel"', async () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('viewLocation', 'panel');
			const panelView = { show: vi.fn() };
			const spyOnGetPanelInstance = vi.spyOn(GitGraphPanelView, 'getInstance').mockReturnValueOnce(<any>panelView);
			spyOnGetRepos.mockReturnValueOnce(twoRepos());
			vscode.window.showQuickPick.mockResolvedValueOnce(expectedItems[0]);

			// Run
			vscode.commands.executeCommand('easy-graph.switchRepository');

			// Assert
			await waitForExpect(() => {
				expect(panelView.show).toHaveBeenCalledWith({ repo: '/path/to/repo-a' });
			});
			expect(spyOnGitGraphViewCreateOrShow).not.toHaveBeenCalled();
			spyOnGetPanelInstance.mockRestore();
		});

		it.each([undefined, null])('Shouldn\'t open the Easy Graph View when the quick pick is dismissed (resolves %s)', async (result) => {
			// Setup
			spyOnGetRepos.mockReturnValueOnce(twoRepos());
			vscode.window.showQuickPick.mockResolvedValueOnce(result);

			// Run
			vscode.commands.executeCommand('easy-graph.switchRepository');

			// Assert
			await waitForExpect(() => {
				expect(vscode.window.showQuickPick).toHaveBeenCalledWith(expectedItems, expectedOptions);
			});
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(spyOnGitGraphViewCreateOrShow).not.toHaveBeenCalled();
			expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
		});

		it('Should display an error message when the quick pick fails', async () => {
			// Setup
			spyOnGetRepos.mockReturnValueOnce(twoRepos());
			vscode.window.showQuickPick.mockRejectedValueOnce(new Error());
			vscode.window.showErrorMessage.mockResolvedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.switchRepository');

			// Assert
			await waitForExpect(() => {
				expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('An unexpected error occurred while running the command "Switch Repository...".');
			});
			expect(spyOnGitGraphViewCreateOrShow).not.toHaveBeenCalled();
		});

		it('Should show the only repository without asking', async () => {
			// Setup
			spyOnGetRepos.mockReturnValueOnce({ '/path/to/repo-a': mockRepoState({ name: null, workspaceFolderIndex: 0 }) });

			// Run
			vscode.commands.executeCommand('easy-graph.switchRepository');

			// Assert
			await waitForExpect(() => {
				expect(spyOnGitGraphViewCreateOrShow).toHaveBeenCalledWith('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger, { repo: '/path/to/repo-a' });
			});
			expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
		});

		it('Should open the Easy Graph View without a repository when no repository is known', async () => {
			// Setup
			spyOnGetRepos.mockReturnValueOnce({});

			// Run
			vscode.commands.executeCommand('easy-graph.switchRepository');

			// Assert
			await waitForExpect(() => {
				expect(spyOnGitGraphViewCreateOrShow).toHaveBeenCalledWith('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger, null);
			});
			expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
		});
	});

	describe('easy-graph.clearAvatarCache', () => {
		let spyOnClearCache: MockInstance;
		beforeAll(() => {
			spyOnClearCache = vi.spyOn(avatarManager, 'clearCache');
		});

		it('Should clear the avatar cache, and display a success message', async () => {
			// Setup
			spyOnClearCache.mockResolvedValueOnce(null);
			vscode.window.showInformationMessage.mockResolvedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.clearAvatarCache');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.clearAvatarCache');
				expect(spyOnClearCache).toBeCalledTimes(1);
				expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('The Avatar Cache was successfully cleared.');
			});
		});

		it('Should display the error message returned by AvatarManager.clearCache', async () => {
			// Setup
			const errorMessage = 'Visual Studio Code was unable to save the Easy Graph Global State Memento.';
			spyOnClearCache.mockResolvedValueOnce(errorMessage);
			vscode.window.showErrorMessage.mockResolvedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.clearAvatarCache');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.clearAvatarCache');
				expect(spyOnClearCache).toBeCalledTimes(1);
				expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(errorMessage);
			});
		});

		it('Should display an error message when AvatarManager.clearCache rejects', async () => {
			// Setup
			spyOnClearCache.mockRejectedValueOnce(null);
			vscode.window.showErrorMessage.mockResolvedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.clearAvatarCache');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.clearAvatarCache');
				expect(spyOnClearCache).toBeCalledTimes(1);
				expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('An unexpected error occurred while running the command "Clear Avatar Cache".');
			});
		});
	});

	describe('easy-graph.fetch', () => {
		let spyOnGetLastActiveRepo: MockInstance;
		beforeAll(() => {
			spyOnGetLastActiveRepo = vi.spyOn(extensionState, 'getLastActiveRepo');
		});

		it('Should fetch in the panel when easy-graph.viewLocation is "panel"', async () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('viewLocation', 'panel');
			const panelView = { show: vi.fn() };
			const spyOnGetPanelInstance = vi.spyOn(GitGraphPanelView, 'getInstance').mockReturnValueOnce(<any>panelView);
			spyOnGetRepos.mockReturnValueOnce({ '/path/to/repo': mockRepoState({ name: null, workspaceFolderIndex: 0 }) });

			// Run
			vscode.commands.executeCommand('easy-graph.fetch');

			// Assert
			await waitForExpect(() => {
				expect(panelView.show).toHaveBeenCalledWith({ repo: '/path/to/repo', runCommandOnLoad: 'fetch' });
			});
			expect(spyOnGitGraphViewCreateOrShow).not.toHaveBeenCalled();
			spyOnGetPanelInstance.mockRestore();
		});

		it('Should display a quick pick to select a repository to open in the Easy Graph View (with last active repository first)', async () => {
			// Setup
			const repos = {
				'/path/to/repo3': mockRepoState({ name: null, workspaceFolderIndex: 2 }),
				'/path/to/repo2': mockRepoState({ name: 'Custom Name', workspaceFolderIndex: 1 }),
				'/path/to/repo1': mockRepoState({ name: null, workspaceFolderIndex: 0 })
			};
			spyOnGetRepos.mockReturnValueOnce(repos);
			spyOnGetLastActiveRepo.mockReturnValueOnce('/path/to/repo2');
			vscode.window.showQuickPick.mockResolvedValueOnce({
				label: 'repo1',
				description: '/path/to/repo1'
			});
			const spyOnGetSortedRepositoryPaths = vi.spyOn(utils, 'getSortedRepositoryPaths');

			// Run
			vscode.commands.executeCommand('easy-graph.fetch');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.fetch');
				expect(spyOnGetSortedRepositoryPaths).toHaveBeenCalledWith(repos, RepoDropdownOrder.WorkspaceFullPath);
				expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
					[
						{
							label: 'Custom Name',
							description: '/path/to/repo2'
						},
						{
							label: 'repo1',
							description: '/path/to/repo1'
						},
						{
							label: 'repo3',
							description: '/path/to/repo3'
						}
					],
					{
						placeHolder: 'Select the repository you want to open in Easy Graph, and fetch from remote(s):',
						canPickMany: false
					}
				);
				expect(spyOnGitGraphViewCreateOrShow).toHaveBeenCalledWith('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger, { repo: '/path/to/repo1', runCommandOnLoad: 'fetch' });
			});
		});

		it('Should display a quick pick to select a repository to open in the Easy Graph View (no last active repository)', async () => {
			// Setup
			spyOnGetRepos.mockReturnValueOnce({
				'/path/to/repo1': mockRepoState({ name: null, workspaceFolderIndex: 0 }),
				'/path/to/repo2': mockRepoState({ name: 'Custom Name', workspaceFolderIndex: 0 })
			});
			spyOnGetLastActiveRepo.mockReturnValueOnce(null);
			vscode.window.showQuickPick.mockResolvedValueOnce({
				label: 'repo1',
				description: '/path/to/repo1'
			});

			// Run
			vscode.commands.executeCommand('easy-graph.fetch');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.fetch');
				expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
					[
						{
							label: 'repo1',
							description: '/path/to/repo1'
						},
						{
							label: 'Custom Name',
							description: '/path/to/repo2'
						}
					],
					{
						placeHolder: 'Select the repository you want to open in Easy Graph, and fetch from remote(s):',
						canPickMany: false
					}
				);
				expect(spyOnGitGraphViewCreateOrShow).toHaveBeenCalledWith('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger, { repo: '/path/to/repo1', runCommandOnLoad: 'fetch' });
			});
		});

		it('Should display a quick pick to select a repository to open in the Easy Graph View (last active repository is unknown)', async () => {
			// Setup
			spyOnGetRepos.mockReturnValueOnce({
				'/path/to/repo1': mockRepoState({ name: null, workspaceFolderIndex: 0 }),
				'/path/to/repo2': mockRepoState({ name: 'Custom Name', workspaceFolderIndex: 0 })
			});
			spyOnGetLastActiveRepo.mockReturnValueOnce('/path/to/repo3');
			vscode.window.showQuickPick.mockResolvedValueOnce({
				label: 'repo1',
				description: '/path/to/repo1'
			});

			// Run
			vscode.commands.executeCommand('easy-graph.fetch');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.fetch');
				expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
					[
						{
							label: 'repo1',
							description: '/path/to/repo1'
						},
						{
							label: 'Custom Name',
							description: '/path/to/repo2'
						}
					],
					{
						placeHolder: 'Select the repository you want to open in Easy Graph, and fetch from remote(s):',
						canPickMany: false
					}
				);
				expect(spyOnGitGraphViewCreateOrShow).toHaveBeenCalledWith('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger, { repo: '/path/to/repo1', runCommandOnLoad: 'fetch' });
			});
		});

		it('Shouldn\'t open the Easy Graph View when no item is selected in the quick pick', async () => {
			// Setup
			spyOnGetRepos.mockReturnValueOnce({
				'/path/to/repo1': mockRepoState({ name: null, workspaceFolderIndex: 0 }),
				'/path/to/repo2': mockRepoState({ name: 'Custom Name', workspaceFolderIndex: 0 })
			});
			spyOnGetLastActiveRepo.mockReturnValueOnce('/path/to/repo3');
			vscode.window.showQuickPick.mockResolvedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.fetch');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.fetch');
				expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
					[
						{
							label: 'repo1',
							description: '/path/to/repo1'
						},
						{
							label: 'Custom Name',
							description: '/path/to/repo2'
						}
					],
					{
						placeHolder: 'Select the repository you want to open in Easy Graph, and fetch from remote(s):',
						canPickMany: false
					}
				);
				expect(spyOnGitGraphViewCreateOrShow).not.toHaveBeenCalled();
			});
		});

		it('Should display an error message when showQuickPick rejects', async () => {
			// Setup
			spyOnGetRepos.mockReturnValueOnce({
				'/path/to/repo1': mockRepoState({ name: null, workspaceFolderIndex: 0 }),
				'/path/to/repo2': mockRepoState({ name: 'Custom Name', workspaceFolderIndex: 0 })
			});
			spyOnGetLastActiveRepo.mockReturnValueOnce('/path/to/repo2');
			vscode.window.showQuickPick.mockRejectedValueOnce(null);
			vscode.window.showErrorMessage.mockResolvedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.fetch');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.fetch');
				expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
					[
						{
							label: 'Custom Name',
							description: '/path/to/repo2'
						},
						{
							label: 'repo1',
							description: '/path/to/repo1'
						}
					],
					{
						placeHolder: 'Select the repository you want to open in Easy Graph, and fetch from remote(s):',
						canPickMany: false
					}
				);
				expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('An unexpected error occurred while running the command "Fetch from Remote(s)".');
				expect(spyOnGitGraphViewCreateOrShow).not.toHaveBeenCalled();
			});
		});

		it('Should open the Easy Graph View immediately when there is only one repository', async () => {
			// Setup
			spyOnGetRepos.mockReturnValueOnce({
				'/path/to/repo1': mockRepoState({ name: null, workspaceFolderIndex: 0 })
			});

			// Run
			vscode.commands.executeCommand('easy-graph.fetch');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.fetch');
				expect(spyOnGitGraphViewCreateOrShow).toHaveBeenCalledWith('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger, { repo: '/path/to/repo1', runCommandOnLoad: 'fetch' });
			});
		});

		it('Should open the Easy Graph View immediately when there are no repositories', async () => {
			// Setup
			spyOnGetRepos.mockReturnValueOnce({});

			// Run
			vscode.commands.executeCommand('easy-graph.fetch');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.fetch');
				expect(spyOnGitGraphViewCreateOrShow).toHaveBeenCalledWith('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger, null);
			});
		});
	});

	describe('easy-graph.goToRef', () => {
		let spyOnGetRefList: MockInstance;
		beforeAll(() => {
			spyOnGetRefList = vi.spyOn(dataSource, 'getRefList');
		});

		it('Should display a quick pick of the branches and tags, and scroll the Easy Graph View to the selected one', async () => {
			// Setup
			spyOnGetRepos.mockReturnValueOnce({
				'/path/to/repo1': mockRepoState({ name: null, workspaceFolderIndex: 0 })
			});
			spyOnGetRefList.mockResolvedValueOnce({
				head: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
				heads: [{ hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', name: 'master' }],
				tags: [
					{ hash: '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c', name: 'v1.0', annotated: false },
					{ hash: '3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d', name: 'v1.0', annotated: true }
				],
				remotes: [{ hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', name: 'origin/master' }]
			});
			vscode.window.showQuickPick.mockResolvedValueOnce({ label: '$(tag) v1.0', description: '3c4d5e6', hash: '3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d' });

			// Run
			vscode.commands.executeCommand('easy-graph.goToRef');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.goToRef');
				expect(spyOnGetRefList).toHaveBeenCalledWith('/path/to/repo1');
				expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
					[
						{ label: '$(git-branch) master', description: utils.abbrevCommit('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'), hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b' },
						{ label: '$(cloud) origin/master', description: utils.abbrevCommit('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'), hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b' },
						{ label: '$(tag) v1.0', description: utils.abbrevCommit('3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d'), hash: '3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d' }
					],
					{ placeHolder: 'Select a branch or tag to go to:', matchOnDescription: true }
				);
				expect(spyOnGitGraphViewCreateOrShow).toHaveBeenCalledWith('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger, { repo: '/path/to/repo1', scrollToCommit: '3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d' });
			});
		});

		it('Should display an error message when no repositories are known', async () => {
			// Setup
			spyOnGetRepos.mockReturnValueOnce({});
			vscode.window.showErrorMessage.mockResolvedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.goToRef');

			// Assert
			await waitForExpect(() => {
				expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('No Git repositories are known to Easy Graph.');
			});
		});
	});

	describe('easy-graph.endAllWorkspaceCodeReviews', () => {
		it('Should end all workspace code reviews', () => {
			// Setup
			const spyOnEndAllWorkspaceCodeReviews = vi.spyOn(extensionState, 'endAllWorkspaceCodeReviews');
			vscode.window.showInformationMessage.mockResolvedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.endAllWorkspaceCodeReviews');

			// Assert
			expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.endAllWorkspaceCodeReviews');
			expect(spyOnEndAllWorkspaceCodeReviews).toBeCalledTimes(1);
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Ended All Code Reviews in Workspace');
		});
	});

	describe('easy-graph.endSpecificWorkspaceCodeReview', () => {
		it('Should end the selected code review', async () => {
			// Setup
			spyOnGetCodeReviews.mockReturnValueOnce({
				'/path/to/repo': {
					'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b': {
						lastActive: (date.now - 5) * 1000,
						lastViewedFile: null,
						remainingFiles: ['file.txt']
					}
				}
			});
			spyOnGetRepos.mockReturnValueOnce({
				'/path/to/repo': mockRepoState({ name: null, workspaceFolderIndex: 0 })
			});
			spyOnGetCommitSubject.mockResolvedValueOnce('Commit Subject');
			vscode.window.showQuickPick.mockImplementationOnce((items: Promise<any[]>) => items.then((items) => items[0]));
			spyOnEndCodeReview.mockResolvedValueOnce(null);
			vscode.window.showInformationMessage.mockResolvedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.endSpecificWorkspaceCodeReview');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.endSpecificWorkspaceCodeReview');
				expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Successfully ended Code Review "repo: 1a2b3c4".');
			});
			expect(spyOnGetCommitSubject).toHaveBeenCalledWith('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b');
			expect(spyOnEndCodeReview).toHaveBeenCalledWith('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b');
			expect(await vscode.window.showQuickPick.mock.calls[0][0]).toStrictEqual([
				{
					codeReviewRepo: '/path/to/repo',
					codeReviewId: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
					label: 'repo: 1a2b3c4',
					description: '5 seconds ago',
					detail: 'Commit Subject'
				}
			]);
			expect(vscode.window.showQuickPick.mock.calls[0][1]).toStrictEqual({
				placeHolder: 'Select the Code Review you want to end:',
				canPickMany: false
			});
		});

		it('Should display an error message when there are no code reviews', () => {
			// Setup
			spyOnGetCodeReviews.mockReturnValueOnce({});
			vscode.window.showErrorMessage.mockResolvedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.endSpecificWorkspaceCodeReview');

			// Assert
			expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.endSpecificWorkspaceCodeReview');
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('There are no Code Reviews in progress within the current workspace.');
			expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
		});

		it('Shouldn\'t end a code review if no code review was selected', async () => {
			// Setup
			spyOnGetCodeReviews.mockReturnValueOnce({
				'/path/to/repo': {
					'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b': {
						lastActive: (date.now - 5) * 1000,
						lastViewedFile: null,
						remainingFiles: ['file.txt']
					}
				}
			});
			spyOnGetRepos.mockReturnValueOnce({
				'/path/to/repo': mockRepoState({ name: null, workspaceFolderIndex: 0 })
			});
			spyOnGetCommitSubject.mockResolvedValueOnce('Commit Subject');
			vscode.window.showQuickPick.mockResolvedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.endSpecificWorkspaceCodeReview');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.endSpecificWorkspaceCodeReview');
				expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(1);
				expect(spyOnEndCodeReview).not.toHaveBeenCalled();
			});
		});

		it('Should handle endCodeReview rejecting', async () => {
			// Setup
			spyOnGetCodeReviews.mockReturnValueOnce({
				'/path/to/repo': {
					'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b': {
						lastActive: (date.now - 5) * 1000,
						lastViewedFile: null,
						remainingFiles: ['file.txt']
					}
				}
			});
			spyOnGetRepos.mockReturnValueOnce({
				'/path/to/repo': mockRepoState({ name: null, workspaceFolderIndex: 0 })
			});
			spyOnGetCommitSubject.mockResolvedValueOnce('Commit Subject');
			vscode.window.showQuickPick.mockImplementationOnce((items: Promise<any[]>) => items.then((items) => items[0]));
			spyOnEndCodeReview.mockRejectedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.endSpecificWorkspaceCodeReview');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.endSpecificWorkspaceCodeReview');
				expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(1);
				expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
				expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
			});
		});

		it('Should display an error message when the code review couldn\'t be ended', async () => {
			// Setup
			spyOnGetCodeReviews.mockReturnValueOnce({
				'/path/to/repo': {
					'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b': {
						lastActive: (date.now - 5) * 1000,
						lastViewedFile: null,
						remainingFiles: ['file.txt']
					}
				}
			});
			spyOnGetRepos.mockReturnValueOnce({
				'/path/to/repo': mockRepoState({ name: null, workspaceFolderIndex: 0 })
			});
			spyOnGetCommitSubject.mockResolvedValueOnce('Commit Subject');
			vscode.window.showQuickPick.mockImplementationOnce((items: Promise<any[]>) => items.then((items) => items[0]));
			spyOnEndCodeReview.mockResolvedValueOnce('Visual Studio Code was unable to save the Easy Graph Workspace State Memento.');
			vscode.window.showErrorMessage.mockResolvedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.endSpecificWorkspaceCodeReview');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.endSpecificWorkspaceCodeReview');
				expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Visual Studio Code was unable to save the Easy Graph Workspace State Memento.');
			});
		});

		it('Should display an error message when showQuickPick rejects', async () => {
			// Setup
			spyOnGetCodeReviews.mockReturnValueOnce({
				'/path/to/repo': {
					'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b': {
						lastActive: (date.now - 5) * 1000,
						lastViewedFile: null,
						remainingFiles: ['file.txt']
					}
				}
			});
			spyOnGetRepos.mockReturnValueOnce({
				'/path/to/repo': mockRepoState({ name: null, workspaceFolderIndex: 0 })
			});
			spyOnGetCommitSubject.mockResolvedValueOnce('Commit Subject');
			vscode.window.showQuickPick.mockRejectedValueOnce(null);
			vscode.window.showErrorMessage.mockResolvedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.endSpecificWorkspaceCodeReview');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.endSpecificWorkspaceCodeReview');
				expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('An unexpected error occurred while running the command "End a specific Code Review in Workspace...".');
			});
		});
	});

	describe('easy-graph.resumeWorkspaceCodeReview', () => {
		it('Should load the selected code review in the Easy Graph View (single commit)', async () => {
			// Setup
			spyOnGetCodeReviews.mockReturnValueOnce({
				'/path/to/repo': {
					'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b': {
						lastActive: (date.now - 10) * 1000,
						lastViewedFile: null,
						remainingFiles: ['file.txt']
					},
					'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c': {
						lastActive: (date.now - 5) * 1000,
						lastViewedFile: null,
						remainingFiles: ['file.txt']
					}
				},
				'/path/to/unknown-repo': {
					'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b': {
						lastActive: (date.now - 10) * 1000,
						lastViewedFile: null,
						remainingFiles: ['file.txt']
					}
				}
			});
			spyOnGetRepos.mockReturnValueOnce({
				'/path/to/repo': mockRepoState({ name: null, workspaceFolderIndex: 0 })
			});
			spyOnGetCommitSubject.mockImplementationOnce((_: string, hash: string) => hash === '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b' ? 'subject-' + hash : null);
			spyOnGetCommitSubject.mockImplementationOnce((_: string, hash: string) => hash === '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b' ? 'subject-' + hash : null);
			vscode.window.showQuickPick.mockImplementationOnce((items: Promise<any[]>) => items.then((items) => items[0]));

			// Run
			vscode.commands.executeCommand('easy-graph.resumeWorkspaceCodeReview');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.resumeWorkspaceCodeReview');
				expect(spyOnGitGraphViewCreateOrShow).toHaveBeenCalledWith('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger, {
					repo: '/path/to/repo',
					commitDetails: {
						commitHash: '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c',
						compareWithHash: null
					}
				});
			});
			expect(spyOnGetCommitSubject).toHaveBeenCalledTimes(2);
			expect(spyOnGetCommitSubject).toHaveBeenCalledWith('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b');
			expect(spyOnGetCommitSubject).toHaveBeenCalledWith('/path/to/repo', '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c');
			expect(await vscode.window.showQuickPick.mock.calls[0][0]).toStrictEqual([
				{
					codeReviewRepo: '/path/to/repo',
					codeReviewId: '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c',
					label: 'repo: 2b3c4d5',
					description: '5 seconds ago',
					detail: '<Unknown Commit Subject>'
				},
				{
					codeReviewRepo: '/path/to/repo',
					codeReviewId: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
					label: 'repo: 1a2b3c4',
					description: '10 seconds ago',
					detail: 'subject-1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'
				}
			]);
			expect(vscode.window.showQuickPick.mock.calls[0][1]).toStrictEqual({
				placeHolder: 'Select the Code Review you want to resume:',
				canPickMany: false
			});
		});

		it('Should load the selected code review in the Easy Graph View (commit comparison)', async () => {
			// Setup
			spyOnGetCodeReviews.mockReturnValueOnce({
				'/path/to/repo': {
					'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b-2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c': {
						lastActive: (date.now - 5) * 1000,
						lastViewedFile: null,
						remainingFiles: ['file.txt']
					}
				}
			});
			spyOnGetRepos.mockReturnValueOnce({
				'/path/to/repo': mockRepoState({ name: null, workspaceFolderIndex: 0 })
			});
			spyOnGetCommitSubject.mockImplementationOnce((_: string, hash: string) => 'subject-' + hash);
			spyOnGetCommitSubject.mockImplementationOnce((_: string, hash: string) => 'subject-' + hash);
			vscode.window.showQuickPick.mockImplementationOnce((items: Promise<any[]>) => items.then((items) => items[0]));

			// Run
			vscode.commands.executeCommand('easy-graph.resumeWorkspaceCodeReview');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.resumeWorkspaceCodeReview');
				expect(spyOnGitGraphViewCreateOrShow).toHaveBeenCalledWith('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger, {
					repo: '/path/to/repo',
					commitDetails: {
						commitHash: '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c',
						compareWithHash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'
					}
				});
			});
			expect(await vscode.window.showQuickPick.mock.calls[0][0]).toStrictEqual([
				{
					codeReviewRepo: '/path/to/repo',
					codeReviewId: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b-2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c',
					label: 'repo: 1a2b3c4 ↔ 2b3c4d5',
					description: '5 seconds ago',
					detail: 'subject-1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b ↔ subject-2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c'
				}
			]);
			expect(vscode.window.showQuickPick.mock.calls[0][1]).toStrictEqual({
				placeHolder: 'Select the Code Review you want to resume:',
				canPickMany: false
			});
		});

		it('Shouldn\'t load the the Easy Graph View if no code review was selected', async () => {
			// Setup
			spyOnGetCodeReviews.mockReturnValueOnce({
				'/path/to/repo': {
					'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b': {
						lastActive: (date.now - 5) * 1000,
						lastViewedFile: null,
						remainingFiles: ['file.txt']
					}
				}
			});
			spyOnGetRepos.mockReturnValueOnce({
				'/path/to/repo': mockRepoState({ name: null, workspaceFolderIndex: 0 })
			});
			spyOnGetCommitSubject.mockResolvedValueOnce('Commit Subject');
			vscode.window.showQuickPick.mockResolvedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.resumeWorkspaceCodeReview');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.resumeWorkspaceCodeReview');
				expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(1);
				expect(spyOnGitGraphViewCreateOrShow).not.toHaveBeenCalled();
			});
		});

		it('Should display an error message when there are no code reviews', () => {
			// Setup
			spyOnGetCodeReviews.mockReturnValueOnce({});
			vscode.window.showErrorMessage.mockResolvedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.resumeWorkspaceCodeReview');

			// Assert
			expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.resumeWorkspaceCodeReview');
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('There are no Code Reviews in progress within the current workspace.');
			expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
		});

		it('Should display an error message when showQuickPick rejects', async () => {
			// Setup
			spyOnGetCodeReviews.mockReturnValueOnce({
				'/path/to/repo': {
					'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b': {
						lastActive: (date.now - 5) * 1000,
						lastViewedFile: null,
						remainingFiles: ['file.txt']
					}
				}
			});
			spyOnGetRepos.mockReturnValueOnce({
				'/path/to/repo': mockRepoState({ name: null, workspaceFolderIndex: 0 })
			});
			spyOnGetCommitSubject.mockResolvedValueOnce('Commit Subject');
			vscode.window.showQuickPick.mockRejectedValueOnce(null);
			vscode.window.showErrorMessage.mockResolvedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.resumeWorkspaceCodeReview');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.resumeWorkspaceCodeReview');
				expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('An unexpected error occurred while running the command "Resume a specific Code Review in Workspace...".');
			});
		});
	});

	describe('easy-graph.version', () => {
		let spyOnCopyToClipboard: MockInstance, spyOnGetExtensionVersion: MockInstance, spyOnOsType: MockInstance, spyOnOsArch: MockInstance, spyOnOsRelease: MockInstance;
		beforeAll(() => {
			spyOnCopyToClipboard = vi.spyOn(utils, 'copyToClipboard');
			spyOnGetExtensionVersion = vi.spyOn(utils, 'getExtensionVersion');
			spyOnOsType = vi.spyOn(os, 'type');
			spyOnOsArch = vi.spyOn(os, 'arch');
			spyOnOsRelease = vi.spyOn(os, 'release');
		});

		it('Should display the version information, and copy it to the clipboard', async () => {
			// Setup
			spyOnGetExtensionVersion.mockResolvedValueOnce('1.27.0');
			vscode.window.showInformationMessage.mockResolvedValueOnce('Copy');
			spyOnCopyToClipboard.mockResolvedValueOnce(null);
			spyOnOsType.mockReturnValueOnce('X');
			spyOnOsArch.mockReturnValueOnce('Y');
			spyOnOsRelease.mockReturnValueOnce('Z');

			// Run
			vscode.commands.executeCommand('easy-graph.version');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.version');
				expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Easy Graph: 1.27.0\nVisual Studio Code: 1.51.0\nOS: X Y Z\nGit: 2.25.0', { modal: true }, 'Copy');
				expect(spyOnCopyToClipboard).toHaveBeenCalledWith('Easy Graph: 1.27.0\nVisual Studio Code: 1.51.0\nOS: X Y Z\nGit: 2.25.0');
			});
		});

		it('Shouldn\'t copy the version information to the clipboard if the user closes the information message modal', async () => {
			// Setup
			commandManager['gitExecutable'] = null;
			spyOnGetExtensionVersion.mockResolvedValueOnce('1.27.0');
			vscode.window.showInformationMessage.mockResolvedValueOnce('');
			spyOnOsType.mockReturnValueOnce('X');
			spyOnOsArch.mockReturnValueOnce('Y');
			spyOnOsRelease.mockReturnValueOnce('Z');

			// Run
			vscode.commands.executeCommand('easy-graph.version');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.version');
				expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Easy Graph: 1.27.0\nVisual Studio Code: 1.51.0\nOS: X Y Z\nGit: (none)', { modal: true }, 'Copy');
				expect(spyOnCopyToClipboard).not.toHaveBeenCalled();
			});
		});

		it('Should display an error message when the extension version couldn\'t be retrieved', async () => {
			// Setup
			spyOnGetExtensionVersion.mockRejectedValueOnce(null);
			vscode.window.showErrorMessage.mockResolvedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.version');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.version');
				expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('An unexpected error occurred while retrieving version information.');
			});
		});

		it('Should display an error message when the version information couldn\'t be copied to the clipboard', async () => {
			// Setup
			spyOnGetExtensionVersion.mockResolvedValueOnce('1.27.0');
			vscode.window.showInformationMessage.mockResolvedValueOnce('Copy');
			vscode.window.showErrorMessage.mockResolvedValueOnce(null);
			spyOnCopyToClipboard.mockResolvedValueOnce('error message');
			spyOnOsType.mockReturnValueOnce('X');
			spyOnOsArch.mockReturnValueOnce('Y');
			spyOnOsRelease.mockReturnValueOnce('Z');

			// Run
			vscode.commands.executeCommand('easy-graph.version');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.version');
				expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Easy Graph: 1.27.0\nVisual Studio Code: 1.51.0\nOS: X Y Z\nGit: 2.25.0', { modal: true }, 'Copy');
				expect(spyOnCopyToClipboard).toHaveBeenCalledWith('Easy Graph: 1.27.0\nVisual Studio Code: 1.51.0\nOS: X Y Z\nGit: 2.25.0');
				expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('error message');
			});
		});

		it('Should handle if showInformationMessage rejects', async () => {
			// Setup
			spyOnGetExtensionVersion.mockResolvedValueOnce('1.27.0');
			vscode.window.showInformationMessage.mockRejectedValueOnce(null);
			spyOnOsType.mockReturnValueOnce('X');
			spyOnOsArch.mockReturnValueOnce('Y');
			spyOnOsRelease.mockReturnValueOnce('Z');

			// Run
			vscode.commands.executeCommand('easy-graph.version');

			// Assert
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.version');
				expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Easy Graph: 1.27.0\nVisual Studio Code: 1.51.0\nOS: X Y Z\nGit: 2.25.0', { modal: true }, 'Copy');
				expect(spyOnCopyToClipboard).not.toHaveBeenCalled();
			});
		});
	});

	describe('easy-graph.openFile', () => {
		let spyOnOpenFile: MockInstance;
		beforeAll(() => {
			spyOnOpenFile = vi.spyOn(utils, 'openFile');
		});

		it('Should open the provided file', async () => {
			spyOnOpenFile.mockResolvedValueOnce(null);

			// Run
			await vscode.commands.executeCommand('easy-graph.openFile', encodeDiffDocUri('/path/to/repo', 'subfolder/modified.txt', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', GitFileStatus.Modified, DiffSide.New));

			// Assert
			expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.openFile');
			expect(spyOnOpenFile).toHaveBeenCalledWith('/path/to/repo', 'subfolder/modified.txt', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', dataSource, vscode.ViewColumn.Active);
		});

		it('Should open the file of the active text editor', async () => {
			vscode.window.activeTextEditor = { document: { uri: encodeDiffDocUri('/path/to/repo', 'subfolder/modified.txt', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', GitFileStatus.Modified, DiffSide.New) } };
			spyOnOpenFile.mockResolvedValueOnce(null);

			// Run
			await vscode.commands.executeCommand('easy-graph.openFile');

			// Assert
			expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.openFile');
			expect(spyOnOpenFile).toHaveBeenCalledWith('/path/to/repo', 'subfolder/modified.txt', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', dataSource, vscode.ViewColumn.Active);
		});

		it('Should display an error message when no URI is provided', async () => {
			vscode.window.activeTextEditor = undefined;
			vscode.window.showErrorMessage.mockResolvedValueOnce(null);

			// Run
			await vscode.commands.executeCommand('easy-graph.openFile');

			// Assert
			expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.openFile');
			expect(spyOnOpenFile).not.toHaveBeenCalled();
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Unable to Open File: The command was not called with the required arguments.');
		});

		it('Should display an error message when no Easy Graph URI is provided', async () => {
			vscode.window.activeTextEditor = { document: { uri: vscode.Uri.file('/path/to/workspace-folder/active-file.txt') } };
			vscode.window.showErrorMessage.mockResolvedValueOnce(null);

			// Run
			await vscode.commands.executeCommand('easy-graph.openFile');

			// Assert
			expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.openFile');
			expect(spyOnOpenFile).not.toHaveBeenCalled();
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Unable to Open File: The command was not called with the required arguments.');
		});

		it('Should display an error message when the file can\'t be opened', async () => {
			vscode.window.activeTextEditor = { document: { uri: encodeDiffDocUri('/path/to/repo', 'subfolder/modified.txt', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', GitFileStatus.Modified, DiffSide.New) } };
			spyOnOpenFile.mockResolvedValueOnce('Error Message');
			vscode.window.showErrorMessage.mockResolvedValueOnce(null);

			// Run
			await vscode.commands.executeCommand('easy-graph.openFile');

			// Assert
			expect(spyOnLog).toHaveBeenCalledWith('Command Invoked: easy-graph.openFile');
			expect(spyOnOpenFile).toHaveBeenCalledWith('/path/to/repo', 'subfolder/modified.txt', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', dataSource, vscode.ViewColumn.Active);
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Unable to Open File: Error Message');
		});
	});

	describe('easy-graph.goToCommit', () => {
		let spyOnResolveCommit: MockInstance;
		beforeAll(() => {
			spyOnResolveCommit = vi.spyOn(dataSource, 'resolveCommit');
		});

		it('Should show the commit of an Easy Graph URI in the Easy Graph View', async () => {
			// Setup
			spyOnResolveCommit.mockResolvedValueOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b');

			// Run
			await vscode.commands.executeCommand('easy-graph.goToCommit', encodeDiffDocUri('/path/to/repo', 'subfolder/modified.txt', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b^', GitFileStatus.Modified, DiffSide.Old));

			// Assert
			await waitForExpect(() => {
				expect(spyOnResolveCommit).toHaveBeenCalledWith('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b^');
				expect(spyOnGitGraphViewCreateOrShow).toHaveBeenCalledWith('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger, { repo: '/path/to/repo', scrollToCommit: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b' });
			});
		});

		it('Should show the commit of a Git Extension URI (of the active text editor) in the Easy Graph View', async () => {
			// Setup
			vscode.window.activeTextEditor = { document: { uri: vscode.Uri.file('/path/to/repo/file.txt').with({ scheme: 'git', query: JSON.stringify({ path: '/path/to/repo/file.txt', ref: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b' }) }) } };
			vi.spyOn(repoManager, 'getRepoContainingFile').mockReturnValueOnce('/path/to/repo');
			spyOnResolveCommit.mockResolvedValueOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b');

			// Run
			await vscode.commands.executeCommand('easy-graph.goToCommit');

			// Assert
			await waitForExpect(() => {
				expect(repoManager.getRepoContainingFile).toHaveBeenCalledWith('/path/to/repo/file.txt');
				expect(spyOnGitGraphViewCreateOrShow).toHaveBeenCalledWith('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger, { repo: '/path/to/repo', scrollToCommit: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b' });
			});
		});

		it('Should display an error message when the URI isn\'t supported', async () => {
			// Setup
			vscode.window.activeTextEditor = { document: { uri: vscode.Uri.file('/path/to/workspace-folder/active-file.txt') } };
			vscode.window.showErrorMessage.mockResolvedValueOnce(null);

			// Run
			await vscode.commands.executeCommand('easy-graph.goToCommit');

			// Assert
			await waitForExpect(() => {
				expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Unable to Go to Commit: The command was not called with the required arguments.');
			});
			expect(spyOnGitGraphViewCreateOrShow).not.toHaveBeenCalled();
		});

		it('Should locate the Uncommitted Changes of an Easy Graph URI, and the index of a Git Extension URI, at HEAD', async () => {
			// Setup
			vi.spyOn(repoManager, 'getRepoContainingFile').mockReturnValue('/path/to/repo');
			spyOnResolveCommit.mockResolvedValue('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b');
			const gitUri = (ref: string) => vscode.Uri.file('/path/to/repo/file.txt').with({ scheme: 'git', query: JSON.stringify({ path: '/path/to/repo/file.txt', ref: ref }) });

			// Run
			await vscode.commands.executeCommand('easy-graph.goToCommit', encodeDiffDocUri('/path/to/repo', 'deleted.txt', utils.UNCOMMITTED, GitFileStatus.Deleted, DiffSide.New));
			await vscode.commands.executeCommand('easy-graph.goToCommit', gitUri(''));
			await vscode.commands.executeCommand('easy-graph.goToCommit', gitUri('~'));

			// Assert
			expect(spyOnResolveCommit).toHaveBeenCalledTimes(3);
			expect(spyOnResolveCommit.mock.calls.every((args) => args[0] === '/path/to/repo' && args[1] === 'HEAD')).toBe(true);
			vi.spyOn(repoManager, 'getRepoContainingFile').mockReset();
			spyOnResolveCommit.mockReset();
		});

		it('Should use the other side of the active Diff View when the menu provides the working file', async () => {
			// Setup
			const workingFileUri = vscode.Uri.file('/path/to/repo/file.txt');
			vscode.window.activeTextEditor = { document: { uri: workingFileUri } };
			vscode.window.tabGroups.activeTabGroup.activeTab = { input: { original: encodeDiffDocUri('/path/to/repo', 'file.txt', '1a2b3c4d', GitFileStatus.Modified, DiffSide.Old), modified: workingFileUri } };
			spyOnResolveCommit.mockResolvedValueOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b');

			// Run
			await vscode.commands.executeCommand('easy-graph.goToCommit', workingFileUri, { groupId: 1 });

			// Assert
			expect(spyOnResolveCommit).toHaveBeenCalledWith('/path/to/repo', '1a2b3c4d');
			expect(spyOnGitGraphViewCreateOrShow).toHaveBeenCalledWith('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger, { repo: '/path/to/repo', scrollToCommit: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b' });
		});

		it('Should display an error message (instead of throwing) when the query of the URI is malformed', async () => {
			// Setup
			vscode.window.showErrorMessage.mockResolvedValue(null);

			// Run
			await vscode.commands.executeCommand('easy-graph.goToCommit', vscode.Uri.file('file.txt').with({ scheme: 'easy-graph', query: 'bm90IGpzb24=' }));
			await vscode.commands.executeCommand('easy-graph.goToCommit', vscode.Uri.file('/path/to/repo/file.txt').with({ scheme: 'git', query: '{' }));

			// Assert
			expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(2);
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Unable to Go to Commit: The command was not called with the required arguments.');
			expect(spyOnResolveCommit).not.toHaveBeenCalled();
			expect(spyOnGitGraphViewCreateOrShow).not.toHaveBeenCalled();
			vscode.window.showErrorMessage.mockReset();
		});

		it('Should display an error message when the file of a Git Extension URI isn\'t in a known repository', async () => {
			// Setup
			vi.spyOn(repoManager, 'getRepoContainingFile').mockReturnValueOnce(null);
			vscode.window.showErrorMessage.mockResolvedValueOnce(null);

			// Run
			await vscode.commands.executeCommand('easy-graph.goToCommit', vscode.Uri.file('/path/to/other/file.txt').with({ scheme: 'git', query: JSON.stringify({ path: '/path/to/other/file.txt', ref: 'HEAD' }) }));

			// Assert
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Unable to Go to Commit: The command was not called with the required arguments.');
			expect(spyOnResolveCommit).not.toHaveBeenCalled();
			expect(spyOnGitGraphViewCreateOrShow).not.toHaveBeenCalled();
		});

		it('Should display an error message when the revision can\'t be resolved to a commit', async () => {
			// Setup
			spyOnResolveCommit.mockResolvedValueOnce(null);
			vscode.window.showErrorMessage.mockResolvedValueOnce(null);

			// Run
			await vscode.commands.executeCommand('easy-graph.goToCommit', encodeDiffDocUri('/path/to/repo', 'file.txt', 'deadbeef', GitFileStatus.Modified, DiffSide.New));

			// Assert
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Unable to Go to Commit: Unable to resolve "deadbeef" to a commit.');
			expect(spyOnGitGraphViewCreateOrShow).not.toHaveBeenCalled();
		});
	});

	describe('easy-graph.showReflog', () => {
		it('Should show the selected reflog entry in the Easy Graph View', async () => {
			// Setup
			spyOnGetRepos.mockReturnValueOnce({ '/path/to/repo': mockRepoState() });
			vi.spyOn(dataSource, 'getReflog').mockResolvedValueOnce([
				{ hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', selector: 'HEAD@{0}', message: 'commit: Subject', date: 0 }
			]);
			vscode.window.showQuickPick.mockImplementationOnce((items: any) => Promise.resolve(items[0]));

			// Run
			vscode.commands.executeCommand('easy-graph.showReflog');

			// Assert
			await waitForExpect(() => {
				expect(dataSource.getReflog).toHaveBeenCalledWith('/path/to/repo', 500);
				expect(vscode.window.showQuickPick).toHaveBeenCalledWith([{ label: utils.abbrevCommit('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b') + '  commit: Subject', description: 'HEAD@{0}', hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b' }], expect.objectContaining({ matchOnDescription: true }));
				expect(spyOnGitGraphViewCreateOrShow).toHaveBeenCalledWith('/path/to/extension', dataSource, extensionState, avatarManager, repoManager, logger, { repo: '/path/to/repo', scrollToCommit: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b' });
			});
		});
	});

	describe('easy-graph.manageBackups', () => {
		it('Should display a message when there are no backups', async () => {
			// Setup
			spyOnGetRepos.mockReturnValueOnce({ '/path/to/repo': mockRepoState() });
			vi.spyOn(dataSource, 'getBackups').mockResolvedValueOnce([]);
			vscode.window.showInformationMessage.mockResolvedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.manageBackups');

			// Assert
			await waitForExpect(() => {
				expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('There are no backups in this repository. Backups are created before dangerous actions when the setting "easy-graph.repository.backupBeforeDangerousActions" is enabled.');
			});
		});

		it('Should delete the selected backup', async () => {
			// Setup
			spyOnGetRepos.mockReturnValueOnce({ '/path/to/repo': mockRepoState() });
			vi.spyOn(dataSource, 'getBackups').mockResolvedValueOnce([{ ref: 'refs/easy-graph/backup/20240101-000000-000-reset-main', hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', subject: 'Subject' }]);
			const spyOnDeleteBackups = vi.spyOn(dataSource, 'deleteBackups').mockResolvedValueOnce(null);
			vscode.window.showQuickPick.mockImplementationOnce((items: any) => Promise.resolve(items[0]));
			vscode.window.showQuickPick.mockImplementationOnce((items: any) => Promise.resolve(items[3]));
			vscode.window.showInformationMessage.mockResolvedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.manageBackups');

			// Assert
			await waitForExpect(() => {
				expect(spyOnDeleteBackups).toHaveBeenCalledWith('/path/to/repo', ['refs/easy-graph/backup/20240101-000000-000-reset-main']);
				expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('The backup "20240101-000000-000-reset-main" was deleted.');
			});
		});
	});

	describe('easy-graph.resetRememberedDialogChoices', () => {
		it('Should reset the remembered dialog choices', async () => {
			// Setup
			vi.spyOn(extensionState, 'getGlobalViewState').mockReturnValueOnce({ alwaysAcceptCheckoutCommit: true, issueLinkingConfig: null, pushTagSkipRemoteCheck: true });
			const spyOnSetGlobalViewState = vi.spyOn(extensionState, 'setGlobalViewState').mockResolvedValueOnce(null);
			vscode.window.showInformationMessage.mockResolvedValueOnce(null);

			// Run
			vscode.commands.executeCommand('easy-graph.resetRememberedDialogChoices');

			// Assert
			await waitForExpect(() => {
				expect(spyOnSetGlobalViewState).toHaveBeenCalledWith({ alwaysAcceptCheckoutCommit: false, issueLinkingConfig: null, pushTagSkipRemoteCheck: false });
				expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('The remembered dialog choices were reset, the confirmation dialogs will be shown again.');
			});
		});
	});
});
