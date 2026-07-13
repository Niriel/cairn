import { fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

vi.mock('$lib/basic/components/Sheet.svelte');
vi.mock('$lib/basic/components/Icon.svelte');
vi.mock('$lib/shared/components/Avatar.svelte');
vi.mock('$lib/shared/components/ButtonPair.svelte');
vi.mock('$lib/shared/state/profile.svelte');
vi.mock('$lib/privacy/state/relationships.svelte');
vi.mock('$lib/invite/state/invitations.svelte');
vi.mock('$app/navigation', () => ({ goto: vi.fn(() => Promise.resolve()) }));
vi.mock('$app/paths', () => ({ resolve: vi.fn((path: string) => path) }));

import { goto } from '$app/navigation';
import { cancelInvitation } from '$lib/invite/state/invitations.svelte';
import {
	addCircleById,
	block,
	relationships,
	removeFromCircle,
	unblock
} from '$lib/privacy/state/relationships.svelte';
import { profile } from '$lib/shared/state/profile.svelte';
import { TOMBSTONE_UID } from '$lib/shared/model/constants';

import ProfileSheet from './ProfileSheet.svelte';

const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SELF_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const CIRCLE_ENTRY = {
	otherUserId: USER_ID,
	displayName: 'Bob',
	avatarVersion: 0,
	createdAt: '2026-05-01T10:00:00Z'
};

const BLOCKED_ENTRY = {
	otherUserId: USER_ID,
	displayName: 'Bob',
	avatarVersion: 0,
	createdAt: '2026-05-01T10:00:00Z'
};

function defaultProps(overrides: Record<string, unknown> = {}) {
	return {
		userId: USER_ID,
		displayName: 'Bob',
		username: 'bob',
		avatarVersion: 0,
		onclose: vi.fn(),
		...overrides
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	profile.uid = SELF_ID;
	relationships.circle = [];
	relationships.blocked = [];
	relationships.loaded = true;
});

afterEach(() => {
	vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// (a) Stranger state
// ---------------------------------------------------------------------------
describe('(a) Stranger state', () => {
	test('shows add-to-circle and block; hides remove-from-circle, unblock, cancel-invite; no badge', () => {
		const { queryByDataTest } = render(ProfileSheet, defaultProps());
		expect(queryByDataTest('add-to-circle')).not.toBeNull();
		expect(queryByDataTest('block')).not.toBeNull();
		expect(queryByDataTest('remove-from-circle')).toBeNull();
		expect(queryByDataTest('unblock')).toBeNull();
		expect(queryByDataTest('cancel-invite')).toBeNull();
		expect(queryByDataTest('state-badge')).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// (b) In-circle state
// ---------------------------------------------------------------------------
describe('(b) In-circle state', () => {
	test('shows remove-from-circle and block; hides add-to-circle; badge = IN YOUR CIRCLE', () => {
		relationships.circle = [CIRCLE_ENTRY];
		const { queryByDataTest, getByDataTest } = render(ProfileSheet, defaultProps());
		expect(queryByDataTest('remove-from-circle')).not.toBeNull();
		expect(queryByDataTest('block')).not.toBeNull();
		expect(queryByDataTest('add-to-circle')).toBeNull();
		expect(getByDataTest('state-badge').textContent).toBe('IN YOUR CIRCLE');
	});
});

// ---------------------------------------------------------------------------
// (c) Blocked state
// ---------------------------------------------------------------------------
describe('(c) Blocked state', () => {
	test('shows unblock only; hides add-to-circle, remove-from-circle, block; badge = BLOCKED', () => {
		relationships.blocked = [BLOCKED_ENTRY];
		const { queryByDataTest, getByDataTest } = render(ProfileSheet, defaultProps());
		expect(queryByDataTest('unblock')).not.toBeNull();
		expect(queryByDataTest('add-to-circle')).toBeNull();
		expect(queryByDataTest('remove-from-circle')).toBeNull();
		expect(queryByDataTest('block')).toBeNull();
		expect(getByDataTest('state-badge').textContent).toBe('BLOCKED');
	});
});

// ---------------------------------------------------------------------------
// (d) With pending invite
// ---------------------------------------------------------------------------
describe('(d) With pending invite', () => {
	test('shows cancel-invite alongside add-to-circle and block', () => {
		const { queryByDataTest } = render(
			ProfileSheet,
			defaultProps({ pendingInvitationId: 'inv-1' })
		);
		expect(queryByDataTest('add-to-circle')).not.toBeNull();
		expect(queryByDataTest('block')).not.toBeNull();
		expect(queryByDataTest('cancel-invite')).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// (e) Own avatar bounces to /settings
// ---------------------------------------------------------------------------
describe('(e) Own avatar', () => {
	test('calls goto(/settings) and onclose when userId === profile.uid', async () => {
		profile.uid = USER_ID;
		const onclose = vi.fn();
		render(ProfileSheet, defaultProps({ onclose }));
		await tick();
		expect(vi.mocked(goto)).toHaveBeenCalledWith('/settings');
		expect(onclose).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// (f) Add to circle
// ---------------------------------------------------------------------------
describe('(f) Add to circle', () => {
	test('click add-to-circle calls addCircleById with userId', async () => {
		const { getByDataTest } = render(ProfileSheet, defaultProps());
		await fireEvent.click(getByDataTest('add-to-circle'));
		expect(vi.mocked(addCircleById)).toHaveBeenCalledWith(USER_ID);
	});
});

// ---------------------------------------------------------------------------
// (g) Remove from circle
// ---------------------------------------------------------------------------
describe('(g) Remove from circle', () => {
	test('click remove-from-circle calls removeFromCircle with userId', async () => {
		relationships.circle = [CIRCLE_ENTRY];
		const { getByDataTest } = render(ProfileSheet, defaultProps());
		await fireEvent.click(getByDataTest('remove-from-circle'));
		expect(vi.mocked(removeFromCircle)).toHaveBeenCalledWith(USER_ID);
	});
});

// ---------------------------------------------------------------------------
// (h) Unblock
// ---------------------------------------------------------------------------
describe('(h) Unblock', () => {
	test('click unblock calls unblock with userId', async () => {
		relationships.blocked = [BLOCKED_ENTRY];
		const { getByDataTest } = render(ProfileSheet, defaultProps());
		await fireEvent.click(getByDataTest('unblock'));
		expect(vi.mocked(unblock)).toHaveBeenCalledWith(USER_ID);
	});
});

// ---------------------------------------------------------------------------
// (i) Block: confirm prompt + confirm action
// ---------------------------------------------------------------------------
describe('(i) Block confirmation', () => {
	test('click block shows confirm prompt; click block-confirm-block calls block with userId', async () => {
		const { getByDataTest, queryByDataTest } = render(ProfileSheet, defaultProps());
		expect(queryByDataTest('block-confirm')).toBeNull();
		await fireEvent.click(getByDataTest('block'));
		expect(queryByDataTest('block-confirm')).not.toBeNull();
		await fireEvent.click(getByDataTest('block-confirm-block'));
		expect(vi.mocked(block)).toHaveBeenCalledWith(USER_ID);
	});
});

// ---------------------------------------------------------------------------
// (j) Cancel invite
// ---------------------------------------------------------------------------
describe('(j) Cancel invite', () => {
	test('click cancel-invite calls cancelInvitation and onclose', async () => {
		const onclose = vi.fn();
		const { getByDataTest } = render(
			ProfileSheet,
			defaultProps({ pendingInvitationId: 'inv-1', onclose })
		);
		await fireEvent.click(getByDataTest('cancel-invite'));
		expect(vi.mocked(cancelInvitation)).toHaveBeenCalledWith('inv-1');
		expect(onclose).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// (l) Username handle
// ---------------------------------------------------------------------------
describe('(l) Username handle', () => {
	test('renders @username on .identity-handle beneath the display name', () => {
		const { getByDataTest } = render(ProfileSheet, defaultProps());
		const handle = getByDataTest('profile-handle');
		expect(handle.textContent).toBe('@bob');
		expect(handle.classList.contains('identity-handle')).toBe(true);
	});

	test('suppresses the handle for the tombstone uid', () => {
		const { queryByDataTest } = render(
			ProfileSheet,
			defaultProps({ userId: TOMBSTONE_UID, displayName: 'Deleted user', username: 'deleted' })
		);
		expect(queryByDataTest('profile-handle')).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// (k) Relationships not loaded: no action rows
// ---------------------------------------------------------------------------
describe('(k) Relationships not loaded', () => {
	test('hides all action rows when relationships.loaded = false', () => {
		relationships.loaded = false;
		const { queryByDataTest } = render(ProfileSheet, defaultProps());
		expect(queryByDataTest('add-to-circle')).toBeNull();
		expect(queryByDataTest('remove-from-circle')).toBeNull();
		expect(queryByDataTest('block')).toBeNull();
		expect(queryByDataTest('unblock')).toBeNull();
	});
});
