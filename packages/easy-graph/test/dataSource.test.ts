import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { useFakeTimers, useRealTimers } from './helpers/timers';
import * as date from './mocks/date';
import { mockSpyOnSpawn } from './mocks/spawn';
import * as vscode from './mocks/vscode';
vi.mock('vscode', () => import('./mocks/vscode'));
vi.mock('../src/askpass/askpassManager');
vi.mock('../src/logger');
vi.mock('child_process', { spy: true });
vi.mock('fs', { spy: true });
vi.mock('iconv-lite', async (importOriginal) => {
	// iconv-lite 是 CJS 模块, 原生 ESM 命名空间不可 spy; 这里展开成普通对象, 让 vi.spyOn(iconv, 'decode') 可用
	const actual: any = await importOriginal();
	const iconvModule = actual.default ?? actual;
	return { ...iconvModule, default: iconvModule, decode: vi.fn(iconvModule.decode) };
});
vi.mock('path', { spy: true });

import * as cp from 'child_process';
import * as fs from 'fs';
import * as iconv from 'iconv-lite';
import * as os from 'os';
import * as path from 'path';
import { ConfigurationChangeEvent } from 'vscode';
import { DataSource, GitConfigKey, convertCygwinPath, rebaseTodoActionEditor, selectDanglingCommits } from '../src/dataSource';
import { Logger } from '../src/logger';
import { CommitOrdering, GitConfigLocation, GitPushBranchMode, GitResetMode, GitSignature, GitSignatureStatus, GitStash, MergeActionOn, RebaseActionOn, RepoScope, TagType } from '../src/types';
import * as utils from '../src/utils';
import { EventEmitter } from '../src/utils/event';

import { waitForExpect } from './helpers/expectations';

const workspaceConfiguration = vscode.mocks.workspaceConfiguration;
let onDidChangeConfiguration: EventEmitter<ConfigurationChangeEvent>;
let onDidChangeGitExecutable: EventEmitter<utils.GitExecutable>;
let logger: Logger;
let spyOnSpawn: MockInstance, spyOnLog: MockInstance, spyOnLogError: MockInstance;

beforeAll(() => {
	onDidChangeConfiguration = new EventEmitter<ConfigurationChangeEvent>();
	onDidChangeGitExecutable = new EventEmitter<utils.GitExecutable>();
	logger = new Logger();
	vi.spyOn(path, 'normalize').mockImplementation((p) => p);
	spyOnSpawn = vi.spyOn(cp, 'spawn');
	spyOnLog = vi.spyOn(logger, 'log');
	spyOnLogError = vi.spyOn(logger, 'logError');
});

afterAll(() => {
	logger.dispose();
	onDidChangeConfiguration.dispose();
	onDidChangeGitExecutable.dispose();
});

