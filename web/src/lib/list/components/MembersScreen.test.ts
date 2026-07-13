import { fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

vi.mock('$lib/basic/components/Icon.svelte');
vi.mock('$lib/shared/components/Avatar.svelte');
vi.mock('$lib/shared/components/TopBar.svelte');
vi.mock('$lib/profile/components/ProfileSheet.svelte');
vi.mock('$lib/invite/components/InvitePickerSheet.svelte');
vi.mock('$lib/invite/state/invitations.svelte');
vi.mock('$lib/shared/state/profile.svelte');
vi.mock('$lib/shared/http/postgrest');

import * as pgMod from '$lib/shared/http/postgrest';
import { loadSent } from '$lib/invite/state/invitations.svelte';
import { profile } from '$lib/shared/state/profile.svelte';
import { TOMBSTONE_UID } from '$lib/shared/model/constants';

import MembersScreen from './MembersScreen.svelte';

const LIST_ID = '22222222-2222-2222-2222-222222222222';
const ALICE_UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOB_UID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CAROL_UID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function row(
	userId: string,
	displayName: string,
	createdAt: string,
	createdBy: string,
	username = displayName.toLowerCase()
) {
	return {
		user_id: userId,
		created_at: createdAt,
		lists: { created_by: createdBy, name: "Alice's list" },
		profiles: { display_name: displayName, avatar_version: 0, username }
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	profile.uid = ALICE_UID;
	vi.mocked(pgMod.pgGet).mockResolvedValue([]);
});

afterEach(() => {
	vi.clearAllMocks();
});

async function renderWith(rows: ReturnType<typeof row>[]) {
	vi.mocked(pgMod.pgGet).mockResolvedValue(rows);
	const result = render(MembersScreen, { listId: LIST_ID });
	await tick();
	await tick();
	return result;
}

describe('MembersScreen', () => {
	test('(a) section label shows member count ("N people on this list")', async () => {
		const { container } = await renderWith([
			row(ALICE_UID, 'Alice', '2026-05-01T10:00:00Z', ALICE_UID),
			row(BOB_UID, 'Bob', '2026-05-02T10:00:00Z', ALICE_UID),
			row(CAROL_UID, 'Carol', '2026-05-03T10:00:00Z', ALICE_UID)
		]);
		expect(container.textContent).toContain('3 people on this list');
	});

	test('(a2) section label shows "1 person on this list" (singular) when there is exactly 1 member', async () => {
		const { container } = await renderWith([
			row(ALICE_UID, 'Alice', '2026-05-01T10:00:00Z', ALICE_UID)
		]);
		expect(container.textContent).toContain('1 person on this list');
	});

	test('(b) creator\'s own row shows "You · created the list"', async () => {
		const { getByDataTest } = await renderWith([
			row(ALICE_UID, 'Alice', '2026-05-01T10:00:00Z', ALICE_UID)
		]);
		const r = getByDataTest(`member-row-${ALICE_UID}`);
		expect(r.textContent).toContain('You · created the list');
	});

	test('(b2) own row where the user is NOT the creator shows "Joined …"', async () => {
		// Alice is signed-in (profile.uid) but Bob created the list.
		const { getByDataTest } = await renderWith([
			row(ALICE_UID, 'Alice', '2026-05-01T10:00:00Z', BOB_UID),
			row(BOB_UID, 'Bob', '2026-04-01T10:00:00Z', BOB_UID)
		]);
		const r = getByDataTest(`member-row-${ALICE_UID}`);
		expect(r.textContent).toContain('Joined');
		expect(r.textContent).not.toContain('created the list');
	});

	test('(c) non-creator non-self row shows "Joined …"', async () => {
		const { getByDataTest } = await renderWith([
			row(ALICE_UID, 'Alice', '2026-05-01T10:00:00Z', ALICE_UID),
			row(BOB_UID, 'Bob', '2026-05-02T10:00:00Z', ALICE_UID)
		]);
		const r = getByDataTest(`member-row-${BOB_UID}`);
		expect(r.textContent).toContain('Joined');
		expect(r.textContent).not.toContain('Created the list');
	});

	test('(d) row with user_id === lists.created_by (non-self) shows "Created the list"', async () => {
		// Alice is signed-in; Bob created the list.
		const { getByDataTest } = await renderWith([
			row(BOB_UID, 'Bob', '2026-04-01T10:00:00Z', BOB_UID),
			row(ALICE_UID, 'Alice', '2026-05-01T10:00:00Z', BOB_UID)
		]);
		const r = getByDataTest(`member-row-${BOB_UID}`);
		expect(r.textContent).toContain('Created the list');
	});

	test('(e) tapping a non-self row opens ProfileSheet', async () => {
		const { getByDataTest, queryByDataTest } = await renderWith([
			row(ALICE_UID, 'Alice', '2026-05-01T10:00:00Z', ALICE_UID),
			row(BOB_UID, 'Bob', '2026-05-02T10:00:00Z', ALICE_UID)
		]);
		expect(queryByDataTest('profile-sheet-stub')).toBeNull();
		await fireEvent.click(getByDataTest(`member-row-${BOB_UID}`));
		await tick();
		expect(queryByDataTest('profile-sheet-stub')).not.toBeNull();
	});

	test('(f) "Add member" button opens InvitePickerSheet', async () => {
		const { getByDataTest, queryByDataTest } = await renderWith([
			row(ALICE_UID, 'Alice', '2026-05-01T10:00:00Z', ALICE_UID)
		]);
		expect(queryByDataTest('invite-picker-stub')).toBeNull();
		await fireEvent.click(getByDataTest('members-add'));
		await tick();
		expect(queryByDataTest('invite-picker-stub')).not.toBeNull();
	});

	test('(g) calls loadSent on mount', async () => {
		await renderWith([row(ALICE_UID, 'Alice', '2026-05-01T10:00:00Z', ALICE_UID)]);
		expect(loadSent).toHaveBeenCalled();
	});

	test('(h) refresh button re-fetches the member list', async () => {
		const { getByDataTest } = await renderWith([
			row(ALICE_UID, 'Alice', '2026-05-01T10:00:00Z', ALICE_UID)
		]);
		const callsBefore = vi.mocked(pgMod.pgGet).mock.calls.length;
		await fireEvent.click(getByDataTest('members-refresh'));
		await tick();
		expect(vi.mocked(pgMod.pgGet).mock.calls.length).toBe(callsBefore + 1);
	});

	test('(i) a member row renders the @username handle', async () => {
		const { getByDataTest } = await renderWith([
			row(ALICE_UID, 'Alice', '2026-05-01T10:00:00Z', ALICE_UID),
			row(BOB_UID, 'Bob', '2026-05-02T10:00:00Z', ALICE_UID)
		]);
		const r = getByDataTest(`member-row-${BOB_UID}`);
		expect(r.querySelector('.identity-handle')?.textContent).toBe('@bob');
	});

	test('(j) the members select embeds username', async () => {
		await renderWith([row(ALICE_UID, 'Alice', '2026-05-01T10:00:00Z', ALICE_UID)]);
		const url = vi.mocked(pgMod.pgGet).mock.calls[0][0];
		expect(url).toContain('profiles!user_id(display_name,avatar_version,username)');
	});

	test('(k) a tombstone member row suppresses the handle', async () => {
		const { getByDataTest } = await renderWith([
			row(ALICE_UID, 'Alice', '2026-05-01T10:00:00Z', ALICE_UID),
			row(TOMBSTONE_UID, 'Deleted user', '2026-05-02T10:00:00Z', ALICE_UID)
		]);
		const r = getByDataTest(`member-row-${TOMBSTONE_UID}`);
		expect(r.querySelector('.identity-handle')).toBeNull();
	});
});
