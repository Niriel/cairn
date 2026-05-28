import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('$lib/shared/http/postgrest');
vi.mock('$lib/shared/state/profile.svelte');

const TEST_UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const LIST_ID = '22222222-2222-2222-2222-222222222222';
const BOB_UID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CAROL_UID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const RAW_INBOX_ROW = {
	id: 'inv-inbox-1',
	list_id: LIST_ID,
	created_by: BOB_UID,
	created_at: '2026-05-10T10:00:00Z',
	lists: { name: "Bob's list" },
	profiles: { display_name: 'Bob', avatar_version: 2 }
};

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

describe('loadInbox', () => {
	test('(f) calls pgGet with correct URL and populates invitations.inbox', async () => {
		vi.mocked(pgMod.pgGet).mockResolvedValue([RAW_INBOX_ROW]);
		await invMod.loadInbox();
		expect(pgMod.pgGet).toHaveBeenCalledWith(
			`/invitations?target_user_id=eq.${TEST_UID}&select=id,list_id,created_by,created_at,lists(name),profiles!created_by(display_name,avatar_version)`
		);
		expect(invMod.invitations.inbox).toHaveLength(1);
		const entry = invMod.invitations.inbox[0];
		expect(entry.id).toBe('inv-inbox-1');
		expect(entry.listId).toBe(LIST_ID);
		expect(entry.listName).toBe("Bob's list");
		expect(entry.inviterUid).toBe(BOB_UID);
		expect(entry.inviterName).toBe('Bob');
		expect(entry.inviterAvatarVersion).toBe(2);
		expect(entry.createdAt).toBe('2026-05-10T10:00:00Z');
	});
});

describe('acceptInvitation', () => {
	const INBOX_ENTRY = {
		id: 'inv-inbox-1',
		listId: LIST_ID,
		listName: "Bob's list",
		inviterUid: BOB_UID,
		inviterName: 'Bob',
		inviterAvatarVersion: 2,
		createdAt: '2026-05-10T10:00:00Z'
	};

	test('(g) calls pgPost, removes entry from inbox, adds to postAcceptPrompts, returns identifiers', async () => {
		invMod.invitations.inbox = [INBOX_ENTRY];
		vi.mocked(pgMod.pgPost).mockResolvedValue(undefined);
		const result = await invMod.acceptInvitation('inv-inbox-1');
		expect(pgMod.pgPost).toHaveBeenCalledWith('/rpc/accept_invitation', {
			p_invitation_id: 'inv-inbox-1'
		});
		expect(invMod.invitations.inbox).toHaveLength(0);
		expect(invMod.invitations.postAcceptPrompts.size).toBe(1);
		const [prompt] = invMod.invitations.postAcceptPrompts;
		expect(prompt.inviterUid).toBe(BOB_UID);
		expect(prompt.inviterName).toBe('Bob');
		expect(result).toEqual({ inviterUid: BOB_UID, inviterName: 'Bob', listId: LIST_ID });
	});

	test('(g2) when RPC throws, rethrows "Couldn\'t accept invite" without modifying inbox or postAcceptPrompts', async () => {
		invMod.invitations.inbox = [INBOX_ENTRY];
		vi.mocked(pgMod.pgPost).mockRejectedValue(new Error('network error'));
		await expect(invMod.acceptInvitation('inv-inbox-1')).rejects.toThrow("Couldn't accept invite");
		expect(invMod.invitations.inbox).toHaveLength(1);
		expect(invMod.invitations.postAcceptPrompts.size).toBe(0);
	});
});

describe('declineInvitation', () => {
	test('(h) calls pgPost and removes entry from inbox', async () => {
		invMod.invitations.inbox = [
			{
				id: 'inv-inbox-1',
				listId: LIST_ID,
				listName: "Bob's list",
				inviterUid: BOB_UID,
				inviterName: 'Bob',
				inviterAvatarVersion: 2,
				createdAt: '2026-05-10T10:00:00Z'
			}
		];
		vi.mocked(pgMod.pgPost).mockResolvedValue(undefined);
		await invMod.declineInvitation('inv-inbox-1');
		expect(pgMod.pgPost).toHaveBeenCalledWith('/rpc/decline_invitation', {
			p_invitation_id: 'inv-inbox-1'
		});
		expect(invMod.invitations.inbox).toHaveLength(0);
	});
});

describe('sendInvitation', () => {
	test('(i1) with { userId } calls pgPost with p_user_id', async () => {
		vi.mocked(pgMod.pgPost).mockResolvedValue('some-id');
		await invMod.sendInvitation(LIST_ID, { userId: BOB_UID });
		expect(pgMod.pgPost).toHaveBeenCalledWith('/rpc/send_invitation', {
			p_list_id: LIST_ID,
			p_user_id: BOB_UID
		});
	});

	test('(i2) with { email } calls pgPost with p_email', async () => {
		vi.mocked(pgMod.pgPost).mockResolvedValue('some-id');
		await invMod.sendInvitation(LIST_ID, { email: 'bob@example.net' });
		expect(pgMod.pgPost).toHaveBeenCalledWith('/rpc/send_invitation', {
			p_list_id: LIST_ID,
			p_email: 'bob@example.net'
		});
	});

	test('(i3) null return rethrows "Couldn\'t send invite"', async () => {
		vi.mocked(pgMod.pgPost).mockResolvedValue(null);
		await expect(invMod.sendInvitation(LIST_ID, { userId: BOB_UID })).rejects.toThrow(
			"Couldn't send invite"
		);
	});

	test('(i4) ApiError P0001/self-invite maps to "You can\'t invite yourself."', async () => {
		const err = Object.assign(new Error('self-invite'), { code: 'P0001' });
		vi.mocked(pgMod.pgPost).mockRejectedValue(err);
		await expect(invMod.sendInvitation(LIST_ID, { userId: TEST_UID })).rejects.toThrow(
			"You can't invite yourself."
		);
	});

	test('(i5) ApiError P0001/already a member maps to "They\'re already on this list."', async () => {
		const err = Object.assign(new Error('already a member'), { code: 'P0001' });
		vi.mocked(pgMod.pgPost).mockRejectedValue(err);
		await expect(invMod.sendInvitation(LIST_ID, { userId: BOB_UID })).rejects.toThrow(
			"They're already on this list."
		);
	});

	test('(i6) other ApiError maps to "Couldn\'t send invite"', async () => {
		const err = Object.assign(new Error('some other error'), { code: '23505' });
		vi.mocked(pgMod.pgPost).mockRejectedValue(err);
		await expect(invMod.sendInvitation(LIST_ID, { userId: BOB_UID })).rejects.toThrow(
			"Couldn't send invite"
		);
	});
});
