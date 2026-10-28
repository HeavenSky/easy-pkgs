interface DropdownOption {
	readonly name: string;
	readonly value: string;
	readonly hint?: string;
	readonly displayName?: string; // The text displayed as the current value when the option is selected (default: name)
	readonly standalone?: boolean; // The option isn't covered by "Show All" (e.g. HEAD or a tag), so it stays unselected when "Show All" is expanded into the individual options
	readonly disabled?: boolean; // The option is shown greyed out, and clicking it doesn't change whether it's selected (e.g. it doesn't apply in the current state)
}

const DROPDOWN_DOUBLE_CLICK_MS = 500;
const CLASS_DROPDOWN_KEYBOARD_FOCUS = 'keyboardFocus';

/**
 * Implements the dropdown inputs used in the Git Graph View's top control bar.
 *
 * In a dropdown that allows multiple items to be selected, the first option is always "Show All". Such a dropdown can also be
 * restricted to selecting a single item per click, with Ctrl / Cmd + click (or Ctrl / Cmd + Enter) adding to the selection.
 */
class Dropdown {
	private readonly showInfo: boolean;
	private readonly multipleAllowed: boolean;
	private readonly additiveOnlyWithModifier: boolean;
	private readonly changeCallback: (values: string[]) => void;
	private readonly filterSubmitCallback: ((value: string) => void) | null;
	private optionContextMenuCallback: ((value: string, event: MouseEvent) => void) | null = null;

	private options: ReadonlyArray<DropdownOption> = [];
	private selection: boolean[] = [];
	private dropdownVisible: boolean = false;
	private disabled: boolean = false;

	// Double click detection (only the "Show All" option of multi-select dropdowns reacts to double clicks)
	private lastClickedIndex: number = -1;
	private doubleClickTimeout: ReturnType<typeof setTimeout> | null = null;

	// Keyboard navigation: the option highlighted by Up / Down, and whether the user moved the highlight since
	// the filter text last changed (if not, the highlight is just the first visible option).
	private focusIndex: number | null = null;
	private focusMovedByKeys: boolean = false;

	private readonly elem: HTMLElement;
	private readonly currentValueElem: HTMLDivElement;
	private readonly menuElem: HTMLDivElement;
	private readonly optionsElem: HTMLDivElement;
	private readonly noResultsElem: HTMLDivElement;
	private readonly filterInput: HTMLInputElement;

	/**
	 * Constructs a Dropdown instance.
	 * @param id The ID of the HTML Element that the dropdown should be rendered in.
	 * @param showInfo Should an information icon be shown on the right of each dropdown item.
	 * @param multipleAllowed Can multiple items be selected.
	 * @param dropdownType The type of content the dropdown is being used for.
	 * @param changeCallback A callback to be invoked when the selected item(s) of the dropdown changes.
	 * @param singleSelectPerClick Only used when multiple items can be selected: TRUE => A click selects only the clicked item, and
	 * Ctrl / Cmd + click adds or removes an item; FALSE => Every click adds or removes an item.
	 * @param filterSubmitCallback Optional callback invoked when Enter is pressed in the filter input with non-empty text.
	 * @returns The Dropdown instance.
	 */
	constructor(id: string, showInfo: boolean, multipleAllowed: boolean, dropdownType: string, changeCallback: (values: string[]) => void, singleSelectPerClick: boolean = false, filterSubmitCallback: ((value: string) => void) | null = null) {
		this.showInfo = showInfo;
		this.multipleAllowed = multipleAllowed;
		this.additiveOnlyWithModifier = multipleAllowed && singleSelectPerClick;
		this.changeCallback = changeCallback;
		this.filterSubmitCallback = filterSubmitCallback;
		this.elem = document.getElementById(id)!;

		this.menuElem = document.createElement('div');
		this.menuElem.className = 'dropdownMenu';

		const filterElem = this.menuElem.appendChild(document.createElement('div'));
		filterElem.className = 'dropdownFilter';

		this.filterInput = filterElem.appendChild(document.createElement('input'));
		this.filterInput.className = 'dropdownFilterInput';
		this.filterInput.placeholder = 'Filter ' + dropdownType + '...';
		this.filterInput.title = 'Use * as a wildcard. Up / Down to move, Enter to select' + (multipleAllowed ? ' (Enter without moving selects all matching ' + dropdownType + ')' : '') + '.';

		this.optionsElem = this.menuElem.appendChild(document.createElement('div'));
		this.optionsElem.className = 'dropdownOptions';

		this.noResultsElem = this.menuElem.appendChild(document.createElement('div'));
		this.noResultsElem.className = 'dropdownNoResults';
		this.noResultsElem.innerHTML = 'No results found.';

		this.currentValueElem = this.elem.appendChild(document.createElement('div'));
		this.currentValueElem.className = 'dropdownCurrentValue';

		// The "multi" class reserves the space for the check marks, which are only shown when every click adds or removes an item
		alterClass(this.elem, 'multi', multipleAllowed && !this.additiveOnlyWithModifier);
		this.elem.appendChild(this.menuElem);

		document.addEventListener('click', (e) => this.onDocumentClick(e), true);
		document.addEventListener('contextmenu', (e) => this.onDocumentContextMenu(e), true);
		// "input" (rather than "keyup") keeps the filtered options in sync with the text even when Enter is pressed before the
		// previous key is released, or the text is pasted / dropped with the mouse.
		this.filterInput.addEventListener('input', () => {
			this.focusMovedByKeys = false;
			this.applyFilter();
		});
		this.filterInput.addEventListener('keydown', (e) => this.onFilterKeyDown(e));
	}

