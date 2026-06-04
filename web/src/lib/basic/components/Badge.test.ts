import { createRawSnippet } from 'svelte';
import { describe, expect, test } from 'vitest';

import { render } from '$lib/test/render';

import Badge from './Badge.svelte';

function label(text: string) {
	return createRawSnippet(() => ({
		render: () => `<span>${text}</span>`
	}));
}

describe('Badge', () => {
	test('renders its children', () => {
		const { getByDataTest } = render(Badge, {
			tone: 'primary',
			'data-test': 'b',
			children: label('3')
		});
		expect(getByDataTest('b').textContent).toContain('3');
	});

	test('applies the primary tone class', () => {
		const { getByDataTest } = render(Badge, {
			tone: 'primary',
			'data-test': 'b',
			children: label('3')
		});
		const el = getByDataTest('b');
		expect(el).toHaveClass('badge');
		expect(el).toHaveClass('badge-primary');
	});

	test('applies the pill base and the tone class', () => {
		const { getByDataTest } = render(Badge, {
			tone: 'soft',
			'data-test': 'b',
			children: label('1')
		});
		const el = getByDataTest('b');
		expect(el).toHaveClass('badge');
		expect(el).toHaveClass('badge-soft');
	});

	test('non-score tones get no mono and no sign class', () => {
		const { getByDataTest } = render(Badge, {
			tone: 'primary',
			'data-test': 'b',
			children: label('2')
		});
		const el = getByDataTest('b');
		expect(el).not.toHaveClass('mono');
		expect(el).not.toHaveClass('positive');
		expect(el).not.toHaveClass('negative');
	});

	test('score tone is monospace and applies the positive sign class', () => {
		const { getByDataTest } = render(Badge, {
			tone: 'score',
			sign: 'positive',
			'data-test': 'b',
			children: label('+2')
		});
		const el = getByDataTest('b');
		expect(el).toHaveClass('badge-score');
		expect(el).toHaveClass('mono');
		expect(el).toHaveClass('positive');
		expect(el).not.toHaveClass('negative');
	});

	test('score tone applies the negative sign class', () => {
		const { getByDataTest } = render(Badge, {
			tone: 'score',
			sign: 'negative',
			'data-test': 'b',
			children: label('-1')
		});
		const el = getByDataTest('b');
		expect(el).toHaveClass('mono');
		expect(el).toHaveClass('negative');
		expect(el).not.toHaveClass('positive');
	});
});
