import { fireEvent } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { swUpdate } from '$lib/pwa/state/service-worker.svelte';
import { render } from '$lib/test/render';

import UpdateSnackbar from './UpdateSnackbar.svelte';

vi.mock('$lib/pwa/state/service-worker.svelte');

afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});

describe('UpdateSnackbar', () => {
	test('(a) renders the release copy and a "Refresh" action', () => {
		const { getByDataTest } = render(UpdateSnackbar);
		expect(getByDataTest('update-snackbar').textContent).toContain(
			'A new version is available — refresh'
		);
		expect(getByDataTest('update-snackbar-action').textContent).toContain('Refresh');
	});

	test('(b) clicking Refresh calls swUpdate.applyUpdate', async () => {
		const { getByDataTest } = render(UpdateSnackbar);
		await fireEvent.click(getByDataTest('update-snackbar-action'));
		expect(vi.mocked(swUpdate.applyUpdate)).toHaveBeenCalledTimes(1);
	});

	test('(c) is persistent (does not auto-dismiss) and exposes a dismiss control', () => {
		vi.useFakeTimers();
		const { getByDataTest, queryByDataTest } = render(UpdateSnackbar);
		vi.advanceTimersByTime(6000);
		expect(queryByDataTest('update-snackbar')).not.toBeNull();
		expect(getByDataTest('update-snackbar-dismiss')).not.toBeNull();
	});

	test('(d) clicking the dismiss control hides the prompt', async () => {
		const { getByDataTest, queryByDataTest } = render(UpdateSnackbar);
		await fireEvent.click(getByDataTest('update-snackbar-dismiss'));
		expect(queryByDataTest('update-snackbar')).toBeNull();
	});
});