	/**
	 * Set the callback invoked when an option is right-clicked while the dropdown is open.
	 * @param callback The callback, receiving the value of the option and the mouse event.
	 */
	public setOptionContextMenuCallback(callback: ((value: string, event: MouseEvent) => void) | null) {
		this.optionContextMenuCallback = callback;
	}

	/**
	 * Set the options that should be displayed in the dropdown.
	 * @param options An array of the options to display in the dropdown.
	 * @param optionsSelected An array of the selected options in the dropdown.
	 */
	public setOptions(options: ReadonlyArray<DropdownOption>, optionsSelected: string[] | null) {
		// The options can be replaced while the dropdown is open (e.g. once the tags are loaded), keep the keyboard focus on the
		// same option rather than on whichever option now has its index.
		const focusedValue = this.focusMovedByKeys && this.focusIndex !== null && this.focusIndex < this.options.length
			? this.options[this.focusIndex].value
			: null;

		this.options = options;
		this.selection = options.map((option) => optionsSelected !== null && optionsSelected.includes(option.value));
		if (options.length > 0 && !this.selection.includes(true)) {
			this.selection[0] = true;
		}

		const refocusIndex = focusedValue !== null ? options.findIndex((option) => option.value === focusedValue) : -1;
		this.focusIndex = refocusIndex > -1 ? refocusIndex : null;
		this.focusMovedByKeys = refocusIndex > -1;

		if (this.dropdownVisible && options.length <= 1) this.close();
		this.render();
		this.clearDoubleClickTimeout();
	}

	/**
	 * Is a value selected in the dropdown (respecting "Show All")
	 * @param value The value to check.
	 * @returns TRUE => The value is selected, FALSE => The value is not selected.
	 */
	public isSelected(value: string) {
		if (this.options.length === 0) return false;
		if (this.isShowAllActive()) return true;
		const index = this.indexOfValue(value);
		return index > -1 && this.selection[index];
	}

	/**
	 * Is Show All selected in the dropdown
	 * @returns TRUE => Show All is selected, FALSE => Show All is not selected
	 */
	public isShowAllSelected() {
		return this.selection[0] === true;
	}

	/**
	 * Select a specific value in the dropdown. When "Show All" is selected, or the dropdown only adds to the selection with Ctrl / Cmd
	 * and neither is pressed, the value replaces the current selection.
	 * @param value The value to select.
	 * @param event The mouse event that triggered the selection (used to check for Ctrl / Cmd).
	 */
	public selectOption(value: string, event: MouseEvent | undefined) {
		const index = this.indexOfValue(value);
		if (index < 0) return;
		const additive = this.multipleAllowed && !this.selection[0] && (!this.additiveOnlyWithModifier || isAdditiveSelectionEvent(event));
		this.applySelection(additive ? addDropdownOption(this.selection, index) : onlyDropdownOption(this.options.length, index), true);
	}

	/**
	 * Unselect a specific value in the dropdown.
	 * @param value The value to unselect.
	 */
	public unselectOption(value: string) {
		const index = this.indexOfValue(value);
		if (!this.multipleAllowed || index < 1) return;
		this.applySelection(removeDropdownOption(this.selection, this.getStandaloneMask(), index), true);
	}

