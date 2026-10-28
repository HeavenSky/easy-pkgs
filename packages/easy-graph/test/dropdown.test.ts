import { transformSync } from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { describe, expect, it } from 'vitest';

/**
 * The selection and keyboard navigation rules of the control bar dropdowns (web/dropdown.ts).
 *
 * The webview scripts are global scripts that are concatenated by build.mjs, so web/dropdown.ts is transpiled and evaluated in a
 * sandbox here. Only its DOM-free functions are used, the Dropdown class itself needs a DOM.
 */
interface DropdownLogic {
	createDropdownFilterMatcher(text: string): (name: string) => boolean;
	stepDropdownFocus(visible: ReadonlyArray<number>, current: number | null, step: number): number | null;
	onlyDropdownOption(count: number, index: number): boolean[];
	addDropdownOption(selection: ReadonlyArray<boolean>, index: number): boolean[];
	toggleDropdownOption(selection: ReadonlyArray<boolean>, index: number): boolean[];
	removeDropdownOption(selection: ReadonlyArray<boolean>, standalone: ReadonlyArray<boolean>, index: number): boolean[];
	invertDropdownSelection(selection: ReadonlyArray<boolean>, standalone: ReadonlyArray<boolean>, disabled: ReadonlyArray<boolean>): boolean[];
	dropdownSelectionsEqual(a: ReadonlyArray<boolean>, b: ReadonlyArray<boolean>): boolean;
	isAdditiveSelectionEvent(e: { ctrlKey: boolean, metaKey: boolean } | undefined): boolean;
}

function loadDropdownLogic(): DropdownLogic {
	const source = fs.readFileSync(path.join(__dirname, '..', 'web', 'dropdown.ts'), 'utf8');
	const sandbox = {};
	vm.runInNewContext(transformSync(source, { loader: 'ts' }).code, sandbox);
	return <DropdownLogic>sandbox;
}

const logic = loadDropdownLogic();

// The sandbox has its own Array, so results are compared after copying them into arrays of this realm
const copy = (selection: ReadonlyArray<boolean>) => Array.from(selection);

describe('Dropdown filter', () => {
	it('Should match the text anywhere in the name, ignoring case', () => {
		const matches = logic.createDropdownFilterMatcher('Feat');
		expect(['feature/a', 'my-FEAT', 'master'].map(matches)).toStrictEqual([true, true, false]);
	});

	it('Should match "*" with any sequence of characters', () => {
		const matches = logic.createDropdownFilterMatcher('f*/x*');
		expect(['feature/x1', 'fix/xy', 'feature/y', 'x/f/x'].map(matches)).toStrictEqual([true, true, false, true]);
	});

	it('Should match the other regular expression characters literally', () => {
		const matches = logic.createDropdownFilterMatcher('v1.0*(rc)');
		expect(['v1.0-(rc)', 'v100-(rc)', 'v1.0-rc'].map(matches)).toStrictEqual([true, false, false]);
	});

	it('Should match every name when the text is empty', () => {
		expect(logic.createDropdownFilterMatcher('')('anything')).toBe(true);
	});
});

describe('Dropdown keyboard navigation', () => {
	const visible = [0, 2, 5];

	it('Should start at the first visible option when moving down, and at the last when moving up', () => {
		expect(logic.stepDropdownFocus(visible, null, 1)).toBe(0);
		expect(logic.stepDropdownFocus(visible, null, -1)).toBe(5);
	});

	it('Should skip the hidden options', () => {
		expect(logic.stepDropdownFocus(visible, 0, 1)).toBe(2);
		expect(logic.stepDropdownFocus(visible, 5, -1)).toBe(2);
	});

	it('Should wrap around at either end', () => {
		expect(logic.stepDropdownFocus(visible, 5, 1)).toBe(0);
		expect(logic.stepDropdownFocus(visible, 0, -1)).toBe(5);
	});

	it('Should restart from an end when the highlighted option is no longer visible', () => {
		expect(logic.stepDropdownFocus(visible, 3, 1)).toBe(0);
		expect(logic.stepDropdownFocus(visible, 3, -1)).toBe(5);
	});

	it('Should not highlight anything when no option is visible', () => {
		expect(logic.stepDropdownFocus([], null, 1)).toBe(null);
		expect(logic.stepDropdownFocus([], 2, -1)).toBe(null);
	});
});

