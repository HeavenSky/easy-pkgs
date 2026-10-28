const CLASS_DIALOG_ACTIVE = 'dialogActive';
const CLASS_DIALOG_INPUT_INVALID = 'inputInvalid';
const CLASS_DIALOG_NO_INPUT = 'noInput';

const enum DialogType {
	Form,
	ActionRunning,
	Message
}

const enum DialogInputType {
	Text,
	TextRef,
	Select,
	Radio,
	Checkbox,
	TextArea
}

interface DialogTextInput {
	readonly type: DialogInputType.Text;
	readonly name: string;
	readonly default: string;
	readonly placeholder: string | null;
	readonly info?: string;
}

interface DialogTextRefInput {
	readonly type: DialogInputType.TextRef;
	readonly name: string;
	readonly default: string;
	readonly info?: string;
	readonly suggestions?: ReadonlyArray<string>; // Values suggested for autocompletion
}

type DialogSelectInput = {
	readonly type: DialogInputType.Select;
	readonly name: string;
	readonly options: ReadonlyArray<DialogSelectInputOption>;
	readonly default: string;
	readonly multiple?: false;
	readonly info?: string;
} | {
	readonly type: DialogInputType.Select;
	readonly name: string;
	readonly options: ReadonlyArray<DialogSelectInputOption>;
	readonly defaults: ReadonlyArray<string>;
	readonly multiple: true;
	readonly info?: string;
};

interface DialogRadioInput {
	readonly type: DialogInputType.Radio;
	readonly name: string;
	readonly options: ReadonlyArray<DialogRadioInputOption>;
	readonly default: string;
}

interface DialogCheckboxInput {
	readonly type: DialogInputType.Checkbox;
	readonly name: string;
	readonly value: boolean;
	readonly info?: string;
}

interface DialogTextAreaInput {
	readonly type: DialogInputType.TextArea;
	readonly name: string;
	readonly default: string;
	readonly placeholder: string | null;
	readonly info?: string;
	readonly rows?: number;
}

interface DialogSelectInputOption {
	readonly name: string;
	readonly value: string;
}

interface DialogRadioInputOption {
	readonly name: string;
	readonly value: string;
}

type DialogInput = DialogTextInput | DialogTextRefInput | DialogSelectInput | DialogRadioInput | DialogCheckboxInput | DialogTextAreaInput;
type DialogInputValue = string | string[] | boolean;

type DialogTarget = {
	type: TargetType.Commit | TargetType.Ref | TargetType.CommitDetailsView;
	elem: HTMLElement;
	hash: string;
	ref?: string;
} | RepoTarget;

/**
 * Implements the Git Graph View's dialogs.
 */
class Dialog {
	private elem: HTMLElement | null = null;
	private target: DialogTarget | null = null;
	private actioned: (() => void) | null = null;
	private type: DialogType | null = null;
	private customSelects: { [inputIndex: string]: CustomSelect } = {};
	private suggestionLists: SuggestionList[] = [];
	private onCloseCallback: (() => void) | null = null;

	private static readonly WHITESPACE_REGEXP = /\s/gu;

	/**
	 * Construct a new Dialog instance.
	 * @returns The Dialog instance.
	 */
	constructor() {
		// Native "title" tooltips aren't shown in some versions of Visual Studio Code, so elements with a
		// "data-tooltip" or "title" attribute display a custom tooltip while they are hovered. A "title" is moved
		// into "data-tooltip" on hover so the native tooltip doesn't also appear; code that later assigns a new
		// "title" (including an empty one) is picked up on the next hover.
		let tooltipElem: HTMLElement | null = null, tooltipTarget: Element | null = null, tooltipTimeout: number | null = null;
		const hideTooltip = () => {
			if (tooltipTimeout !== null) {
				clearTimeout(tooltipTimeout);
				tooltipTimeout = null;
			}
			if (tooltipElem !== null) {
				tooltipElem.remove();
				tooltipElem = null;
			}
			tooltipTarget = null;
		};
		document.addEventListener('mouseover', (e) => {
			const target = e.target instanceof Element ? e.target.closest('[data-tooltip],[title]') : null;
			if (target === tooltipTarget) return;
			hideTooltip();
			if (target === null) return;

			const title = target.getAttribute('title');
			if (title !== null) {
				target.removeAttribute('title');
				if (title !== '') {
					target.setAttribute('data-tooltip', title);
				} else {
					target.removeAttribute('data-tooltip');
				}
			}
			const text = target.getAttribute('data-tooltip');
			if (text === null || text === '') return;

			tooltipTarget = target;
			// Match the native tooltip's hover delay, so moving the mouse across the commit table doesn't flash tooltips
			tooltipTimeout = window.setTimeout(() => {
				tooltipTimeout = null;
				if (tooltipTarget === target && target.isConnected) showTooltip(target, text);
			}, 500);
		});
		const showTooltip = (target: Element, text: string) => {
			tooltipElem = document.createElement('div');
			tooltipElem.className = 'customTooltip';
			tooltipElem.textContent = text;
			document.body.appendChild(tooltipElem);
			const targetBounds = target.getBoundingClientRect(), tooltipBounds = tooltipElem.getBoundingClientRect();
			const left = Math.max(4, Math.min(targetBounds.left + targetBounds.width / 2 - tooltipBounds.width / 2, window.innerWidth - tooltipBounds.width - 4));
			const top = targetBounds.bottom + 6 + tooltipBounds.height <= window.innerHeight ? targetBounds.bottom + 6 : Math.max(4, targetBounds.top - 6 - tooltipBounds.height);
			tooltipElem.style.left = left + 'px';
			tooltipElem.style.top = top + 'px';
		};
		document.addEventListener('mousedown', hideTooltip);
		document.addEventListener('keydown', hideTooltip);
	}

