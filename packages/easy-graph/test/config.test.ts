import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from './mocks/vscode';
vi.mock('vscode', () => import('./mocks/vscode'));

import { getConfig, getRepoScopeFromLegacyOverrides, setGraphViewColumn } from '../src/config';
import { BooleanOverride, CommitDetailsViewLocation, CommitOrdering, DateFormatType, DateType, FileViewType, GitPushBranchMode, GitResetMode, GraphStyle, GraphUncommittedChangesStyle, KeybindingModifier, RepoDropdownOrder, SquashMessageFormat, TagType } from '../src/types';

import { expectExtensionSettingToHaveBeenCalled } from './helpers/expectations';

const workspaceConfiguration = vscode.mocks.workspaceConfiguration;

type Config = ReturnType<typeof getConfig>;

describe('Config', () => {
	let config: Config;
	beforeEach(() => {
		config = getConfig();
	});

	it('Should construct a Config instance', () => {
		// Run
		getConfig();

		// Assert
		expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('easy-graph', undefined);
	});

	it('Should construct a Config instance (for a specific repository)', () => {
		// Run
		getConfig('/path/to/repo');

		// Assert
		expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('easy-graph', {
			scheme: 'file',
			authority: '',
			path: '/path/to/repo',
			query: '',
			fragment: ''
		});
	});

	describe('commitDetailsView', () => {
		describe('autoCenter', () => {
			it('Should return TRUE when the configuration value is TRUE', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('commitDetailsView.autoCenter', true);

				// Run
				const value = config.commitDetailsView.autoCenter;

				// Assert
				expectExtensionSettingToHaveBeenCalled('commitDetailsView.autoCenter');
				expect(value).toBe(true);
			});

			it('Should return FALSE when the configuration value is FALSE', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('commitDetailsView.autoCenter', false);

				// Run
				const value = config.commitDetailsView.autoCenter;

				// Assert
				expectExtensionSettingToHaveBeenCalled('commitDetailsView.autoCenter');
				expect(value).toBe(false);
			});

			it('Should return TRUE when the configuration value is truthy', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('commitDetailsView.autoCenter', 5);

				// Run
				const value = config.commitDetailsView.autoCenter;

				// Assert
				expectExtensionSettingToHaveBeenCalled('commitDetailsView.autoCenter');
				expect(value).toBe(true);
			});

			it('Should return FALSE when the configuration value is falsy', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('commitDetailsView.autoCenter', 0);

				// Run
				const value = config.commitDetailsView.autoCenter;

				// Assert
				expectExtensionSettingToHaveBeenCalled('commitDetailsView.autoCenter');
				expect(value).toBe(false);
			});

			it('Should return the default value (TRUE) when the configuration value is unknown', () => {
				// Run
				const value = config.commitDetailsView.autoCenter;

				// Assert
				expectExtensionSettingToHaveBeenCalled('commitDetailsView.autoCenter');
				expect(value).toBe(true);
			});
		});

		describe('fileTreeCompactFolders', () => {
			it('Should return TRUE when the configuration value is TRUE', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('commitDetailsView.fileView.fileTree.compactFolders', true);

				// Run
				const value = config.commitDetailsView.fileTreeCompactFolders;

				// Assert
				expectExtensionSettingToHaveBeenCalled('commitDetailsView.fileView.fileTree.compactFolders');
				expect(value).toBe(true);
			});

			it('Should return FALSE when the configuration value is FALSE', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('commitDetailsView.fileView.fileTree.compactFolders', false);

				// Run
				const value = config.commitDetailsView.fileTreeCompactFolders;

				// Assert
				expectExtensionSettingToHaveBeenCalled('commitDetailsView.fileView.fileTree.compactFolders');
				expect(value).toBe(false);
			});

			it('Should return TRUE when the configuration value is truthy', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('commitDetailsView.fileView.fileTree.compactFolders', 5);

				// Run
				const value = config.commitDetailsView.fileTreeCompactFolders;

				// Assert
				expectExtensionSettingToHaveBeenCalled('commitDetailsView.fileView.fileTree.compactFolders');
				expect(value).toBe(true);
			});

			it('Should return FALSE when the configuration value is falsy', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('commitDetailsView.fileView.fileTree.compactFolders', 0);

				// Run
				const value = config.commitDetailsView.fileTreeCompactFolders;

				// Assert
				expectExtensionSettingToHaveBeenCalled('commitDetailsView.fileView.fileTree.compactFolders');
				expect(value).toBe(false);
			});

			it('Should return the default value (TRUE) when the configuration value is unknown', () => {
				// Run
				const value = config.commitDetailsView.fileTreeCompactFolders;

				// Assert
				expectExtensionSettingToHaveBeenCalled('commitDetailsView.fileView.fileTree.compactFolders');
				expect(value).toBe(true);
			});
		});

		describe('fileViewType', () => {
			it('Should return FileViewType.Tree when the configuration value is "File Tree"', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('commitDetailsView.fileView.type', 'File Tree');

				// Run
				const value = config.commitDetailsView.fileViewType;

				// Assert
				expectExtensionSettingToHaveBeenCalled('commitDetailsView.fileView.type');
				expect(value).toBe(FileViewType.Tree);
			});

			it('Should return FileViewType.List when the configuration value is "File List"', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('commitDetailsView.fileView.type', 'File List');

				// Run
				const value = config.commitDetailsView.fileViewType;

				// Assert
				expectExtensionSettingToHaveBeenCalled('commitDetailsView.fileView.type');
				expect(value).toBe(FileViewType.List);
			});

			it('Should return the default value (FileViewType.Tree) when the configuration value is invalid', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('commitDetailsView.fileView.type', 'invalid');

				// Run
				const value = config.commitDetailsView.fileViewType;

				// Assert
				expectExtensionSettingToHaveBeenCalled('commitDetailsView.fileView.type');
				expect(value).toBe(FileViewType.Tree);
			});

			it('Should return the default value (FileViewType.Tree) when the configuration value is unknown', () => {
				// Run
				const value = config.commitDetailsView.fileViewType;

				// Assert
				expectExtensionSettingToHaveBeenCalled('commitDetailsView.fileView.type');
				expect(value).toBe(FileViewType.Tree);
			});
		});

		describe('hiddenFields', () => {
			it('Should return the configured fields', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('commitDetailsView.hiddenFields', ['parents', 'notes']);

				// Run
				const value = config.commitDetailsView.hiddenFields;

				// Assert
				expect(workspaceConfiguration.get).toBeCalledWith('commitDetailsView.hiddenFields', []);
				expect(value).toStrictEqual(['parents', 'notes']);
			});

			it('Should ignore values that are not strings', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('commitDetailsView.hiddenFields', ['parents', 5, null]);

				// Run
				const value = config.commitDetailsView.hiddenFields;

				// Assert
				expect(value).toStrictEqual(['parents']);
			});

			it('Should return the default value ([]) when the configuration value is invalid', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('commitDetailsView.hiddenFields', 'parents');

				// Run
				const value = config.commitDetailsView.hiddenFields;

				// Assert
				expect(value).toStrictEqual([]);
			});

			it('Should return the default value ([]) when the configuration value is unknown', () => {
				// Run
				const value = config.commitDetailsView.hiddenFields;

				// Assert
				expect(value).toStrictEqual([]);
			});
		});

		describe('location', () => {
			it('Should return CommitDetailsViewLocation.Inline when the configuration value is "Inline"', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('commitDetailsView.location', 'Inline');

				// Run
				const value = config.commitDetailsView.location;

				// Assert
				expectExtensionSettingToHaveBeenCalled('commitDetailsView.location');
				expect(value).toBe(CommitDetailsViewLocation.Inline);
			});

			it('Should return CommitDetailsViewLocation.DockedToBottom when the configuration value is "Docked to Bottom"', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('commitDetailsView.location', 'Docked to Bottom');

				// Run
				const value = config.commitDetailsView.location;

				// Assert
				expectExtensionSettingToHaveBeenCalled('commitDetailsView.location');
				expect(value).toBe(CommitDetailsViewLocation.DockedToBottom);
			});

			it('Should return the default value (CommitDetailsViewLocation.Inline) when the configuration value is invalid', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('commitDetailsView.location', 'invalid');

				// Run
				const value = config.commitDetailsView.location;

				// Assert
				expectExtensionSettingToHaveBeenCalled('commitDetailsView.location');
				expect(value).toBe(CommitDetailsViewLocation.Inline);
			});

			it('Should return the default value (CommitDetailsViewLocation.Inline) when the configuration value is unknown', () => {
				// Run
				const value = config.commitDetailsView.location;

				// Assert
				expectExtensionSettingToHaveBeenCalled('commitDetailsView.location');
				expect(value).toBe(CommitDetailsViewLocation.Inline);
			});
		});

		describe('autoScroll', () => {
			it('Should scroll to the commit when the setting is not set', () => {
				expect(config.commitDetailsView.autoScroll).toBe(true);
				expect(workspaceConfiguration.get).toHaveBeenCalledWith('commitDetailsView.autoScroll', true);
			});

			it.each([[true, true], [false, false], [1, true], [0, false]])('Should use the configured value %s as %s', (configured, expected) => {
				vscode.mockExtensionSettingReturnValue('commitDetailsView.autoScroll', configured);
				expect(config.commitDetailsView.autoScroll).toBe(expected);
			});
		});
	});

	describe('contextMenuActionsVisibility', () => {
		it('Should return the default value (all items enabled) when the configuration value is invalid', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('contextMenuActionsVisibility', 1);

			// Run
			const value = config.contextMenuActionsVisibility;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('contextMenuActionsVisibility', {});
			expect(value).toStrictEqual({
				branch: {
					checkout: true,
					rename: true,
					delete: true,
					deleteMultiple: true,
					merge: true,
					rebase: true,
					push: true,
					pull: true,
					createBranch: true,
					viewIssue: true,
					createPullRequest: true,
					createArchive: true,
					selectInBranchesDropdown: true,
					unselectInBranchesDropdown: true,
					hide: true,
					copyName: true
				},
				commit: {
					addTag: true,
					createBranch: true,
					checkout: true,
					compareWithWorkingTree: true,
					cherrypick: true,
					revert: true,
					drop: true,
					squash: true,
					merge: true,
					rebase: true,
					rebaseOnto: true,
					reset: true,
					undo: true,
					editMessage: true,
					createFixup: true,
					pushToCommit: true,
					savePatch: true,
					applyPatch: true,
					viewPatch: true,
					viewAllChanges: true,
					browseFiles: true,
					editNotes: true,
					viewChangesFromParent: true,
					selectMergeBase: true,
					copyHash: true,
					copySubject: true,
					copySubjectsBetween: true,
					copyPatch: true
				},
				commitDetailsViewFile: {
					viewDiff: true,
					viewAllChanges: true,
					viewFileAtThisRevision: true,
					viewDiffWithWorkingFile: true,
					openFile: true,
					openInExternalDiffTool: true,
					markAsReviewed: true,
					markAsNotReviewed: true,
					resetFileToThisRevision: true,
					copyAbsoluteFilePath: true,
					copyRelativeFilePath: true,
					copyAllRelativeFilePaths: true
				},
				remoteBranch: {
					checkout: true,
					delete: true,
					fetch: true,
					merge: true,
					pull: true,
					createBranch: true,
					viewIssue: true,
					createPullRequest: true,
					createArchive: true,
					selectInBranchesDropdown: true,
					unselectInBranchesDropdown: true,
					hide: true,
					hideRemote: true,
					copyName: true
				},
				stash: {
					apply: true,
					createBranch: true,
					pop: true,
					drop: true,
					copyName: true,
					copyHash: true,
					viewAllChanges: true
				},
				tag: {
					viewDetails: true,
					checkout: true,
					delete: true,
					push: true,
					createArchive: true,
					copyName: true
				},
				uncommittedChanges: {
					stash: true,
					applyPatch: true,
					reset: true,
					clean: true,
					viewAllChanges: true,
					openSourceControlView: true
				}
			});
		});

		it('Should return the default value (all items enabled) when the configuration value is not set', () => {
			// Run
			const value = config.contextMenuActionsVisibility;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('contextMenuActionsVisibility', {});
			expect(value).toStrictEqual({
				branch: {
					checkout: true,
					rename: true,
					delete: true,
					deleteMultiple: true,
					merge: true,
					rebase: true,
					push: true,
					pull: true,
					createBranch: true,
					viewIssue: true,
					createPullRequest: true,
					createArchive: true,
					selectInBranchesDropdown: true,
					unselectInBranchesDropdown: true,
					hide: true,
					copyName: true
				},
				commit: {
					addTag: true,
					createBranch: true,
					checkout: true,
					compareWithWorkingTree: true,
					cherrypick: true,
					revert: true,
					drop: true,
					squash: true,
					merge: true,
					rebase: true,
					rebaseOnto: true,
					reset: true,
					undo: true,
					editMessage: true,
					createFixup: true,
					pushToCommit: true,
					savePatch: true,
					applyPatch: true,
					viewPatch: true,
					viewAllChanges: true,
					browseFiles: true,
					editNotes: true,
					viewChangesFromParent: true,
					selectMergeBase: true,
					copyHash: true,
					copySubject: true,
					copySubjectsBetween: true,
					copyPatch: true
				},
				commitDetailsViewFile: {
					viewDiff: true,
					viewAllChanges: true,
					viewFileAtThisRevision: true,
					viewDiffWithWorkingFile: true,
					openFile: true,
					openInExternalDiffTool: true,
					markAsReviewed: true,
					markAsNotReviewed: true,
					resetFileToThisRevision: true,
					copyAbsoluteFilePath: true,
					copyRelativeFilePath: true,
					copyAllRelativeFilePaths: true
				},
				remoteBranch: {
					checkout: true,
					delete: true,
					fetch: true,
					merge: true,
					pull: true,
					createBranch: true,
					viewIssue: true,
					createPullRequest: true,
					createArchive: true,
					selectInBranchesDropdown: true,
					unselectInBranchesDropdown: true,
					hide: true,
					hideRemote: true,
					copyName: true
				},
				stash: {
					apply: true,
					createBranch: true,
					pop: true,
					drop: true,
					copyName: true,
					copyHash: true,
					viewAllChanges: true
				},
				tag: {
					viewDetails: true,
					checkout: true,
					delete: true,
					push: true,
					createArchive: true,
					copyName: true
				},
				uncommittedChanges: {
					stash: true,
					applyPatch: true,
					reset: true,
					clean: true,
					viewAllChanges: true,
					openSourceControlView: true
				}
			});
		});

		it('Should only affect the provided configuration overrides', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('contextMenuActionsVisibility', {
				branch: {
					rename: false
				},
				commit: {
					checkout: false
				},
				commitDetailsViewFile: {
					resetFileToThisRevision: false
				},
				remoteBranch: {
					delete: true,
					fetch: false,
					pull: true
				}
			});

			// Run
			const value = config.contextMenuActionsVisibility;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('contextMenuActionsVisibility', {});
			expect(value).toStrictEqual({
				branch: {
					checkout: true,
					rename: false,
					delete: true,
					deleteMultiple: true,
					merge: true,
					rebase: true,
					push: true,
					pull: true,
					createBranch: true,
					viewIssue: true,
					createPullRequest: true,
					createArchive: true,
					selectInBranchesDropdown: true,
					unselectInBranchesDropdown: true,
					hide: true,
					copyName: true
				},
				commit: {
					addTag: true,
					createBranch: true,
					checkout: false,
					compareWithWorkingTree: true,
					cherrypick: true,
					revert: true,
					drop: true,
					squash: true,
					merge: true,
					rebase: true,
					rebaseOnto: true,
					reset: true,
					undo: true,
					editMessage: true,
					createFixup: true,
					pushToCommit: true,
					savePatch: true,
					applyPatch: true,
					viewPatch: true,
					viewAllChanges: true,
					browseFiles: true,
					editNotes: true,
					viewChangesFromParent: true,
					selectMergeBase: true,
					copyHash: true,
					copySubject: true,
					copySubjectsBetween: true,
					copyPatch: true
				},
				commitDetailsViewFile: {
					viewDiff: true,
					viewAllChanges: true,
					viewFileAtThisRevision: true,
					viewDiffWithWorkingFile: true,
					openFile: true,
					openInExternalDiffTool: true,
					markAsReviewed: true,
					markAsNotReviewed: true,
					resetFileToThisRevision: false,
					copyAbsoluteFilePath: true,
					copyRelativeFilePath: true,
					copyAllRelativeFilePaths: true
				},
				remoteBranch: {
					checkout: true,
					delete: true,
					fetch: false,
					merge: true,
					pull: true,
					createBranch: true,
					viewIssue: true,
					createPullRequest: true,
					createArchive: true,
					selectInBranchesDropdown: true,
					unselectInBranchesDropdown: true,
					hide: true,
					hideRemote: true,
					copyName: true
				},
				stash: {
					apply: true,
					createBranch: true,
					pop: true,
					drop: true,
					copyName: true,
					copyHash: true,
					viewAllChanges: true
				},
				tag: {
					viewDetails: true,
					checkout: true,
					delete: true,
					push: true,
					createArchive: true,
					copyName: true
				},
				uncommittedChanges: {
					stash: true,
					applyPatch: true,
					reset: true,
					clean: true,
					viewAllChanges: true,
					openSourceControlView: true
				}
			});
		});
	});

	describe('customBranchGlobPatterns', () => {
		it('Should return a filtered array of glob patterns based on the configuration value', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('customBranchGlobPatterns', [
				{ name: 'Name 1', glob: 'glob1' },
				{ name: 'Name 2', glob: 'glob2' },
				{ name: 'Name 3' },
				{ name: 'Name 4', glob: 'glob4' }
			]);

			// Run
			const value = config.customBranchGlobPatterns;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('customBranchGlobPatterns', []);
			expect(value).toHaveLength(3);
			expect(value[0]).toStrictEqual({ name: 'Name 1', glob: '--glob=glob1' });
			expect(value[1]).toStrictEqual({ name: 'Name 2', glob: '--glob=glob2' });
			expect(value[2]).toStrictEqual({ name: 'Name 4', glob: '--glob=glob4' });
		});

		it('Should return the default value ([]) when the configuration value is not set', () => {
			// Run
			const value = config.customBranchGlobPatterns;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('customBranchGlobPatterns', []);
			expect(value).toHaveLength(0);
		});
	});

	describe('customEmojiShortcodeMappings', () => {
		it('Should return a filtered array of emoji shortcode mappings based on the configuration value', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('customEmojiShortcodeMappings', [
				{ shortcode: 'dog', emoji: '🍎' },
				{ shortcode: 'cat', emoji: '🎨' },
				{ shortcode: 'bird' },
				{ shortcode: 'fish', emoji: '🐛' }
			]);

			// Run
			const value = config.customEmojiShortcodeMappings;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('customEmojiShortcodeMappings', []);
			expect(value).toStrictEqual([
				{ shortcode: 'dog', emoji: '🍎' },
				{ shortcode: 'cat', emoji: '🎨' },
				{ shortcode: 'fish', emoji: '🐛' }
			]);
		});

		it('Should return the default value ([]) when the configuration value is not set', () => {
			// Run
			const value = config.customEmojiShortcodeMappings;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('customEmojiShortcodeMappings', []);
			expect(value).toHaveLength(0);
		});
	});

	describe('customPullRequestProviders', () => {
		it('Should return a filtered array of pull request providers based on the configuration value', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('customPullRequestProviders', [
				{ name: 'dog', templateUrl: '$1/$2' },
				{ name: 'cat', templateUrl: '$1/$3' },
				{ name: 'bird' },
				{ name: 'fish', templateUrl: '$1/$4' },
				{ templateUrl: '$1/$5' }
			]);

			// Run
			const value = config.customPullRequestProviders;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('customPullRequestProviders', []);
			expect(value).toStrictEqual([
				{ name: 'dog', templateUrl: '$1/$2' },
				{ name: 'cat', templateUrl: '$1/$3' },
				{ name: 'fish', templateUrl: '$1/$4' }
			]);
		});

		it('Should return the default value ([]) when the configuration value is invalid', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('customPullRequestProviders', 5);

			// Run
			const value = config.customPullRequestProviders;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('customPullRequestProviders', []);
			expect(value).toHaveLength(0);
		});

		it('Should return the default value ([]) when the configuration value is not set', () => {
			// Run
			const value = config.customPullRequestProviders;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('customPullRequestProviders', []);
			expect(value).toHaveLength(0);
		});
	});

	describe('dateFormat', () => {
		it('Should successfully parse the configuration value "Date & Time"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('date.format', 'Date & Time');

			// Run
			const value = config.dateFormat;

			// Assert
			expectExtensionSettingToHaveBeenCalled('date.format');
			expect(value).toStrictEqual({ type: DateFormatType.DateAndTime, iso: false });
		});

		it('Should successfully parse the configuration value "Date Only"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('date.format', 'Date Only');

			// Run
			const value = config.dateFormat;

			// Assert
			expectExtensionSettingToHaveBeenCalled('date.format');
			expect(value).toStrictEqual({ type: DateFormatType.DateOnly, iso: false });
		});

		it('Should successfully parse the configuration value "ISO Date & Time"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('date.format', 'ISO Date & Time');

			// Run
			const value = config.dateFormat;

			// Assert
			expectExtensionSettingToHaveBeenCalled('date.format');
			expect(value).toStrictEqual({ type: DateFormatType.DateAndTime, iso: true });
		});

		it('Should successfully parse the configuration value "ISO Date Only"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('date.format', 'ISO Date Only');

			// Run
			const value = config.dateFormat;

			// Assert
			expectExtensionSettingToHaveBeenCalled('date.format');
			expect(value).toStrictEqual({ type: DateFormatType.DateOnly, iso: true });
		});

		it('Should successfully parse the configuration value "Relative"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('date.format', 'Relative');

			// Run
			const value = config.dateFormat;

			// Assert
			expectExtensionSettingToHaveBeenCalled('date.format');
			expect(value).toStrictEqual({ type: DateFormatType.Relative, iso: false });
		});

		it('Should return the default value when the configuration value is invalid', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('date.format', 'invalid');

			// Run
			const value = config.dateFormat;

			// Assert
			expectExtensionSettingToHaveBeenCalled('date.format');
			expect(value).toStrictEqual({ type: DateFormatType.DateAndTime, iso: false });
		});

		it('Should return the default value when the configuration value is unknown', () => {
			// Run
			const value = config.dateFormat;

			// Assert
			expectExtensionSettingToHaveBeenCalled('date.format');
			expect(value).toStrictEqual({ type: DateFormatType.DateAndTime, iso: false });
		});
	});

	describe('dateFormat (Custom)', () => {
		it('Should return DateFormatType.Custom when the configuration value is "Custom"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('date.format', 'Custom');

			// Run
			const value = config.dateFormat;

			// Assert
			expect(value).toStrictEqual({ type: DateFormatType.Custom, iso: false });
		});
	});

	describe('customDateFormat', () => {
		it('Should return the configured value', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('date.customFormat', 'DD/MM/YYYY');

			// Run
			const value = config.customDateFormat;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('date.customFormat', 'YYYY-MM-DD HH:mm');
			expect(value).toBe('DD/MM/YYYY');
		});

		it('Should return the default value when the configuration value is empty', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('date.customFormat', ' ');

			// Run
			const value = config.customDateFormat;

			// Assert
			expect(value).toBe('YYYY-MM-DD HH:mm');
		});
	});

	describe('dateType', () => {
		it('Should return DateType.Author when the configuration value is "Author Date"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('date.type', 'Author Date');

			// Run
			const value = config.dateType;

			// Assert
			expectExtensionSettingToHaveBeenCalled('date.type');
			expect(value).toBe(DateType.Author);
		});

		it('Should return DateType.Commit when the configuration value is "Commit Date"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('date.type', 'Commit Date');

			// Run
			const value = config.dateType;

			// Assert
			expectExtensionSettingToHaveBeenCalled('date.type');
			expect(value).toBe(DateType.Commit);
		});

		it('Should return the default value (DateType.Author) when the configuration value is invalid', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('date.type', 'invalid');

			// Run
			const value = config.dateType;

			// Assert
			expectExtensionSettingToHaveBeenCalled('date.type');
			expect(value).toBe(DateType.Author);
		});

		it('Should return the default value (DateType.Author) when the configuration value is unknown', () => {
			// Run
			const value = config.dateType;

			// Assert
			expectExtensionSettingToHaveBeenCalled('date.type');
			expect(value).toBe(DateType.Author);
		});
	});

	describe('toolbarButtonVisibility', () => {
		it('Should show every item by default', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('toolbarButtonVisibility', {});

			// Run
			const value = config.toolbarButtonVisibility;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('toolbarButtonVisibility', {});
			expect(value).toStrictEqual({ display: true, scope: true, pathFilter: true });
		});

		it('Should hide the items set to FALSE', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('toolbarButtonVisibility', { Display: false, Scope: true, Paths: false });

			// Run
			const value = config.toolbarButtonVisibility;

			// Assert
			expect(value).toStrictEqual({ display: false, scope: true, pathFilter: false });
		});

		it('Should hide the Display & Scope dropdowns with the legacy Simplify & Remotes keys', () => {
			// Setup (the default value of the new keys is merged with the user's legacy keys)
			vscode.mockExtensionSettingReturnValue('toolbarButtonVisibility', { Display: true, Scope: true, Paths: true, Simplify: false, Remotes: false });

			// Run
			const value = config.toolbarButtonVisibility;

			// Assert
			expect(value).toStrictEqual({ display: false, scope: false, pathFilter: true });
		});

		it('Should show every item when the configuration value is invalid', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('toolbarButtonVisibility', 'invalid');

			// Run
			const value = config.toolbarButtonVisibility;

			// Assert
			expect(value).toStrictEqual({ display: true, scope: true, pathFilter: true });
		});
	});

	describe('getRepoScopeFromLegacyOverrides', () => {
		it('Should return NULL when neither override is set', () => {
			expect(getRepoScopeFromLegacyOverrides(BooleanOverride.Default, BooleanOverride.Default)).toBeNull();
		});

		it('Should apply the overrides', () => {
			expect(getRepoScopeFromLegacyOverrides(BooleanOverride.Disabled, BooleanOverride.Enabled)).toStrictEqual(['local', 'reflog']);
			expect(getRepoScopeFromLegacyOverrides(BooleanOverride.Enabled, BooleanOverride.Disabled)).toStrictEqual(['local', 'remote']);
		});

		it('Should fall back to the Extension Settings for the overrides that are default', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('repository.showRemoteBranches', false);

			// Run & Assert
			expect(getRepoScopeFromLegacyOverrides(BooleanOverride.Default, BooleanOverride.Enabled)).toStrictEqual(['local', 'reflog']);
			expect(getRepoScopeFromLegacyOverrides(BooleanOverride.Enabled, BooleanOverride.Default)).toStrictEqual(['local', 'remote']);
		});
	});

	describe('defaultColumnVisibility', () => {
		it('Should successfully parse the configuration value (Date column disabled)', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('defaultColumnVisibility', { Date: false, Author: true, Commit: true });

			// Run
			const value = config.defaultColumnVisibility;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('defaultColumnVisibility', {});
			expect(value).toStrictEqual({ date: false, author: true, commit: true });
		});

		it('Should successfully parse the configuration value (Author column disabled)', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('defaultColumnVisibility', { Date: true, Author: false, Commit: true });

			// Run
			const value = config.defaultColumnVisibility;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('defaultColumnVisibility', {});
			expect(value).toStrictEqual({ date: true, author: false, commit: true });
		});

		it('Should successfully parse the configuration value (Commit  column disabled)', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('defaultColumnVisibility', { Date: true, Author: true, Commit: false });

			// Run
			const value = config.defaultColumnVisibility;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('defaultColumnVisibility', {});
			expect(value).toStrictEqual({ date: true, author: true, commit: false });
		});

		it('Should return the default value when the configuration value is invalid (not an object)', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('defaultColumnVisibility', 'invalid');

			// Run
			const value = config.defaultColumnVisibility;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('defaultColumnVisibility', {});
			expect(value).toStrictEqual({ date: true, author: true, commit: true });
		});

		it('Should return the default value when the configuration value is invalid (NULL)', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('defaultColumnVisibility', null);

			// Run
			const value = config.defaultColumnVisibility;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('defaultColumnVisibility', {});
			expect(value).toStrictEqual({ date: true, author: true, commit: true });
		});

		it('Should return the default value when the configuration value is invalid (column value is not a boolean)', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('defaultColumnVisibility', { Date: true, Author: true, Commit: 5 });

			// Run
			const value = config.defaultColumnVisibility;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('defaultColumnVisibility', {});
			expect(value).toStrictEqual({ date: true, author: true, commit: true });
		});

		it('Should return the default value when the configuration value is not set', () => {
			// Run
			const value = config.defaultColumnVisibility;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('defaultColumnVisibility', {});
			expect(value).toStrictEqual({ date: true, author: true, commit: true });
		});
	});

	describe('builtin', () => {
		it('Should return the default value of the Extension Setting, following Git for the keys it doesn\'t set', () => {
			// Run
			const value = config.builtin;

			// Assert
			expect(value).toStrictEqual({
				'commit.gpgSign': null,
				'core.abbrev': 7,
				'fetch.prune': null,
				'fetch.pruneTags': null,
				'fetch.tags': null,
				'log.mailmap': false,
				'merge.ff': false,
				'pull.ff': null,
				'push.autoSetupRemote': true,
				'status.showUntrackedFiles': 'all',
				'tag.gpgSign': null
			});
		});

		it('Should merge the configured keys over the default value, and follow Git for keys set to NULL', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('builtin', { 'fetch.prune': true, 'commit.gpgSign': false, 'merge.ff': 'only', 'log.mailmap': null });

			// Run
			const value = config.builtin;

			// Assert
			expect(value['fetch.prune']).toBe(true);
			expect(value['commit.gpgSign']).toBe(false);
			expect(value['merge.ff']).toBe('only');
			expect(value['log.mailmap']).toBe(null);
			expect(value['core.abbrev']).toBe(7);
			expect(value['status.showUntrackedFiles']).toBe('all');
		});

		it('Should follow Git for invalid values, and clamp core.abbrev', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('builtin', { 'fetch.tags': 'yes', 'status.showUntrackedFiles': 'some', 'pull.ff': 'never', 'core.abbrev': 99 });

			// Run
			const value = config.builtin;

			// Assert
			expect(value['fetch.tags']).toBe(null);
			expect(value['status.showUntrackedFiles']).toBe(null);
			expect(value['pull.ff']).toBe(null);
			expect(value['core.abbrev']).toBe(40);
		});
	});

	describe('dialogDefaults', () => {
		it('Should return TRUE values for boolean-based configuration values when they are TRUE', () => {
			// Setup
			[
				'dialog.addTag.pushToRemote',
				'dialog.applyStash.reinstateIndex',
				'dialog.cherryPick.noCommit',
				'dialog.cherryPick.recordOrigin',
				'dialog.createBranch.checkOut',
				'dialog.deleteBranch.forceDelete',
				'dialog.deleteBranch.deleteOnRemote',
				'dialog.fetchIntoLocalBranch.forceFetch',
				'dialog.merge.noCommit',
				'dialog.merge.allowUnrelatedHistories',
				'dialog.merge.squashCommits',
				'dialog.popStash.reinstateIndex',
				'dialog.pullBranch.squashCommits',
				'dialog.rebase.ignoreDate',
				'dialog.rebase.launchInteractiveRebase',
				'dialog.stashUncommittedChanges.includeUntracked'
			].forEach((section) => vscode.mockExtensionSettingReturnValue(section, true));

			// Run
			const value = config.dialogDefaults;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.addTag.pushToRemote', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.addTag.type', 'Annotated');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.applyStash.reinstateIndex', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.cherryPick.noCommit', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.cherryPick.recordOrigin', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.createBranch.checkOut', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.deleteBranch.forceDelete', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.deleteBranch.deleteOnRemote', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.fetchIntoLocalBranch.forceFetch', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.general.referenceInputSpaceSubstitution', 'None');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.merge.noCommit', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.merge.allowUnrelatedHistories', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.merge.squashCommits', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.popStash.reinstateIndex', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.pullBranch.squashCommits', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.pushBranch.mode', 'Normal');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.rebase.ignoreDate', true);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.rebase.launchInteractiveRebase', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.resetCurrentBranchToCommit.mode', 'Mixed');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.resetUncommittedChanges.mode', 'Mixed');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.stashUncommittedChanges.includeUntracked', true);
			expect(value).toStrictEqual({
				addTag: {
					pushToRemote: true,
					type: TagType.Annotated
				},
				applyStash: {
					reinstateIndex: true
				},
				cherryPick: {
					noCommit: true,
					recordOrigin: true
				},
				createBranch: {
					checkout: true
				},
				deleteBranch: {
					forceDelete: true,
					deleteOnRemote: true
				},
				fetchIntoLocalBranch: {
					forceFetch: true
				},
				general: {
					referenceInputSpaceSubstitution: null
				},
				merge: {
					noCommit: true,
					allowUnrelatedHistories: true,
					squash: true
				},
				popStash: {
					reinstateIndex: true
				},
				pullBranch: {
					squash: true
				},
				pushBranch: {
					mode: GitPushBranchMode.Normal
				},
				rebase: {
					ignoreDate: true,
					interactive: true
				},
				resetCommit: {
					mode: GitResetMode.Mixed
				},
				resetUncommitted: {
					mode: GitResetMode.Mixed
				},
				stashUncommittedChanges: {
					includeUntracked: true
				}
			});
		});

		it('Should return FALSE values for boolean-based configuration values when they are FALSE', () => {
			// Setup
			[
				'dialog.addTag.pushToRemote',
				'dialog.applyStash.reinstateIndex',
				'dialog.cherryPick.noCommit',
				'dialog.cherryPick.recordOrigin',
				'dialog.createBranch.checkOut',
				'dialog.deleteBranch.forceDelete',
				'dialog.deleteBranch.deleteOnRemote',
				'dialog.fetchIntoLocalBranch.forceFetch',
				'dialog.merge.noCommit',
				'dialog.merge.allowUnrelatedHistories',
				'dialog.merge.squashCommits',
				'dialog.popStash.reinstateIndex',
				'dialog.pullBranch.squashCommits',
				'dialog.rebase.ignoreDate',
				'dialog.rebase.launchInteractiveRebase',
				'dialog.stashUncommittedChanges.includeUntracked'
			].forEach((section) => vscode.mockExtensionSettingReturnValue(section, false));

			// Run
			const value = config.dialogDefaults;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.addTag.pushToRemote', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.addTag.type', 'Annotated');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.applyStash.reinstateIndex', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.cherryPick.noCommit', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.cherryPick.recordOrigin', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.createBranch.checkOut', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.deleteBranch.forceDelete', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.deleteBranch.deleteOnRemote', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.fetchIntoLocalBranch.forceFetch', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.general.referenceInputSpaceSubstitution', 'None');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.merge.noCommit', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.merge.allowUnrelatedHistories', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.merge.squashCommits', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.popStash.reinstateIndex', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.pullBranch.squashCommits', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.pushBranch.mode', 'Normal');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.rebase.ignoreDate', true);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.rebase.launchInteractiveRebase', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.resetCurrentBranchToCommit.mode', 'Mixed');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.resetUncommittedChanges.mode', 'Mixed');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.stashUncommittedChanges.includeUntracked', true);
			expect(value).toStrictEqual({
				addTag: {
					pushToRemote: false,
					type: TagType.Annotated
				},
				applyStash: {
					reinstateIndex: false
				},
				cherryPick: {
					noCommit: false,
					recordOrigin: false
				},
				createBranch: {
					checkout: false
				},
				deleteBranch: {
					forceDelete: false,
					deleteOnRemote: false
				},
				fetchIntoLocalBranch: {
					forceFetch: false
				},
				general: {
					referenceInputSpaceSubstitution: null
				},
				merge: {
					noCommit: false,
					allowUnrelatedHistories: false,
					squash: false
				},
				popStash: {
					reinstateIndex: false
				},
				pullBranch: {
					squash: false
				},
				pushBranch: {
					mode: GitPushBranchMode.Normal
				},
				rebase: {
					ignoreDate: false,
					interactive: false
				},
				resetCommit: {
					mode: GitResetMode.Mixed
				},
				resetUncommitted: {
					mode: GitResetMode.Mixed
				},
				stashUncommittedChanges: {
					includeUntracked: false
				}
			});
		});

		it('Should return TRUE values for boolean-based configuration values when they are truthy', () => {
			// Setup
			[
				'dialog.addTag.pushToRemote',
				'dialog.applyStash.reinstateIndex',
				'dialog.cherryPick.noCommit',
				'dialog.cherryPick.recordOrigin',
				'dialog.createBranch.checkOut',
				'dialog.deleteBranch.forceDelete',
				'dialog.deleteBranch.deleteOnRemote',
				'dialog.fetchIntoLocalBranch.forceFetch',
				'dialog.merge.noCommit',
				'dialog.merge.allowUnrelatedHistories',
				'dialog.merge.squashCommits',
				'dialog.popStash.reinstateIndex',
				'dialog.pullBranch.squashCommits',
				'dialog.rebase.ignoreDate',
				'dialog.rebase.launchInteractiveRebase',
				'dialog.stashUncommittedChanges.includeUntracked'
			].forEach((section) => vscode.mockExtensionSettingReturnValue(section, 1));

			// Run
			const value = config.dialogDefaults;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.addTag.pushToRemote', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.addTag.type', 'Annotated');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.applyStash.reinstateIndex', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.cherryPick.noCommit', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.cherryPick.recordOrigin', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.createBranch.checkOut', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.deleteBranch.forceDelete', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.deleteBranch.deleteOnRemote', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.fetchIntoLocalBranch.forceFetch', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.general.referenceInputSpaceSubstitution', 'None');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.merge.noCommit', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.merge.allowUnrelatedHistories', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.merge.squashCommits', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.popStash.reinstateIndex', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.pullBranch.squashCommits', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.pushBranch.mode', 'Normal');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.rebase.ignoreDate', true);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.rebase.launchInteractiveRebase', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.resetCurrentBranchToCommit.mode', 'Mixed');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.resetUncommittedChanges.mode', 'Mixed');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.stashUncommittedChanges.includeUntracked', true);
			expect(value).toStrictEqual({
				addTag: {
					pushToRemote: true,
					type: TagType.Annotated
				},
				applyStash: {
					reinstateIndex: true
				},
				cherryPick: {
					noCommit: true,
					recordOrigin: true
				},
				createBranch: {
					checkout: true
				},
				deleteBranch: {
					forceDelete: true,
					deleteOnRemote: true
				},
				fetchIntoLocalBranch: {
					forceFetch: true
				},
				general: {
					referenceInputSpaceSubstitution: null
				},
				merge: {
					noCommit: true,
					allowUnrelatedHistories: true,
					squash: true
				},
				popStash: {
					reinstateIndex: true
				},
				pullBranch: {
					squash: true
				},
				pushBranch: {
					mode: GitPushBranchMode.Normal
				},
				rebase: {
					ignoreDate: true,
					interactive: true
				},
				resetCommit: {
					mode: GitResetMode.Mixed
				},
				resetUncommitted: {
					mode: GitResetMode.Mixed
				},
				stashUncommittedChanges: {
					includeUntracked: true
				}
			});
		});

		it('Should return FALSE values for boolean-based configuration values when they are falsy', () => {
			// Setup
			[
				'dialog.addTag.pushToRemote',
				'dialog.applyStash.reinstateIndex',
				'dialog.cherryPick.noCommit',
				'dialog.cherryPick.recordOrigin',
				'dialog.createBranch.checkOut',
				'dialog.deleteBranch.forceDelete',
				'dialog.deleteBranch.deleteOnRemote',
				'dialog.fetchIntoLocalBranch.forceFetch',
				'dialog.merge.noCommit',
				'dialog.merge.allowUnrelatedHistories',
				'dialog.merge.squashCommits',
				'dialog.popStash.reinstateIndex',
				'dialog.pullBranch.squashCommits',
				'dialog.rebase.ignoreDate',
				'dialog.rebase.launchInteractiveRebase',
				'dialog.stashUncommittedChanges.includeUntracked'
			].forEach((section) => vscode.mockExtensionSettingReturnValue(section, 0));

			// Run
			const value = config.dialogDefaults;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.addTag.pushToRemote', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.addTag.type', 'Annotated');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.applyStash.reinstateIndex', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.cherryPick.noCommit', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.cherryPick.recordOrigin', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.createBranch.checkOut', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.deleteBranch.forceDelete', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.deleteBranch.deleteOnRemote', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.fetchIntoLocalBranch.forceFetch', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.general.referenceInputSpaceSubstitution', 'None');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.merge.noCommit', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.merge.allowUnrelatedHistories', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.merge.squashCommits', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.popStash.reinstateIndex', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.pullBranch.squashCommits', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.pushBranch.mode', 'Normal');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.rebase.ignoreDate', true);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.rebase.launchInteractiveRebase', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.resetCurrentBranchToCommit.mode', 'Mixed');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.resetUncommittedChanges.mode', 'Mixed');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.stashUncommittedChanges.includeUntracked', true);
			expect(value).toStrictEqual({
				addTag: {
					pushToRemote: false,
					type: TagType.Annotated
				},
				applyStash: {
					reinstateIndex: false
				},
				cherryPick: {
					noCommit: false,
					recordOrigin: false
				},
				createBranch: {
					checkout: false
				},
				deleteBranch: {
					forceDelete: false,
					deleteOnRemote: false
				},
				fetchIntoLocalBranch: {
					forceFetch: false
				},
				general: {
					referenceInputSpaceSubstitution: null
				},
				merge: {
					noCommit: false,
					allowUnrelatedHistories: false,
					squash: false
				},
				popStash: {
					reinstateIndex: false
				},
				pullBranch: {
					squash: false
				},
				pushBranch: {
					mode: GitPushBranchMode.Normal
				},
				rebase: {
					ignoreDate: false,
					interactive: false
				},
				resetCommit: {
					mode: GitResetMode.Mixed
				},
				resetUncommitted: {
					mode: GitResetMode.Mixed
				},
				stashUncommittedChanges: {
					includeUntracked: false
				}
			});
		});

		it('Should return the default values for text-based configuration values when they are invalid', () => {
			// Setup
			[
				'dialog.addTag.type',
				'dialog.resetCurrentBranchToCommit.mode',
				'dialog.resetUncommittedChanges.mode',
				'dialog.pushBranch.mode'
			].forEach((section) => vscode.mockExtensionSettingReturnValue(section, 'invalid'));

			// Run
			const value = config.dialogDefaults;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.addTag.pushToRemote', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.addTag.type', 'Annotated');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.applyStash.reinstateIndex', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.cherryPick.noCommit', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.cherryPick.recordOrigin', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.createBranch.checkOut', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.deleteBranch.forceDelete', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.deleteBranch.deleteOnRemote', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.fetchIntoLocalBranch.forceFetch', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.general.referenceInputSpaceSubstitution', 'None');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.merge.noCommit', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.merge.allowUnrelatedHistories', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.merge.squashCommits', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.popStash.reinstateIndex', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.pullBranch.squashCommits', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.pushBranch.mode', 'Normal');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.rebase.ignoreDate', true);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.rebase.launchInteractiveRebase', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.resetCurrentBranchToCommit.mode', 'Mixed');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.resetUncommittedChanges.mode', 'Mixed');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.stashUncommittedChanges.includeUntracked', true);
			expect(value).toStrictEqual({
				addTag: {
					pushToRemote: false,
					type: TagType.Annotated
				},
				applyStash: {
					reinstateIndex: false
				},
				cherryPick: {
					noCommit: false,
					recordOrigin: false
				},
				createBranch: {
					checkout: false
				},
				deleteBranch: {
					forceDelete: false,
					deleteOnRemote: false
				},
				fetchIntoLocalBranch: {
					forceFetch: false
				},
				general: {
					referenceInputSpaceSubstitution: null
				},
				merge: {
					noCommit: false,
					allowUnrelatedHistories: false,
					squash: false
				},
				popStash: {
					reinstateIndex: false
				},
				pullBranch: {
					squash: false
				},
				pushBranch: {
					mode: GitPushBranchMode.Normal
				},
				rebase: {
					ignoreDate: true,
					interactive: false
				},
				resetCommit: {
					mode: GitResetMode.Mixed
				},
				resetUncommitted: {
					mode: GitResetMode.Mixed
				},
				stashUncommittedChanges: {
					includeUntracked: true
				}
			});
		});

		it('Should return the default values when the configuration values are not set', () => {
			// Run
			const value = config.dialogDefaults;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.addTag.pushToRemote', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.addTag.type', 'Annotated');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.applyStash.reinstateIndex', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.cherryPick.noCommit', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.cherryPick.recordOrigin', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.createBranch.checkOut', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.deleteBranch.forceDelete', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.deleteBranch.deleteOnRemote', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.fetchIntoLocalBranch.forceFetch', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.general.referenceInputSpaceSubstitution', 'None');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.merge.noCommit', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.merge.allowUnrelatedHistories', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.merge.squashCommits', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.popStash.reinstateIndex', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.pullBranch.squashCommits', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.pushBranch.mode', 'Normal');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.rebase.ignoreDate', true);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.rebase.launchInteractiveRebase', false);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.resetCurrentBranchToCommit.mode', 'Mixed');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.resetUncommittedChanges.mode', 'Mixed');
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.stashUncommittedChanges.includeUntracked', true);
			expect(value).toStrictEqual({
				addTag: {
					pushToRemote: false,
					type: TagType.Annotated
				},
				applyStash: {
					reinstateIndex: false
				},
				cherryPick: {
					noCommit: false,
					recordOrigin: false
				},
				createBranch: {
					checkout: false
				},
				deleteBranch: {
					forceDelete: false,
					deleteOnRemote: false
				},
				fetchIntoLocalBranch: {
					forceFetch: false
				},
				general: {
					referenceInputSpaceSubstitution: null
				},
				merge: {
					noCommit: false,
					allowUnrelatedHistories: false,
					squash: false
				},
				popStash: {
					reinstateIndex: false
				},
				pullBranch: {
					squash: false
				},
				pushBranch: {
					mode: GitPushBranchMode.Normal
				},
				rebase: {
					ignoreDate: true,
					interactive: false
				},
				resetCommit: {
					mode: GitResetMode.Mixed
				},
				resetUncommitted: {
					mode: GitResetMode.Mixed
				},
				stashUncommittedChanges: {
					includeUntracked: true
				}
			});
		});

		describe('dialogDefaults.addTag.type', () => {
			it('Should return TagType.Annotated when the configuration value is "Annotated"', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('dialog.addTag.type', 'Annotated');

				// Run
				const value = config.dialogDefaults;

				// Assert
				expect(value.addTag.type).toBe(TagType.Annotated);
			});

			it('Should return TagType.Lightweight when the configuration value is "Lightweight"', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('dialog.addTag.type', 'Lightweight');

				// Run
				const value = config.dialogDefaults;

				// Assert
				expect(value.addTag.type).toBe(TagType.Lightweight);
			});
		});

		describe('dialogDefaults.general.referenceInputSpaceSubstitution', () => {
			it('Should return NULL when the configuration value is "None"', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('dialog.general.referenceInputSpaceSubstitution', 'None');

				// Run
				const value = config.dialogDefaults;

				// Assert
				expect(value.general.referenceInputSpaceSubstitution).toBe(null);
			});

			it('Should return "-" when the configuration value is "Hyphen"', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('dialog.general.referenceInputSpaceSubstitution', 'Hyphen');

				// Run
				const value = config.dialogDefaults;

				// Assert
				expect(value.general.referenceInputSpaceSubstitution).toBe('-');
			});

			it('Should return "_" when the configuration value is "Underscore"', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('dialog.general.referenceInputSpaceSubstitution', 'Underscore');

				// Run
				const value = config.dialogDefaults;

				// Assert
				expect(value.general.referenceInputSpaceSubstitution).toBe('_');
			});

			it('Should return the default value (NULL) when the configuration value is invalid', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('dialog.general.referenceInputSpaceSubstitution', 'invalid');

				// Run
				const value = config.dialogDefaults;

				// Assert
				expect(value.general.referenceInputSpaceSubstitution).toBe(null);
			});
		});

		describe('dialogDefaults.resetCommit.mode', () => {
			it('Should return GitResetMode.Hard when the configuration value is "Hard"', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('dialog.resetCurrentBranchToCommit.mode', 'Hard');

				// Run
				const value = config.dialogDefaults;

				// Assert
				expect(value.resetCommit.mode).toBe(GitResetMode.Hard);
			});

			it('Should return GitResetMode.Mixed when the configuration value is "Mixed"', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('dialog.resetCurrentBranchToCommit.mode', 'Mixed');

				// Run
				const value = config.dialogDefaults;

				// Assert
				expect(value.resetCommit.mode).toBe(GitResetMode.Mixed);
			});

			it('Should return GitResetMode.Soft when the configuration value is "Soft"', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('dialog.resetCurrentBranchToCommit.mode', 'Soft');

				// Run
				const value = config.dialogDefaults;

				// Assert
				expect(value.resetCommit.mode).toBe(GitResetMode.Soft);
			});
		});

		describe('dialogDefaults.resetUncommitted.mode', () => {
			it('Should return GitResetMode.Hard when the configuration value is "Hard"', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('dialog.resetUncommittedChanges.mode', 'Hard');

				// Run
				const value = config.dialogDefaults;

				// Assert
				expect(value.resetUncommitted.mode).toBe(GitResetMode.Hard);
			});

			it('Should return GitResetMode.Mixed when the configuration value is "Mixed"', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('dialog.resetUncommittedChanges.mode', 'Mixed');

				// Run
				const value = config.dialogDefaults;

				// Assert
				expect(value.resetUncommitted.mode).toBe(GitResetMode.Mixed);
			});
		});
	});

	describe('squashMergeMessageFormat', () => {
		it('Should return SquashMessageFormat.Default when the configuration value is "Default"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('dialog.merge.squashMessageFormat', 'Default');

			// Run
			const value = config.squashMergeMessageFormat;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.merge.squashMessageFormat', 'Default');
			expect(value).toBe(SquashMessageFormat.Default);
		});

		it('Should return SquashMessageFormat.GitSquashMsg when the configuration value is "Git SQUASH_MSG"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('dialog.merge.squashMessageFormat', 'Git SQUASH_MSG');

			// Run
			const value = config.squashMergeMessageFormat;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.merge.squashMessageFormat', 'Default');
			expect(value).toBe(SquashMessageFormat.GitSquashMsg);
		});

		it('Should return the default value (SquashMessageFormat.Default) when the configuration value is invalid', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('dialog.merge.squashMessageFormat', 'invalid');

			// Run
			const value = config.squashMergeMessageFormat;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.merge.squashMessageFormat', 'Default');
			expect(value).toBe(SquashMessageFormat.Default);
		});

		it('Should return the default value (SquashMessageFormat.Default) when the configuration value is not set', () => {
			// Run
			const value = config.squashMergeMessageFormat;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.merge.squashMessageFormat', 'Default');
			expect(value).toBe(SquashMessageFormat.Default);
		});
	});

	describe('squashPullMessageFormat', () => {
		it('Should return SquashMessageFormat.Default when the configuration value is "Default"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('dialog.pullBranch.squashMessageFormat', 'Default');

			// Run
			const value = config.squashPullMessageFormat;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.pullBranch.squashMessageFormat', 'Default');
			expect(value).toBe(SquashMessageFormat.Default);
		});

		it('Should return SquashMessageFormat.GitSquashMsg when the configuration value is "Git SQUASH_MSG"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('dialog.pullBranch.squashMessageFormat', 'Git SQUASH_MSG');

			// Run
			const value = config.squashPullMessageFormat;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.pullBranch.squashMessageFormat', 'Default');
			expect(value).toBe(SquashMessageFormat.GitSquashMsg);
		});

		it('Should return the default value (SquashMessageFormat.Default) when the configuration value is invalid', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('dialog.pullBranch.squashMessageFormat', 'invalid');

			// Run
			const value = config.squashPullMessageFormat;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.pullBranch.squashMessageFormat', 'Default');
			expect(value).toBe(SquashMessageFormat.Default);
		});

		it('Should return the default value (SquashMessageFormat.Default) when the configuration value is not set', () => {
			// Run
			const value = config.squashPullMessageFormat;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.pullBranch.squashMessageFormat', 'Default');
			expect(value).toBe(SquashMessageFormat.Default);
		});
	});

	describe('enhancedAccessibility', testBooleanExtensionSetting('enhancedAccessibility', 'enhancedAccessibility', false));

	describe('backupBeforeDangerousActions', testBooleanExtensionSetting('backupBeforeDangerousActions', 'repository.backupBeforeDangerousActions', false));

	describe('logGitCommandOutput', testBooleanExtensionSetting('logGitCommandOutput', 'logGitCommandOutput', false));

	describe('externalDiffToolArgs', () => {
		it('Should return the configured arguments, ignoring invalid entries', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('externalDiffToolArgs', ['--no-symlinks', '', 5, null, '--trust-exit-code']);

			// Run
			const value = config.externalDiffToolArgs;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('externalDiffToolArgs', []);
			expect(value).toStrictEqual(['--no-symlinks', '--trust-exit-code']);
		});

		it('Should return an empty array when the configuration value is invalid', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('externalDiffToolArgs', '--no-symlinks');

			// Run
			const value = config.externalDiffToolArgs;

			// Assert
			expect(value).toStrictEqual([]);
		});

		it('Should return an empty array when the configuration value is not set', () => {
			// Run
			const value = config.externalDiffToolArgs;

			// Assert
			expect(value).toStrictEqual([]);
		});
	});

	describe('branchPrefix', () => {
		it('Should return the value of the "git.branchPrefix" setting', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('branchPrefix', 'feature/');

			// Run
			const value = config.branchPrefix;

			// Assert
			expect(vscode.workspace.getConfiguration).toBeCalledWith('git');
			expect(workspaceConfiguration.get).toBeCalledWith('branchPrefix', '');
			expect(value).toBe('feature/');
		});

		it('Should return an empty string when the setting is invalid', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('branchPrefix', 5);

			// Run
			const value = config.branchPrefix;

			// Assert
			expect(value).toBe('');
		});

		it('Should return an empty string when the setting is not set', () => {
			// Run
			const value = config.branchPrefix;

			// Assert
			expect(value).toBe('');
		});
	});

	describe('dialogDefaults.pushBranch', () => {
		it('Should return GitPushBranchMode.ForceWithLease when the mode is "Force With Lease"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('dialog.pushBranch.mode', 'Force With Lease');

			// Run
			const value = config.dialogDefaults;

			// Assert
			expect(value.pushBranch).toStrictEqual({ mode: GitPushBranchMode.ForceWithLease });
		});

		it('Should return GitPushBranchMode.Force when the mode is "Force"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('dialog.pushBranch.mode', 'Force');

			// Run
			const value = config.dialogDefaults;

			// Assert
			expect(value.pushBranch.mode).toBe(GitPushBranchMode.Force);
		});
	});

	describe('squash message formats (Branch Name & Commit Subjects)', () => {
		it('Should return SquashMessageFormat.BranchAndCommitSubjects for merges when the configuration value is "Branch Name & Commit Subjects"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('dialog.merge.squashMessageFormat', 'Branch Name & Commit Subjects');

			// Run
			const value = config.squashMergeMessageFormat;

			// Assert
			expect(value).toBe(SquashMessageFormat.BranchAndCommitSubjects);
		});

		it('Should return SquashMessageFormat.BranchAndCommitSubjects for pulls when the configuration value is "Branch Name & Commit Subjects"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('dialog.pullBranch.squashMessageFormat', 'Branch Name & Commit Subjects');

			// Run
			const value = config.squashPullMessageFormat;

			// Assert
			expect(value).toBe(SquashMessageFormat.BranchAndCommitSubjects);
		});
	});

	describe('excludeBranchGlobPatterns', () => {
		it('Should return the configured patterns, ignoring invalid entries', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('excludeBranchGlobPatterns', ['gh-pages', '', 5, 'wip/*']);

			// Run
			const value = config.excludeBranchGlobPatterns;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('excludeBranchGlobPatterns', []);
			expect(value).toStrictEqual(['gh-pages', 'wip/*']);
		});

		it('Should return the default value ([]) when the configuration value is not an array', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('excludeBranchGlobPatterns', 'gh-pages');

			// Run
			const value = config.excludeBranchGlobPatterns;

			// Assert
			expect(value).toStrictEqual([]);
		});
	});

	describe('fileEncoding (files.encoding)', () => {
		it('Should use Visual Studio Code\'s files.encoding when easy-graph.fileEncoding isn\'t configured', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('encoding', 'gbk');

			// Run
			const value = getConfig('/path/to/repo').fileEncoding;

			// Assert
			expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('files', expect.objectContaining({ path: '/path/to/repo' }));
			expect(workspaceConfiguration.get).toBeCalledWith('encoding', 'utf8');
			expect(value).toBe('gbk');
		});

		it('Should map files.encoding "utf8bom" to "utf8"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('encoding', 'utf8bom');

			// Run
			const value = config.fileEncoding;

			// Assert
			expect(value).toBe('utf8');
		});

		it('Should prefer easy-graph.fileEncoding over files.encoding when it\'s configured', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('fileEncoding', 'big5');
			vscode.mockExtensionSettingReturnValue('encoding', 'gbk');

			// Run
			const value = config.fileEncoding;

			// Assert
			expect(value).toBe('big5');
		});
	});

	describe('findWidgetSearchColumns', () => {
		it('Should return the configured columns (in a consistent order), ignoring invalid entries', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('findWidget.searchColumns', ['Commit', 'Description', 'Message', 5]);

			// Run
			const value = config.findWidgetSearchColumns;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('findWidget.searchColumns', ['Description', 'Date', 'Author', 'Commit']);
			expect(value).toStrictEqual(['Description', 'Commit']);
		});

		it('Should return all columns when the configuration value is not an array', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('findWidget.searchColumns', 'Commit');

			// Run
			const value = config.findWidgetSearchColumns;

			// Assert
			expect(value).toStrictEqual(['Description', 'Date', 'Author', 'Commit']);
		});

		it('Should return all columns when the configuration value is not set', () => {
			// Run
			const value = config.findWidgetSearchColumns;

			// Assert
			expect(value).toStrictEqual(['Description', 'Date', 'Author', 'Commit']);
		});
	});

	describe('fileEncoding', () => {
		it('Should return the configured value', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('fileEncoding', 'file-encoding');

			// Run
			const value = config.fileEncoding;

			expect(workspaceConfiguration.get).toBeCalledWith('fileEncoding', 'utf8');
			expect(value).toBe('file-encoding');
		});

		it('Should return the default configuration value ("utf8")', () => {
			// Run
			const value = config.fileEncoding;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('fileEncoding', 'utf8');
			expect(value).toBe('utf8');
		});
	});

	describe('findMatchHighlightColour', testColourExtensionSetting('findMatchHighlightColour', 'findMatchHighlightColour'));

	describe('flashColour', () => {
		const getFlashColour = (value: unknown) => {
			vscode.mockExtensionSettingReturnValue('flashColour', value);
			return config.flashColour;
		};

		it('Should normalise HEX colours to rgba()', () => {
			// Run
			const values = [' #ffcc0080 ', '#0085d9', '#f0c', '#f0c8'].map(getFlashColour);

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('flashColour', '');
			expect(values).toStrictEqual(['rgba(255,204,0,0.5)', 'rgba(0,133,217,1)', 'rgba(255,0,204,1)', 'rgba(255,0,204,0.53)']);
		});

		it('Should normalise RGB colours to rgba(), with or without the alpha', () => {
			// Run
			const values = ['rgba(1, 2, 3, 0.5)', 'rgb(1,2,3)', 'rgba(1, 2, 3)', 'RGB(10, 20, 30, .25)', 'rgba(1, 2, 3, 7)'].map(getFlashColour);

			// Assert
			expect(values).toStrictEqual(['rgba(1,2,3,0.5)', 'rgba(1,2,3,1)', 'rgba(1,2,3,1)', 'rgba(10,20,30,0.25)', 'rgba(1,2,3,1)']);
		});

		it('Should return the default value when the configuration value is not a valid colour', () => {
			// Run
			const values = ['red; } body {', 'rgb(1, 2, 3) ; color: red', 'rgb(256, 0, 0)', '#12345', 'red', 5, null].map(getFlashColour);

			// Assert
			expect(values).toStrictEqual(['', '', '', '', '', '', '']);
		});

		it('Should return the default configuration value ("")', () => {
			// Run
			const value = config.flashColour;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('flashColour', '');
			expect(value).toBe('');
		});
	});

	describe('fontFamily', () => {
		it('Should return the configured value', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('fontFamily', ' Menlo, "Fira Code", monospace ');

			// Run
			const value = config.fontFamily;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('fontFamily', '');
			expect(value).toBe('Menlo, "Fira Code", monospace');
		});

		it('Should remove characters that could break out of the CSS value', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('fontFamily', 'Menlo; } body { color: red </style>');

			// Run
			const value = config.fontFamily;

			// Assert
			expect(value).toBe('Menlo  body  color: red /style');
		});

		it('Should return the default configuration value ("")', () => {
			// Run
			const value = config.fontFamily;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('fontFamily', '');
			expect(value).toBe('');
		});
	});

	describe('graph', () => {
		describe('colours', () => {
			it('Should return a filtered array of colours based on the configuration value', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('graph.colours', ['#ff0000', '#0000000', '#00ff0088', 'rgb(1,2,3)', 'rgb(1,2,x)']);

				// Run
				const value = config.graph.colours;

				// Assert
				expectExtensionSettingToHaveBeenCalled('graph.colours');
				expect(value).toHaveLength(3);
				expect(value[0]).toBe('#ff0000');
				expect(value[1]).toBe('#00ff0088');
				expect(value[2]).toBe('rgb(1,2,3)');
			});

			it('Should return the default value when the configuration value is invalid (not an array)', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('graph.colours', 5);

				// Run
				const value = config.graph.colours;

				// Assert
				expectExtensionSettingToHaveBeenCalled('graph.colours');
				expect(value).toStrictEqual(['#0085d9', '#d9008f', '#00d90a', '#d98500', '#a300d9', '#ff0000', '#00d9cc', '#e138e8', '#85d900', '#dc5b23', '#6f24d6', '#ffcc00']);
			});

			it('Should return the default value when the configuration value is invalid (an empty array)', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('graph.colours', []);

				// Run
				const value = config.graph.colours;

				// Assert
				expectExtensionSettingToHaveBeenCalled('graph.colours');
				expect(value).toStrictEqual(['#0085d9', '#d9008f', '#00d90a', '#d98500', '#a300d9', '#ff0000', '#00d9cc', '#e138e8', '#85d900', '#dc5b23', '#6f24d6', '#ffcc00']);
			});

			it('Should return the default value when the configuration value is unknown', () => {
				// Run
				const value = config.graph.colours;

				// Assert
				expectExtensionSettingToHaveBeenCalled('graph.colours');
				expect(value).toStrictEqual(['#0085d9', '#d9008f', '#00d90a', '#d98500', '#a300d9', '#ff0000', '#00d9cc', '#e138e8', '#85d900', '#dc5b23', '#6f24d6', '#ffcc00']);
			});
		});

		describe('style', () => {
			it('Should return GraphStyle.Rounded when the configuration value is "rounded"', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('graph.style', 'rounded');

				// Run
				const value = config.graph.style;

				// Assert
				expectExtensionSettingToHaveBeenCalled('graph.style');
				expect(value).toBe(GraphStyle.Rounded);
			});

			it('Should return GraphStyle.Angular when the configuration value is "angular"', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('graph.style', 'angular');

				// Run
				const value = config.graph.style;

				// Assert
				expectExtensionSettingToHaveBeenCalled('graph.style');
				expect(value).toBe(GraphStyle.Angular);
			});

			it('Should return the default value (GraphStyle.Rounded) when the configuration value is invalid', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('graph.style', 'invalid');

				// Run
				const value = config.graph.style;

				// Assert
				expectExtensionSettingToHaveBeenCalled('graph.style');
				expect(value).toBe(GraphStyle.Rounded);
			});

			it('Should return the default value (GraphStyle.Rounded) when the configuration value is unknown', () => {
				// Run
				const value = config.graph.style;

				// Assert
				expectExtensionSettingToHaveBeenCalled('graph.style');
				expect(value).toBe(GraphStyle.Rounded);
			});
		});

		describe('uncommittedChanges', () => {
			it('Should return GraphUncommittedChangesStyle.OpenCircleAtTheUncommittedChanges when the configuration value is "Open Circle at the Uncommitted Changes"', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('graph.uncommittedChanges', 'Open Circle at the Uncommitted Changes');

				// Run
				const value = config.graph.uncommittedChanges;

				// Assert
				expect(workspaceConfiguration.get).toBeCalledWith('graph.uncommittedChanges', 'Open Circle at the Uncommitted Changes');
				expect(value).toBe(GraphUncommittedChangesStyle.OpenCircleAtTheUncommittedChanges);
			});

			it('Should return GraphUncommittedChangesStyle.OpenCircleAtTheCheckedOutCommit when the configuration value is "Open Circle at the Checked Out Commit"', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('graph.uncommittedChanges', 'Open Circle at the Checked Out Commit');

				// Run
				const value = config.graph.uncommittedChanges;

				// Assert
				expect(workspaceConfiguration.get).toBeCalledWith('graph.uncommittedChanges', 'Open Circle at the Uncommitted Changes');
				expect(value).toBe(GraphUncommittedChangesStyle.OpenCircleAtTheCheckedOutCommit);
			});

			it('Should return the default value (GraphUncommittedChangesStyle.OpenCircleAtTheUncommittedChanges) when the configuration value is invalid', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('graph.uncommittedChanges', 'invalid');

				// Run
				const value = config.graph.uncommittedChanges;

				// Assert
				expect(workspaceConfiguration.get).toBeCalledWith('graph.uncommittedChanges', 'Open Circle at the Uncommitted Changes');
				expect(value).toBe(GraphUncommittedChangesStyle.OpenCircleAtTheUncommittedChanges);
			});

			it('Should return the default value (GraphUncommittedChangesStyle.OpenCircleAtTheUncommittedChanges) when the configuration value is unknown', () => {
				// Run
				const value = config.graph.uncommittedChanges;

				// Assert
				expect(workspaceConfiguration.get).toBeCalledWith('graph.uncommittedChanges', 'Open Circle at the Uncommitted Changes');
				expect(value).toBe(GraphUncommittedChangesStyle.OpenCircleAtTheUncommittedChanges);
			});
		});
	});

	describe('integratedTerminalShell', () => {
		it('Should return the configured value', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('integratedTerminalShell', '/path/to/shell');

			// Run
			const value = config.integratedTerminalShell;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('integratedTerminalShell', '');
			expect(value).toBe('/path/to/shell');
		});

		it('Should return the default configuration value ("")', () => {
			// Run
			const value = config.integratedTerminalShell;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('integratedTerminalShell', '');
			expect(value).toBe('');
		});
	});

	describe('keybindings', () => {
		describe('modifier', () => {
			it('Should return KeybindingModifier.Ctrl when the configured value is "CTRL"', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('keyboardShortcut.modifier', 'CTRL');

				// Run
				const value = config.keybindings.modifier;

				// Assert
				expect(workspaceConfiguration.get).toBeCalledWith('keyboardShortcut.modifier', 'CTRL/CMD');
				expect(value).toBe(KeybindingModifier.Ctrl);
			});

			it('Should return KeybindingModifier.Cmd when the configured value is "CMD"', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('keyboardShortcut.modifier', 'CMD');

				// Run
				const value = config.keybindings.modifier;

				// Assert
				expect(value).toBe(KeybindingModifier.Cmd);
			});

			it('Should return KeybindingModifier.CtrlOrCmd when the configured value is "CTRL/CMD"', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('keyboardShortcut.modifier', 'CTRL/CMD');

				// Run
				const value = config.keybindings.modifier;

				// Assert
				expect(value).toBe(KeybindingModifier.CtrlOrCmd);
			});

			it('Should return the default value (KeybindingModifier.CtrlOrCmd) when the configured value is invalid', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('keyboardShortcut.modifier', 'invalid');

				// Run
				const value = config.keybindings.modifier;

				// Assert
				expect(value).toBe(KeybindingModifier.CtrlOrCmd);
			});

			it('Should return the default value (KeybindingModifier.CtrlOrCmd) when the value is not set', () => {
				// Run
				const value = config.keybindings.modifier;

				// Assert
				expect(value).toBe(KeybindingModifier.CtrlOrCmd);
			});
		});
	});

	describe('markdown', testBooleanExtensionSetting('markdown', 'markdown', true));

	describe('maxDepthOfRepoSearch', () => {
		it('Should return the configured value', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('maxDepthOfRepoSearch', 5);

			// Run
			const value = config.maxDepthOfRepoSearch;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('maxDepthOfRepoSearch', 0);
			expect(value).toBe(5);
		});

		it('Should return the default configuration value (0)', () => {
			// Run
			const value = config.maxDepthOfRepoSearch;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('maxDepthOfRepoSearch', 0);
			expect(value).toBe(0);
		});
	});

	describe('openNewTabEditorGroup (Beside the Easy Graph View)', () => {
		it('Should return the column beside the Easy Graph View when it\'s open in the editor', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('openNewTabEditorGroup', 'Beside');
			setGraphViewColumn(vscode.ViewColumn.Two);

			// Run
			const value = config.openNewTabEditorGroup;
			setGraphViewColumn(undefined);

			// Assert
			expect(value).toBe(vscode.ViewColumn.Three);
		});

		it('Should not change other columns when the Easy Graph View is open in the editor', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('openNewTabEditorGroup', 'One');
			setGraphViewColumn(vscode.ViewColumn.Two);

			// Run
			const value = config.openNewTabEditorGroup;
			setGraphViewColumn(undefined);

			// Assert
			expect(value).toBe(vscode.ViewColumn.One);
		});
	});

	describe('openNewTabEditorGroup', () => {
		it('Should return vscode.ViewColumn.Active when the configuration value is "Active"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('openNewTabEditorGroup', 'Active');

			// Run
			const value = config.openNewTabEditorGroup;

			// Assert
			expectExtensionSettingToHaveBeenCalled('openNewTabEditorGroup');
			expect(value).toBe(vscode.ViewColumn.Active);
		});

		it('Should return vscode.ViewColumn.Beside when the configuration value is "Beside"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('openNewTabEditorGroup', 'Beside');

			// Run
			const value = config.openNewTabEditorGroup;

			// Assert
			expectExtensionSettingToHaveBeenCalled('openNewTabEditorGroup');
			expect(value).toBe(vscode.ViewColumn.Beside);
		});

		it('Should return vscode.ViewColumn.One when the configuration value is "One"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('openNewTabEditorGroup', 'One');

			// Run
			const value = config.openNewTabEditorGroup;

			// Assert
			expectExtensionSettingToHaveBeenCalled('openNewTabEditorGroup');
			expect(value).toBe(vscode.ViewColumn.One);
		});

		it('Should return vscode.ViewColumn.Two when the configuration value is "Two"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('openNewTabEditorGroup', 'Two');

			// Run
			const value = config.openNewTabEditorGroup;

			// Assert
			expectExtensionSettingToHaveBeenCalled('openNewTabEditorGroup');
			expect(value).toBe(vscode.ViewColumn.Two);
		});

		it('Should return vscode.ViewColumn.Three when the configuration value is "Three"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('openNewTabEditorGroup', 'Three');

			// Run
			const value = config.openNewTabEditorGroup;

			// Assert
			expectExtensionSettingToHaveBeenCalled('openNewTabEditorGroup');
			expect(value).toBe(vscode.ViewColumn.Three);
		});

		it('Should return vscode.ViewColumn.Four when the configuration value is "Four"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('openNewTabEditorGroup', 'Four');

			// Run
			const value = config.openNewTabEditorGroup;

			// Assert
			expectExtensionSettingToHaveBeenCalled('openNewTabEditorGroup');
			expect(value).toBe(vscode.ViewColumn.Four);
		});

		it('Should return vscode.ViewColumn.Five when the configuration value is "Five"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('openNewTabEditorGroup', 'Five');

			// Run
			const value = config.openNewTabEditorGroup;

			// Assert
			expectExtensionSettingToHaveBeenCalled('openNewTabEditorGroup');
			expect(value).toBe(vscode.ViewColumn.Five);
		});

		it('Should return vscode.ViewColumn.Six when the configuration value is "Six"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('openNewTabEditorGroup', 'Six');

			// Run
			const value = config.openNewTabEditorGroup;

			// Assert
			expectExtensionSettingToHaveBeenCalled('openNewTabEditorGroup');
			expect(value).toBe(vscode.ViewColumn.Six);
		});

		it('Should return vscode.ViewColumn.Seven when the configuration value is "Seven"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('openNewTabEditorGroup', 'Seven');

			// Run
			const value = config.openNewTabEditorGroup;

			// Assert
			expectExtensionSettingToHaveBeenCalled('openNewTabEditorGroup');
			expect(value).toBe(vscode.ViewColumn.Seven);
		});

		it('Should return vscode.ViewColumn.Eight when the configuration value is "Eight"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('openNewTabEditorGroup', 'Eight');

			// Run
			const value = config.openNewTabEditorGroup;

			// Assert
			expectExtensionSettingToHaveBeenCalled('openNewTabEditorGroup');
			expect(value).toBe(vscode.ViewColumn.Eight);
		});

		it('Should return vscode.ViewColumn.Nine when the configuration value is "Nine"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('openNewTabEditorGroup', 'Nine');

			// Run
			const value = config.openNewTabEditorGroup;

			// Assert
			expectExtensionSettingToHaveBeenCalled('openNewTabEditorGroup');
			expect(value).toBe(vscode.ViewColumn.Nine);
		});

		it('Should return the default value (vscode.ViewColumn.Active) when the configuration value is invalid', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('openNewTabEditorGroup', 'invalid');

			// Run
			const value = config.openNewTabEditorGroup;

			// Assert
			expectExtensionSettingToHaveBeenCalled('openNewTabEditorGroup');
			expect(value).toBe(vscode.ViewColumn.Active);
		});

		it('Should return the default value (vscode.ViewColumn.Active) when the configuration value is unknown', () => {
			// Run
			const value = config.openNewTabEditorGroup;

			// Assert
			expectExtensionSettingToHaveBeenCalled('openNewTabEditorGroup');
			expect(value).toBe(vscode.ViewColumn.Active);
		});
	});

	describe('openToTheRepoOfTheActiveTextEditorDocument', testBooleanExtensionSetting('openToTheRepoOfTheActiveTextEditorDocument', 'openToTheRepoOfTheActiveTextEditorDocument', false));

	describe('referenceLabels', () => {
		describe('combineLocalAndRemoteBranchLabels', () => {
			it('Should return TRUE when the configuration value is TRUE', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('referenceLabels.combineLocalAndRemoteBranchLabels', true);

				// Run
				const value = config.referenceLabels.combineLocalAndRemoteBranchLabels;

				// Assert
				expectExtensionSettingToHaveBeenCalled('referenceLabels.combineLocalAndRemoteBranchLabels');
				expect(value).toBe(true);
			});

			it('Should return FALSE when the configuration value is FALSE', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('referenceLabels.combineLocalAndRemoteBranchLabels', false);

				// Run
				const value = config.referenceLabels.combineLocalAndRemoteBranchLabels;

				// Assert
				expectExtensionSettingToHaveBeenCalled('referenceLabels.combineLocalAndRemoteBranchLabels');
				expect(value).toBe(false);
			});

			it('Should return TRUE when the configuration value is truthy', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('referenceLabels.combineLocalAndRemoteBranchLabels', 5);

				// Run
				const value = config.referenceLabels.combineLocalAndRemoteBranchLabels;

				// Assert
				expectExtensionSettingToHaveBeenCalled('referenceLabels.combineLocalAndRemoteBranchLabels');
				expect(value).toBe(true);
			});

			it('Should return FALSE when the configuration value is falsy', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('referenceLabels.combineLocalAndRemoteBranchLabels', 0);

				// Run
				const value = config.referenceLabels.combineLocalAndRemoteBranchLabels;

				// Assert
				expectExtensionSettingToHaveBeenCalled('referenceLabels.combineLocalAndRemoteBranchLabels');
				expect(value).toBe(false);
			});

			it('Should return the default value (TRUE) when the configuration value is unknown', () => {
				// Run
				const value = config.referenceLabels.combineLocalAndRemoteBranchLabels;

				// Assert
				expectExtensionSettingToHaveBeenCalled('referenceLabels.combineLocalAndRemoteBranchLabels');
				expect(value).toBe(true);
			});
		});

		describe('branchLabelsAlignedToGraph & tagLabelsOnRight', () => {
			it('Should return correct alignment values when the configuration value is "Normal"', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('referenceLabels.alignment', 'Normal');

				// Run
				const value = config.referenceLabels;

				// Assert
				expectExtensionSettingToHaveBeenCalled('referenceLabels.alignment');
				expect(value.branchLabelsAlignedToGraph).toBe(false);
				expect(value.tagLabelsOnRight).toBe(false);
			});

			it('Should return correct alignment values when the configuration value is "Branches (on the left) & Tags (on the right)"', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('referenceLabels.alignment', 'Branches (on the left) & Tags (on the right)');

				// Run
				const value = config.referenceLabels;

				// Assert
				expectExtensionSettingToHaveBeenCalled('referenceLabels.alignment');
				expect(value.branchLabelsAlignedToGraph).toBe(false);
				expect(value.tagLabelsOnRight).toBe(true);
			});

			it('Should return correct alignment values when the configuration value is "Branches (aligned to the graph) & Tags (on the right)"', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('referenceLabels.alignment', 'Branches (aligned to the graph) & Tags (on the right)');

				// Run
				const value = config.referenceLabels;

				// Assert
				expectExtensionSettingToHaveBeenCalled('referenceLabels.alignment');
				expect(value.branchLabelsAlignedToGraph).toBe(true);
				expect(value.tagLabelsOnRight).toBe(true);
			});

			it('Should return the default values when the configuration value is invalid', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('referenceLabels.alignment', 'invalid');

				// Run
				const value = config.referenceLabels;

				// Assert
				expectExtensionSettingToHaveBeenCalled('referenceLabels.alignment');
				expect(value.branchLabelsAlignedToGraph).toBe(false);
				expect(value.tagLabelsOnRight).toBe(false);
			});

			it('Should return the default values when the configuration value is unknown', () => {
				// Run
				const value = config.referenceLabels;

				// Assert
				expectExtensionSettingToHaveBeenCalled('referenceLabels.alignment');
				expect(value.branchLabelsAlignedToGraph).toBe(false);
				expect(value.tagLabelsOnRight).toBe(false);
			});
		});
	});

	describe('fetchAvatars', testBooleanExtensionSetting('fetchAvatars', 'repository.commits.fetchAvatars', false));

	describe('initialLoadCommits', () => {
		it('Should return the configured value', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('repository.commits.initialLoad', 600);

			// Run
			const value = config.initialLoadCommits;

			// Assert
			expectExtensionSettingToHaveBeenCalled('repository.commits.initialLoad');
			expect(value).toBe(600);
		});

		it('Should return the default configuration value (300)', () => {
			// Run
			const value = config.initialLoadCommits;

			// Assert
			expectExtensionSettingToHaveBeenCalled('repository.commits.initialLoad');
			expect(value).toBe(300);
		});
	});

	describe('loadMoreCommits', () => {
		it('Should return the configured value', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('repository.commits.loadMore', 200);

			// Run
			const value = config.loadMoreCommits;

			// Assert
			expectExtensionSettingToHaveBeenCalled('repository.commits.loadMore');
			expect(value).toBe(200);
		});

		it('Should return the default configuration value (100)', () => {
			// Run
			const value = config.loadMoreCommits;

			// Assert
			expectExtensionSettingToHaveBeenCalled('repository.commits.loadMore');
			expect(value).toBe(100);
		});
	});

	describe('loadMoreCommitsAutomatically', testBooleanExtensionSetting('loadMoreCommitsAutomatically', 'repository.commits.loadMoreAutomatically', true));

	describe('muteCommits', () => {
		describe('commitsNotAncestorsOfHead', () => {
			it('Should return TRUE when the configuration value is TRUE', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('repository.commits.mute.commitsThatAreNotAncestorsOfHead', true);

				// Run
				const value = config.muteCommits.commitsNotAncestorsOfHead;

				// Assert
				expectExtensionSettingToHaveBeenCalled('repository.commits.mute.commitsThatAreNotAncestorsOfHead');
				expect(value).toBe(true);
			});

			it('Should return FALSE when the configuration value is FALSE', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('repository.commits.mute.commitsThatAreNotAncestorsOfHead', false);

				// Run
				const value = config.muteCommits.commitsNotAncestorsOfHead;

				// Assert
				expectExtensionSettingToHaveBeenCalled('repository.commits.mute.commitsThatAreNotAncestorsOfHead');
				expect(value).toBe(false);
			});

			it('Should return TRUE when the configuration value is truthy', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('repository.commits.mute.commitsThatAreNotAncestorsOfHead', 5);

				// Run
				const value = config.muteCommits.commitsNotAncestorsOfHead;

				// Assert
				expectExtensionSettingToHaveBeenCalled('repository.commits.mute.commitsThatAreNotAncestorsOfHead');
				expect(value).toBe(true);
			});

			it('Should return FALSE when the configuration value is falsy', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('repository.commits.mute.commitsThatAreNotAncestorsOfHead', 0);

				// Run
				const value = config.muteCommits.commitsNotAncestorsOfHead;

				// Assert
				expectExtensionSettingToHaveBeenCalled('repository.commits.mute.commitsThatAreNotAncestorsOfHead');
				expect(value).toBe(false);
			});

			it('Should return the default value (FALSE) when the configuration value is unknown', () => {
				// Run
				const value = config.muteCommits.commitsNotAncestorsOfHead;

				// Assert
				expectExtensionSettingToHaveBeenCalled('repository.commits.mute.commitsThatAreNotAncestorsOfHead');
				expect(value).toBe(false);
			});
		});

		describe('mergeCommits', () => {
			it('Should return TRUE when the configuration value is TRUE', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('repository.commits.mute.mergeCommits', true);

				// Run
				const value = config.muteCommits.mergeCommits;

				// Assert
				expectExtensionSettingToHaveBeenCalled('repository.commits.mute.mergeCommits');
				expect(value).toBe(true);
			});

			it('Should return FALSE when the configuration value is FALSE', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('repository.commits.mute.mergeCommits', false);

				// Run
				const value = config.muteCommits.mergeCommits;

				// Assert
				expectExtensionSettingToHaveBeenCalled('repository.commits.mute.mergeCommits');
				expect(value).toBe(false);
			});

			it('Should return TRUE when the configuration value is truthy', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('repository.commits.mute.mergeCommits', 5);

				// Run
				const value = config.muteCommits.mergeCommits;

				// Assert
				expectExtensionSettingToHaveBeenCalled('repository.commits.mute.mergeCommits');
				expect(value).toBe(true);
			});

			it('Should return FALSE when the configuration value is falsy', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('repository.commits.mute.mergeCommits', 0);

				// Run
				const value = config.muteCommits.mergeCommits;

				// Assert
				expectExtensionSettingToHaveBeenCalled('repository.commits.mute.mergeCommits');
				expect(value).toBe(false);
			});

			it('Should return the default value (TRUE) when the configuration value is unknown', () => {
				// Run
				const value = config.muteCommits.mergeCommits;

				// Assert
				expectExtensionSettingToHaveBeenCalled('repository.commits.mute.mergeCommits');
				expect(value).toBe(true);
			});
		});
	});

	describe('commitOrder', () => {
		it('Should return CommitOrdering.Date when the configuration value is "date"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('repository.commits.order', 'date');

			// Run
			const value = config.commitOrder;

			// Assert
			expectExtensionSettingToHaveBeenCalled('repository.commits.order');
			expect(value).toBe(CommitOrdering.Date);
		});

		it('Should return CommitOrdering.AuthorDate when the configuration value is "author-date"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('repository.commits.order', 'author-date');

			// Run
			const value = config.commitOrder;

			// Assert
			expectExtensionSettingToHaveBeenCalled('repository.commits.order');
			expect(value).toBe(CommitOrdering.AuthorDate);
		});

		it('Should return CommitOrdering.Topological when the configuration value is "topo"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('repository.commits.order', 'topo');

			// Run
			const value = config.commitOrder;

			// Assert
			expectExtensionSettingToHaveBeenCalled('repository.commits.order');
			expect(value).toBe(CommitOrdering.Topological);
		});

		it('Should return the default value (CommitOrdering.Date) when the configuration value is invalid', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('repository.commits.order', 'invalid');

			// Run
			const value = config.commitOrder;

			// Assert
			expectExtensionSettingToHaveBeenCalled('repository.commits.order');
			expect(value).toBe(CommitOrdering.Date);
		});

		it('Should return the default value (CommitOrdering.Date) when the configuration value is unknown', () => {
			// Run
			const value = config.commitOrder;

			// Assert
			expectExtensionSettingToHaveBeenCalled('repository.commits.order');
			expect(value).toBe(CommitOrdering.Date);
		});
	});




	describe('includeCommitsMentionedByReflogs', testBooleanExtensionSetting('includeCommitsMentionedByReflogs', 'repository.includeCommitsMentionedByReflogs', false));

	describe('onRepoLoad', () => {
		describe('scrollToHead', () => {
			it('Should return TRUE when the configuration value is TRUE', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('repository.onLoad.scrollToHead', true);

				// Run
				const value = config.onRepoLoad.scrollToHead;

				// Assert
				expectExtensionSettingToHaveBeenCalled('repository.onLoad.scrollToHead');
				expect(value).toBe(true);
			});

			it('Should return FALSE when the configuration value is FALSE', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('repository.onLoad.scrollToHead', false);

				// Run
				const value = config.onRepoLoad.scrollToHead;

				// Assert
				expectExtensionSettingToHaveBeenCalled('repository.onLoad.scrollToHead');
				expect(value).toBe(false);
			});

			it('Should return TRUE when the configuration value is truthy', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('repository.onLoad.scrollToHead', 5);

				// Run
				const value = config.onRepoLoad.scrollToHead;

				// Assert
				expectExtensionSettingToHaveBeenCalled('repository.onLoad.scrollToHead');
				expect(value).toBe(true);
			});

			it('Should return FALSE when the configuration value is falsy', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('repository.onLoad.scrollToHead', 0);

				// Run
				const value = config.onRepoLoad.scrollToHead;

				// Assert
				expectExtensionSettingToHaveBeenCalled('repository.onLoad.scrollToHead');
				expect(value).toBe(false);
			});

			it('Should return the default value (FALSE) when the configuration value is unknown', () => {
				// Run
				const value = config.onRepoLoad.scrollToHead;

				// Assert
				expectExtensionSettingToHaveBeenCalled('repository.onLoad.scrollToHead');
				expect(value).toBe(false);
			});
		});

		describe('showCheckedOutBranch', () => {
			it('Should return TRUE when the configuration value is TRUE', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('repository.onLoad.showCheckedOutBranch', true);

				// Run
				const value = config.onRepoLoad.showCheckedOutBranch;

				// Assert
				expectExtensionSettingToHaveBeenCalled('repository.onLoad.showCheckedOutBranch');
				expect(value).toBe(true);
			});

			it('Should return FALSE when the configuration value is FALSE', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('repository.onLoad.showCheckedOutBranch', false);

				// Run
				const value = config.onRepoLoad.showCheckedOutBranch;

				// Assert
				expectExtensionSettingToHaveBeenCalled('repository.onLoad.showCheckedOutBranch');
				expect(value).toBe(false);
			});

			it('Should return TRUE when the configuration value is truthy', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('repository.onLoad.showCheckedOutBranch', 5);

				// Run
				const value = config.onRepoLoad.showCheckedOutBranch;

				// Assert
				expectExtensionSettingToHaveBeenCalled('repository.onLoad.showCheckedOutBranch');
				expect(value).toBe(true);
			});

			it('Should return FALSE when the configuration value is falsy', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('repository.onLoad.showCheckedOutBranch', 0);

				// Run
				const value = config.onRepoLoad.showCheckedOutBranch;

				// Assert
				expectExtensionSettingToHaveBeenCalled('repository.onLoad.showCheckedOutBranch');
				expect(value).toBe(false);
			});

			it('Should return the default value (FALSE) when the configuration value is unknown', () => {
				// Run
				const value = config.onRepoLoad.showCheckedOutBranch;

				// Assert
				expectExtensionSettingToHaveBeenCalled('repository.onLoad.showCheckedOutBranch');
				expect(value).toBe(false);
			});
		});

		describe('showSpecificBranches', () => {
			it('Should return all branches when correctly configured', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('repository.onLoad.showSpecificBranches', ['master', 'develop']);

				// Run
				const value = config.onRepoLoad.showSpecificBranches;

				// Assert
				expect(workspaceConfiguration.get).toBeCalledWith('repository.onLoad.showSpecificBranches', expect.anything());
				expect(value).toStrictEqual(['master', 'develop']);
			});

			it('Should filter out all non-string branches', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('repository.onLoad.showSpecificBranches', ['master', 5, 'develop']);

				// Run
				const value = config.onRepoLoad.showSpecificBranches;

				// Assert
				expect(workspaceConfiguration.get).toBeCalledWith('repository.onLoad.showSpecificBranches', expect.anything());
				expect(value).toStrictEqual(['master', 'develop']);
			});

			it('Should return the default value ([]) when the configuration value is invalid', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('repository.onLoad.showSpecificBranches', 'master');

				// Run
				const value = config.onRepoLoad.showSpecificBranches;

				// Assert
				expect(workspaceConfiguration.get).toBeCalledWith('repository.onLoad.showSpecificBranches', expect.anything());
				expect(value).toStrictEqual([]);
			});

			it('Should return the default value ([]) when the configuration value is unknown', () => {
				// Run
				const value = config.onRepoLoad.showSpecificBranches;

				// Assert
				expect(workspaceConfiguration.get).toBeCalledWith('repository.onLoad.showSpecificBranches', expect.anything());
				expect(value).toStrictEqual([]);
			});
		});
	});

	describe('onlyFollowFirstParent', testBooleanExtensionSetting('onlyFollowFirstParent', 'repository.onlyFollowFirstParent', false));

	describe('singleAuthorSelect', testBooleanExtensionSetting('singleAuthorSelect', 'repository.singleAuthorSelect', true));

	describe('singleBranchSelect', testBooleanExtensionSetting('singleBranchSelect', 'repository.singleBranchSelect', true));

	describe('simplifyByDecoration', testBooleanExtensionSetting('simplifyByDecoration', 'repository.simplifyByDecoration', false));

	describe('showCommitsOnlyReferencedByTags', testBooleanExtensionSetting('showCommitsOnlyReferencedByTags', 'repository.showCommitsOnlyReferencedByTags', true));

	describe('showSignatureStatus', testBooleanExtensionSetting('showSignatureStatus', 'repository.commits.showSignatureStatus', false));

	describe('showRemoteBranches', testBooleanExtensionSetting('showRemoteBranches', 'repository.showRemoteBranches', true));

	describe('onlyShowRemoteBranchesWithLocalBranches', testBooleanExtensionSetting('onlyShowRemoteBranchesWithLocalBranches', 'repository.onlyShowRemoteBranchesWithLocalBranches', false));

	describe('showRemoteHeads', testBooleanExtensionSetting('showRemoteHeads', 'repository.showRemoteHeads', true));

	describe('showStashes', testBooleanExtensionSetting('showStashes', 'repository.showStashes', true));

	describe('showTags', testBooleanExtensionSetting('showTags', 'repository.showTags', true));

	describe('showUncommittedChanges', testBooleanExtensionSetting('showUncommittedChanges', 'repository.showUncommittedChanges', true));





	describe('repoDropdownOrder', () => {
		it('Should return RepoDropdownOrder.Name when the configuration value is "Name"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('repositoryDropdownOrder', 'Name');

			// Run
			const value = config.repoDropdownOrder;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('repositoryDropdownOrder', 'Workspace Full Path');
			expect(value).toBe(RepoDropdownOrder.Name);
		});

		it('Should return RepoDropdownOrder.FullPath when the configuration value is "Full Path"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('repositoryDropdownOrder', 'Full Path');

			// Run
			const value = config.repoDropdownOrder;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('repositoryDropdownOrder', 'Workspace Full Path');
			expect(value).toBe(RepoDropdownOrder.FullPath);
		});

		it('Should return RepoDropdownOrder.WorkspaceFullPath when the configuration value is "Workspace Full Path"', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('repositoryDropdownOrder', 'Workspace Full Path');

			// Run
			const value = config.repoDropdownOrder;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('repositoryDropdownOrder', 'Workspace Full Path');
			expect(value).toBe(RepoDropdownOrder.WorkspaceFullPath);
		});

		it('Should return the default value (RepoDropdownOrder.WorkspaceFullPath) when the configuration value is invalid', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('repositoryDropdownOrder', 'invalid');

			// Run
			const value = config.repoDropdownOrder;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('repositoryDropdownOrder', 'Workspace Full Path');
			expect(value).toBe(RepoDropdownOrder.WorkspaceFullPath);
		});

		it('Should return the default value (RepoDropdownOrder.WorkspaceFullPath) when the configuration value is not set', () => {
			// Run
			const value = config.repoDropdownOrder;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('repositoryDropdownOrder', 'Workspace Full Path');
			expect(value).toBe(RepoDropdownOrder.WorkspaceFullPath);
		});
	});

	describe('retainContextWhenHidden', testBooleanExtensionSetting('retainContextWhenHidden', 'retainContextWhenHidden', true));

	describe('showStatusBarItem', testBooleanExtensionSetting('showStatusBarItem', 'showStatusBarItem', true));

	describe('stickyHeader', testBooleanExtensionSetting('stickyHeader', 'stickyHeader', true));

	describe('disableRefreshWhenShown', testBooleanExtensionSetting('disableRefreshWhenShown', 'disableRefreshWhenShown', false));

	describe('toggleViewOnCommand', testBooleanExtensionSetting('toggleViewOnCommand', 'toggleViewOnCommand', false));

	describe('viewLocation', () => {
		it.each(['editor', 'panel', 'both'])('Should return the configured location "%s"', (location) => {
			// Setup
			vscode.mockExtensionSettingReturnValue('viewLocation', location);

			// Run
			const value = config.viewLocation;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('viewLocation', 'editor');
			expect(value).toBe(location);
		});

		it.each([['an unknown location', 'sidebar'], ['a value that isn\'t a string', 5]])('Should fall back to the editor when configured with %s', (_, location) => {
			// Setup
			vscode.mockExtensionSettingReturnValue('viewLocation', location);

			// Run
			const value = config.viewLocation;

			// Assert
			expect(value).toBe('editor');
		});

		it('Should return the default value (editor) when not configured', () => {
			// Run
			const value = config.viewLocation;

			// Assert
			expect(value).toBe('editor');
		});
	});

	describe('fetchOnLoad', testBooleanExtensionSetting('fetchOnLoad', 'repository.fetchOnLoad', false));

	describe('repositories', () => {
		it('Should return the configured paths (ignoring invalid values)', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('repositories', ['/path/to/repo', 5, '', '${workspaceFolder}/sub']);

			// Run
			const value = config.repositories;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('repositories', []);
			expect(value).toStrictEqual(['/path/to/repo', '${workspaceFolder}/sub']);
		});

		it('Should return an empty array when the configuration value isn\'t an array', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('repositories', 'invalid');

			// Run
			const value = config.repositories;

			// Assert
			expect(value).toStrictEqual([]);
		});
	});

	describe('repoSearchExclude', () => {
		it('Should return the default patterns combined with the enabled files.exclude patterns', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('exclude', { '**/.git': true, '**/build': true, 'out': false });

			// Run
			const value = config.repoSearchExclude;

			// Assert
			expect(workspaceConfiguration.get).toBeCalledWith('repoSearchExclude', ['**/node_modules']);
			expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('files');
			expect(value).toStrictEqual(['**/node_modules', '**/.git', '**/build']);
		});

		it('Should return the configured patterns (ignoring invalid values)', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('repoSearchExclude', ['vendor', 5, '']);

			// Run
			const value = config.repoSearchExclude;

			// Assert
			expect(value).toStrictEqual(['vendor']);
		});
	});

	describe('showBranchColourOnRows', testBooleanExtensionSetting('showBranchColourOnRows', 'graph.showBranchColourOnRows', false));

	describe('gitPaths', () => {
		it('Should return the configured path', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('path', '/path/to/git');

			// Run
			const value = config.gitPaths;

			// Assert
			expect(vscode.workspace.getConfiguration).toBeCalledWith('git');
			expect(workspaceConfiguration.get).toBeCalledWith('path', null);
			expect(value).toStrictEqual(['/path/to/git']);
		});

		it('Should return the valid configured paths', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('path', ['/path/to/first/git', '/path/to/second/git', 4, {}, null, '/path/to/third/git']);

			// Run
			const value = config.gitPaths;

			// Assert
			expect(vscode.workspace.getConfiguration).toBeCalledWith('git');
			expect(workspaceConfiguration.get).toBeCalledWith('path', null);
			expect(value).toStrictEqual(['/path/to/first/git', '/path/to/second/git', '/path/to/third/git']);
		});

		it('Should return an empty array when the configuration value is NULL', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('path', null);

			// Run
			const value = config.gitPaths;

			// Assert
			expect(vscode.workspace.getConfiguration).toBeCalledWith('git');
			expect(workspaceConfiguration.get).toBeCalledWith('path', null);
			expect(value).toStrictEqual([]);
		});

		it('Should return an empty array when the configuration value is invalid', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('path', 4);

			// Run
			const value = config.gitPaths;

			// Assert
			expect(vscode.workspace.getConfiguration).toBeCalledWith('git');
			expect(workspaceConfiguration.get).toBeCalledWith('path', null);
			expect(value).toStrictEqual([]);
		});

		it('Should return an empty array when the default configuration value (NULL) is received', () => {
			// Run
			const value = config.gitPaths;

			// Assert
			expect(vscode.workspace.getConfiguration).toBeCalledWith('git');
			expect(workspaceConfiguration.get).toBeCalledWith('path', null);
			expect(value).toStrictEqual([]);
		});
	});


	function testColourExtensionSetting(configKey: keyof Config, section: string) {
		return () => {
			it('Should return the configured value when it is a valid colour', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue(section, ' #ffcc0080 ');

				// Run
				const value1 = config[configKey];

				// Setup
				vscode.mockExtensionSettingReturnValue(section, 'rgba(1, 2, 3, 0.5)');

				// Run
				const value2 = config[configKey];

				// Assert
				expect(workspaceConfiguration.get).toBeCalledWith(section, '');
				expect(value1).toBe('#ffcc0080');
				expect(value2).toBe('rgba(1, 2, 3, 0.5)');
			});

			it('Should return the default value when the configuration value is not a valid colour', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue(section, 'red; } body {');

				// Run
				const value = config[configKey];

				// Assert
				expect(value).toBe('');
			});

			it('Should return the default configuration value ("")', () => {
				// Run
				const value = config[configKey];

				// Assert
				expect(workspaceConfiguration.get).toBeCalledWith(section, '');
				expect(value).toBe('');
			});
		};
	}

	function testBooleanExtensionSetting(configKey: keyof Config, section: string, defaultValue: boolean) {
		return () => {
			it('Should return TRUE when the configuration value is TRUE', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue(section, true);

				// Run
				const value = config[configKey];

				// Assert
				expect(workspaceConfiguration.get).toBeCalledWith(section, defaultValue);
				expect(value).toBe(true);
			});

			it('Should return FALSE when the configuration value is FALSE', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue(section, false);

				// Run
				const value = config[configKey];

				// Assert
				expect(workspaceConfiguration.get).toBeCalledWith(section, defaultValue);
				expect(value).toBe(false);
			});

			it('Should return TRUE when the configuration value is truthy', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue(section, 5);

				// Run
				const value = config[configKey];

				// Assert
				expect(workspaceConfiguration.get).toBeCalledWith(section, defaultValue);
				expect(value).toBe(true);
			});

			it('Should return FALSE when the configuration value is falsy', () => {
				// Setup
				vscode.mockExtensionSettingReturnValue(section, 0);

				// Run
				const value = config[configKey];

				// Assert
				expect(workspaceConfiguration.get).toBeCalledWith(section, defaultValue);
				expect(value).toBe(false);
			});

			it('Should return the default value (' + (defaultValue ? 'TRUE' : 'FALSE') + ') when the configuration value is not set', () => {
				// Run
				const value = config[configKey];

				// Assert
				expect(workspaceConfiguration.get).toBeCalledWith(section, defaultValue);
				expect(value).toBe(defaultValue);
			});
		};
	}
});
