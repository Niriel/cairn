import { describe, expect, test } from 'vitest';

import { headingTexts, normalizedText, sectionText } from './text';

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

describe('headingTexts', () => {
	test('lists the trimmed heading texts in document order', () => {
		const root = document.createElement('div');
		root.innerHTML = '<h2> One </h2><h3>Sub</h3><h2>Two</h2>';
		expect(headingTexts(root)).toEqual(['One', 'Two']);
		expect(headingTexts(root, 'h3')).toEqual(['Sub']);
	});
});

describe('sectionText', () => {
	test('returns the normalized text of the section a heading opens', () => {
		const root = document.createElement('div');
		root.innerHTML =
			'<section><h2>First</h2><p>alpha\n  beta</p></section><section><h2>Second</h2><p>gamma</p></section>';
		expect(sectionText(root, 'First')).toBe('Firstalpha beta');
		expect(sectionText(root, 'Second')).toBe('Secondgamma');
	});

	test('reads a missing heading as empty text', () => {
		expect(sectionText(document.createElement('div'), 'Nope')).toBe('');
	});
});
