import { fireEvent } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

import AccordionRow from './AccordionRow.svelte';

function trailing(text: string) {
	return createRawSnippet(() => ({
		render: () => `<span data-test="trailing">${text}</span>`
	}));
}

describe('AccordionRow', () => {
	test('renders the title', () => {
		const { getByText } = render(AccordionRow, { title: 'My item' });
		expect(getByText('My item')).not.toBeNull();
	});

	test('fires onclick when the row is tapped', async () => {
		const onclick = vi.fn();
		const { getByDataTest } = render(AccordionRow, {
			title: 'Tap me',
			onclick,
			'data-test': 'acc'
		});
		await fireEvent.click(getByDataTest('acc'));
		expect(onclick).toHaveBeenCalledTimes(1);
	});

	test('renders the trailing snippet (where the score badge sits)', () => {
		const { getByDataTest } = render(AccordionRow, {
			title: 'With badge',
			trailing: trailing('+4')
		});
		expect(getByDataTest('trailing').textContent).toBe('+4');
	});

	test('marks the row open so the chevron rotates to point down', () => {
		const { container } = render(AccordionRow, { title: 'Open', open: true });
		expect(container.querySelector('.accordion-row.open')).not.toBeNull();
	});

	test('is not open by default', () => {
		const { container } = render(AccordionRow, { title: 'Closed' });
		expect(container.querySelector('.accordion-row.open')).toBeNull();
		// The fold indicator (chevron) is always rendered.
		expect(container.querySelector('.chevron svg')).not.toBeNull();
	});
});