describe('Dropdown selection', () => {
	// Options: 0 => Show All, 1 => HEAD (standalone), 2 => master, 3 => develop, 4 => Tag: v1.0 (standalone)
	const standalone = [false, true, false, false, true];
	const showAll = [true, false, false, false, false];

	it('Should select only the chosen option, even if it was part of a larger selection', () => {
		expect(copy(logic.onlyDropdownOption(5, 2))).toStrictEqual([false, false, true, false, false]);
		expect(logic.dropdownSelectionsEqual(logic.onlyDropdownOption(5, 2), [false, false, true, true, false])).toBe(false);
		expect(logic.dropdownSelectionsEqual(logic.onlyDropdownOption(5, 2), [false, false, true, false, false])).toBe(true);
	});

	it('Should add an option to the selection, replacing "Show All"', () => {
		expect(copy(logic.addDropdownOption([false, false, true, false, false], 3))).toStrictEqual([false, false, true, true, false]);
		expect(copy(logic.addDropdownOption(showAll, 3))).toStrictEqual([false, false, false, true, false]);
		expect(copy(logic.addDropdownOption([false, false, true, false, false], 0))).toStrictEqual(showAll);
	});

	it('Should toggle options, and fall back to "Show All" when the last option is turned off', () => {
		const masterAndDevelop = logic.toggleDropdownOption(logic.toggleDropdownOption(showAll, 2), 3);
		expect(copy(masterAndDevelop)).toStrictEqual([false, false, true, true, false]);
		expect(copy(logic.toggleDropdownOption(masterAndDevelop, 2))).toStrictEqual([false, false, false, true, false]);
		expect(copy(logic.toggleDropdownOption([false, false, false, true, false], 3))).toStrictEqual(showAll);
		expect(copy(logic.toggleDropdownOption(masterAndDevelop, 0))).toStrictEqual(showAll);
	});

	it('Should expand "Show All" into the options it covers, without HEAD and tags, when an option is removed', () => {
		expect(copy(logic.removeDropdownOption(showAll, standalone, 2))).toStrictEqual([false, false, false, true, false]);
	});

	it('Should remove an option from a selection, and fall back to "Show All" when nothing remains', () => {
		expect(copy(logic.removeDropdownOption([false, true, true, false, false], standalone, 2))).toStrictEqual([false, true, false, false, false]);
		expect(copy(logic.removeDropdownOption([false, true, false, false, false], standalone, 1))).toStrictEqual(showAll);
	});

	it('Should invert the options covered by "Show All", leaving the standalone and disabled options', () => {
		const disabled = [false, false, false, true, false];
		expect(copy(logic.invertDropdownSelection([false, false, true, false, false], standalone, [false, false, false, false, false]))).toStrictEqual([false, false, false, true, false]);
		expect(copy(logic.invertDropdownSelection([false, true, true, true, true], standalone, disabled))).toStrictEqual([false, false, false, true, false]);
		expect(copy(logic.invertDropdownSelection([false, false, false, false, false], standalone, disabled))).toStrictEqual([false, false, true, false, false]);
	});

	it('Should treat Ctrl and Cmd as adding to the selection', () => {
		expect(logic.isAdditiveSelectionEvent({ ctrlKey: true, metaKey: false })).toBe(true);
		expect(logic.isAdditiveSelectionEvent({ ctrlKey: false, metaKey: true })).toBe(true);
		expect(logic.isAdditiveSelectionEvent({ ctrlKey: false, metaKey: false })).toBe(false);
		expect(logic.isAdditiveSelectionEvent(undefined)).toBe(false);
	});
});
