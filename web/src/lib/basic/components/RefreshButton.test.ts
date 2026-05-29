import { fireEvent } from '@testing-library/svelte';
import { describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

vi.mock('$lib/basic/components/Icon.svelte');

import RefreshButton from './RefreshButton.svelte';

describe('RefreshButton', () => {
	test('(a) renders a button with aria-label Refresh', () => {
		const { getByDataTest } = render(RefreshButton);
		expect(getByDataTest('refresh-btn').getAttribute('aria-label')).toBe('Refresh');
	});

	test('(b) calls onclick when clicked and not spinning', async () => {
		const onclick = vi.fn();
		const { getByDataTest } = render(RefreshButton, { onclick });
		await fireEvent.click(getByDataTest('refresh-btn'));
		expect(onclick).toHaveBeenCalledTimes(1);
	});

	test('(c) button is disabled when spinning is true', () => {
		const { getByDataTest } = render(RefreshButton, { spinning: true });
		expect(getByDataTest('refresh-btn')).toHaveProperty('disabled', true);
	});

	test('(d) button is not disabled when spinning is false', () => {
		const { getByDataTest } = render(RefreshButton, { spinning: false });
		expect(getByDataTest('refresh-btn')).toHaveProperty('disabled', false);
	});

	test('(e) does not call onclick when spinning', async () => {
		const onclick = vi.fn();
		const { getByDataTest } = render(RefreshButton, { spinning: true, onclick });
		await fireEvent.click(getByDataTest('refresh-btn'));
		expect(onclick).not.toHaveBeenCalled();
	});
});