	/**
	 * Show a confirmation dialog to the user.
	 * @param message A message outlining what the user is being asked to confirm.
	 * @param actionName The name of the affirmative action (e.g. "Yes, \<verb\>").
	 * @param actioned A callback to be invoked if the user takes the affirmative action.
	 * @param target The target that the dialog was triggered on.
	 */
	public showConfirmation(message: string, actionName: string, actioned: () => void, target: DialogTarget | null) {
		this.show(DialogType.Form, message, actionName, 'Cancel', () => {
			this.close();
			actioned();
		}, null, target);
	}

	/**
	 * Show a dialog presenting two options to the user.
	 * @param message A message outlining the decision the user has.
	 * @param buttonLabel1 The label for the primary (default) action.
	 * @param buttonAction1 A callback to be invoked when the primary (default) action is selected by the user.
	 * @param buttonLabel2 The label for the secondary action.
	 * @param buttonAction2 A callback to be invoked when the secondary action is selected by the user.
	 * @param target The target that the dialog was triggered on.
	 */
	public showTwoButtons(message: string, buttonLabel1: string, buttonAction1: () => void, buttonLabel2: string, buttonAction2: () => void, target: DialogTarget | null) {
		this.show(DialogType.Form, message, buttonLabel1, buttonLabel2, () => {
			this.close();
			buttonAction1();
		}, () => {
			this.close();
			buttonAction2();
		}, target);
	}

	/**
	 * Show a dialog asking the user to enter the name for a Git reference. The reference name will be validated before the dialog can be actioned.
	 * @param message A message outlining the purpose of the reference.
	 * @param defaultValue The default name of the reference.
	 * @param actionName The name of the action that the user must choose to proceed.
	 * @param actioned A callback to be invoked when the action is triggered (with the reference name as the first argument).
	 * @param target The target that the dialog was triggered on.
	 */
	public showRefInput(message: string, defaultValue: string, actionName: string, actioned: (value: string) => void, target: DialogTarget | null) {
		this.showForm(message, [
			{ type: DialogInputType.TextRef, name: '', default: defaultValue }
		], actionName, (values) => actioned(<string>values[0]), target);
	}

	/**
	 * Show a dialog to the user with a single checkbox input.
	 * @param message A message outlining the purpose of the dialog.
	 * @param checkboxLabel The label to be displayed alongside the checkbox.
	 * @param checkboxValue The default value of the checkbox.
	 * @param actionName The name of the action that the user must choose to proceed.
	 * @param actioned A callback to be invoked when the action is triggered (with the checkbox value as the first argument).
	 * @param target The target that the dialog was triggered on.
	 */
	public showCheckbox(message: string, checkboxLabel: string, checkboxValue: boolean, actionName: string, actioned: (value: boolean) => void, target: DialogTarget | null) {
		this.showForm(message, [
			{ type: DialogInputType.Checkbox, name: checkboxLabel, value: checkboxValue }
		], actionName, (values) => actioned(<boolean>values[0]), target);
	}

	/**
	 * Show a dialog to the user with a single select input.
	 * @param message A message outlining the purpose of the dialog.
	 * @param defaultValue The default value for the select input.
	 * @param options An array containing the options for the select input.
	 * @param actionName The name of the action that the user must choose to proceed.
	 * @param actioned A callback to be invoked when the action is triggered (with the selected value as the first argument).
	 * @param target The target that the dialog was triggered on.
	 */
	public showSelect(message: string, defaultValue: string, options: ReadonlyArray<DialogSelectInputOption>, actionName: string, actioned: (value: string) => void, target: DialogTarget | null) {
		this.showForm(message, [
			{ type: DialogInputType.Select, name: '', options: options, default: defaultValue }
		], actionName, (values) => actioned(<string>values[0]), target);
	}

	/**
	 * Show a dialog to the user with a single multi-select input.
	 * @param message A message outlining the purpose of the dialog.
	 * @param defaultValue The default value(s) for the select input.
	 * @param options An array containing the options for the select input.
	 * @param actionName The name of the action that the user must choose to proceed.
	 * @param actioned A callback to be invoked when the action is triggered (with the selected value(s) as the first argument).
	 * @param target The target that the dialog was triggered on.
	 */
	public showMultiSelect(message: string, defaultValues: ReadonlyArray<string>, options: ReadonlyArray<DialogSelectInputOption>, actionName: string, actioned: (value: string[]) => void, target: DialogTarget | null) {
		this.showForm(message, [
			{ type: DialogInputType.Select, name: '', options: options, defaults: defaultValues, multiple: true }
		], actionName, (values) => actioned(<string[]>values[0]), target);
	}

