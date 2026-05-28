import { fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

vi.mock('$lib/basic/components/Icon.svelte');
vi.mock('$lib/shared/components/Avatar.svelte');
vi.mock('$lib/invite/state/invitations.svelte');
vi.mock('$app/navigation', () => ({ goto: vi.fn(() => Promise.resolve()) }));
vi.mock('$app/paths', () => ({ resolve: vi.fn((path: string) => path) }));

import { goto } from '$app/navigation';
import {
	acceptInvitation,
	declineInvitation,
	invitations,
	loadInbox
} from '$lib/invite/state/invitations.svelte';

import InvitesBanner from './InvitesBanner.svelte';

const LIST_ID = '22222222-2222-2222-2222-222222222222';
const BOB_UID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const INBOX_1 = {
	id: 'inv-1',
	listId: LIST_ID,
	listName: "Bob's list",
	inviterUid: BOB_UID,
	inviterName: 'Bob',
	inviterAvatarVersion: 0,
	createdAt: '2026-05-10T10:00:00Z'
};

const INBOX_2 = {
	id: 'inv-2',
	listId: '33333333-3333-3333-3333-333333333333',
	listName: 'Carol list',
	inviterUid: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
	inviterName: 'Carol',
	inviterAvatarVersion: 0,
	createdAt: '2026-05-11T10:00:00Z'
};

beforeEach(() => {
	vi.clearAllMocks();
	invitations.inbox = [];
});

afterEach(() => {
	vi.clearAllMocks();
});

describe('InvitesBanner', () => {
	test('(a) renders nothing when inbox is empty', () => {
		invitations.inbox = [];
		const { queryByDataTest } = render(InvitesBanner);
		expect(queryByDataTest('invites-banner')).toBeNull();
	});

	test('(b) renders single-invite card with inviter name and list name when inbox has 1 entry', () => {
		invitations.inbox = [INBOX_1];
		const { getByDataTest } = render(InvitesBanner);
		const banner = getByDataTest('invites-banner');
		expect(banner.textContent).toContain('Bob');
		expect(banner.textContent).toContain("Bob's list");
		expect(queryByDataTest('invites-banner-decline')).not.toBeNull();
		expect(queryByDataTest('invites-banner-accept')).not.toBeNull();

		function queryByDataTest(name: string) {
			return banner.querySelector(`[data-test="${name}"]`);
		}
	});

	test('(c) Decline button calls declineInvitation', async () => {
		invitations.inbox = [INBOX_1];
		const { getByDataTest } = render(InvitesBanner);
		await fireEvent.click(getByDataTest('invites-banner-decline'));
		expect(declineInvitation).toHaveBeenCalledWith('inv-1');
	});

	test('(d) Accept button calls acceptInvitation and then goto', async () => {
		invitations.inbox = [INBOX_1];
		vi.mocked(acceptInvitation).mockResolvedValue({
			inviterUid: BOB_UID,
			inviterName: 'Bob',
			listId: LIST_ID
		});
		const { getByDataTest } = render(InvitesBanner);
		await fireEvent.click(getByDataTest('invites-banner-accept'));
		await tick();
		expect(acceptInvitation).toHaveBeenCalledWith('inv-1');
		expect(goto).toHaveBeenCalledWith(`/lists/${LIST_ID}`);
	});

	test('(d2) when acceptInvitation rejects, does not call goto', async () => {
		invitations.inbox = [INBOX_1];
		vi.mocked(acceptInvitation).mockRejectedValue(new Error("Couldn't accept invite"));
		const { getByDataTest } = render(InvitesBanner);
		await fireEvent.click(getByDataTest('invites-banner-accept'));
		await tick();
		expect(goto).not.toHaveBeenCalled();
	});

	test('(e) multi-invite collapsed row renders when inbox has 2+ entries with correct count', () => {
		invitations.inbox = [INBOX_1, INBOX_2];
		const { getByDataTest } = render(InvitesBanner);
		const multiRow = getByDataTest('invites-banner-multi');
		expect(multiRow.textContent).toContain('2');
		expect(multiRow.textContent).toContain('pending invites');
	});

	test('(f) multi-invite row navigates to /settings/invites on click', async () => {
		invitations.inbox = [INBOX_1, INBOX_2];
		const { getByDataTest } = render(InvitesBanner);
		await fireEvent.click(getByDataTest('invites-banner-multi'));
		expect(goto).toHaveBeenCalledWith('/settings/invites');
	});

	test('(g) loadInbox is called on mount', () => {
		render(InvitesBanner);
		expect(loadInbox).toHaveBeenCalledTimes(1);
	});
});