	/**
	 * Enable or disable the dropdown. A disabled dropdown is shown greyed out, and can't be opened.
	 * @param disabled TRUE => Disable the dropdown, FALSE => Enable the dropdown.
	 */
	public setDisabled(disabled: boolean) {
		if (this.disabled === disabled) return;
		this.disabled = disabled;
		alterClass(this.elem, CLASS_DISABLED, disabled);
		if (disabled && this.dropdownVisible) this.close();
	}

	/**
	 * Refresh the rendered dropdown to apply style changes.
	 */
	public refresh() {
		if (this.options.length > 0) this.render();
	}

	/**
	 * Is the dropdown currently open (i.e. is the list of options visible).
	 * @returns TRUE => The dropdown is open, FALSE => The dropdown is not open
	 */
	public isOpen() {
		return this.dropdownVisible;
	}

	/**
	 * Close the dropdown.
	 */
	public close() {
		this.elem.classList.remove('dropdownOpen');
		this.dropdownVisible = false;
		this.focusIndex = null;
		this.focusMovedByKeys = false;
		this.clearDoubleClickTimeout();
	}

	/**
	 * Open the dropdown with an empty filter.
	 */
	private open() {
		this.dropdownVisible = true;
		this.filterInput.value = '';
		this.focusIndex = null;
		this.focusMovedByKeys = false;
		this.applyFilter();
		this.elem.classList.add('dropdownOpen');
		this.filterInput.focus();
	}


	/* Event Handlers */

	private onDocumentClick(e: MouseEvent) {
		if (!e.target) return;
		if (e.target === this.currentValueElem) {
			if (this.dropdownVisible) {
				this.close();
			} else if (!this.disabled) {
				this.open();
			}
		} else if (this.dropdownVisible) {
			if ((<HTMLElement>e.target).closest('.dropdown') !== this.elem) {
				this.close();
			} else {
				const index = this.getOptionIndexOfTarget(e.target);
				if (index !== null) this.onOptionClick(index, isAdditiveSelectionEvent(e), false);
			}
		}
	}

	private onDocumentContextMenu(e: MouseEvent) {
		if (this.dropdownVisible && this.optionContextMenuCallback !== null && e.target) {
			const index = this.getOptionIndexOfTarget(e.target);
			if (index !== null) {
				// Right-click on an option: show the option's context menu instead of closing the dropdown silently
				const value = this.options[index].value;
				handledEvent(e);
				this.close();
				this.optionContextMenuCallback(value, e);
				return;
			}
		}
		this.close();
	}

	/**
	 * Handle the keyboard navigation of the dropdown via its filter input.
	 * - Up / Down: Move the highlight between the visible options (wrapping around at either end).
	 * - Enter: Select the highlighted option if it was moved to with Up / Down. Otherwise, if the filter input has text: submit it to
	 *   the filterSubmitCallback (e.g. custom paths), or (in multi-select dropdowns) select all of the visible options.
	 * - Escape: Close the dropdown.
	 * @param e The keyboard event.
	 */
	private onFilterKeyDown(e: KeyboardEvent) {
		// While a text composition (IME) is in progress, the keys belong to the composition
		if (e.isComposing) return;
		switch (e.key) {
			case 'ArrowDown':
			case 'ArrowUp':
				this.moveFocus(e.key === 'ArrowDown' ? 1 : -1);
				handledEvent(e);
				break;
			case 'Enter':
				this.onFilterEnter(isAdditiveSelectionEvent(e));
				handledEvent(e);
				break;
			case 'Escape':
				if (this.dropdownVisible) {
					this.close();
					handledEvent(e);
				}
				break;
		}
	}

	private onFilterEnter(additive: boolean) {
		const text = this.filterInput.value.trim();
		if (this.focusMovedByKeys && this.focusIndex !== null) {
			this.onOptionClick(this.focusIndex, additive, true);
		} else if (text !== '' && this.filterSubmitCallback !== null) {
			this.close();
			this.filterSubmitCallback(text);
		} else if (text !== '' && this.multipleAllowed && this.selectAllMatches()) {
			// All of the matching options were selected
		} else if (this.focusIndex !== null) {
			this.onOptionClick(this.focusIndex, additive, true);
		}
	}

