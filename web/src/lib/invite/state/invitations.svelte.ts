import { SvelteSet } from 'svelte/reactivity';
import { pgDelete, pgGet, pgPost } from '$lib/shared/http/postgrest';
import { profile } from '$lib/shared/state/profile.svelte';

export type SentEntry = {
	id: string;
	listId: string;
	targetUserId: string | null;
	createdAt: string;
};

export type InboxEntry = {
	id: string;
	listId: string;
	listName: string;
	inviterUid: string;
	inviterName: string;
	inviterAvatarVersion: number;
	createdAt: string;
};

type RawSentRow = {
	id: string;
	list_id: string;
	target_user_id: string | null;
	created_at: string;
};

type RawInboxRow = {
	id: string;
	list_id: string;
	created_by: string;
	created_at: string;
	lists: { name: string };
	profiles: { display_name: string; avatar_version: number };
};

export const invitations = $state<{
	sent: SentEntry[];
	inbox: InboxEntry[];
	inboxLoading: boolean;
	postAcceptPrompts: SvelteSet<{ inviterUid: string; inviterName: string }>;
}>({ sent: [], inbox: [], inboxLoading: false, postAcceptPrompts: new SvelteSet() });

export async function loadSent(): Promise<void> {
	const me = profile.uid;
	if (!me) return;
	const rows = await pgGet<RawSentRow[]>(`/invitations?created_by=eq.${me}`);
	invitations.sent = rows.map((r) => ({
		id: r.id,
		listId: r.list_id,
		targetUserId: r.target_user_id,
		createdAt: r.created_at
	}));
}

export function pendingInviteFor(listId: string, userId: string): string | null {
	return invitations.sent.find((e) => e.listId === listId && e.targetUserId === userId)?.id ?? null;
}

export async function cancelInvitation(id: string): Promise<void> {
	await pgDelete(`/invitations?id=eq.${id}`);
	invitations.sent = invitations.sent.filter((e) => e.id !== id);
}

export async function loadInbox(): Promise<void> {
	const me = profile.uid;
	if (!me) return;
	invitations.inboxLoading = true;
	try {
		const rows = await pgGet<RawInboxRow[]>(
			`/invitations?target_user_id=eq.${me}&select=id,list_id,created_by,created_at,lists(name),profiles!created_by(display_name,avatar_version)`
		);
		invitations.inbox = rows.map((r) => ({
			id: r.id,
			listId: r.list_id,
			listName: r.lists.name,
			inviterUid: r.created_by,
			inviterName: r.profiles.display_name,
			inviterAvatarVersion: r.profiles.avatar_version,
			createdAt: r.created_at
		}));
	} finally {
		invitations.inboxLoading = false;
	}
}

export async function acceptInvitation(
	id: string
): Promise<{ inviterUid: string; inviterName: string; listId: string }> {
	const entry = invitations.inbox.find((e) => e.id === id);
	if (!entry) throw new Error("Couldn't accept invite");
	try {
		await pgPost('/rpc/accept_invitation', { p_invitation_id: id });
	} catch (err) {
		throw new Error("Couldn't accept invite", { cause: err });
	}
	invitations.inbox = invitations.inbox.filter((e) => e.id !== id);
	invitations.postAcceptPrompts.add({
		inviterUid: entry.inviterUid,
		inviterName: entry.inviterName
	});
	return { inviterUid: entry.inviterUid, inviterName: entry.inviterName, listId: entry.listId };
}

export async function declineInvitation(id: string): Promise<void> {
	await pgPost('/rpc/decline_invitation', { p_invitation_id: id });
	invitations.inbox = invitations.inbox.filter((e) => e.id !== id);
}

export async function sendInvitation(
	listId: string,
	target: { userId: string } | { username: string }
): Promise<void> {
	const body =
		'userId' in target
			? { p_list_id: listId, p_user_id: target.userId }
			: { p_list_id: listId, p_username: target.username };
	let result: unknown;
	try {
		result = await pgPost<unknown>('/rpc/send_invitation', body);
	} catch (err) {
		if (err != null && typeof err === 'object' && (err as { code?: string }).code === 'P0001') {
			const msg = (err as Error).message;
			if (msg === 'self-invite') throw new Error("You can't invite yourself.", { cause: err });
			if (msg === 'already a member')
				throw new Error("They're already on this list.", { cause: err });
			// A username miss is public (usernames are not private), so it
			// surfaces distinctly rather than behind the generic string.
			if (msg === 'no such user') throw new Error('No such username', { cause: err });
		}
		throw new Error("Couldn't send invite", { cause: err });
	}
	if (result === null) throw new Error("Couldn't send invite");
}
