import { beforeAll, describe, expect, it } from 'vitest';

import { GitFileChange, GitFileStatus } from '../src/types';
import { loadWebviewFunctions } from './helpers/webview';

const web = loadWebviewFunctions(['buildFileTree', 'getFileTreeFolder', 'getFileTreeLeaf', 'alterFileTreeFolderOpen', 'alterFileTreeFileReviewed', 'getChildByPathSegment', 'getFilesInTree', 'calcFileTreeFoldersReviewed', 'getComparableMergeParents', 'getRelativeFilePathsToCopy', 'getRepoScope']);

function change(newFilePath: string, oldFilePath: string = newFilePath, type: GitFileStatus = GitFileStatus.Modified): GitFileChange {
	return { oldFilePath: oldFilePath, newFilePath: newFilePath, type: type, additions: 1, deletions: 1 };
}

const noNestedRepos = () => null;

describe('Webview File Tree', () => {
	it('Stores files and folders named after Object.prototype members', () => {
		const files = [change('constructor/toString.ts'), change('src/__proto__/hasOwnProperty'), change('valueOf')];

		const tree = web.buildFileTree(files, null, noNestedRepos);

		const constructorFolder = web.getFileTreeFolder(tree, 'constructor');
		expect(constructorFolder).toMatchObject({ type: 'folder', name: 'constructor', folderPath: 'constructor' });
		expect(web.getFileTreeLeaf(constructorFolder, 'toString')).toBeUndefined();
		expect(web.getFileTreeLeaf(constructorFolder, 'toString.ts')).toMatchObject({ type: 'file', index: 0 });
		const protoFolder = web.getFileTreeFolder(web.getFileTreeFolder(tree, 'src'), '__proto__');
		expect(protoFolder).toMatchObject({ type: 'folder', folderPath: 'src/__proto__' });
		expect(web.getFileTreeLeaf(protoFolder, 'hasOwnProperty')).toMatchObject({ type: 'file', index: 1 });
		expect(web.getFileTreeLeaf(tree, 'valueOf')).toMatchObject({ type: 'file', index: 2 });
		expect(web.getFilesInTree(tree, files).sort()).toEqual(['constructor/toString.ts', 'src/__proto__/hasOwnProperty', 'valueOf']);
	});

	it('Does not find Object.prototype members in a tree restored from the saved state', () => {
		// The saved state is serialised as JSON, so the restored folders have a prototype again
		const tree = JSON.parse(JSON.stringify(web.buildFileTree([change('a/b.txt')], null, noNestedRepos)));

		expect(web.getFileTreeFolder(tree, 'constructor')).toBeUndefined();
		expect(web.getFileTreeLeaf(tree, 'toString')).toBeUndefined();
		expect(web.getChildByPathSegment(tree, 'constructor/name', true)).toBeUndefined();
		web.alterFileTreeFolderOpen(tree, 'constructor', false);
		web.alterFileTreeFileReviewed(tree, 'constructor', false);
		expect(Object.keys(tree.contents)).toEqual(['a']);
		expect(web.getFileTreeFolder(tree, 'a').open).toBe(true);
	});

	it.each([
		['the file is listed first', [change('a', 'a', GitFileStatus.Deleted), change('a/b.txt', 'a/b.txt', GitFileStatus.Added)], 0, 1],
		['the folder is listed first', [change('a/b.txt', 'a/b.txt', GitFileStatus.Added), change('a', 'a', GitFileStatus.Deleted)], 1, 0]
	])('Keeps a file and a folder with the same name (%s)', (_, files, fileIndex, folderFileIndex) => {
		const tree = web.buildFileTree(files, null, noNestedRepos);

		expect(web.getFileTreeLeaf(tree, 'a')).toMatchObject({ type: 'file', name: 'a', index: fileIndex });
		expect(web.getFileTreeLeaf(web.getFileTreeFolder(tree, 'a'), 'b.txt')).toMatchObject({ type: 'file', index: folderFileIndex });
		expect(web.getFilesInTree(tree, files).sort()).toEqual(['a', 'a/b.txt']);
		expect(web.getChildByPathSegment(tree, 'a', true)).toMatchObject({ type: 'file' });
		expect(web.getChildByPathSegment(tree, 'a', false)).toMatchObject({ type: 'folder' });
	});

	it('Marks the reviewed file, not the folder with the same name', () => {
		const files = [change('a'), change('a/b.txt')];
		const tree = web.buildFileTree(files, { id: 'x', lastActive: 0, lastViewedFile: null, remainingFiles: ['a', 'a/b.txt'] }, noNestedRepos);
		web.calcFileTreeFoldersReviewed(tree);

		web.alterFileTreeFileReviewed(tree, 'a', true);

		expect(web.getFileTreeLeaf(tree, 'a').reviewed).toBe(true);
		expect(web.getFileTreeLeaf(web.getFileTreeFolder(tree, 'a'), 'b.txt').reviewed).toBe(false);
		expect(web.getFileTreeFolder(tree, 'a').reviewed).toBe(false);
	});

	it('Shows a nested repository as a single entry', () => {
		const files = [change('modules/sub'), change('modules/sub/inner.txt'), change('readme.md')];

		const tree = web.buildFileTree(files, null, (relPath: string) => relPath === 'modules/sub' ? '/repo/modules/sub' : null);

		const modulesFolder = web.getFileTreeFolder(tree, 'modules');
		expect(Object.keys(modulesFolder.contents)).toEqual(['sub']);
		expect(web.getFileTreeLeaf(modulesFolder, 'sub')).toEqual({ type: 'repo', name: 'sub', path: '/repo/modules/sub' });
	});
});

