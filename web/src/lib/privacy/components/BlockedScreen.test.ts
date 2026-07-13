import { fireEvent } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';
import type { BlockedEntry } from '$lib/privacy/model/relationship';

import BlockedScreen from './BlockedScreen.svelte';

vi.mock('$lib/privacy/state/relationships.svelte');
vi.mock('$lib/shared/components/Avatar.svelte');
vi.mock('$lib/shared/components/TopBar.svelte');
vi.mock('$lib/shared/state/profile.svelte');

const { relationships, unblock } = await import('$lib/privacy/state/relationships.svelte');

const CAROL: BlockedEntry = {
	otherUserId: 'carol-uid',
	displayName: 'Carol',
	username: 'carol',
	avatarVersion: 0,
	createdAt: '2026-03-01T10:00:00Z'
};

afterEach(() => {
	vi.clearAllMocks();
	relationships.loaded = false;
	relationships.blocked = [];
	relationships.circle = [];
});

describe('BlockedScreen', () => {
	test('(a) empty state renders when loaded and blocked is empty', () => {
		relationships.loaded = true;
		const { queryByDataTest } = render(BlockedScreen);
		expect(queryByDataTest('blocked-empty')).not.toBeNull();
	});

	test('(a.i) loading gate: empty state absent when not loaded', () => {
		relationships.loaded = false;
		const { queryByDataTest } = render(BlockedScreen);
		expect(queryByDataTest('blocked-empty')).toBeNull();
	});

	test('(b) blocked row renders when loaded and blocked has an entry', () => {
		relationships.loaded = true;
		relationships.blocked = [CAROL];
		const { queryByDataTest } = render(BlockedScreen);
		expect(queryByDataTest(`blocked-row-${CAROL.otherUserId}`)).not.toBeNull();
		expect(queryByDataTest('blocked-empty')).toBeNull();
	});

	test('(c) Unblock button calls unblock with the correct id', async () => {
		relationships.loaded = true;
		relationships.blocked = [CAROL];
		const { getByDataTest } = render(BlockedScreen);
		await fireEvent.click(getByDataTest(`unblock-${CAROL.otherUserId}`));
		expect(vi.mocked(unblock)).toHaveBeenCalledWith(CAROL.otherUserId);
	});

	test('(d) no add input is rendered', () => {
		relationships.loaded = true;
		const { container } = render(BlockedScreen);
		expect(container.querySelector('input')).toBeNull();
	});
});
