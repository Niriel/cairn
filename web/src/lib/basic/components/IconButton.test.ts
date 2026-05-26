import { createRawSnippet } from 'svelte';
import { fireEvent } from '@testing-library/svelte';
import { describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

import IconButton from './IconButton.svelte';

function icon(label: string) {
	return createRawSnippet(() => ({
		render: () => `<span>${label}</span>`
	}));
}

describe('IconButton', () => {
	test('renders children inside a button element', () => {
		const { container } = render(IconButton, {
			children: icon('x')
		});
		const btn = container.querySelector('button');
		expect(btn).not.toBeNull();
		expect(btn!.textContent).toContain('x');
	});

	test('forwards data-test attribute to the button', () => {
		const { getByDataTest } = render(IconButton, {
			'data-test': 'my-btn',
			children: icon('x')
		});
		expect(getByDataTest('my-btn').tagName.toLowerCase()).toBe('button');
	});

	test('calls onclick when clicked', async () => {
		const onclick = vi.fn();
		const { getByDataTest } = render(IconButton, {
			'data-test': 'click-me',
			onclick,
			children: icon('x')
		});
		await fireEvent.click(getByDataTest('click-me'));
		expect(onclick).toHaveBeenCalledTimes(1);
	});
});
