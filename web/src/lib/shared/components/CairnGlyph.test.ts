import { describe, expect, test } from 'vitest';

import { render } from '$lib/test/render';

import CairnGlyph from './CairnGlyph.svelte';

describe('CairnGlyph', () => {
	test('renders an SVG with viewBox "0 0 24 24"', () => {
		const { getByDataTest } = render(CairnGlyph, { 'data-test': 'glyph' });
		const svg = getByDataTest('glyph');
		expect(svg.localName).toBe('svg');
		expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
	});

	test('contains three ellipses and one circle (stacked stones + topper)', () => {
		const { getByDataTest } = render(CairnGlyph, { 'data-test': 'glyph' });
		const svg = getByDataTest('glyph');
		expect(svg.querySelectorAll('ellipse').length).toBe(3);
		expect(svg.querySelectorAll('circle').length).toBe(1);
	});

	test('uses currentColor for fills when no color prop is provided', () => {
		const { getByDataTest } = render(CairnGlyph, { 'data-test': 'glyph' });
		const svg = getByDataTest('glyph');
		const shapes = svg.querySelectorAll('ellipse, circle');
		for (const shape of shapes) {
			expect(shape.getAttribute('fill')).toBe('currentColor');
		}
	});

	test('applies an explicit color prop to all shapes', () => {
		const { getByDataTest } = render(CairnGlyph, { 'data-test': 'glyph', color: '#abcdef' });
		const svg = getByDataTest('glyph');
		const shapes = svg.querySelectorAll('ellipse, circle');
		for (const shape of shapes) {
			expect(shape.getAttribute('fill')).toBe('#abcdef');
		}
	});

	test('honours the size prop on width and height', () => {
		const { getByDataTest } = render(CairnGlyph, { 'data-test': 'glyph', size: 40 });
		const svg = getByDataTest('glyph');
		expect(svg.getAttribute('width')).toBe('40');
		expect(svg.getAttribute('height')).toBe('40');
	});
});
