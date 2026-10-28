import { afterAll, beforeAll, beforeEach, describe, expect, it, type Mock, type MockInstance, vi } from 'vitest';
import { useFakeTimers } from './helpers/timers';
import * as date from './mocks/date';
import * as vscode from './mocks/vscode';
vi.mock('vscode', () => import('./mocks/vscode'));
vi.mock('../src/logger');
vi.mock('fs', { spy: true });

import * as fs from 'fs';
import { Logger } from '../src/logger';
import { RepoFileWatcher } from '../src/repoFileWatcher';

let logger: Logger;
let spyOnLog: MockInstance;

beforeAll(() => {
	logger = new Logger();
	spyOnLog = vi.spyOn(logger, 'log');
	useFakeTimers();
});

afterAll(() => {
	logger.dispose();
});

describe('RepoFileWatcher', () => {
	let repoFileWatcher: RepoFileWatcher;
	let callback: Mock;
	beforeEach(() => {
		callback = vi.fn();
		repoFileWatcher = new RepoFileWatcher(logger, callback);
	});

	it('Should start and receive file events', () => {
		// Setup
		repoFileWatcher.start('/path/to/repo');
		const onDidCreate = (<Mock>repoFileWatcher['fsWatcher']!.onDidCreate).mock.calls[0][0];
		const onDidChange = (<Mock>repoFileWatcher['fsWatcher']!.onDidChange).mock.calls[0][0];
		const onDidDelete = (<Mock>repoFileWatcher['fsWatcher']!.onDidDelete).mock.calls[0][0];

		// Run
		onDidCreate(vscode.Uri.file('/path/to/repo/file'));
		onDidChange(vscode.Uri.file('/path/to/repo/file'));
		onDidDelete(vscode.Uri.file('/path/to/repo/file'));
		vi.runOnlyPendingTimers();

		// Assert
		expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledWith('/path/to/repo/**');
		expect(callback).toHaveBeenCalledTimes(1);
	});

	it('Should stop a previous active File System Watcher before creating a new one', () => {
		// Setup
		repoFileWatcher.start('/path/to/repo1');
		const watcher = repoFileWatcher['fsWatcher']!;
		const onDidCreate = (<Mock>watcher.onDidCreate).mock.calls[0][0];

		// Run
		onDidCreate(vscode.Uri.file('/path/to/repo1/file'));
		repoFileWatcher.start('/path/to/repo2');
		vi.runOnlyPendingTimers();

		// Assert
		expect(<Mock>watcher.dispose).toHaveBeenCalledTimes(1);
		expect(callback).toHaveBeenCalledTimes(0);
	});

	it('Should only dispose the active File System Watcher if it exists', () => {
		// Run
		repoFileWatcher.stop();

		// Assert
		expect(spyOnLog).toHaveBeenCalledTimes(0);
	});

	it('Should ignore file system events while muted', () => {
		// Setup
		repoFileWatcher.start('/path/to/repo');
		const onDidCreate = (<Mock>repoFileWatcher['fsWatcher']!.onDidCreate).mock.calls[0][0];

		// Run
		repoFileWatcher.mute();
		onDidCreate(vscode.Uri.file('/path/to/repo/file'));
		vi.runOnlyPendingTimers();

		// Assert
		expect(callback).toHaveBeenCalledTimes(0);
	});

	it('Should resume reporting file events after 1.5 seconds', () => {
		// Setup
		date.setCurrentTime(1587559258);
		repoFileWatcher.start('/path/to/repo');
		const onDidCreate = (<Mock>repoFileWatcher['fsWatcher']!.onDidCreate).mock.calls[0][0];
		const onDidChange = (<Mock>repoFileWatcher['fsWatcher']!.onDidChange).mock.calls[0][0];

		// Run
		repoFileWatcher.mute();
		repoFileWatcher.unmute();
		onDidCreate(vscode.Uri.file('/path/to/repo/file'));
		date.setCurrentTime(1587559260);
		onDidChange(vscode.Uri.file('/path/to/repo/file'));
		vi.runOnlyPendingTimers();

		// Assert
		expect(callback).toHaveBeenCalledTimes(1);
	});

	it('Should ignore file system events on files ignored within .git directory', () => {
		// Setup
		repoFileWatcher.start('/path/to/repo');
		const onDidCreate = (<Mock>repoFileWatcher['fsWatcher']!.onDidCreate).mock.calls[0][0];

		// Run
		onDidCreate(vscode.Uri.file('/path/to/repo/.git/config-x'));
		vi.runOnlyPendingTimers();

		// Assert
		expect(callback).toHaveBeenCalledTimes(0);
	});

	it('Should limit the refreshes to at most one every 2 seconds', () => {
		// Setup
		repoFileWatcher.start('/path/to/repo');
		const onDidChange = (<Mock>repoFileWatcher['fsWatcher']!.onDidChange).mock.calls[0][0];
		onDidChange(vscode.Uri.file('/path/to/repo/file'));
		vi.runOnlyPendingTimers();
		expect(callback).toHaveBeenCalledTimes(1);

		// Run
		onDidChange(vscode.Uri.file('/path/to/repo/file'));
		vi.advanceTimersByTime(750);

		// Assert
		expect(callback).toHaveBeenCalledTimes(1);

		// Run
		vi.advanceTimersByTime(1250);

		// Assert
		expect(callback).toHaveBeenCalledTimes(2);
	});

	it('Should delay the refresh while the index is locked by Git', () => {
		// Setup
		const spyOnExistsSync = vi.mocked(fs.existsSync);
		spyOnExistsSync.mockReturnValueOnce(true);
		spyOnExistsSync.mockReturnValueOnce(false);
		repoFileWatcher.start('/path/to/repo');
		const onDidChange = (<Mock>repoFileWatcher['fsWatcher']!.onDidChange).mock.calls[0][0];

		// Run
		onDidChange(vscode.Uri.file('/path/to/repo/.git/index'));
		vi.advanceTimersByTime(750);

		// Assert
		expect(spyOnExistsSync).toHaveBeenCalledWith('/path/to/repo/.git/index.lock');
		expect(callback).toHaveBeenCalledTimes(0);

		// Run
		vi.advanceTimersByTime(500);

		// Assert
		expect(callback).toHaveBeenCalledTimes(1);
	});

	it('Should watch the Git directories that are outside of the repository (submodules and worktrees)', () => {
		// Setup
		repoFileWatcher.start('/path/to/repo');
		vi.mocked(vscode.workspace.createFileSystemWatcher).mockClear();

		// Run
		repoFileWatcher.watchGitDirs('/path/to/repo', ['/path/to/main/.git/worktrees/repo', '/path/to/main/.git', '/path/to/repo/.git']);

		// Assert
		expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledTimes(2);
		expect(repoFileWatcher['gitDir']).toBe('/path/to/main/.git/worktrees/repo');
		const watcher = repoFileWatcher['gitDirWatchers'][0];
		const onDidChange = (<Mock>watcher.onDidChange).mock.calls[0][0];

		// Run
		onDidChange(vscode.Uri.file('/path/to/main/.git/worktrees/repo/objects/ab/cdef'));
		vi.runOnlyPendingTimers();

		// Assert
		expect(callback).toHaveBeenCalledTimes(0);

		// Run
		onDidChange(vscode.Uri.file('/path/to/main/.git/worktrees/repo/HEAD'));
		vi.runOnlyPendingTimers();

		// Assert
		expect(callback).toHaveBeenCalledTimes(1);

		// Run
		repoFileWatcher.stop();

		// Assert
		expect(<Mock>watcher.dispose).toHaveBeenCalledTimes(1);
	});

	it('Shouldn\'t watch the Git directories of a repository that is no longer watched', () => {
		// Setup
		repoFileWatcher.start('/path/to/repo2');
		vi.mocked(vscode.workspace.createFileSystemWatcher).mockClear();

		// Run
		repoFileWatcher.watchGitDirs('/path/to/repo1', ['/path/to/other/.git']);

		// Assert
		expect(vscode.workspace.createFileSystemWatcher).not.toHaveBeenCalled();
	});
});
