import { fireEvent } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

import Button from './Button.svelte';

function label(text: string) {
	return createRawSnippet(() => ({
		render: () => `<span>${text}</span>`
	}));
}

describe('Button', () => {
	test('calls onclick when clicked', async () => {
		const onclick = vi.fn();
		const { getByDataTest } = render(Button, {
			'data-test': 'go',
			onclick,
			children: label('Go')
		});
		await fireEvent.click(getByDataTest('go'));
		expect(onclick).toHaveBeenCalledTimes(1);
	});

	test('applies the destructive variant class', () => {
		const { getByDataTest } = render(Button, {
			variant: 'destructive',
			'data-test': 'x',
			children: label('Delete')
		});
		expect(getByDataTest('x').classList.contains('destructive')).toBe(true);
	});

	test('disabled prevents onclick', async () => {
		const onclick = vi.fn();
		const { getByDataTest } = render(Button, {
			'data-test': 'go',
			disabled: true,
			onclick,
			children: label('Go')
		});
		await fireEvent.click(getByDataTest('go'));
		expect(onclick).not.toHaveBeenCalled();
	});
});
