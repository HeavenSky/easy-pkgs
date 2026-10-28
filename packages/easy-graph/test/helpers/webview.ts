import { buildSync } from 'esbuild';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as vm from 'node:vm';

const WEB_DIR = fileURLToPath(new URL('../../web', import.meta.url));

/**
 * Load the webview scripts into a sandbox and return some of their top-level functions, to test the ones that don't depend
 * on a rendered Easy Graph View (e.g. building the File Tree).
 *
 * The scripts are bundled like `build.mjs` does (they share one scope, with the enums of `src/types.ts`). The sandbox only
 * provides what is needed to evaluate them: the view itself is created on the "load" event, which never happens here.
 * @param names The names of the functions.
 */
export function loadWebviewFunctions<T extends string>(names: ReadonlyArray<T>): { [name in T]: (...args: any[]) => any } {
	const files = readdirSync(WEB_DIR).filter((name) => name.endsWith('.ts') && !name.endsWith('.d.ts') && name !== 'utils.ts' && name !== 'main.ts').sort();
	const contents = [
		'import * as GG from "../src/types";',
		...['utils.ts', ...files, 'main.ts'].map((name) => readFileSync(WEB_DIR + '/' + name, 'utf8')),
		'globalThis.__webviewExports = { ' + names.join(', ') + ' };'
	].join('\n');
	const result = buildSync({
		stdin: { contents: contents, resolveDir: WEB_DIR, sourcefile: 'web.ts', loader: 'ts' },
		bundle: true,
		format: 'iife',
		platform: 'browser',
		target: 'es2022',
		write: false,
		logLevel: 'silent'
	});

	const noop = () => { };
	const sandbox: { [key: string]: unknown } = {
		acquireVsCodeApi: () => ({ getState: () => null, setState: noop, postMessage: noop }),
		document: { addEventListener: noop },
		window: { addEventListener: noop },
		setTimeout: setTimeout,
		clearTimeout: clearTimeout
	};
	vm.runInNewContext(result.outputFiles[0].text, sandbox);
	return <{ [name in T]: (...args: any[]) => any }>sandbox.__webviewExports;
}
