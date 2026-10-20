// Svelte attachment: focus the field on mount with the caret at the end —
// for the first field of a form that has just been opened. Used instead of
// the native `autofocus` attribute, which Svelte's a11y lint flags.
export function focusAtEnd(node: HTMLInputElement | HTMLTextAreaElement): void {
	node.focus();
	// Input types without a text selection (e.g. email) report a null
	// selectionStart, and setSelectionRange throws on them.
	if (node.selectionStart !== null) node.setSelectionRange(node.value.length, node.value.length);
}
