import { fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

vi.mock('$lib/basic/components/Icon.svelte');
vi.mock('$lib/shared/components/Avatar.svelte');
vi.mock('$lib/shared/components/TopBar.svelte');
vi.mock('$lib/basic/components/RefreshButton.svelte');
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

import InvitesInboxScreen from './InvitesInboxScreen.svelte';

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

beforeEach(() => {
	vi.clearAllMocks();
	invitations.inbox = [INBOX_1];
	invitations.inboxLoading = false;
});

afterEach(() => {
	vi.clearAllMocks();
});

describe('InvitesInboxScreen', () => {
	test('(a0) shows empty state when inbox is empty', () => {
		invitations.inbox = [];
		const { getByDataTest, queryByDataTest } = render(InvitesInboxScreen);
		expect(getByDataTest('inbox-empty')).not.toBeNull();
		expect(queryByDataTest('inbox-row-inv-1')).toBeNull();
	});

	test('(a-load) shows loading indicator when inboxLoading is true', () => {
		invitations.inboxLoading = true;
		invitations.inbox = [];
		const { getByDataTest, queryByDataTest } = render(InvitesInboxScreen);
		expect(getByDataTest('inbox-loading')).not.toBeNull();
		expect(queryByDataTest('inbox-empty')).toBeNull();
	});

	test('(a-load2) refresh button is disabled when inboxLoading is true', () => {
		invitations.inboxLoading = true;
		const { getByDataTest } = render(InvitesInboxScreen);
		expect(getByDataTest('inbox-refresh')).toHaveProperty('disabled', true);
	});

	test('(a) intro paragraph text present', () => {
		const { container } = render(InvitesInboxScreen);
		expect(container.textContent).toContain("People who've invited you to their lists");
	});

	test('(b) row renders inviter name and list name', () => {
		const { getByDataTest } = render(InvitesInboxScreen);
		const row = getByDataTest('inbox-row-inv-1');
		expect(row.textContent).toContain('Bob');
		expect(row.textContent).toContain("Bob's list");
	});

	test('(c) Decline button calls declineInvitation', async () => {
		const { getByDataTest } = render(InvitesInboxScreen);
		await fireEvent.click(getByDataTest('inbox-decline-inv-1'));
		expect(declineInvitation).toHaveBeenCalledWith('inv-1');
	});

	test('(d) Accept button calls acceptInvitation and then goto', async () => {
		vi.mocked(acceptInvitation).mockResolvedValue({
			inviterUid: BOB_UID,
			inviterName: 'Bob',
			listId: LIST_ID
		});
		const { getByDataTest } = render(InvitesInboxScreen);
		await fireEvent.click(getByDataTest('inbox-accept-inv-1'));
		await tick();
		expect(acceptInvitation).toHaveBeenCalledWith('inv-1');
		expect(goto).toHaveBeenCalledWith(`/lists/${LIST_ID}`);
	});

	test('(d2) when acceptInvitation rejects, does not call goto', async () => {
		vi.mocked(acceptInvitation).mockRejectedValue(new Error("Couldn't accept invite"));
		const { getByDataTest } = render(InvitesInboxScreen);
		await fireEvent.click(getByDataTest('inbox-accept-inv-1'));
		await tick();
		expect(goto).not.toHaveBeenCalled();
	});

	test('(g) loadInbox is called on mount', () => {
		render(InvitesInboxScreen);
		expect(loadInbox).toHaveBeenCalledTimes(1);
	});

	test('(h) Refresh button calls loadInbox again', async () => {
		const { getByDataTest } = render(InvitesInboxScreen);
		await fireEvent.click(getByDataTest('inbox-refresh'));
		expect(loadInbox).toHaveBeenCalledTimes(2);
	});
});