	/**
	 * Show a dialog to the user which can include any number of form inputs.
	 * @param message A message outlining the purpose of the dialog.
	 * @param inputs An array defining the form inputs to display in the dialog.
	 * @param actionName The name of the action that the user must choose to proceed.
	 * @param actioned A callback to be invoked when the action is triggered (with the form values as the first argument).
	 * @param target The target that the dialog was triggered on.
	 * @param secondaryActionName An optional name for the secondary action.
	 * @param secondaryActioned An optional callback to be invoked when the secondary action is selected by the user.
	 * @param includeLineBreak Should a line break be added between the message and form inputs.
	 */
	public showForm(message: string, inputs: ReadonlyArray<DialogInput>, actionName: string, actioned: (values: DialogInputValue[]) => void, target: DialogTarget | null, secondaryActionName: string = 'Cancel', secondaryActioned: ((values: DialogInputValue[]) => void) | null = null, includeLineBreak: boolean = true) {
		const multiElement = inputs.length > 1;
		const multiCheckbox = multiElement && inputs.every((input) => input.type === DialogInputType.Checkbox);
		const infoColRequired = inputs.some((input) => input.type !== DialogInputType.Checkbox && input.type !== DialogInputType.Radio && input.info);
		const inputRowsHtml = inputs.map((input, id) => {
			let inputHtml;
			if (input.type === DialogInputType.Radio) {
				inputHtml = '<td class="inputCol"' + (infoColRequired ? ' colspan="2"' : '') + '><span class="dialogFormRadio">' +
					input.options.map((option, optionId) => '<label><input type="radio" name="dialogInput' + id + '" value="' + optionId + '"' + (option.value === input.default ? ' checked' : '') + ' tabindex="' + (id + 1) + '"/><span class="customRadio"></span>' + escapeHtml(option.name) + '</label>').join('<br>') +
					'</span></td>';
			} else {
				const infoHtml = input.info ? '<span class="dialogInfo" data-tooltip="' + escapeHtml(input.info) + '">' + SVG_ICONS.info + '</span>' : '';
				if (input.type === DialogInputType.Select) {
					inputHtml = '<td class="inputCol"><div id="dialogFormSelect' + id + '"></div></td>' + (infoColRequired ? '<td>' + infoHtml + '</td>' : '');
				} else if (input.type === DialogInputType.Checkbox) {
					inputHtml = '<td class="inputCol"' + (infoColRequired ? ' colspan="2"' : '') + '><span class="dialogFormCheckbox"><label><input id="dialogInput' + id + '" type="checkbox"' + (input.value ? ' checked' : '') + ' tabindex="' + (id + 1) + '"/><span class="customCheckbox"></span>' + (multiElement && !multiCheckbox ? '' : input.name) + infoHtml + '</label></span></td>';
				} else if (input.type === DialogInputType.TextArea) {
					const rows = typeof input.rows === 'number' && input.rows > 0 ? Math.round(input.rows) : 6;
					inputHtml = '<td class="inputCol"><textarea id="dialogInput' + id + '" rows="' + rows + '"' + (input.placeholder !== null ? ' placeholder="' + escapeHtml(input.placeholder) + '"' : '') + ' tabindex="' + (id + 1) + '"></textarea></td>' + (infoColRequired ? '<td>' + infoHtml + '</td>' : '');
				} else {
					const suggestions = input.type === DialogInputType.TextRef && input.suggestions && input.suggestions.length > 0 ? input.suggestions : null;
					inputHtml = '<td class="inputCol"><input id="dialogInput' + id + '" type="text" value="' + escapeHtml(input.default) + '"' + (input.type === DialogInputType.Text && input.placeholder !== null ? ' placeholder="' + escapeHtml(input.placeholder) + '"' : '') + (suggestions !== null ? ' autocomplete="off"' : '') + ' tabindex="' + (id + 1) + '"/></td>' + (infoColRequired ? '<td>' + infoHtml + '</td>' : '');
				}
			}
			return '<tr' + (input.type === DialogInputType.Radio ? ' class="mediumField"' : input.type === DialogInputType.TextArea ? ' class="largeField textAreaField"' : input.type !== DialogInputType.Checkbox ? ' class="largeField"' : '') + '>' + (multiElement && !multiCheckbox ? '<td>' + input.name + ': </td>' : '') + inputHtml + '</tr>';
		});

		const html = message + (includeLineBreak ? '<br>' : '') +
			'<table class="dialogForm ' + (multiElement ? multiCheckbox ? 'multiCheckbox' : 'multi' : 'single') + '">' +
			inputRowsHtml.join('') +
			'</table>';

		const areFormValuesInvalid = () => this.elem === null || this.elem.classList.contains(CLASS_DIALOG_NO_INPUT) || this.elem.classList.contains(CLASS_DIALOG_INPUT_INVALID);
		const getFormValues = () => inputs.map((input, index) => {
			if (input.type === DialogInputType.Radio) {
				// Iterate through all of the radio options to get the checked value
				const elems = <NodeListOf<HTMLInputElement>>document.getElementsByName('dialogInput' + index);
				for (let i = 0; i < elems.length; i++) {
					if (elems[i].checked) {
						return input.options[parseInt(elems[i].value)].value;
					}
				}
				return input.default; // If no option is checked, return the default value
			} else if (input.type === DialogInputType.Select) {
				return this.customSelects[index.toString()].getValue();
			} else {
				const elem = <HTMLInputElement>document.getElementById('dialogInput' + index);
				return input.type === DialogInputType.Checkbox
					? elem.checked // Checkboxes return a boolean indicating if the value is checked
					: elem.value; // All other fields return the value as a string
			}
		});

		this.show(DialogType.Form, html, actionName, secondaryActionName, () => {
			if (areFormValuesInvalid()) return;
			const values = getFormValues();
			this.close();
			actioned(values);
		}, secondaryActioned !== null ? () => {
			if (areFormValuesInvalid()) return;
			const values = getFormValues();
			this.close();
			secondaryActioned(values);
		} : null, target);

		// Create custom select inputs
		inputs.forEach((input, index) => {
			if (input.type === DialogInputType.Select) {
				this.customSelects[index.toString()] = new CustomSelect(input, 'dialogFormSelect' + index, index + 1, this.elem!);
			}
		});

		// Suggestions are listed below their input in the style of the custom select inputs (a native datalist can't be styled)
		inputs.forEach((input, index) => {
			if (input.type === DialogInputType.TextRef && input.suggestions && input.suggestions.length > 0) {
				this.suggestionLists.push(new SuggestionList(<HTMLInputElement>document.getElementById('dialogInput' + index), input.suggestions, this.elem!));
			}
		});

		// If the dialog contains a TextRef input, attach event listeners for validation
		const textRefInput = inputs.findIndex((input) => input.type === DialogInputType.TextRef);
		if (textRefInput > -1) {
			let dialogInput = <HTMLInputElement>document.getElementById('dialogInput' + textRefInput), dialogAction = document.getElementById('dialogAction')!;
			if (dialogInput.value === '') this.elem!.classList.add(CLASS_DIALOG_NO_INPUT);
			dialogInput.addEventListener('input', () => {
				if (this.elem === null) return;
				if (initialState.config.dialogDefaults.general.referenceInputSpaceSubstitution !== null) {
					const selectionStart = dialogInput.selectionStart, selectionEnd = dialogInput.selectionEnd;
					dialogInput.value = dialogInput.value.replace(Dialog.WHITESPACE_REGEXP, initialState.config.dialogDefaults.general.referenceInputSpaceSubstitution);
					dialogInput.selectionStart = selectionStart;
					dialogInput.selectionEnd = selectionEnd;
				}
				const noInput = dialogInput.value === '', invalidInput = dialogInput.value.match(REF_INVALID_REGEX) !== null;
				alterClass(this.elem, CLASS_DIALOG_NO_INPUT, noInput);
				if (alterClass(this.elem, CLASS_DIALOG_INPUT_INVALID, !noInput && invalidInput)) {
					dialogAction.title = invalidInput ? 'Unable to ' + actionName + ', one or more invalid characters entered.' : '';
				}
			});
		}

		// Initialise TextArea inputs: set their values, and allow Enter to insert a new line (Ctrl/Cmd+Enter still submits the dialog)
		inputs.forEach((input, index) => {
			if (input.type === DialogInputType.TextArea) {
				const textAreaElem = <HTMLTextAreaElement>document.getElementById('dialogInput' + index);
				textAreaElem.value = input.default;
				textAreaElem.addEventListener('keydown', (e) => {
					if ((e.keyCode ? e.keyCode === 13 : e.key === 'Enter') && !e.ctrlKey && !e.metaKey) {
						// Stop the event reaching the document-level handler that submits the dialog
						e.stopPropagation();
					}
				});
			}
		});

		// Buttons follow the form inputs in the tab order
		this.setActionTabIndexes(inputs.length + 1);

		if (inputs.length > 0 && (inputs[0].type === DialogInputType.Text || inputs[0].type === DialogInputType.TextRef || inputs[0].type === DialogInputType.TextArea)) {
			// If the first input is a text field, set focus to it.
			(<HTMLInputElement | HTMLTextAreaElement>document.getElementById('dialogInput0')).focus();
		}
	}

