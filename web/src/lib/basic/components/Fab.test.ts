import { fireEvent } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

import Fab from './Fab.svelte';

function content(html: string) {
	return createRawSnippet(() => ({
		render: () => `<span>${html}</span>`
	}));
}

describe('Fab', () => {
	test('positions bottom with var(--fab-bottom)', () => {
		const { getByDataTest } = render(Fab, {
			'data-test': 'fab',
			'aria-label': 'New',
			children: content('+')
		});
		const fab = getByDataTest('fab');
		expect(fab.style.bottom).toBe('var(--fab-bottom)');
	});

	test('calls onclick when clicked', async () => {
		const onclick = vi.fn();
		const { getByDataTest } = render(Fab, {
			'data-test': 'fab',
			'aria-label': 'New',
			onclick,
			children: content('+')
		});
		await fireEvent.click(getByDataTest('fab'));
		expect(onclick).toHaveBeenCalledTimes(1);
	});
});
