import { describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

vi.mock('$lib/basic/components/Icon.svelte');
vi.mock('$lib/basic/components/Button.svelte');

import NoConnectionState from './NoConnectionState.svelte';

describe('NoConnectionState', () => {
	test('renders the "No connection" title and reconnect copy', () => {
		const { getByText } = render(NoConnectionState, {});
		expect(getByText('No connection')).toBeTruthy();
		expect(getByText(/reach the network/i)).toBeTruthy();
	});

	test('exposes a stable data-test hook', () => {
		const { queryByDataTest } = render(NoConnectionState, {});
		expect(queryByDataTest('no-connection')).not.toBeNull();
	});
});
