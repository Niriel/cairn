import { fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

vi.mock('$lib/basic/components/Icon.svelte');
vi.mock('$lib/basic/components/Sheet.svelte');
vi.mock('$lib/shared/components/Avatar.svelte');
vi.mock('$lib/shared/components/Snackbar.svelte');
vi.mock('$lib/invite/state/invitations.svelte');
vi.mock('$lib/privacy/state/relationships.svelte');
vi.mock('$lib/list/state/lists.svelte');
vi.mock('$lib/shared/state/profile.svelte');

import { sendInvitation } from '$lib/invite/state/invitations.svelte';
import { relationships } from '$lib/privacy/state/relationships.svelte';
import { lists } from '$lib/list/state/lists.svelte';
import { profile } from '$lib/shared/state/profile.svelte';

import InvitePickerSheet from './InvitePickerSheet.svelte';

const LIST_ID = '22222222-2222-2222-2222-222222222222';
const ME_UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOB_UID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const DAVE_UID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const BOB_CIRCLE = {
	otherUserId: BOB_UID,
	displayName: 'Bob',
	avatarVersion: 0,
	createdAt: '2026-05-01T10:00:00Z'
};

beforeEach(() => {
	vi.clearAllMocks();
	profile.uid = ME_UID;
	relationships.circle = [];
	relationships.blocked = [];
	relationships.loaded = true;
	lists.items = [];
	lists.loading = false;
	lists.error = null;
});

afterEach(() => {
	vi.clearAllMocks();
});

async function renderSheet(currentMemberIds: string[] = []) {
	const result = render(InvitePickerSheet, {
		listId: LIST_ID,
		currentMemberIds,
		onclose: vi.fn()
	});
	await tick();
	await tick();
	return result;
}

describe('InvitePickerSheet', () => {
	test('(a) circle section renders one row when relationships.circle has a non-member', async () => {
		relationships.circle = [BOB_CIRCLE];
		const { queryByDataTest } = await renderSheet();
		expect(queryByDataTest(`invite-picker-circle-row-${BOB_UID}`)).not.toBeNull();
	});

	test('(b) circle section omits a user who is already a member of the target list', async () => {
		relationships.circle = [BOB_CIRCLE];
		const { queryByDataTest } = await renderSheet([BOB_UID]);
		expect(queryByDataTest(`invite-picker-circle-row-${BOB_UID}`)).toBeNull();
	});

	test('(c) Invite button in circle section calls sendInvitation with { userId }', async () => {
		relationships.circle = [BOB_CIRCLE];
		const { getByDataTest } = await renderSheet();
		await fireEvent.click(getByDataTest(`invite-picker-invite-${BOB_UID}`));
		expect(sendInvitation).toHaveBeenCalledWith(LIST_ID, { userId: BOB_UID });
	});

	test('(c2) after a successful Invite click, the Invite button is replaced by a check-mark icon for that row', async () => {
		relationships.circle = [BOB_CIRCLE];
		vi.mocked(sendInvitation).mockResolvedValue();
		const { getByDataTest, queryByDataTest } = await renderSheet();
		await fireEvent.click(getByDataTest(`invite-picker-invite-${BOB_UID}`));
		await tick();
		await tick();
		expect(queryByDataTest(`invite-picker-invite-${BOB_UID}`)).toBeNull();
		expect(queryByDataTest(`invite-picker-invited-${BOB_UID}`)).not.toBeNull();
	});

	test('(d) co-members section excludes circle members', async () => {
		relationships.circle = [BOB_CIRCLE];
		lists.items = [
			{
				id: 'list-x',
				name: 'X',
				description: null,
				modified_at: '2026-05-01T00:00:00Z',
				item_count: 0,
				is_public: false,
				list_members: [
					{ user_id: BOB_UID, profiles: { display_name: 'Bob', avatar_version: 0 } },
					{ user_id: DAVE_UID, profiles: { display_name: 'Dave', avatar_version: 0 } }
				]
			}
		];
		const { queryByDataTest } = await renderSheet();
		// Bob shows up in circle section, not in co-members section
		expect(queryByDataTest(`invite-picker-circle-row-${BOB_UID}`)).not.toBeNull();
		expect(queryByDataTest(`invite-picker-comember-row-${BOB_UID}`)).toBeNull();
		// Dave shows up only in co-members
		expect(queryByDataTest(`invite-picker-comember-row-${DAVE_UID}`)).not.toBeNull();
	});

	test('(e) by-username Send button calls sendInvitation with { username }', async () => {
		vi.mocked(sendInvitation).mockResolvedValue();
		const { getByDataTest } = await renderSheet();
		const input = getByDataTest('invite-picker-username-input') as HTMLInputElement;
		await fireEvent.input(input, { target: { value: 'BobHandle' } });
		await fireEvent.click(getByDataTest('invite-picker-username-send'));
		expect(sendInvitation).toHaveBeenCalledWith(LIST_ID, { username: 'BobHandle' });
	});

	test('(e2) the username input is not an e-mail input', async () => {
		const { getByDataTest } = await renderSheet();
		const input = getByDataTest('invite-picker-username-input') as HTMLInputElement;
		expect(input.getAttribute('type')).not.toBe('email');
		expect(input.getAttribute('inputmode')).not.toBe('email');
		expect(input.getAttribute('autocomplete')).not.toBe('email');
	});

	test('(e3) a successful send shows "Invite sent"', async () => {
		vi.mocked(sendInvitation).mockResolvedValue();
		const { getByDataTest } = await renderSheet();
		await fireEvent.input(getByDataTest('invite-picker-username-input'), {
			target: { value: 'BobHandle' }
		});
		await fireEvent.click(getByDataTest('invite-picker-username-send'));
		await tick();
		await tick();
		expect(getByDataTest('invite-picker-toast').textContent).toContain('Invite sent');
	});

	test('(e4) a null-outcome send shows "Couldn\'t send invite"', async () => {
		vi.mocked(sendInvitation).mockRejectedValue(new Error("Couldn't send invite"));
		const { getByDataTest } = await renderSheet();
		await fireEvent.input(getByDataTest('invite-picker-username-input'), {
			target: { value: 'BobHandle' }
		});
		await fireEvent.click(getByDataTest('invite-picker-username-send'));
		await tick();
		await tick();
		expect(getByDataTest('invite-picker-toast').textContent).toContain("Couldn't send invite");
	});

	test('(e5) an unknown handle shows "No one on Cairn has that username"', async () => {
		vi.mocked(sendInvitation).mockRejectedValue(new Error('No one on Cairn has that username'));
		const { getByDataTest } = await renderSheet();
		await fireEvent.input(getByDataTest('invite-picker-username-input'), {
			target: { value: 'ghost' }
		});
		await fireEvent.click(getByDataTest('invite-picker-username-send'));
		await tick();
		await tick();
		expect(getByDataTest('invite-picker-toast').textContent).toContain(
			'No one on Cairn has that username'
		);
	});
});
