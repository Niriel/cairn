import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('$lib/shared/http/postgrest');
vi.mock('$lib/shared/state/profile.svelte');

const TEST_UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const LIST_ID = '22222222-2222-2222-2222-222222222222';
const BOB_UID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CAROL_UID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const RAW_SENT_ROW = {
	id: 'inv-1',
	list_id: LIST_ID,
	target_user_id: BOB_UID,
	target_email: null,
	created_at: '2026-05-01T10:00:00Z'
};

let profileMod: typeof import('$lib/shared/state/profile.svelte');
let invMod: typeof import('./invitations.svelte');
let pgMod: typeof import('$lib/shared/http/postgrest');

beforeEach(async () => {
	vi.resetModules();
	profileMod = await import('$lib/shared/state/profile.svelte');
	profileMod.profile.uid = TEST_UID;
	pgMod = await import('$lib/shared/http/postgrest');
	invMod = await import('./invitations.svelte');
});

describe('pendingInviteFor', () => {
	test('(a) returns null when sent is empty', () => {
		expect(invMod.pendingInviteFor(LIST_ID, BOB_UID)).toBeNull();
	});

	test('(b) returns matching id when sent has an entry with given listId + targetUserId', () => {
		invMod.invitations.sent = [
			{
				id: 'inv-1',
				listId: LIST_ID,
				targetUserId: BOB_UID,
				targetEmail: null,
				createdAt: '2026-05-01T10:00:00Z'
			}
		];
		expect(invMod.pendingInviteFor(LIST_ID, BOB_UID)).toBe('inv-1');
	});

	test('(c) returns null when no entry matches the given pair', () => {
		invMod.invitations.sent = [
			{
				id: 'inv-1',
				listId: LIST_ID,
				targetUserId: CAROL_UID,
				targetEmail: null,
				createdAt: '2026-05-01T10:00:00Z'
			}
		];
		expect(invMod.pendingInviteFor(LIST_ID, BOB_UID)).toBeNull();
	});
});

describe('loadSent', () => {
	test('(d) calls pgGet with the correct URL and populates invitations.sent', async () => {
		vi.mocked(pgMod.pgGet).mockResolvedValue([RAW_SENT_ROW]);
		await invMod.loadSent();
		expect(pgMod.pgGet).toHaveBeenCalledWith(`/invitations?created_by=eq.${TEST_UID}`);
		expect(invMod.invitations.sent).toHaveLength(1);
		expect(invMod.invitations.sent[0].id).toBe('inv-1');
		expect(invMod.invitations.sent[0].listId).toBe(LIST_ID);
		expect(invMod.invitations.sent[0].targetUserId).toBe(BOB_UID);
		expect(invMod.invitations.sent[0].targetEmail).toBeNull();
		expect(invMod.invitations.sent[0].createdAt).toBe('2026-05-01T10:00:00Z');
	});
});

describe('cancelInvitation', () => {
	test('(e) calls pgDelete with correct URL and removes matching entry from sent', async () => {
		invMod.invitations.sent = [
			{
				id: 'inv-1',
				listId: LIST_ID,
				targetUserId: BOB_UID,
				targetEmail: null,
				createdAt: '2026-05-01T10:00:00Z'
			}
		];
		vi.mocked(pgMod.pgDelete).mockResolvedValue(undefined);
		await invMod.cancelInvitation('inv-1');
		expect(pgMod.pgDelete).toHaveBeenCalledWith('/invitations?id=eq.inv-1');
		expect(invMod.invitations.sent).toHaveLength(0);
	});
});