	/**
	 * Handle a click (or Enter) on a dropdown option.
	 * @param index The index of the option.
	 * @param additive Was Ctrl / Cmd pressed.
	 * @param fromKeyboard Was the option chosen with the keyboard (which never counts as a double click).
	 */
	private onOptionClick(index: number, additive: boolean, fromKeyboard: boolean) {
		if (this.options[index].disabled === true) return;
		const isDoubleClick = !fromKeyboard && this.doubleClickTimeout !== null && this.lastClickedIndex === index;
		this.clearDoubleClickTimeout();

		if (isDoubleClick) {
			if (this.multipleAllowed && index === 0) {
				// Double clicking "Show All" inverts the selection of the options it covers
				this.applySelection(invertDropdownSelection(this.selection, this.getStandaloneMask(), this.options.map((option) => option.disabled === true)), false);
			}
		} else if (this.multipleAllowed && (!this.additiveOnlyWithModifier || additive)) {
			// The click adds or removes the option, and the dropdown stays open
			this.applySelection(toggleDropdownOption(this.selection, index), true);
		} else {
			// The click replaces the selection with the option, even if the option was already part of a larger selection
			this.close();
			this.applySelection(onlyDropdownOption(this.options.length, index), true);
		}

		if (!fromKeyboard) {
			this.lastClickedIndex = index;
			this.doubleClickTimeout = setTimeout(() => this.clearDoubleClickTimeout(), DROPDOWN_DOUBLE_CLICK_MS);
		}
	}


	/* Selection */

	/**
	 * Apply a new selection, re-rendering the dropdown if it changed.
	 * @param selection The new selection.
	 * @param notify Should the change callback be invoked if the selection changed.
	 */
	private applySelection(selection: boolean[], notify: boolean) {
		if (dropdownSelectionsEqual(this.selection, selection)) return;
		this.selection = selection;

		const menuScroll = this.menuElem.scrollTop;
		this.render();
		if (this.dropdownVisible) this.menuElem.scroll(0, menuScroll);

		if (notify) this.changeCallback(this.getSelectedOptions(false));
	}

	/**
	 * Select all of the visible (filtered) options of a multi-select dropdown, replacing the current selection.
	 * @returns TRUE => The options were selected, FALSE => No option other than "Show All" is visible.
	 */
	private selectAllMatches() {
		const matches = this.getVisibleOptionIndexes().filter((index) => index > 0 && this.options[index].disabled !== true);
		if (matches.length === 0) return false;
		this.close();
		this.applySelection(this.selection.map((_, index) => matches.includes(index)), true);
		return true;
	}

	private isShowAllActive() {
		return this.multipleAllowed && this.selection[0];
	}

	private indexOfValue(value: string) {
		return this.options.findIndex((option) => option.value === value);
	}

	private getStandaloneMask() {
		return this.options.map((option) => option.standalone === true);
	}

	/**
	 * Get an array of the selected dropdown options.
	 * @param names TRUE => Return the names of the selected options, FALSE => Return the values of the selected options.
	 * @returns The array of the selected options.
	 */
	private getSelectedOptions(names: boolean) {
		const selected = this.isShowAllActive() ? [this.options[0]] : this.options.filter((_, index) => this.selection[index]);
		return selected.map((option) => names ? option.displayName || option.name : option.value);
	}


	/* Rendering */

	/**
	 * Render the dropdown.
	 */
	private render() {
		this.elem.classList.add('loaded');

		const currentValueText = formatCommaSeparatedList(this.getSelectedOptions(true));
		this.currentValueElem.title = currentValueText;
		this.currentValueElem.innerHTML = escapeHtml(currentValueText);

		const showCheckMarks = this.multipleAllowed && !this.additiveOnlyWithModifier;
		this.optionsElem.className = 'dropdownOptions' + (this.showInfo ? ' showInfo' : '');
		this.optionsElem.innerHTML = this.options.map((option, index) => {
			const escapedName = escapeHtml(option.name);
			const selected = this.selection[index];
			return '<div class="dropdownOption' + (selected ? ' ' + CLASS_SELECTED : '') + (option.disabled === true ? ' ' + CLASS_DISABLED : '') + '" data-id="' + index + '" title="' + escapedName + '"' + (option.disabled === true ? ' aria-disabled="true"' : '') + '>' +
				(showCheckMarks && selected ? '<div class="dropdownOptionMultiSelected">' + SVG_ICONS.check + '</div>' : '') +
				escapedName +
				(typeof option.hint === 'string' && option.hint !== '' ? '<span class="dropdownOptionHint">' + escapeHtml(option.hint) + '</span>' : '') +
				(this.showInfo ? '<div class="dropdownOptionInfo" data-tooltip="' + escapeHtml(option.value) + '">' + SVG_ICONS.info + '</div>' : '') +
				'</div>';
		}).join('');

		this.filterInput.style.display = 'none';
		this.noResultsElem.style.display = 'none';
		this.menuElem.style.cssText = 'left:0; overflow-y:auto; max-height:297px;'; // Max height for the dropdown is [filter (31px) + 9.5 * dropdown item (28px) = 297px]
		if (this.dropdownVisible) this.applyFilter();
	}

