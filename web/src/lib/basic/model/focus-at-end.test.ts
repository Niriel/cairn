import { afterEach, describe, expect, test } from 'vitest';

import { focusAtEnd } from './focus-at-end';

function mount<T extends HTMLElement>(el: T): T {
	document.body.append(el);
	return el;
}

afterEach(() => {
	document.body.replaceChildren();
});

describe('focusAtEnd', () => {
	// Assigning .value already moves the caret to the end, so each case first
	// parks it at the start — otherwise these would pass without focusAtEnd.
	test('(a) focuses an input with the caret at the end', () => {
		const input = mount(document.createElement('input'));
		input.value = 'hello';
		input.setSelectionRange(0, 0);
		focusAtEnd(input);
		expect(document.activeElement).toBe(input);
		expect(input.selectionStart).toBe(5);
		expect(input.selectionEnd).toBe(5);
	});

	test('(b) focuses a textarea with the caret at the end', () => {
		const ta = mount(document.createElement('textarea'));
		ta.value = 'hello';
		ta.setSelectionRange(0, 0);
		focusAtEnd(ta);
		expect(document.activeElement).toBe(ta);
		expect(ta.selectionStart).toBe(5);
	});

	test('(c) focuses an e-mail input without throwing', () => {
		const input = mount(document.createElement('input'));
		input.type = 'email';
		input.value = 'a@b.test';
		expect(() => focusAtEnd(input)).not.toThrow();
		expect(document.activeElement).toBe(input);
	});
});
