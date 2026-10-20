import { describe, expect, test } from 'vitest';

import { normalizedText } from './text';

describe('normalizedText', () => {
	test('collapses runs of whitespace, including newlines and tabs, to single spaces', () => {
		const el = document.createElement('p');
		el.innerHTML = 'Two\n\t\tcookies  and\n   a cache';
		expect(normalizedText(el)).toBe('Two cookies and a cache');
	});

	test('reads an absent element as empty text', () => {
		expect(normalizedText(null)).toBe('');
	});
});