	/**
	 * Show a message to the user in a dialog.
	 * @param html The HTML to display in the dialog.
	 */
	public showMessage(html: string) {
		this.show(DialogType.Message, html, null, 'Close', null, null, null);
	}

	/**
	 * Show an error to the user in a dialog.
	 * @param message The high-level category of the error.
	 * @param reason The error details.
	 * @param actionName An optional name for a primary action (if one is required).
	 * @param actioned An optional callback to be invoked when the primary action is triggered.
	 */
	public showError(message: string, reason: GG.ErrorInfo, actionName: string | null, actioned: (() => void) | null) {
		this.show(DialogType.Message, '<span class="dialogAlert">' + SVG_ICONS.alert + 'Error: ' + message + '</span>' + (reason !== null ? '<br><span class="messageContent errorContent">' + escapeHtml(reason).split('\n').join('<br>') + '</span>' : ''), actionName, 'Dismiss', () => {
			this.close();
			if (actioned !== null) actioned();
		}, null, null);
	}

	/**
	 * Show a dialog to indicate that an action is currently running.
	 * @param action A short name that identifies the action that is running.
	 */
	public showActionRunning(action: string) {
		this.show(DialogType.ActionRunning, '<span class="actionRunning">' + SVG_ICONS.loading + action + ' ...</span>', null, 'Dismiss', null, null, null);
	}

	/**
	 * Show a dialog in the Git Graph View.
	 * @param type The type of dialog being shown.
	 * @param html The HTML content for the dialog.
	 * @param actionName The name of the primary (default) action.
	 * Show a custom dialog with full control over content and callbacks, including a close callback.
	 */
	public showCustom(html: string, actionName: string, actioned: () => void, secondaryActionName: string, secondaryActioned: () => void, onClose: (() => void) | null) {
		this.show(DialogType.Form, html, actionName, secondaryActionName, actioned, secondaryActioned, null);
		this.onCloseCallback = onClose;
	}

