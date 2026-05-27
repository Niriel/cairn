import { fireEvent } from '@testing-library/svelte';
import { describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

import MoreButton from './MoreButton.svelte';

vi.mock('$lib/basic/components/Icon.svelte');

describe('MoreButton', () => {
	test('renders a more-vertical icon', () => {
		const { queryByDataTest } = render(MoreButton, {});
		expect(queryByDataTest('more-vertical')).not.toBeNull();
	});

	test('forwards aria-label to the button', () => {
		const { getByRole } = render(MoreButton, {
			'aria-label': 'List options'
		});
		expect(getByRole('button', { name: 'List options' })).not.toBeNull();
	});

	test('fires onclick when clicked', async () => {
		const onclick = vi.fn();
		const { getByDataTest } = render(MoreButton, {
			'data-test': 'more-btn',
			onclick
		});
		await fireEvent.click(getByDataTest('more-btn'));
		expect(onclick).toHaveBeenCalledTimes(1);
	});
});