	/**
	 * Show only the options matching the filter text, and keep the keyboard highlight on a visible option.
	 */
	private applyFilter() {
		const matches = createDropdownFilterMatcher(this.filterInput.value);
		const optionElems = this.getOptionElems();
		let anyVisible = false, firstVisible: number | null = null, focusVisible = false;
		for (let i = 0; i < optionElems.length; i++) {
			const visible = i < this.options.length && matches(this.options[i].name);
			optionElems[i].style.display = visible ? 'block' : 'none';
			if (visible) {
				anyVisible = true;
				if (firstVisible === null && this.options[i].disabled !== true) firstVisible = i;
				if (i === this.focusIndex) focusVisible = true;
			}
		}
		if (!focusVisible) {
			this.focusIndex = firstVisible;
			this.focusMovedByKeys = false;
		}
		this.renderFocus(false);
		this.filterInput.style.display = 'block';
		this.noResultsElem.style.display = anyVisible ? 'none' : 'block';
	}

	/**
	 * Move the keyboard highlight to the next / previous visible option.
	 * @param step 1 => Down, -1 => Up.
	 */
	private moveFocus(step: number) {
		const next = stepDropdownFocus(this.getVisibleOptionIndexes().filter((index) => this.options[index].disabled !== true), this.focusIndex, step);
		if (next === null) return;
		this.focusIndex = next;
		this.focusMovedByKeys = true;
		this.renderFocus(true);
	}

	/**
	 * Render the keyboard highlight on the dropdown options.
	 * @param scroll Should the highlighted option be scrolled into view.
	 */
	private renderFocus(scroll: boolean) {
		const optionElems = this.getOptionElems();
		for (let i = 0; i < optionElems.length; i++) {
			alterClass(optionElems[i], CLASS_DROPDOWN_KEYBOARD_FOCUS, i === this.focusIndex);
		}
		if (scroll && this.focusIndex !== null && this.focusIndex < optionElems.length) {
			optionElems[this.focusIndex].scrollIntoView({ block: 'nearest' });
		}
	}


	/* Helpers */

	private getOptionElems() {
		return <HTMLCollectionOf<HTMLElement>>this.optionsElem.children;
	}

	private getVisibleOptionIndexes() {
		const optionElems = this.getOptionElems(), indexes: number[] = [];
		for (let i = 0; i < optionElems.length; i++) {
			if (optionElems[i].style.display !== 'none') indexes.push(i);
		}
		return indexes;
	}

	private getOptionIndexOfTarget(target: EventTarget) {
		const optionElem = <HTMLElement | null>(<HTMLElement>target).closest('.dropdownOption');
		if (optionElem === null || optionElem.parentNode !== this.optionsElem || typeof optionElem.dataset.id === 'undefined') return null;
		const index = parseInt(optionElem.dataset.id);
		return index >= 0 && index < this.options.length ? index : null;
	}

	/**
	 * Clear the timeout used to detect double clicks.
	 */
	private clearDoubleClickTimeout() {
		if (this.doubleClickTimeout !== null) {
			clearTimeout(this.doubleClickTimeout);
			this.doubleClickTimeout = null;
		}
	}
}


/* Dropdown Logic (kept free of the DOM so that it can be tested) */

/**
 * Is Ctrl (or Cmd on macOS) pressed, which adds to the selection of dropdowns that otherwise select a single item per click.
 * @param e The event.
 */
function isAdditiveSelectionEvent(e: MouseEvent | KeyboardEvent | undefined) {
	return typeof e !== 'undefined' && (e.ctrlKey || e.metaKey);
}

