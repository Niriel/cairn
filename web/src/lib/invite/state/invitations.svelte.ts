import { pgDelete, pgGet } from '$lib/shared/http/postgrest';
import { profile } from '$lib/shared/state/profile.svelte';

export type SentEntry = {
	id: string;
	listId: string;
	targetUserId: string | null;
	targetEmail: string | null;
	createdAt: string;
};

type RawSentRow = {
	id: string;
	list_id: string;
	target_user_id: string | null;
	target_email: string | null;
	created_at: string;
};

export const invitations = $state<{
	sent: SentEntry[];
}>({ sent: [] });

export async function loadSent(): Promise<void> {
	const me = profile.uid;
	if (!me) return;
	const rows = await pgGet<RawSentRow[]>(`/invitations?created_by=eq.${me}`);
	invitations.sent = rows.map((r) => ({
		id: r.id,
		listId: r.list_id,
		targetUserId: r.target_user_id,
		targetEmail: r.target_email,
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