describe('Webview View Changes from Parent N', () => {
	it('Numbers the loaded parents of a merge commit like <commit>^<n>', () => {
		const lookup = { p1: 1, p3: 7 };

		expect(web.getComparableMergeParents(['p1', 'p2', 'p3'], lookup)).toEqual([{ number: 1, hash: 'p1' }, { number: 3, hash: 'p3' }]);
	});

	it('Has no parents to compare for a commit that is not a merge', () => {
		expect(web.getComparableMergeParents(['p1'], { p1: 1 })).toEqual([]);
		expect(web.getComparableMergeParents([], {})).toEqual([]);
	});

	it('Ignores a parent whose hash is an Object.prototype member', () => {
		expect(web.getComparableMergeParents(['constructor', 'p2'], { p2: 2 })).toEqual([{ number: 2, hash: 'p2' }]);
	});
});

describe('Webview Copy All Relative File Paths to Clipboard', () => {
	const files = [change('src/main.ts'), change('docs/new.md', 'src/old.md', GitFileStatus.Renamed), change('README.md')];

	it('Copies every path, one per line, with "/" separators', () => {
		expect(web.getRelativeFilePathsToCopy(files, undefined)).toBe('src/main.ts\ndocs/new.md\nREADME.md');
		expect(web.getRelativeFilePathsToCopy(files, '  ')).toBe('src/main.ts\ndocs/new.md\nREADME.md');
	});

	it('Only copies the files shown by the file filter (renamed files also match by their old path)', () => {
		expect(web.getRelativeFilePathsToCopy(files, 'src/')).toBe('src/main.ts\ndocs/new.md');
		expect(web.getRelativeFilePathsToCopy(files, '*.MD')).toBe('docs/new.md\nREADME.md');
		expect(web.getRelativeFilePathsToCopy(files, 'nothing')).toBe('');
	});

	it('Copies a path only once', () => {
		expect(web.getRelativeFilePathsToCopy([change('a.txt'), change('a.txt')], undefined)).toBe('a.txt');
	});
});

describe('Webview Scope', () => {
	it('Expands "All" into every offered scope', () => {
		expect(Array.from(web.getRepoScope(['all']))).toStrictEqual(['local', 'remote', 'reflog', 'dangling']);
	});

	it('Returns the selected scopes in the order of the Scope dropdown', () => {
		expect(Array.from(web.getRepoScope(['reflog', 'local']))).toStrictEqual(['local', 'reflog']);
		expect(Array.from(web.getRepoScope(['remote']))).toStrictEqual(['remote']);
		expect(Array.from(web.getRepoScope(['dangling', 'reflog']))).toStrictEqual(['reflog', 'dangling']);
	});

	it('Falls back to every offered scope when none of the selected scopes is offered', () => {
		expect(Array.from(web.getRepoScope(['unknown']))).toStrictEqual(['local', 'remote', 'reflog', 'dangling']);
	});
});

beforeAll(() => {
	expect(Object.values(web).every((fn) => typeof fn === 'function')).toBe(true);
});