/**
 * Create the function that checks whether the name of a dropdown option matches the filter text (case insensitive). "*" in the
 * text matches any sequence of characters, otherwise the text can occur anywhere in the name.
 * @param text The filter text.
 * @returns The matching function.
 */
function createDropdownFilterMatcher(text: string): (name: string) => boolean {
	const lowerText = text.toLowerCase();
	if (lowerText.indexOf('*') === -1) {
		return (name) => name.toLowerCase().indexOf(lowerText) > -1;
	}
	const pattern = new RegExp(lowerText.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*'));
	return (name) => pattern.test(name.toLowerCase());
}

/**
 * Get the option that the keyboard highlight moves to, wrapping around at either end of the visible options.
 * @param visible The indexes of the visible options, in display order.
 * @param current The index of the highlighted option (NULL => None).
 * @param step 1 => Down, -1 => Up.
 * @returns The index of the option to highlight, or NULL if no option is visible.
 */
function stepDropdownFocus(visible: ReadonlyArray<number>, current: number | null, step: number): number | null {
	if (visible.length === 0) return null;
	const position = current !== null ? visible.indexOf(current) : -1;
	if (position === -1) {
		// Nothing visible is highlighted yet: Down starts at the top, Up at the bottom
		return step > 0 ? visible[0] : visible[visible.length - 1];
	}
	return visible[(position + step + visible.length) % visible.length];
}

/**
 * Get a selection containing only one option (for multi-select dropdowns, index 0 => "Show All").
 * @param count The number of options.
 * @param index The index of the option to select.
 */
function onlyDropdownOption(count: number, index: number): boolean[] {
	return Array.from({ length: count }, (_, i) => i === index);
}

/**
 * Add an option to the selection of a multi-select dropdown.
 * @param selection The current selection (index 0 => "Show All").
 * @param index The index of the option to add.
 */
function addDropdownOption(selection: ReadonlyArray<boolean>, index: number): boolean[] {
	if (index === 0) return onlyDropdownOption(selection.length, 0);
	const next = selection.slice();
	next[0] = false;
	next[index] = true;
	return next;
}

/**
 * Toggle an option of a multi-select dropdown. "Show All" can only be turned on (which clears the other options), and turning off
 * the last selected option turns "Show All" back on.
 * @param selection The current selection (index 0 => "Show All").
 * @param index The index of the option to toggle.
 */
function toggleDropdownOption(selection: ReadonlyArray<boolean>, index: number): boolean[] {
	if (index === 0) return onlyDropdownOption(selection.length, 0);
	const next = selection.slice();
	next[0] = false;
	next[index] = !selection[index];
	if (!next.includes(true)) next[0] = true;
	return next;
}

/**
 * Remove an option from the selection of a multi-select dropdown. If "Show All" is selected, it's first expanded into the options
 * that it covers, i.e. all options except the standalone ones (such as HEAD or tags, which "Show All" doesn't load on their own).
 * @param selection The current selection (index 0 => "Show All").
 * @param standalone For each option, is it a standalone option.
 * @param index The index of the option to remove.
 */
function removeDropdownOption(selection: ReadonlyArray<boolean>, standalone: ReadonlyArray<boolean>, index: number): boolean[] {
	const next = selection[0]
		? selection.map((_, i) => i > 0 && !standalone[i])
		: selection.slice();
	next[index] = false;
	if (!next.includes(true)) next[0] = true;
	return next;
}

/**
 * Invert the selection of the options covered by "Show All" in a multi-select dropdown. Standalone options end up unselected,
 * disabled options (and "Show All" itself) are left as they are.
 * @param selection The current selection (index 0 => "Show All").
 * @param standalone For each option, is it a standalone option.
 * @param disabled For each option, is it disabled.
 */
function invertDropdownSelection(selection: ReadonlyArray<boolean>, standalone: ReadonlyArray<boolean>, disabled: ReadonlyArray<boolean>): boolean[] {
	return selection.map((selected, i) => i === 0 || disabled[i] ? selected : !standalone[i] && !selected);
}

/**
 * Are two dropdown selections equal.
 */
function dropdownSelectionsEqual(a: ReadonlyArray<boolean>, b: ReadonlyArray<boolean>) {
	return a.length === b.length && a.every((selected, index) => selected === b[index]);
}
