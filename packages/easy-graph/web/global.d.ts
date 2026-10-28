import * as GG from '../src/types'; // Import types from back-end

declare global {

	/* Visual Studio Code API Types */

	function acquireVsCodeApi(): {
		getState: () => WebViewState | null,
		postMessage: (message: GG.RequestMessage) => void,
		setState: (state: WebViewState) => void
	};


	/* State Types */

	type Config = GG.GitGraphViewConfig;

	const initialState: GG.GitGraphViewInitialState;
	const globalState: GG.DeepReadonly<GG.GitGraphViewGlobalState>;
	const workspaceState: GG.DeepReadonly<GG.GitGraphViewWorkspaceState>;

	type AvatarImageCollection = { [email: string]: string };

	interface ExpandedCommit {
		index: number;
		commitHash: string;
		commitElem: HTMLElement | null;
		compareWithHash: string | null;
		compareWithElem: HTMLElement | null;
		commitDetails: GG.GitCommitDetails | null;
		fileChanges: ReadonlyArray<GG.GitFileChange> | null;
		fileTree: FileTreeFolder | null;
		avatar: string | null;
		codeReview: GG.CodeReview | null;
		lastViewedFile: string | null;
		loading: boolean;
		scrollTop: {
			summary: number,
			fileView: number
		};
		contextMenuOpen: {
			summary: boolean,
			fileView: number
		};
		compareReversed?: boolean; // The comparison is displayed from the newer commit to the older commit
		fileFilter?: string; // The filter of the files displayed in the file view
		containedInBranches?: ReadonlyArray<string> | string | null; // The branches containing the commit: array => loaded, string => error message, NULL => loading, undefined => not requested
	}

	interface WebViewState {
		readonly currentRepo: string;
		readonly currentRepoLoading: boolean;
		readonly gitRepos: GG.GitRepoSet;
		readonly gitBranches: ReadonlyArray<string>;
		readonly gitBranchHead: string | null;
		readonly gitConfig: GG.GitRepoConfig | null;
		readonly gitRemotes: ReadonlyArray<string>;
		readonly gitStashes: ReadonlyArray<GG.GitStash>;
		readonly gitTags: ReadonlyArray<string>;
		readonly commits: GG.GitCommit[];
		readonly commitHead: string | null;
		readonly avatars: AvatarImageCollection;
		readonly currentBranches: string[] | null;
		readonly currentAuthors: string[] | null;
		readonly messageFilter?: string;
		readonly moreCommitsAvailable: boolean;
		readonly maxCommits: number;
		readonly onlyFollowFirstParent: boolean;
		readonly expandedCommit: ExpandedCommit | null;
		readonly scrollTop: number;
		readonly selectedCommits?: ReadonlyArray<string>; // The hashes of the selected commits, absent in the state saved by older versions
		readonly findWidget: FindWidgetState;
		readonly settingsWidget: SettingsWidgetState;
	}


	/* Commit Details / Comparison View File Tree Types */

	interface FileTreeFile {
		readonly type: 'file';
		readonly name: string;
		readonly index: number;
		reviewed: boolean;
	}

	interface FileTreeRepo {
		readonly type: 'repo';
		readonly name: string;
		readonly path: string;
	}

	interface FileTreeFolder {
		readonly type: 'folder';
		readonly name: string;
		readonly folderPath: string;
		readonly contents: FileTreeFolderContents;
		open: boolean;
		reviewed: boolean;
	}

	type FileTreeLeaf = FileTreeFile | FileTreeRepo;
	type FileTreeNode = FileTreeFolder | FileTreeLeaf;
	type FileTreeFolderContents = { [name: string]: FileTreeNode };


	/* Dialog & ContextMenu shared base Target interfaces */

	interface CommitOrRefTarget {
		type: TargetType.Commit | TargetType.Ref | TargetType.CommitDetailsView;
		elem: HTMLElement;
	}

	interface RepoTarget {
		type: TargetType.Repo;
	}

	interface CommitTarget extends CommitOrRefTarget {
		hash: string;
	}

	interface RefTarget extends CommitTarget {
		ref: string;
	}
}

export as namespace GG;
export = GG;