	private show(type: DialogType, html: string, actionName: string | null, secondaryActionName: string, actioned: (() => void) | null, secondaryActioned: (() => void) | null, target: DialogTarget | null) {
		closeDialogAndContextMenu();

		this.type = type;
		this.target = target;
		eventOverlay.create('dialogBacking', null, null);

		const dialog = document.createElement('div'), dialogContent = document.createElement('div');
		dialog.className = 'dialog';
		dialogContent.className = 'dialogContent';
		dialogContent.innerHTML = html + '<br>' + (actionName !== null ? '<div id="dialogAction" class="roundedBtn">' + actionName + '</div>' : '') + '<div id="dialogSecondaryAction" class="roundedBtn">' + secondaryActionName + '</div>';
		dialog.appendChild(dialogContent);
		this.elem = dialog;
		document.body.appendChild(dialog);

		// A dialog taller than the view (e.g. a form in the short panel) scrolls its content, so that its buttons can still be reached. Forms may use
		// all but a small margin of the height, the options of their selects are shown outside of the scrolled content.
		let docHeight = document.body.clientHeight, dialogHeight = dialog.clientHeight + 2;
		const maxDialogHeight = type === DialogType.Form ? docHeight - 20 : 0.8 * docHeight;
		if (dialogHeight > maxDialogHeight) {
			dialogContent.style.height = Math.max(Math.round(maxDialogHeight - 22), 60) + 'px';
			dialogHeight = Math.round(maxDialogHeight);
		}
		dialog.style.top = Math.max(Math.round((docHeight - dialogHeight) / 2), 10) + 'px';
		if (actionName !== null && actioned !== null) {
			document.getElementById('dialogAction')!.addEventListener('click', actioned);
			this.actioned = actioned;
		}
		document.getElementById('dialogSecondaryAction')!.addEventListener('click', secondaryActioned !== null ? secondaryActioned : () => this.close());

		// Make the buttons keyboard accessible: focusable after any existing inputs, and activated with Enter / Space
		let maxTabIndex = 0;
		const tabIndexElems = <NodeListOf<HTMLElement>>dialogContent.querySelectorAll('[tabindex]');
		for (let i = 0; i < tabIndexElems.length; i++) {
			maxTabIndex = Math.max(maxTabIndex, tabIndexElems[i].tabIndex);
		}
		const buttonElems = <NodeListOf<HTMLElement>>dialogContent.querySelectorAll('#dialogAction, #dialogSecondaryAction');
		for (let i = 0; i < buttonElems.length; i++) {
			const buttonElem = buttonElems[i];
			buttonElem.setAttribute('role', 'button');
			buttonElem.addEventListener('keydown', (e) => {
				if ((e.keyCode ? e.keyCode === 13 : e.key === 'Enter') || e.key === ' ') {
					// Handle the event here so the document-level Enter handler doesn't submit the primary action instead
					handledEvent(e);
					buttonElem.click();
				}
			});
		}
		this.setActionTabIndexes(maxTabIndex + 1);

		if (this.target !== null && this.target.type !== TargetType.Repo) {
			alterClass(this.target.elem, CLASS_DIALOG_ACTIVE, true);
		}
	}

	/**
	 * Set the tabIndex of the dialog's buttons, so they follow the form inputs in the tab order.
	 * @param firstTabIndex The tabIndex of the first button.
	 */
	private setActionTabIndexes(firstTabIndex: number) {
		if (this.elem === null) return;
		const buttonElems = <NodeListOf<HTMLElement>>this.elem.querySelectorAll('#dialogAction, #dialogSecondaryAction');
		for (let i = 0; i < buttonElems.length; i++) {
			buttonElems[i].tabIndex = firstTabIndex + i;
		}
	}

	/**
	 * Close the dialog (if one is currently open in the Git Graph View).
	 */
	public close() {
		eventOverlay.remove();
		if (this.elem !== null) {
			this.elem.remove();
			this.elem = null;
		}
		alterClassOfCollection(<HTMLCollectionOf<HTMLElement>>document.getElementsByClassName(CLASS_DIALOG_ACTIVE), CLASS_DIALOG_ACTIVE, false);
		this.target = null;
		Object.keys(this.customSelects).forEach((index) => this.customSelects[index].remove());
		this.customSelects = {};
		this.suggestionLists.forEach((suggestionList) => suggestionList.remove());
		this.suggestionLists = [];
		this.actioned = null;
		this.type = null;
		if (this.onCloseCallback !== null) {
			this.onCloseCallback();
			this.onCloseCallback = null;
		}
	}

	/**
	 * Close the action running dialog (if one is currently open in the Git Graph View).
	 */
	public closeActionRunning() {
		if (this.type === DialogType.ActionRunning) this.close();
	}

	/**
	 * Submit the primary action of the dialog.
	 */
	public submit() {
		if (this.actioned !== null) this.actioned();
	}

	/**
	 * Refresh the dialog (if one is currently open in the Git Graph View). If the dialog has a dynamic source, re-link
	 * it to the newly rendered HTML Element, or close it if the target is no longer visible in the Git Graph View.
	 * @param commits The new array of commits that is rendered in the Git Graph View.
	 */
	public refresh(commits: ReadonlyArray<GG.GitCommit>) {
		if (!this.isOpen() || this.target === null || this.target.type === TargetType.Repo) {
			// Don't need to refresh if: no dialog is open, it is not dynamic, or it is not reliant on commit changes
			return;
		}

		const commitIndex = commits.findIndex((commit) => commit.hash === (<CommitTarget | RefTarget>this.target).hash);
		if (commitIndex > -1) {
			// The commit still exists

			const commitElem = findCommitElemWithId(getCommitElems(), commitIndex);
			if (commitElem !== null) {
				if (typeof this.target.ref === 'undefined') {
					// Dialog is only dependent on the commit itself
					if (this.target.type !== TargetType.CommitDetailsView) {
						this.target.elem = commitElem;
						alterClass(this.target.elem, CLASS_DIALOG_ACTIVE, true);
					}
					return;
				} else {
					// Dialog is dependent on the commit and ref
					const elems = <NodeListOf<HTMLElement>>commitElem.querySelectorAll('[data-fullref]');
					for (let i = 0; i < elems.length; i++) {
						if (elems[i].dataset.fullref! === this.target.ref) {
							this.target.elem = this.target.type === TargetType.Ref ? elems[i] : commitElem;
							alterClass(this.target.elem, CLASS_DIALOG_ACTIVE, true);
							return;
						}
					}
				}
			}
		}

		this.close();
	}

