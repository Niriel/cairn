import { describe, expect, test } from 'vitest';

import { render } from '$lib/test/render';

import CairnWordmark from './CairnWordmark.svelte';

describe('CairnWordmark', () => {
	test('renders the text "Cairn"', () => {
		const { getByDataTest } = render(CairnWordmark, { 'data-test': 'mark' });
		const root = getByDataTest('mark');
		expect(root.textContent).toContain('Cairn');
	});

	test('contains a child CairnGlyph (svg with viewBox 0 0 24 24)', () => {
		const { getByDataTest } = render(CairnWordmark, { 'data-test': 'mark' });
		const root = getByDataTest('mark');
		const svg = root.querySelector('svg');
		expect(svg).not.toBeNull();
		expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
	});
});
