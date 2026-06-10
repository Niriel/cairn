import { ApiError, pgDelete, pgGet, pgPost } from '$lib/shared/http/postgrest';
import { profile } from '$lib/shared/state/profile.svelte';
import type { BlockedEntry, CircleEntry, RelationshipRow } from '$lib/privacy/model/relationship';

export type AddCircleResult =
	| { ok: true }
	| { ok: false; reason: 'no-such-user' | 'self' | 'unknown' };

function toCircleEntry(row: RelationshipRow): CircleEntry {
	return {
		otherUserId: row.other_user_id,
		displayName: row.profiles.display_name,
		avatarVersion: row.profiles.avatar_version,
		createdAt: row.created_at
	};
}

function toBlockedEntry(row: RelationshipRow): BlockedEntry {
	return {
		otherUserId: row.other_user_id,
		displayName: row.profiles.display_name,
		avatarVersion: row.profiles.avatar_version,
		createdAt: row.created_at
	};
}

export const relationships = $state<{
	circle: CircleEntry[];
	blocked: BlockedEntry[];
	loaded: boolean;
	loading: boolean;
}>({
	circle: [],
	blocked: [],
	loaded: false,
	loading: false
});

export async function loadRelationships(): Promise<void> {
	const me = profile.uid;
	if (!me) return;
	relationships.loading = true;
	try {
		const rows = await pgGet<RelationshipRow[]>(
			`/relationships?user_id=eq.${me}&select=other_user_id,status,created_at,profiles!other_user_id(display_name,avatar_version)`
		);
		relationships.circle = rows.filter((r) => r.status === 'circle').map(toCircleEntry);
		relationships.blocked = rows.filter((r) => r.status === 'blocked').map(toBlockedEntry);
		relationships.loaded = true;
	} finally {
		relationships.loading = false;
	}
}

export async function addCircleByEmail(email: string): Promise<AddCircleResult> {
	const me = profile.uid;
	if (!me) return { ok: false, reason: 'unknown' };
	try {
		await pgPost('/rpc/add_circle_by_email', { p_email: email });
		await loadRelationships();
		return { ok: true };
	} catch (err) {
		if (err instanceof ApiError && err.code === 'P0001') {
			if (err.message === 'no such user') return { ok: false, reason: 'no-such-user' };
			if (err.message === 'cannot add yourself') return { ok: false, reason: 'self' };
		}
		return { ok: false, reason: 'unknown' };
	}
}

export async function addCircleById(otherUserId: string): Promise<void> {
	const me = profile.uid;
	if (!me) return;
	// p_user_id is the parameter name in the DB function add_circle_by_id(p_user_id uuid)
	await pgPost('/rpc/add_circle_by_id', { p_user_id: otherUserId });
	await loadRelationships();
}

export async function removeFromCircle(otherUserId: string): Promise<void> {
	const me = profile.uid;
	if (!me) return;
	await pgDelete(`/relationships?user_id=eq.${me}&other_user_id=eq.${otherUserId}`);
	relationships.circle = relationships.circle.filter((e) => e.otherUserId !== otherUserId);
}

export async function block(otherUserId: string): Promise<void> {
	const me = profile.uid;
	if (!me) return;
	await pgPost(
		'/relationships',
		{ user_id: me, other_user_id: otherUserId, status: 'blocked' },
		{ headers: { Prefer: 'resolution=merge-duplicates' } }
	);
	await loadRelationships();
}

export async function unblock(otherUserId: string): Promise<void> {
	const me = profile.uid;
	if (!me) return;
	await pgDelete(`/relationships?user_id=eq.${me}&other_user_id=eq.${otherUserId}`);
	relationships.blocked = relationships.blocked.filter((e) => e.otherUserId !== otherUserId);
}