	/**
	 * Is a dialog currently open in the Git Graph View.
	 * @returns TRUE => A dialog is open, FALSE => No dialog is open
	 */
	public isOpen() {
		return this.elem !== null;
	}

	/**
	 * Is the target of the dialog dynamic (i.e. is it tied to a Git object & HTML Element in the Git Graph View).
	 * @returns TRUE => The dialog is dynamic, FALSE => The dialog is not dynamic
	 */
	public isTargetDynamicSource() {
		return this.isOpen() && this.target !== null;
	}

	/**
	 * Get the type of the dialog that is currently open.
	 * @returns The type of the dialog.
	 */
	public getType() {
		return this.type;
	}
}

/**
 * Lists the suggested values of a text input below it while it's being edited, in the style of the Custom Select inputs. The suggestions
 * containing the entered text are shown (those starting with it first); Up / Down highlight a suggestion, Enter or a click uses it, and
 * Escape hides the list.
 */
class SuggestionList {
	private static readonly MAX_SUGGESTIONS = 50;

	private readonly inputElem: HTMLInputElement;
	private readonly suggestions: ReadonlyArray<string>;
	private readonly dialogElem: HTMLElement;
	private listElem: HTMLElement | null = null;
	private shown: string[] = [];
	private highlighted: number = -1;

	/**
	 * Construct a new SuggestionList instance.
	 * @param inputElem The text input.
	 * @param suggestions The suggested values.
	 * @param dialogElem The HTML Element of the dialog that the input is rendered in.
	 */
	constructor(inputElem: HTMLInputElement, suggestions: ReadonlyArray<string>, dialogElem: HTMLElement) {
		this.inputElem = inputElem;
		this.suggestions = suggestions;
		this.dialogElem = dialogElem;
		inputElem.addEventListener('input', () => this.update());
		// Not on focus, as the dialog focuses the input when it opens and the list would cover the other inputs
		inputElem.addEventListener('click', () => this.update());
		inputElem.addEventListener('blur', () => this.hide());
		inputElem.addEventListener('keydown', (e) => this.onKeyDown(e));
	}

	/**
	 * Remove the list from the dialog.
	 */
	public remove() {
		this.hide();
	}

	/**
	 * Show the suggestions matching the current value of the input, or hide the list if there are none.
	 */
	private update() {
		const text = this.inputElem.value.toLowerCase();
		const matches = this.suggestions.filter((suggestion) => suggestion.toLowerCase().includes(text) && suggestion !== this.inputElem.value);
		this.shown = matches.filter((suggestion) => suggestion.toLowerCase().startsWith(text))
			.concat(matches.filter((suggestion) => !suggestion.toLowerCase().startsWith(text)))
			.slice(0, SuggestionList.MAX_SUGGESTIONS);
		this.highlighted = -1;
		if (this.shown.length === 0) {
			this.hide();
			return;
		}

		if (this.listElem === null) {
			this.listElem = document.createElement('div');
			this.listElem.className = 'customSelectOptions dialogSuggestions';
			// mousedown (rather than click) uses the suggestion before the input loses focus, which would hide the list
			this.listElem.addEventListener('mousedown', (e) => {
				const elem = e.target instanceof Element ? e.target.closest('.customSelectOption') : null;
				e.preventDefault();
				if (elem !== null) this.use(this.shown[parseInt((<HTMLElement>elem).dataset.index!)]);
			});
			this.dialogElem.appendChild(this.listElem);
		}
		const inputRect = this.inputElem.getBoundingClientRect(), dialogRect = this.dialogElem.getBoundingClientRect();
		this.listElem.style.top = (inputRect.top - dialogRect.top + inputRect.height - 1) + 'px';
		this.listElem.style.left = (inputRect.left - dialogRect.left - 1) + 'px';
		this.listElem.style.width = inputRect.width + 'px';
		this.listElem.style.maxHeight = Math.max(Math.min(document.body.clientHeight - inputRect.bottom - 2, 240), 50) + 'px';
		this.listElem.innerHTML = this.shown.map((suggestion, index) => '<div class="customSelectOption" data-index="' + index + '">' + escapeHtml(suggestion) + '</div>').join('');
	}

	/**
	 * Handle the keys that navigate the list while it's shown, before the dialog handles them (Enter submits, Escape closes the dialog).
	 * @param e The keyboard event.
	 */
	private onKeyDown(e: KeyboardEvent) {
		if (this.listElem === null) return;
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			this.highlight(e.key === 'ArrowDown'
				? (this.highlighted + 1) % this.shown.length
				: (this.highlighted <= 0 ? this.shown.length : this.highlighted) - 1);
		} else if ((e.keyCode ? e.keyCode === 13 : e.key === 'Enter') && this.highlighted > -1) {
			this.use(this.shown[this.highlighted]);
		} else if (e.key === 'Escape') {
			this.hide();
		} else {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
	}

	/**
	 * Highlight a suggestion, and scroll it into view.
	 * @param index The index of the suggestion.
	 */
	private highlight(index: number) {
		if (this.listElem === null) return;
		this.highlighted = index;
		const elems = this.listElem.children;
		for (let i = 0; i < elems.length; i++) {
			alterClass(<HTMLElement>elems[i], 'focussed', i === index);
		}
		if (index > -1) (<HTMLElement>elems[index]).scrollIntoView({ block: 'nearest' });
	}