describe('DataSource', () => {
	let dataSource: DataSource;
	beforeEach(() => {
		dataSource = new DataSource({ path: '/path/to/git', version: '2.25.0' }, onDidChangeConfiguration.subscribe, onDidChangeGitExecutable.subscribe, logger);
	});
	afterEach(() => {
		dataSource.dispose();
	});

	const mockGitSuccessOnce = (stdout?: string, stderr?: string) => {
		mockSpyOnSpawn(spyOnSpawn, (onCallbacks, stderrOnCallbacks, stdoutOnCallbacks) => {
			if (stdout) {
				stdoutOnCallbacks['data'](Buffer.from(stdout));
			}
			stdoutOnCallbacks['close']();
			if (stderr) {
				stderrOnCallbacks['data'](Buffer.from(stderr));
			}
			stderrOnCallbacks['close']();
			onCallbacks['exit'](0);
		});
	};

	// The effective `easy-graph.builtin` values of a repository without Git config, with the default value of the Extension Setting
	const DEFAULT_BUILTIN_STATE = { abbrevLength: 7, fetchPrune: false, fetchPruneTags: false, mergeNoFastForward: true, pullNoFastForward: false, pushSetUpstream: true };

	// Mock the `git config` and `git rev-parse --short` commands of `getBuiltinGitState`
	const mockBuiltinGitStateOnce = (gitConfig: string = '', shortHash: string = '1a2b3c4') => {
		mockGitSuccessOnce(gitConfig);
		mockGitSuccessOnce(shortHash + '\n');
	};

	const mockGitThrowingErrorOnce = (errorMessage?: string) => {
		mockSpyOnSpawn(spyOnSpawn, (onCallbacks, stderrOnCallbacks, stdoutOnCallbacks) => {
			stdoutOnCallbacks['close']();
			stderrOnCallbacks['data']((errorMessage || 'error message') + '\n');
			stderrOnCallbacks['close']();
			onCallbacks['exit'](1);
		});
	};

	describe('isGitExecutableUnknown', () => {
		it('Should return FALSE when the Git executable is known', () => {
			// Run
			const result = dataSource.isGitExecutableUnknown();

			// Assert
			expect(result).toBe(false);
		});

		it('Should return TRUE when the Git executable is unknown', () => {
			// Setup
			dataSource.dispose();
			dataSource = new DataSource(null, onDidChangeConfiguration.subscribe, onDidChangeGitExecutable.subscribe, logger);

			// Run
			const result = dataSource.isGitExecutableUnknown();

			// Assert
			expect(result).toBe(true);
		});

		it('Should return TRUE after a Git executable becomes known', () => {
			// Setup
			dataSource.dispose();
			dataSource = new DataSource(null, onDidChangeConfiguration.subscribe, onDidChangeGitExecutable.subscribe, logger);

			// Run
			const result1 = dataSource.isGitExecutableUnknown();

			// Assert
			expect(result1).toBe(true);

			// Run
			onDidChangeGitExecutable.emit({ path: '/path/to/git', version: '2.25.0' });
			const result2 = dataSource.isGitExecutableUnknown();

			// Assert
			expect(result2).toBe(false);
			expect(dataSource['gitExecutable']).toStrictEqual({ path: '/path/to/git', version: '2.25.0' });
		});
	});

	describe('setGitExecutable', () => {
		it('Should set gitExecutableSupportsGpgInfo to FALSE when there is no Git executable', () => {
			// Run
			dataSource.dispose();
			dataSource = new DataSource(null, onDidChangeConfiguration.subscribe, onDidChangeGitExecutable.subscribe, logger);

			// Assert
			expect(dataSource['gitExecutableSupportsGpgInfo']).toBe(false);
		});

		it('Should set gitExecutableSupportsGpgInfo to FALSE when the Git executable is older than 2.4.0', () => {
			// Run
			onDidChangeGitExecutable.emit({ path: '/path/to/git', version: '2.3.0' });

			// Assert
			expect(dataSource['gitExecutableSupportsGpgInfo']).toBe(false);
		});

		it('Should set gitExecutableSupportsGpgInfo to TRUE when the Git executable is at least 2.4.0', () => {
			// Run
			onDidChangeGitExecutable.emit({ path: '/path/to/git', version: '2.4.0' });

			// Assert
			expect(dataSource['gitExecutableSupportsGpgInfo']).toBe(true);
		});
	});

	describe('getRepoInfo', () => {
		it('Should return the repository info', async () => {
			// Setup
			mockBuiltinGitStateOnce();
			mockGitSuccessOnce(
				'* develop\n' +
				'  master\n' +
				'  remotes/origin/HEAD\n' +
				'  remotes/origin/develop\n' +
				'  remotes/origin/master\n'
			);
			mockGitSuccessOnce('origin\n');
			mockGitSuccessOnce(
				'98adab72e57a098a45cc36e43a6c0fda95c44f8bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbb30d6d4d14462e09515df02a8635e83b4278c8b1 26970361eca306caa6d6bed3baf022dbd8fa404cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbrefs/stash@{0}XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest AuthorXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1592306634XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbWIP on develop: b30d6d4 y\n' +
				'0fc3e571c275213de2b3bca9c85e852323056121XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb9157723d0856bd828800ff185ee72658ee51d19f d45009bc4224537e97b0e52883ea7ae657928fcf 9d81ce0a6cf64b6651bacd7a6c3a6ca90fd63235XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbrefs/stash@{1}XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest AuthorXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1592135134XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbWIP on master: 9157723 y\n'
			);
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);

			// Run
			const result = await dataSource.getRepoInfo('/path/to/repo', true, true, []);

			// Assert
			expect(result).toStrictEqual({
				builtin: DEFAULT_BUILTIN_STATE,
				branches: ['develop', 'master', 'remotes/origin/HEAD', 'remotes/origin/develop', 'remotes/origin/master'],
				head: 'develop',
				remotes: ['origin'],
				stashes: [
					{
						author: 'Test Author',
						baseHash: 'b30d6d4d14462e09515df02a8635e83b4278c8b1',
						date: 1592306634,
						email: 'test@mhutchie.com',
						hash: '98adab72e57a098a45cc36e43a6c0fda95c44f8b',
						message: 'WIP on develop: b30d6d4 y',
						selector: 'refs/stash@{0}',
						untrackedFilesHash: null
					},
					{
						author: 'Test Author',
						baseHash: '9157723d0856bd828800ff185ee72658ee51d19f',
						date: 1592135134,
						email: 'test@mhutchie.com',
						hash: '0fc3e571c275213de2b3bca9c85e852323056121',
						message: 'WIP on master: 9157723 y',
						selector: 'refs/stash@{1}',
						untrackedFilesHash: '9d81ce0a6cf64b6651bacd7a6c3a6ca90fd63235'
					}
				],
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['branch', '-a', '--no-color'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['remote'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['reflog', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%gDXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%s', 'refs/stash', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the repository info (when showRemoteBranches is FALSE)', async () => {
			// Setup
			mockBuiltinGitStateOnce();
			mockGitSuccessOnce(
				'* develop\n' +
				'  master\n'
			);
			mockGitSuccessOnce('origin\n');
			mockGitSuccessOnce('\n');
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);

			// Run
			const result = await dataSource.getRepoInfo('/path/to/repo', false, true, []);

			// Assert
			expect(result).toStrictEqual({
				builtin: DEFAULT_BUILTIN_STATE,
				branches: ['develop', 'master'],
				head: 'develop',
				remotes: ['origin'],
				stashes: [],
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['branch', '--no-color'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['remote'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['reflog', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%gDXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%s', 'refs/stash', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the repository info (using easy-graph.date.type)', async () => {
			// Setup
			mockBuiltinGitStateOnce();
			mockGitSuccessOnce(
				'* develop\n' +
				'  master\n'
			);
			mockGitSuccessOnce('origin\n');
			mockGitSuccessOnce('\n');
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);
			vscode.mockExtensionSettingReturnValue('date.type', 'Commit Date');
			vscode.mockExtensionSettingReturnValue('repository.commits.showSignatureStatus', false);

			// Run
			onDidChangeConfiguration.emit({
				affectsConfiguration: (section) => section === 'easy-graph.date.type'
			});
			const result = await dataSource.getRepoInfo('/path/to/repo', false, true, []);

			// Assert
			expect(result).toStrictEqual({
				builtin: DEFAULT_BUILTIN_STATE,
				branches: ['develop', 'master'],
				head: 'develop',
				remotes: ['origin'],
				stashes: [],
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['branch', '--no-color'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['remote'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['reflog', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%gDXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%ctXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%s', 'refs/stash', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the repository info (using easy-graph.repository.useMailmap)', async () => {
			// Setup
			mockBuiltinGitStateOnce();
			mockGitSuccessOnce(
				'* develop\n' +
				'  master\n'
			);
			mockGitSuccessOnce('origin\n');
			mockGitSuccessOnce('\n');
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);
			vscode.mockExtensionSettingReturnValue('date.type', 'Author Date');
			vscode.mockExtensionSettingReturnValue('builtin', { 'log.mailmap': true });
			vscode.mockExtensionSettingReturnValue('repository.commits.showSignatureStatus', false);

			// Run
			onDidChangeConfiguration.emit({
				affectsConfiguration: (section) => section === 'easy-graph.repository.useMailmap'
			});
			const result = await dataSource.getRepoInfo('/path/to/repo', false, true, []);

			// Assert
			expect(result).toStrictEqual({
				builtin: DEFAULT_BUILTIN_STATE,
				branches: ['develop', 'master'],
				head: 'develop',
				remotes: ['origin'],
				stashes: [],
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['branch', '--no-color'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['remote'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['reflog', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%gDXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aNXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aEXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%s', 'refs/stash', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the repository info (showStashes is FALSE)', async () => {
			// Setup
			mockBuiltinGitStateOnce();
			mockGitSuccessOnce(
				'* develop\n' +
				'  master\n'
			);
			mockGitSuccessOnce('origin\n');

			// Run
			const result = await dataSource.getRepoInfo('/path/to/repo', true, false, []);

			// Assert
			expect(result).toStrictEqual({
				builtin: DEFAULT_BUILTIN_STATE,
				branches: ['develop', 'master'],
				head: 'develop',
				remotes: ['origin'],
				stashes: [],
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['branch', '-a', '--no-color'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['remote'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toHaveBeenCalledTimes(4); // The two commands of getBuiltinGitState, the branches and the remotes
		});

		it('Should return the repository info (hidden remote and an invalid branch)', async () => {
			// Setup
			mockBuiltinGitStateOnce();
			mockGitSuccessOnce(
				'* develop\n' +
				'  master\n' +
				'  (invalid branch)\n' +
				'  remotes/origin/develop\n' +
				'  remotes/origin/master\n'
			);
			mockGitSuccessOnce('origin\n');
			mockGitSuccessOnce('\n');
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);

			// Run
			const result = await dataSource.getRepoInfo('/path/to/repo', true, true, ['origin']);

			// Assert
			expect(result).toStrictEqual({
				builtin: DEFAULT_BUILTIN_STATE,
				branches: ['develop', 'master'],
				head: 'develop',
				remotes: ['origin'],
				stashes: [],
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['branch', '-a', '--no-color'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['remote'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['reflog', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%gDXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%s', 'refs/stash', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the repository info (excluding remote heads)', async () => {
			// Setup
			mockBuiltinGitStateOnce();
			mockGitSuccessOnce(
				'* develop\n' +
				'  master\n' +
				'  remotes/origin/HEAD\n' +
				'  remotes/origin/develop\n' +
				'  remotes/origin/master\n'
			);
			mockGitSuccessOnce('origin\n');
			mockGitSuccessOnce('\n');
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', false);

			// Run
			const result = await dataSource.getRepoInfo('/path/to/repo', true, true, []);

			// Assert
			expect(result).toStrictEqual({
				builtin: DEFAULT_BUILTIN_STATE,
				branches: ['develop', 'master', 'remotes/origin/develop', 'remotes/origin/master'],
				head: 'develop',
				remotes: ['origin'],
				stashes: [],
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['branch', '-a', '--no-color'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['remote'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['reflog', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%gDXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%s', 'refs/stash', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git (when getting branches)', async () => {
			// Setup
			mockBuiltinGitStateOnce();
			mockGitThrowingErrorOnce();
			mockGitSuccessOnce('origin\n');
			mockGitSuccessOnce('\n');
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);

			// Run
			const result = await dataSource.getRepoInfo('/path/to/repo', true, true, []);

			// Assert
			expect(result).toStrictEqual({
				builtin: DEFAULT_BUILTIN_STATE,
				branches: [],
				head: null,
				remotes: [],
				stashes: [],
				error: 'error message'
			});
		});

		it('Should return an error message thrown by git (when getting remotes)', async () => {
			// Setup
			mockBuiltinGitStateOnce();
			mockGitSuccessOnce(
				'* develop\n' +
				'  master\n'
			);
			mockGitThrowingErrorOnce();
			mockGitSuccessOnce('\n');
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);

			// Run
			const result = await dataSource.getRepoInfo('/path/to/repo', true, true, []);

			// Assert
			expect(result).toStrictEqual({
				builtin: DEFAULT_BUILTIN_STATE,
				branches: [],
				head: null,
				remotes: [],
				stashes: [],
				error: 'error message'
			});
		});

		it('Should return no stashes when when getting stashes throws an error', async () => {
			// Setup
			mockBuiltinGitStateOnce();
			mockGitSuccessOnce(
				'* develop\n' +
				'  master\n'
			);
			mockGitSuccessOnce('origin\n');
			mockGitThrowingErrorOnce();
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);

			// Run
			const result = await dataSource.getRepoInfo('/path/to/repo', true, true, []);

			// Assert
			expect(result).toStrictEqual({
				builtin: DEFAULT_BUILTIN_STATE,
				branches: ['develop', 'master'],
				head: 'develop',
				remotes: ['origin'],
				stashes: [],
				error: null
			});
		});
	});

	describe('getBuiltinGitState', () => {
		// Clears the keys of the default value of easy-graph.builtin, so that every key follows Git
		const FOLLOW_GIT = { 'core.abbrev': null, 'log.mailmap': null, 'merge.ff': null, 'push.autoSetupRemote': null, 'status.showUntrackedFiles': null };

		it('Should use the Git config of the repository for the keys easy-graph.builtin follows', async () => {
			// Setup
			mockBuiltinGitStateOnce('fetch.prune\ntrue\0fetch.prunetags\0merge.ff\nfalse\0pull.ff\nonly\0push.autosetupremote\nno\0log.mailmap\ntrue\0', '1a2b3c4d5e');
			vscode.mockExtensionSettingReturnValue('builtin', FOLLOW_GIT);

			// Run
			const result = await dataSource.getBuiltinGitState('/path/to/repo');

			// Assert
			expect(result).toStrictEqual({ abbrevLength: 10, fetchPrune: true, fetchPruneTags: true, mergeNoFastForward: true, pullNoFastForward: false, pushSetUpstream: false });
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['config', '-z', '--get-regexp', '^(fetch\\.prune|fetch\\.prunetags|log\\.mailmap|merge\\.ff|pull\\.ff|push\\.autosetupremote)$'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['rev-parse', '--short', 'HEAD'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should follow merge.ff for pulls when pull.ff isn\'t set', async () => {
			// Setup
			mockBuiltinGitStateOnce('merge.ff\nfalse\0');
			vscode.mockExtensionSettingReturnValue('builtin', FOLLOW_GIT);

			// Run
			const result = await dataSource.getBuiltinGitState('/path/to/repo');

			// Assert
			expect(result.mergeNoFastForward).toBe(true);
			expect(result.pullNoFastForward).toBe(true);
		});

		it('Should prefer the overrides in easy-graph.builtin over the Git config', async () => {
			// Setup
			mockBuiltinGitStateOnce('fetch.prune\ntrue\0merge.ff\nfalse\0push.autosetupremote\ntrue\0', '1a2b3c4d5e');
			vscode.mockExtensionSettingReturnValue('builtin', { 'fetch.prune': false, 'merge.ff': true, 'push.autoSetupRemote': false, 'core.abbrev': 10 });

			// Run
			const result = await dataSource.getBuiltinGitState('/path/to/repo');

			// Assert
			expect(result).toStrictEqual({ abbrevLength: 10, fetchPrune: false, fetchPruneTags: false, mergeNoFastForward: false, pullNoFastForward: true, pushSetUpstream: false });
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'core.abbrev=10', 'rev-parse', '--short', 'HEAD'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should use the default length of abbreviated commit hashes when the repository has no commits', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitThrowingErrorOnce();
			vscode.mockExtensionSettingReturnValue('builtin', FOLLOW_GIT);

			// Run
			const result = await dataSource.getBuiltinGitState('/path/to/repo');

			// Assert
			expect(result.abbrevLength).toBe(7);
		});
	});

	describe('getWorktreeBranches', () => {
		it('Should return the branches checked out in the worktrees of the repository', async () => {
			// Setup
			mockGitSuccessOnce(
				'worktree /path/to/repo\n' +
				'HEAD 1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b\n' +
				'branch refs/heads/master\n' +
				'\n' +
				'worktree /path/to/worktree-1\n' +
				'HEAD 2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c\n' +
				'branch refs/heads/feature/one\n' +
				'\n' +
				'worktree /path/to/worktree-2\n' +
				'HEAD 3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d\n' +
				'detached\n'
			);

			// Run
			const result = await dataSource.getWorktreeBranches('/path/to/repo');

			// Assert
			expect(result).toStrictEqual({
				'master': '/path/to/repo',
				'feature/one': '/path/to/worktree-1'
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['worktree', 'list', '--porcelain'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return no branches when listing the worktrees throws an error', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.getWorktreeBranches('/path/to/repo');

			// Assert
			expect(result).toStrictEqual({});
		});
	});

	describe('getCommits', () => {
		it('Should filter the commits by message in Git, matching the text literally and ignoring case', async () => {
			// Setup
			mockGitSuccessOnce('');
			mockGitSuccessOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n');

			// Run
			await dataSource.getCommits('/path/to/repo', null, null, 300, false, ['local'], false, CommitOrdering.Date, [], [], [], false, null, 'fix [a.b]*');

			// Assert
			const logArgs: string[] = spyOnSpawn.mock.calls.find((call) => call[1].includes('log'))![1];
			expect(logArgs).toContain('--regexp-ignore-case');
			expect(logArgs).toContain('--grep=fix \\[a\\.b\\]\\*');
		});

		it('Should exclude the branches matching easy-graph.excludeBranchGlobPatterns when showing all branches', async () => {
			// Setup
			mockGitSuccessOnce('');
			mockGitSuccessOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n');
			vscode.mockExtensionSettingReturnValue('excludeBranchGlobPatterns', ['gh-pages', 'remotes/origin/wip/*', 5]);

			// Run
			await dataSource.getCommits('/path/to/repo', null, null, 300, true, ['local', 'remote'], false, CommitOrdering.Date, ['origin'], [], [], false, null);

			// Assert
			const logArgs: string[] = spyOnSpawn.mock.calls.find((call) => call[1].includes('log'))![1];
			expect(logArgs.slice(logArgs.indexOf('--date-order') + 1)).toStrictEqual(['--exclude=gh-pages', '--branches', '--tags', '--exclude=*/gh-pages', '--exclude=origin/wip/*', '--remotes', 'HEAD', '--']);
		});

		it('Should exclude the branches hidden via the context menu when showing all branches', async () => {
			// Setup
			mockGitSuccessOnce('');
			mockGitSuccessOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n');

			// Run
			await dataSource.getCommits('/path/to/repo', null, null, 300, false, ['local', 'remote'], false, CommitOrdering.Date, ['origin'], [], [], false, null, null, { excludeBranches: ['feature', 'remotes/origin/wip'] });

			// Assert
			const logArgs: string[] = spyOnSpawn.mock.calls.find((call) => call[1].includes('log'))![1];
			expect(logArgs.slice(logArgs.indexOf('--date-order') + 1)).toStrictEqual(['--exclude=feature', '--branches', '--exclude=origin/wip', '--remotes', 'HEAD', '--']);
		});

		describe('Should load the revisions of the selected scope when showing all branches', () => {
			const stash: GitStash = { hash: 'a'.repeat(40), baseHash: 'b'.repeat(40), untrackedFilesHash: null, selector: 'refs/stash@{0}', author: 'Test Name', email: 'test@mhutchie.com', date: 1587559258, message: 'WIP' };
			const testScope = (scope: RepoScope[], branches: string[] | null, expectedLogArgs: string[], expectedShowRefArgs: string[]) => async () => {
				// Setup
				mockGitSuccessOnce('');
				mockGitSuccessOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n');

				// Run
				await dataSource.getCommits('/path/to/repo', branches, null, 300, true, scope, false, CommitOrdering.Date, ['origin'], [], [stash], false, null);

				// Assert
				const logArgs: string[] = spyOnSpawn.mock.calls.find((call) => call[1].includes('log'))![1];
				expect(logArgs.slice(logArgs.indexOf('--date-order') + 1)).toStrictEqual(expectedLogArgs);
				expect(spyOnSpawn.mock.calls.find((call) => call[1][0] === 'show-ref')![1]).toStrictEqual(expectedShowRefArgs);
			};

			it('Local, Remote & Reflog', testScope(['local', 'remote', 'reflog'], null, ['--branches', '--tags', '--reflog', '--remotes', 'b'.repeat(40), 'HEAD', '--'], ['show-ref', '-d', '--head']));
			it('Local & Reflog (remote branches are hidden)', testScope(['local', 'reflog'], null, ['--branches', '--tags', '--reflog', 'b'.repeat(40), 'HEAD', '--'], ['show-ref', '--heads', '--tags', '-d', '--head']));
			it('Remote (without the local branches, tags & stashes, but with HEAD)', testScope(['remote'], null, ['--remotes', 'HEAD', '--'], ['show-ref', '-d', '--head']));
			it('Reflog (only the commits that no branch or tag references)', testScope(['reflog'], null, ['--reflog', 'HEAD', '--not', '--branches', '--remotes', '--tags', '--'], ['show-ref', '--heads', '--tags', '-d', '--head']));
			it('Selected branches (the scope only controls the remote branch labels)', testScope(['reflog'], ['master'], ['master', '--'], ['show-ref', '--heads', '--tags', '-d', '--head']));
		});

		describe('Dangling scope', () => {
			const SEP = 'XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb';
			const record = (hash: string, parents: string[], date: number, message: string) => [hash, parents.join(' '), 'Test Name', 'test@mhutchie.com', date.toString(), message].join(SEP) + '\n';
			const base = '1'.repeat(40), lost1 = 'c'.repeat(40), lost2 = 'd'.repeat(40), dropped = 'e'.repeat(40), index = 'f'.repeat(40), live = 'a'.repeat(40);
			const liveStash: GitStash = { hash: live, baseHash: base, untrackedFilesHash: null, selector: 'refs/stash@{0}', author: 'Test Name', email: 'test@mhutchie.com', date: 1587559250, message: 'WIP on master: 1111111 Base' };
			const mockDanglingCommits = () => {
				// git fsck (blobs & trees are ignored, the live stash stash@{1} is reported as it's only in the reflog of refs/stash)
				mockGitSuccessOnce('dangling commit ' + lost2 + '\ndangling blob ' + '2'.repeat(40) + '\ndangling commit ' + dropped + '\ndangling commit ' + live + '\n');
				// git log --no-walk
				mockGitSuccessOnce(record(dropped, [base, index], 1587559260, 'On master: experiment') + record(lost2, [lost1], 1587559270, 'Lost 2') + record(live, [base, index], 1587559250, 'WIP on master: 1111111 Base'));
				// git rev-list --parents
				mockGitSuccessOnce(lost2 + ' ' + lost1 + '\n' + lost1 + ' ' + base + '\n');
			};

			it('Should find the dangling commits with git fsck, and the unreachable commits with git rev-list', async () => {
				// Setup
				mockDanglingCommits();

				// Run
				const result = await dataSource.getDanglingCommits('/path/to/repo');

				// Assert
				expect(spyOnSpawn).toHaveBeenNthCalledWith(1, '/path/to/git', ['fsck', '--no-reflogs', '--connectivity-only', '--no-progress'], expect.objectContaining({ cwd: '/path/to/repo', timeout: 10000 }));
				expect(spyOnSpawn.mock.calls[1][1]).toStrictEqual(['-c', 'log.showSignature=false', 'log', '--no-walk', '--format=%H' + SEP + '%P' + SEP + '%an' + SEP + '%ae' + SEP + '%at' + SEP + '%s', lost2, dropped, live, '--']);
				expect(spyOnSpawn.mock.calls[2][1]).toStrictEqual(['rev-list', '--parents', lost2, base, '--not', '--all', '--']);
				expect(result.tips.map((tip) => tip.hash)).toStrictEqual([lost2, dropped, live]);
				expect(result.unreachable).toStrictEqual({ [lost2]: [lost1], [lost1]: [base] });
			});

			it('Should cache the dangling commits until they\'re invalidated', async () => {
				// Setup
				mockGitSuccessOnce('');
				mockGitSuccessOnce('');

				// Run
				await dataSource.getDanglingCommits('/path/to/repo');
				await dataSource.getDanglingCommits('/path/to/repo');

				// Assert
				expect(spyOnSpawn).toHaveBeenCalledTimes(1);

				// Run
				dataSource.invalidateDanglingCommits('/path/to/repo');
				const result = await dataSource.getDanglingCommits('/path/to/repo');

				// Assert
				expect(spyOnSpawn).toHaveBeenCalledTimes(2);
				expect(result).toStrictEqual({ tips: [], unreachable: {} });
			});

			it('Should have no dangling commits when git fsck fails (e.g. it timed out)', async () => {
				// Setup
				mockGitThrowingErrorOnce('error: object file is empty');

				// Run
				const result = await dataSource.getDanglingCommits('/path/to/repo');

				// Assert
				expect(result).toStrictEqual({ tips: [], unreachable: {} });
				expect(spyOnLogError).toHaveBeenCalledWith('Unable to find the dangling commits of the repository "/path/to/repo": error: object file is empty');
			});

			it('Should load the dangling commits & dropped stashes with a separate limit, and mark them as dangling', async () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('repository.showUncommittedChanges', false);
				mockDanglingCommits();
				mockGitSuccessOnce(record(lost2, [lost1], 1587559270, 'Lost 2') + record(lost1, [base], 1587559265, 'Lost 1') + record(base, ['0'.repeat(40)], 1587559240, 'Base') + record('0'.repeat(40), ['9'.repeat(40)], 1587559230, 'Second') + record('9'.repeat(40), [], 1587559220, 'Initial'));
				mockGitSuccessOnce(base + ' HEAD\n' + base + ' refs/heads/master\n');

				// Run
				const result = await dataSource.getCommits('/path/to/repo', null, null, 2, false, ['local', 'dangling'], false, CommitOrdering.Date, [], [], [liveStash], false, null);

				// Assert
				const logArgs: string[] = spyOnSpawn.mock.calls[3][1];
				expect(logArgs).toContain('--max-count=5');
				expect(logArgs.slice(logArgs.indexOf('--date-order') + 1)).toStrictEqual(['--branches', base, lost2, 'HEAD', '--']);
				expect(result.commits.map((commit) => [commit.hash, commit.stash !== null ? commit.stash.selector : null, commit.dangling])).toStrictEqual([
					[lost2, null, true],
					[lost1, null, true],
					[dropped, dropped, true],
					[live, 'refs/stash@{0}', undefined],
					[base, null, undefined],
					['0'.repeat(40), null, undefined]
				]);
				expect(result.commits[2].stash).toStrictEqual({ selector: dropped, baseHash: base, untrackedFilesHash: null });
				expect(result.moreCommitsAvailable).toBe(true);
			});

			it('Should place a dropped stash by its date when its base commit isn\'t loaded', async () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('repository.showUncommittedChanges', false);
				mockDanglingCommits();
				mockGitSuccessOnce(record(lost2, [lost1], 1587559270, 'Lost 2') + record(lost1, [base], 1587559255, 'Lost 1'));
				mockGitSuccessOnce(base + ' HEAD\n' + base + ' refs/heads/master\n');

				// Run
				const result = await dataSource.getCommits('/path/to/repo', null, null, 300, false, ['dangling'], false, CommitOrdering.Date, [], [], [liveStash], false, null);

				// Assert
				const logArgs: string[] = spyOnSpawn.mock.calls[3][1];
				expect(logArgs.slice(logArgs.indexOf('--date-order') + 1)).toStrictEqual([lost2, base, 'HEAD', '--not', '--branches', '--remotes', '--tags', '--']);
				expect(result.commits.map((commit) => [commit.hash, commit.parents, commit.dangling])).toStrictEqual([
					[lost2, [lost1], true],
					[dropped, [base], true],
					[lost1, [base], true]
				]);
			});

			it('Shouldn\'t find the dangling commits when the Dangling scope doesn\'t apply', async () => {
				// Setup
				mockGitSuccessOnce('');
				mockGitSuccessOnce(base + ' HEAD\n');

				// Run
				await dataSource.getCommits('/path/to/repo', ['master'], null, 300, false, ['local', 'dangling'], false, CommitOrdering.Date, [], [], [], false, null);

				// Assert
				expect(spyOnSpawn.mock.calls.some((call) => call[1][0] === 'fsck')).toBe(false);
				expect(spyOnSpawn.mock.calls[0][1].slice(-2)).toStrictEqual(['master', '--']);
			});

			it('Should select the newest tips whose unreachable commits fit in the limit', () => {
				// Setup
				const tip = (hash: string, parents: string[], message: string) => ({ hash: hash, parents: parents, author: 'Test Name', email: 'test@mhutchie.com', date: 1587559258, message: message });
				const danglingCommits = {
					tips: [tip(lost2, [lost1], 'Lost 2'), tip('b'.repeat(40), [base], 'Lost 3'), tip(dropped, [lost1, index, '3'.repeat(40)], 'WIP on master: ccccccc Lost 1')],
					unreachable: { [lost2]: [lost1], [lost1]: [base], ['b'.repeat(40)]: [base] }
				};

				// Run
				const result = selectDanglingCommits(danglingCommits, [], 1);

				// Assert
				expect(result.revisions).toStrictEqual(['b'.repeat(40)]);
				expect(result.numCommits).toBe(1);
				expect(Array.from(result.hashes)).toStrictEqual(['b'.repeat(40)]);
				expect(result.stashes).toStrictEqual([]);

				// Run
				const result2 = selectDanglingCommits(danglingCommits, [], 3);

				// Assert
				expect(result2.revisions).toStrictEqual([lost2, 'b'.repeat(40), lost1]);
				expect(result2.numCommits).toBe(3);
				expect(result2.stashes.map((stash) => [stash.hash, stash.baseHash, stash.untrackedFilesHash, stash.selector])).toStrictEqual([[dropped, lost1, '3'.repeat(40), dropped]]);
			});
		});

		it('Should pass custom git log arguments, with revisions replacing the selected branches', async () => {
			// Setup
			mockGitSuccessOnce('');
			mockGitSuccessOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n');

			// Run
			await dataSource.getCommits('/path/to/repo', ['master'], null, 300, false, ['local', 'remote'], false, CommitOrdering.Date, ['origin'], [], [], false, null, null, { customLogArgs: '--since=2.weeks --committer="Test Name" v1.0..v2.0' });

			// Assert
			const logArgs: string[] = spyOnSpawn.mock.calls.find((call) => call[1].includes('log'))![1];
			expect(logArgs.slice(logArgs.indexOf('--date-order') + 1)).toStrictEqual(['--since=2.weeks', '--committer=Test Name', 'v1.0..v2.0', '--']);
		});

		describe('Simplify By Decoration', () => {
			it.each([
				{ scenario: 'showing all branches with the tags hidden', branches: null, showTags: false, customLogArgs: '', expected: ['--simplify-by-decoration', '--decorate-refs-exclude=refs/tags/', '--first-parent', '--branches', 'HEAD', '--'] },
				{ scenario: 'showing all branches with the tags shown', branches: null, showTags: true, customLogArgs: '', expected: ['--simplify-by-decoration', '--first-parent', '--branches', '--tags', 'HEAD', '--'] },
				{ scenario: 'showing selected branches with the tags hidden', branches: ['master', 'HEAD'], showTags: false, customLogArgs: '', expected: ['--simplify-by-decoration', '--decorate-refs-exclude=refs/tags/', '--first-parent', 'master', 'HEAD', '--'] },
				{ scenario: 'showing selected branches with the tags shown', branches: ['master'], showTags: true, customLogArgs: '', expected: ['--simplify-by-decoration', '--first-parent', 'master', '--'] },
				{ scenario: 'showing a selected tag with the tags hidden', branches: ['refs/tags/v1.0'], showTags: false, customLogArgs: '', expected: ['--simplify-by-decoration', '--first-parent', 'refs/tags/v1.0', '--'] },
				{ scenario: 'showing custom revisions with the tags hidden', branches: ['master'], showTags: false, customLogArgs: '--no-merges v1.0..v2.0', expected: ['--no-merges', '--simplify-by-decoration', '--first-parent', 'v1.0..v2.0', '--'] }
			])('Should only count tags as decorations when they\'re part of the loaded history: $scenario', async ({ branches, showTags, customLogArgs, expected }) => {
				// Setup
				mockGitSuccessOnce('');
				mockGitSuccessOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n');

				// Run
				await dataSource.getCommits('/path/to/repo', branches, null, 300, showTags, ['local'], true, CommitOrdering.Date, [], [], [], true, null, null, { customLogArgs: customLogArgs });

				// Assert
				const logArgs: string[] = spyOnSpawn.mock.calls.find((call) => call[1].includes('log'))![1];
				expect(logArgs.slice(logArgs.indexOf('--date-order') + 1)).toStrictEqual(expected);
			});

			it('Shouldn\'t simplify the history when Simplify By Decoration is disabled', async () => {
				// Setup
				mockGitSuccessOnce('');
				mockGitSuccessOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n');

				// Run
				await dataSource.getCommits('/path/to/repo', null, null, 300, false, ['local'], false, CommitOrdering.Date, [], [], [], false, null);

				// Assert
				const logArgs: string[] = spyOnSpawn.mock.calls.find((call) => call[1].includes('log'))![1];
				expect(logArgs.filter((arg) => arg.startsWith('--simplify') || arg.startsWith('--decorate'))).toStrictEqual([]);
			});
		});

		it('Should return an error without running git log when a custom git log argument isn\'t supported', async () => {
			// Run
			const result = await dataSource.getCommits('/path/to/repo', null, null, 300, false, ['local', 'remote'], false, CommitOrdering.Date, ['origin'], [], [], false, null, null, { customLogArgs: '--graph -n5 --since=2.weeks' });

			// Assert
			expect(spyOnSpawn).not.toHaveBeenCalled();
			expect(result).toStrictEqual({
				commits: [],
				head: null,
				tags: [],
				moreCommitsAvailable: false,
				error: 'The custom git log arguments "--graph", "-n5" are not supported by Easy Graph. Remove them in the Repository Settings (Custom Log Arguments).',
				pathFilterActive: false
			});
		});

		it('Should resolve the "HEAD + upstream" branch option to HEAD and the upstream of the checked out branch', async () => {
			// Setup
			mockGitSuccessOnce('refs/remotes/origin/master\n');
			mockGitSuccessOnce('');
			mockGitSuccessOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n');

			// Run
			await dataSource.getCommits('/path/to/repo', ['HEAD+@{upstream}', 'develop'], null, 300, false, ['local', 'remote'], false, CommitOrdering.Date, ['origin'], [], [], false, null);

			// Assert
			expect(spyOnSpawn.mock.calls[0][1]).toStrictEqual(['rev-parse', '--symbolic-full-name', '@{upstream}']);
			const logArgs: string[] = spyOnSpawn.mock.calls.find((call) => call[1].includes('log'))![1];
			expect(logArgs.slice(logArgs.indexOf('--date-order') + 1)).toStrictEqual(['HEAD', 'refs/remotes/origin/master', 'develop', '--']);
		});

		it('Should only show the remote-tracking branches that have a local branch when easy-graph.repository.onlyShowRemoteBranchesWithLocalBranches is enabled', async () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('repository.onlyShowRemoteBranchesWithLocalBranches', true);
			mockGitSuccessOnce(
				'refs/heads/master\0refs/remotes/origin/master\n' +
				'refs/heads/feature\0refs/remotes/origin/feature-renamed\n' +
				'refs/heads/develop\0\n' +
				'refs/remotes/origin/HEAD\0\n' +
				'refs/remotes/origin/master\0\n' +
				'refs/remotes/origin/feature-renamed\0\n' +
				'refs/remotes/origin/develop\0\n' +
				'refs/remotes/origin/other\0\n' +
				'refs/remotes/upstream/develop\0\n'
			);
			mockGitSuccessOnce('');
			mockGitSuccessOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n');

			// Run
			await dataSource.getCommits('/path/to/repo', null, null, 300, false, ['local', 'remote'], false, CommitOrdering.Date, ['origin', 'upstream'], ['upstream'], [], false, null);

			// Assert
			expect(spyOnSpawn.mock.calls[0][1]).toStrictEqual(['for-each-ref', '--format=%(refname)%00%(upstream)', 'refs/heads', 'refs/remotes']);
			const logArgs: string[] = spyOnSpawn.mock.calls.find((call) => call[1].includes('log'))![1];
			expect(logArgs.slice(logArgs.indexOf('--date-order') + 1)).toStrictEqual(['--branches', 'refs/remotes/origin/master', 'refs/remotes/origin/feature-renamed', 'refs/remotes/origin/develop', 'HEAD', '--']);
		});

		it('Should hide merge commits that aren\'t referenced, rewriting the parents of the remaining commits', async () => {
			// Setup
			const record = (hash: string, parents: string[], message: string) => [hash, parents.join(' '), 'Test Name', 'test@mhutchie.com', '1587559258', message].join('XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb') + '\n';
			mockGitSuccessOnce(
				record('5'.repeat(40), ['4'.repeat(40)], 'Top') +
				record('4'.repeat(40), ['3'.repeat(40), '2'.repeat(40)], 'Merge') +
				record('2'.repeat(40), ['1'.repeat(40)], 'Side') +
				record('3'.repeat(40), ['1'.repeat(40)], 'Main') +
				record('1'.repeat(40), [], 'Base')
			);
			mockGitSuccessOnce('5555555555555555555555555555555555555555 HEAD\n5555555555555555555555555555555555555555 refs/heads/master\n');
			vscode.mockExtensionSettingReturnValue('repository.showUncommittedChanges', false);

			// Run
			const result = await dataSource.getCommits('/path/to/repo', null, null, 300, false, ['local'], false, CommitOrdering.Date, [], [], [], false, null, null, { hideMergeCommits: true });

			// Assert
			expect(result.commits.map((commit) => [commit.message, commit.parents])).toStrictEqual([
				['Top', ['3'.repeat(40), '2'.repeat(40)]],
				['Side', ['1'.repeat(40)]],
				['Main', ['1'.repeat(40)]],
				['Base', []]
			]);
		});

		it('Should return the commits (show all branches)', async () => {
			// Setup
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 3\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559257XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 2\n' +
				'3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559256XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 1\n'
			);
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/heads/master\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/heads/develop\n' +
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e refs/heads/feature\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/remotes/origin/HEAD\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/remotes/origin/master\n' +
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e refs/remotes/origin/feature\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/remotes/other-remote/master\n' +
				'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 refs/tags/tag1\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/tags/tag1^{}\n' +
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e refs/tags/tag2\n'
			);
			mockGitSuccessOnce(
				'M modified.txt\n' +
				'?? untracked.txt\n'
			);
			vscode.mockExtensionSettingReturnValue('repository.showCommitsOnlyReferencedByTags', true);
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);
			vscode.mockExtensionSettingReturnValue('repository.showUncommittedChanges', true);
			date.setCurrentTime(1587559259);

			// Run
			const result = await dataSource.getCommits('/path/to/repo', null, null, 300, true, ['local', 'remote'], false, CommitOrdering.Date, ['origin'], [], [], false, null);

			// Assert
			expect(result).toStrictEqual({
				commits: [
					{
						hash: '*',
						parents: ['1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'],
						author: '*',
						email: '',
						date: 1587559259,
						message: 'Uncommitted Changes (2)',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
						parents: ['2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559258,
						message: 'Commit Message 3',
						heads: ['master'],
						tags: [],
						remotes: [
							{ name: 'origin/HEAD', remote: 'origin' },
							{ name: 'origin/master', remote: 'origin' },
							{ name: 'other-remote/master', remote: null }
						],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c',
						parents: ['3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559257,
						message: 'Commit Message 2',
						heads: ['develop'],
						tags: [{ name: 'tag1', annotated: true }],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d',
						parents: [],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559256,
						message: 'Commit Message 1',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					}
				],
				head: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
				tags: ['tag1', 'tag2'],
				moreCommitsAvailable: false, pathFilterActive: false,
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'log', '--max-count=301', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%s', '--date-order', '--branches', '--tags', '--remotes', 'HEAD', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['show-ref', '-d', '--head'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['status', '--untracked-files=all', '--porcelain'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the commits (master & develop branches)', async () => {
			// Setup
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 3\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559257XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 2\n' +
				'3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559256XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 1\n'
			);
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/heads/master\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/heads/develop\n' +
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e refs/heads/feature\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/remotes/origin/master\n' +
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e refs/remotes/origin/feature\n' +
				'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 refs/tags/tag1\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/tags/tag1^{}\n'
			);
			mockGitSuccessOnce(
				'M modified.txt\n' +
				'?? untracked.txt\n'
			);
			vscode.mockExtensionSettingReturnValue('repository.showCommitsOnlyReferencedByTags', true);
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);
			vscode.mockExtensionSettingReturnValue('repository.showUncommittedChanges', true);
			date.setCurrentTime(1587559259);

			// Run
			const result = await dataSource.getCommits('/path/to/repo', ['master', 'develop'], null, 300, true, ['local', 'remote'], false, CommitOrdering.AuthorDate, ['origin'], [], [], false, null);

			// Assert
			expect(result).toStrictEqual({
				commits: [
					{
						hash: '*',
						parents: ['1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'],
						author: '*',
						email: '',
						date: 1587559259,
						message: 'Uncommitted Changes (2)',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
						parents: ['2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559258,
						message: 'Commit Message 3',
						heads: ['master'],
						tags: [],
						remotes: [{ name: 'origin/master', remote: 'origin' }],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c',
						parents: ['3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559257,
						message: 'Commit Message 2',
						heads: ['develop'],
						tags: [{ name: 'tag1', annotated: true }],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d',
						parents: [],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559256,
						message: 'Commit Message 1',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					}
				],
				head: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
				tags: ['tag1'],
				moreCommitsAvailable: false, pathFilterActive: false,
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'log', '--max-count=301', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%s', '--author-date-order', 'master', 'develop', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['show-ref', '-d', '--head'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['status', '--untracked-files=all', '--porcelain'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the commits (no more commits)', async () => {
			// Setup
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 3\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559257XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 2\n' +
				'3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559256XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 1\n'
			);
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/heads/master\n'
			);
			mockGitSuccessOnce(
				'M modified.txt\n' +
				'?? untracked.txt\n'
			);
			vscode.mockExtensionSettingReturnValue('repository.showCommitsOnlyReferencedByTags', true);
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);
			vscode.mockExtensionSettingReturnValue('repository.showUncommittedChanges', true);
			date.setCurrentTime(1587559259);

			// Run
			const result = await dataSource.getCommits('/path/to/repo', null, null, 2, true, ['local', 'remote'], false, CommitOrdering.Topological, ['origin'], [], [], false, null);

			// Assert
			expect(result).toStrictEqual({
				commits: [
					{
						hash: '*',
						parents: ['1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'],
						author: '*',
						email: '',
						date: 1587559259,
						message: 'Uncommitted Changes (2)',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
						parents: ['2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559258,
						message: 'Commit Message 3',
						heads: ['master'],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c',
						parents: ['3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559257,
						message: 'Commit Message 2',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					}
				],
				head: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
				tags: [],
				moreCommitsAvailable: true, pathFilterActive: false,
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'log', '--max-count=3', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%s', '--topo-order', '--branches', '--tags', '--remotes', 'HEAD', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['show-ref', '-d', '--head'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['status', '--untracked-files=all', '--porcelain'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the commits (HEAD is not in the commits)', async () => {
			// Setup
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 3\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559257XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 2\n' +
				'3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559256XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 1\n'
			);
			mockGitSuccessOnce(
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e HEAD\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/heads/master\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/heads/develop\n' +
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e refs/heads/feature\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/remotes/origin/master\n' +
				'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 refs/tags/tag1\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/tags/tag1^{}\n'
			);
			vscode.mockExtensionSettingReturnValue('repository.showCommitsOnlyReferencedByTags', true);
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);
			vscode.mockExtensionSettingReturnValue('repository.showUncommittedChanges', true);
			date.setCurrentTime(1587559259);

			// Run
			const result = await dataSource.getCommits('/path/to/repo', null, null, 300, true, ['local', 'remote'], false, CommitOrdering.Date, ['origin'], [], [], false, null);

			// Assert
			expect(result).toStrictEqual({
				commits: [
					{
						hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
						parents: ['2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559258,
						message: 'Commit Message 3',
						heads: ['master'],
						tags: [],
						remotes: [{ name: 'origin/master', remote: 'origin' }],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c',
						parents: ['3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559257,
						message: 'Commit Message 2',
						heads: ['develop'],
						tags: [{ name: 'tag1', annotated: true }],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d',
						parents: [],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559256,
						message: 'Commit Message 1',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					}
				],
				head: '4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e',
				tags: ['tag1'],
				moreCommitsAvailable: false, pathFilterActive: false,
				error: null
			});
			expect(spyOnSpawn).toHaveBeenCalledTimes(2);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'log', '--max-count=301', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%s', '--date-order', '--branches', '--tags', '--remotes', 'HEAD', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['show-ref', '-d', '--head'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the commits (showUncommittedChanges === FALSE)', async () => {
			// Setup
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 3\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559257XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 2\n' +
				'3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559256XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 1\n'
			);
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/heads/master\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/heads/develop\n' +
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e refs/heads/feature\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/remotes/origin/master\n' +
				'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 refs/tags/tag1\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/tags/tag1^{}\n'
			);
			vscode.mockExtensionSettingReturnValue('repository.showCommitsOnlyReferencedByTags', true);
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);
			vscode.mockExtensionSettingReturnValue('repository.showUncommittedChanges', false);
			date.setCurrentTime(1587559259);

			// Run
			const result = await dataSource.getCommits('/path/to/repo', null, null, 300, true, ['local', 'remote'], false, CommitOrdering.Date, ['origin'], [], [], false, null);

			// Assert
			expect(result).toStrictEqual({
				commits: [
					{
						hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
						parents: ['2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559258,
						message: 'Commit Message 3',
						heads: ['master'],
						tags: [],
						remotes: [{ name: 'origin/master', remote: 'origin' }],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c',
						parents: ['3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559257,
						message: 'Commit Message 2',
						heads: ['develop'],
						tags: [{ name: 'tag1', annotated: true }],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d',
						parents: [],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559256,
						message: 'Commit Message 1',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					}
				],
				head: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
				tags: ['tag1'],
				moreCommitsAvailable: false, pathFilterActive: false,
				error: null
			});
			expect(spyOnSpawn).toHaveBeenCalledTimes(2);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'log', '--max-count=301', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%s', '--date-order', '--branches', '--tags', '--remotes', 'HEAD', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['show-ref', '-d', '--head'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the commits (showUntrackedFiles === FALSE)', async () => {
			// Setup
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 3\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559257XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 2\n' +
				'3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559256XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 1\n'
			);
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/heads/master\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/heads/develop\n' +
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e refs/heads/feature\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/remotes/origin/master\n' +
				'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 refs/tags/tag1\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/tags/tag1^{}\n'
			);
			mockGitSuccessOnce(
				'M modified.txt\n'
			);
			vscode.mockExtensionSettingReturnValue('repository.showCommitsOnlyReferencedByTags', true);
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);
			vscode.mockExtensionSettingReturnValue('repository.showUncommittedChanges', true);
			vscode.mockExtensionSettingReturnValue('builtin', { 'status.showUntrackedFiles': 'no' });
			date.setCurrentTime(1587559259);

			// Run
			const result = await dataSource.getCommits('/path/to/repo', null, null, 300, true, ['local', 'remote'], false, CommitOrdering.Date, ['origin'], [], [], false, null);

			// Assert
			expect(result).toStrictEqual({
				commits: [
					{
						hash: '*',
						parents: ['1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'],
						author: '*',
						email: '',
						date: 1587559259,
						message: 'Uncommitted Changes (1)',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
						parents: ['2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559258,
						message: 'Commit Message 3',
						heads: ['master'],
						tags: [],
						remotes: [{ name: 'origin/master', remote: 'origin' }],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c',
						parents: ['3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559257,
						message: 'Commit Message 2',
						heads: ['develop'],
						tags: [{ name: 'tag1', annotated: true }],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d',
						parents: [],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559256,
						message: 'Commit Message 1',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					}
				],
				head: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
				tags: ['tag1'],
				moreCommitsAvailable: false, pathFilterActive: false,
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'log', '--max-count=301', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%s', '--date-order', '--branches', '--tags', '--remotes', 'HEAD', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['show-ref', '-d', '--head'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['status', '--untracked-files=no', '--porcelain'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the commits (showTags === FALSE)', async () => {
			// Setup
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 3\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559257XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 2\n' +
				'3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559256XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 1\n'
			);
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/heads/master\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/heads/develop\n' +
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e refs/heads/feature\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/remotes/origin/master\n' +
				'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 refs/tags/tag1\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/tags/tag1^{}\n'
			);
			mockGitSuccessOnce(
				'M modified.txt\n' +
				'?? untracked.txt\n'
			);
			vscode.mockExtensionSettingReturnValue('repository.showCommitsOnlyReferencedByTags', true);
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);
			vscode.mockExtensionSettingReturnValue('repository.showUncommittedChanges', true);
			date.setCurrentTime(1587559259);

			// Run
			const result = await dataSource.getCommits('/path/to/repo', null, null, 300, false, ['local', 'remote'], false, CommitOrdering.Date, ['origin'], [], [], false, null);

			// Assert
			expect(result).toStrictEqual({
				commits: [
					{
						hash: '*',
						parents: ['1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'],
						author: '*',
						email: '',
						date: 1587559259,
						message: 'Uncommitted Changes (2)',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
						parents: ['2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559258,
						message: 'Commit Message 3',
						heads: ['master'],
						tags: [],
						remotes: [{ name: 'origin/master', remote: 'origin' }],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c',
						parents: ['3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559257,
						message: 'Commit Message 2',
						heads: ['develop'],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d',
						parents: [],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559256,
						message: 'Commit Message 1',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					}
				],
				head: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
				tags: ['tag1'],
				moreCommitsAvailable: false, pathFilterActive: false,
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'log', '--max-count=301', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%s', '--date-order', '--branches', '--remotes', 'HEAD', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['show-ref', '-d', '--head'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['status', '--untracked-files=all', '--porcelain'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the commits (showCommitsOnlyReferencedByTags === FALSE)', async () => {
			// Setup
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 3\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559257XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 2\n' +
				'3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559256XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 1\n'
			);
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/heads/master\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/heads/develop\n' +
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e refs/heads/feature\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/remotes/origin/master\n' +
				'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 refs/tags/tag1\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/tags/tag1^{}\n'
			);
			mockGitSuccessOnce(
				'M modified.txt\n' +
				'?? untracked.txt\n'
			);
			vscode.mockExtensionSettingReturnValue('repository.showCommitsOnlyReferencedByTags', false);
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);
			vscode.mockExtensionSettingReturnValue('repository.showUncommittedChanges', true);
			date.setCurrentTime(1587559259);

			// Run
			const result = await dataSource.getCommits('/path/to/repo', null, null, 300, true, ['local', 'remote'], false, CommitOrdering.Date, ['origin'], [], [], false, null);

			// Assert
			expect(result).toStrictEqual({
				commits: [
					{
						hash: '*',
						parents: ['1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'],
						author: '*',
						email: '',
						date: 1587559259,
						message: 'Uncommitted Changes (2)',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
						parents: ['2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559258,
						message: 'Commit Message 3',
						heads: ['master'],
						tags: [],
						remotes: [{ name: 'origin/master', remote: 'origin' }],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c',
						parents: ['3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559257,
						message: 'Commit Message 2',
						heads: ['develop'],
						tags: [{ name: 'tag1', annotated: true }],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d',
						parents: [],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559256,
						message: 'Commit Message 1',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					}
				],
				head: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
				tags: ['tag1'],
				moreCommitsAvailable: false, pathFilterActive: false,
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'log', '--max-count=301', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%s', '--date-order', '--branches', '--remotes', 'HEAD', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['show-ref', '-d', '--head'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['status', '--untracked-files=all', '--porcelain'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the commits (showRemoteBranches === FALSE)', async () => {
			// Setup
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 3\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559257XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 2\n' +
				'3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559256XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 1\n'
			);
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/heads/master\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/heads/develop\n' +
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e refs/heads/feature\n' +
				'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 refs/tags/tag1\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/tags/tag1^{}\n'
			);
			mockGitSuccessOnce(
				'M modified.txt\n' +
				'?? untracked.txt\n'
			);
			vscode.mockExtensionSettingReturnValue('repository.showCommitsOnlyReferencedByTags', true);
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);
			vscode.mockExtensionSettingReturnValue('repository.showUncommittedChanges', true);
			date.setCurrentTime(1587559259);

			// Run
			const result = await dataSource.getCommits('/path/to/repo', null, null, 300, true, ['local'], false, CommitOrdering.Date, ['origin'], [], [], false, null);

			// Assert
			expect(result).toStrictEqual({
				commits: [
					{
						hash: '*',
						parents: ['1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'],
						author: '*',
						email: '',
						date: 1587559259,
						message: 'Uncommitted Changes (2)',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
						parents: ['2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559258,
						message: 'Commit Message 3',
						heads: ['master'],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c',
						parents: ['3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559257,
						message: 'Commit Message 2',
						heads: ['develop'],
						tags: [{ name: 'tag1', annotated: true }],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d',
						parents: [],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559256,
						message: 'Commit Message 1',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					}
				],
				head: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
				tags: ['tag1'],
				moreCommitsAvailable: false, pathFilterActive: false,
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'log', '--max-count=301', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%s', '--date-order', '--branches', '--tags', 'HEAD', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['show-ref', '--heads', '--tags', '-d', '--head'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['status', '--untracked-files=all', '--porcelain'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the commits (includeCommitsMentionedByReflogs === TRUE)', async () => {
			// Setup
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 3\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559257XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 2\n' +
				'3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559256XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 1\n'
			);
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/heads/master\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/heads/develop\n' +
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e refs/heads/feature\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/remotes/origin/master\n' +
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e refs/remotes/origin/feature\n' +
				'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 refs/tags/tag1\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/tags/tag1^{}\n'
			);
			mockGitSuccessOnce(
				'M modified.txt\n' +
				'?? untracked.txt\n'
			);
			vscode.mockExtensionSettingReturnValue('repository.showCommitsOnlyReferencedByTags', true);
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);
			vscode.mockExtensionSettingReturnValue('repository.showUncommittedChanges', true);
			date.setCurrentTime(1587559259);

			// Run
			const result = await dataSource.getCommits('/path/to/repo', null, null, 300, true, ['local', 'remote', 'reflog'], false, CommitOrdering.Date, ['origin'], [], [], false, null);

			// Assert
			expect(result).toStrictEqual({
				commits: [
					{
						hash: '*',
						parents: ['1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'],
						author: '*',
						email: '',
						date: 1587559259,
						message: 'Uncommitted Changes (2)',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
						parents: ['2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559258,
						message: 'Commit Message 3',
						heads: ['master'],
						tags: [],
						remotes: [{ name: 'origin/master', remote: 'origin' }],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c',
						parents: ['3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559257,
						message: 'Commit Message 2',
						heads: ['develop'],
						tags: [{ name: 'tag1', annotated: true }],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d',
						parents: [],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559256,
						message: 'Commit Message 1',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					}
				],
				head: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
				tags: ['tag1'],
				moreCommitsAvailable: false, pathFilterActive: false,
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'log', '--max-count=301', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%s', '--date-order', '--branches', '--tags', '--reflog', '--remotes', 'HEAD', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['show-ref', '-d', '--head'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['status', '--untracked-files=all', '--porcelain'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the commits (onlyFollowFirstParent === TRUE)', async () => {
			// Setup
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 3\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559257XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 2\n' +
				'3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559256XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 1\n'
			);
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/heads/master\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/heads/develop\n' +
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e refs/heads/feature\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/remotes/origin/master\n' +
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e refs/remotes/origin/feature\n' +
				'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 refs/tags/tag1\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/tags/tag1^{}\n'
			);
			mockGitSuccessOnce(
				'M modified.txt\n' +
				'?? untracked.txt\n'
			);
			vscode.mockExtensionSettingReturnValue('repository.showCommitsOnlyReferencedByTags', true);
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);
			vscode.mockExtensionSettingReturnValue('repository.showUncommittedChanges', true);
			date.setCurrentTime(1587559259);

			// Run
			const result = await dataSource.getCommits('/path/to/repo', null, null, 300, true, ['local', 'remote'], true, CommitOrdering.Date, ['origin'], [], [], false, null);

			// Assert
			expect(result).toStrictEqual({
				commits: [
					{
						hash: '*',
						parents: ['1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'],
						author: '*',
						email: '',
						date: 1587559259,
						message: 'Uncommitted Changes (2)',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
						parents: ['2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559258,
						message: 'Commit Message 3',
						heads: ['master'],
						tags: [],
						remotes: [{ name: 'origin/master', remote: 'origin' }],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c',
						parents: ['3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559257,
						message: 'Commit Message 2',
						heads: ['develop'],
						tags: [{ name: 'tag1', annotated: true }],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d',
						parents: [],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559256,
						message: 'Commit Message 1',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					}
				],
				head: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
				tags: ['tag1'],
				moreCommitsAvailable: false, pathFilterActive: false,
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'log', '--max-count=301', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%s', '--date-order', '--first-parent', '--branches', '--tags', '--remotes', 'HEAD', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['show-ref', '-d', '--head'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['status', '--untracked-files=all', '--porcelain'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the commits (showRemoteHeads === FALSE)', async () => {
			// Setup
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 3\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559257XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 2\n' +
				'3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559256XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 1\n'
			);
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/heads/master\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/heads/develop\n' +
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e refs/heads/feature\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/remotes/origin/HEAD\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/remotes/origin/master\n' +
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e refs/remotes/origin/feature\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/remotes/other-remote/HEAD\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/remotes/other-remote/master\n' +
				'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 refs/tags/tag1\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/tags/tag1^{}\n'
			);
			mockGitSuccessOnce(
				'M modified.txt\n' +
				'?? untracked.txt\n'
			);
			vscode.mockExtensionSettingReturnValue('repository.showCommitsOnlyReferencedByTags', true);
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', false);
			vscode.mockExtensionSettingReturnValue('repository.showUncommittedChanges', true);
			date.setCurrentTime(1587559259);

			// Run
			const result = await dataSource.getCommits('/path/to/repo', null, null, 300, true, ['local', 'remote'], false, CommitOrdering.Date, ['origin'], [], [], false, null);

			// Assert
			expect(result).toStrictEqual({
				commits: [
					{
						hash: '*',
						parents: ['1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'],
						author: '*',
						email: '',
						date: 1587559259,
						message: 'Uncommitted Changes (2)',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
						parents: ['2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559258,
						message: 'Commit Message 3',
						heads: ['master'],
						tags: [],
						remotes: [
							{ name: 'origin/master', remote: 'origin' },
							{ name: 'other-remote/master', remote: null }
						],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c',
						parents: ['3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559257,
						message: 'Commit Message 2',
						heads: ['develop'],
						tags: [{ name: 'tag1', annotated: true }],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d',
						parents: [],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559256,
						message: 'Commit Message 1',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					}
				],
				head: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
				tags: ['tag1'],
				moreCommitsAvailable: false, pathFilterActive: false,
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'log', '--max-count=301', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%s', '--date-order', '--branches', '--tags', '--remotes', 'HEAD', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['show-ref', '-d', '--head'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['status', '--untracked-files=all', '--porcelain'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the commits (hiding the remote branches from a hidden remote)', async () => {
			// Setup
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 3\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559257XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 2\n' +
				'3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559256XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 1\n'
			);
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/heads/master\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/heads/develop\n' +
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e refs/heads/feature\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/remotes/origin/master\n' +
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e refs/remotes/origin/feature\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/remotes/other-remote/master\n' +
				'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 refs/tags/tag1\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/tags/tag1^{}\n'
			);
			mockGitSuccessOnce(
				'M modified.txt\n' +
				'?? untracked.txt\n'
			);
			vscode.mockExtensionSettingReturnValue('repository.showCommitsOnlyReferencedByTags', true);
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);
			vscode.mockExtensionSettingReturnValue('repository.showUncommittedChanges', true);
			date.setCurrentTime(1587559259);

			// Run
			const result = await dataSource.getCommits('/path/to/repo', null, null, 300, true, ['local', 'remote'], false, CommitOrdering.Date, ['origin', 'other-remote'], ['other-remote'], [], false, null);

			// Assert
			expect(result).toStrictEqual({
				commits: [
					{
						hash: '*',
						parents: ['1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'],
						author: '*',
						email: '',
						date: 1587559259,
						message: 'Uncommitted Changes (2)',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
						parents: ['2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559258,
						message: 'Commit Message 3',
						heads: ['master'],
						tags: [],
						remotes: [{ name: 'origin/master', remote: 'origin' }],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c',
						parents: ['3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559257,
						message: 'Commit Message 2',
						heads: ['develop'],
						tags: [{ name: 'tag1', annotated: true }],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d',
						parents: [],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559256,
						message: 'Commit Message 1',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					}
				],
				head: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
				tags: ['tag1'],
				moreCommitsAvailable: false, pathFilterActive: false,
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'log', '--max-count=301', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%s', '--date-order', '--branches', '--tags', '--glob=refs/remotes/origin', 'HEAD', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['show-ref', '-d', '--head'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['status', '--untracked-files=all', '--porcelain'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the commits (stash returned in git log commits)', async () => {
			// Setup
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbWIP\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559257XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 2\n' +
				'3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559256XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 1\n'
			);
			mockGitSuccessOnce(
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c HEAD\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/heads/master\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/heads/develop\n' +
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e refs/heads/feature\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/remotes/origin/master\n' +
				'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 refs/tags/tag1\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/tags/tag1^{}\n'
			);
			mockGitSuccessOnce(
				'M modified.txt\n' +
				'?? untracked.txt\n'
			);
			vscode.mockExtensionSettingReturnValue('repository.showCommitsOnlyReferencedByTags', true);
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);
			vscode.mockExtensionSettingReturnValue('repository.showUncommittedChanges', true);
			date.setCurrentTime(1587559259);

			// Run
			const result = await dataSource.getCommits('/path/to/repo', null, null, 300, true, ['local', 'remote'], false, CommitOrdering.Date, ['origin'], [], [
				{
					hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
					baseHash: '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c',
					untrackedFilesHash: '5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f',
					selector: 'refs/stash@{0}',
					author: 'Test Stash Author',
					email: 'test-stash@mhutchie.com',
					date: 1587559258,
					message: 'WIP'
				}
			], false, null);

			// Assert
			expect(result).toStrictEqual({
				commits: [
					{
						hash: '*',
						parents: ['2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c'],
						author: '*',
						email: '',
						date: 1587559259,
						message: 'Uncommitted Changes (2)',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
						parents: ['2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559258,
						message: 'WIP',
						heads: [],
						tags: [],
						remotes: [],
						stash: {
							baseHash: '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c',
							selector: 'refs/stash@{0}',
							untrackedFilesHash: '5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f'
						}, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c',
						parents: ['3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559257,
						message: 'Commit Message 2',
						heads: ['master', 'develop'],
						tags: [{ name: 'tag1', annotated: true }],
						remotes: [{ name: 'origin/master', remote: 'origin' }],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d',
						parents: [],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559256,
						message: 'Commit Message 1',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					}
				],
				head: '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c',
				tags: ['tag1'],
				moreCommitsAvailable: false, pathFilterActive: false,
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'log', '--max-count=301', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%s', '--date-order', '--branches', '--tags', '--remotes', '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c', 'HEAD', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['show-ref', '-d', '--head'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['status', '--untracked-files=all', '--porcelain'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should display a stash whose base commit isn\'t loaded on its nearest loaded ancestor (branches are filtered)', async () => {
			// Setup
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 3\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559257XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 2\n' +
				'3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559256XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 1\n'
			);
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/heads/master\n'
			);
			mockGitSuccessOnce(
				'6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c\n' +
				'3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d\n'
			);
			vscode.mockExtensionSettingReturnValue('repository.showUncommittedChanges', false);

			// Run
			const result = await dataSource.getCommits('/path/to/repo', ['master'], null, 300, true, ['local', 'remote'], false, CommitOrdering.Date, ['origin'], [], [
				{
					hash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
					baseHash: '6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a',
					untrackedFilesHash: null,
					selector: 'refs/stash@{0}',
					author: 'Test Stash Author',
					email: 'test-stash@mhutchie.com',
					date: 1587559259,
					message: 'WIP 1'
				}
			], false, null);

			// Assert
			expect(result.commits.map((commit) => commit.hash)).toStrictEqual([
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
				'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c',
				'3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d'
			]);
			expect(result.commits[1]).toStrictEqual({
				hash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
				parents: ['2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c'],
				author: 'Test Stash Author',
				email: 'test-stash@mhutchie.com',
				date: 1587559259,
				message: 'WIP 1',
				heads: [],
				tags: [],
				remotes: [],
				stash: {
					selector: 'refs/stash@{0}',
					baseHash: '6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a',
					untrackedFilesHash: null
				},
				isSyntheticParent: false,
				isPathFilterMatch: true
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['rev-list', '--max-count=1000', '6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should not display a stash whose base commit and its ancestors aren\'t loaded (branches are filtered)', async () => {
			// Setup
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 1\n'
			);
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/heads/master\n'
			);
			mockGitThrowingErrorOnce();
			vscode.mockExtensionSettingReturnValue('repository.showUncommittedChanges', false);

			// Run
			const result = await dataSource.getCommits('/path/to/repo', ['master'], null, 300, true, ['local', 'remote'], false, CommitOrdering.Date, ['origin'], [], [
				{
					hash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
					baseHash: '6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a',
					untrackedFilesHash: null,
					selector: 'refs/stash@{0}',
					author: 'Test Stash Author',
					email: 'test-stash@mhutchie.com',
					date: 1587559259,
					message: 'WIP 1'
				}
			], false, null);

			// Assert
			expect(result.commits.map((commit) => commit.hash)).toStrictEqual(['1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b']);
		});

		it('Should show a stash commit returned by git log without the commits holding its index and untracked files', async () => {
			// Setup
			const SEP = 'XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb', stash = 'a'.repeat(40), index = 'b'.repeat(40), untracked = 'c'.repeat(40), base = 'd'.repeat(40);
			const record = (hash: string, parents: string, date: number, message: string) => [hash, parents, 'Test Name', 'test@mhutchie.com', date, message].join(SEP) + '\n';
			// With the Reflog scope, git log also returns the commits of the reflog of refs/stash and their parents
			mockGitSuccessOnce(record(stash, base + ' ' + index + ' ' + untracked, 1587559259, 'WIP on master: dddddd Base') + record(index, base, 1587559259, 'index on master: dddddd Base') + record(untracked, '', 1587559259, 'untracked files on master: dddddd Base') + record(base, '', 1587559258, 'Base'));
			mockGitSuccessOnce(base + ' HEAD\n' + base + ' refs/heads/master\n');
			vscode.mockExtensionSettingReturnValue('repository.showUncommittedChanges', false);

			// Run
			const result = await dataSource.getCommits('/path/to/repo', null, null, 300, true, ['local', 'reflog'], false, CommitOrdering.Date, [], [], [
				{ hash: stash, baseHash: base, untrackedFilesHash: untracked, selector: 'refs/stash@{0}', author: 'Test Name', email: 'test@mhutchie.com', date: 1587559259, message: 'WIP on master: dddddd Base' }
			], false, null);

			// Assert
			expect(result.commits.map((commit) => commit.hash)).toStrictEqual([stash, base]);
			expect(result.commits[0].parents).toStrictEqual([base]);
			expect(result.commits[0].stash).toStrictEqual({ selector: 'refs/stash@{0}', baseHash: base, untrackedFilesHash: untracked });
		});

		it('Should return the commits (stashes are based on different commits returned by git log)', async () => {
			// Setup
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 3\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559257XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 2\n' +
				'3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559256XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 1\n'
			);
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/heads/master\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/heads/develop\n' +
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e refs/heads/feature\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/remotes/origin/master\n'
			);
			mockGitSuccessOnce(
				'M modified.txt\n' +
				'?? untracked.txt\n'
			);
			vscode.mockExtensionSettingReturnValue('repository.showCommitsOnlyReferencedByTags', true);
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);
			vscode.mockExtensionSettingReturnValue('repository.showUncommittedChanges', true);
			date.setCurrentTime(1587559259);

			// Run
			const result = await dataSource.getCommits('/path/to/repo', null, null, 300, true, ['local', 'remote'], false, CommitOrdering.Date, ['origin'], [], [
				{
					hash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
					baseHash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
					untrackedFilesHash: '5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f',
					selector: 'refs/stash@{0}',
					author: 'Test Stash Author',
					email: 'test-stash@mhutchie.com',
					date: 1587559258,
					message: 'WIP 1'
				},
				{
					hash: 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
					baseHash: '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c',
					untrackedFilesHash: '6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a',
					selector: 'refs/stash@{1}',
					author: 'Test Stash Author',
					email: 'test-stash@mhutchie.com',
					date: 1587559258,
					message: 'WIP 2'
				}
			], false, null);

			// Assert
			expect(result).toStrictEqual({
				commits: [
					{
						hash: '*',
						parents: ['1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'],
						author: '*',
						email: '',
						date: 1587559259,
						message: 'Uncommitted Changes (2)',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
						parents: ['1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'],
						author: 'Test Stash Author',
						email: 'test-stash@mhutchie.com',
						date: 1587559258,
						message: 'WIP 1',
						heads: [],
						tags: [],
						remotes: [],
						stash: {
							baseHash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
							selector: 'refs/stash@{0}',
							untrackedFilesHash: '5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f'
						}, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
						parents: ['2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559258,
						message: 'Commit Message 3',
						heads: ['master'],
						tags: [],
						remotes: [{ name: 'origin/master', remote: 'origin' }],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
						parents: ['2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c'],
						author: 'Test Stash Author',
						email: 'test-stash@mhutchie.com',
						date: 1587559258,
						message: 'WIP 2',
						heads: [],
						tags: [],
						remotes: [],
						stash: {
							baseHash: '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c',
							selector: 'refs/stash@{1}',
							untrackedFilesHash: '6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a'
						}, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c',
						parents: ['3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559257,
						message: 'Commit Message 2',
						heads: ['develop'],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d',
						parents: [],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559256,
						message: 'Commit Message 1',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					}
				],
				head: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
				tags: [],
				moreCommitsAvailable: false, pathFilterActive: false,
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'log', '--max-count=301', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%s', '--date-order', '--branches', '--tags', '--remotes', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c', 'HEAD', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['show-ref', '-d', '--head'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['status', '--untracked-files=all', '--porcelain'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the commits (stashes are based on a commit returned by git log)', async () => {
			// Setup
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 3\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559257XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 2\n' +
				'3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559256XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 1\n'
			);
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/heads/master\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/heads/develop\n' +
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e refs/heads/feature\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/remotes/origin/master\n'
			);
			mockGitSuccessOnce(
				'M modified.txt\n' +
				'?? untracked.txt\n'
			);
			vscode.mockExtensionSettingReturnValue('repository.showCommitsOnlyReferencedByTags', true);
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);
			vscode.mockExtensionSettingReturnValue('repository.showUncommittedChanges', true);
			date.setCurrentTime(1587559259);

			// Run
			const result = await dataSource.getCommits('/path/to/repo', null, null, 300, true, ['local', 'remote'], false, CommitOrdering.Date, ['origin'], [], [
				{
					hash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
					baseHash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
					untrackedFilesHash: '5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f',
					selector: 'refs/stash@{0}',
					author: 'Test Stash Author',
					email: 'test-stash@mhutchie.com',
					date: 1587559261,
					message: 'WIP 1'
				},
				{
					hash: 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
					baseHash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
					untrackedFilesHash: '6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a',
					selector: 'refs/stash@{1}',
					author: 'Test Stash Author',
					email: 'test-stash@mhutchie.com',
					date: 1587559260,
					message: 'WIP 2'
				}
			], false, null);

			// Assert
			expect(result).toStrictEqual({
				commits: [
					{
						hash: '*',
						parents: ['1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'],
						author: '*',
						email: '',
						date: 1587559259,
						message: 'Uncommitted Changes (2)',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
						parents: ['1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'],
						author: 'Test Stash Author',
						email: 'test-stash@mhutchie.com',
						date: 1587559261,
						message: 'WIP 1',
						heads: [],
						tags: [],
						remotes: [],
						stash: {
							baseHash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
							selector: 'refs/stash@{0}',
							untrackedFilesHash: '5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f'
						}, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
						parents: ['1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'],
						author: 'Test Stash Author',
						email: 'test-stash@mhutchie.com',
						date: 1587559260,
						message: 'WIP 2',
						heads: [],
						tags: [],
						remotes: [],
						stash: {
							baseHash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
							selector: 'refs/stash@{1}',
							untrackedFilesHash: '6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a'
						}, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
						parents: ['2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559258,
						message: 'Commit Message 3',
						heads: ['master'],
						tags: [],
						remotes: [{ name: 'origin/master', remote: 'origin' }],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c',
						parents: ['3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559257,
						message: 'Commit Message 2',
						heads: ['develop'],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d',
						parents: [],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559256,
						message: 'Commit Message 1',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					}
				],
				head: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
				tags: [],
				moreCommitsAvailable: false, pathFilterActive: false,
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'log', '--max-count=301', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%s', '--date-order', '--branches', '--tags', '--remotes', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 'HEAD', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['show-ref', '-d', '--head'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['status', '--untracked-files=all', '--porcelain'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the commits (stash isn\'t based on a commit returned by git log)', async () => {
			// Setup
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 3\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559257XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 2\n' +
				'3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559256XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 1\n'
			);
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/heads/master\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/heads/develop\n' +
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e refs/heads/feature\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/remotes/origin/master\n'
			);
			mockGitSuccessOnce(
				'M modified.txt\n' +
				'?? untracked.txt\n'
			);
			vscode.mockExtensionSettingReturnValue('repository.showCommitsOnlyReferencedByTags', true);
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);
			vscode.mockExtensionSettingReturnValue('repository.showUncommittedChanges', true);
			date.setCurrentTime(1587559259);

			// Run
			const result = await dataSource.getCommits('/path/to/repo', null, null, 300, true, ['local', 'remote'], false, CommitOrdering.Date, ['origin'], [], [
				{
					hash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
					baseHash: '6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a',
					untrackedFilesHash: '5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f',
					selector: 'refs/stash@{0}',
					author: 'Test Stash Author',
					email: 'test-stash@mhutchie.com',
					date: 1587559258,
					message: 'WIP 1'
				}
			], false, null);

			// Assert
			expect(result).toStrictEqual({
				commits: [
					{
						hash: '*',
						parents: ['1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'],
						author: '*',
						email: '',
						date: 1587559259,
						message: 'Uncommitted Changes (2)',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
						parents: ['2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559258,
						message: 'Commit Message 3',
						heads: ['master'],
						tags: [],
						remotes: [{ name: 'origin/master', remote: 'origin' }],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c',
						parents: ['3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559257,
						message: 'Commit Message 2',
						heads: ['develop'],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d',
						parents: [],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559256,
						message: 'Commit Message 1',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					}
				],
				head: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
				tags: [],
				moreCommitsAvailable: false, pathFilterActive: false,
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'log', '--max-count=301', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%s', '--date-order', '--branches', '--tags', '--remotes', '6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a', 'HEAD', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['show-ref', '-d', '--head'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['status', '--untracked-files=all', '--porcelain'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the commits (no uncommitted changes)', async () => {
			// Setup
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 3\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559257XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 2\n' +
				'3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559256XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 1\n'
			);
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/heads/master\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/heads/develop\n' +
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e refs/heads/feature\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/remotes/origin/master\n' +
				'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 refs/tags/tag1\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/tags/tag1^{}\n'
			);
			mockGitSuccessOnce('');
			vscode.mockExtensionSettingReturnValue('repository.showCommitsOnlyReferencedByTags', true);
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);
			vscode.mockExtensionSettingReturnValue('repository.showUncommittedChanges', true);
			date.setCurrentTime(1587559259);

			// Run
			const result = await dataSource.getCommits('/path/to/repo', null, null, 300, true, ['local', 'remote'], false, CommitOrdering.Date, ['origin'], [], [], false, null);

			// Assert
			expect(result).toStrictEqual({
				commits: [
					{
						hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
						parents: ['2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559258,
						message: 'Commit Message 3',
						heads: ['master'],
						tags: [],
						remotes: [{ name: 'origin/master', remote: 'origin' }],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c',
						parents: ['3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559257,
						message: 'Commit Message 2',
						heads: ['develop'],
						tags: [{ name: 'tag1', annotated: true }],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d',
						parents: [],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559256,
						message: 'Commit Message 1',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					}
				],
				head: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
				tags: ['tag1'],
				moreCommitsAvailable: false, pathFilterActive: false,
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'log', '--max-count=301', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%s', '--date-order', '--branches', '--tags', '--remotes', 'HEAD', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['show-ref', '-d', '--head'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['status', '--untracked-files=all', '--porcelain'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return no commits (when in an empty repository)', async () => {
			// Setup
			mockGitSuccessOnce('\n');
			mockGitThrowingErrorOnce();
			vscode.mockExtensionSettingReturnValue('repository.showCommitsOnlyReferencedByTags', true);
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);

			// Run
			const result = await dataSource.getCommits('/path/to/repo', null, null, 300, true, ['local', 'remote'], false, CommitOrdering.Date, ['origin'], [], [], false, null);

			// Assert
			expect(result).toStrictEqual({
				commits: [],
				head: null,
				tags: [],
				moreCommitsAvailable: false, pathFilterActive: false,
				error: null
			});
			expect(spyOnSpawn).toHaveBeenCalledTimes(2);
		});

		it('Should return the commits (ignoring invalid show-ref records)', async () => {
			// Setup
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 3\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559257XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 2\n' +
				'3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559256XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 1\n'
			);
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/heads/master\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/heads/develop\n' +
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e refs/heads/feature\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/invalid/master\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/remotes/origin/master\n' +
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e refs/remotes/origin/feature\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/remotes/other-remote/master\n' +
				'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 refs/tags/tag1\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/tags/tag1^{}\n'
			);
			mockGitSuccessOnce(
				'M modified.txt\n' +
				'?? untracked.txt\n'
			);
			vscode.mockExtensionSettingReturnValue('repository.showCommitsOnlyReferencedByTags', true);
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);
			vscode.mockExtensionSettingReturnValue('repository.showUncommittedChanges', true);
			date.setCurrentTime(1587559259);

			// Run
			const result = await dataSource.getCommits('/path/to/repo', null, null, 300, true, ['local', 'remote'], false, CommitOrdering.Date, ['origin'], [], [], false, null);

			// Assert
			expect(result).toStrictEqual({
				commits: [
					{
						hash: '*',
						parents: ['1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'],
						author: '*',
						email: '',
						date: 1587559259,
						message: 'Uncommitted Changes (2)',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
						parents: ['2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559258,
						message: 'Commit Message 3',
						heads: ['master'],
						tags: [],
						remotes: [{ name: 'origin/master', remote: 'origin' }, { name: 'other-remote/master', remote: null }],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c',
						parents: ['3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d'],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559257,
						message: 'Commit Message 2',
						heads: ['develop'],
						tags: [{ name: 'tag1', annotated: true }],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					},
					{
						hash: '3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d',
						parents: [],
						author: 'Test Name',
						email: 'test@mhutchie.com',
						date: 1587559256,
						message: 'Commit Message 1',
						heads: [],
						tags: [],
						remotes: [],
						stash: null, isSyntheticParent: false, isPathFilterMatch: true
					}
				],
				head: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
				tags: ['tag1'],
				moreCommitsAvailable: false, pathFilterActive: false,
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'log', '--max-count=301', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%s', '--date-order', '--branches', '--tags', '--remotes', 'HEAD', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['show-ref', '-d', '--head'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['status', '--untracked-files=all', '--porcelain'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git (when thrown by git log)', async () => {
			// Setup
			mockGitThrowingErrorOnce();
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/heads/master\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/heads/develop\n' +
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e refs/heads/feature\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/remotes/origin/master\n' +
				'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 refs/tags/tag1\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/tags/tag1^{}\n'
			);
			vscode.mockExtensionSettingReturnValue('repository.showCommitsOnlyReferencedByTags', true);
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);

			// Run
			const result = await dataSource.getCommits('/path/to/repo', null, null, 300, true, ['local', 'remote'], false, CommitOrdering.Date, ['origin'], [], [], false, null);

			// Assert
			expect(result).toStrictEqual({
				commits: [],
				head: null,
				tags: [],
				moreCommitsAvailable: false, pathFilterActive: false,
				error: 'error message'
			});
		});

		it('Should return an error message thrown by git (when thrown by git show-ref)', async () => {
			// Setup
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 3\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559257XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 2\n' +
				'3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559256XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 1\n'
			);
			mockGitThrowingErrorOnce();
			vscode.mockExtensionSettingReturnValue('repository.showCommitsOnlyReferencedByTags', true);
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);

			// Run
			const result = await dataSource.getCommits('/path/to/repo', null, null, 300, true, ['local', 'remote'], false, CommitOrdering.Date, ['origin'], [], [], false, null);

			// Assert
			expect(result).toStrictEqual({
				commits: [],
				head: null,
				tags: [],
				moreCommitsAvailable: false, pathFilterActive: false,
				error: 'error message'
			});
		});

		it('Should return the commits (with pathFilter)', async () => {
			// Setup
			// Spawn order: getMatchingHashes + getLog (parallel) → getRefs → findNearestAncestor(#4)
			// Mock #1: getMatchingHashes (hash + date, default simplification)
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b\x001587559258\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c\x001587559257\n' +
				'3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d\x001587559256\n'
			);
			// Mock #2: getLog (--full-history --simplify-merges with path filter)
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 3\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3cXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559257XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 2\n' +
				'3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4dXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest NameXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559256XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message 1\n'
			);
			// Mock #3: getRefs
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/heads/master\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/heads/develop\n' +
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e refs/heads/feature\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/remotes/origin/master\n' +
				'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 refs/tags/tag1\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/tags/tag1^{}\n'
			);
			// Mock #4: findNearestAncestorInSet for orphaned 'feature' branch (4d5e6f... → 1a2b3c...)
			mockGitSuccessOnce(
				'4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b\n'
			);
			vscode.mockExtensionSettingReturnValue('repository.showCommitsOnlyReferencedByTags', true);
			vscode.mockExtensionSettingReturnValue('repository.showRemoteHeads', true);
			vscode.mockExtensionSettingReturnValue('repository.showUncommittedChanges', false);
			date.setCurrentTime(1587559259);

			// Run
			const result = await dataSource.getCommits('/path/to/repo', null, null, 300, true, ['local', 'remote'], false, CommitOrdering.Date, ['origin'], [], [], false, 'src/main.ts');

			// Assert
			expect(spyOnSpawn).toHaveBeenCalledTimes(4); // getMatchingHashes + getLog + getRefs + findNearestAncestor (the tag object of tag1 isn't a commit)
			// calls[0] = getMatchingHashes: should have --full-history (without --simplify-merges, so side branch commits that changed the
			// path are matches, consistent with the topology loaded by getLog), and the path filter after '--'
			const matchingHashesCall = spyOnSpawn.mock.calls[0];
			expect(matchingHashesCall[1]).toContain('--full-history');
			expect(matchingHashesCall[1]).not.toContain('--simplify-merges');
			expect(matchingHashesCall[1]).toContain('--');
			const dashDashIndex = matchingHashesCall[1].indexOf('--');
			expect(matchingHashesCall[1].indexOf('--full-history')).toBeLessThan(dashDashIndex);
			expect(matchingHashesCall[1][dashDashIndex + 1]).toBe('src/main.ts');
			// calls[1] = getLog: should have --full-history, --simplify-merges, and path filter
			const logCall = spyOnSpawn.mock.calls[1];
			expect(logCall[1]).toContain('--full-history');
			expect(logCall[1]).toContain('--simplify-merges');
			const logDashIndex = logCall[1].indexOf('--');
			expect(logCall[1][logDashIndex + 1]).toBe('src/main.ts');
			// --full-history and --simplify-merges must be BEFORE '--'
			const logFullHistoryIdx = logCall[1].indexOf('--full-history');
			const logSimplifyIdx = logCall[1].indexOf('--simplify-merges');
			expect(logFullHistoryIdx).toBeLessThan(logDashIndex);
			expect(logSimplifyIdx).toBeLessThan(logDashIndex);
			// Verify orphaned refs are annotated to nearest ancestor commits
			// 'feature' branch (4d5e6f...) should be annotated to commit 1a2b3c...
			expect(result.commits.find(c => c.hash === '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b')!.heads).toContain('feature');
			// The annotated tag1 is shown once on its commit 2b3c4d..., its tag object a1b2c3... isn't attached to an ancestor as a second copy
			expect(result.commits.find(c => c.hash === '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c')!.tags).toStrictEqual([{ name: 'tag1', annotated: true }]);
			// rev-list calls should have --max-count=1000
			expect(spyOnSpawn.mock.calls[3][1]).toContain('--max-count=1000');
		});
	});

	describe('getConfig', () => {
		it('Should return the config values', async () => {
			// Setup
			mockGitSuccessOnce(
				'user.name\nLocal Name\0' +
				'diff.tool\nabc\0' +
				'diff.guitool\ndef\0' +
				'remote.pushdefault\norigin\0'
			);
			mockGitSuccessOnce(
				'user.name\nLocal Name\0' +
				'user.email\nunused@mhutchie.com\0' +
				'user.email\nlocal@mhutchie.com\0' +
				'remote.origin.url\nhttps://github.com/mhutchie/vscode-git-graph.git\0' +
				'remote.origin.pushurl\nhttps://github.com/mhutchie/vscode-git-graph-push.git\0' +
				'remote.origin.fetch\n+refs/heads/*:refs/remotes/origin/*\0' +
				'branch.master.remote\norigin\0' +
				'branch.master.pushremote\norigin2\0' +
				'branch.master.merge\nrefs/heads/main\0' +
				'branch.master.other\norigin3\0' +
				'branch.Feature.x.merge\nrefs/heads/feature-x\0' +
				'branch.develop.pushremote\norigin\0' +
				'branch.develop.remote\norigin2\0' +
				'branch.branch1.remote\norigin\0' +
				'branch.branch2.pushremote\norigin\0'
			);
			mockGitSuccessOnce(
				'user.name\nGlobal Name\0' +
				'user.email\nglobal@mhutchie.com\0'
			);
			mockGitSuccessOnce(
				'    10\tTest Name <test@mhutchie.com>\n' +
				'     2\tAnother Name <another@mhutchie.com>\n'
			);

			// Run
			const result = await dataSource.getConfig('/path/to/repo', ['origin']);

			// Assert
			expect(result).toStrictEqual({
				config: {
					authors: [
						{ name: 'Another Name', email: 'another@mhutchie.com' },
						{ name: 'Test Name', email: 'test@mhutchie.com' }
					],
					branches: {
						master: {
							pushRemote: 'origin2',
							remote: 'origin',
							merge: 'refs/heads/main'
						},
						'Feature.x': {
							pushRemote: null,
							remote: null,
							merge: 'refs/heads/feature-x'
						},
						develop: {
							pushRemote: 'origin',
							remote: 'origin2',
							merge: null
						},
						branch1: {
							pushRemote: null,
							remote: 'origin',
							merge: null
						},
						branch2: {
							pushRemote: 'origin',
							remote: null,
							merge: null
						}
					},
					diffTool: 'abc',
					guiDiffTool: 'def',
					pushDefault: 'origin',
					remotes: [
						{
							name: 'origin',
							url: 'https://github.com/mhutchie/vscode-git-graph.git',
							pushUrl: 'https://github.com/mhutchie/vscode-git-graph-push.git'
						}
					],
					user: {
						name: {
							local: 'Local Name',
							global: 'Global Name'
						},
						email: {
							local: 'local@mhutchie.com',
							global: 'global@mhutchie.com'
						}
					}
				},
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['--no-pager', 'config', '--list', '-z', '--includes'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['--no-pager', 'config', '--list', '-z', '--includes', '--local'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['--no-pager', 'config', '--list', '-z', '--includes', '--global'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['shortlog', '-e', '-s', '-n', 'HEAD'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the config values', async () => {
			// Setup
			mockGitSuccessOnce(
				'diff.tool\nabc\0' +
				'diff.guitool\ndef\0'
			);
			mockGitSuccessOnce(
				'user.email\nlocal@mhutchie.com\0' +
				'remote.origin.url\nhttps://github.com/mhutchie/vscode-git-graph.git\0'
			);
			mockGitSuccessOnce(
				'user.name\nGlobal Name\0'
			);
			mockGitSuccessOnce('');

			// Run
			const result = await dataSource.getConfig('/path/to/repo', ['origin']);

			// Assert
			expect(result).toStrictEqual({
				config: {
					authors: [],
					branches: {},
					diffTool: 'abc',
					guiDiffTool: 'def',
					pushDefault: null,
					remotes: [
						{
							name: 'origin',
							url: 'https://github.com/mhutchie/vscode-git-graph.git',
							pushUrl: null
						}
					],
					user: {
						name: {
							local: null,
							global: 'Global Name'
						},
						email: {
							local: 'local@mhutchie.com',
							global: null
						}
					}
				},
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['--no-pager', 'config', '--list', '-z', '--includes'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['--no-pager', 'config', '--list', '-z', '--includes', '--local'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['--no-pager', 'config', '--list', '-z', '--includes', '--global'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['shortlog', '-e', '-s', '-n', 'HEAD'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return NULL values when the config variables aren\'t set', async () => {
			// Setup
			mockGitSuccessOnce(
				'other.setting\nvalue\0'
			);
			mockGitSuccessOnce(
				'other.setting\nvalue\0'
			);
			mockGitSuccessOnce(
				'other.setting\nvalue\0'
			);
			mockGitSuccessOnce('');

			// Run
			const result = await dataSource.getConfig('/path/to/repo', []);

			// Assert
			expect(result).toStrictEqual({
				config: {
					authors: [],
					branches: {},
					diffTool: null,
					guiDiffTool: null,
					pushDefault: null,
					remotes: [],
					user: {
						name: {
							local: null,
							global: null
						},
						email: {
							local: null,
							global: null
						}
					}
				},
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['--no-pager', 'config', '--list', '-z', '--includes'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['--no-pager', 'config', '--list', '-z', '--includes', '--local'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['--no-pager', 'config', '--list', '-z', '--includes', '--global'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['shortlog', '-e', '-s', '-n', 'HEAD'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the repositories settings (ignoring Git exception when either the global or local .gitconfig file doesn\'t exist)', async () => {
			// Setup
			mockGitSuccessOnce(
				'user.name\nLocal Name\0' +
				'diff.tool\nabc\0' +
				'diff.guitool\ndef\0'
			);
			mockGitSuccessOnce(
				'user.name\nLocal\r\nMultiline\nName\0' +
				'user.email\nunused@mhutchie.com\0' +
				'user.email\nlocal@mhutchie.com\0' +
				'remote.origin.url\nhttps://github.com/mhutchie/vscode-git-graph.git\0' +
				'remote.origin.pushurl\nhttps://github.com/mhutchie/vscode-git-graph-push.git\0' +
				'remote.origin.fetch\n+refs/heads/*:refs/remotes/origin/*\0'
			);
			mockGitThrowingErrorOnce('fatal: unable to read config file \'c:/users/michael/.gitconfig\': no such file or directory');
			mockGitSuccessOnce('');

			// Run
			const result = await dataSource.getConfig('/path/to/repo', ['origin']);

			// Assert
			expect(result).toStrictEqual({
				config: {
					authors: [],
					branches: {},
					diffTool: 'abc',
					guiDiffTool: 'def',
					pushDefault: null,
					remotes: [
						{
							name: 'origin',
							url: 'https://github.com/mhutchie/vscode-git-graph.git',
							pushUrl: 'https://github.com/mhutchie/vscode-git-graph-push.git'
						}
					],
					user: {
						name: {
							local: 'Local\nMultiline\nName',
							global: null
						},
						email: {
							local: 'local@mhutchie.com',
							global: null
						}
					}
				},
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['--no-pager', 'config', '--list', '-z', '--includes'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['--no-pager', 'config', '--list', '-z', '--includes', '--local'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['--no-pager', 'config', '--list', '-z', '--includes', '--global'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['shortlog', '-e', '-s', '-n', 'HEAD'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();
			mockGitThrowingErrorOnce();
			mockGitThrowingErrorOnce();
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.getConfig('/path/to/repo', []);

			// Assert
			expect(result).toStrictEqual({
				config: null,
				error: 'error message'
			});
		});

		it('Should return an error message indicating an unexpected error occurred', async () => {
			// Setup
			const error = new Error();
			mockGitSuccessOnce(
				'user.name\nLocal Name\0' +
				'diff.tool\nabc\0' +
				'diff.guitool\ndef\0'
			);
			mockGitSuccessOnce(
				'user.name\nLocal Name\0' +
				'user.email\nunused@mhutchie.com\0' +
				'user.email\nlocal@mhutchie.com\0' +
				'remote.origin.url\nhttps://github.com/mhutchie/vscode-git-graph.git\0' +
				'remote.origin.pushurl\nhttps://github.com/mhutchie/vscode-git-graph-push.git\0' +
				'remote.origin.fetch\n+refs/heads/*:refs/remotes/origin/*\0'
			);
			spyOnSpawn.mockImplementationOnce(() => {
				throw error;
			});

			// Run
			const result = await dataSource.getConfig('/path/to/repo', ['origin']);

			// Assert
			expect(result).toStrictEqual({
				config: null,
				error: 'An unexpected error occurred while spawning the Git child process.'
			});
		});
	});

	describe('getCommitDetails', () => {
		it('Should return the commit details', async () => {
			// Setup
			mockGitSuccessOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPba1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest AuthorXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-author@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest CommitterXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-committer@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559259XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message.\r\nSecond Line.');
			mockGitSuccessOnce(['D', 'dir/deleted.txt', 'M', 'dir/modified.txt', 'R100', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));
			mockGitSuccessOnce(['0	0	dir/deleted.txt', '1	1	dir/modified.txt', '2	3	', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));

			// Run
			const result = await dataSource.getCommitDetails('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', true);

			// Assert
			expect(result).toStrictEqual({
				commitDetails: {
					hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
					parents: ['a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'],
					author: 'Test Author',
					authorEmail: 'test-author@mhutchie.com',
					authorDate: 1587559258,
					committer: 'Test Committer',
					committerEmail: 'test-committer@mhutchie.com',
					committerDate: 1587559259,
					signature: null,
					body: 'Commit Message.\nSecond Line.',
					fileChanges: [
						{
							additions: 0,
							deletions: 0,
							newFilePath: 'dir/deleted.txt',
							oldFilePath: 'dir/deleted.txt',
							type: 'D'
						},
						{
							additions: 1,
							deletions: 1,
							newFilePath: 'dir/modified.txt',
							oldFilePath: 'dir/modified.txt',
							type: 'M'
						},
						{
							additions: 2,
							deletions: 3,
							newFilePath: 'dir/renamed-new.txt',
							oldFilePath: 'dir/renamed-old.txt',
							type: 'R'
						}
					]
				},
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'show', '--quiet', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%cnXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%ceXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%ctXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%B'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--name-status', '--find-renames', '--diff-filter=AMDRT', '-z', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b~1', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--numstat', '--find-renames', '--diff-filter=AMDRT', '-z', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b~1', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the commit details (commit doesn\'t have parents)', async () => {
			// Setup
			mockGitSuccessOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest AuthorXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-author@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest CommitterXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-committer@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559259XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message.\r\nSecond Line.');
			mockGitSuccessOnce(['1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 'D', 'dir/deleted.txt', 'M', 'dir/modified.txt', 'R100', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));
			mockGitSuccessOnce(['1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', '0	0	dir/deleted.txt', '1	1	dir/modified.txt', '2	3	', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));

			// Run
			const result = await dataSource.getCommitDetails('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', false);

			// Assert
			expect(result).toStrictEqual({
				commitDetails: {
					hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
					parents: [],
					author: 'Test Author',
					authorEmail: 'test-author@mhutchie.com',
					authorDate: 1587559258,
					committer: 'Test Committer',
					committerEmail: 'test-committer@mhutchie.com',
					committerDate: 1587559259,
					signature: null,
					body: 'Commit Message.\nSecond Line.',
					fileChanges: [
						{
							additions: 0,
							deletions: 0,
							newFilePath: 'dir/deleted.txt',
							oldFilePath: 'dir/deleted.txt',
							type: 'D'
						},
						{
							additions: 1,
							deletions: 1,
							newFilePath: 'dir/modified.txt',
							oldFilePath: 'dir/modified.txt',
							type: 'M'
						},
						{
							additions: 2,
							deletions: 3,
							newFilePath: 'dir/renamed-new.txt',
							oldFilePath: 'dir/renamed-old.txt',
							type: 'R'
						}
					]
				},
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'show', '--quiet', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%cnXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%ceXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%ctXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%B'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff-tree', '--name-status', '-r', '--root', '--find-renames', '--diff-filter=AMDRT', '-z', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff-tree', '--numstat', '-r', '--root', '--find-renames', '--diff-filter=AMDRT', '-z', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the commit details (using easy-graph.repository.commits.showSignatureStatus)', async () => {
			// Setup
			mockGitSuccessOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPba1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest AuthorXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-author@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest CommitterXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-committer@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559259XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbGXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest Signer <test-signer@mhutchie.com> XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb0123456789ABCDEFXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message.\r\nSecond Line.');
			mockGitSuccessOnce(['D', 'dir/deleted.txt', 'M', 'dir/modified.txt', 'R100', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));
			mockGitSuccessOnce(['0	0	dir/deleted.txt', '1	1	dir/modified.txt', '2	3	', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));
			vscode.mockExtensionSettingReturnValue('date.type', 'Author Date');
			vscode.mockExtensionSettingReturnValue('repository.commits.showSignatureStatus', true);
			onDidChangeGitExecutable.emit({ path: '/path/to/git', version: '2.4.0' });

			// Run
			onDidChangeConfiguration.emit({
				affectsConfiguration: (section) => section === 'easy-graph.repository.commits.showSignatureStatus'
			});
			const result = await dataSource.getCommitDetails('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', true);

			// Assert
			expect(result).toStrictEqual({
				commitDetails: {
					hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
					parents: ['a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'],
					author: 'Test Author',
					authorEmail: 'test-author@mhutchie.com',
					authorDate: 1587559258,
					committer: 'Test Committer',
					committerEmail: 'test-committer@mhutchie.com',
					committerDate: 1587559259,
					signature: {
						key: '0123456789ABCDEF',
						signer: 'Test Signer <test-signer@mhutchie.com>',
						status: 'G'
					},
					body: 'Commit Message.\nSecond Line.',
					fileChanges: [
						{
							additions: 0,
							deletions: 0,
							newFilePath: 'dir/deleted.txt',
							oldFilePath: 'dir/deleted.txt',
							type: 'D'
						},
						{
							additions: 1,
							deletions: 1,
							newFilePath: 'dir/modified.txt',
							oldFilePath: 'dir/modified.txt',
							type: 'M'
						},
						{
							additions: 2,
							deletions: 3,
							newFilePath: 'dir/renamed-new.txt',
							oldFilePath: 'dir/renamed-old.txt',
							type: 'R'
						}
					]
				},
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'show', '--quiet', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%cnXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%ceXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%ctXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%G?XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%GSXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%GKXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%B'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--name-status', '--find-renames', '--diff-filter=AMDRT', '-z', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b~1', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--numstat', '--find-renames', '--diff-filter=AMDRT', '-z', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b~1', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the commit details (without signature status) when Git is older than 2.4.0', async () => {
			// Setup
			mockGitSuccessOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPba1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest AuthorXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-author@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest CommitterXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-committer@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559259XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message.\r\nSecond Line.');
			mockGitSuccessOnce(['D', 'dir/deleted.txt', 'M', 'dir/modified.txt', 'R100', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));
			mockGitSuccessOnce(['0	0	dir/deleted.txt', '1	1	dir/modified.txt', '2	3	', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));
			vscode.mockExtensionSettingReturnValue('date.type', 'Author Date');
			vscode.mockExtensionSettingReturnValue('repository.commits.showSignatureStatus', true);
			onDidChangeGitExecutable.emit({ path: '/path/to/git', version: '2.3.0' });

			// Run
			const result = await dataSource.getCommitDetails('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', true);

			// Assert
			expect(result).toStrictEqual({
				commitDetails: {
					hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
					parents: ['a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'],
					author: 'Test Author',
					authorEmail: 'test-author@mhutchie.com',
					authorDate: 1587559258,
					committer: 'Test Committer',
					committerEmail: 'test-committer@mhutchie.com',
					committerDate: 1587559259,
					signature: null,
					body: 'Commit Message.\nSecond Line.',
					fileChanges: [
						{
							additions: 0,
							deletions: 0,
							newFilePath: 'dir/deleted.txt',
							oldFilePath: 'dir/deleted.txt',
							type: 'D'
						},
						{
							additions: 1,
							deletions: 1,
							newFilePath: 'dir/modified.txt',
							oldFilePath: 'dir/modified.txt',
							type: 'M'
						},
						{
							additions: 2,
							deletions: 3,
							newFilePath: 'dir/renamed-new.txt',
							oldFilePath: 'dir/renamed-old.txt',
							type: 'R'
						}
					]
				},
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'show', '--quiet', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%cnXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%ceXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%ctXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%B'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--name-status', '--find-renames', '--diff-filter=AMDRT', '-z', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b~1', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--numstat', '--find-renames', '--diff-filter=AMDRT', '-z', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b~1', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the commit details (using easy-graph.repository.useMailmap)', async () => {
			// Setup
			mockGitSuccessOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPba1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest AuthorXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-author@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest CommitterXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-committer@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559259XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message.\r\nSecond Line.');
			mockGitSuccessOnce(['D', 'dir/deleted.txt', 'M', 'dir/modified.txt', 'R100', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));
			mockGitSuccessOnce(['0	0	dir/deleted.txt', '1	1	dir/modified.txt', '2	3	', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));
			vscode.mockExtensionSettingReturnValue('date.type', 'Author Date');
			vscode.mockExtensionSettingReturnValue('builtin', { 'log.mailmap': true });
			vscode.mockExtensionSettingReturnValue('repository.commits.showSignatureStatus', false);

			// Run
			onDidChangeConfiguration.emit({
				affectsConfiguration: (section) => section === 'easy-graph.repository.useMailmap'
			});
			const result = await dataSource.getCommitDetails('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', true);

			// Assert
			expect(result).toStrictEqual({
				commitDetails: {
					hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
					parents: ['a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'],
					author: 'Test Author',
					authorEmail: 'test-author@mhutchie.com',
					authorDate: 1587559258,
					committer: 'Test Committer',
					committerEmail: 'test-committer@mhutchie.com',
					committerDate: 1587559259,
					signature: null,
					body: 'Commit Message.\nSecond Line.',
					fileChanges: [
						{
							additions: 0,
							deletions: 0,
							newFilePath: 'dir/deleted.txt',
							oldFilePath: 'dir/deleted.txt',
							type: 'D'
						},
						{
							additions: 1,
							deletions: 1,
							newFilePath: 'dir/modified.txt',
							oldFilePath: 'dir/modified.txt',
							type: 'M'
						},
						{
							additions: 2,
							deletions: 3,
							newFilePath: 'dir/renamed-new.txt',
							oldFilePath: 'dir/renamed-old.txt',
							type: 'R'
						}
					]
				},
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'show', '--quiet', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aNXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aEXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%cNXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%cEXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%ctXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%B'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--name-status', '--find-renames', '--diff-filter=AMDRT', '-z', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b~1', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--numstat', '--find-renames', '--diff-filter=AMDRT', '-z', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b~1', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the commit details (handling unknown Git file status returned by git diff --name-status)', async () => {
			// Setup
			mockGitSuccessOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPba1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest AuthorXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-author@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest CommitterXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-committer@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559259XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message.\r\nSecond Line.');
			mockGitSuccessOnce(['D', 'dir/deleted.txt', 'X', 'dir/modified.txt', 'R100', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));
			mockGitSuccessOnce(['0	0	dir/deleted.txt', '1	1	dir/modified.txt', '2	3	', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));

			// Run
			const result = await dataSource.getCommitDetails('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', true);

			// Assert
			expect(result).toStrictEqual({
				commitDetails: {
					hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
					parents: ['a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'],
					author: 'Test Author',
					authorEmail: 'test-author@mhutchie.com',
					authorDate: 1587559258,
					committer: 'Test Committer',
					committerEmail: 'test-committer@mhutchie.com',
					committerDate: 1587559259,
					signature: null,
					body: 'Commit Message.\nSecond Line.',
					fileChanges: [
						{
							additions: 0,
							deletions: 0,
							newFilePath: 'dir/deleted.txt',
							oldFilePath: 'dir/deleted.txt',
							type: 'D'
						}
					]
				},
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'show', '--quiet', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%cnXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%ceXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%ctXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%B'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--name-status', '--find-renames', '--diff-filter=AMDRT', '-z', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b~1', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--numstat', '--find-renames', '--diff-filter=AMDRT', '-z', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b~1', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the commit details (handling unexpected response format returned by git diff --numstat)', async () => {
			// Setup
			mockGitSuccessOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPba1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest AuthorXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-author@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest CommitterXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-committer@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559259XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message.\r\nSecond Line.');
			mockGitSuccessOnce(['D', 'dir/deleted.txt', 'M', 'dir/modified.txt', 'R100', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));
			mockGitSuccessOnce(['0	0	dir/deleted.txt', '1	1', '2	3	', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));

			// Run
			const result = await dataSource.getCommitDetails('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', true);

			// Assert
			expect(result).toStrictEqual({
				commitDetails: {
					hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
					parents: ['a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'],
					author: 'Test Author',
					authorEmail: 'test-author@mhutchie.com',
					authorDate: 1587559258,
					committer: 'Test Committer',
					committerEmail: 'test-committer@mhutchie.com',
					committerDate: 1587559259,
					signature: null,
					body: 'Commit Message.\nSecond Line.',
					fileChanges: [
						{
							additions: 0,
							deletions: 0,
							newFilePath: 'dir/deleted.txt',
							oldFilePath: 'dir/deleted.txt',
							type: 'D'
						},
						{
							additions: null,
							deletions: null,
							newFilePath: 'dir/modified.txt',
							oldFilePath: 'dir/modified.txt',
							type: 'M'
						},
						{
							additions: null,
							deletions: null,
							newFilePath: 'dir/renamed-new.txt',
							oldFilePath: 'dir/renamed-old.txt',
							type: 'R'
						}
					]
				},
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'show', '--quiet', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%cnXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%ceXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%ctXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%B'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--name-status', '--find-renames', '--diff-filter=AMDRT', '-z', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b~1', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--numstat', '--find-renames', '--diff-filter=AMDRT', '-z', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b~1', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git (when thrown by git show)', async () => {
			// Setup
			mockGitThrowingErrorOnce();
			mockGitSuccessOnce(['D', 'dir/deleted.txt', 'M', 'dir/modified.txt', 'R100', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));
			mockGitSuccessOnce(['0	0	dir/deleted.txt', '1	1	dir/modified.txt', '2	3	', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));

			// Run
			const result = await dataSource.getCommitDetails('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', true);

			// Assert
			expect(result).toStrictEqual({
				commitDetails: null,
				error: 'error message'
			});
		});

		it('Should return an error message thrown by git (when thrown by git diff-tree --name-status)', async () => {
			// Setup
			mockGitSuccessOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPba1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest AuthorXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-author@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest CommitterXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-committer@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559259XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message.\r\nSecond Line.');
			mockGitThrowingErrorOnce();
			mockGitSuccessOnce(['0	0	dir/deleted.txt', '1	1	dir/modified.txt', '2	3	', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));

			// Run
			const result = await dataSource.getCommitDetails('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', true);

			// Assert
			expect(result).toStrictEqual({
				commitDetails: null,
				error: 'error message'
			});
		});

		it('Should return an error message thrown by git (when thrown by git diff-tree --numstat)', async () => {
			// Setup
			mockGitSuccessOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPba1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest AuthorXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-author@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest CommitterXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-committer@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559259XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message.\r\nSecond Line.');
			mockGitSuccessOnce(['D', 'dir/deleted.txt', 'M', 'dir/modified.txt', 'R100', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.getCommitDetails('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', true);

			// Assert
			expect(result).toStrictEqual({
				commitDetails: null,
				error: 'error message'
			});
		});
	});

	describe('getStashDetails', () => {
		it('Should return the stash details', async () => {
			// Setup
			mockGitSuccessOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPba1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest AuthorXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-author@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest CommitterXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-committer@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559259XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message.\r\nSecond Line.');
			mockGitSuccessOnce(['D', 'dir/deleted.txt', 'M', 'dir/modified.txt', 'R100', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));
			mockGitSuccessOnce(['0	0	dir/deleted.txt', '1	1	dir/modified.txt', '2	3	', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));

			// Run
			const result = await dataSource.getStashDetails('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', {
				selector: 'refs/stash@{0}',
				baseHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
				untrackedFilesHash: null
			});

			// Assert
			expect(result).toStrictEqual({
				commitDetails: {
					hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
					parents: ['a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3'],
					author: 'Test Author',
					authorEmail: 'test-author@mhutchie.com',
					authorDate: 1587559258,
					committer: 'Test Committer',
					committerEmail: 'test-committer@mhutchie.com',
					committerDate: 1587559259,
					signature: null,
					body: 'Commit Message.\nSecond Line.',
					fileChanges: [
						{
							additions: 0,
							deletions: 0,
							newFilePath: 'dir/deleted.txt',
							oldFilePath: 'dir/deleted.txt',
							type: 'D'
						},
						{
							additions: 1,
							deletions: 1,
							newFilePath: 'dir/modified.txt',
							oldFilePath: 'dir/modified.txt',
							type: 'M'
						},
						{
							additions: 2,
							deletions: 3,
							newFilePath: 'dir/renamed-new.txt',
							oldFilePath: 'dir/renamed-old.txt',
							type: 'R'
						}
					]
				},
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'show', '--quiet', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%cnXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%ceXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%ctXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%B'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--name-status', '--find-renames', '--diff-filter=AMDRT', '-z', 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--numstat', '--find-renames', '--diff-filter=AMDRT', '-z', 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the stash details (including untracked files)', async () => {
			// Setup
			mockGitSuccessOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPba1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3 c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest AuthorXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-author@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest CommitterXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-committer@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559259XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message.\r\nSecond Line.');
			mockGitSuccessOnce(['D', 'dir/deleted.txt', 'M', 'dir/modified.txt', 'R100', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));
			mockGitSuccessOnce(['0	0	dir/deleted.txt', '1	1	dir/modified.txt', '2	3	', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));
			mockGitSuccessOnce(['c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', 'D', 'dir/other-deleted.txt', 'A', 'dir/added.txt', ''].join('\0'));
			mockGitSuccessOnce(['c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', '0	0	dir/other-deleted.txt', '4	0	dir/added.txt', ''].join('\0'));

			// Run
			const result = await dataSource.getStashDetails('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', {
				selector: 'refs/stash@{0}',
				baseHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
				untrackedFilesHash: 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'
			});

			// Assert
			expect(result).toStrictEqual({
				commitDetails: {
					hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
					parents: ['a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3', 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'],
					author: 'Test Author',
					authorEmail: 'test-author@mhutchie.com',
					authorDate: 1587559258,
					committer: 'Test Committer',
					committerEmail: 'test-committer@mhutchie.com',
					committerDate: 1587559259,
					signature: null,
					body: 'Commit Message.\nSecond Line.',
					fileChanges: [
						{
							additions: 0,
							deletions: 0,
							newFilePath: 'dir/deleted.txt',
							oldFilePath: 'dir/deleted.txt',
							type: 'D'
						},
						{
							additions: 1,
							deletions: 1,
							newFilePath: 'dir/modified.txt',
							oldFilePath: 'dir/modified.txt',
							type: 'M'
						},
						{
							additions: 2,
							deletions: 3,
							newFilePath: 'dir/renamed-new.txt',
							oldFilePath: 'dir/renamed-old.txt',
							type: 'R'
						},
						{
							additions: 4,
							deletions: 0,
							newFilePath: 'dir/added.txt',
							oldFilePath: 'dir/added.txt',
							type: 'U'
						}
					]
				},
				error: null
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'show', '--quiet', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', '--format=%HXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%PXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%anXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%aeXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%atXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%cnXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%ceXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%ctXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%B'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--name-status', '--find-renames', '--diff-filter=AMDRT', '-z', 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--numstat', '--find-renames', '--diff-filter=AMDRT', '-z', 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff-tree', '--name-status', '-r', '--root', '--find-renames', '--diff-filter=AMDRT', '-z', 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff-tree', '--numstat', '-r', '--root', '--find-renames', '--diff-filter=AMDRT', '-z', 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git (when thrown by git show)', async () => {
			// Setup
			mockGitThrowingErrorOnce();
			mockGitSuccessOnce(['D', 'dir/deleted.txt', 'M', 'dir/modified.txt', 'R100', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));
			mockGitSuccessOnce(['0	0	dir/deleted.txt', '1	1	dir/modified.txt', '2	3	', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));

			// Run
			const result = await dataSource.getStashDetails('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', {
				selector: 'refs/stash@{0}',
				baseHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
				untrackedFilesHash: null
			});

			// Assert
			expect(result).toStrictEqual({
				commitDetails: null,
				error: 'error message'
			});
		});

		it('Should return an error message thrown by git (when thrown by git diff-tree --name-status)', async () => {
			// Setup
			mockGitSuccessOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPba1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest AuthorXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-author@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest CommitterXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-committer@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559259XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message.\r\nSecond Line.');
			mockGitThrowingErrorOnce();
			mockGitSuccessOnce(['0	0	dir/deleted.txt', '1	1	dir/modified.txt', '2	3	', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));

			// Run
			const result = await dataSource.getStashDetails('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', {
				selector: 'refs/stash@{0}',
				baseHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
				untrackedFilesHash: null
			});

			// Assert
			expect(result).toStrictEqual({
				commitDetails: null,
				error: 'error message'
			});
		});

		it('Should return an error message thrown by git (when thrown by git diff-tree --numstat)', async () => {
			// Setup
			mockGitSuccessOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPba1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest AuthorXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-author@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest CommitterXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-committer@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559259XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message.\r\nSecond Line.');
			mockGitSuccessOnce(['D', 'dir/deleted.txt', 'M', 'dir/modified.txt', 'R100', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.getStashDetails('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', {
				selector: 'refs/stash@{0}',
				baseHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
				untrackedFilesHash: null
			});

			// Assert
			expect(result).toStrictEqual({
				commitDetails: null,
				error: 'error message'
			});
		});

		it('Should return an error message thrown by git (when thrown by untracked git diff-tree --name-status)', async () => {
			// Setup
			mockGitSuccessOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPba1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest AuthorXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-author@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest CommitterXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-committer@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559259XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message.\r\nSecond Line.');
			mockGitSuccessOnce(['D', 'dir/deleted.txt', 'M', 'dir/modified.txt', 'R100', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));
			mockGitSuccessOnce(['0	0	dir/deleted.txt', '1	1	dir/modified.txt', '2	3	', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));
			mockGitThrowingErrorOnce();
			mockGitSuccessOnce(['c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', '0	0	dir/other-deleted.txt', '4	0	dir/added.txt', ''].join('\0'));

			// Run
			const result = await dataSource.getStashDetails('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', {
				selector: 'refs/stash@{0}',
				baseHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
				untrackedFilesHash: 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'
			});

			// Assert
			expect(result).toStrictEqual({
				commitDetails: null,
				error: 'error message'
			});
		});

		it('Should return an error message thrown by git (when thrown by untracked git diff-tree --numstat)', async () => {
			// Setup
			mockGitSuccessOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2bXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPba1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest AuthorXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-author@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest CommitterXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest-committer@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559259XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbCommit Message.\r\nSecond Line.');
			mockGitSuccessOnce(['D', 'dir/deleted.txt', 'M', 'dir/modified.txt', 'R100', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));
			mockGitSuccessOnce(['0	0	dir/deleted.txt', '1	1	dir/modified.txt', '2	3	', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));
			mockGitSuccessOnce(['c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', 'D', 'dir/other-deleted.txt', 'A', 'dir/added.txt', ''].join('\0'));
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.getStashDetails('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', {
				selector: 'refs/stash@{0}',
				baseHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
				untrackedFilesHash: 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'
			});

			// Assert
			expect(result).toStrictEqual({
				commitDetails: null,
				error: 'error message'
			});
		});
	});

	describe('getGitDirs', () => {
		it('Should return the absolute paths of the Git directory and the common Git directory', async () => {
			// Setup
			mockGitSuccessOnce('/path/to/main/.git/worktrees/repo\n/path/to/main/.git\n');

			// Run
			const result = await dataSource.getGitDirs('/path/to/repo');

			// Assert
			expect(result).toStrictEqual(['/path/to/main/.git/worktrees/repo', '/path/to/main/.git']);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['rev-parse', '--git-dir', '--git-common-dir'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should resolve relative paths, and remove duplicates', async () => {
			// Setup
			mockGitSuccessOnce('.git\n.git\n');

			// Run
			const result = await dataSource.getGitDirs('/path/to/repo');

			// Assert
			expect(result).toStrictEqual(['/path/to/repo/.git']);
		});

		it('Should return an empty array when an error occurs', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.getGitDirs('/path/to/repo');

			// Assert
			expect(result).toStrictEqual([]);
		});
	});

	describe('getUncommittedDetails', () => {
		it('Should return the uncommitted changes', async () => {
			// Setup
			mockGitSuccessOnce(['D', 'dir/deleted.txt', 'M', 'dir/modified.txt', 'R100', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));
			mockGitSuccessOnce(['0	0	dir/deleted.txt', '1	1	dir/modified.txt', '2	3	', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));
			mockGitSuccessOnce([' D dir/deleted.txt', 'M  dir/modified.txt', 'R  dir/renamed-new.txt', 'dir/renamed-old.txt', '?? untracked.txt'].join('\0'));

			// Run
			const result = await dataSource.getUncommittedDetails('/path/to/repo');

			// Assert
			expect(result).toStrictEqual({
				commitDetails: {
					hash: utils.UNCOMMITTED,
					parents: [],
					author: '',
					authorEmail: '',
					authorDate: 0,
					committer: '',
					committerEmail: '',
					committerDate: 0,
					signature: null,
					body: '',
					fileChanges: [
						{
							additions: 0,
							deletions: 0,
							newFilePath: 'dir/deleted.txt',
							oldFilePath: 'dir/deleted.txt',
							type: 'D'
						},
						{
							additions: 1,
							deletions: 1,
							newFilePath: 'dir/modified.txt',
							oldFilePath: 'dir/modified.txt',
							type: 'M'
						},
						{
							additions: 2,
							deletions: 3,
							newFilePath: 'dir/renamed-new.txt',
							oldFilePath: 'dir/renamed-old.txt',
							type: 'R'
						},
						{
							additions: null,
							deletions: null,
							newFilePath: 'untracked.txt',
							oldFilePath: 'untracked.txt',
							type: 'U'
						}
					]
				},
				error: null
			});
			expect(spyOnSpawn).toBeCalledTimes(3);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--name-status', '--find-renames', '--diff-filter=AMDRT', '-z', 'HEAD'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--numstat', '--find-renames', '--diff-filter=AMDRT', '-z', 'HEAD'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['status', '-s', '--untracked-files=all', '--porcelain', '-z'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should exclude the nested worktrees from the untracked files', async () => {
			// Setup
			mockGitSuccessOnce('');
			mockGitSuccessOnce('');
			mockGitSuccessOnce(['?? nested/', '?? other/', '?? file.txt', ''].join('\0'));
			mockGitSuccessOnce('worktree /path/to/repo\nHEAD 1a2b3c\nbranch refs/heads/main\n\nworktree /path/to/repo/nested\nHEAD 4d5e6f\nbranch refs/heads/feature\n\n');

			// Run
			const result = await dataSource.getUncommittedDetails('/path/to/repo');

			// Assert
			expect(result.commitDetails!.fileChanges.map((fileChange) => fileChange.newFilePath)).toStrictEqual(['other/', 'file.txt']);
			expect(spyOnSpawn).toBeCalledTimes(4);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['worktree', 'list', '--porcelain'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the uncommitted changes (showUntrackedFiles === FALSE)', async () => {
			// Setup
			mockGitSuccessOnce(['D', 'dir/deleted.txt', 'M', 'dir/modified.txt', 'R100', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));
			mockGitSuccessOnce(['0	0	dir/deleted.txt', '1	1	dir/modified.txt', '2	3	', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));
			mockGitSuccessOnce([' D dir/deleted.txt', 'M  dir/modified.txt', 'R  dir/renamed-new.txt', 'dir/renamed-old.txt'].join('\0'));
			vscode.mockExtensionSettingReturnValue('builtin', { 'status.showUntrackedFiles': 'no' });

			// Run
			const result = await dataSource.getUncommittedDetails('/path/to/repo');

			// Assert
			expect(result).toStrictEqual({
				commitDetails: {
					hash: utils.UNCOMMITTED,
					parents: [],
					author: '',
					authorEmail: '',
					authorDate: 0,
					committer: '',
					committerEmail: '',
					committerDate: 0,
					signature: null,
					body: '',
					fileChanges: [
						{
							additions: 0,
							deletions: 0,
							newFilePath: 'dir/deleted.txt',
							oldFilePath: 'dir/deleted.txt',
							type: 'D'
						},
						{
							additions: 1,
							deletions: 1,
							newFilePath: 'dir/modified.txt',
							oldFilePath: 'dir/modified.txt',
							type: 'M'
						},
						{
							additions: 2,
							deletions: 3,
							newFilePath: 'dir/renamed-new.txt',
							oldFilePath: 'dir/renamed-old.txt',
							type: 'R'
						}
					]
				},
				error: null
			});
			expect(spyOnSpawn).toBeCalledTimes(3);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--name-status', '--find-renames', '--diff-filter=AMDRT', '-z', 'HEAD'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--numstat', '--find-renames', '--diff-filter=AMDRT', '-z', 'HEAD'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['status', '-s', '--untracked-files=no', '--porcelain', '-z'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the uncommitted changes (halting invalid git status response)', async () => {
			// Setup
			mockGitSuccessOnce(['M', 'dir/modified.txt', ''].join('\0'));
			mockGitSuccessOnce(['1	1	dir/modified.txt', '1	1	modified.txt', ''].join('\0'));
			mockGitSuccessOnce([' D dir/deleted.txt', ' D ', 'M  dir/modified.txt', '?? untracked.txt'].join('\0'));

			// Run
			const result = await dataSource.getUncommittedDetails('/path/to/repo');

			// Assert
			expect(result).toStrictEqual({
				commitDetails: {
					hash: utils.UNCOMMITTED,
					parents: [],
					author: '',
					authorEmail: '',
					authorDate: 0,
					committer: '',
					committerEmail: '',
					committerDate: 0,
					signature: null,
					body: '',
					fileChanges: [
						{
							additions: 1,
							deletions: 1,
							newFilePath: 'dir/modified.txt',
							oldFilePath: 'dir/modified.txt',
							type: 'M'
						},
						{
							additions: null,
							deletions: null,
							newFilePath: 'dir/deleted.txt',
							oldFilePath: 'dir/deleted.txt',
							type: 'D'
						}
					]
				},
				error: null
			});
		});

		it('Should return an error message thrown by git (when thrown by git diff --name-status)', async () => {
			// Setup
			mockGitThrowingErrorOnce();
			mockGitSuccessOnce(['0	0	dir/deleted.txt', '1	1	dir/modified.txt', '2	3	', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));
			mockGitSuccessOnce([' D dir/deleted.txt', 'M  dir/modified.txt', 'R  dir/renamed-new.txt', 'dir/renamed-old.txt', '?? untracked.txt'].join('\0'));

			// Run
			const result = await dataSource.getUncommittedDetails('/path/to/repo');

			// Assert
			expect(result).toStrictEqual({
				commitDetails: null,
				error: 'error message'
			});
		});

		it('Should return an error message thrown by git (when thrown by git diff --numstat)', async () => {
			// Setup
			mockGitSuccessOnce(['D', 'dir/deleted.txt', 'M', 'dir/modified.txt', 'R100', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));
			mockGitThrowingErrorOnce();
			mockGitSuccessOnce([' D dir/deleted.txt', 'M  dir/modified.txt', 'R  dir/renamed-new.txt', 'dir/renamed-old.txt', '?? untracked.txt'].join('\0'));

			// Run
			const result = await dataSource.getUncommittedDetails('/path/to/repo');

			// Assert
			expect(result).toStrictEqual({
				commitDetails: null,
				error: 'error message'
			});
		});

		it('Should return an error message thrown by git (when thrown by git status)', async () => {
			// Setup
			mockGitSuccessOnce(['D', 'dir/deleted.txt', 'M', 'dir/modified.txt', 'R100', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));
			mockGitSuccessOnce(['0	0	dir/deleted.txt', '1	1	dir/modified.txt', '2	3	', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.getUncommittedDetails('/path/to/repo');

			// Assert
			expect(result).toStrictEqual({
				commitDetails: null,
				error: 'error message'
			});
		});
	});

	describe('getCommitComparison', () => {
		it('Should return the commit comparison (between a commit and the uncommitted changes)', async () => {
			// Setup
			mockGitSuccessOnce(['M', 'dir/modified.txt', 'R051', 'dir/renamed-old.txt', 'dir/renamed-new.txt', 'A', 'added.txt', ''].join('\0'));
			mockGitSuccessOnce(['1	1	dir/modified.txt', '1	2	', 'dir/renamed-old.txt', 'dir/renamed-new.txt', '2	0	added.txt', ''].join('\0'));
			mockGitSuccessOnce(['MM dir/modified.txt', 'A  added.txt', '?? untracked.txt'].join('\0'));

			// Run
			const result = await dataSource.getCommitComparison('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', utils.UNCOMMITTED);

			// Assert
			expect(result).toStrictEqual({
				fileChanges: [
					{
						additions: 1,
						deletions: 1,
						newFilePath: 'dir/modified.txt',
						oldFilePath: 'dir/modified.txt',
						type: 'M'
					},
					{
						additions: 1,
						deletions: 2,
						newFilePath: 'dir/renamed-new.txt',
						oldFilePath: 'dir/renamed-old.txt',
						type: 'R'
					},
					{
						additions: 2,
						deletions: 0,
						newFilePath: 'added.txt',
						oldFilePath: 'added.txt',
						type: 'A'
					},
					{
						additions: null,
						deletions: null,
						newFilePath: 'untracked.txt',
						oldFilePath: 'untracked.txt',
						type: 'U'
					}
				],
				error: null
			});
			expect(spyOnSpawn).toBeCalledTimes(3);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--name-status', '--find-renames', '--diff-filter=AMDRT', '-z', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--numstat', '--find-renames', '--diff-filter=AMDRT', '-z', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['status', '-s', '--untracked-files=all', '--porcelain', '-z'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the commit comparison (between two commits)', async () => {
			// Setup
			mockGitSuccessOnce(['M', 'dir/modified.txt', 'R051', 'dir/renamed-old.txt', 'dir/renamed-new.txt', 'A', 'added.txt', ''].join('\0'));
			mockGitSuccessOnce(['1	1	dir/modified.txt', '1	2	', 'dir/renamed-old.txt', 'dir/renamed-new.txt', '2	0	added.txt', ''].join('\0'));

			// Run
			const result = await dataSource.getCommitComparison('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2');

			// Assert
			expect(result).toStrictEqual({
				fileChanges: [
					{
						additions: 1,
						deletions: 1,
						newFilePath: 'dir/modified.txt',
						oldFilePath: 'dir/modified.txt',
						type: 'M'
					},
					{
						additions: 1,
						deletions: 2,
						newFilePath: 'dir/renamed-new.txt',
						oldFilePath: 'dir/renamed-old.txt',
						type: 'R'
					},
					{
						additions: 2,
						deletions: 0,
						newFilePath: 'added.txt',
						oldFilePath: 'added.txt',
						type: 'A'
					}
				],
				error: null
			});
			expect(spyOnSpawn).toBeCalledTimes(2);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--name-status', '--find-renames', '--diff-filter=AMDRT', '-z', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--numstat', '--find-renames', '--diff-filter=AMDRT', '-z', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git (when thrown by git diff --name-status)', async () => {
			// Setup
			mockGitThrowingErrorOnce();
			mockGitSuccessOnce(['1	1	dir/modified.txt', '1	2	', 'dir/renamed-old.txt', 'dir/renamed-new.txt', '2	0	added.txt', ''].join('\0'));
			mockGitSuccessOnce(['MM dir/modified.txt', 'A  added.txt', '?? untracked.txt'].join('\0'));

			// Run
			const result = await dataSource.getCommitComparison('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', utils.UNCOMMITTED);

			// Assert
			expect(result).toStrictEqual({
				fileChanges: [],
				error: 'error message'
			});
		});

		it('Should return an error message thrown by git (when thrown by git diff --numstat)', async () => {
			// Setup
			mockGitSuccessOnce(['M', 'dir/modified.txt', 'R051', 'dir/renamed-old.txt', 'dir/renamed-new.txt', 'A', 'added.txt', ''].join('\0'));
			mockGitThrowingErrorOnce();
			mockGitSuccessOnce(['MM dir/modified.txt', 'A  added.txt', '?? untracked.txt'].join('\0'));

			// Run
			const result = await dataSource.getCommitComparison('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', utils.UNCOMMITTED);

			// Assert
			expect(result).toStrictEqual({
				fileChanges: [],
				error: 'error message'
			});
		});

		it('Should return an error message thrown by git (when thrown by git status)', async () => {
			// Setup
			mockGitSuccessOnce(['M', 'dir/modified.txt', 'R051', 'dir/renamed-old.txt', 'dir/renamed-new.txt', 'A', 'added.txt', ''].join('\0'));
			mockGitSuccessOnce(['1	1	dir/modified.txt', '1	2	', 'dir/renamed-old.txt', 'dir/renamed-new.txt', '2	0	added.txt', ''].join('\0'));
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.getCommitComparison('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', utils.UNCOMMITTED);

			expect(result).toStrictEqual({
				fileChanges: [],
				error: 'error message'
			});
		});
	});

	describe('getCommitFile', () => {
		it('Should return the file contents', async () => {
			// Setup
			mockGitSuccessOnce('File contents.\n');
			vscode.mockExtensionSettingReturnValue('fileEncoding', 'cp1252');
			const spyOnDecode = vi.spyOn(iconv, 'decode');

			// Run
			const result = await dataSource.getCommitFile('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 'subdirectory/file.txt');

			// Assert
			expect(result.toString()).toBe('File contents.\n');
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['show', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b:subdirectory/file.txt'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('easy-graph', {
				scheme: 'file',
				authority: '',
				path: '/path/to/repo',
				query: '',
				fragment: ''
			});
			expect(spyOnDecode).toBeCalledWith(expect.anything(), 'cp1252');
		});

		it('Should return the file contents (falling back to utf8 if the encoding is unknown)', async () => {
			// Setup
			mockGitSuccessOnce('File contents.\n');
			vscode.mockExtensionSettingReturnValue('fileEncoding', 'xyz');
			const spyOnDecode = vi.spyOn(iconv, 'decode');

			// Run
			const result = await dataSource.getCommitFile('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 'subdirectory/file.txt');

			// Assert
			expect(result.toString()).toBe('File contents.\n');
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['show', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b:subdirectory/file.txt'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('easy-graph', {
				scheme: 'file',
				authority: '',
				path: '/path/to/repo',
				query: '',
				fragment: ''
			});
			expect(spyOnDecode).toBeCalledWith(expect.anything(), 'utf8');
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();
			let errorMessage = null;

			// Run
			await dataSource.getCommitFile('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 'subdirectory/file.txt').catch((error) => errorMessage = error);

			// Assert
			expect(errorMessage).toBe('error message');
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['show', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b:subdirectory/file.txt'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});
	});

	describe('getCommitSubject', () => {
		it('Return the commit subject of a commit', async () => {
			// Setup
			mockGitSuccessOnce('A commit  message.\n');

			// Run
			const result = await dataSource.getCommitSubject('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b');

			// Assert
			expect(result).toBe('A commit message.');
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'log', '--format=%s', '-n', '1', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return NULL when git threw an error', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.getCommitSubject('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b');

			// Assert
			expect(result).toBe(null);
		});
	});

	describe('getRemoteUrl', () => {
		it('Should return the url of the remote', async () => {
			// Setup
			mockGitSuccessOnce('https://github.com/mhutchie/vscode-git-graph.git\n');

			// Run
			const result = await dataSource.getRemoteUrl('/path/to/repo', 'origin');

			// Assert
			expect(result).toBe('https://github.com/mhutchie/vscode-git-graph.git');
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['config', '--get', 'remote.origin.url'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return NULL when git threw an error', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.getRemoteUrl('/path/to/repo', 'origin');

			// Assert
			expect(result).toBe(null);
		});
	});

	describe('getNewPathOfRenamedFile', () => {
		it('Should return the new path of a file that was renamed', async () => {
			// Setup
			mockGitSuccessOnce(['R100', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));

			// Run
			const result = await dataSource.getNewPathOfRenamedFile('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 'dir/renamed-old.txt');

			// Assert
			expect(result).toBe('dir/renamed-new.txt');
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--name-status', '--find-renames', '--diff-filter=R', '-z', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return NULL when a file wasn\'t renamed', async () => {
			// Setup
			mockGitSuccessOnce(['R100', 'dir/renamed-old.txt', 'dir/renamed-new.txt', ''].join('\0'));

			// Run
			const result = await dataSource.getNewPathOfRenamedFile('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 'dir/deleted.txt');

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--name-status', '--find-renames', '--diff-filter=R', '-z', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return NULL when git threw an error', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.getNewPathOfRenamedFile('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 'dir/deleted.txt');

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--name-status', '--find-renames', '--diff-filter=R', '-z', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});
	});

	describe('getRefList', () => {
		it('Should return the branches, remote branches and tags of the repository', async () => {
			// Setup
			mockGitSuccessOnce(
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b HEAD\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/heads/master\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/remotes/origin/HEAD\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/remotes/origin/master\n' +
				'2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c refs/tags/v1.0\n' +
				'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b refs/tags/v1.0^{}\n'
			);

			// Run
			const result = await dataSource.getRefList('/path/to/repo');

			// Assert
			expect(result).toStrictEqual({
				head: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b',
				heads: [{ hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', name: 'master' }],
				tags: [
					{ hash: '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c', name: 'v1.0', annotated: false },
					{ hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', name: 'v1.0', annotated: true }
				],
				remotes: [{ hash: '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', name: 'origin/master' }]
			});
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['show-ref', '-d', '--head'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});
	});

	describe('getTagDetails', () => {
		it('Should return the tag\'s details', async () => {
			// Setup
			onDidChangeGitExecutable.emit({ path: '/path/to/git', version: '1.7.8' });
			mockGitSuccessOnce('79e88e142b378f41dfd1f82d94209a7a411384edXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest TaggerXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb<test@mhutchie.com>XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbsubject1\r\nsubject2\n\nbody1\nbody2\n\n');

			// Run
			const result = await dataSource.getTagDetails('/path/to/repo', 'tag-name');

			// Assert
			expect(result).toStrictEqual({
				details: {
					hash: '79e88e142b378f41dfd1f82d94209a7a411384ed',
					taggerName: 'Test Tagger',
					taggerEmail: 'test@mhutchie.com',
					taggerDate: 1587559258,
					message: 'subject1\nsubject2\n\nbody1\nbody2',
					signature: null
				},
				error: null
			});
			expect(spyOnSpawn).toHaveBeenCalledTimes(1);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['for-each-ref', 'refs/tags/tag-name', '--format=%(objectname)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(taggername)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(taggeremail)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(taggerdate:unix)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(contents:signature)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(contents)'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the tag\'s details (when email isn\'t enclosed by <>)', async () => {
			// Setup
			mockGitSuccessOnce('79e88e142b378f41dfd1f82d94209a7a411384edXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest TaggerXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtest@mhutchie.comXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbtag-message\n');

			// Run
			const result = await dataSource.getTagDetails('/path/to/repo', 'tag-name');

			// Assert
			expect(result).toStrictEqual({
				details: {
					hash: '79e88e142b378f41dfd1f82d94209a7a411384ed',
					taggerName: 'Test Tagger',
					taggerEmail: 'test@mhutchie.com',
					taggerDate: 1587559258,
					message: 'tag-message',
					signature: null
				},
				error: null
			});
			expect(spyOnSpawn).toHaveBeenCalledTimes(1);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['for-each-ref', 'refs/tags/tag-name', '--format=%(objectname)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(taggername)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(taggeremail)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(taggerdate:unix)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(contents:signature)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(contents)'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the tag\'s details (contents contains separator)', async () => {
			// Setup
			mockGitSuccessOnce('79e88e142b378f41dfd1f82d94209a7a411384edXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest TaggerXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb<test@mhutchie.com>XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbsubject1\r\nsubject2\n\nbody1 XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%\nbody2\n\n');

			// Run
			const result = await dataSource.getTagDetails('/path/to/repo', 'tag-name');

			// Assert
			expect(result).toStrictEqual({
				details: {
					hash: '79e88e142b378f41dfd1f82d94209a7a411384ed',
					taggerName: 'Test Tagger',
					taggerEmail: 'test@mhutchie.com',
					taggerDate: 1587559258,
					message: 'subject1\nsubject2\n\nbody1 XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%\nbody2',
					signature: null
				},
				error: null
			});
			expect(spyOnSpawn).toHaveBeenCalledTimes(1);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['for-each-ref', 'refs/tags/tag-name', '--format=%(objectname)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(taggername)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(taggeremail)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(taggerdate:unix)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(contents:signature)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(contents)'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the "Incompatible Git Version" error message when viewing tag details and Git is older than 1.7.8', async () => {
			// Setup
			onDidChangeGitExecutable.emit({ path: '/path/to/git', version: '1.7.7' });

			// Run
			const result = await dataSource.getTagDetails('/path/to/repo', 'tag-name');

			// Assert
			expect(result).toStrictEqual({
				details: null,
				error: 'A newer version of Git (>= 1.7.8) is required for retrieving Tag Details. Git 1.7.7 is currently installed. Please install a newer version of Git to use this feature.'
			});
			expect(spyOnSpawn).toHaveBeenCalledTimes(0);
		});

		it('Should return the "Unable to Find Git" error message when no Git executable is known', async () => {
			// Setup
			dataSource.dispose();
			dataSource = new DataSource(null, onDidChangeConfiguration.subscribe, onDidChangeGitExecutable.subscribe, logger);

			// Run
			const result = await dataSource.getTagDetails('/path/to/repo', 'tag-name');

			// Assert
			expect(result).toStrictEqual({
				details: null,
				error: 'Unable to find a Git executable. Either: Set the Visual Studio Code Setting "git.path" to the path and filename of an existing Git executable, or install Git and restart Visual Studio Code.'
			});
			expect(spyOnSpawn).toHaveBeenCalledTimes(0);
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.getTagDetails('/path/to/repo', 'tag-name');

			// Assert
			expect(result).toStrictEqual({
				details: null,
				error: 'error message'
			});
			expect(spyOnSpawn).toHaveBeenCalledTimes(1);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['for-each-ref', 'refs/tags/tag-name', '--format=%(objectname)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(taggername)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(taggeremail)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(taggerdate:unix)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(contents:signature)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(contents)'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		describe('getTagSignature', () => {
			const testParsingGpgStatus = (signatureRecord: string, trustLevel: string, expected: GitSignature) => async () => {
				// Setup
				mockGitSuccessOnce('79e88e142b378f41dfd1f82d94209a7a411384edXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest TaggerXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb<test@mhutchie.com>XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb-----BEGIN PGP SIGNATURE-----\n\n-----END PGP SIGNATURE-----\nXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbsubject1\r\nsubject2\n\nbody1\nbody2\n-----BEGIN PGP SIGNATURE-----\n\n-----END PGP SIGNATURE-----\n\n');
				mockGitSuccessOnce('', '[GNUPG:] NEWSIG\r\n[GNUPG:] KEY_CONSIDERED ABCDEF1234567890ABCDEF1234567890ABCDEF12 0\r\n[GNUPG:] SIG_ID abcdefghijklmnopqrstuvwxyza 2021-04-10 1618040201\r\n[GNUPG:] KEY_CONSIDERED ABCDEF1234567890ABCDEF1234567890ABCDEF12 0\r\n' + signatureRecord + '[GNUPG:] VALIDSIG ABCDEF1234567890ABCDEF1234567890ABCDEF12 2021-04-10 1618040201 0 4 0 1 8 00 ABCDEF1234567890ABCDEF1234567890ABCDEF12\r\n[GNUPG:] KEY_CONSIDERED ABCDEF1234567890ABCDEF1234567890ABCDEF12 0\r\n[GNUPG:] ' + trustLevel + ' 0 pgp\r\n[GNUPG:] VERIFICATION_COMPLIANCE_MODE 23\r\n');

				// Run
				const result = await dataSource.getTagDetails('/path/to/repo', 'tag-name');

				// Assert
				expect(result).toStrictEqual({
					details: {
						hash: '79e88e142b378f41dfd1f82d94209a7a411384ed',
						taggerName: 'Test Tagger',
						taggerEmail: 'test@mhutchie.com',
						taggerDate: 1587559258,
						message: 'subject1\nsubject2\n\nbody1\nbody2',
						signature: expected
					},
					error: null
				});
				expect(spyOnSpawn).toHaveBeenCalledTimes(2);
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['for-each-ref', 'refs/tags/tag-name', '--format=%(objectname)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(taggername)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(taggeremail)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(taggerdate:unix)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(contents:signature)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(contents)'], expect.objectContaining({ cwd: '/path/to/repo' }));
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['verify-tag', '--raw', 'refs/tags/tag-name'], expect.objectContaining({ cwd: '/path/to/repo' }));
			};

			it('Should parse and return a GOODSIG', testParsingGpgStatus('[GNUPG:] GOODSIG 1234567890ABCDEF Tagger Name <tagger@mhutchie.com>\n', 'TRUST_ULTIMATE', {
				key: '1234567890ABCDEF',
				signer: 'Tagger Name <tagger@mhutchie.com>',
				status: GitSignatureStatus.GoodAndValid
			}));

			it('Should parse and return a BADSIG', testParsingGpgStatus('[GNUPG:] BADSIG 1234567890ABCDEF Tagger Name <tagger@mhutchie.com>\n', 'TRUST_ULTIMATE', {
				key: '1234567890ABCDEF',
				signer: 'Tagger Name <tagger@mhutchie.com>',
				status: GitSignatureStatus.Bad
			}));

			it('Should parse and return an ERRSIG', testParsingGpgStatus('[GNUPG:] ERRSIG 1234567890ABCDEF 0 1 2 3 4\n', 'TRUST_ULTIMATE', {
				key: '1234567890ABCDEF',
				signer: '',
				status: GitSignatureStatus.CannotBeChecked
			}));

			it('Should parse and return an EXPSIG', testParsingGpgStatus('[GNUPG:] EXPSIG 1234567890ABCDEF Tagger Name <tagger@mhutchie.com>\n', 'TRUST_ULTIMATE', {
				key: '1234567890ABCDEF',
				signer: 'Tagger Name <tagger@mhutchie.com>',
				status: GitSignatureStatus.GoodButExpired
			}));

			it('Should parse and return an EXPKEYSIG', testParsingGpgStatus('[GNUPG:] EXPKEYSIG 1234567890ABCDEF Tagger Name <tagger@mhutchie.com>\n', 'TRUST_ULTIMATE', {
				key: '1234567890ABCDEF',
				signer: 'Tagger Name <tagger@mhutchie.com>',
				status: GitSignatureStatus.GoodButMadeByExpiredKey
			}));

			it('Should parse and return a REVKEYSIG', testParsingGpgStatus('[GNUPG:] REVKEYSIG 1234567890ABCDEF Tagger Name <tagger@mhutchie.com>\n', 'TRUST_ULTIMATE', {
				key: '1234567890ABCDEF',
				signer: 'Tagger Name <tagger@mhutchie.com>',
				status: GitSignatureStatus.GoodButMadeByRevokedKey
			}));

			it('Should parse TRUST_UNDEFINED, and apply it to a GOODSIG', testParsingGpgStatus('[GNUPG:] GOODSIG 1234567890ABCDEF Tagger Name <tagger@mhutchie.com>\n', 'TRUST_UNDEFINED', {
				key: '1234567890ABCDEF',
				signer: 'Tagger Name <tagger@mhutchie.com>',
				status: GitSignatureStatus.GoodWithUnknownValidity
			}));

			it('Should parse TRUST_NEVER, and apply it to a GOODSIG', testParsingGpgStatus('[GNUPG:] GOODSIG 1234567890ABCDEF Tagger Name <tagger@mhutchie.com>\n', 'TRUST_NEVER', {
				key: '1234567890ABCDEF',
				signer: 'Tagger Name <tagger@mhutchie.com>',
				status: GitSignatureStatus.GoodWithUnknownValidity
			}));

			it('Should parse TRUST_UNDEFINED, and NOT apply it to a BADSIG', testParsingGpgStatus('[GNUPG:] BADSIG 1234567890ABCDEF Tagger Name <tagger@mhutchie.com>\n', 'TRUST_UNDEFINED', {
				key: '1234567890ABCDEF',
				signer: 'Tagger Name <tagger@mhutchie.com>',
				status: GitSignatureStatus.Bad
			}));

			it('Should return a signature with status GitSignatureStatus.CannotBeChecked when no signature can be parsed', testParsingGpgStatus('', 'TRUST_ULTIMATE', {
				key: '',
				signer: '',
				status: GitSignatureStatus.CannotBeChecked
			}));

			it('Should return a signature with status GitSignatureStatus.CannotBeChecked when multiple exclusive statuses exist', testParsingGpgStatus(
				'[GNUPG:] GOODSIG 1234567890ABCDEF Tagger Name <tagger@mhutchie.com>\n[GNUPG:] BADSIG 1234567890ABCDEF Tagger Name <tagger@mhutchie.com>\n',
				'TRUST_ULTIMATE',
				{
					key: '',
					signer: '',
					status: GitSignatureStatus.CannotBeChecked
				}
			));

			it('Should ignore records that don\'t start with "[GNUPG:]"', testParsingGpgStatus(
				'[XYZ] GOODSIG 1234567890ABCDEF Tagger Name <tagger@mhutchie.com>\n[GNUPG:] BADSIG 1234567890ABCDEF Tagger Name <tagger@mhutchie.com>\n',
				'TRUST_ULTIMATE',
				{
					key: '1234567890ABCDEF',
					signer: 'Tagger Name <tagger@mhutchie.com>',
					status: GitSignatureStatus.Bad
				}
			));

			it('Should parse signatures from stdout when there is not content on stderr (for compatibility - normally output is on stderr)', async () => {
				// Setup
				mockGitSuccessOnce('79e88e142b378f41dfd1f82d94209a7a411384edXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest TaggerXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb<test@mhutchie.com>XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb-----BEGIN PGP SIGNATURE-----\n\n-----END PGP SIGNATURE-----\nXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbsubject1\r\nsubject2\n\nbody1\nbody2\n-----BEGIN PGP SIGNATURE-----\n\n-----END PGP SIGNATURE-----\n\n');
				mockGitSuccessOnce('[GNUPG:] NEWSIG\r\n[GNUPG:] KEY_CONSIDERED ABCDEF1234567890ABCDEF1234567890ABCDEF12 0\r\n[GNUPG:] SIG_ID abcdefghijklmnopqrstuvwxyza 2021-04-10 1618040201\r\n[GNUPG:] KEY_CONSIDERED ABCDEF1234567890ABCDEF1234567890ABCDEF12 0\r\n[GNUPG:] GOODSIG 1234567890ABCDEF Tagger Name <tagger@mhutchie.com>\r\n[GNUPG:] VALIDSIG ABCDEF1234567890ABCDEF1234567890ABCDEF12 2021-04-10 1618040201 0 4 0 1 8 00 ABCDEF1234567890ABCDEF1234567890ABCDEF12\r\n[GNUPG:] KEY_CONSIDERED ABCDEF1234567890ABCDEF1234567890ABCDEF12 0\r\n[GNUPG:] TRUST_ULTIMATE 0 pgp\r\n[GNUPG:] VERIFICATION_COMPLIANCE_MODE 23\r\n');

				// Run
				const result = await dataSource.getTagDetails('/path/to/repo', 'tag-name');

				// Assert
				expect(result).toStrictEqual({
					details: {
						hash: '79e88e142b378f41dfd1f82d94209a7a411384ed',
						taggerName: 'Test Tagger',
						taggerEmail: 'test@mhutchie.com',
						taggerDate: 1587559258,
						message: 'subject1\nsubject2\n\nbody1\nbody2',
						signature: {
							key: '1234567890ABCDEF',
							signer: 'Tagger Name <tagger@mhutchie.com>',
							status: GitSignatureStatus.GoodAndValid
						}
					},
					error: null
				});
				expect(spyOnSpawn).toHaveBeenCalledTimes(2);
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['for-each-ref', 'refs/tags/tag-name', '--format=%(objectname)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(taggername)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(taggeremail)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(taggerdate:unix)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(contents:signature)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(contents)'], expect.objectContaining({ cwd: '/path/to/repo' }));
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['verify-tag', '--raw', 'refs/tags/tag-name'], expect.objectContaining({ cwd: '/path/to/repo' }));
			});

			it('Should parse signatures from stderr, when both stdout & stderr have content (for compatibility - normally output is on stderr)', async () => {
				// Setup
				mockGitSuccessOnce('79e88e142b378f41dfd1f82d94209a7a411384edXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest TaggerXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb<test@mhutchie.com>XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb-----BEGIN PGP SIGNATURE-----\n\n-----END PGP SIGNATURE-----\nXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbsubject1\r\nsubject2\n\nbody1\nbody2\n-----BEGIN PGP SIGNATURE-----\n\n-----END PGP SIGNATURE-----\n\n');
				mockGitSuccessOnce(
					'[GNUPG:] NEWSIG\r\n[GNUPG:] KEY_CONSIDERED ABCDEF1234567890ABCDEF1234567890ABCDEF12 0\r\n[GNUPG:] SIG_ID abcdefghijklmnopqrstuvwxyza 2021-04-10 1618040201\r\n[GNUPG:] KEY_CONSIDERED ABCDEF1234567890ABCDEF1234567890ABCDEF12 0\r\n[GNUPG:] GOODSIG 1234567890ABCDEF Tagger Name <tagger@mhutchie.com>\r\n[GNUPG:] VALIDSIG ABCDEF1234567890ABCDEF1234567890ABCDEF12 2021-04-10 1618040201 0 4 0 1 8 00 ABCDEF1234567890ABCDEF1234567890ABCDEF12\r\n[GNUPG:] KEY_CONSIDERED ABCDEF1234567890ABCDEF1234567890ABCDEF12 0\r\n[GNUPG:] TRUST_ULTIMATE 0 pgp\r\n[GNUPG:] VERIFICATION_COMPLIANCE_MODE 23\r\n',
					'[GNUPG:] NEWSIG\r\n[GNUPG:] KEY_CONSIDERED ABCDEF1234567890ABCDEF1234567890ABCDEF12 0\r\n[GNUPG:] SIG_ID abcdefghijklmnopqrstuvwxyza 2021-04-10 1618040201\r\n[GNUPG:] KEY_CONSIDERED ABCDEF1234567890ABCDEF1234567890ABCDEF12 0\r\n[GNUPG:] BADSIG 1234567890ABCDEF Tagger Name <tagger@mhutchie.com>\r\n[GNUPG:] VALIDSIG ABCDEF1234567890ABCDEF1234567890ABCDEF12 2021-04-10 1618040201 0 4 0 1 8 00 ABCDEF1234567890ABCDEF1234567890ABCDEF12\r\n[GNUPG:] KEY_CONSIDERED ABCDEF1234567890ABCDEF1234567890ABCDEF12 0\r\n[GNUPG:] TRUST_ULTIMATE 0 pgp\r\n[GNUPG:] VERIFICATION_COMPLIANCE_MODE 23\r\n'
				);

				// Run
				const result = await dataSource.getTagDetails('/path/to/repo', 'tag-name');

				// Assert
				expect(result).toStrictEqual({
					details: {
						hash: '79e88e142b378f41dfd1f82d94209a7a411384ed',
						taggerName: 'Test Tagger',
						taggerEmail: 'test@mhutchie.com',
						taggerDate: 1587559258,
						message: 'subject1\nsubject2\n\nbody1\nbody2',
						signature: {
							key: '1234567890ABCDEF',
							signer: 'Tagger Name <tagger@mhutchie.com>',
							status: GitSignatureStatus.Bad
						}
					},
					error: null
				});
				expect(spyOnSpawn).toHaveBeenCalledTimes(2);
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['for-each-ref', 'refs/tags/tag-name', '--format=%(objectname)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(taggername)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(taggeremail)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(taggerdate:unix)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(contents:signature)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(contents)'], expect.objectContaining({ cwd: '/path/to/repo' }));
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['verify-tag', '--raw', 'refs/tags/tag-name'], expect.objectContaining({ cwd: '/path/to/repo' }));
			});

			it('Should ignore the Git exit code when parsing signatures', async () => {
				// Setup
				mockGitSuccessOnce('79e88e142b378f41dfd1f82d94209a7a411384edXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbTest TaggerXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb<test@mhutchie.com>XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb1587559258XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb-----BEGIN PGP SIGNATURE-----\n\n-----END PGP SIGNATURE-----\nXX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPbsubject1\r\nsubject2\n\nbody1\nbody2\n-----BEGIN PGP SIGNATURE-----\n\n-----END PGP SIGNATURE-----\n\n');
				mockGitThrowingErrorOnce('[GNUPG:] BADSIG 1234567890ABCDEF Tagger Name <tagger@mhutchie.com>');

				// Run
				const result = await dataSource.getTagDetails('/path/to/repo', 'tag-name');

				// Assert
				expect(result).toStrictEqual({
					details: {
						hash: '79e88e142b378f41dfd1f82d94209a7a411384ed',
						taggerName: 'Test Tagger',
						taggerEmail: 'test@mhutchie.com',
						taggerDate: 1587559258,
						message: 'subject1\nsubject2\n\nbody1\nbody2',
						signature: {
							key: '1234567890ABCDEF',
							signer: 'Tagger Name <tagger@mhutchie.com>',
							status: GitSignatureStatus.Bad
						}
					},
					error: null
				});
				expect(spyOnSpawn).toHaveBeenCalledTimes(2);
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['for-each-ref', 'refs/tags/tag-name', '--format=%(objectname)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(taggername)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(taggeremail)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(taggerdate:unix)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(contents:signature)XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb%(contents)'], expect.objectContaining({ cwd: '/path/to/repo' }));
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['verify-tag', '--raw', 'refs/tags/tag-name'], expect.objectContaining({ cwd: '/path/to/repo' }));
			});
		});
	});

	describe('getSubmodules', () => {
		let platform: NodeJS.Platform;
		beforeEach(() => {
			platform = process.platform;
			Object.defineProperty(process, 'platform', { value: 'not-windows' });
		});
		afterEach(() => {
			Object.defineProperty(process, 'platform', { value: platform });
		});

		it('Should return no submodules if no .gitmodules file exists', async () => {
			// Setup
			const spyOnReadFile = vi.spyOn(fs, 'readFile');
			spyOnReadFile.mockImplementationOnce((...args) => ((args as unknown) as [fs.PathLike, any, (err: NodeJS.ErrnoException | null, data: Buffer) => void])[2](new Error(), Buffer.alloc(0)));

			// Run
			const result = await dataSource.getSubmodules('/path/to/repo');

			// Assert
			expect(result).toStrictEqual([]);
			const [path, options] = spyOnReadFile.mock.calls[0];
			expect(utils.getPathFromStr(path as string)).toBe('/path/to/repo/.gitmodules');
			expect(options).toStrictEqual({ encoding: 'utf8' });
		});

		it('Should return the submodules when a .gitmodules file exists', async () => {
			// Setup
			const spyOnReadFile = vi.spyOn(fs, 'readFile');
			spyOnReadFile.mockImplementationOnce((...args) => ((args as unknown) as [fs.PathLike, any, (err: NodeJS.ErrnoException | null, data: string) => void])[2](null,
				'[submodule "folder/vscode-git-graph-1"]\n' +
				'	path = folder/vscode-git-graph-1\n' +
				'	url = https://github.com/mhutchie/vscode-git-graph\n' +
				'[submodule "folder/vscode-git-graph-2"]\n' +
				'	path = folder/vscode-git-graph-2\n' +
				'	url = https://github.com/mhutchie/vscode-git-graph\n' +
				'[submodule "folder/vscode-git-graph-3"]\n' +
				'	path = folder/vscode-git-graph-3\n' +
				'	url = https://github.com/mhutchie/vscode-git-graph\n'
			));
			mockGitSuccessOnce('/path/to/repo/folder/vscode-git-graph-1');
			mockGitSuccessOnce('/path/to/repo/folder/vscode-git-graph-2');
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.getSubmodules('/path/to/repo');

			// Assert
			expect(result).toStrictEqual(['/path/to/repo/folder/vscode-git-graph-1', '/path/to/repo/folder/vscode-git-graph-2']);
			const [path, options] = spyOnReadFile.mock.calls[0];
			expect(utils.getPathFromStr(path as string)).toBe('/path/to/repo/.gitmodules');
			expect(options).toStrictEqual({ encoding: 'utf8' });
		});
	});

	describe('repoRoot', () => {
		let platform: NodeJS.Platform;
		beforeEach(() => {
			platform = process.platform;
			Object.defineProperty(process, 'platform', { value: 'not-windows' });
		});
		afterEach(() => {
			Object.defineProperty(process, 'platform', { value: platform });
		});

		it('Should return the same directory when called from the root of the repository', async () => {
			// Setup
			mockGitSuccessOnce('/path/to/repo/root');

			// Run
			const result = await dataSource.repoRoot('/path/to/repo/root');

			// Assert
			expect(result).toBe('/path/to/repo/root');
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['rev-parse', '--show-toplevel'], expect.objectContaining({ cwd: '/path/to/repo/root' }));
		});

		it('Should return the same directory when called from the a path resolving to the root of the repository', async () => {
			// Setup
			mockGitSuccessOnce('/path/to/repo/root');
			vi.spyOn(utils, 'realpath').mockResolvedValueOnce('/path/to/repo/root');

			// Run
			const result = await dataSource.repoRoot('/path/to/symbolic-repo/root');

			// Assert
			expect(result).toBe('/path/to/symbolic-repo/root');
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['rev-parse', '--show-toplevel'], expect.objectContaining({ cwd: '/path/to/symbolic-repo/root' }));
		});

		it('Should return the root directory when called from a subdirectory of the repository', async () => {
			// Setup
			mockGitSuccessOnce('/path/to/repo/root');

			// Run
			const result = await dataSource.repoRoot('/path/to/repo/root/subdirectory');

			// Assert
			expect(result).toBe('/path/to/repo/root');
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['rev-parse', '--show-toplevel'], expect.objectContaining({ cwd: '/path/to/repo/root/subdirectory' }));
		});

		it('Should return the symbolic directory when called from a subdirectory of the repository', async () => {
			// Setup
			mockGitSuccessOnce('/path/to/repo/root');
			vi.spyOn(utils, 'realpath').mockResolvedValueOnce('/path/to/repo/root/subdirectory').mockResolvedValueOnce('/path/to/repo/root');

			// Run
			const result = await dataSource.repoRoot('/path/to/symbolic-repo/root/subdirectory');

			// Assert
			expect(result).toBe('/path/to/symbolic-repo/root');
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['rev-parse', '--show-toplevel'], expect.objectContaining({ cwd: '/path/to/symbolic-repo/root/subdirectory' }));
		});

		it('Should return the canonical root directory when failed to find match', async () => {
			// Setup
			mockGitSuccessOnce('/other-path');
			vi.spyOn(utils, 'realpath').mockResolvedValueOnce('/another-path');

			// Run
			const result = await dataSource.repoRoot('/path');

			// Assert
			expect(result).toBe('/other-path');
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['rev-parse', '--show-toplevel'], expect.objectContaining({ cwd: '/path' }));
		});

		describe('Windows Mapped Network Drive Resolution', () => {
			it('Should not alter non-network share drives', async () => {
				// Setup
				mockGitSuccessOnce('c:/path/to/repo/root');
				Object.defineProperty(process, 'platform', { value: 'win32' });
				const spyOnRealpath = vi.spyOn(utils, 'realpath');

				// Run
				const result = await dataSource.repoRoot('c:/path/to/repo/root');

				// Assert
				expect(result).toBe('c:/path/to/repo/root');
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['rev-parse', '--show-toplevel'], expect.objectContaining({ cwd: 'c:/path/to/repo/root' }));
				expect(spyOnRealpath).toHaveBeenCalledTimes(0);
			});

			it('Should resolve the UNC Path Prefix of a path on a network share', async () => {
				// Setup
				mockGitSuccessOnce('//network/drive/path/to/repo/root');
				Object.defineProperty(process, 'platform', { value: 'win32' });
				const spyOnRealpath = vi.spyOn(utils, 'realpath');
				spyOnRealpath.mockResolvedValueOnce('//network/drive/');

				// Run
				const result = await dataSource.repoRoot('a:/path/to/repo/root');

				// Assert
				expect(result).toBe('a:/path/to/repo/root');
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['rev-parse', '--show-toplevel'], expect.objectContaining({ cwd: 'a:/path/to/repo/root' }));
				expect(spyOnRealpath).toBeCalledWith('a:/', true);
			});

			it('Should resolve the UNC Path Prefix of a path on a network share (when native realpath doesn\'t return a trailing slash)', async () => {
				// Setup
				mockGitSuccessOnce('//network/drive/path/to/repo/root');
				Object.defineProperty(process, 'platform', { value: 'win32' });
				const spyOnRealpath = vi.spyOn(utils, 'realpath');
				spyOnRealpath.mockResolvedValueOnce('//network/drive');

				// Run
				const result = await dataSource.repoRoot('a:/path/to/repo/root');

				// Assert
				expect(result).toBe('a:/path/to/repo/root');
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['rev-parse', '--show-toplevel'], expect.objectContaining({ cwd: 'a:/path/to/repo/root' }));
				expect(spyOnRealpath).toBeCalledWith('a:/', true);
			});

			it('Should not adjust the path if the native realpath can\'t resolve the Mapped Network Drive Letter', async () => {
				// Setup
				mockGitSuccessOnce('//network/drive/path/to/repo/root');
				Object.defineProperty(process, 'platform', { value: 'win32' });
				const spyOnRealpath = vi.spyOn(utils, 'realpath');
				spyOnRealpath.mockResolvedValueOnce('a:/');

				// Run
				const result = await dataSource.repoRoot('a:/path/to/repo/root');

				// Assert
				expect(result).toBe('//network/drive/path/to/repo/root');
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['rev-parse', '--show-toplevel'], expect.objectContaining({ cwd: 'a:/path/to/repo/root' }));
				expect(spyOnRealpath).toBeCalledWith('a:/', true);
			});

			it('Should not adjust the path if the native realpath resolves the Mapped Network Drive Letter to a different UNC Path Prefix', async () => {
				// Setup
				mockGitSuccessOnce('//network/drive/path/to/repo/root');
				Object.defineProperty(process, 'platform', { value: 'win32' });
				const spyOnRealpath = vi.spyOn(utils, 'realpath');
				spyOnRealpath.mockResolvedValueOnce('//other/network/drive/');

				// Run
				const result = await dataSource.repoRoot('a:/path/to/repo/root');

				// Assert
				expect(result).toBe('//network/drive/path/to/repo/root');
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['rev-parse', '--show-toplevel'], expect.objectContaining({ cwd: 'a:/path/to/repo/root' }));
				expect(spyOnRealpath).toBeCalledWith('a:/', true);
			});
		});

		it('Should return NULL when git threw an error', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.repoRoot('/path/to/repo/root');

			// Assert
			expect(result).toBe(null);
		});
	});

	describe('addRemote', () => {
		it('Should add a remote', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.addRemote('/path/to/repo', 'origin', 'https://github.com/mhutchie/vscode-git-graph.git', null, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledTimes(1);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['remote', 'add', 'origin', 'https://github.com/mhutchie/vscode-git-graph.git'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should add a remote (with a push url)', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.addRemote('/path/to/repo', 'origin', 'https://github.com/mhutchie/vscode-git-graph.git', 'https://github.com/mhutchie/vscode-git-graph.git', false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledTimes(2);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['remote', 'add', 'origin', 'https://github.com/mhutchie/vscode-git-graph.git'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['remote', 'set-url', 'origin', '--push', 'https://github.com/mhutchie/vscode-git-graph.git'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should add and fetch a remote', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.addRemote('/path/to/repo', 'origin', 'https://github.com/mhutchie/vscode-git-graph.git', null, true);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledTimes(2);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['remote', 'add', 'origin', 'https://github.com/mhutchie/vscode-git-graph.git'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['fetch', 'origin'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git (when adding the remote)', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.addRemote('/path/to/repo', 'origin', 'https://github.com/mhutchie/vscode-git-graph.git', null, false);

			// Assert
			expect(result).toBe('error message');
		});

		it('Should return an error message thrown by git (when adding the push url)', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.addRemote('/path/to/repo', 'origin', 'https://github.com/mhutchie/vscode-git-graph.git', 'https://github.com/mhutchie/vscode-git-graph.git', true);

			// Assert
			expect(result).toBe('error message');
			expect(spyOnSpawn).toBeCalledTimes(2);
		});
	});

	describe('deleteRemote', () => {
		it('Should delete a remote', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.deleteRemote('/path/to/repo', 'origin');

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['remote', 'remove', 'origin'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.deleteRemote('/path/to/repo', 'origin');

			// Assert
			expect(result).toBe('error message');
		});
	});

	describe('editRemote', () => {
		it('Should rename a remote', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.editRemote('/path/to/repo', 'old-origin', 'new-origin', '', '', null, null);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['remote', 'rename', 'old-origin', 'new-origin'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should delete the url of a remote', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.editRemote('/path/to/repo', 'origin', 'origin', 'https://github.com/mhutchie/vscode-git-graph.git', null, null, null);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['remote', 'set-url', 'origin', '--delete', 'https://github.com/mhutchie/vscode-git-graph.git'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should add a url to the remote', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.editRemote('/path/to/repo', 'origin', 'origin', null, 'https://github.com/mhutchie/vscode-git-graph.git', null, null);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['remote', 'set-url', 'origin', '--add', 'https://github.com/mhutchie/vscode-git-graph.git'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should update the url of a the remote', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.editRemote('/path/to/repo', 'origin', 'origin', 'https://github.com/mhutchie/vscode-git-graph-old.git', 'https://github.com/mhutchie/vscode-git-graph-new.git', null, null);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['remote', 'set-url', 'origin', 'https://github.com/mhutchie/vscode-git-graph-new.git', 'https://github.com/mhutchie/vscode-git-graph-old.git'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should delete the push url of a remote', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.editRemote('/path/to/repo', 'origin', 'origin', null, null, 'https://github.com/mhutchie/vscode-git-graph.git', null);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['remote', 'set-url', '--push', 'origin', '--delete', 'https://github.com/mhutchie/vscode-git-graph.git'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should add a push url to the remote', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.editRemote('/path/to/repo', 'origin', 'origin', null, null, null, 'https://github.com/mhutchie/vscode-git-graph.git');

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['remote', 'set-url', '--push', 'origin', '--add', 'https://github.com/mhutchie/vscode-git-graph.git'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should update the push url of a the remote', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.editRemote('/path/to/repo', 'origin', 'origin', null, null, 'https://github.com/mhutchie/vscode-git-graph-old.git', 'https://github.com/mhutchie/vscode-git-graph-new.git');

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['remote', 'set-url', '--push', 'origin', 'https://github.com/mhutchie/vscode-git-graph-new.git', 'https://github.com/mhutchie/vscode-git-graph-old.git'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git (when renaming a remote)', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.editRemote('/path/to/repo', 'old-origin', 'new-origin', '', '', null, null);

			// Assert
			expect(result).toBe('error message');
		});

		it('Should return an error message thrown by git (when adding a url)', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.editRemote('/path/to/repo', 'origin', 'origin', null, 'https://github.com/mhutchie/vscode-git-graph.git', null, null);

			// Assert
			expect(result).toBe('error message');
		});

		it('Should return an error message thrown by git (when adding a push url)', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.editRemote('/path/to/repo', 'origin', 'origin', null, null, null, 'https://github.com/mhutchie/vscode-git-graph.git');

			// Assert
			expect(result).toBe('error message');
		});
	});

	describe('pruneRemote', () => {
		it('Should prune a remote', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.pruneRemote('/path/to/repo', 'origin');

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['remote', 'prune', 'origin'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.pruneRemote('/path/to/repo', 'origin');

			// Assert
			expect(result).toBe('error message');
		});
	});

	describe('addTag', () => {
		it('Should add a lightweight tag to a commit', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.addTag('/path/to/repo', 'tag-name', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', TagType.Lightweight, '', false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['tag', 'tag-name', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should add an annotated tag to a commit', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.addTag('/path/to/repo', 'tag-name', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', TagType.Annotated, 'message', false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['tag', '-a', 'tag-name', '-m', 'message', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should add a signed tag to a commit', async () => {
			// Setup
			mockGitSuccessOnce();
			vscode.mockExtensionSettingReturnValue('builtin', { 'tag.gpgSign': true });

			// Run
			const result = await dataSource.addTag('/path/to/repo', 'tag-name', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', TagType.Annotated, 'message', false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['tag', '-s', 'tag-name', '-m', 'message', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should force add a tag to a commit', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.addTag('/path/to/repo', 'tag-name', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', TagType.Annotated, 'message', true);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['tag', '-f', '-a', 'tag-name', '-m', 'message', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.addTag('/path/to/repo', 'tag-name', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', TagType.Lightweight, '', false);

			// Assert
			expect(result).toBe('error message');
		});
	});

	describe('deleteTag', () => {
		it('Should delete a tag', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.deleteTag('/path/to/repo', 'tag-name', null);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['tag', '-d', 'tag-name'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should delete a tag (also on a remote)', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.deleteTag('/path/to/repo', 'tag-name', 'origin');

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', 'origin', '--delete', 'refs/tags/tag-name'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['tag', '-d', 'tag-name'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git (when deleting a tag)', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.deleteTag('/path/to/repo', 'tag-name', null);

			// Assert
			expect(result).toBe('error message');
		});

		it('Should return an error message thrown by git (when deleting a tag also on a remote)', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.deleteTag('/path/to/repo', 'tag-name', 'origin');

			// Assert
			expect(result).toBe('error message');
			expect(spyOnSpawn).toBeCalledTimes(1);
		});
	});

	describe('fetch', () => {
		it('Should fetch all remotes without tags', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.fetch('/path/to/repo', null, null, null, true);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['fetch', '--all', '--no-tags'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should fetch all remotes', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.fetch('/path/to/repo', null, null, null);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['fetch', '--all'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should fetch all remotes without pruning when pruning is disabled explicitly', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.fetch('/path/to/repo', null, false, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['fetch', '--all', '--no-prune', '--no-prune-tags'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should fetch all remotes with the overrides in easy-graph.builtin when following them', async () => {
			// Setup
			mockGitSuccessOnce();
			vscode.mockExtensionSettingReturnValue('builtin', { 'fetch.prune': true, 'fetch.tags': false });

			// Run
			const result = await dataSource.fetch('/path/to/repo', null, null, null);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['fetch', '--all', '--no-tags', '--prune'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should fetch a specific remote', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.fetch('/path/to/repo', 'origin', null, null);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['fetch', 'origin'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should fetch and prune all remotes', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.fetch('/path/to/repo', null, true, null);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['fetch', '--all', '--prune'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should fetch and prune all remotes (and prune tags)', async () => {
			// Setup
			onDidChangeGitExecutable.emit({ path: '/path/to/git', version: '2.17.0' });
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.fetch('/path/to/repo', null, true, true);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['fetch', '--all', '--prune', '--prune-tags'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.fetch('/path/to/repo', null, false, false);

			// Assert
			expect(result).toBe('error message');
		});

		it('Should return an error message when pruning tags, but pruning is not enabled (all remotes)', async () => {
			// Setup

			// Run
			const result = await dataSource.fetch('/path/to/repo', null, false, true);

			// Assert
			expect(result).toBe('In order to Prune Tags, pruning must also be enabled when fetching from remote(s).');
		});

		it('Should return an error message when pruning tags, but pruning is not enabled (specific remote)', async () => {
			// Setup

			// Run
			const result = await dataSource.fetch('/path/to/repo', 'origin', false, true);

			// Assert
			expect(result).toBe('In order to Prune Tags, pruning must also be enabled when fetching from a remote.');
		});

		it('Should return an error message when pruning tags when no Git executable is known', async () => {
			// Setup
			dataSource.dispose();
			dataSource = new DataSource(null, onDidChangeConfiguration.subscribe, onDidChangeGitExecutable.subscribe, logger);

			// Run
			const result = await dataSource.fetch('/path/to/repo', null, true, true);

			// Assert
			expect(result).toBe('Unable to find a Git executable. Either: Set the Visual Studio Code Setting "git.path" to the path and filename of an existing Git executable, or install Git and restart Visual Studio Code.');
		});

		it('Should return the "Incompatible Git Version" error message when pruning tags and Git is older than 2.17.0', async () => {
			// Setup
			onDidChangeGitExecutable.emit({ path: '/path/to/git', version: '2.16.1' });

			// Run
			const result = await dataSource.fetch('/path/to/repo', null, true, true);

			// Assert
			expect(result).toBe('A newer version of Git (>= 2.17.0) is required for pruning tags when fetching. Git 2.16.1 is currently installed. Please install a newer version of Git to use this feature.');
		});
	});

	describe('pushBranch', () => {
		it('Should skip the pre-push hook when No Verify is enabled', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.pushBranch('/path/to/repo', 'master', 'origin', true, GitPushBranchMode.ForceWithLease, true);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', '--no-verify', 'origin', 'master', '--set-upstream', '--force-with-lease'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should push a branch to the remote', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.pushBranch('/path/to/repo', 'master', 'origin', false, GitPushBranchMode.Normal, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', 'origin', 'master'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should push a branch to the remote and set upstream', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.pushBranch('/path/to/repo', 'master', 'origin', true, GitPushBranchMode.Normal, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', 'origin', 'master', '--set-upstream'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should force push a branch to the remote', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.pushBranch('/path/to/repo', 'master', 'origin', false, GitPushBranchMode.Force, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', 'origin', 'master', '--force'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should force (with lease) push a branch to the remote', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.pushBranch('/path/to/repo', 'master', 'origin', false, GitPushBranchMode.ForceWithLease, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', 'origin', 'master', '--force-with-lease'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.pushBranch('/path/to/repo', 'master', 'origin', false, GitPushBranchMode.Normal, false);

			// Assert
			expect(result).toBe('error message');
		});
	});

	describe('pushBranchToMultipleRemotes', () => {
		it('Should skip the pre-push hook on every remote when No Verify is enabled', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.pushBranchToMultipleRemotes('/path/to/repo', 'master', ['origin', 'other-origin'], false, GitPushBranchMode.Normal, true);

			// Assert
			expect(result).toStrictEqual([null, null]);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', '--no-verify', 'origin', 'master'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', '--no-verify', 'other-origin', 'master'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should push a branch to one remote', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.pushBranchToMultipleRemotes('/path/to/repo', 'master', ['origin'], false, GitPushBranchMode.Normal, false);

			// Assert
			expect(result).toStrictEqual([null]);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', 'origin', 'master'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should push a branch to multiple remotes', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.pushBranchToMultipleRemotes('/path/to/repo', 'master', ['origin', 'other-origin'], false, GitPushBranchMode.Force, false);

			// Assert
			expect(result).toStrictEqual([null, null]);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', 'origin', 'master', '--force'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', 'other-origin', 'master', '--force'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should push a branch to multiple remotes, stopping if an error occurs', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.pushBranchToMultipleRemotes('/path/to/repo', 'master', ['origin', 'other-origin', 'another-origin'], true, GitPushBranchMode.Normal, false);

			// Assert
			expect(result).toStrictEqual([null, 'error message']);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', 'origin', 'master', '--set-upstream'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', 'other-origin', 'master', '--set-upstream'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error when no remotes are specified', async () => {
			// Run
			const result = await dataSource.pushBranchToMultipleRemotes('/path/to/repo', 'master', [], false, GitPushBranchMode.Normal, false);

			// Assert
			expect(result).toStrictEqual(['No remote(s) were specified to push the branch master to.']);
		});
	});

	describe('pushTag', () => {
		it('Should push a tag to one remote', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.pushTag('/path/to/repo', 'tag-name', ['origin'], '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', true);

			// Assert
			expect(result).toStrictEqual([null]);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', 'origin', 'refs/tags/tag-name'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should force push a tag to one remote', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.pushTag('/path/to/repo', 'tag-name', ['origin'], '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', true, true);

			// Assert
			expect(result).toStrictEqual([null]);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', '--force', 'origin', 'refs/tags/tag-name'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should push a tag to multiple remotes', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.pushTag('/path/to/repo', 'tag-name', ['origin', 'other-origin'], '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', true);

			// Assert
			expect(result).toStrictEqual([null, null]);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', 'origin', 'refs/tags/tag-name'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', 'other-origin', 'refs/tags/tag-name'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		describe('Should check that the commit exists on each remote the tag is being pushed to', () => {
			it('Commit exists on all remotes', async () => {
				// Setup
				mockGitSuccessOnce(
					'  origin/master\n' +
					'  other-origin/master\n'
				);
				mockGitSuccessOnce();
				mockGitSuccessOnce();

				// Run
				const result = await dataSource.pushTag('/path/to/repo', 'tag-name', ['origin', 'other-origin'], '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', false);

				// Assert
				expect(result).toStrictEqual([null, null]);
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['branch', '-r', '--no-color', '--contains=1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', 'origin', 'refs/tags/tag-name'], expect.objectContaining({ cwd: '/path/to/repo' }));
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', 'other-origin', 'refs/tags/tag-name'], expect.objectContaining({ cwd: '/path/to/repo' }));
			});

			it('Commit exists on one remote', async () => {
				// Setup
				mockGitSuccessOnce(
					'  origin/master\n'
				);

				// Run
				const result = await dataSource.pushTag('/path/to/repo', 'tag-name', ['origin', 'other-origin'], '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', false);

				// Assert
				expect(result).toStrictEqual(['VSCODE_GIT_GRAPH:PUSH_TAG:COMMIT_NOT_ON_REMOTE:["other-origin"]']);
				expect(spyOnSpawn).toHaveBeenCalledTimes(1);
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['branch', '-r', '--no-color', '--contains=1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
			});

			it('Commit doesn\'t exist on any remote', async () => {
				// Setup
				mockGitSuccessOnce('');

				// Run
				const result = await dataSource.pushTag('/path/to/repo', 'tag-name', ['origin', 'other-origin'], '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', false);

				// Assert
				expect(result).toStrictEqual(['VSCODE_GIT_GRAPH:PUSH_TAG:COMMIT_NOT_ON_REMOTE:["origin","other-origin"]']);
				expect(spyOnSpawn).toHaveBeenCalledTimes(1);
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['branch', '-r', '--no-color', '--contains=1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
			});

			it('Handles remote branches with symbolic references', async () => {
				// Setup
				mockGitSuccessOnce(
					'  origin/HEAD -> origin/master\n' +
					'  other-origin/master\n'
				);
				mockGitSuccessOnce();
				mockGitSuccessOnce();

				// Run
				const result = await dataSource.pushTag('/path/to/repo', 'tag-name', ['origin', 'other-origin'], '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', false);

				// Assert
				expect(result).toStrictEqual([null, null]);
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['branch', '-r', '--no-color', '--contains=1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', 'origin', 'refs/tags/tag-name'], expect.objectContaining({ cwd: '/path/to/repo' }));
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', 'other-origin', 'refs/tags/tag-name'], expect.objectContaining({ cwd: '/path/to/repo' }));
			});

			it('Handles remote names that contain slashes', async () => {
				// Setup
				mockGitSuccessOnce(
					'  origin/master\n' +
					'  other/origin/master\n'
				);
				mockGitSuccessOnce();
				mockGitSuccessOnce();

				// Run
				const result = await dataSource.pushTag('/path/to/repo', 'tag-name', ['origin', 'other/origin'], '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', false);

				// Assert
				expect(result).toStrictEqual([null, null]);
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['branch', '-r', '--no-color', '--contains=1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', 'origin', 'refs/tags/tag-name'], expect.objectContaining({ cwd: '/path/to/repo' }));
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', 'other/origin', 'refs/tags/tag-name'], expect.objectContaining({ cwd: '/path/to/repo' }));
			});

			it('Ignores records that aren\'t branches in the git branch output', async () => {
				// Setup
				mockGitSuccessOnce(
					'  (invalid branch)\n' +
					'  other-origin/master\n'
				);

				// Run
				const result = await dataSource.pushTag('/path/to/repo', 'tag-name', ['origin', 'other-origin'], '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', false);

				// Assert
				expect(result).toStrictEqual(['VSCODE_GIT_GRAPH:PUSH_TAG:COMMIT_NOT_ON_REMOTE:["origin"]']);
				expect(spyOnSpawn).toHaveBeenCalledTimes(1);
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['branch', '-r', '--no-color', '--contains=1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
			});

			it('Ignores when Git throws an exception', async () => {
				// Setup
				mockGitThrowingErrorOnce();
				mockGitSuccessOnce();
				mockGitSuccessOnce();

				// Run
				const result = await dataSource.pushTag('/path/to/repo', 'tag-name', ['origin', 'other-origin'], '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', false);

				// Assert
				expect(result).toStrictEqual([null, null]);
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['branch', '-r', '--no-color', '--contains=1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', 'origin', 'refs/tags/tag-name'], expect.objectContaining({ cwd: '/path/to/repo' }));
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', 'other-origin', 'refs/tags/tag-name'], expect.objectContaining({ cwd: '/path/to/repo' }));
			});
		});

		it('Should push a tag to multiple remotes, stopping if an error occurs', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.pushTag('/path/to/repo', 'tag-name', ['origin', 'other-origin', 'another-origin'], '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', true);

			// Assert
			expect(result).toStrictEqual([null, 'error message']);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', 'origin', 'refs/tags/tag-name'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', 'other-origin', 'refs/tags/tag-name'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error when no remotes are specified', async () => {
			// Run
			const result = await dataSource.pushTag('/path/to/repo', 'tag-name', [], '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', true);

			// Assert
			expect(result).toStrictEqual(['No remote(s) were specified to push the tag tag-name to.']);
		});
	});

	describe('checkoutBranch', () => {
		it('Should checkout a local branch', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.checkoutBranch('/path/to/repo', 'master', null);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['checkout', 'master'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should checkout a remote branch', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.checkoutBranch('/path/to/repo', 'master', 'origin/master');

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['checkout', '-b', 'master', 'origin/master'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.checkoutBranch('/path/to/repo', 'master', null);

			// Assert
			expect(result).toBe('error message');
		});
	});

	describe('createBranch', () => {
		it('Should create a branch at a commit', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.createBranch('/path/to/repo', 'develop', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', false, false);

			// Assert
			expect(result).toStrictEqual([null]);
			expect(spyOnSpawn).toBeCalledTimes(1);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['branch', 'develop', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should create a branch at a commit, and check it out', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.createBranch('/path/to/repo', 'develop', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', true, false);

			// Assert
			expect(result).toStrictEqual([null]);
			expect(spyOnSpawn).toBeCalledTimes(1);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['checkout', '-b', 'develop', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should force create a branch at a commit', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.createBranch('/path/to/repo', 'develop', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', false, true);

			// Assert
			expect(result).toStrictEqual([null]);
			expect(spyOnSpawn).toBeCalledTimes(1);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['branch', '-f', 'develop', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should force create a branch at a commit, and check it out', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.createBranch('/path/to/repo', 'develop', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', true, true);

			// Assert
			expect(result).toStrictEqual([null, null]);
			expect(spyOnSpawn).toBeCalledTimes(2);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['branch', '-f', 'develop', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['checkout', 'develop'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.createBranch('/path/to/repo', 'develop', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', false, false);

			// Assert
			expect(result).toStrictEqual(['error message']);
		});

		it('Should return an error message thrown by git when creating a branch, and not proceed to check out the force-created branch', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.createBranch('/path/to/repo', 'develop', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', true, true);

			// Assert
			expect(result).toStrictEqual(['error message']);
			expect(spyOnSpawn).toBeCalledTimes(1);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['branch', '-f', 'develop', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git when checking out a force-created branch', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.createBranch('/path/to/repo', 'develop', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', true, true);

			// Assert
			expect(result).toStrictEqual([null, 'error message']);
			expect(spyOnSpawn).toBeCalledTimes(2);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['branch', '-f', 'develop', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['checkout', 'develop'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});
	});

	describe('deleteBranch', () => {
		it('Should delete the branch', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.deleteBranch('/path/to/repo', 'master', false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['branch', '-d', 'master'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should force delete the branch', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.deleteBranch('/path/to/repo', 'master', true);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['branch', '-D', 'master'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.deleteBranch('/path/to/repo', 'master', false);

			// Assert
			expect(result).toBe('error message');
		});
	});

	describe('deleteRemoteBranch', () => {
		it('Should delete the remote branch', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.deleteRemoteBranch('/path/to/repo', 'develop', 'origin');

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', 'origin', '--delete', 'refs/heads/develop'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should delete the remote tracking branch if the branch is no longer on the remote', async () => {
			// Setup
			mockGitThrowingErrorOnce('remote ref does not exist');
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.deleteRemoteBranch('/path/to/repo', 'develop', 'origin');

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', 'origin', '--delete', 'refs/heads/develop'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['branch', '-d', '-r', 'origin/develop'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git (while deleting the branch on the remote)', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.deleteRemoteBranch('/path/to/repo', 'develop', 'origin');

			// Assert
			expect(result).toBe('error message');
		});

		it('Should return an error message thrown by git (while deleting the remote tracking branch)', async () => {
			// Setup
			mockGitThrowingErrorOnce('remote ref does not exist');
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.deleteRemoteBranch('/path/to/repo', 'develop', 'origin');

			// Assert
			expect(result).toBe('Branch does not exist on the remote, deleting the remote tracking branch origin/develop.\nerror message');
		});
	});

	describe('fetchIntoLocalBranch', () => {
		const expectGit = (args: string[]) => expect(spyOnSpawn).toBeCalledWith('/path/to/git', args, expect.objectContaining({ cwd: '/path/to/repo' }));

		it('Should fast-forward a branch that isn\'t checked out by fetching into it', async () => {
			// Setup
			mockGitSuccessOnce('master\n');
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.fetchIntoLocalBranch('/path/to/repo', 'origin', 'master', 'develop', false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledTimes(2);
			expectGit(['symbolic-ref', '--short', '-q', 'HEAD']);
			expectGit(['fetch', 'origin', 'master:develop']);
		});

		it('Should force fetch into a branch that isn\'t checked out', async () => {
			// Setup
			mockGitSuccessOnce('master\n');
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.fetchIntoLocalBranch('/path/to/repo', 'origin', 'refs/heads/main', 'develop', true);

			// Assert
			expect(result).toBe(null);
			expectGit(['fetch', '-f', 'origin', 'refs/heads/main:develop']);
		});

		it('Should fetch into the branch when HEAD is detached', async () => {
			// Setup
			mockGitThrowingErrorOnce();
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.fetchIntoLocalBranch('/path/to/repo', 'origin', 'develop', 'develop', false);

			// Assert
			expect(result).toBe(null);
			expectGit(['fetch', 'origin', 'develop:develop']);
		});

		it('Should only fast-forward the checked out branch, regardless of pull.rebase', async () => {
			// Setup
			mockGitSuccessOnce('develop\n');
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.fetchIntoLocalBranch('/path/to/repo', 'origin', 'refs/heads/feature', 'develop', false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledTimes(2);
			expectGit(['pull', '--no-rebase', '--ff-only', 'origin', 'refs/heads/feature']);
		});

		it('Should reset the checked out branch to the fetched commit (not the remote-tracking branch) when forced', async () => {
			// Setup
			mockGitSuccessOnce('develop\n');
			mockGitSuccessOnce();
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.fetchIntoLocalBranch('/path/to/repo', 'origin', 'refs/heads/feature', 'develop', true);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledTimes(3);
			expectGit(['fetch', 'origin', 'refs/heads/feature']);
			expectGit(['reset', '--keep', 'FETCH_HEAD']);
		});

		it('Should not reset the checked out branch when the fetch fails (e.g. the remote branch was deleted)', async () => {
			// Setup
			mockGitSuccessOnce('develop\n');
			mockGitThrowingErrorOnce('fatal: couldn\'t find remote ref refs/heads/feature');

			// Run
			const result = await dataSource.fetchIntoLocalBranch('/path/to/repo', 'origin', 'refs/heads/feature', 'develop', true);

			// Assert
			expect(result).toBe('fatal: couldn\'t find remote ref refs/heads/feature');
			expect(spyOnSpawn).toBeCalledTimes(2);
		});

		it('Should back up the local branch before a forced update', async () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('repository.backupBeforeDangerousActions', true);
			mockGitSuccessOnce('master\n');
			mockGitSuccessOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b\n');
			mockGitSuccessOnce();
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.fetchIntoLocalBranch('/path/to/repo', 'origin', 'master', 'develop', true);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledTimes(4);
			expect(spyOnSpawn.mock.calls[2][1]).toStrictEqual(['update-ref', expect.stringMatching(/^refs\/easy-graph\/backup\/.+-force-fetch-develop$/), '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b']);
			expectGit(['fetch', '-f', 'origin', 'master:develop']);
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitSuccessOnce('master\n');
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.fetchIntoLocalBranch('/path/to/repo', 'origin', 'master', 'develop', false);

			// Assert
			expect(result).toBe('error message');
		});
	});

	describe('pullBranch', () => {
		it('Should skip the hooks of the merge commit when No Verify is enabled', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.pullBranch('/path/to/repo', 'master', 'origin', true, false, true);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledTimes(1);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['pull', 'origin', 'master', '--no-ff', '--no-verify'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should skip the hooks of the squashed commit (not of the pull) when No Verify is enabled', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitSuccessOnce(':100644 100644 f592752b794040422c9d3b884f15564e6143954b 0000000000000000000000000000000000000000 M      README.md');
			mockGitSuccessOnce();
			vscode.mockExtensionSettingReturnValue('builtin', { 'commit.gpgSign': true });
			vscode.mockExtensionSettingReturnValue('dialog.pullBranch.squashMessageFormat', 'Default');

			// Run
			const result = await dataSource.pullBranch('/path/to/repo', 'master', 'origin', false, true, true);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledTimes(3);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['pull', 'origin', 'master', '--squash', '-S'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['commit', '-S', '--no-verify', '-m', 'Merge branch \'origin/master\''], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should pull a remote branch into the current branch', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.pullBranch('/path/to/repo', 'master', 'origin', false, false, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledTimes(1);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['pull', 'origin', 'master'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should pull a remote branch into the current branch (always creating a new commit)', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.pullBranch('/path/to/repo', 'master', 'origin', true, false, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledTimes(1);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['pull', 'origin', 'master', '--no-ff'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should pull a remote branch into the current branch (signing the new commit)', async () => {
			// Setup
			mockGitSuccessOnce();
			vscode.mockExtensionSettingReturnValue('builtin', { 'commit.gpgSign': true });

			// Run
			const result = await dataSource.pullBranch('/path/to/repo', 'master', 'origin', true, false, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledTimes(1);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['pull', 'origin', 'master', '--no-ff', '-S'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should pull a remote branch into the current branch (squash and staged changes exist)', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitSuccessOnce(':100644 100644 f592752b794040422c9d3b884f15564e6143954b 0000000000000000000000000000000000000000 M      README.md');
			mockGitSuccessOnce();
			vscode.mockExtensionSettingReturnValue('dialog.pullBranch.squashMessageFormat', 'Default');

			// Run
			const result = await dataSource.pullBranch('/path/to/repo', 'master', 'origin', false, true, false);

			// Assert
			expect(result).toBe(null);
			expect(workspaceConfiguration.get).toBeCalledTimes(6);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.pullBranch.squashMessageFormat', expect.anything());
			expect(spyOnSpawn).toBeCalledTimes(3);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['pull', 'origin', 'master', '--squash'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff-index', 'HEAD'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['commit', '-m', 'Merge branch \'origin/master\''], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should pull a remote branch into the current branch (squash and staged changes exist, signing merge commit)', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitSuccessOnce(':100644 100644 f592752b794040422c9d3b884f15564e6143954b 0000000000000000000000000000000000000000 M      README.md');
			mockGitSuccessOnce();
			vscode.mockExtensionSettingReturnValue('builtin', { 'commit.gpgSign': true });
			vscode.mockExtensionSettingReturnValue('dialog.pullBranch.squashMessageFormat', 'Default');

			// Run
			const result = await dataSource.pullBranch('/path/to/repo', 'master', 'origin', false, true, false);

			// Assert
			expect(result).toBe(null);
			expect(workspaceConfiguration.get).toBeCalledTimes(6);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.pullBranch.squashMessageFormat', expect.anything());
			expect(spyOnSpawn).toBeCalledTimes(3);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['pull', 'origin', 'master', '--squash', '-S'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff-index', 'HEAD'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['commit', '-S', '-m', 'Merge branch \'origin/master\''], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should pull a remote branch into the current branch (squash and no staged changes)', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.pullBranch('/path/to/repo', 'master', 'origin', false, true, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledTimes(2);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['pull', 'origin', 'master', '--squash'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff-index', 'HEAD'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should pull a remote branch into the current branch (squash and when diff-index fails)', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.pullBranch('/path/to/repo', 'master', 'origin', false, true, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledTimes(2);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['pull', 'origin', 'master', '--squash'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff-index', 'HEAD'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should pull a remote branch into the current branch (ignore create new commit when squashing)', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitSuccessOnce(':100644 100644 f592752b794040422c9d3b884f15564e6143954b 0000000000000000000000000000000000000000 M      README.md');
			mockGitSuccessOnce();
			vscode.mockExtensionSettingReturnValue('dialog.pullBranch.squashMessageFormat', 'Default');

			// Run
			const result = await dataSource.pullBranch('/path/to/repo', 'master', 'origin', true, true, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledTimes(3);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['pull', 'origin', 'master', '--squash'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff-index', 'HEAD'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['commit', '-m', 'Merge branch \'origin/master\''], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should pull a remote branch into the current branch (squash and staged changes exist, dialog.pullBranch.squashMessageFormat === "Git SQUASH_MSG")', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitSuccessOnce(':100644 100644 f592752b794040422c9d3b884f15564e6143954b 0000000000000000000000000000000000000000 M      README.md');
			mockGitSuccessOnce();
			vscode.mockExtensionSettingReturnValue('dialog.pullBranch.squashMessageFormat', 'Git SQUASH_MSG');

			// Run
			const result = await dataSource.pullBranch('/path/to/repo', 'master', 'origin', false, true, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledTimes(3);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['pull', 'origin', 'master', '--squash'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff-index', 'HEAD'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['commit', '--no-edit'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git (when pull fails)', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.pullBranch('/path/to/repo', 'master', 'origin', false, true, false);

			// Assert
			expect(result).toBe('error message');
			expect(spyOnSpawn).toBeCalledTimes(1);
		});

		it('Should return an error message thrown by git (when commit fails)', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitSuccessOnce(':100644 100644 f592752b794040422c9d3b884f15564e6143954b 0000000000000000000000000000000000000000 M      README.md');
			mockGitThrowingErrorOnce();
			vscode.mockExtensionSettingReturnValue('dialog.pullBranch.squashMessageFormat', 'Default');

			// Run
			const result = await dataSource.pullBranch('/path/to/repo', 'master', 'origin', false, true, false);

			// Assert
			expect(result).toBe('error message');
			expect(spyOnSpawn).toBeCalledTimes(3);
		});
	});

	describe('renameBranch', () => {
		it('Should rename a branch', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.renameBranch('/path/to/repo', 'old-master', 'new-master');

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['branch', '-m', 'old-master', 'new-master'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.renameBranch('/path/to/repo', 'old-master', 'new-master');

			// Assert
			expect(result).toBe('error message');
		});
	});

	describe('merge', () => {
		it('Should skip the hooks of the merge commit when No Verify is enabled', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.merge('/path/to/repo', 'develop', MergeActionOn.Branch, true, false, false, false, true);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledTimes(1);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['merge', 'develop', '--no-ff', '--no-verify'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should skip the hooks of the squashed commit (not of the merge) when No Verify is enabled', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitSuccessOnce(':100644 100644 f592752b794040422c9d3b884f15564e6143954b 0000000000000000000000000000000000000000 M      README.md');
			mockGitSuccessOnce();
			vscode.mockExtensionSettingReturnValue('dialog.merge.squashMessageFormat', 'Default');

			// Run
			const result = await dataSource.merge('/path/to/repo', 'develop', MergeActionOn.Branch, false, false, true, false, true);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledTimes(3);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['merge', 'develop', '--squash'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['commit', '--no-verify', '-m', 'Merge branch \'develop\''], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should ignore No Verify when nothing is committed', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.merge('/path/to/repo', 'develop', MergeActionOn.Branch, false, false, false, true, true);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledTimes(1);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['merge', 'develop', '--no-commit'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should merge a branch into the current branch', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.merge('/path/to/repo', 'develop', MergeActionOn.Branch, false, false, false, false, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledTimes(1);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['merge', 'develop'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should merge a branch into the current branch (always creating a new commit)', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.merge('/path/to/repo', 'develop', MergeActionOn.Branch, true, false, false, false, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledTimes(1);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['merge', 'develop', '--no-ff'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should merge a branch into the current branch (signing the new commit)', async () => {
			// Setup
			mockGitSuccessOnce();
			vscode.mockExtensionSettingReturnValue('builtin', { 'commit.gpgSign': true });

			// Run
			const result = await dataSource.merge('/path/to/repo', 'develop', MergeActionOn.Branch, true, false, false, false, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledTimes(1);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['merge', 'develop', '--no-ff', '-S'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should merge a branch into the current branch (squash and staged changes exist)', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitSuccessOnce(':100644 100644 f592752b794040422c9d3b884f15564e6143954b 0000000000000000000000000000000000000000 M      README.md');
			mockGitSuccessOnce();
			vscode.mockExtensionSettingReturnValue('dialog.merge.squashMessageFormat', 'Default');

			// Run
			const result = await dataSource.merge('/path/to/repo', 'develop', MergeActionOn.Branch, false, false, true, false, false);

			// Assert
			expect(result).toBe(null);
			expect(workspaceConfiguration.get).toBeCalledTimes(6);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.merge.squashMessageFormat', expect.anything());
			expect(spyOnSpawn).toBeCalledTimes(3);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['merge', 'develop', '--squash'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff-index', 'HEAD'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['commit', '-m', 'Merge branch \'develop\''], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should merge a remote-tracking branch into the current branch (squash and staged changes exist)', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitSuccessOnce(':100644 100644 f592752b794040422c9d3b884f15564e6143954b 0000000000000000000000000000000000000000 M      README.md');
			mockGitSuccessOnce();
			vscode.mockExtensionSettingReturnValue('dialog.merge.squashMessageFormat', 'Default');

			// Run
			const result = await dataSource.merge('/path/to/repo', 'origin/develop', MergeActionOn.RemoteTrackingBranch, false, false, true, false, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledTimes(3);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['merge', 'origin/develop', '--squash'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff-index', 'HEAD'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['commit', '-m', 'Merge remote-tracking branch \'origin/develop\''], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should merge a commit into the current branch (squash and staged changes exist)', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitSuccessOnce(':100644 100644 1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b 0000000000000000000000000000000000000000 M      README.md');
			mockGitSuccessOnce();
			vscode.mockExtensionSettingReturnValue('dialog.merge.squashMessageFormat', 'Default');

			// Run
			const result = await dataSource.merge('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', MergeActionOn.Commit, false, false, true, false, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledTimes(3);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['merge', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', '--squash'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff-index', 'HEAD'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['commit', '-m', 'Merge commit \'1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b\''], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should merge a branch into the current branch (squash and staged changes exist, signing merge commit)', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitSuccessOnce(':100644 100644 f592752b794040422c9d3b884f15564e6143954b 0000000000000000000000000000000000000000 M      README.md');
			mockGitSuccessOnce();
			vscode.mockExtensionSettingReturnValue('builtin', { 'commit.gpgSign': true });
			vscode.mockExtensionSettingReturnValue('dialog.merge.squashMessageFormat', 'Default');

			// Run
			const result = await dataSource.merge('/path/to/repo', 'develop', MergeActionOn.Branch, false, false, true, false, false);

			// Assert
			expect(result).toBe(null);
			expect(workspaceConfiguration.get).toBeCalledTimes(6);
			expect(workspaceConfiguration.get).toBeCalledWith('dialog.merge.squashMessageFormat', expect.anything());
			expect(spyOnSpawn).toBeCalledTimes(3);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['merge', 'develop', '--squash', '-S'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff-index', 'HEAD'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['commit', '-S', '-m', 'Merge branch \'develop\''], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should merge a branch into the current branch (squash and staged changes exist, dialog.merge.squashMessageFormat === "Git SQUASH_MSG")', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitSuccessOnce(':100644 100644 f592752b794040422c9d3b884f15564e6143954b 0000000000000000000000000000000000000000 M      README.md');
			mockGitSuccessOnce();
			vscode.mockExtensionSettingReturnValue('dialog.merge.squashMessageFormat', 'Git SQUASH_MSG');

			// Run
			const result = await dataSource.merge('/path/to/repo', 'develop', MergeActionOn.Branch, false, false, true, false, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledTimes(3);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['merge', 'develop', '--squash'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff-index', 'HEAD'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['commit', '--no-edit'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should merge a branch into the current branch (squash and no staged changes)', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.merge('/path/to/repo', 'develop', MergeActionOn.Branch, false, false, true, false, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledTimes(2);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['merge', 'develop', '--squash'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff-index', 'HEAD'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should merge a branch into the current branch (without committing)', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.merge('/path/to/repo', 'develop', MergeActionOn.Branch, false, false, false, true, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledTimes(1);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['merge', 'develop', '--no-commit'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should merge a branch into the current branch (squash without committing)', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.merge('/path/to/repo', 'develop', MergeActionOn.Branch, false, false, true, true, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledTimes(1);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['merge', 'develop', '--squash', '--no-commit'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should merge a branch into the current branch (ignore create new commit when squashing)', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.merge('/path/to/repo', 'develop', MergeActionOn.Branch, true, false, true, true, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledTimes(1);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['merge', 'develop', '--squash', '--no-commit'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git (when merge fails)', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.merge('/path/to/repo', 'develop', MergeActionOn.Branch, false, false, true, false, false);

			// Assert
			expect(result).toBe('error message');
			expect(spyOnSpawn).toBeCalledTimes(1);
		});

		it('Should return an error message thrown by git (when commit fails)', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitSuccessOnce(':100644 100644 f592752b794040422c9d3b884f15564e6143954b 0000000000000000000000000000000000000000 M      README.md');
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.merge('/path/to/repo', 'develop', MergeActionOn.Branch, false, false, true, false, false);

			// Assert
			expect(result).toBe('error message');
			expect(spyOnSpawn).toBeCalledTimes(3);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['merge', 'develop', '--squash'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff-index', 'HEAD'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['commit', '-m', 'Merge branch \'develop\''], expect.objectContaining({ cwd: '/path/to/repo' }));
		});
	});

	describe('rebase', () => {
		it('Should rebase the current branch on a branch with autosquash', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.rebase('/path/to/repo', 'develop', RebaseActionOn.Branch, false, false, false, false, false, true);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['rebase', '--interactive', '--autosquash', 'develop'], expect.objectContaining({ cwd: '/path/to/repo', env: expect.objectContaining({ GIT_SEQUENCE_EDITOR: 'true', GIT_EDITOR: 'true' }) }));
		});

		it('Should create a fixup commit of the staged changes', async () => {
			// Setup
			mockGitThrowingErrorOnce();
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.createFixupCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--cached', '--quiet'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['commit', '--fixup=1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should not create a fixup commit when there are no staged changes', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.createFixupCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', true);

			// Assert
			expect(result).toBe('There are no staged changes. Stage the changes that should be combined with the commit first.');
			expect(spyOnSpawn).toHaveBeenCalledTimes(1);
		});

		it('Should rebase the current branch on a branch, updating refs and ignoring whitespace', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.rebase('/path/to/repo', 'develop', RebaseActionOn.Branch, false, false, false, true, true);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['rebase', 'develop', '--update-refs', '--ignore-whitespace'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should rebase the current branch on a branch', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.rebase('/path/to/repo', 'develop', RebaseActionOn.Branch, false, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['rebase', 'develop'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should rebase the current branch on a branch (ignoring date)', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.rebase('/path/to/repo', 'develop', RebaseActionOn.Branch, true, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['rebase', 'develop', '--ignore-date'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should rebase the current branch on a branch (signing the new commits)', async () => {
			// Setup
			mockGitSuccessOnce();
			vscode.mockExtensionSettingReturnValue('builtin', { 'commit.gpgSign': true });

			// Run
			const result = await dataSource.rebase('/path/to/repo', 'develop', RebaseActionOn.Branch, false, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['rebase', 'develop', '-S'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.rebase('/path/to/repo', 'develop', RebaseActionOn.Branch, false, false);

			// Assert
			expect(result).toBe('error message');
		});

		it('Should launch the interactive rebase of the current branch on a branch in a terminal', async () => {
			// Setup
			useFakeTimers();
			mockGitSuccessOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b\n');
			const spyOnOpenGitTerminal = vi.spyOn(utils, 'openGitTerminal');
			spyOnOpenGitTerminal.mockReturnValueOnce();

			// Run
			const resultPromise = dataSource.rebase('/path/to/repo', 'develop', RebaseActionOn.Branch, false, true);
			vi.runOnlyPendingTimers();
			for (let i = 0; i < 20; i++) await Promise.resolve();

			// Assert
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'log', '-1', '--format=%H', 'develop', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(setTimeout).toHaveBeenCalledWith(expect.anything(), 1000);

			// Run
			vi.runOnlyPendingTimers();
			useRealTimers();
			const result = await resultPromise;

			// Assert
			expect(result).toBe(null);
			expect(spyOnOpenGitTerminal).toBeCalledWith('/path/to/repo', '/path/to/git', 'rebase --interactive 1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 'Rebase on "develop"', undefined);
		});

		it('Should launch the interactive rebase of the current branch on a commit in a terminal', async () => {
			// Setup
			useFakeTimers();
			const spyOnOpenGitTerminal = vi.spyOn(utils, 'openGitTerminal');
			spyOnOpenGitTerminal.mockReturnValueOnce();

			// Run
			const resultPromise = dataSource.rebase('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', RebaseActionOn.Commit, false, true);

			// Assert
			expect(setTimeout).toHaveBeenCalledWith(expect.anything(), 1000);

			// Run
			vi.runOnlyPendingTimers();
			useRealTimers();
			const result = await resultPromise;

			// Assert
			expect(result).toBe(null);
			expect(spyOnOpenGitTerminal).toBeCalledWith('/path/to/repo', '/path/to/git', 'rebase --interactive 1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 'Rebase on "1a2b3c4"', undefined);
		});

		it('Should not type a branch name into the terminal when it can\'t be resolved to a commit', async () => {
			// Setup
			mockGitThrowingErrorOnce();
			const spyOnOpenGitTerminal = vi.spyOn(utils, 'openGitTerminal');

			// Run
			const result = await dataSource.rebase('/path/to/repo', 'x$(touch pwned)', RebaseActionOn.Branch, false, true);

			// Assert
			expect(result).toBe('Unable to resolve "x$(touch pwned)" to a commit.');
			expect(spyOnOpenGitTerminal).not.toHaveBeenCalled();
		});

		it('Should launch the interactive rebase of the current branch on a branch in a terminal (signing the new commits)', async () => {
			// Setup
			useFakeTimers();
			mockGitSuccessOnce('1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b\n');
			const spyOnOpenGitTerminal = vi.spyOn(utils, 'openGitTerminal');
			spyOnOpenGitTerminal.mockReturnValueOnce();
			vscode.mockExtensionSettingReturnValue('builtin', { 'commit.gpgSign': true });

			// Run
			const resultPromise = dataSource.rebase('/path/to/repo', 'develop', RebaseActionOn.Branch, false, true);
			vi.runOnlyPendingTimers();
			for (let i = 0; i < 20; i++) await Promise.resolve();

			// Assert
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'log', '-1', '--format=%H', 'develop', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(setTimeout).toHaveBeenCalledWith(expect.anything(), 1000);

			// Run
			vi.runOnlyPendingTimers();
			useRealTimers();
			const result = await resultPromise;

			// Assert
			expect(result).toBe(null);
			expect(spyOnOpenGitTerminal).toBeCalledWith('/path/to/repo', '/path/to/git', 'rebase --interactive -S 1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 'Rebase on "develop"', undefined);
		});

		it('Should return the "Unable to Find Git" error message when no git executable is known', async () => {
			// Setup
			dataSource.dispose();
			dataSource = new DataSource(null, onDidChangeConfiguration.subscribe, onDidChangeGitExecutable.subscribe, logger);

			// Run
			const result = await dataSource.rebase('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', RebaseActionOn.Commit, false, true);

			// Assert
			expect(result).toBe('Unable to find a Git executable. Either: Set the Visual Studio Code Setting "git.path" to the path and filename of an existing Git executable, or install Git and restart Visual Studio Code.');
		});
	});

	describe('archive', () => {
		it('Should create a *.tar archive of a ref', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.archive('/path/to/repo', 'master', '/path/to/output/file.tar', 'tar');

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['archive', '--format=tar', '-o', '/path/to/output/file.tar', 'master'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should create a *.zip archive of a ref', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.archive('/path/to/repo', 'master', '/path/to/output/file.zip', 'zip');

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['archive', '--format=zip', '-o', '/path/to/output/file.zip', 'master'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.archive('/path/to/repo', 'master', '/path/to/output/file.tar', 'tar');

			// Assert
			expect(result).toBe('error message');
		});
	});

	describe('checkoutCommit', () => {
		it('Should checkout a commit', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.checkoutCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b');

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['checkout', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.checkoutCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b');

			// Assert
			expect(result).toBe('error message');
		});
	});

	describe('cherrypickCommit', () => {
		it('Should cherry pick multiple commits that have no changes with Allow Empty, but not pass it when reverting', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitSuccessOnce();

			// Run
			const cherrypickResult = await dataSource.applyCommits('/path/to/repo', false, ['3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], true);
			const revertResult = await dataSource.applyCommits('/path/to/repo', true, ['3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d'], true);

			// Assert
			expect(cherrypickResult).toBe(null);
			expect(revertResult).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['cherry-pick', '--allow-empty', '--keep-redundant-commits', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', '3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['revert', '--no-edit', '3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should cherry pick multiple commits, oldest first', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.applyCommits('/path/to/repo', false, ['3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b']);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['cherry-pick', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', '3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should revert multiple commits, newest first', async () => {
			// Setup
			mockGitSuccessOnce();
			vscode.mockExtensionSettingReturnValue('builtin', { 'commit.gpgSign': true });

			// Run
			const result = await dataSource.applyCommits('/path/to/repo', true, ['3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b']);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['revert', '--no-edit', '-S', '3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the notes of a commit, or null when it has none', async () => {
			// Setup
			mockGitSuccessOnce('Reviewed-by: someone\n\n');
			mockGitThrowingErrorOnce('error: no note found for object 1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b.');

			// Run
			const notes = await dataSource.getCommitNotes('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b');
			const noNotes = await dataSource.getCommitNotes('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b');

			// Assert
			expect(notes).toBe('Reviewed-by: someone');
			expect(noNotes).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['notes', 'show', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should cherrypick a commit, keeping it if it is or becomes empty', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.cherrypickCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 0, false, false, true);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['cherry-pick', '--allow-empty', '--keep-redundant-commits', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should ignore Allow Empty when cherry picking without committing', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.cherrypickCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 0, false, true, true);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['cherry-pick', '--no-commit', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should combine Allow Empty with Record Origin, signing and the parent of a merge commit', async () => {
			// Setup
			mockGitSuccessOnce();
			vscode.mockExtensionSettingReturnValue('builtin', { 'commit.gpgSign': true });

			// Run
			const result = await dataSource.cherrypickCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 2, true, false, true);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['cherry-pick', '--allow-empty', '--keep-redundant-commits', '-x', '-S', '-m', '2', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should cherrypick a commit (with a single parent)', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.cherrypickCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 0, false, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['cherry-pick', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should cherrypick a commit (with multiple parents)', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.cherrypickCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 2, false, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['cherry-pick', '-m', '2', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should record origin when cherry picking a commit', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.cherrypickCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 0, true, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['cherry-pick', '-x', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should cherrypick a commit (signing the new commit)', async () => {
			// Setup
			mockGitSuccessOnce();
			vscode.mockExtensionSettingReturnValue('builtin', { 'commit.gpgSign': true });

			// Run
			const result = await dataSource.cherrypickCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 0, false, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['cherry-pick', '-S', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should not commit the cherrypick of a commit', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.cherrypickCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 0, false, true);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['cherry-pick', '--no-commit', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.cherrypickCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 0, false, false);

			// Assert
			expect(result).toBe('error message');
		});
	});

	describe('dropCommit', () => {
		it('Should drop a commit', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.dropCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b');

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['rebase', '--onto', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b~1', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should drop a commit (signing any new commits)', async () => {
			// Setup
			mockGitSuccessOnce();
			vscode.mockExtensionSettingReturnValue('builtin', { 'commit.gpgSign': true });

			// Run
			const result = await dataSource.dropCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b');

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['rebase', '-S', '--onto', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b~1', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.dropCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b');

			// Assert
			expect(result).toBe('error message');
		});
	});

	describe('multiple commit actions', () => {
		const NEWEST = '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', MIDDLE = '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c', OLDEST = '3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d', BASE = '4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e';
		const GIT_PATHS = '.git/rebase-merge\n.git/rebase-apply\n.git/MERGE_HEAD\n.git/CHERRY_PICK_HEAD\n.git/REVERT_HEAD\n';

		describe('dropCommits', () => {
			it('Should drop several commits with one interactive rebase from the parent of the oldest commit', async () => {
				// Setup
				mockGitSuccessOnce(OLDEST + '\n');
				mockGitSuccessOnce(OLDEST + ' ' + BASE + '\n');
				mockGitSuccessOnce(NEWEST + ' ' + MIDDLE + '\n' + MIDDLE + ' ' + OLDEST + '\n' + OLDEST + ' ' + BASE + '\n');
				mockGitSuccessOnce(GIT_PATHS);
				mockGitSuccessOnce();

				// Run
				const result = await dataSource.dropCommits('/path/to/repo', [NEWEST, OLDEST]);

				// Assert
				expect(result).toBe(null);
				expect(spyOnSpawn).toHaveBeenNthCalledWith(1, '/path/to/git', ['merge-base', '--octopus', NEWEST, OLDEST], expect.anything());
				expect(spyOnSpawn).toHaveBeenNthCalledWith(3, '/path/to/git', ['rev-list', '--parents', 'HEAD', '--not', BASE, '--'], expect.anything());
				expect(spyOnSpawn).toHaveBeenNthCalledWith(5, '/path/to/git', ['rebase', '-i', BASE], expect.objectContaining({
					cwd: '/path/to/repo',
					env: expect.objectContaining({ GIT_SEQUENCE_EDITOR: expect.stringContaining('-v action=drop -v hashes=' + NEWEST + ',' + OLDEST + ' '), GIT_EDITOR: 'true' })
				}));
				expect(spyOnSpawn).toHaveBeenCalledTimes(5);
			});

			it('Should sign the rebased commits when enabled', async () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('builtin', { 'commit.gpgSign': true });
				mockGitSuccessOnce(MIDDLE + '\n');
				mockGitSuccessOnce(MIDDLE + ' ' + OLDEST + '\n');
				mockGitSuccessOnce(NEWEST + ' ' + MIDDLE + '\n' + MIDDLE + ' ' + OLDEST + '\n');
				mockGitSuccessOnce(GIT_PATHS);
				mockGitSuccessOnce();

				// Run
				const result = await dataSource.dropCommits('/path/to/repo', [NEWEST, MIDDLE]);

				// Assert
				expect(result).toBe(null);
				expect(spyOnSpawn).toHaveBeenNthCalledWith(5, '/path/to/git', ['rebase', '-i', '-S', OLDEST], expect.anything());
			});

			it('Should drop a single commit with a non-interactive rebase', async () => {
				// Setup
				mockGitSuccessOnce();

				// Run
				const result = await dataSource.dropCommits('/path/to/repo', [MIDDLE]);

				// Assert
				expect(result).toBe(null);
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['rebase', '--onto', MIDDLE + '~1', MIDDLE], expect.anything());
			});

			it('Should refuse when there is a merge commit between the oldest commit and HEAD', async () => {
				// Setup
				mockGitSuccessOnce(OLDEST + '\n');
				mockGitSuccessOnce(OLDEST + ' ' + BASE + '\n');
				mockGitSuccessOnce(NEWEST + ' ' + MIDDLE + ' ' + BASE + '\n' + MIDDLE + ' ' + OLDEST + '\n' + OLDEST + ' ' + BASE + '\n');

				// Run
				const result = await dataSource.dropCommits('/path/to/repo', [NEWEST, OLDEST]);

				// Assert
				expect(result).toBe('The selected commits must all be on the current branch, without merge commits between them.');
				expect(spyOnSpawn).toHaveBeenCalledTimes(3);
			});

			it('Should refuse when a commit is not on the history of HEAD', async () => {
				// Setup
				mockGitSuccessOnce(OLDEST + '\n');
				mockGitSuccessOnce(OLDEST + ' ' + BASE + '\n');
				mockGitSuccessOnce(MIDDLE + ' ' + OLDEST + '\n' + OLDEST + ' ' + BASE + '\n');

				// Run
				const result = await dataSource.dropCommits('/path/to/repo', [NEWEST, OLDEST]);

				// Assert
				expect(result).toBe('Commit 1a2b3c4 is not on the current branch.');
				expect(spyOnSpawn).toHaveBeenCalledTimes(3);
			});

			it('Should refuse when the commits aren\'t on one line of history', async () => {
				// Setup
				mockGitSuccessOnce(BASE + '\n');

				// Run
				const result = await dataSource.dropCommits('/path/to/repo', [NEWEST, OLDEST]);

				// Assert
				expect(result).toBe('The selected commits must all be on the current branch, without merge commits between them.');
				expect(spyOnSpawn).toHaveBeenCalledTimes(1);
			});

			it('Should refuse invalid commit hashes and an empty selection', async () => {
				// Run
				const invalidResult = await dataSource.dropCommits('/path/to/repo', [NEWEST, '--exec=x']);
				const emptyResult = await dataSource.dropCommits('/path/to/repo', []);

				// Assert
				expect(invalidResult).toBe('Invalid commit hash.');
				expect(emptyResult).toBe('No commits selected for dropping.');
				expect(spyOnSpawn).toHaveBeenCalledTimes(0);
			});
		});

		describe('squashCommits', () => {
			it('Should squash HEAD and its parent into one commit with the given message', async () => {
				// Setup
				mockGitSuccessOnce(NEWEST + '\n');
				mockGitSuccessOnce(NEWEST + ' ' + MIDDLE + '\n');
				mockGitSuccessOnce(MIDDLE + ' ' + OLDEST + '\n');
				mockGitSuccessOnce(GIT_PATHS);
				mockGitSuccessOnce();
				mockGitSuccessOnce();
				mockGitSuccessOnce();

				// Run
				const result = await dataSource.squashCommits('/path/to/repo', [NEWEST, MIDDLE], 'Subject "quoted" $HOME\n\n# Not a comment', false);

				// Assert
				expect(result).toBe(null);
				expect(spyOnSpawn).toHaveBeenNthCalledWith(5, '/path/to/git', ['diff', '--cached', '--quiet'], expect.anything());
				expect(spyOnSpawn).toHaveBeenNthCalledWith(6, '/path/to/git', ['reset', '--soft', OLDEST], expect.anything());
				expect(spyOnSpawn).toHaveBeenNthCalledWith(7, '/path/to/git', ['commit', '--cleanup=whitespace', '-m', 'Subject "quoted" $HOME\n\n# Not a comment'], expect.anything());
				expect(spyOnSpawn).toHaveBeenCalledTimes(7);
			});

			it('Should sign the squashed commit and skip the hooks when enabled', async () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('builtin', { 'commit.gpgSign': true });
				mockGitSuccessOnce(NEWEST + '\n');
				mockGitSuccessOnce(NEWEST + ' ' + MIDDLE + '\n');
				mockGitSuccessOnce(MIDDLE + ' ' + OLDEST + '\n');
				mockGitSuccessOnce(GIT_PATHS);
				mockGitSuccessOnce();
				mockGitSuccessOnce();
				mockGitSuccessOnce();

				// Run
				const result = await dataSource.squashCommits('/path/to/repo', [NEWEST, MIDDLE], 'Message', true);

				// Assert
				expect(result).toBe(null);
				expect(spyOnSpawn).toHaveBeenNthCalledWith(7, '/path/to/git', ['commit', '--cleanup=whitespace', '-m', 'Message', '-S', '--no-verify'], expect.anything());
			});

			it('Should refuse when the newest commit isn\'t HEAD', async () => {
				// Setup
				mockGitSuccessOnce(BASE + '\n');

				// Run
				const result = await dataSource.squashCommits('/path/to/repo', [NEWEST, MIDDLE], 'Message', false);

				// Assert
				expect(result).toBe('The newest selected commit must be the commit checked out (HEAD).');
				expect(spyOnSpawn).toHaveBeenCalledTimes(1);
			});

			it('Should refuse commits that aren\'t consecutive', async () => {
				// Setup
				mockGitSuccessOnce(NEWEST + '\n');
				mockGitSuccessOnce(NEWEST + ' ' + MIDDLE + '\n');

				// Run
				const result = await dataSource.squashCommits('/path/to/repo', [NEWEST, OLDEST], 'Message', false);

				// Assert
				expect(result).toBe('The selected commits must be consecutive (each commit must be the parent of the next).');
				expect(spyOnSpawn).toHaveBeenCalledTimes(2);
			});

			it('Should refuse merge commits', async () => {
				// Setup
				mockGitSuccessOnce(NEWEST + '\n');
				mockGitSuccessOnce(NEWEST + ' ' + MIDDLE + ' ' + BASE + '\n');

				// Run
				const result = await dataSource.squashCommits('/path/to/repo', [NEWEST, MIDDLE], 'Message', false);

				// Assert
				expect(result).toBe('Commit 1a2b3c4 is a merge commit or a root commit, and can\'t be squashed.');
			});

			it('Should refuse when changes are staged', async () => {
				// Setup
				mockGitSuccessOnce(NEWEST + '\n');
				mockGitSuccessOnce(NEWEST + ' ' + MIDDLE + '\n');
				mockGitSuccessOnce(MIDDLE + ' ' + OLDEST + '\n');
				mockGitSuccessOnce(GIT_PATHS);
				mockGitThrowingErrorOnce('');

				// Run
				const result = await dataSource.squashCommits('/path/to/repo', [NEWEST, MIDDLE], 'Message', false);

				// Assert
				expect(result).toBe('The repository has staged changes, which would be included in the squashed commit. Please commit or unstage them first.');
				expect(spyOnSpawn).toHaveBeenCalledTimes(5);
			});

			it('Should restore the branch when the squashed commit can\'t be created', async () => {
				// Setup
				mockGitSuccessOnce(NEWEST + '\n');
				mockGitSuccessOnce(NEWEST + ' ' + MIDDLE + '\n');
				mockGitSuccessOnce(MIDDLE + ' ' + OLDEST + '\n');
				mockGitSuccessOnce(GIT_PATHS);
				mockGitSuccessOnce();
				mockGitSuccessOnce();
				mockGitThrowingErrorOnce('hook failed');
				mockGitSuccessOnce();

				// Run
				const result = await dataSource.squashCommits('/path/to/repo', [NEWEST, MIDDLE], 'Message', false);

				// Assert
				expect(result).toBe('hook failed');
				expect(spyOnSpawn).toHaveBeenNthCalledWith(8, '/path/to/git', ['reset', '--soft', NEWEST], expect.anything());
			});
		});

		describe('undoLastCommit', () => {
			it('Should soft reset the current branch to the first parent of HEAD', async () => {
				// Setup
				mockGitSuccessOnce(NEWEST + ' ' + MIDDLE + ' ' + BASE + '\n');
				mockGitSuccessOnce();

				// Run
				const result = await dataSource.undoLastCommit('/path/to/repo');

				// Assert
				expect(result).toBe(null);
				expect(spyOnSpawn).toHaveBeenNthCalledWith(1, '/path/to/git', ['rev-list', '--parents', '-n', '1', 'HEAD', '--'], expect.anything());
				expect(spyOnSpawn).toHaveBeenNthCalledWith(2, '/path/to/git', ['reset', '--soft', MIDDLE], expect.anything());
			});

			it('Should refuse to reset the root commit', async () => {
				// Setup
				mockGitSuccessOnce(NEWEST + '\n');

				// Run
				const result = await dataSource.undoLastCommit('/path/to/repo');

				// Assert
				expect(result).toBe('The last commit is the root commit of the repository, and can\'t be reset.');
				expect(spyOnSpawn).toHaveBeenCalledTimes(1);
			});
		});

		describe('editCommitMessage', () => {
			it('Should amend only the message of HEAD, leaving any staged changes out of the commit', async () => {
				// Setup
				mockGitSuccessOnce(NEWEST + '\n');
				mockGitSuccessOnce();

				// Run
				const result = await dataSource.editCommitMessage('/path/to/repo', NEWEST, 'It\'s "new"\n\nBody', false);

				// Assert
				expect(result).toBe(null);
				expect(spyOnSpawn).toHaveBeenNthCalledWith(2, '/path/to/git', ['commit', '--amend', '--only', '--allow-empty', '--cleanup=whitespace', '-m', 'It\'s "new"\n\nBody'], expect.anything());
			});

			it('Should sign the amended commit and skip the hooks when enabled', async () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('builtin', { 'commit.gpgSign': true });
				mockGitSuccessOnce(NEWEST + '\n');
				mockGitSuccessOnce();

				// Run
				const result = await dataSource.editCommitMessage('/path/to/repo', NEWEST, 'Message', true);

				// Assert
				expect(result).toBe(null);
				expect(spyOnSpawn).toHaveBeenNthCalledWith(2, '/path/to/git', ['commit', '--amend', '--only', '--allow-empty', '--cleanup=whitespace', '-m', 'Message', '-S', '--no-verify'], expect.anything());
			});

			it('Should reword an older commit with an interactive rebase, passing the message via a file', async () => {
				// Setup
				mockGitSuccessOnce(NEWEST + '\n');
				mockGitSuccessOnce(MIDDLE + ' ' + OLDEST + '\n');
				mockGitSuccessOnce();
				mockGitSuccessOnce(GIT_PATHS);
				mockGitSuccessOnce('');
				mockGitSuccessOnce();

				// Run
				const result = await dataSource.editCommitMessage('/path/to/repo', MIDDLE, 'It\'s `new` $(id)', false);

				// Assert
				expect(result).toBe(null);
				expect(spyOnSpawn).toHaveBeenNthCalledWith(3, '/path/to/git', ['merge-base', '--is-ancestor', MIDDLE, 'HEAD'], expect.anything());
				expect(spyOnSpawn).toHaveBeenNthCalledWith(6, '/path/to/git', ['-c', 'commit.cleanup=whitespace', 'rebase', '-i', '--rebase-merges', OLDEST], expect.objectContaining({
					env: expect.objectContaining({
						GIT_SEQUENCE_EDITOR: expect.stringContaining('-v action=reword -v hashes=' + MIDDLE + ' '),
						GIT_EDITOR: expect.stringMatching(/^cp '[^']+COMMIT_EDITMSG'$/)
					})
				}));
				const env = spyOnSpawn.mock.calls[5][2].env;
				expect(env.GIT_SEQUENCE_EDITOR).not.toContain('new');
				expect(env.GIT_EDITOR).not.toContain('new');
			});

			it('Should skip the commit hooks when rewording an older commit with No Verify', async () => {
				// Setup
				mockGitSuccessOnce(NEWEST + '\n');
				mockGitSuccessOnce(MIDDLE + ' ' + OLDEST + '\n');
				mockGitSuccessOnce();
				mockGitSuccessOnce(GIT_PATHS);
				mockGitSuccessOnce('');
				mockGitSuccessOnce();

				// Run
				const result = await dataSource.editCommitMessage('/path/to/repo', MIDDLE, 'Message', true);

				// Assert
				expect(result).toBe(null);
				const args: string[] = spyOnSpawn.mock.calls[5][1];
				expect(args.slice(0, 2)).toStrictEqual(['-c', 'commit.cleanup=whitespace']);
				expect(args[2]).toBe('-c');
				expect(args[3]).toMatch(/^core\.hooksPath=.*easy-graph-hooks-/);
				expect(args.slice(4)).toStrictEqual(['rebase', '-i', '--rebase-merges', OLDEST]);
				expect(fs.existsSync(args[3].substring('core.hooksPath='.length))).toBe(false);
			});

			it('Should refuse to reword an older merge commit', async () => {
				// Setup
				mockGitSuccessOnce(NEWEST + '\n');
				mockGitSuccessOnce(MIDDLE + ' ' + OLDEST + ' ' + BASE + '\n');

				// Run
				const result = await dataSource.editCommitMessage('/path/to/repo', MIDDLE, 'Message', false);

				// Assert
				expect(result).toBe('The message of a merge commit or a root commit can only be edited when it is HEAD.');
				expect(spyOnSpawn).toHaveBeenCalledTimes(2);
			});

			it('Should refuse to reword an older commit when there are uncommitted changes', async () => {
				// Setup
				mockGitSuccessOnce(NEWEST + '\n');
				mockGitSuccessOnce(MIDDLE + ' ' + OLDEST + '\n');
				mockGitSuccessOnce();
				mockGitSuccessOnce(GIT_PATHS);
				mockGitSuccessOnce(' M file.txt\n');

				// Run
				const result = await dataSource.editCommitMessage('/path/to/repo', MIDDLE, 'Message', false);

				// Assert
				expect(result).toBe('The repository has uncommitted changes. Please commit or stash them before editing the message of an older commit.');
				expect(spyOnSpawn).toHaveBeenCalledTimes(5);
			});

			it('Should refuse an invalid commit hash', async () => {
				// Run
				const result = await dataSource.editCommitMessage('/path/to/repo', '--amend', 'Message', false);

				// Assert
				expect(result).toBe('Invalid commit hash.');
				expect(spyOnSpawn).toHaveBeenCalledTimes(0);
			});
		});

		describe.skipIf(process.platform === 'win32')('rebaseTodoActionEditor', () => {
			const runEditor = (editor: string, todo: string) => {
				const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'easy-graph-test-'));
				const file = path.join(dir, 'git-rebase-todo');
				fs.writeFileSync(file, todo);
				// Git runs the editor command as `sh -c '<editor> "$@"' <editor> <file>`
				const status = cp.spawnSync('sh', ['-c', editor + ' "$@"', editor, file]).status;
				const content = fs.readFileSync(file, 'utf8');
				fs.rmSync(dir, { recursive: true, force: true });
				return { status, content };
			};
			const TODO = 'pick 1a2b3c4 First  subject\np 2b3c4d5e Second\npick 3c4d5e6 Third\n\n# pick 1a2b3c4 in a comment\n';

			it('Should change the action of the matching commits, whatever the length of the abbreviated hashes', () => {
				// Run
				const result = runEditor(rebaseTodoActionEditor('drop', [NEWEST, MIDDLE]), TODO);

				// Assert
				expect(result.status).toBe(0);
				expect(result.content).toBe('drop 1a2b3c4 First  subject\ndrop 2b3c4d5e Second\npick 3c4d5e6 Third\n\n# pick 1a2b3c4 in a comment\n');
			});

			it('Should fail without changing the todo list when a commit isn\'t in it', () => {
				// Run
				const result = runEditor(rebaseTodoActionEditor('reword', [BASE]), TODO);

				// Assert
				expect(result.status).not.toBe(0);
				expect(result.content).toBe(TODO);
			});
		});
	});

	describe('resetToCommit', () => {
		it('Should perform a hard reset to a commit', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.resetToCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', GitResetMode.Hard);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['reset', '--hard', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should perform a hard reset to a commit', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.resetToCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', GitResetMode.Mixed);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['reset', '--mixed', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should perform a hard reset to a commit', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.resetToCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', GitResetMode.Soft);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['reset', '--soft', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.resetToCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', GitResetMode.Hard);

			// Assert
			expect(result).toBe('error message');
		});
	});

	describe('revertCommit', () => {
		it('Should revert a commit without committing', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.revertCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 0, true);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['revert', '--no-commit', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should revert a commit (with a single parent)', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.revertCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 0);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['revert', '--no-edit', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should revert a commit (with multiple parents)', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.revertCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 2);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['revert', '--no-edit', '-m', '2', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should revert a commit (signing the new commit)', async () => {
			// Setup
			mockGitSuccessOnce();
			vscode.mockExtensionSettingReturnValue('builtin', { 'commit.gpgSign': true });

			// Run
			const result = await dataSource.revertCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 0);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['revert', '--no-edit', '-S', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.revertCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 2);

			// Assert
			expect(result).toBe('error message');
		});
	});

	describe('setConfigValue', () => {
		it('Should set a global config value', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.setConfigValue('/path/to/repo', GitConfigKey.UserName, 'Test User Name', GitConfigLocation.Global);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['config', '--global', 'user.name', 'Test User Name'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should set a local config value', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.setConfigValue('/path/to/repo', GitConfigKey.UserName, 'Test User Name', GitConfigLocation.Local);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['config', '--local', 'user.name', 'Test User Name'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should set a system config value', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.setConfigValue('/path/to/repo', GitConfigKey.UserName, 'Test User Name', GitConfigLocation.System);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['config', '--system', 'user.name', 'Test User Name'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.setConfigValue('/path/to/repo', GitConfigKey.UserName, 'Test User Name', GitConfigLocation.Global);

			// Assert
			expect(result).toBe('error message');
		});
	});

	describe('unsetConfigValue', () => {
		it('Should unset a global config value', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.unsetConfigValue('/path/to/repo', GitConfigKey.UserName, GitConfigLocation.Global);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['config', '--global', '--unset-all', 'user.name'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should unset a local config value', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.unsetConfigValue('/path/to/repo', GitConfigKey.UserName, GitConfigLocation.Local);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['config', '--local', '--unset-all', 'user.name'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should unset a system config value', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.unsetConfigValue('/path/to/repo', GitConfigKey.UserName, GitConfigLocation.System);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['config', '--system', '--unset-all', 'user.name'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.unsetConfigValue('/path/to/repo', GitConfigKey.UserName, GitConfigLocation.Global);

			// Assert
			expect(result).toBe('error message');
		});
	});

	describe('cleanUntrackedFiles', () => {
		it('Should clean untracked files', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.cleanUntrackedFiles('/path/to/repo', false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['clean', '-f'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should clean untracked files and directories', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.cleanUntrackedFiles('/path/to/repo', true);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['clean', '-fd'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.cleanUntrackedFiles('/path/to/repo', false);

			// Assert
			expect(result).toBe('error message');
		});
	});

	describe('getUncommittedDetails (staged & unstaged groups)', () => {
		it('Should return the staged changes', async () => {
			// Setup
			mockGitSuccessOnce(['M', 'dir/modified.txt', 'A', 'added.txt', ''].join('\0'));
			mockGitSuccessOnce(['1	2	dir/modified.txt', '3	0	added.txt', ''].join('\0'));

			// Run
			const result = await dataSource.getUncommittedDetails('/path/to/repo', 'staged');

			// Assert
			expect(result.error).toBe(null);
			expect(result.commitDetails!.fileChanges).toStrictEqual([
				{ additions: 1, deletions: 2, newFilePath: 'dir/modified.txt', oldFilePath: 'dir/modified.txt', type: 'M' },
				{ additions: 3, deletions: 0, newFilePath: 'added.txt', oldFilePath: 'added.txt', type: 'A' }
			]);
			expect(spyOnSpawn).toBeCalledTimes(2);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--name-status', '--find-renames', '--diff-filter=AMDRT', '-z', '--cached', 'HEAD'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--numstat', '--find-renames', '--diff-filter=AMDRT', '-z', '--cached', 'HEAD'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return the unstaged changes, including the untracked files', async () => {
			// Setup
			mockGitSuccessOnce(['D', 'deleted.txt', 'M', 'modified.txt', ''].join('\0'));
			mockGitSuccessOnce(['0	4	deleted.txt', '1	1	modified.txt', ''].join('\0'));
			mockGitSuccessOnce([' D deleted.txt', 'D  staged-deleted.txt', ' M modified.txt', '?? untracked.txt'].join('\0'));

			// Run
			const result = await dataSource.getUncommittedDetails('/path/to/repo', 'unstaged');

			// Assert
			expect(result.error).toBe(null);
			expect(result.commitDetails!.fileChanges).toStrictEqual([
				{ additions: 0, deletions: 4, newFilePath: 'deleted.txt', oldFilePath: 'deleted.txt', type: 'D' },
				{ additions: 1, deletions: 1, newFilePath: 'modified.txt', oldFilePath: 'modified.txt', type: 'M' },
				{ additions: null, deletions: null, newFilePath: 'untracked.txt', oldFilePath: 'untracked.txt', type: 'U' }
			]);
			expect(spyOnSpawn).toBeCalledTimes(3);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--name-status', '--find-renames', '--diff-filter=AMDRT', '-z'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['diff', '--numstat', '--find-renames', '--diff-filter=AMDRT', '-z'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();
			mockGitSuccessOnce('');

			// Run
			const result = await dataSource.getUncommittedDetails('/path/to/repo', 'staged');

			// Assert
			expect(result).toStrictEqual({ commitDetails: null, error: 'error message' });
		});
	});

	describe('type changes', () => {
		it('Should display a type change (e.g. a file replaced by a symbolic link) as a modification', async () => {
			// Setup
			mockGitSuccessOnce(['T', 'link.txt', 'M', 'file.txt', ''].join('\0'));
			mockGitSuccessOnce(['1	1	link.txt', '2	3	file.txt', ''].join('\0'));

			// Run
			const result = await dataSource.getCommitComparison('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c');

			// Assert
			expect(result).toStrictEqual({
				fileChanges: [
					{ additions: 1, deletions: 1, newFilePath: 'link.txt', oldFilePath: 'link.txt', type: 'M' },
					{ additions: 2, deletions: 3, newFilePath: 'file.txt', oldFilePath: 'file.txt', type: 'M' }
				],
				error: null
			});
		});
	});

	describe('getBranchesContainingCommit', () => {
		it('Should return the local and remote branches containing the commit', async () => {
			// Setup
			mockGitSuccessOnce('* main\n  feature\n  (HEAD detached at 1a2b3c4)\n  remotes/origin/HEAD -> origin/main\n  remotes/origin/main\n');

			// Run
			const result = await dataSource.getBranchesContainingCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b');

			// Assert
			expect(result).toStrictEqual({ branches: ['main', 'feature', 'origin/main'], error: null });
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['branch', '-a', '--no-color', '--contains=1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.getBranchesContainingCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b');

			// Assert
			expect(result).toStrictEqual({ branches: [], error: 'error message' });
		});
	});

	describe('getCommitShowPatch', () => {
		it('Should return the patch of the commit', async () => {
			// Setup
			mockGitSuccessOnce('commit 1a2b3c4d\n\ndiff --git a/file.txt b/file.txt\n');

			// Run
			const result = await dataSource.getCommitShowPatch('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b');

			// Assert
			expect(result).toBe('commit 1a2b3c4d\n\ndiff --git a/file.txt b/file.txt\n');
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'show', '--patch', '--no-color', '--format=fuller', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});
	});

	describe('getFilesAtCommit', () => {
		it('Should return the files in the tree of the commit', async () => {
			// Setup
			mockGitSuccessOnce(['dir/file 1.txt', 'file2.txt', ''].join('\0'));

			// Run
			const result = await dataSource.getFilesAtCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b');

			// Assert
			expect(result).toStrictEqual(['dir/file 1.txt', 'file2.txt']);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['ls-tree', '-r', '--name-only', '-z', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should reject with the error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run & Assert
			await expect(dataSource.getFilesAtCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b')).rejects.toBe('error message');
		});
	});

	describe('setCommitNotes', () => {
		const mockGitWithStdinOnce = (exitCode: number, stdinEnd: (data: string) => void) => {
			spyOnSpawn.mockImplementationOnce(() => {
				const onCallbacks: { [event: string]: (...args: any[]) => void } = {}, stderrOnCallbacks: { [event: string]: (...args: any[]) => void } = {}, stdoutOnCallbacks: { [event: string]: (...args: any[]) => void } = {};
				setTimeout(() => {
					stdoutOnCallbacks['close']();
					if (exitCode !== 0) stderrOnCallbacks['data']('error message\n');
					stderrOnCallbacks['close']();
					onCallbacks['exit'](exitCode);
				}, 1);
				return {
					on: (event: string, callback: (...args: any[]) => void) => onCallbacks[event] = callback,
					stderr: { on: (event: string, callback: (...args: any[]) => void) => stderrOnCallbacks[event] = callback },
					stdout: { on: (event: string, callback: (...args: any[]) => void) => stdoutOnCallbacks[event] = callback },
					stdin: { on: () => { }, end: stdinEnd }
				};
			});
		};

		it('Should add or replace the notes of a commit, passing the notes via stdin', async () => {
			// Setup
			const stdinEnd = vi.fn();
			mockGitWithStdinOnce(0, stdinEnd);

			// Run
			const result = await dataSource.setCommitNotes('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 'Reviewed-by: someone\n"quoted" $text');

			// Assert
			expect(result).toBe(null);
			expect(stdinEnd).toHaveBeenCalledWith('Reviewed-by: someone\n"quoted" $text');
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['notes', 'add', '-f', '-F', '-', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitWithStdinOnce(1, vi.fn());

			// Run
			const result = await dataSource.setCommitNotes('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 'notes');

			// Assert
			expect(result).toBe('error message');
		});

		it('Should remove the notes of a commit when the notes are empty', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.setCommitNotes('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', ' \n');

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['notes', 'remove', '--ignore-missing', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});
	});

	describe('resetFileToRevision', () => {
		it('Should reset file to revision', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.resetFileToRevision('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 'path/to/file');

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['checkout', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', '--', 'path/to/file'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.resetFileToRevision('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', 'path/to/file');

			// Assert
			expect(result).toBe('error message');
		});
	});

	describe('applyStash', () => {
		it('Should apply a stash', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.applyStash('/path/to/repo', 'refs/stash@{0}', false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['stash', 'apply', 'refs/stash@{0}'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should apply a stash and reinstate the index', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.applyStash('/path/to/repo', 'refs/stash@{0}', true);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['stash', 'apply', '--index', 'refs/stash@{0}'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.applyStash('/path/to/repo', 'refs/stash@{0}', false);

			// Assert
			expect(result).toBe('error message');
		});
	});

	describe('branchFromStash', () => {
		it('Should create a branch from a stash', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.branchFromStash('/path/to/repo', 'refs/stash@{0}', 'stash-branch');

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['stash', 'branch', 'stash-branch', 'refs/stash@{0}'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.branchFromStash('/path/to/repo', 'refs/stash@{0}', 'stash-branch');

			// Assert
			expect(result).toBe('error message');
		});
	});

	describe('G5 Git actions', () => {
		const HASH = '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', HASH2 = '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c';

		it('Should log the hash of a dropped stash', async () => {
			// Setup
			mockGitSuccessOnce('Dropped refs/stash@{0} (' + HASH + ')\n');

			// Run
			const result = await dataSource.dropStash('/path/to/repo', 'refs/stash@{0}');

			// Assert
			expect(result).toBe(null);
			expect(spyOnLog).toHaveBeenCalledWith('Dropped stash refs/stash@{0} (' + HASH + '). It can be recovered with "git stash apply ' + HASH + '".');
		});

		it('Should log the hash of a popped stash', async () => {
			// Setup
			mockGitSuccessOnce('On branch main\nDropped refs/stash@{1} (' + HASH + ')\n');

			// Run
			const result = await dataSource.popStash('/path/to/repo', 'refs/stash@{1}', false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnLog).toHaveBeenCalledWith('Dropped stash refs/stash@{1} (' + HASH + '). It can be recovered with "git stash apply ' + HASH + '".');
		});

		it('Should write the output of Git commands to the Output Channel when enabled', async () => {
			// Setup
			mockGitSuccessOnce('stdout message\n', 'hook message\n');
			vscode.mockExtensionSettingReturnValue('logGitCommandOutput', true);

			// Run
			const result = await dataSource.checkoutCommit('/path/to/repo', HASH);

			// Assert
			expect(result).toBe(null);
			expect(spyOnLog).toHaveBeenCalledWith('stdout message\nhook message');
		});

		it('Shouldn\'t write the output of Git commands to the Output Channel by default', async () => {
			// Setup
			mockGitSuccessOnce('stdout message\n');

			// Run
			await dataSource.checkoutCommit('/path/to/repo', HASH);

			// Assert
			expect(spyOnLog).not.toHaveBeenCalledWith('stdout message');
		});

		it('Should add a hint about credential helpers when HTTPS authentication fails', async () => {
			// Setup
			mockGitThrowingErrorOnce('remote: Invalid username or password.\nfatal: Authentication failed for \'https://github.com/mhutchie/test.git/\'');

			// Run
			const result = await dataSource.fetch('/path/to/repo', 'origin', false, false);

			// Assert
			expect(result).toContain('fatal: Authentication failed');
			expect(result).toContain('configure a Git credential helper');
		});

		it('Shouldn\'t add a hint about credential helpers to other errors', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.fetch('/path/to/repo', 'origin', false, false);

			// Assert
			expect(result).toBe('error message');
		});

		it('Should convert Cygwin paths on Windows', () => {
			// Setup
			const platform = process.platform;
			Object.defineProperty(process, 'platform', { value: 'win32' });

			// Run & Assert
			expect(convertCygwinPath('/cygdrive/C/path/to/repo')).toBe('c:/path/to/repo');
			expect(convertCygwinPath('/cygdrive/d')).toBe('d:/');
			expect(convertCygwinPath('c:/path/to/repo')).toBe('c:/path/to/repo');

			Object.defineProperty(process, 'platform', { value: 'linux' });
			expect(convertCygwinPath('/cygdrive/c/path/to/repo')).toBe('/cygdrive/c/path/to/repo');
			Object.defineProperty(process, 'platform', { value: platform });
		});

		it('Should get the patch of a commit', async () => {
			// Setup
			mockGitSuccessOnce('From ' + HASH + ' Mon Sep 17 00:00:00 2001\nSubject: [PATCH] Subject\n\ndiff\n');

			// Run
			const result = await dataSource.getCommitPatch('/path/to/repo', HASH);

			// Assert
			expect(result).toStrictEqual({ patch: 'From ' + HASH + ' Mon Sep 17 00:00:00 2001\nSubject: [PATCH] Subject\n\ndiff\n', error: null });
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'format-patch', '-1', '--stdout', '--no-signature', HASH], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should get the patch of a merge commit relative to its first parent', async () => {
			// Setup
			mockGitSuccessOnce('');
			mockGitSuccessOnce('commit ' + HASH + '\n\ndiff\n');

			// Run
			const result = await dataSource.getCommitPatch('/path/to/repo', HASH);

			// Assert
			expect(result).toStrictEqual({ patch: 'commit ' + HASH + '\n\ndiff\n', error: null });
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'show', '--format=fuller', '--patch', '-m', '--first-parent', HASH], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should reject an invalid commit hash when getting a patch', async () => {
			// Run
			const result = await dataSource.getCommitPatch('/path/to/repo', '--output=file');

			// Assert
			expect(result).toStrictEqual({ patch: null, error: 'Invalid commit hash.' });
			expect(spyOnSpawn).not.toHaveBeenCalled();
		});

		it('Should save the patches of multiple commits to a file, oldest first', async () => {
			// Setup
			mockGitSuccessOnce('patch2\n');
			mockGitSuccessOnce('patch1\n');
			const spyOnWriteFileSync = vi.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => { });

			// Run
			const result = await dataSource.savePatch('/path/to/repo', [HASH, HASH2], '/path/to/file.patch');

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toHaveBeenNthCalledWith(1, '/path/to/git', expect.arrayContaining([HASH2]), expect.anything());
			expect(spyOnWriteFileSync).toHaveBeenCalledWith('/path/to/file.patch', 'patch2\npatch1\n');
		});

		it('Should apply a patch with git am, and abort it if it fails', async () => {
			// Setup
			mockGitThrowingErrorOnce();
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.applyPatch('/path/to/repo', '/path/to/file.patch', 'am', true);

			// Assert
			expect(result).toBe('error message\n\nThe patch was not applied ("git am --abort" was run).');
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['am', '--3way', '--', '/path/to/file.patch'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['am', '--abort'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should apply a patch to the working tree and index', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.applyPatch('/path/to/repo', '/path/to/file.patch', 'applyIndex', false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['apply', '--index', '--', '/path/to/file.patch'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should get the merge base of two commits', async () => {
			// Setup
			mockGitSuccessOnce('3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d\n');

			// Run
			const result = await dataSource.getMergeBase('/path/to/repo', [HASH, HASH2]);

			// Assert
			expect(result).toStrictEqual({ mergeBase: '3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d', error: null });
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['merge-base', HASH, HASH2], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should get the subjects of the commits between two commits', async () => {
			// Setup
			mockGitSuccessOnce('First\nSecond\n');

			// Run
			const result = await dataSource.getCommitSubjectsBetween('/path/to/repo', HASH2, HASH);

			// Assert
			expect(result).toStrictEqual({ subjects: 'First\nSecond', error: null });
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'log', '--format=%s', '--reverse', HASH2 + '..' + HASH, '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should get the reflog of HEAD', async () => {
			// Setup
			mockGitSuccessOnce(HASH + '\0HEAD@{1587559258}\0commit: Subject\n' + HASH2 + '\0HEAD@{1587559200}\0checkout: moving from a to b\n');

			// Run
			const result = await dataSource.getReflog('/path/to/repo', 500);

			// Assert
			expect(result).toStrictEqual([
				{ hash: HASH, selector: 'HEAD@{0}', message: 'commit: Subject', date: 1587559258 },
				{ hash: HASH2, selector: 'HEAD@{1}', message: 'checkout: moving from a to b', date: 1587559200 }
			]);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'reflog', 'show', '--date=unix', '--format=%H%x00%gd%x00%gs', '-n', '500', 'HEAD', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should push a commit to a remote branch', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.pushToCommit('/path/to/repo', HASH, 'origin', 'main', true, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', '--no-verify', 'origin', HASH + ':refs/heads/main'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should force push a commit to a remote branch with lease', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.pushToCommit('/path/to/repo', HASH, 'origin', 'main', false, true);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['push', '--force-with-lease', 'origin', HASH + ':refs/heads/main'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should reject an invalid branch name when pushing to a commit', async () => {
			// Run
			const result = await dataSource.pushToCommit('/path/to/repo', HASH, 'origin', '--delete', false, false);

			// Assert
			expect(result).toBe('Invalid remote or branch name.');
			expect(spyOnSpawn).not.toHaveBeenCalled();
		});

		it('Should rebase the commits after a commit onto a branch', async () => {
			// Setup
			mockGitSuccessOnce(HASH2 + '\n');
			mockGitSuccessOnce(HASH + '\n');
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.rebaseOnto('/path/to/repo', 'develop', HASH);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'log', '-1', '--format=%H', 'develop', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['rebase', '--onto', HASH2, HASH], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should create a squash commit with the branch name and commit subjects', async () => {
			// Setup
			mockGitSuccessOnce();
			mockGitSuccessOnce(':100644 100644 abc def M\tfile.txt\n');
			mockGitSuccessOnce('* First\n* Second\n');
			mockGitSuccessOnce();
			vscode.mockExtensionSettingReturnValue('dialog.merge.squashMessageFormat', 'Branch Name & Commit Subjects');

			// Run
			const result = await dataSource.merge('/path/to/repo', 'develop', MergeActionOn.Branch, false, false, true, false, false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['-c', 'log.showSignature=false', 'log', '--format=* %s', 'HEAD..develop', '--'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['commit', '-m', 'Merge branch \'develop\'\n\n* First\n* Second'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should open the external diff tool for a single file', async () => {
			// Setup
			mockGitSuccessOnce();
			vscode.mockExtensionSettingReturnValue('externalDiffToolArgs', ['--trust-exit-code']);

			// Run
			const result = await dataSource.openExternalFileDiff('/path/to/repo', HASH, HASH, 'old.txt', 'new.txt', true);

			// Assert
			expect(result).toBe(null);
			await waitForExpect(() => expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['difftool', '--no-prompt', '-g', '--trust-exit-code', HASH + '~1', HASH, '--', 'old.txt', 'new.txt'], expect.objectContaining({ cwd: '/path/to/repo' })));
		});

		it('Should pass the configured arguments to the external directory diff', async () => {
			// Setup
			useFakeTimers();
			const spyOnOpenGitTerminal = vi.spyOn(utils, 'openGitTerminal');
			spyOnOpenGitTerminal.mockReturnValueOnce();
			vscode.mockExtensionSettingReturnValue('externalDiffToolArgs', ['--no-symlinks']);

			// Run
			const resultPromise = dataSource.openExternalDirDiff('/path/to/repo', HASH, HASH, false);
			vi.runOnlyPendingTimers();
			useRealTimers();
			const result = await resultPromise;

			// Assert
			expect(result).toBe(null);
			expect(spyOnOpenGitTerminal).toBeCalledWith('/path/to/repo', '/path/to/git', 'difftool --dir-diff --no-symlinks ' + HASH + '~1..' + HASH, 'Open External Directory Diff');
		});

		it('Should keep the "update-ref" lines when rebasing with the Todo Editor, with --update-refs (Rebase Todo Editor)', async () => {
			// Setup
			mockGitSuccessOnce(HASH2 + '\n');
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.rebaseInteractiveWithTodo('/path/to/repo', HASH2, RebaseActionOn.Commit, [{ hash: '1a2b3c4', action: 'pick' as any }], false, true);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['rebase', '-i', '--update-refs', HASH2], expect.objectContaining({
				cwd: '/path/to/repo',
				env: expect.objectContaining({ GIT_SEQUENCE_EDITOR: expect.stringContaining('awk -f') })
			}));
		});

		describe('backups before dangerous actions', () => {
			it('Should create a backup of the current branch before resetting it, when enabled', async () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('repository.backupBeforeDangerousActions', true);
				mockGitSuccessOnce(HASH + '\n');
				mockGitSuccessOnce('main\n');
				mockGitSuccessOnce();
				mockGitSuccessOnce();

				// Run
				const result = await dataSource.resetToCommit('/path/to/repo', HASH2, GitResetMode.Hard);

				// Assert
				expect(result).toBe(null);
				expect(spyOnSpawn).toHaveBeenNthCalledWith(1, '/path/to/git', ['-c', 'log.showSignature=false', 'log', '-1', '--format=%H', 'HEAD', '--'], expect.anything());
				expect(spyOnSpawn).toHaveBeenNthCalledWith(2, '/path/to/git', ['symbolic-ref', '--short', '-q', 'HEAD'], expect.anything());
				expect(spyOnSpawn).toHaveBeenNthCalledWith(3, '/path/to/git', ['update-ref', expect.stringMatching(/^refs\/easy-graph\/backup\/\d{8}-\d{6}-\d{3}-reset-main$/), HASH], expect.anything());
				expect(spyOnSpawn).toHaveBeenNthCalledWith(4, '/path/to/git', ['reset', '--hard', HASH2], expect.anything());
			});

			it('Should create a backup of a branch before deleting it, when enabled', async () => {
				// Setup
				vscode.mockExtensionSettingReturnValue('repository.backupBeforeDangerousActions', true);
				mockGitSuccessOnce(HASH + '\n');
				mockGitSuccessOnce();
				mockGitSuccessOnce();

				// Run
				const result = await dataSource.deleteBranch('/path/to/repo', 'feature/x', true);

				// Assert
				expect(result).toBe(null);
				expect(spyOnSpawn).toHaveBeenNthCalledWith(1, '/path/to/git', ['-c', 'log.showSignature=false', 'log', '-1', '--format=%H', 'refs/heads/feature/x', '--'], expect.anything());
				expect(spyOnSpawn).toHaveBeenNthCalledWith(2, '/path/to/git', ['update-ref', expect.stringMatching(/^refs\/easy-graph\/backup\/\d{8}-\d{6}-\d{3}-delete-feature-x$/), HASH], expect.anything());
				expect(spyOnSpawn).toHaveBeenNthCalledWith(3, '/path/to/git', ['branch', '-D', 'feature/x'], expect.anything());
			});

			it('Shouldn\'t create a backup by default', async () => {
				// Setup
				mockGitSuccessOnce();

				// Run
				const result = await dataSource.resetToCommit('/path/to/repo', HASH2, GitResetMode.Hard);

				// Assert
				expect(result).toBe(null);
				expect(spyOnSpawn).toHaveBeenCalledTimes(1);
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['reset', '--hard', HASH2], expect.anything());
			});

			it('Should list the backups', async () => {
				// Setup
				mockGitSuccessOnce('refs/easy-graph/backup/20240101-000000-000-reset-main\0' + HASH + '\0Subject\n');

				// Run
				const result = await dataSource.getBackups('/path/to/repo');

				// Assert
				expect(result).toStrictEqual([{ ref: 'refs/easy-graph/backup/20240101-000000-000-reset-main', hash: HASH, subject: 'Subject' }]);
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['for-each-ref', '--sort=-refname', '--format=%(refname)%00%(objectname)%00%(subject)', 'refs/easy-graph/backup/'], expect.anything());
			});

			it('Should delete backups, and refuse to delete other references', async () => {
				// Setup
				mockGitSuccessOnce();

				// Run
				const result1 = await dataSource.deleteBackups('/path/to/repo', ['refs/easy-graph/backup/a']);
				const result2 = await dataSource.deleteBackups('/path/to/repo', ['refs/heads/main']);

				// Assert
				expect(result1).toBe(null);
				expect(result2).toBe('Invalid backup reference "refs/heads/main".');
				expect(spyOnSpawn).toHaveBeenCalledTimes(1);
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['update-ref', '-d', 'refs/easy-graph/backup/a'], expect.anything());
			});

			it('Should restore a backup with "git reset --keep"', async () => {
				// Setup
				mockGitSuccessOnce();

				// Run
				const result = await dataSource.restoreBackup('/path/to/repo', 'refs/easy-graph/backup/a');

				// Assert
				expect(result).toBe(null);
				expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['reset', '--keep', 'refs/easy-graph/backup/a'], expect.anything());
			});
		});
	});

	describe('dropStash', () => {
		it('Should drop a stash', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.dropStash('/path/to/repo', 'refs/stash@{0}');

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['stash', 'drop', 'refs/stash@{0}'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.dropStash('/path/to/repo', 'refs/stash@{0}');

			// Assert
			expect(result).toBe('error message');
		});
	});

	describe('popStash', () => {
		it('Should pop a stash', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.popStash('/path/to/repo', 'refs/stash@{0}', false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['stash', 'pop', 'refs/stash@{0}'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should pop a stash and reinstate the index', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.popStash('/path/to/repo', 'refs/stash@{0}', true);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['stash', 'pop', '--index', 'refs/stash@{0}'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.popStash('/path/to/repo', 'refs/stash@{0}', false);

			// Assert
			expect(result).toBe('error message');
		});
	});

	describe('pushStash', () => {
		it('Should push the uncommitted changes to a stash', async () => {
			// Setup
			onDidChangeGitExecutable.emit({ path: '/path/to/git', version: '2.13.2' });
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.pushStash('/path/to/repo', '', false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['stash', 'push'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should push the uncommitted changes to a stash, and set the message', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.pushStash('/path/to/repo', 'Stash Message', false);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['stash', 'push', '--message', 'Stash Message'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should push the uncommitted changes (and untracked files) to a stash', async () => {
			// Setup
			mockGitSuccessOnce();

			// Run
			const result = await dataSource.pushStash('/path/to/repo', '', true);

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['stash', 'push', '--include-untracked'], expect.objectContaining({ cwd: '/path/to/repo' }));
		});

		it('Should return an error message thrown by git', async () => {
			// Setup
			mockGitThrowingErrorOnce();

			// Run
			const result = await dataSource.pushStash('/path/to/repo', '', false);

			// Assert
			expect(result).toBe('error message');
		});

		it('Should return the "Unable to Find Git" error message when no git executable is known', async () => {
			// Setup
			dataSource.dispose();
			dataSource = new DataSource(null, onDidChangeConfiguration.subscribe, onDidChangeGitExecutable.subscribe, logger);

			// Run
			const result = await dataSource.pushStash('/path/to/repo', '', false);

			// Assert
			expect(result).toBe('Unable to find a Git executable. Either: Set the Visual Studio Code Setting "git.path" to the path and filename of an existing Git executable, or install Git and restart Visual Studio Code.');
		});

		it('Should return the "Incompatible Git Version" error message when Git is older than 2.13.2', async () => {
			// Setup
			onDidChangeGitExecutable.emit({ path: '/path/to/git', version: '2.13.1' });

			// Run
			const result = await dataSource.pushStash('/path/to/repo', '', false);

			// Assert
			expect(result).toBe('A newer version of Git (>= 2.13.2) is required for this feature. Git 2.13.1 is currently installed. Please install a newer version of Git to use this feature.');
		});
	});

	describe('openExternalDirDiff', () => {
		it('Should launch a gui directory diff (for one commit)', async () => {
			// Setup
			useFakeTimers();
			mockGitSuccessOnce();

			// Run
			const resultPromise = dataSource.openExternalDirDiff('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', true);

			// Assert
			expect(setTimeout).toHaveBeenCalledWith(expect.anything(), 1500);

			// Run
			vi.runOnlyPendingTimers();
			useRealTimers();
			const result = await resultPromise;

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['difftool', '--dir-diff', '-g', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b~1..1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnLog).toHaveBeenCalledWith('External diff tool is being opened (1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b~1..1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b)');
			await waitForExpect(() => expect(spyOnLog).toHaveBeenCalledWith('External diff tool has exited (1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b~1..1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b)'));
		});

		it('Should launch a gui directory diff (between two commits)', async () => {
			// Setup
			useFakeTimers();
			mockGitSuccessOnce();

			// Run
			const resultPromise = dataSource.openExternalDirDiff('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c', true);

			// Assert
			expect(setTimeout).toHaveBeenCalledWith(expect.anything(), 1500);

			// Run
			vi.runOnlyPendingTimers();
			useRealTimers();
			const result = await resultPromise;

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['difftool', '--dir-diff', '-g', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b..2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnLog).toHaveBeenCalledWith('External diff tool is being opened (1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b..2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c)');
			await waitForExpect(() => expect(spyOnLog).toHaveBeenCalledWith('External diff tool has exited (1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b..2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c)'));
		});

		it('Should launch a gui directory diff (for uncommitted changes)', async () => {
			// Setup
			useFakeTimers();
			mockGitSuccessOnce();

			// Run
			const resultPromise = dataSource.openExternalDirDiff('/path/to/repo', utils.UNCOMMITTED, utils.UNCOMMITTED, true);

			// Assert
			expect(setTimeout).toHaveBeenCalledWith(expect.anything(), 1500);

			// Run
			vi.runOnlyPendingTimers();
			useRealTimers();
			const result = await resultPromise;

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['difftool', '--dir-diff', '-g', 'HEAD'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnLog).toHaveBeenCalledWith('External diff tool is being opened (HEAD)');
			await waitForExpect(() => expect(spyOnLog).toHaveBeenCalledWith('External diff tool has exited (HEAD)'));
		});

		it('Should launch a gui directory diff (between a commit and the uncommitted changes)', async () => {
			// Setup
			useFakeTimers();
			mockGitSuccessOnce();

			// Run
			const resultPromise = dataSource.openExternalDirDiff('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', utils.UNCOMMITTED, true);

			// Assert
			expect(setTimeout).toHaveBeenCalledWith(expect.anything(), 1500);

			// Run
			vi.runOnlyPendingTimers();
			useRealTimers();
			const result = await resultPromise;

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['difftool', '--dir-diff', '-g', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnLog).toHaveBeenCalledWith('External diff tool is being opened (1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b)');
			await waitForExpect(() => expect(spyOnLog).toHaveBeenCalledWith('External diff tool has exited (1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b)'));
		});

		it('Should launch a directory diff in a terminal (between two commits)', async () => {
			// Setup
			useFakeTimers();
			const spyOnOpenGitTerminal = vi.spyOn(utils, 'openGitTerminal');
			spyOnOpenGitTerminal.mockReturnValueOnce();

			// Run
			const resultPromise = dataSource.openExternalDirDiff('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c', false);

			// Assert
			expect(setTimeout).toHaveBeenCalledWith(expect.anything(), 1500);

			// Run
			vi.runOnlyPendingTimers();
			useRealTimers();
			const result = await resultPromise;

			// Assert
			expect(result).toBe(null);
			expect(spyOnOpenGitTerminal).toBeCalledWith('/path/to/repo', '/path/to/git', 'difftool --dir-diff 1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b..2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c', 'Open External Directory Diff');
		});

		it('Should return the "Unable to Find Git" error message when no git executable is known', async () => {
			// Setup
			dataSource.dispose();
			dataSource = new DataSource(null, onDidChangeConfiguration.subscribe, onDidChangeGitExecutable.subscribe, logger);

			// Run
			const result = await dataSource.openExternalDirDiff('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', '2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c', true);

			// Assert
			expect(result).toBe('Unable to find a Git executable. Either: Set the Visual Studio Code Setting "git.path" to the path and filename of an existing Git executable, or install Git and restart Visual Studio Code.');
		});

		it('Should display the error message when the diff tool doesn\'t exit successfully', async () => {
			// Setup
			useFakeTimers();
			mockGitThrowingErrorOnce('line1\nline2\nline3');
			vscode.window.showErrorMessage.mockResolvedValueOnce(null);

			// Run
			const resultPromise = dataSource.openExternalDirDiff('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b', utils.UNCOMMITTED, true);

			// Assert
			expect(setTimeout).toHaveBeenCalledWith(expect.anything(), 1500);

			// Run
			vi.runOnlyPendingTimers();
			useRealTimers();
			const result = await resultPromise;

			// Assert
			expect(result).toBe(null);
			expect(spyOnSpawn).toBeCalledWith('/path/to/git', ['difftool', '--dir-diff', '-g', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b'], expect.objectContaining({ cwd: '/path/to/repo' }));
			expect(spyOnLog).toHaveBeenCalledWith('External diff tool is being opened (1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b)');
			await waitForExpect(() => {
				expect(spyOnLog).toHaveBeenCalledWith('External diff tool has exited (1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b)');
				expect(spyOnLogError).toBeCalledWith('line1 line2 line3');
				expect(vscode.window.showErrorMessage).toBeCalledWith('line1 line2 line3');
			});
		});
	});

	describe('onDidChangeConfiguration', () => {
		it('Should not trigger Git command formats to be regenerated if they are unaffected by the change', () => {
			// Setup
			const spyOnGenerateGitCommandFormats = vi.spyOn(dataSource as any, 'generateGitCommandFormats');

			// Run
			onDidChangeConfiguration.emit({
				affectsConfiguration: (section) => section === 'easy-graph.commitDetailsView.autoCenter'
			});

			// Assert
			expect(spyOnGenerateGitCommandFormats).toHaveBeenCalledTimes(0);
		});
	});

	describe('spawn other error cases', () => {
		it('Should return the "Unable to Find Git" error message when no git executable is known', async () => {
			// Setup
			dataSource.dispose();
			dataSource = new DataSource(null, onDidChangeConfiguration.subscribe, onDidChangeGitExecutable.subscribe, logger);

			// Run
			const result = await dataSource.checkoutCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b');

			// Assert
			expect(result).toBe('Unable to find a Git executable. Either: Set the Visual Studio Code Setting "git.path" to the path and filename of an existing Git executable, or install Git and restart Visual Studio Code.');
		});

		it('Should resolve child process promise only once with cp error', async () => {
			// Setup
			mockSpyOnSpawn(spyOnSpawn, (onCallbacks, stderrOnCallbacks, stdoutOnCallbacks) => {
				stdoutOnCallbacks['close']();
				stderrOnCallbacks['close']();
				onCallbacks['error'](new Error('error message\r\nsecond line'));
				onCallbacks['exit'](0);
			});

			// Run
			const result = await dataSource.checkoutCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b');

			// Assert
			expect(result).toBe('error message\nsecond line');
		});

		it('Should return an empty error message thrown by git', async () => {
			// Setup
			mockSpyOnSpawn(spyOnSpawn, (onCallbacks, stderrOnCallbacks, stdoutOnCallbacks) => {
				stdoutOnCallbacks['close']();
				stderrOnCallbacks['close']();
				onCallbacks['exit'](1);
			});

			// Run
			const result = await dataSource.checkoutCommit('/path/to/repo', '1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b');

			// Assert
			expect(result).toBe('');
		});
	});


	// -- Graph column simulator (mirrors graph.ts determinePath + getAvailableColour) --
	function simulateGraphColumns(commits: { hash: string; parents: string[] }[]): number[] {
		const commitIdx: Record<string, number> = {};
		commits.forEach((c, i) => { commitIdx[c.hash] = i; });
		const columns: number[] = Array.from({ length: commits.length }, () => -1);
		const availableColours: number[] = [];
		const onBranch: (number | null)[] = Array.from({ length: commits.length }, () => null);

		const getAvailableColour = (startAt: number): number => {
			for (let i = 0; i < availableColours.length; i++) {
				if (startAt > availableColours[i]) return i;
			}
			availableColours.push(0);
			return availableColours.length - 1;
		};

		for (let startAt = 0; startAt < commits.length; startAt++) {
			if (onBranch[startAt] !== null) continue;
			const colour = getAvailableColour(startAt);
			columns[startAt] = colour;
			onBranch[startAt] = colour;

			const resolvedParents = commits[startAt].parents
				.filter(p => typeof commitIdx[p] === 'number')
				.map(p => commitIdx[p]);

			if (resolvedParents.length === 0) {
				// No parents - branch ends here (mirrors graph.ts parentVertex===null early return)
				availableColours[colour] = startAt;
				continue;
			}

			// Follow first parent chain
			let cur = startAt;
			let parentIdx: number | undefined = resolvedParents[0];
			while (parentIdx !== undefined && onBranch[parentIdx] === null) {
				columns[parentIdx] = colour;
				onBranch[parentIdx] = colour;
				cur = parentIdx;
				const nextParents = commits[cur].parents
					.filter(p => typeof commitIdx[p] === 'number')
					.map(p => commitIdx[p]);
				parentIdx = nextParents.length > 0 ? nextParents[0] : undefined;
			}
			availableColours[colour] = cur;
		}
		return columns;
	}

	// === Graph column simulator standalone tests ===
	describe('simulateGraphColumns', () => {
		it('Should assign all disconnected groups to column 0', () => {
			// 3 disconnected groups, each linear
			const commits = [
				{ hash: 'A', parents: ['B'] },
				{ hash: 'B', parents: [] },
				// group break
				{ hash: 'C', parents: ['D'] },
				{ hash: 'D', parents: [] },
				// group break
				{ hash: 'E', parents: ['F'] },
				{ hash: 'F', parents: [] }
			];
			const cols = simulateGraphColumns(commits);
			expect(cols[0]).toBe(0); // A on col 0
			expect(cols[2]).toBe(0); // C on col 0 (reuse)
			expect(cols[4]).toBe(0); // E on col 0 (reuse)
		});

		it('Should use new column for concurrent branches', () => {
			// A -> C, B -> C (fork: A and B are siblings)
			const commits = [
				{ hash: 'A', parents: ['C'] },
				{ hash: 'B', parents: ['C'] },
				{ hash: 'C', parents: [] }
			];
			const cols = simulateGraphColumns(commits);
			expect(cols[0]).toBe(0); // A on col 0
			expect(cols[1]).toBe(1); // B on col 1 (A's branch still active)
		});

		it('Should detect fan-out when parentless commits dont free columns', () => {
			// Simulate OLD behavior (no early return) by giving orphan parents
			// that don't exist in the commit array
			const commits = [
				{ hash: 'A', parents: ['X'] }, // X not in array -> orphan
				{ hash: 'B', parents: ['Y'] }, // Y not in array -> orphan
				{ hash: 'C', parents: ['Z'] } // Z not in array -> orphan
			];
			const cols = simulateGraphColumns(commits);
			// With empty resolved parents, each gets column 0 (proper behavior)
			// X, Y, Z are not in commitIdx so resolvedParents is []
			expect(cols[0]).toBe(0);
			expect(cols[1]).toBe(0);
			expect(cols[2]).toBe(0);
		});
	});
});