	/**
	 * Enter a suggestion into the input (validating it like typed text), and hide the list.
	 * @param suggestion The suggestion.
	 */
	private use(suggestion: string) {
		this.inputElem.value = suggestion;
		this.inputElem.dispatchEvent(new Event('input'));
		this.hide();
	}

	/**
	 * Hide the list.
	 */
	private hide() {
		if (this.listElem !== null) {
			this.listElem.remove();
			this.listElem = null;
		}
		this.shown = [];
		this.highlighted = -1;
	}
}

/**
 * Implements the Custom Select inputs used in dialogs.
 */
class CustomSelect {
	private readonly data: DialogSelectInput;
	private readonly selected: boolean[];
	private lastSelected: number = -1;
	private focussed: number = -1;
	private open: boolean;

	private dialogElem: HTMLElement | null;
	private elem: HTMLElement | null;
	private currentElem: HTMLElement | null;
	private optionsElem: HTMLElement | null = null;
	private clickHandler: ((e: MouseEvent) => void) | null;

	/**
	 * Construct a new CustomSelect instance.
	 * @param data The data configuring the CustomSelect input.
	 * @param containerId The ID of the container to render the select input in.
	 * @param tabIndex The tabIndex of the select input.
	 * @param dialogElem The HTML Element of the dialog that the CustomSelect is being rendered in.
	 * @returns The CustomSelect instance.
	 */
	constructor(data: DialogSelectInput, containerId: string, tabIndex: number, dialogElem: HTMLElement) {
		this.data = data;
		this.selected = data.options.map(() => false);
		this.open = false;
		this.dialogElem = dialogElem;

		const container = document.getElementById(containerId)!;
		container.className = 'customSelectContainer';
		this.elem = container;

		const currentElem = document.createElement('div');
		currentElem.className = 'customSelectCurrent';
		currentElem.tabIndex = tabIndex;
		this.currentElem = currentElem;
		container.appendChild(currentElem);

		this.clickHandler = (e: MouseEvent) => {
			if (!e.target) return;
			const targetElem = <HTMLElement>e.target;
			if (targetElem.closest('.customSelectContainer') !== this.elem && (this.optionsElem === null || targetElem.closest('.customSelectOptions') !== this.optionsElem)) {
				this.render(false);
				return;
			}

			if (targetElem.className === 'customSelectCurrent') {
				this.render(!this.open);
			} else if (this.open) {
				const optionElem = <HTMLElement | null>targetElem.closest('.customSelectOption');
				if (optionElem !== null) {
					const selectedOptionIndex = parseInt(optionElem.dataset.index!);
					this.setItemSelectedState(selectedOptionIndex, data.multiple ? !this.selected[selectedOptionIndex] : true);
					if (!this.data.multiple) {
						this.render(false);
					}
					if (this.currentElem !== null) {
						this.currentElem.focus();
					}
				}
			}
		};
		document.addEventListener('click', this.clickHandler, true);

		currentElem.addEventListener('keydown', (e) => {
			if (this.open && e.key === 'Tab') {
				this.render(false);
			} else if (this.open && (e.key === 'Enter' || e.key === 'Escape')) {
				this.render(false);
				handledEvent(e);
			} else if (this.data.multiple) {
				if (e.key === ' ' && this.focussed > -1) {
					this.setItemSelectedState(this.focussed, !this.selected[this.focussed]);
					handledEvent(e);
				} else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
					if (!this.open) {
						this.render(true);
					}
					this.setFocussed(this.focussed > 0 ? this.focussed - 1 : this.data.options.length - 1);
					this.scrollOptionIntoView(this.focussed);
					handledEvent(e);
				} else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
					if (!this.open) {
						this.render(true);
					}
					this.setFocussed(this.focussed < this.data.options.length - 1 ? this.focussed + 1 : 0);
					this.scrollOptionIntoView(this.focussed);
					handledEvent(e);
				}
			} else {
				if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
					this.setItemSelectedState(this.lastSelected > 0 ? this.lastSelected - 1 : this.data.options.length - 1, true);
					this.scrollOptionIntoView(this.lastSelected);
					handledEvent(e);
				} else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
					this.setItemSelectedState(this.lastSelected < this.data.options.length - 1 ? this.lastSelected + 1 : 0, true);
					this.scrollOptionIntoView(this.lastSelected);
					handledEvent(e);
				}
			}
		});

		if (data.multiple) {
			for (let i = data.options.length - 1; i >= 0; i--) {
				if (data.defaults.includes(data.options[i].value)) {
					this.setItemSelectedState(i, true);
				}
			}
		} else {
			const defaultIndex = data.options.findIndex((option) => option.value === data.default);
			this.setItemSelectedState(defaultIndex > -1 ? defaultIndex : 0, true);
		}
		this.renderCurrentValue();
	}

	/**
	 * Remove a CustomSelect instance, cleaning up all resources that is linked to it.
	 */
	public remove() {
		this.dialogElem = null;
		if (this.elem !== null) {
			this.elem.remove();
			this.elem = null;
		}
		if (this.currentElem !== null) {
			this.currentElem.remove();
			this.currentElem = null;
		}
		if (this.optionsElem !== null) {
			this.optionsElem.remove();
			this.optionsElem = null;
		}
		if (this.clickHandler !== null) {
			document.removeEventListener('click', this.clickHandler, true);
			this.clickHandler = null;
		}
	}

	/**
	 * Get the value(s) selected by the user.
	 * @returns The selected value(s).
	 */
	public getValue() {
		const values = this.data.options.map((option) => option.value).filter((_, index) => this.selected[index]);
		return this.data.multiple ? values : values[0];
	}

	/**
	 * Set whether an item is selected.
	 * @param index The index of the item to alter.
	 * @param state The new state for whether the item is selected or not (TRUE => Selected, FALSE => Not Selected).
	 */
	private setItemSelectedState(index: number, state: boolean) {
		if (!this.data.multiple && this.lastSelected > -1) {
			this.selected[this.lastSelected] = false;
		}
		this.selected[index] = state;
		this.lastSelected = index;
		this.renderCurrentValue();
		this.renderOptionsStates();
	}

	/**
	 * Set the focused item of the select input.
	 * @param index The index of the item that should be focussed.
	 */
	private setFocussed(index: number) {
		if (this.focussed !== index) {
			if (this.focussed > -1) {
				const currentlyFocussedOption = this.getOptionElem(this.focussed);
				if (currentlyFocussedOption !== null) {
					alterClass(currentlyFocussedOption, CLASS_FOCUSSED, false);
				}
			}
			this.focussed = index;
			const newlyFocussedOption = this.getOptionElem(this.focussed);
			if (newlyFocussedOption !== null) {
				alterClass(newlyFocussedOption, CLASS_FOCUSSED, true);
			}
		}
	}

	/**
	 * Render the select input.
	 * @param open Should the select be open (displaying the select options list).
	 */
	private render(open: boolean) {
		if (this.elem === null || this.currentElem === null || this.dialogElem === null) return;

		if (this.open !== open) {
			this.open = open;
			if (open) {
				if (this.optionsElem !== null) {
					this.optionsElem.remove();
				}
				this.optionsElem = document.createElement('div');
				const currentElemRect = this.currentElem.getBoundingClientRect(), dialogElemRect = this.dialogElem.getBoundingClientRect();
				this.optionsElem.style.top = (currentElemRect.top - dialogElemRect.top + currentElemRect.height - 2) + 'px';
				this.optionsElem.style.left = (currentElemRect.left - dialogElemRect.left - 1) + 'px';
				this.optionsElem.style.width = currentElemRect.width + 'px';
				this.optionsElem.style.maxHeight = Math.max(document.body.clientHeight - currentElemRect.top - currentElemRect.height - 2, 50) + 'px';
				this.optionsElem.className = 'customSelectOptions' + (this.data.multiple ? ' multiple' : '');
				const icon = this.data.multiple ? '<div class="selectedIcon">' + SVG_ICONS.check + '</div>' : '';
				this.optionsElem.innerHTML = this.data.options.map((option, index) =>
					'<div class="customSelectOption" data-index="' + index + '">' + icon + escapeHtml(option.name) + '</div>'
				).join('');
				addListenerToCollectionElems(this.optionsElem.children, 'mousemove', (e) => {
					if (!e.target) return;
					const elem = (<HTMLElement>e.target).closest('.customSelectOption');
					if (elem === null) return;
					this.setFocussed(parseInt((<HTMLElement>elem).dataset.index!));
				});
				this.optionsElem.addEventListener('mouseleave', () => this.setFocussed(-1));
				this.dialogElem.appendChild(this.optionsElem);
			} else {
				if (this.optionsElem !== null) {
					this.optionsElem.remove();
					this.optionsElem = null;
				}
				this.setFocussed(-1);
			}
			alterClass(this.elem, 'open', open);
		}

		if (open) {
			this.renderOptionsStates();
		}
	}

	/**
	 * Render the current value of the select input.
	 */
	private renderCurrentValue() {
		if (this.currentElem === null) return;
		const value = formatCommaSeparatedList(this.data.options.filter((_, index) => this.selected[index]).map((option) => option.name)) || 'None';
		this.currentElem.title = value;
		this.currentElem.innerHTML = escapeHtml(value);
	}

	/**
	 * Render the selected & focussed states of each option with it's corresponding HTML Element.
	 */
	private renderOptionsStates() {
		if (this.optionsElem !== null) {
			let optionElems = this.optionsElem.children, elemIndex: number;
			for (let i = 0; i < optionElems.length; i++) {
				elemIndex = parseInt((<HTMLElement>optionElems[i]).dataset.index!);
				alterClass(<HTMLElement>optionElems[i], CLASS_SELECTED, this.selected[elemIndex]);
				alterClass(<HTMLElement>optionElems[i], CLASS_FOCUSSED, this.focussed === elemIndex);
			}
		}
	}

	/**
	 * Get the HTML Element of the option at the specified index.
	 * @param index The index of the item.
	 * @returns The HTML Element.
	 */
	private getOptionElem(index: number) {
		if (this.optionsElem !== null && index > -1) {
			const optionElems = this.optionsElem.children, indexStr = index.toString();
			for (let i = 0; i < optionElems.length; i++) {
				if ((<HTMLElement>optionElems[i]).dataset.index === indexStr) {
					return <HTMLElement>optionElems[i];
				}
			}
		}
		return null;
	}

	/**
	 * Scroll the HTML Element of an option to be visible in the options list.
	 * @param index The index of the option to scroll into view.
	 */
	private scrollOptionIntoView(index: number) {
		const elem = this.getOptionElem(index);
		if (this.optionsElem !== null && elem !== null) {
			const elemOffsetTop = elem.offsetTop, elemHeight = elem.clientHeight;
			const optionsScrollTop = this.optionsElem.scrollTop, optionsHeight = this.optionsElem.clientHeight;
			if (elemOffsetTop < optionsScrollTop) {
				this.optionsElem.scroll(0, elemOffsetTop);
			} else if (elemOffsetTop + elemHeight > optionsScrollTop + optionsHeight) {
				this.optionsElem.scroll(0, Math.max(elemOffsetTop + elemHeight - optionsHeight, 0));
			}
		}
	}
}
